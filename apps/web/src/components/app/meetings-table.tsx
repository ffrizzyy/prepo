"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { getMeetings, getActionItems, formatShortDate } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { Card, EmptyState } from "./page-header";

const SOURCE_LABEL: Record<string, string> = {
  recording: "Recording",
  upload: "Upload",
  paste: "Pasted",
};

export function MeetingsTable({ workspace }: { workspace: string }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("all");
  const meetings = getMeetings();

  const rows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return meetings
      .filter((meeting) => (source === "all" ? true : meeting.source === source))
      .filter((meeting) => meeting.title.toLowerCase().includes(value))
      .map((meeting) => {
        const items = getActionItems(meeting.id);
        return {
          meeting,
          proposed: items.length,
          ticketed: items.filter((item) => item.status === "ticketed").length,
        };
      });
  }, [meetings, query, source]);

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
            placeholder="Search meetings"
            aria-label="Search meetings"
            className="h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-text-subtle"
          />
        </div>
        <label className="sr-only" htmlFor="source-filter">
          Filter by source
        </label>
        <select
          id="source-filter"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm"
        >
          <option value="all">All sources</option>
          <option value="recording">Recording</option>
          <option value="upload">Upload</option>
          <option value="paste">Pasted</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No meetings match"
          description="Try a different search, or record your first meeting to get started."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-subtle">
                  <th className="px-5 py-3 font-medium">Meeting</th>
                  <th className="px-5 py-3 font-medium">Held</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Clarity</th>
                  <th className="px-5 py-3 font-medium">Necessity</th>
                  <th className="px-5 py-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ meeting, proposed, ticketed }) => (
                  <tr key={meeting.id} className="hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      <a
                        href={`/${workspace}/meetings/${meeting.id}`}
                        className="font-medium hover:text-accent-ink"
                      >
                        {meeting.title}
                      </a>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-muted">
                      {formatShortDate(meeting.heldAt)}
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {SOURCE_LABEL[meeting.source] ?? meeting.source}
                    </td>
                    <td className="px-5 py-3">
                      <Score value={meeting.clarityScore} />
                    </td>
                    <td className="px-5 py-3">
                      <Score value={meeting.necessityScore} invert />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-muted">
                      {ticketed}/{proposed}
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

function Score({ value, invert }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 45 : value >= 70;
  const mid = invert ? value <= 70 : value >= 45;
  return (
    <span
      className={cn(
        "font-mono text-sm",
        good
          ? "text-[#15803d] dark:text-[#4ade80]"
          : mid
            ? "text-accent-ink"
            : "text-[#b91c1c] dark:text-[#f87171]",
      )}
    >
      {value}
    </span>
  );
}
