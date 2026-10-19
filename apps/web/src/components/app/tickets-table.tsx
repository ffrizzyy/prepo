"use client";

import { useMemo, useState } from "react";
import { ArrowsDownUp, MagnifyingGlass } from "@phosphor-icons/react";
import { PRIORITIES, TICKET_STATUSES, type Ticket } from "@prepo/shared";
import { formatShortDate, isOverdue } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { OverdueBadge, PriorityBadge, StatusBadge } from "./badges";
import { Card, EmptyState } from "./page-header";

type SortKey = "key" | "due" | "priority";

export function TicketsTable({
  workspace,
  tickets,
}: {
  workspace: string;
  tickets: Ticket[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("due");

  const rows = useMemo(() => {
    const value = query.trim().toLowerCase();
    const filtered = tickets
      .filter((ticket) => (status === "all" ? true : ticket.status === status))
      .filter((ticket) =>
        priority === "all" ? true : ticket.priority === priority,
      )
      .filter(
        (ticket) =>
          ticket.title.toLowerCase().includes(value) ||
          ticket.key.toLowerCase().includes(value) ||
          (ticket.assigneeName ?? "").toLowerCase().includes(value),
      );

    return filtered.sort((a, b) => {
      if (sort === "key") return a.key.localeCompare(b.key);
      if (sort === "priority") return a.priority.localeCompare(b.priority);
      return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
    });
  }, [tickets, query, status, priority, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:min-w-64">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tickets"
            aria-label="Search tickets"
            className="h-10 w-full rounded-2 border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-text-subtle"
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
          className="h-10 rounded-2 border border-border bg-surface px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {TICKET_STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          aria-label="Filter by priority"
          className="h-10 rounded-2 border border-border bg-surface px-3 text-sm"
        >
          <option value="all">All priorities</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {item.toUpperCase()}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="sort">
          Sort tickets
        </label>
        <div className="inline-flex items-center gap-2 rounded-2 border border-border bg-surface px-3">
          <ArrowsDownUp size={14} className="text-text-subtle" aria-hidden />
          <select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-10 bg-transparent text-sm"
          >
            <option value="due">Due date</option>
            <option value="key">Ticket ID</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No tickets match"
          description="Adjust the filters, or approve an action item to create your first ticket."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-subtle">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-5 py-3 font-medium">Ticket</th>
                  <th className="px-5 py-3 font-medium">Assignee</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-surface-2/50">
                    <td className="px-5 py-3 font-mono text-xs text-text-subtle">
                      {ticket.key}
                    </td>
                    <td className="px-5 py-3">
                      <a
                        href={`/${workspace}/tickets/${ticket.key}`}
                        className="font-medium hover:text-accent-ink"
                      >
                        {ticket.title}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {ticket.assigneeName ?? "Unassigned"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-5 py-3">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "font-mono text-xs",
                          isOverdue(ticket.dueAt) && ticket.status !== "done"
                            ? "text-danger"
                            : "text-text-muted",
                        )}
                      >
                        {formatShortDate(ticket.dueAt)}
                      </span>
                      {isOverdue(ticket.dueAt) && ticket.status !== "done" ? (
                        <OverdueBadge className="ml-2" />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
