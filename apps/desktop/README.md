# Prepo desktop shell

A [Tauri 2](https://v2.tauri.app) window around the Prepo web app, plus the four
things a browser cannot do on its own: a tray, a global shortcut, `prepo://`
links, and native notifications.

The shell holds **no product logic and no data**. It opens the app, and it has
only the reach the OS gave it — there is no bridge from the page in the window
back into the shell, so nothing the app renders can drive the tray, the
filesystem, the opener or the updater. Everything here is wired in Rust, in
`src-tauri/src/shell.rs`.

## What is built, and what is not

| Piece | State |
|---|---|
| Native window around the web app | Built. Starts at the shell's own page, which probes the app and hands the window over. |
| Offline screen | Built. If the app does not answer, the window says which address it tried and offers **Try again**. |
| System tray + menu | Built (New recording, Review queue, Board, Send a test notification, Check for updates, Quit). |
| Global shortcut | Built: `Ctrl/⌘ + Shift + R` opens the recorder. |
| Deep links | Built: `prepo://<workspace>`, `prepo://<workspace>/ticket/<KEY>`, `prepo://<workspace>/meeting/<id>`. Registration in a *development* run is per session; an installed build registers the scheme through its installer. |
| Native notifications | Built, from the shell (test item, update result). The app itself does not raise them yet. |
| Single instance | Built. A second launch focuses the window that is already open. |
| Window state | Built (position, size and maximised state are remembered). |
| External links | Built. A link to another origin opens in the system's browser instead of inside a window that carries the session. |
| Auto-update | **Not usable yet.** The plugin is wired but no endpoint and no signing key are configured; *Check for updates* says exactly that. |
| Installers | **None published.** There is no release, no signing key and no CI run of the desktop build. `pnpm build` produces a local installer. |
| The shell telling the app things | **Not built.** No Tauri command and no capability is exposed to web content, so the app cannot ask the shell to notify or to start a recording on its own. |

## Running it

The shell needs something to point at. With no deployment yet, that is the local
dev server:

```sh
pnpm dev                          # in one terminal, from the repository root
pnpm --filter @prepo/desktop dev  # in another
```

`PREPO_DESKTOP_URL` points the shell somewhere else (http/https only; anything
else is refused at startup with a message, not opened):

```sh
PREPO_DESKTOP_URL=https://prepo.example pnpm --filter @prepo/desktop dev
```

Whatever origin you choose also has to be in the CSP's `connect-src` in
`src-tauri/tauri.conf.json`, because the shell's own page probes it before
navigating. `verify` fails when the two disagree, in either direction.

## Checking it

```sh
pnpm --filter @prepo/desktop verify   # configuration and posture, no build needed
pnpm --filter @prepo/desktop test     # the pure logic: URL config, prepo:// parsing, workspace detection
pnpm --filter @prepo/desktop check    # compiles the Rust
```

`verify` is the honest half of the story and `test` is the checked half:
together they prove the shell's rules — what it refuses, what it opens, what it
exposes — without a screen. Neither proves that the window looks right or that a
tray click does what the menu promises; that needs a person and a desktop.

## Where things live

```
ui/                     the shell's own page (offline screen) and its styles
scripts/verify.mjs      the checks above
src-tauri/tauri.conf.json   identifier, CSP, bundle, deep-link scheme, updater
src-tauri/src/config.rs     where the window points, and what it refuses
src-tauri/src/deeplink.rs   the prepo:// grammar, and where each link lands
src-tauri/src/urls.rs       which workspace the window is showing
src-tauri/src/shell.rs      the window, tray, shortcut, links, notifications
src-tauri/icons/            the app icon, generated from one source mark
```

## Not a marketing surface

Nothing in this directory claims an installer, a download page or an update
channel that exists. When a release does exist, this file and the `/download`
page in the web app both change in the same commit.
