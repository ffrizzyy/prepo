"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowRight, ArrowUpRight, Clock } from "@phosphor-icons/react";
import {
  TICKET_STATUSES,
  type Ticket,
  type TicketStatusId,
} from "@prepo/shared";
import { formatShortDate, isOverdue } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { moveTicket } from "@/server/actions";
import type { ActionItemView, FollowupView, MeetingView } from "@/server/queries";
import { OverdueBadge, PriorityBadge } from "./badges";
import { Card } from "./page-header";
import { ReviewList } from "./review-list";

export function Dashboard({
  workspace,
  tickets,
  meetings,
  actionItems,
  followups,
}: {
  workspace: string;
  tickets: Ticket[];
  meetings: MeetingView[];
  actionItems: ActionItemView[];
  followups: FollowupView[];
}) {
  const [optimisticTickets, applyMove] = useOptimistic(
    tickets,
    (state, move: { id: string; status: TicketStatusId }) =>
      state.map((ticket) =>
        ticket.id === move.id ? { ...ticket, status: move.status } : ticket,
      ),
  );
  const [, startTransition] = useTransition();

  function move(id: string, status: TicketStatusId) {
    startTransition(async () => {
      applyMove({ id, status });
      await moveTicket({ workspace, ticketId: id, status });
    });
  }

  const open = optimisticTickets
    .filter((ticket) => ticket.status !== "done")
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));

  const doneCount = optimisticTickets.filter(
    (ticket) => ticket.status === "done",
  ).length;
  const overdueCount = open.filter((ticket) => isOverdue(ticket.dueAt)).length;

  const pending = followups.filter((entry) => entry.status === "scheduled");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Open tickets", value: open.length },
          { label: "Overdue", value: overdueCount, tone: "danger" as const },
          { label: "Completed", value: doneCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p
              className={cn(
                "mt-2 font-mono text-3xl tracking-tight",
                stat.tone === "danger" &&
                  stat.value > 0 &&
                  "text-[#b91c1c] dark:text-[#f87171]",
              )}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card
            title="Today"
            action={
              <a
                href={`/${workspace}/board`}
                className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline"
              >
                Open board
                <ArrowRight size={13} weight="bold" />
              </a>
            }
          >
            {open.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing open. Every ticket is done.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {open.slice(0, 6).map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/${workspace}/tickets/${ticket.key}`}
                        className="truncate text-sm font-medium hover:text-accent-ink"
                      >
                        {ticket.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span className="font-mono text-[10px] text-text-subtle">
                          {ticket.key}
                        </span>
                        <span>{ticket.assigneeName ?? "Unassigned"}</span>
                        <span className="font-mono text-[10px]">
                          {formatShortDate(ticket.dueAt)}
                        </span>
                        {isOverdue(ticket.dueAt) ? <OverdueBadge /> : null}
                      </div>
                    </div>
                    <PriorityBadge priority={ticket.priority} />
                    <label className="sr-only" htmlFor={`status-${ticket.id}`}>
                      Status for {ticket.title}
                    </label>
                    <select
                      id={`status-${ticket.id}`}
                      value={ticket.status}
                      onChange={(event) =>
                        move(ticket.id, event.target.value as TicketStatusId)
                      }
                      className="rounded-[10px] border border-border bg-surface-2 px-2 py-1.5 text-xs"
                    >
                      {TICKET_STATUSES.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Needs your review"
            action={
              <a
                href={`/${workspace}/meetings`}
                className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline"
              >
                All meetings
                <ArrowRight size={13} weight="bold" />
              </a>
            }
          >
            <ReviewList workspace={workspace} items={actionItems} limit={3} showBulk />
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Follow-ups"
            action={
              <a
                href={`/${workspace}/followups`}
                className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline"
              >
                All
                <ArrowRight size={13} weight="bold" />
              </a>
            }
          >
            {pending.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing scheduled. Prepo only chases work that has a date.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {pending.slice(0, 4).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0">
                    <Clock
                      size={15}
                      className="mt-0.5 shrink-0 text-accent-ink"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{entry.ticketTitle}</p>
                      <p className="mt-1 font-mono text-[10px] text-text-subtle">
                        {entry.ticketKey} · {entry.recipientName ?? "unassigned"} ·{" "}
                        {formatShortDate(entry.scheduledFor)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent meetings">
            <ul className="divide-y divide-border">
              {meetings.slice(0, 4).map((meeting) => (
                <li key={meeting.id} className="py-3 first:pt-0">
                  <a
                    href={`/${workspace}/meetings/${meeting.id}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium hover:text-accent-ink">
                        {meeting.title}
                      </p>
                      <p className="mt-1 text-xs text-text-subtle">
                        {formatShortDate(meeting.heldAt)} · {meeting.source}
                      </p>
                    </div>
                    {meeting.clarityScored ? (
                      <span
                        className={cn(
                          "shrink-0 font-mono text-sm",
                          meeting.clarityScore >= 70
                            ? "text-[#15803d] dark:text-[#4ade80]"
                            : meeting.clarityScore >= 45
                              ? "text-accent-ink"
                              : "text-[#b91c1c] dark:text-[#f87171]",
                        )}
                        title="Clarity score"
                      >
                        {meeting.clarityScore}
                      </span>
                    ) : (
                      <span
                        className="shrink-0 font-mono text-sm text-text-subtle"
                        title="No clarity score yet"
                      >
                        —
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={`/${workspace}/insights`}
              className="mt-4 inline-flex items-center gap-1 text-xs text-accent-ink hover:underline"
            >
              See insights
              <ArrowUpRight size={13} weight="bold" />
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
