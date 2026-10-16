"use client";

import { useState } from "react";
import { ArrowSquareOut, PaperPlaneTilt, Robot } from "@phosphor-icons/react";
import { TICKET_STATUSES, type TicketStatusId } from "@prepo/shared";
import { formatDate, getMeeting, isOverdue } from "@/lib/workspace-data";
import { PriorityBadge, StatusBadge } from "./badges";
import { Card, EmptyState } from "./page-header";
import { useWorkspaceStore } from "./store";

type Comment = { id: string; author: string; body: string; when: string };

export function TicketDetail({
  workspace,
  ticketKey,
}: {
  workspace: string;
  ticketKey: string;
}) {
  const { tickets, moveTicket } = useWorkspaceStore();
  const [comments, setComments] = useState<Comment[]>([
    {
      id: "c1",
      author: "Prepo",
      body: "Ticket created from the Q4 Launch sync. Source quote attached below.",
      when: "2 days ago",
    },
    {
      id: "c2",
      author: "Lena Fischer",
      body: "This is the launch blocker — keep it at p0 until the retries survive a slow downstream.",
      when: "yesterday",
    },
  ]);
  const [draft, setDraft] = useState("");

  const ticket = tickets.find((item) => item.key === ticketKey);
  const meeting = ticket?.meetingId ? getMeeting(ticket.meetingId) : undefined;

  if (!ticket) {
    return (
      <EmptyState
        title={`Ticket ${ticketKey} not found`}
        description="It may have been deleted, or the link is out of date."
        action={
          <a
            href={`/${workspace}/tickets`}
            className="text-sm text-accent-ink hover:underline"
          >
            Back to tickets
          </a>
        }
      />
    );
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
              value={ticket.status}
              onChange={(event) =>
                moveTicket(ticket.id, event.target.value as TicketStatusId)
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

          <Card title={`Comments (${comments.length})`}>
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-medium">
                    {comment.author === "Prepo" ? (
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
                      {comment.author}
                      <span className="ml-2 font-mono text-[10px] font-normal text-text-subtle">
                        {comment.when}
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                      {comment.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <form
              className="mt-5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                setComments((current) => [
                  ...current,
                  {
                    id: `c${current.length + 1}`,
                    author: "You",
                    body: draft.trim(),
                    when: "just now",
                  },
                ]);
                setDraft("");
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
                <StatusBadge status={ticket.status} />
              </Row>
              <Row label="Priority">
                <PriorityBadge priority={ticket.priority} />
              </Row>
              <Row label="Assignee">
                {ticket.assigneeName ?? "Unassigned"}
              </Row>
              <Row label="Due">
                <span
                  className={
                    isOverdue(ticket.dueAt) && ticket.status !== "done"
                      ? "text-[#b91c1c] dark:text-[#f87171]"
                      : undefined
                  }
                >
                  {formatDate(ticket.dueAt)}
                </span>
              </Row>
              <Row label="Labels">
                <span className="flex flex-wrap gap-1.5">
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
            <ol className="space-y-3">
              {[
                { what: "Prepo created this ticket from an approved item.", when: "2 days ago" },
                { what: "Priority set to " + ticket.priority.toUpperCase() + ".", when: "2 days ago" },
                { what: "Assigned to " + (ticket.assigneeName ?? "nobody") + ".", when: "2 days ago" },
                { what: "Follow-up scheduled 24h before due.", when: "2 days ago" },
              ].map((event, index) => (
                <li key={index} className="flex gap-2.5 text-xs">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                  <div>
                    <p className="text-text-muted">{event.what}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-text-subtle">
                      prepo-agent · {event.when}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
