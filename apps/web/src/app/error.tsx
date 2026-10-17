"use client";

import { useEffect } from "react";
import { ArrowCounterClockwise, Warning } from "@phosphor-icons/react";
import { REPO_URL } from "@prepo/shared";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { cn } from "@/lib/utils";

/**
 * Catches errors thrown while rendering any route below the root layout —
 * including the app shell, which is why this one does not assume a workspace or
 * a signed-in user. In production the message is deliberately generic; the
 * digest is the identifier that matches the server-side log.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <Container className="max-w-xl">
        <div className="rounded-2xl border border-border bg-surface p-8">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <Warning size={20} weight="bold" />
          </span>
          <h1 className="mt-5 text-2xl leading-tight tracking-tighter md:text-3xl">
            Something broke on our side
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            This one is not your fault. The page failed while it was being rendered, and nothing
            you were working on was changed — every write Prepo makes is recorded as an audit
            event, so a half-finished action is visible rather than lost.
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
              className={cn(buttonVariants({ variant: "primary", size: "md" }))}
            >
              <ArrowCounterClockwise size={16} weight="bold" />
              Try again
            </button>
            <a href="/" className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
              Back to the homepage
            </a>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-text-subtle">
            If it keeps happening,{" "}
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="text-accent-ink underline underline-offset-4"
            >
              open an issue
            </a>{" "}
            with the reference above and what you were doing at the time.
          </p>
        </div>
      </Container>
    </main>
  );
}
