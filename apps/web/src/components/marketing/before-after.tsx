"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle } from "@phosphor-icons/react";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";

const MINUTES = [
  "Lena opened the Q4 launch sync and asked for a status on checkout. Priya explained that events are still lost when the downstream service is slow.",
  "The team then discussed, at length, whether the pricing page or the email sequence should ship first. After several minutes of back and forth, they agreed the pricing page goes first.",
  "Sam mentioned beta invites but the group did not settle on a date. Marco raised the metrics dashboard and the need for a staging bucket.",
  "Someone asked who owns the launch email sequence. Marco said the marketing team should handle it, though no individual was named.",
  "The enterprise legal review came up again. Lena believed it was already tracked, and after some searching the group agreed it is PRE-118.",
];

const TICKETS = [
  { key: "PRE-142", title: "Fix the checkout webhook retry bug", owner: "Priya Nair", due: "Oct 17", priority: "p0" },
  { key: "PRE-143", title: "Ship the pricing page copy", owner: "Sam Rivera", due: "Oct 23", priority: "p1" },
  { key: "PRE-144", title: "Prepare the launch metrics dashboard", owner: "Marco Bianchi", due: "No date", priority: "p2" },
  { key: "PRE-145", title: "Set up the staging R2 bucket", owner: "Priya Nair", due: "Oct 16", priority: "p2" },
];

export function BeforeAfter() {
  const [view, setView] = useState<"minutes" | "tickets">("tickets");

  return (
    <Section className="border-t border-border">
      <div className="mb-10 max-w-2xl">
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          From discussion to execution
        </h2>
        <p className="mt-3 text-text-muted">
          The same meeting, twice. On the left, minutes nobody acts on. On the right,
          owners and dates.
        </p>
      </div>

      <div
        role="group"
        aria-label="Compare meeting minutes and tickets"
        className="mb-6 inline-flex rounded-[10px] border border-border bg-surface-2 p-1"
      >
        {(["minutes", "tickets"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={cn(
              "rounded-[8px] px-4 py-1.5 text-sm capitalize transition-colors",
              view === option
                ? "bg-surface text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {view === "minutes" ? (
          <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.16em] text-text-subtle">
              Meeting minutes
            </p>
            <div className="space-y-4 text-sm leading-relaxed text-text-muted">
              {MINUTES.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {TICKETS.map((ticket) => (
              <li
                key={ticket.key}
                className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4"
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-accent-ink"
                  />
                  <div>
                    <p className="text-sm font-medium">{ticket.title}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {ticket.owner} · due {ticket.due}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase text-text-subtle">
                  {ticket.key}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </Section>
  );
}
