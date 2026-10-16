"use client";

import { ArrowRight, Check, X } from "@phosphor-icons/react";
import { FLAG_COPY, formatTimestamp, segmentById } from "@prepo/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./badges";
import { useWorkspaceStore } from "./store";

export function ReviewList({
  meetingId,
  limit,
  showBulk,
}: {
  meetingId?: string;
  limit?: number;
  showBulk?: boolean;
}) {
  const { actionItems, approveActionItem, rejectActionItem, approveAllHighConfidence } =
    useWorkspaceStore();

  const items = actionItems.filter(
    (item) =>
      item.status === "proposed" && (meetingId ? item.meetingId === meetingId : true),
  );
  const shown = limit ? items.slice(0, limit) : items;
  const eligible = items.filter(
    (item) => item.confidence >= 0.85 && item.flags.length === 0,
  ).length;

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-subtle">
        Nothing waiting for review. You&apos;re caught up.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showBulk && eligible > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2 text-xs text-text-muted">
          <span>{eligible} high-confidence items can be approved at once</span>
          <Button size="sm" variant="outline" onClick={approveAllHighConfidence}>
            <Check size={13} weight="bold" />
            Approve all
          </Button>
        </div>
      ) : null}

      <ul className="space-y-3">
        {shown.map((item) => {
          const segment = segmentById(item.sourceSegmentIds[0] ?? "");
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{item.title}</p>
                <PriorityBadge priority={item.priority} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <span>{item.ownerName ?? "Unassigned"}</span>
                <span className="font-mono text-[10px] text-text-subtle">
                  {item.dueAt
                    ? new Date(item.dueAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "No date"}
                </span>
                <span className="font-mono text-[10px]">
                  {Math.round(item.confidence * 100)}% confidence
                </span>
              </div>

              {segment ? (
                <blockquote className="mt-3 rounded-[10px] border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-xs leading-relaxed text-text-muted">
                  “{segment.text}”
                  <span className="ml-1.5 font-mono text-[10px] text-accent-ink">
                    {formatTimestamp(segment.startMs)}
                  </span>
                </blockquote>
              ) : null}

              {item.flags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.flags.map((flag) => (
                    <span
                      key={flag}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px]",
                        flag === "possible_duplicate"
                          ? "border-accent/40 text-accent-ink"
                          : "border-border text-text-subtle",
                      )}
                    >
                      {FLAG_COPY[flag]}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" onClick={() => approveActionItem(item.id)}>
                  Approve
                  <ArrowRight size={13} weight="bold" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rejectActionItem(item.id)}
                >
                  <X size={13} />
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {limit && items.length > limit ? (
        <p className="pt-1 text-xs text-text-subtle">
          {items.length - limit} more waiting in Meetings → Actions.
        </p>
      ) : null}
    </div>
  );
}
