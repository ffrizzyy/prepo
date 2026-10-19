"use client";

import { useEffect } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { BRAND, REPO_URL } from "@prepo/shared";
import "./globals.css";

/**
 * Last resort: this replaces the root layout when the layout itself fails, so it
 * has to bring its own document, styles and fonts. Keep it dependency-free:
 * anything it imports has a chance to be what broke in the first place.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-bg font-sans text-text antialiased">
        <main className="grid min-h-screen place-items-center px-4 py-16">
          <div className="w-full max-w-xl rounded-3 border border-border bg-surface p-8">
            <span className="grid size-7 place-items-center rounded-1 bg-accent text-sm font-semibold text-accent-fg">
              P
            </span>
            <h1 className="mt-5 text-2xl leading-tight tracking-tighter md:text-3xl">
              {BRAND.name} could not start
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              The application shell failed to render, which usually means a problem on the server
              rather than in the page you asked for. Reloading is safe; nothing partial was saved.
            </p>
            {digest ? (
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-text-subtle">
                Reference {digest}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => retry()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2 bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <ArrowCounterClockwise size={16} weight="bold" />
                Try again
              </button>
              <a
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-2 border border-border-strong bg-surface px-4 text-sm font-medium"
              >
                Back to the homepage
              </a>
            </div>
            <p className="mt-6 text-xs text-text-subtle">
              Still stuck? The status lives at{" "}
              <a href={REPO_URL} className="text-accent-ink underline underline-offset-4">
                the repository
              </a>
              .
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
