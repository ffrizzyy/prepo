"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  cancelFollowup,
  chaseTicket,
  markNotificationsRead,
  rescheduleFollowup,
  setDigestWeekday,
  setFollowupsEnabled,
  snoozeTicket,
  stopChasing,
} from "@/server/actions";

/** `datetime-local` wants a local wall-clock string with no timezone. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await work();
        setError(null);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "That did not work");
      }
    });
  }

  return { pending, error, run };
}

/**
 * One pending message. PREPO.md §8.7 promises it can be moved or cancelled before
 * it sends, so both are here rather than only a cancel button.
 */
export function PendingFollowup({
  workspace,
  followupId,
  scheduledFor,
}: {
  workspace: string;
  followupId: string;
  scheduledFor: string;
}) {
  const { pending, error, run } = useAction();
  const [when, setWhen] = useState(toLocalInput(scheduledFor));
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 text-right">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-2 border border-border px-2.5 py-1 text-xs text-text-muted hover:bg-surface-2"
        >
          Move
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => cancelFollowup({ workspace, followupId }))
          }
          className="rounded-2 border border-border px-2.5 py-1 text-xs text-text-muted hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "Working…" : "Cancel"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <input
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className="rounded-2 border border-border bg-surface-2 px-2 py-1 text-xs"
            aria-label="New time"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                rescheduleFollowup({
                  workspace,
                  followupId,
                  scheduledFor: when,
                }),
              )
            }
            className="rounded-2 bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/**
 * The per-ticket controls. "Chase now" queues the same owner message the ladder
 * would send; snoozing delays what is pending; stopping cancels it. None of them
 * touch a message that already went out.
 */
export function TicketChase({
  workspace,
  ticketId,
  pendingCount,
  done,
}: {
  workspace: string;
  ticketId: string;
  pendingCount: number;
  done: boolean;
}) {
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || done}
          onClick={() => run(() => chaseTicket({ workspace, ticketId }))}
          className="rounded-2 border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
          title={
            done
              ? "Finished work is not chased"
              : "Send the reminder now rather than waiting for the ladder"
          }
        >
          Chase now
        </button>
        <button
          type="button"
          disabled={pending || done || pendingCount === 0}
          onClick={() =>
            run(() => snoozeTicket({ workspace, ticketId, days: 3 }))
          }
          className="rounded-2 border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          Snooze 3 days
        </button>
        <button
          type="button"
          disabled={pending || pendingCount === 0}
          onClick={() => run(() => stopChasing({ workspace, ticketId }))}
          className="rounded-2 border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          Stop chasing
        </button>
      </div>

      <p className="text-xs text-text-subtle">
        {done
          ? "This is done, so the chaser has stopped. Nothing will go out."
          : pendingCount === 0
            ? "Nothing is pending for this ticket."
            : `${pendingCount} message${pendingCount === 1 ? "" : "s"} pending.`}
      </p>

      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

export function MarkAllRead({
  workspace,
  unread,
}: {
  workspace: string;
  unread: number;
}) {
  const { pending, error, run } = useAction();

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending || unread === 0}
        onClick={() => run(() => markNotificationsRead({ workspace }))}
        className={cn(
          "rounded-2 border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2",
          unread === 0 && "opacity-50",
        )}
      >
        {unread === 0 ? "All read" : `Mark all ${unread} read`}
      </button>
      {error ? <p className="mt-1 text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

export function MarkRead({
  workspace,
  notificationId,
}: {
  workspace: string;
  notificationId: string;
}) {
  const { pending, run } = useAction();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        run(() => markNotificationsRead({ workspace, notificationId }))
      }
      className="rounded-2 border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-surface-2 disabled:opacity-50"
    >
      Mark read
    </button>
  );
}

export function FollowupsToggle({
  workspace,
  enabled,
}: {
  workspace: string;
  enabled: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">
          {enabled ? "Chasing is on" : "Chasing is off"}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {enabled
            ? "Upcoming messages go out on schedule. Turning this off cancels what is pending."
            : "Nothing is sent. Nothing scheduled stays scheduled, either."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={() =>
          run(() => setFollowupsEnabled({ workspace, enabled: !enabled }))
        }
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50",
          enabled ? "border-accent bg-accent" : "border-border-strong bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
            enabled ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

async function setFollowupsEnabledAction(workspace: string, enabled: boolean) {
  const { setFollowupsEnabled } = await import("@/server/actions");
  await setFollowupsEnabled({ workspace, enabled });
}

const WEEKDAYS = [
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 5, label: "Friday" },
  { id: 0, label: "Sunday" },
] as const;

export function DigestWeekdaySelect({
  workspace,
  value,
}: {
  workspace: string;
  value: number;
}) {
  const { pending, error, run } = useAction();
  const [selected, setSelected] = useState(value);

  return (
    <div>
      <div
        role="group"
        aria-label="Digest day"
        className="flex flex-wrap gap-2"
      >
        {WEEKDAYS.map((day) => (
          <button
            key={day.id}
            type="button"
            aria-pressed={selected === day.id}
            disabled={pending}
            onClick={() => {
              setSelected(day.id);
              run(() => setDigestWeekday({ workspace, weekday: day.id }));
            }}
            className={cn(
              "rounded-2 border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
              selected === day.id
                ? "border-accent bg-accent-soft/50 font-medium"
                : "border-border hover:bg-surface-2",
            )}
          >
            {day.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}
