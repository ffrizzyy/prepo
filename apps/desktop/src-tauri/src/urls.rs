//! Reading a workspace out of the window's address, and building the addresses
//! the tray and the global shortcut open.
//!
//! The shell reads the window's *current* URL when someone clicks, which is the
//! only way to know which workspace is on screen: the app routes inside itself
//! without loading a document, so the shell cannot watch for it.

use tauri::Url;

/// Menu item ids, in one place so the menu and its handler cannot drift apart.
pub const MENU_NEW_RECORDING: &str = "new-recording";
pub const MENU_REVIEW: &str = "review-queue";
pub const MENU_BOARD: &str = "open-board";
pub const MENU_NOTIFICATION: &str = "test-notification";
pub const MENU_UPDATE: &str = "check-for-updates";
pub const MENU_QUIT: &str = "quit";

/// First path segments that are routes rather than workspaces. `/northwind` is a
/// workspace; `/download` and `/sign-in` are the marketing and auth pages.
pub const RESERVED_FIRST_SEGMENTS: &[&str] = &[
    "api",
    "demo",
    "download",
    "new",
    "privacy",
    "security",
    "sign-in",
    "sign-up",
    "terms",
];

/// Whether a string could be a workspace slug, judged the same way the app's own
/// routes are: lowercase, digits and dashes, starting with a letter or digit.
pub fn is_workspace_slug(candidate: &str) -> bool {
    if candidate.is_empty() || candidate.len() > 32 {
        return false;
    }
    let mut chars = candidate.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// The workspace the window is showing, if it is showing one.
pub fn workspace_from_url(current: &Url, app_url: &Url) -> Option<String> {
    if current.origin() != app_url.origin() {
        return None;
    }
    let first = current
        .path_segments()?
        .find(|segment| !segment.is_empty())?;
    let slug = first.to_ascii_lowercase();
    if RESERVED_FIRST_SEGMENTS.contains(&slug.as_str()) {
        return None;
    }
    is_workspace_slug(&slug).then_some(slug)
}

/// The path a tray item or the global shortcut opens.
///
/// Without a known workspace there is nothing honest to open but the front door,
/// where the app can ask which workspace to use.
pub fn menu_path(id: &str, workspace: Option<&str>) -> String {
    match (id, workspace) {
        (MENU_NEW_RECORDING, Some(workspace)) => format!("/{workspace}/meetings/new"),
        (MENU_BOARD, Some(workspace)) => format!("/{workspace}/board"),
        (MENU_REVIEW, Some(workspace)) => format!("/{workspace}"),
        _ => "/".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn reads_a_workspace_from_a_real_address() {
        let app = url("http://localhost:3000");
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/northwind"), &app),
            Some("northwind".into())
        );
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/northwind/board"), &app),
            Some("northwind".into())
        );
        assert_eq!(
            workspace_from_url(
                &url("http://localhost:3000/northwind/tickets/PRE-142?tab=activity"),
                &app
            ),
            Some("northwind".into())
        );
    }

    #[test]
    fn a_route_is_not_a_workspace() {
        let app = url("http://localhost:3000");
        assert_eq!(workspace_from_url(&url("http://localhost:3000"), &app), None);
        assert_eq!(workspace_from_url(&url("http://localhost:3000/"), &app), None);
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/download"), &app),
            None
        );
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/sign-in"), &app),
            None
        );
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/demo"), &app),
            None
        );
        // a two-letter slug is still a slug; only the reserved list is special
        assert_eq!(
            workspace_from_url(&url("http://localhost:3000/nw"), &app),
            Some("nw".into())
        );
    }

    #[test]
    fn another_origin_is_not_this_app() {
        let app = url("http://localhost:3000");
        assert_eq!(
            workspace_from_url(&url("https://github.com/northwind"), &app),
            None
        );
        assert_eq!(
            workspace_from_url(&url("http://localhost:4000/northwind"), &app),
            None
        );
    }

    #[test]
    fn a_slug_is_lowercase_letters_digits_and_dashes() {
        assert!(is_workspace_slug("northwind"));
        assert!(is_workspace_slug("northwind-2"));
        assert!(is_workspace_slug("2northwind"));
        assert!(!is_workspace_slug(""));
        assert!(!is_workspace_slug("Northwind"));
        assert!(!is_workspace_slug("-northwind"));
        assert!(!is_workspace_slug("north wind"));
        assert!(!is_workspace_slug("northwind/../admin"));
        assert!(!is_workspace_slug(&"a".repeat(33)));
    }

    #[test]
    fn menu_items_open_the_apps_own_routes() {
        assert_eq!(
            menu_path(MENU_NEW_RECORDING, Some("northwind")),
            "/northwind/meetings/new"
        );
        assert_eq!(menu_path(MENU_BOARD, Some("northwind")), "/northwind/board");
        assert_eq!(menu_path(MENU_REVIEW, Some("northwind")), "/northwind");
    }

    #[test]
    fn without_a_workspace_the_front_door_is_the_only_honest_answer() {
        assert_eq!(menu_path(MENU_BOARD, None), "/");
        assert_eq!(menu_path(MENU_NEW_RECORDING, None), "/");
        assert_eq!(menu_path("anything-else", Some("northwind")), "/");
    }
}
