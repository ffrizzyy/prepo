/*
 * The only script the shell itself runs.
 *
 * It probes the configured app address, and either navigates there or says why
 * it could not. A `no-cors` request is deliberate: the shell only needs to know
 * whether something answers, and it must not need CORS headers from the app to
 * find that out. The probe never reads a response body.
 */
(() => {
  const config = window.PREPO_DESKTOP || {};
  const appUrl = typeof config.appUrl === "string" ? config.appUrl.trim() : "";
  const PROBE_TIMEOUT_MS = 2500;

  const connecting = document.getElementById("connecting");
  const offline = document.getElementById("offline");

  function fact(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function showOffline(reason) {
    if (connecting) connecting.hidden = true;
    if (!offline) return;
    offline.hidden = false;
    fact("fact-url", appUrl || "not configured");
    fact("fact-version", `Prepo Desktop ${config.version || "0.0.0"}${reason ? ` — ${reason}` : ""}`);
    fact("fact-platform", config.platform || "unknown");
    for (const element of document.querySelectorAll("[data-app-url]")) {
      element.textContent = appUrl;
    }
  }

  async function reachable() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await fetch(appUrl, {
        mode: "no-cors",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function connect() {
    if (!appUrl) {
      showOffline("no target address");
      return;
    }
    if (!(await reachable())) {
      showOffline("no answer");
      return;
    }
    // Hand the window to the app. From here the shell only supplies the frame:
    // navigation, session cookies and rendering all belong to the server.
    window.location.replace(appUrl);
  }

  document.getElementById("retry")?.addEventListener("click", () => {
    if (offline) offline.hidden = true;
    if (connecting) connecting.hidden = false;
    void connect();
  });

  const target = document.getElementById("app-url");
  if (target) target.textContent = appUrl || "the app address";

  void connect();
})();
