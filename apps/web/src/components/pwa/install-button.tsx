"use client";

import { useCallback, useEffect, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * The install affordance.
 *
 * Browsers decide whether a site may be installed, and say so with a
 * `beforeinstallprompt` event; this component only ever offers a button when the
 * browser has actually made that offer. There is no "Install" button that does
 * nothing, and no nagging: if the event never arrives, this renders nothing and
 * the page's written instructions are the whole story.
 *
 * The event is captured in the root layout, before hydration, because Chromium can
 * fire it while the page is still loading — a listener attached in `useEffect`
 * would miss it and the button would simply never appear.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __prepoInstallPrompt?: InstallPromptEvent;
  }
}

/** Fired by the capture script in the layout when the browser offers install. */
const AVAILABLE = "prepo:install-available";

export function InstallButton({ className }: { className?: string }) {
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    if (window.__prepoInstallPrompt) setOffer(window.__prepoInstallPrompt);

    const onAvailable = () => {
      if (window.__prepoInstallPrompt) setOffer(window.__prepoInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setOffer(null);
      delete window.__prepoInstallPrompt;
    };

    window.addEventListener(AVAILABLE, onAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(AVAILABLE, onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!offer) return;
    await offer.prompt();
    const choice = await offer.userChoice;
    delete window.__prepoInstallPrompt;
    setOffer(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }, [offer]);

  if (installed) {
    return (
      <p className={className} role="status">
        Installed. Prepo opens in its own window now, without browser chrome.
      </p>
    );
  }

  if (!offer) return null;

  return (
    <Button variant="primary" size="md" className={className} onClick={() => void install()}>
      <DownloadSimple size={16} weight="bold" />
      Install Prepo
    </Button>
  );
}
