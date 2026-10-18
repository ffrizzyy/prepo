//! Prepo's desktop shell.
//!
//! A native window around the web app, plus the things a browser cannot do: a
//! tray, a global shortcut, `prepo://` links and native notifications. The shell
//! holds no product logic and no data of its own; see `README.md`.

// A release build is a GUI application: without this, Windows would open a
// console behind the window. Development keeps the console, where the shell's
// own log lines go.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod deeplink;
mod shell;
mod urls;

fn main() {
    shell::run();
}
