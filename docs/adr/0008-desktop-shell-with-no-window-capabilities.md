# ADR 0008: The desktop shell gets no window capabilities

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

Tauri 2 ships a permission system: a window can call a plugin command only if a
capability grants it. The tempting setup is to enable the opener, filesystem,
notification and updater plugins for the main window so the page can use them
directly. The page is web content, and the shell loads the app's own origin plus
whatever a link navigates to; granting the window those commands makes any
script that runs in that window able to open files or trigger an update.

## Decision

The shell holds the native integrations; the page holds none.

- `apps/desktop/src-tauri/tauri.conf.json` sets `withGlobalTauri: false`, no
  window capabilities directory exists, and the Rust side (`shell.rs`) states the
  consequence: the window cannot reach the tray, the filesystem, the opener or
  the updater.
- Tray, global shortcut, single instance, native notifications and `prepo://`
  handling are implemented in Rust and invoked by the OS, not by page
  JavaScript.
- `prepo://` is parsed as a grammar with the workspace as the authority, not a
  path segment: `prepo://northwind/ticket/PRE-142`. The workspace slug selects
  the tenant, and the app still checks membership before showing anything.
- A navigation whose origin is not the app's configured origin is handed to the
  system browser, so a link cannot replace the window with a page that inherits
  the shell's session.
- The shell's CSP is set in `tauri.conf.json` (`default-src 'self'`, no inline
  script), separate from the web app's headers.
- The updater plugin is registered with an empty public key and no endpoint. An
  update check therefore reports that it cannot run; it does not silently
  download.

## Consequences

- The shell is a native window with OS integrations, not an offline client. It
  has no IndexedDB cache and no bundled copy of the app: if the web origin is
  unreachable, the window has nothing to show.
- Page features that would like filesystem access (drag-and-drop from arbitrary
  paths, save-as) are not available. That is the point, not a missing plugin.
- Installers, code signing, notarization and the release pipeline are not built.
  `/download` says so. The updater's refusal is the only update behaviour that
  exists.
- If a capability is ever needed, it should be granted to a narrow window or a
  specific command, not to the main window as a group; the ADR is the place to
  argue that change.

## Alternatives considered

- **Electron.** Rejected: a larger runtime for the same OS integrations, and the
  same capability question in a different form.
- **A PWA only.** Rejected for the desktop product: a browser tab cannot own a
  tray icon, a global shortcut or a `prepo://` handler.
- **Grant the opener plugin to the window.** Rejected: the Rust side already
  opens external links deliberately, and giving the page the same power turns
  every injected link into a shell action.

## Evidence

`apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/shell.rs`,
`apps/desktop/src-tauri/src/deeplink.rs`, `apps/desktop/src-tauri/src/urls.rs`,
`desktop:verify`, `desktop:test`, the shell job in CI, `README.md`'s desktop
section.
