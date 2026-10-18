"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes Prepo installable.
 *
 * Production only, and only in a secure context. In development a worker would
 * hold the build's assets across every edit, which is exactly the kind of
 * "it works on my machine" this repository tries to avoid; and browsers only
 * allow a worker on https or localhost, so registering anywhere else would fail
 * loudly for no reason.
 *
 * A failed registration is logged rather than swallowed: "installable" is a claim
 * on the download page, and the console warning is how you find out it is false.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const host = window.location.hostname;
    const secure =
      window.location.protocol === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]";
    if (!secure) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.warn("[prepo] the service worker did not register", error);
      });
  }, []);

  return null;
}
