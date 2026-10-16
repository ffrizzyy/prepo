"use client";

import { useState } from "react";
import { Play, SpeakerHigh } from "@phosphor-icons/react";
import { formatTimestamp, type TranscriptSegment } from "@prepo/shared";
import { formatDate } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import type { ActionItemView, MeetingView } from "@/server/queries";
import { ScoreMeter } from "./badges";
import { Card, EmptyState } from "./page-header";
import { ReviewList } from "./review-list";

const TABS = ["Summary", "Actions", "Transcript", "Activity"] as const;
type Tab = (typeof TABS)[number];

export function MeetingDetail({
  workspace,
  meeting,
  segments,
  actionItems,
}: {
  workspace: string;
  meeting: MeetingView;
  segments: TranscriptSegment[];
  actionItems: ActionItemView[];
}) {
  const [tab, setTab] = useState<Tab>("Summary");
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  const meetingItems = actionItems.filter((item) => item.meetingId === meeting.id);
  const proposed = meetingItems.filter((item) => item.status === "proposed").length;

  const activity = [
    {
      who: "prepo-agent",
      what: segments.length
        ? `Transcribed audio and linked ${segments.length} segments.`
        : "Imported minutes — no audio to transcribe.",
      when: formatDate(meeting.heldAt),
    },
    {
      who: "prepo-agent",
      what: `Extracted ${meetingItems.length} action items with source quotes.`,
      when: formatDate(meeting.heldAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <a
          href={`/${workspace}/meetings`}
          className="text-xs text-text-subtle hover:text-text"
        >
          ← Meetings
        </a>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">{meeting.title}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {formatDate(meeting.heldAt)} · {meeting.source} · {segments.length} segments
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Meeting views"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === item
                ? "border-accent font-medium text-text"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {item}
            {item === "Actions" && proposed > 0 ? (
              <span className="ml-2 rounded-full bg-accent px-1.5 font-mono text-[10px] text-accent-fg">
                {proposed}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "Summary" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card title="Summary">
            <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">
              {meeting.summary || "No summary was produced for this meeting."}
            </p>
            {meeting.keyDecisions.length > 0 ? (
              <>
                <h3 className="mt-6 text-sm font-medium">Key decisions</h3>
                <ul className="mt-2 space-y-2">
                  {meeting.keyDecisions.map((decision) => (
                    <li key={decision} className="flex gap-2 text-sm text-text-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      {decision}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {meeting.openQuestions.length > 0 ? (
              <>
                <h3 className="mt-6 text-sm font-medium">Open questions</h3>
                <ul className="mt-2 space-y-2">
                  {meeting.openQuestions.map((question) => (
                    <li key={question} className="flex gap-2 text-sm text-text-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-text-subtle" />
                      {question}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <div className="space-y-6">
            <Card title="Scores">
              <div className="space-y-5">
                <ScoreMeter
                  label="Clarity"
                  value={meeting.clarityScore}
                  hint="How well the minutes name owners, dates, and decisions."
                />
                <ScoreMeter
                  label="Necessity"
                  value={meeting.necessityScore}
                  hint="Higher means the meeting likely repeated earlier ones."
                />
              </div>
            </Card>
            <Card title="Recap">
              <p className="text-sm text-text-muted">
                Share a signed, expiring read-only recap of the approved summary and
                actions. Audio is never included.
              </p>
              <button
                type="button"
                className="mt-4 w-full rounded-[10px] border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-surface-2"
              >
                Create recap link
              </button>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "Actions" ? (
        <ReviewList workspace={workspace} items={meetingItems} showBulk />
      ) : null}

      {tab === "Transcript" ? (
        segments.length === 0 ? (
          <EmptyState
            title="No transcript stored"
            description="This meeting was imported as minutes, so there is no speaker-labelled transcript. The summary and actions are still available."
          />
        ) : (
          <Card title="Transcript">
            <ol className="space-y-1">
              {segments.map((segment) => (
                <li key={segment.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSegment(segment.id)}
                    aria-current={activeSegment === segment.id}
                    className={cn(
                      "flex w-full gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors",
                      activeSegment === segment.id
                        ? "bg-accent-soft"
                        : "hover:bg-surface-2",
                    )}
                  >
                    <span className="w-24 shrink-0">
                      <span className="block text-xs font-medium">
                        {segment.speakerName ?? segment.speakerLabel}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-text-subtle">
                        <Play size={9} weight="fill" aria-hidden />
                        {formatTimestamp(segment.startMs)}
                      </span>
                    </span>
                    <span className="text-sm leading-relaxed text-text-muted">
                      {segment.text}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        )
      ) : null}

      {tab === "Activity" ? (
        <Card title="Activity">
          <ol className="space-y-4">
            {activity.map((event) => (
              <li key={event.what} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-sm">{event.what}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-text-subtle">
                    {event.who} · {event.when}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-xs text-text-subtle">
            <SpeakerHigh size={14} aria-hidden />
            Audio is deleted 30 days after transcription by default.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
