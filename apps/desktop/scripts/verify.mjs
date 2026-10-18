#!/usr/bin/env node
/**
 * The desktop shell, checked without building it.
 *
 * A Tauri app is mostly configuration, and configuration is where a shell
 * quietly becomes unsafe: a wildcard capability, a CSP with `unsafe-eval`, a
 * remote origin granted IPC, an updater claiming a signing key it does not have.
 * None of that fails `cargo build`, so it is asserted here — in the same spirit
 * as the `db:*` suites.
 *
 *   pnpm --filter @prepo/desktop verify
 *
 * What this cannot prove: that the window renders, that a tray click does what
 * the menu says, or that an installer was produced. Those need the compiled
 * shell, a screen, and a release.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcTauri = join(appDir, "src-tauri");
const rustDir = join(srcTauri, "src");

let failed = 0;
let passed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readText = (path) => readFileSync(path, "utf8");
const firstGroup = (pattern, text) => pattern.exec(text)?.[1] ?? "";

const pkg = readJson(join(appDir, "package.json"));
const conf = readJson(join(srcTauri, "tauri.conf.json"));
const cargo = readText(join(srcTauri, "Cargo.toml"));
const configRs = readText(join(rustDir, "config.rs"));
const deeplinkRs = readText(join(rustDir, "deeplink.rs"));
const shellRs = readText(join(rustDir, "shell.rs"));

const csp = String(conf?.app?.security?.csp ?? "");
const html = readText(join(appDir, "ui", "index.html"));
const offlineJs = readText(join(appDir, "ui", "offline.js"));

/* ----------------------------------------------------------- the app target */

console.log("=== what the window opens ===\n");

const defaultUrl = firstGroup(/DEFAULT_APP_URL:\s*&str\s*=\s*"([^"]+)"/, configRs);

let defaultOrigin = null;
try {
  defaultOrigin = new URL(defaultUrl).origin;
} catch {
  defaultOrigin = null;
}

check("the shell has a default target address", Boolean(defaultUrl), defaultUrl || "(none)");
check("the default target is http or https", /^https?:\/\//.test(defaultUrl), defaultUrl);
check(
  "the default target's origin is allowed by connect-src, or its probe would be blocked",
  Boolean(defaultOrigin) && firstGroup(/connect-src([^;]*)/, csp).includes(defaultOrigin),
  defaultOrigin ?? "(unparsable)",
);
check(
  "the target can be changed without editing code",
  configRs.includes("PREPO_DESKTOP_URL"),
  "PREPO_DESKTOP_URL",
);
check(
  "a target that is not http(s) is refused, not opened",
  configRs.includes("NotHttp") && configRs.includes("WithCredentials"),
);
check(
  "the shell's page loads its scripts as files, so no inline script is needed",
  !/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html),
);
check(
  "the offline page is the only thing the shell renders itself",
  html.includes('id="offline"') && html.includes("offline.js"),
);
check(
  "the shell tells its page where to go, rather than the page guessing",
  shellRs.includes("initialization_script") && offlineJs.includes("window.PREPO_DESKTOP"),
);
check(
  "the shell's page only probes the target, it does not read it",
  offlineJs.includes("no-cors"),
);

/* -------------------------------------------------------------- the window */

console.log("\n=== the window ===\n");

check(
  "the shell identifies itself, so a session is labelled desktop",
  shellRs.includes("Tauri/") && shellRs.includes("PrepoDesktop/"),
  "clientTypeFor() looks for Tauri in the user-agent",
);
check(
  "the window starts at the shell's own page, not a remote address",
  shellRs.includes("WebviewUrl::App"),
);
check(
  "the window has a minimum size, so it cannot be shrunk into a broken layout",
  shellRs.includes("min_inner_size"),
);
check(
  "a link to anywhere else is handed to the system's browser",
  shellRs.includes("on_navigation") && shellRs.includes("open_url"),
);
check(
  "the shell asks the window where it is, instead of tracking page loads",
  shellRs.includes("window.url()") && shellRs.includes("workspace_from_url"),
);
check(
  "a second launch focuses the open window instead of opening another",
  shellRs.includes("tauri_plugin_single_instance::init") && shellRs.includes("focus("),
);

/* -------------------------------------------------------------- the posture */

console.log("\n=== posture ===\n");

check("a CSP is set", csp.length > 0);
check("the CSP denies by default", csp.includes("default-src 'self'"), csp);
check("the CSP forbids framing another document", csp.includes("frame-ancestors 'none'"), csp);
check("the CSP does not allow eval", !csp.includes("unsafe-eval"), csp);
check("the CSP does not allow inline scripts", !/script-src[^;]*unsafe-inline/.test(csp), csp);
check(
  "Tauri keeps its asset CSP modification on, which is what injects the nonces",
  conf?.app?.security?.dangerousDisableAssetCspModification !== true,
);
check("the Tauri API is not exposed globally", conf?.app?.withGlobalTauri === false);
check(
  "the bundle identifier is not the Tauri default",
  typeof conf.identifier === "string" && conf.identifier !== "com.tauri.dev",
  String(conf.identifier),
);
check(
  "the shell registers no IPC command of its own — the plugins' commands are unreachable because no capability grants one",
  !shellRs.includes("generate_handler") && !shellRs.includes("invoke_handler"),
);

const capabilitiesDir = join(srcTauri, "capabilities");
const capabilityFiles = existsSync(capabilitiesDir)
  ? readdirSync(capabilitiesDir).filter((name) => name.endsWith(".json"))
  : [];
const remoteGrants = capabilityFiles
  .map((name) => ({ name, json: readJson(join(capabilitiesDir, name)) }))
  .filter(({ json }) => {
    const urls = Array.isArray(json?.remote?.urls) ? json.remote.urls : [];
    const permissions = Array.isArray(json?.permissions) ? json.permissions : [];
    return urls.length > 0 && permissions.length > 0;
  });
check(
  "no capability grants permissions to remote content",
  remoteGrants.length === 0,
  remoteGrants.map(({ name }) => name).join(", "),
);

/* ------------------------------------------------------------- the pieces */

console.log("\n=== the pieces ===\n");

for (const crate of [
  "tauri-plugin-single-instance",
  "tauri-plugin-window-state",
  "tauri-plugin-notification",
  "tauri-plugin-global-shortcut",
  "tauri-plugin-deep-link",
  "tauri-plugin-opener",
  "tauri-plugin-updater",
]) {
  check(`${crate} is a dependency`, new RegExp(`^${crate}\\s*=`, "m").test(cargo));
}
check("the tray is enabled as a Tauri feature", /tauri\s*=\s*\{[^}]*tray-icon/.test(cargo));
check(
  "a tray menu is built, with a quit that is handled rather than assumed",
  shellRs.includes("TrayIconBuilder") && shellRs.includes("MENU_QUIT"),
);
check(
  "a global shortcut is registered",
  shellRs.includes("on_shortcut") && shellRs.includes("RECORDING_SHORTCUT"),
);

const scheme = firstGroup(/SCHEME:\s*&str\s*=\s*"([^"]+)"/, deeplinkRs);
const configuredSchemes = conf?.plugins?.["deep-link"]?.desktop?.schemes ?? [];
check(
  "the prepo:// scheme is registered, for the same scheme the parser accepts",
  Array.isArray(configuredSchemes) && configuredSchemes.length === 1 && configuredSchemes[0] === scheme,
  `${JSON.stringify(configuredSchemes)} vs ${scheme}`,
);
check(
  "a deep link is parsed, not pasted into the window",
  shellRs.includes("deeplink::parse") && shellRs.includes("deeplink::resolve"),
);
check(
  "a deep link that cannot be understood is logged and dropped",
  shellRs.includes("ignored"),
);
check(
  "the updater does not claim a signing key it does not have",
  !conf?.plugins?.updater?.pubkey,
  JSON.stringify(conf?.plugins?.updater ?? null),
);
check(
  "an update check that cannot run is reported instead of silently passing",
  shellRs.includes("no update endpoint") && shellRs.includes("check_for_updates"),
);

/* ------------------------------------------------------------- bundling */

console.log("\n=== bundling ===\n");

check("bundling is active", conf?.bundle?.active === true);
const icons = Array.isArray(conf?.bundle?.icon) ? conf.bundle.icon : [];
check(
  "every icon the bundle names exists",
  icons.length > 0 && icons.every((icon) => existsSync(join(srcTauri, icon))),
  icons.filter((icon) => !existsSync(join(srcTauri, icon))).join(", "),
);
check(
  "an .ico and an .icns are shipped, for Windows and macOS",
  icons.some((icon) => icon.endsWith(".ico")) && icons.some((icon) => icon.endsWith(".icns")),
);
check(
  "the frontend that gets embedded is the shell's own page",
  conf?.build?.frontendDist === "../ui" && existsSync(join(appDir, "ui", "index.html")),
  String(conf?.build?.frontendDist),
);

/* --------------------------------------------------------------- the build */

console.log("\n=== the build ===\n");

const cargoVersion = firstGroup(/^version\s*=\s*"([^"]+)"/m, cargo);
check(
  "the version is the same in package.json, tauri.conf.json and Cargo.toml",
  pkg.version === conf.version && pkg.version === cargoVersion,
  `${pkg.version} / ${conf.version} / ${cargoVersion}`,
);
check(
  "rust dependencies are locked, so a build is the same build",
  existsSync(join(srcTauri, "Cargo.lock")),
);
check(
  "the rust build directory is not committed",
  readText(join(appDir, "..", "..", ".gitignore")).includes("target"),
);
check(
  "the README says plainly that no installer is published yet",
  readText(join(appDir, "README.md")).includes("None published"),
);

console.log("");
if (failed > 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log(`\n${failed} desktop check(s) failed`);
  process.exit(1);
}
console.log(
  `all ${passed} desktop checks passed (${relative(process.cwd(), appDir) || "apps/desktop"})`,
);
