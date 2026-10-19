"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowRight, Check, X } from "@phosphor-icons/react";
import { FLAG_COPY, formatTimestamp } from "@prepo/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { approveActionItems, rejectActionItem } from "@/server/actions";
import type { ActionItemView } from "@/server/queries";
import { PriorityBadge } from "./badges";

const HIGH_CONFIDENCE = 0.85;

export function ReviewList({
  workspace,
  items,
  limit,
  showBulk,
}: {
  workspace: string;
  items: ActionItemView[];
  limit?: number;
  showBulk?: boolean;
}) {
  // Approving or rejecting removes the card immediately; the server action and
  // the revalidation that follows make it permanent.
  const [optimistic, apply] = useOptimistic(
    items,
    (state, removedIds: string[]) =>
      state.filter((item) => !removedIds.includes(item.id)),
  );
  const [, startTransition] = useTransition();

  function approve(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      apply(ids);
      await approveActionItems({ workspace, actionItemIds: ids });
    });
  }

  function reject(id: string) {
    startTransition(async () => {
      apply([id]);
      await rejectActionItem({ workspace, actionItemId: id });
    });
  }

  const proposed = optimistic.filter((item) => item.status === "proposed");
  const shown = limit ? proposed.slice(0, limit) : proposed;
  const eligible = proposed.filter(
    (item) => item.confidence >= HIGH_CONFIDENCE && item.flags.length === 0,
  );

  if (proposed.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-subtle">
        Nothing waiting for review. You&apos;re caught up.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showBulk && eligible.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2 bg-surface-2 px-3 py-2 text-xs text-text-muted">
          <span>
            {eligible.length} high-confidence items can be approved at once
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => approve(eligible.map((item) => item.id))}
          >
            <Check size={13} weight="bold" />
            Approve all
          </Button>
        </div>
      ) : null}

      <ul className="space-y-3">
        {shown.map((item) => (
          <li
            key={item.id}
            className="rounded-3 border border-border bg-surface p-4"
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

            {item.sourceQuote ? (
              <blockquote className="mt-3 rounded-2 border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-xs leading-relaxed text-text-muted">
                “{item.sourceQuote}”
                {item.sourceQuoteAtMs !== null ? (
                  <span className="ml-1.5 font-mono text-[10px] text-accent-ink">
                    {formatTimestamp(item.sourceQuoteAtMs)}
                  </span>
                ) : null}
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
              <Button size="sm" onClick={() => approve([item.id])}>
                Approve
                <ArrowRight size={13} weight="bold" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reject(item.id)}>
                <X size={13} />
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {limit && proposed.length > limit ? (
        <p className="pt-1 text-xs text-text-subtle">
          {proposed.length - limit} more waiting in Meetings → Actions.
        </p>
      ) : null}
    </div>
  );
}
