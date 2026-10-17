"use client";

import { useOptimistic, useTransition } from "react";
import { AUTONOMY_LEVELS } from "@prepo/shared";
import { cn } from "@/lib/utils";
import { setAudioRetention, setAutonomy, setFollowupTone } from "@/server/actions";

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

const RETENTION_CHOICES = [
  { days: 0, label: "As soon as it is transcribed" },
  { days: 7, label: "7 days after transcription" },
  { days: 30, label: "30 days after transcription" },
  { days: 90, label: "90 days after transcription" },
  { days: -1, label: "Keep until the meeting is deleted" },
] as const;

/**
 * Retention is a choice, not a fixed policy: "delete as soon as it is
 * transcribed" has to be reachable for anyone recording something sensitive.
 */
export function RetentionSelect({
  workspace,
  value,
}: {
  workspace: string;
  value: number;
}) {
  const [optimistic, apply] = useOptimistic(value, (_state, next: number) => next);
  const [, startTransition] = useTransition();

  function choose(days: number) {
    startTransition(async () => {
      apply(days);
      await setAudioRetention({ workspace, days });
    });
  }

  return (
    <div className="space-y-2">
      {RETENTION_CHOICES.map((choice) => (
        <button
          key={choice.days}
          type="button"
          aria-pressed={optimistic === choice.days}
          onClick={() => choose(choice.days)}
          className={cn(
            "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-sm transition-colors",
            optimistic === choice.days
              ? "border-accent bg-accent-soft/50"
              : "border-border hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "size-3.5 shrink-0 rounded-full border-2",
              optimistic === choice.days ? "border-accent bg-accent" : "border-border-strong",
            )}
            aria-hidden
          />
          {choice.label}
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
}) {  const [optimistic, apply] = useOptimistic(value, (_state, next: string) => next);
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
