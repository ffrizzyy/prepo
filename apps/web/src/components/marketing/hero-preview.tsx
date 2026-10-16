"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import {
  SAMPLE_ACTION_ITEMS,
  formatTimestamp,
  segmentById,
} from "@prepo/shared";
import { Button } from "@/components/ui/button";
import { ActionItemCard } from "./action-item-card";

const PREVIEW_ITEMS = SAMPLE_ACTION_ITEMS.slice(0, 3);
const NEXT_KEYS = ["PRE-142", "PRE-143", "PRE-144", "PRE-145"];

export function HeroPreview() {
  const [tickets, setTickets] = useState<Record<string, string>>({});
  const approvedCount = Object.keys(tickets).length;
  const remaining = PREVIEW_ITEMS.length - approvedCount;

  const quotes = useMemo(
    () =>
      Object.fromEntries(
        PREVIEW_ITEMS.map((item) => {
          const segment = segmentById(item.sourceSegmentIds[0] ?? "");
          return [
            item.id,
            segment
              ? { text: segment.text, time: formatTimestamp(segment.startMs) }
              : null,
          ];
        }),
      ),
    [],
  );

  function approve(id: string) {
    setTickets((current) => {
      if (current[id]) return current;
      const key = NEXT_KEYS[Object.keys(current).length] ?? "PRE-149";
      return { ...current, [id]: key };
    });
  }

  function approveAll() {
    setTickets((current) => {
      const next = { ...current };
      PREVIEW_ITEMS.forEach((item) => {
        if (!next[item.id]) {
          const key = NEXT_KEYS[Object.keys(next).length] ?? "PRE-149";
          next[item.id] = key;
        }
      });
      return next;
    });
  }

  return (
    <div className="relative">
      <div className="rounded-3xl border border-border bg-surface-2/60 p-4 shadow-[0_24px_60px_-30px_rgb(0_0_0_/_0.3)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-2 rounded-full bg-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-subtle">
              Q4 Launch — Weekly Sync
            </span>
          </div>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent-ink">
            sample
          </span>
        </div>

        <div className="space-y-3">
          {PREVIEW_ITEMS.map((item, index) => {
            const ticketKey = tickets[item.id];
            const quote = quotes[item.id];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.15 + index * 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <ActionItemCard
                  item={item}
                  quote={quote?.text}
                  timestamp={quote?.time}
                  ticketKey={ticketKey}
                />
                {!ticketKey ? (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => approve(item.id)}>
                      Approve
                      <ArrowRight size={14} weight="bold" />
                    </Button>
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border px-1 pt-4">
          <p className="text-xs text-text-muted">
            {remaining > 0
              ? `${remaining} item${remaining === 1 ? "" : "s"} awaiting review`
              : "All items became tickets"}
          </p>
          {remaining > 1 ? (
            <Button size="sm" variant="ghost" onClick={approveAll}>
              <Check size={14} weight="bold" />
              Approve all
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
