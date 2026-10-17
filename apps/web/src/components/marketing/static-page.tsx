import type { ReactNode } from "react";
import { FinalCta } from "@/components/marketing/final-cta";
import { Navbar } from "@/components/marketing/navbar";
import { Container, Eyebrow } from "@/components/ui/section";
import { cn } from "@/lib/utils";

/**
 * The shell for the non-landing public pages (security, privacy, terms,
 * download, 404). Same header, type scale and footer as the landing page, so
 * they read as part of the same site rather than as an afterthought.
 */
export function StaticPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar home={false} />
      <main className="pt-28 pb-8 md:pt-36">
        <Container>
          <div className="max-w-3xl">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h1 className="text-3xl leading-tight tracking-tighter md:text-5xl">
              {title}
            </h1>
            {intro ? (
              <p className="mt-4 text-lg leading-relaxed text-text-muted">{intro}</p>
            ) : null}
            {updated ? (
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-text-subtle">
                {updated}
              </p>
            ) : null}
          </div>

          <div className="mt-12 md:mt-16">{children}</div>
        </Container>
      </main>
      <FinalCta />
    </>
  );
}

/**
 * Long-form copy without pulling in a typography plugin: children stay plain
 * semantic markup (h2, p, ul, table) and the sizes come from here.
 */
export function Prose({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4 text-sm leading-relaxed text-text-muted",
        "[&_a]:text-accent-ink [&_a]:underline [&_a]:decoration-accent-note [&_a]:underline-offset-4 [&_a:hover]:decoration-accent-ink",
        "[&_code]:rounded-[6px] [&_code]:border [&_code]:border-border [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em] [&_code]:text-text",
        "[&_h2]:pt-8 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-text",
        "[&_h3]:pt-4 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-text",
        "[&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-text",
        "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A bordered block for the parts that are easy to over-claim: what is not built
 * yet, or what a reader should not assume.
 */
export function Callout({
  title,
  tone = "note",
  children,
}: {
  title: string;
  tone?: "note" | "plain";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl rounded-2xl border p-5",
        tone === "note"
          ? "border-accent-note bg-accent-soft text-accent-ink"
          : "border-border bg-surface text-text-muted",
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** Two-column label/value rows for the fact tables these pages lean on. */
export function FactList({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="max-w-3xl divide-y divide-border rounded-2xl border border-border bg-surface">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
        >
          <dt className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
            {row.label}
          </dt>
          <dd className="text-sm text-text-muted sm:text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
