//! The shell itself: the window, the tray, the global shortcut, deep links and
//! notifications.
//!
//! Everything the shell does is driven from here, in Rust. No Tauri command is
//! exposed to web content — not even to the app it wraps — so the page in the
//! window cannot reach the tray, the filesystem, the opener or the updater. The
//! shell watches the app; the app does not drive the shell.

use std::error::Error;
use std::sync::Arc;

use tauri::menu::MenuBuilder;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

use crate::config::{self, resolve_app_url};
use crate::deeplink;
use crate::urls;

/// The user agent the window sends.
///
/// The web app labels a session `desktop` when the user agent says `Tauri`
/// (`clientTypeFor` in `apps/web/src/server/auth/user-agent.ts`), so this token is
/// not decoration: it is how "sign out this device" tells a desktop from a
/// browser. The Chrome token keeps the app's own sniffing (and any site that
/// checks) seeing a normal Chromium browser, which is what the window is.
pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Tauri/2 PrepoDesktop/0.1.0";

/// Pressed anywhere on the system, this opens the recorder.
pub const RECORDING_SHORTCUT: &str = "CommandOrControl+Shift+R";

const WINDOW: &str = "main";
const TRAY: &str = "prepo-tray";

pub struct Shell {
    app_url: Url,
}

impl Shell {
    pub fn app_url(&self) -> &Url {
        &self.app_url
    }

    /// The scheme, host and port of the app — the part a path hangs off.
    pub fn origin(&self) -> String {
        self.app_url.origin().ascii_serialization()
    }
}

pub fn run() {
    let configured = std::env::var(config::APP_URL_ENV).ok();
    let app_url = match resolve_app_url(configured.as_deref()) {
        Ok(url) => url,
        Err(err) => {
            eprintln!(
                "prepo desktop: {} was not usable: {err}",
                config::APP_URL_ENV
            );
            std::process::exit(2);
        }
    };
    let shell = Arc::new(Shell { app_url });

    let app = tauri::Builder::default()
        // single-instance decides whether this process is the one that gets a
        // window, so it is registered first: a second launch focuses the window
        // that is already open instead of opening another.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            build_window(app, &shell)?;
            build_tray(app, &shell)?;
            register_shortcut(app, &shell)?;
            register_scheme(app.handle());
            listen_for_deep_links(app.handle(), &shell);
            Ok(())
        });

    if let Err(err) = app.run(tauri::generate_context!()) {
        eprintln!("prepo desktop: {err}");
    }
}

fn build_window(app: &mut tauri::App, shell: &Arc<Shell>) -> Result<(), Box<dyn Error>> {
    let opener = app.handle().clone();
    let navigating = shell.clone();
    let navigation = move |url: &Url| -> bool {
        if is_the_shells_own_page(url) {
            return true;
        }
        if url.origin() == navigating.app_url().origin() {
            return true;
        }
        // Anywhere else — a document, a repository, a mail client — belongs to the
        // system's browser, not to a window that carries the app's session.
        if let Err(err) = opener.opener().open_url(url.as_str(), None::<&str>) {
            eprintln!("prepo desktop: could not hand {url} to the browser: {err}");
        }
        false
    };

    // The shell's own page reads this and nothing else from the shell. It is set
    // before any page script runs, so `offline.js` never has to guess.
    let bootstrap = format!(
        "window.PREPO_DESKTOP = {};",
        serde_json::json!({
            "appUrl": shell.app_url().as_str(),
            "version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
        })
    );

    WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()))
        .title("Prepo")
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 640.0)
        .center()
        .user_agent(USER_AGENT)
        .initialization_script(bootstrap)
        .on_navigation(navigation)
        .build()?;

    Ok(())
}

fn build_tray(app: &mut tauri::App, shell: &Arc<Shell>) -> Result<(), Box<dyn Error>> {
    let menu = MenuBuilder::new(app)
        .text(urls::MENU_NEW_RECORDING, "New recording")
        .text(urls::MENU_REVIEW, "Review queue")
        .text(urls::MENU_BOARD, "Board")
        .separator()
        .text(urls::MENU_NOTIFICATION, "Send a test notification")
        .text(urls::MENU_UPDATE, "Check for updates")
        .separator()
        .text(urls::MENU_QUIT, "Quit Prepo")
        .build()?;

    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("Prepo")
        .menu(&menu)
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    let handling = shell.clone();
    tray.on_menu_event(move |app, event| on_menu(app, &handling, event.id().as_ref()))
        .build(app)?;

    Ok(())
}

fn on_menu(app: &AppHandle, shell: &Shell, id: &str) {
    match id {
        urls::MENU_QUIT => app.exit(0),
        urls::MENU_NOTIFICATION => notify(
            app,
            "Prepo",
            "Native notifications reach this window. Ticket chases will land here.",
        ),
        urls::MENU_UPDATE => check_for_updates(app),
        _ => {
            let path = urls::menu_path(id, current_workspace(app, shell).as_deref());
            open_path(app, shell, &path);
        }
    }
}

fn register_shortcut(app: &tauri::App, shell: &Arc<Shell>) -> Result<(), Box<dyn Error>> {
    let handling = shell.clone();
    app.global_shortcut()
        .on_shortcut(RECORDING_SHORTCUT, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let path = urls::menu_path(
                urls::MENU_NEW_RECORDING,
                current_workspace(app, &handling).as_deref(),
            );
            open_path(app, &handling, &path);
        })?;

    Ok(())
}

fn register_scheme(app: &AppHandle) {
    // An installed build registers prepo:// through its installer. A development
    // build has no installer, so the scheme is registered for this session only,
    // and only in development.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    if cfg!(debug_assertions) {
        if let Err(err) = app.deep_link().register_all() {
            eprintln!("prepo desktop: could not register prepo:// for this session: {err}");
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let _ = app;
}

fn listen_for_deep_links(app: &AppHandle, shell: &Arc<Shell>) {
    let handle = app.clone();
    let handling = shell.clone();
    let _ = app.deep_link().on_open_url(move |event| {
        let origin = handling.origin();
        for url in event.urls() {
            match deeplink::parse(url.as_str()) {
                Ok(target) => match Url::parse(&deeplink::resolve(&origin, &target)) {
                    Ok(address) => open_url(&handle, address),
                    Err(err) => eprintln!("prepo desktop: {url} resolved to a bad address: {err}"),
                },
                Err(err) => eprintln!("prepo desktop: ignored {url}: {err}"),
            }
        }
    });
}

/// Where the window is, for tray items that are about "here".
///
/// The shell asks the window, rather than tracking it, because the app routes
/// inside itself: most of the time a workspace change is not a page load, and a
/// shell that only watched for loads would keep answering with a stale room.
fn current_workspace(app: &AppHandle, shell: &Shell) -> Option<String> {
    let window = app.get_webview_window(WINDOW)?;
    let url = window.url().ok()?;
    urls::workspace_from_url(&url, shell.app_url())
}

fn open_path(app: &AppHandle, shell: &Shell, path: &str) {
    match shell.app_url().join(path) {
        Ok(url) => open_url(app, url),
        Err(err) => eprintln!("prepo desktop: could not build the address for {path}: {err}"),
    }
}

fn open_url(app: &AppHandle, url: Url) {
    match app.get_webview_window(WINDOW) {
        Some(window) => {
            let _ = window.navigate(url);
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        None => eprintln!("prepo desktop: no window to open that in"),
    }
}

fn focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(err) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("prepo desktop: the system refused a notification: {err}");
    }
}

/// Asks the configured update channel, and reports what it said.
///
/// There is no signing key and no release yet, so on a build like this one the
/// honest answer is that it cannot update itself — which is what it says, rather
/// than pretending to be current.
fn check_for_updates(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let message = match handle.updater() {
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => format!(
                    "Prepo {} is available; this build is {}. This shell does not install updates yet.",
                    update.version, update.current_version
                ),
                Ok(None) => "This is the newest build this shell can see.".to_string(),
                Err(err) => format!("The update check failed: {err}"),
            },
            Err(err) => format!(
                "This build has no update endpoint or signing key, so it cannot update itself. ({err})"
            ),
        };
        notify(&handle, "Prepo updates", &message);
    });
}

fn is_the_shells_own_page(url: &Url) -> bool {
    matches!(url.scheme(), "tauri" | "about") || url.host_str() == Some("tauri.localhost")
}
