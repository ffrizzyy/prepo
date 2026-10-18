"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { deleteMeeting } from "@/server/actions";
import type { MeetingDeletionImpact } from "@/server/writes";
import { Button } from "@/components/ui/button";

/**
 * Deleting a meeting is irreversible, so the control is built to be read before
 * it is pressed rather than clicked and regretted. It opens in place instead of
 * in a modal: the numbers it names are the ones on the page behind it, and an
 * inline panel cannot be dismissed by accident the way a dialog can.
 *
 * Every count comes from the database (see `meetingDeletionImpact`), so the
 * panel cannot promise to remove something that is not there.
 */
export function DeleteMeeting({
  workspace,
  meetingId,
  impact,
  canDelete,
}: {
  workspace: string;
  meetingId: string;
  /** Null only if the meeting went away between the page read and this render. */
  impact: MeetingDeletionImpact | null;
  /** False for a viewer, and for a member who is neither owner nor admin. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canDelete) {
    return (
      <p className="max-w-[65ch] text-xs text-text-subtle">
        Deleting a meeting takes everyone&rsquo;s transcript with it, so it is an owner or
        admin action here. Ask one of them, and the meeting and its recording go
        together.
      </p>
    );
  }

  if (!impact) {
    return (
      <p className="max-w-[65ch] text-xs text-text-subtle">
        This meeting is already gone, so there is nothing left to delete.
      </p>
    );
  }

  function remove() {
    if (!impact) return;
    // Captured, so the narrowing above survives into the async closure.
    const target = impact;

    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteMeeting({ workspace, meetingId });
        if (!result.deleted) {
          setError("That meeting was already gone. The list is up to date.");
          return;
        }
        const kept =
          target.ticketsKept > 0
            ? `${target.ticketsKept} ticket${target.ticketsKept === 1 ? "" : "s"} created from it were kept.`
            : "Nothing else was derived from it.";
        router.push(
          `/${workspace}/meetings?notice=${encodeURIComponent(`Deleted "${target.title}". ${kept}`)}`,
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not work.");
      }
    });
  }

  const removals = [
    impact.segments > 0
      ? `${impact.segments} transcript segment${impact.segments === 1 ? "" : "s"}`
      : null,
    impact.actionItems > 0
      ? `${impact.actionItems} action item${impact.actionItems === 1 ? "" : "s"}, proposed and rejected alike`
      : null,
    impact.storageKey ? "the stored recording and its bytes" : null,
    impact.shareLinks > 0
      ? `${impact.shareLinks} recap link${impact.shareLinks === 1 ? "" : "s"}`
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="max-w-[65ch]">
      {open ? null : (
        <>
          <p className="text-xs text-text-subtle">
            Remove this meeting, its transcript and its recording. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:underline"
          >
            <Trash size={13} aria-hidden />
            Delete this meeting
          </button>
        </>
      )}

      {open ? (
        <div
          role="group"
          aria-label="Confirm deleting this meeting"
          className="rounded-3 border border-danger/30 bg-danger/5 p-4"
        >
          <p className="text-sm font-medium">
            Delete this meeting and the data derived from it?
          </p>

          {removals.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-text-muted">
              {removals.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-danger">
                    &minus;
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-text-muted">
              Nothing but the meeting record itself is attached to it.
            </p>
          )}

          <p className="mt-3 text-xs text-text-muted">
            {impact.ticketsKept > 0
              ? `${impact.ticketsKept} ticket${impact.ticketsKept === 1 ? "" : "s"} created from this meeting ${impact.ticketsKept === 1 ? "is" : "are"} kept, and ${impact.ticketsKept === 1 ? "its" : "their"} link back to the meeting is cleared.`
              : "No tickets were created from this meeting."}{" "}
            The chaser keeps running for anything still owed, and the audit log keeps a
            record of who deleted it and when.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex min-h-9 items-center justify-center rounded-2 bg-danger px-3 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11"
            >
              {pending ? "Deleting..." : "Delete permanently"}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Keep it
            </Button>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
