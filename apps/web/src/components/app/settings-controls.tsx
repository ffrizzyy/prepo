"use client";

import { useOptimistic, useTransition } from "react";
import { AUTONOMY_LEVELS } from "@prepo/shared";
import { cn } from "@/lib/utils";
import { setAutonomy, setFollowupTone } from "@/server/actions";

const TONES = [
  { id: "gentle", label: "Gentle" },
  { id: "neutral", label: "Neutral" },
  { id: "firm", label: "Firm" },
] as const;

export function AutonomySelect({
  workspace,
  value,
}: {
  workspace: string;
  value: string;
}) {
  const [optimistic, apply] = useOptimistic(value, (_state, next: string) => next);
  const [, startTransition] = useTransition();

  function choose(next: string) {
    startTransition(async () => {
      apply(next);
      await setAutonomy({ workspace, autonomy: next });
    });
  }

  return (
    <div className="space-y-2">
      {AUTONOMY_LEVELS.map((level) => (
        <button
          key={level.id}
          type="button"
          aria-pressed={optimistic === level.id}
          onClick={() => choose(level.id)}
          className={cn(
            "flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
            optimistic === level.id
              ? "border-accent bg-accent-soft/50"
              : "border-border hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "mt-1 size-3.5 shrink-0 rounded-full border-2",
              optimistic === level.id
                ? "border-accent bg-accent"
                : "border-border-strong",
            )}
            aria-hidden
          />
          <span>
            <span className="block text-sm font-medium">{level.name}</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              {level.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ToneSelect({
  workspace,
  value,
}: {
  workspace: string;
  value: string;
}) {
  const [optimistic, apply] = useOptimistic(value, (_state, next: string) => next);
  const [, startTransition] = useTransition();

  function choose(next: string) {
    startTransition(async () => {
      apply(next);
      await setFollowupTone({ workspace, tone: next });
    });
  }

  return (
    <div
      role="group"
      aria-label="Follow-up tone"
      className="inline-flex rounded-[10px] border border-border bg-surface-2 p-1 text-sm"
    >
      {TONES.map((tone) => (
        <button
          key={tone.id}
          type="button"
          aria-pressed={optimistic === tone.id}
          onClick={() => choose(tone.id)}
          className={cn(
            "rounded-[8px] px-3 py-1.5 transition-colors",
            optimistic === tone.id
              ? "bg-surface shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          {tone.label}
        </button>
      ))}
    </div>
  );
}
