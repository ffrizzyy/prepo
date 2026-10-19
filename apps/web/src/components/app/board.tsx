"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  TICKET_STATUSES,
  type Ticket,
  type TicketStatusId,
} from "@prepo/shared";
import { formatShortDate, isOverdue } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { moveTicket } from "@/server/actions";
import { PriorityBadge } from "./badges";

export function Board({
  workspace,
  tickets,
}: {
  workspace: string;
  tickets: Ticket[];
}) {
  const [optimisticTickets, applyMove] = useOptimistic(
    tickets,
    (state, move: { id: string; status: TicketStatusId }) =>
      state.map((ticket) =>
        ticket.id === move.id ? { ...ticket, status: move.status } : ticket,
      ),
  );
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TicketStatusId | null>(null);

  function move(id: string, status: TicketStatusId) {
    startTransition(async () => {
      applyMove({ id, status });
      await moveTicket({ workspace, ticketId: id, status });
    });
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid min-w-[880px] grid-cols-5 gap-4">
        {TICKET_STATUSES.map((column) => {
          const items = optimisticTickets.filter(
            (ticket) => ticket.status === column.id,
          );
          return (
            <section
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(column.id);
              }}
              onDragLeave={() =>
                setOver((value) => (value === column.id ? null : value))
              }
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || dragging;
                if (id) move(id, column.id);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "flex min-h-[60vh] flex-col rounded-3 border bg-surface-2/40",
                over === column.id ? "border-accent" : "border-border",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {column.label}
                </h2>
                <span className="font-mono text-[10px] text-text-subtle">
                  {items.length}
                </span>
              </header>

              <ul className="flex flex-1 flex-col gap-2 p-2">
                {items.map((ticket) => (
                  <li
                    key={ticket.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", ticket.id);
                      setDragging(ticket.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "cursor-grab rounded-2 border border-border bg-surface p-3 active:cursor-grabbing",
                      dragging === ticket.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={`/${workspace}/tickets/${ticket.key}`}
                        className="text-xs font-medium leading-snug hover:text-accent-ink"
                      >
                        {ticket.title}
                      </a>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-subtle">
                      <span>{ticket.key}</span>
                      <span>{ticket.assigneeName ?? "Unassigned"}</span>
                      <span
                        className={cn(
                          isOverdue(ticket.dueAt) &&
                            ticket.status !== "done" &&
                            "text-danger",
                        )}
                      >
                        {formatShortDate(ticket.dueAt)}
                      </span>
                    </div>

                    <label className="sr-only" htmlFor={`move-${ticket.id}`}>
                      Move {ticket.title}
                    </label>
                    <select
                      id={`move-${ticket.id}`}
                      value={ticket.status}
                      onChange={(event) =>
                        move(ticket.id, event.target.value as TicketStatusId)
                      }
                      className="mt-2.5 w-full rounded-1 border border-border bg-surface-2 px-2 py-1 text-[11px]"
                    >
                      {TICKET_STATUSES.map((status) => (
                        <option key={status.id} value={status.id}>
                          Move to {status.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}

                {items.length === 0 ? (
                  <li className="rounded-2 border border-dashed border-border px-3 py-6 text-center text-[11px] text-text-subtle">
                    Drop tickets here
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
