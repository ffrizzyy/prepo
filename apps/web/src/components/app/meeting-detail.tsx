"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpeakerHigh } from "@phosphor-icons/react";
import type { TranscriptSegment } from "@prepo/shared";
import { formatDate } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import type {
  ActionItemView,
  MeetingAudioView,
  MeetingView,
  SpeakerLabelView,
} from "@/server/queries";
import type { MeetingDeletionImpact } from "@/server/writes";
import { ScoreMeter } from "./badges";
import { DeleteMeeting } from "./delete-meeting";
import { ExtractButton } from "./extract-button";
import { Card } from "./page-header";
import { ReviewList } from "./review-list";
import { TranscriptPanel } from "./transcript-panel";

const TABS = ["Summary", "Actions", "Transcript", "Activity"] as const;
export type MeetingTab = (typeof TABS)[number];

/**
 * The tab lives in the URL, so a redirect back from the speaker form (or from a
 * retry) can land on the transcript instead of resetting to the summary.
 */
function tabToParam(tab: MeetingTab): string {
  return tab.toLowerCase();
}

export function MeetingDetail({
  workspace,
  meeting,
  segments,
  actionItems,
  audio,
  speakers,
  members,
  initialTab = "Summary",
  notice,
  retention,
  extraction,
  canExtract,
  impact,
  canDelete,
}: {
  workspace: string;
  meeting: MeetingView;
  segments: TranscriptSegment[];
  actionItems: ActionItemView[];
  audio: MeetingAudioView | null;
  speakers: SpeakerLabelView[];
  members: { userId: string; name: string }[];
  initialTab?: MeetingTab;
  notice?: string;
  retention: string;
  /** Whether the extraction provider is configured, and why not when it is not. */
  extraction: { ready: boolean; reason: string | null };
  /** Viewers can read the meeting but cannot spend a model call on it. */
  canExtract: boolean;
  /** Real counts of what a delete would remove, for the confirmation panel. */
  impact: MeetingDeletionImpact | null;
  /** Owner or admin, and not a viewer: the same gate as destroying anything else. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<MeetingTab>(initialTab);

  const meetingItems = actionItems.filter((item) => item.meetingId === meeting.id);
  const proposed = meetingItems.filter((item) => item.status === "proposed").length;

  function chooseTab(next: MeetingTab) {
    setTab(next);
    router.replace(`/${workspace}/meetings/${meeting.id}?tab=${tabToParam(next)}`, {
      scroll: false,
    });
  }

  const activity = [
    {
      who: "prepo",
      what: audio
        ? audio.status === "transcribed"
          ? `Stored the recording and attached ${segments.length} speaker-labelled segments.`
          : audio.status === "deleted"
            ? "Deleted the audio on request. The transcript and everything derived from it remain."
            : segments.length
              ? `Stored the recording and attached ${segments.length} segments from an imported transcript.`
              : "Stored the recording."
        : segments.length
          ? `Imported ${segments.length} segments from a transcript or minutes.`
          : "Imported minutes, with no transcript segments stored.",
      when: formatDate(meeting.heldAt),
    },
    {
      who: "prepo",
      what: meeting.summary
        ? `Extracted ${meetingItems.length} action items with source quotes.`
        : meetingItems.length
          ? `${meetingItems.length} action items are attached to this meeting.`
          : "No action items have been extracted for this meeting.",
      when: formatDate(meeting.heldAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <a href={`/${workspace}/meetings`} className="text-xs text-text-subtle hover:text-text">
          ← Meetings
        </a>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">{meeting.title}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {formatDate(meeting.heldAt)} · {meeting.source} · {segments.length} segments
        </p>
      </div>

      {notice ? (
        <p className="rounded-3 border border-border bg-surface p-4 text-sm leading-relaxed text-text-muted">
          {notice}
        </p>
      ) : null}

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
            onClick={() => chooseTab(item)}
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
            {meeting.summary ? (
              <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">
                {meeting.summary}
              </p>
            ) : !extraction.ready ? (
              <div className="max-w-[65ch]">
                <p className="text-sm leading-relaxed text-text-muted">
                  No summary was produced for this meeting. Summaries come from the extraction
                  step, which needs a language model and is not configured on this deployment.
                  The transcript on the next tab is complete and quotable.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-text-subtle">
                  {extraction.reason}. Set both values in{" "}
                  <code className="font-mono">apps/web/.env.local</code>; until then nothing is
                  sent anywhere.
                </p>
              </div>
            ) : segments.length === 0 ? (
              <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">
                No minutes yet. Extraction reads a transcript, and this meeting does not have
                one. Upload or paste it on the next tab first.
              </p>
            ) : (
              <div className="max-w-[65ch]">
                <p className="text-sm leading-relaxed text-text-muted">
                  No minutes yet. Extraction reads the {segments.length} transcript segments on
                  the next tab and writes a summary, the decisions, and action items that cite
                  them.
                </p>
                {!canExtract ? (
                  <p className="mt-3 text-xs text-text-subtle">
                    You can read this meeting. A member with edit access can run extraction.
                  </p>
                ) : null}
              </div>
            )}
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
            {extraction.ready && canExtract && segments.length > 0 ? (
              <Card title="Extraction">
                <p className="text-sm leading-relaxed text-text-muted">
                  {meeting.summary
                    ? "Run extraction again. Proposed items from the previous run are replaced; ticketed and rejected items are kept."
                    : "Read the transcript and draft the minutes and action items. Every item has to cite a transcript segment."}
                </p>
                <ExtractButton
                  workspace={workspace}
                  meetingId={meeting.id}
                  hasSummary={Boolean(meeting.summary)}
                />
              </Card>
            ) : null}
            <Card title="Scores">
              <div className="space-y-5">
                <ScoreMeter
                  label="Clarity"
                  value={meeting.clarityScored ? meeting.clarityScore : null}
                  hint="Computed from the extracted items: owners 45%, deadlines 35%, a settled decision 20%."
                />
                <ScoreMeter
                  label="Necessity"
                  invert
                  value={meeting.necessityScored ? meeting.necessityScore : null}
                  hint="How much of this meeting restates earlier ones: the share of its action items and decisions that match an earlier meeting's. Higher is more redundant. Scored by the necessity pass, which runs after extraction and can be re-run with db:necessity."
                />
              </div>
            </Card>
            <Card title="Recap">
              <p className="text-sm text-text-muted">
                Share a signed, expiring read-only recap of the approved summary and actions. Audio
                is never included. Public recap links are not built yet. This is the milestone
                that adds them.
              </p>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "Actions" ? <ReviewList workspace={workspace} items={meetingItems} showBulk /> : null}

      {tab === "Transcript" ? (
        <TranscriptPanel
          workspace={workspace}
          meetingId={meeting.id}
          audio={audio}
          segments={segments}
          speakers={speakers}
          members={members}
          retention={retention}
        />
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
            {retention}
          </p>
        </Card>
      ) : null}

      {/* Kept outside the tabs on purpose: it is always reachable, and it never
          looks like part of the meeting's content. */}
      <section className="border-t border-border pt-6">
        <h2 className="text-sm font-medium">Delete this meeting</h2>
        <div className="mt-2">
          <DeleteMeeting
            workspace={workspace}
            meetingId={meeting.id}
            impact={impact}
            canDelete={canDelete}
          />
        </div>
      </section>
    </div>
  );
}
