"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ArrowSquareOut, PaperPlaneTilt, Robot } from "@phosphor-icons/react";
import {
  TICKET_STATUSES,
  type Meeting,
  type Ticket,
  type TicketStatusId,
} from "@prepo/shared";
import { formatDate, isOverdue, relativeTime } from "@/lib/workspace-data";
import { addComment, moveTicket } from "@/server/actions";
import type {
  FollowupView,
  TicketCommentView,
  TicketEventView,
} from "@/server/queries";
import { PriorityBadge, StatusBadge } from "./badges";
import { TicketChase } from "./followup-controls";
import { TicketLinearSync } from "./integration-controls";
import { Card, EmptyState } from "./page-header";

export function TicketDetail({
  workspace,
  ticket,
  meeting,
  comments,
  events,
  followups,
  viewerName,
  linearConnected,
}: {
  workspace: string;
  ticket: Ticket;
  meeting: Meeting | null;
  comments: TicketCommentView[];
  events: TicketEventView[];
  followups: FollowupView[];
  viewerName: string;
  /** Whether this workspace has a usable Linear connection (PREPO.md §8.5). */
  linearConnected: boolean;
}) {
  const [optimisticStatus, applyStatus] = useOptimistic(
    ticket.status,
    (_state, next: TicketStatusId) => next,
  );
  const [optimisticComments, applyComment] = useOptimistic(
    comments,
    (state, body: string) => [
      ...state,
      {
        id: `optimistic-${state.length}`,
        author: viewerName,
        body,
        createdAt: new Date().toISOString(),
      },
    ],
  );
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");

  function changeStatus(status: TicketStatusId) {
    startTransition(async () => {
      applyStatus(status);
      await moveTicket({ workspace, ticketId: ticket.id, status });
    });
  }

  function submitComment(body: string) {
    startTransition(async () => {
      applyComment(body);
      await addComment({ workspace, ticketKey: ticket.key, body });
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <a
          href={`/${workspace}/tickets`}
          className="text-xs text-text-subtle hover:text-text"
        >
          ← Tickets
        </a>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs text-text-subtle">{ticket.key}</span>
            <h1 className="mt-1 max-w-[40ch] text-2xl font-medium tracking-tight">
              {ticket.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="ticket-status">
              Status
            </label>
            <select
              id="ticket-status"
              value={optimisticStatus}
              onChange={(event) =>
                changeStatus(event.target.value as TicketStatusId)
              }
              className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm"
            >
              {TICKET_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Description">
            <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">
              {ticket.description ?? "No description yet."}
            </p>
          </Card>

          <Card title="Origin">
            {meeting ? (
              <div className="space-y-3">
                <a
                  href={`/${workspace}/meetings/${meeting.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
                >
                  {meeting.title}
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
                {ticket.sourceQuote ? (
                  <blockquote className="rounded-[10px] border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-xs leading-relaxed text-text-muted">
                    “{ticket.sourceQuote}”
                  </blockquote>
                ) : null}
                <p className="text-xs text-text-subtle">
                  Held {formatDate(meeting.heldAt)} · audio moment linked
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                This ticket was created directly, not from a meeting.
              </p>
            )}
          </Card>

          <Card title={`Comments (${optimisticComments.length})`}>
            {optimisticComments.length === 0 ? (
              <p className="py-4 text-sm text-text-subtle">
                No comments yet. Ask for a status update and Prepo will nudge the
                owner.
              </p>
            ) : (
              <ul className="space-y-4">
                {optimisticComments.map((comment) => (
                  <li key={comment.id} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-medium">
                      {comment.author === "Prepo" || comment.author === null ? (
                        <Robot size={14} className="text-accent-ink" aria-hidden />
                      ) : (
                        comment.author
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {comment.author ?? "Prepo"}
                        <span className="ml-2 font-mono text-[10px] font-normal text-text-subtle">
                          {relativeTime(comment.createdAt)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-text-muted">
                        {comment.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="mt-5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = draft.trim();
                if (!body) return;
                setDraft("");
                submitComment(body);
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Add a comment or @mention"
                aria-label="Add a comment"
                className="h-10 flex-1 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none placeholder:text-text-subtle"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg active:scale-[0.98]"
              >
                <PaperPlaneTilt size={14} weight="bold" />
                Send
              </button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <Row label="Status">
                <StatusBadge status={optimisticStatus} />
              </Row>
              <Row label="Priority">
                <PriorityBadge priority={ticket.priority} />
              </Row>
              <Row label="Assignee">{ticket.assigneeName ?? "Unassigned"}</Row>
              <Row label="Due">
                <span
                  className={
                    isOverdue(ticket.dueAt) && optimisticStatus !== "done"
                      ? "text-[#b91c1c] dark:text-[#f87171]"
                      : undefined
                  }
                >
                  {formatDate(ticket.dueAt)}
                </span>
              </Row>
              <Row label="Labels">
                <span className="flex flex-wrap gap-1.5">
                  {ticket.labels.length === 0 ? (
                    <span className="text-text-subtle">None</span>
                  ) : null}
                  {ticket.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </Row>
            </dl>
          </Card>

          {linearConnected ? (
            <Card title="Linear">
              <TicketLinearSync
                workspace={workspace}
                ticketId={ticket.id}
                state={ticket.linearSyncState}
                error={ticket.linearSyncError}
                url={ticket.linearUrl}
              />
            </Card>
          ) : null}

          <Card title="Follow-ups">
            <TicketChase
              workspace={workspace}
              ticketId={ticket.id}
              pendingCount={
                followups.filter((entry) => entry.status === "scheduled").length
              }
              done={optimisticStatus === "done"}
            />

            {followups.length > 0 ? (
              <ul className="mt-4 divide-y divide-border border-t border-border pt-1">
                {followups.slice(-6).map((entry) => (
                  <li key={entry.id} className="flex gap-2.5 py-2 text-xs">
                    <span
                      className={
                        entry.status === "scheduled"
                          ? "mt-1 size-1.5 shrink-0 rounded-full bg-accent"
                          : "mt-1 size-1.5 shrink-0 rounded-full bg-border-strong"
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-text-muted">
                        {entry.kind} · {entry.channel} · {entry.status}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-text-subtle">
                        {formatDate(entry.sentAt ?? entry.scheduledFor)}
                        {entry.recipientName ? ` · to ${entry.recipientName}` : ""}
                      </p>
                      {entry.detail ? (
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          {entry.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title="Linear">
            {ticket.linearUrl ? (
              <a
                href={ticket.linearUrl}
                className="inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline"
              >
                Open in Linear
                <ArrowSquareOut size={14} weight="bold" />
              </a>
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  Not mirrored to Linear. Connect a Linear team in Settings to sync
                  status both ways.
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-[10px] border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-surface-2"
                >
                  Connect Linear
                </button>
              </>
            )}
          </Card>

          <Card title="Activity">
            {events.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Changes to this ticket will be recorded here."
              />
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-2.5 text-xs">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p className="text-text-muted">{describeEvent(event)}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-text-subtle">
                        {event.actorName ?? "prepo-agent"} ·{" "}
                        {relativeTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function describeEvent(event: TicketEventView): string {
  if (event.type === "created") {
    if (event.payload.source === "meeting") {
      return "Created from an approved action item.";
    }
    if (event.payload.source === "seed") {
      return "Imported from your existing tracker.";
    }
    return "Ticket created.";
  }
  if (event.type === "status_changed") {
    const from = String(event.payload.from ?? "?");
    const to = String(event.payload.to ?? "?");
    return `Status moved ${from.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}.`;
  }

  // Linear events carry what changed, so the timeline can say it rather than
  // just naming the integration (PREPO.md §8.6).
  if (event.type === "linear_linked") {
    const identifier = event.payload.identifier;
    return typeof identifier === "string"
      ? `Sent to Linear as ${identifier}.`
      : "Sent to Linear.";
  }
  if (event.type === "linear_synced") {
    return "Changes sent to Linear.";
  }
  if (event.type === "linear_updated_here") {
    const change = event.payload.change;
    return typeof change === "string" && change.length > 0
      ? `Linear changed this ticket: ${change}.`
      : "Changed by Linear.";
  }
  if (event.type === "linear_conflict") {
    return "Linear changed this at the same time, and Prepo's queued edit was kept. It will be pushed.";
  }
  if (event.type === "linear_unlinked") {
    return "The Linear issue was deleted. The ticket was kept.";
  }

  return event.type.replace(/_/g, " ");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
