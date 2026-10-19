"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Pause, Play, SpeakerHigh } from "@phosphor-icons/react";
import { formatTimestamp, type TranscriptSegment } from "@prepo/shared";
import type { MeetingAudioView, SpeakerLabelView } from "@/server/queries";
import { cn } from "@/lib/utils";
import { Card, EmptyState } from "./page-header";

/**
 * The transcript, with the recording it came from (PREPO.md §6.2).
 *
 * The synced player is the reason the audio route supports byte ranges: clicking
 * a line seeks, and the line under the playhead is highlighted as it goes. When
 * there is no audio, the seeded example is a real row whose bytes were never
 * shipped, the transcript still reads as a transcript, because that is the part
 * that survives retention anyway.
 */

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function clock(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TranscriptPanel({
  workspace,
  meetingId,
  audio,
  segments,
  speakers,
  members,
  retention,
}: {
  workspace: string;
  meetingId: string;
  audio: MeetingAudioView | null;
  segments: TranscriptSegment[];
  speakers: SpeakerLabelView[];
  members: { userId: string; name: string }[];
  retention: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);

  const playable = Boolean(audio?.available);
  const src = audio ? `/api/audio/${audio.id}` : undefined;

  const timed = useMemo(() => segments.some((segment) => segment.endMs > segment.startMs), [segments]);

  const activeId = useMemo(() => {
    if (!timed || !playable) return null;
    let active: string | null = null;
    for (const segment of segments) {
      if (segment.startMs <= currentMs) active = segment.id;
      else break;
    }
    return active;
  }, [segments, currentMs, timed, playable]);

  const seek = useCallback(
    (ms: number) => {
      const element = audioRef.current;
      if (!element || !playable) return;
      element.currentTime = ms / 1000;
      void element.play().catch(() => {});
    },
    [playable],
  );

  function toggle() {
    const element = audioRef.current;
    if (!element || !playable) return;
    if (element.paused) void element.play().catch(() => {});
    else element.pause();
  }

  function changeRate(next: number) {
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  if (segments.length === 0 && !audio) {
    return (
      <EmptyState
        title="No transcript stored"
        description="This meeting was imported as minutes, so there is no speaker-labelled transcript. The summary and actions are still available."
      />
    );
  }

  return (
    <div className="space-y-6">
      {audio ? (
        <Card title="Recording">
          {playable ? (
            <div className="flex flex-wrap items-center gap-4">
              <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onTimeUpdate={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                className="hidden"
              />
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause recording" : "Play recording"}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
              >
                {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
              </button>

              <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                <span className="font-mono text-xs text-text-subtle">{clock(currentMs)}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-150"
                    style={{
                      width: `${Math.min((currentMs / Math.max(audio.durationS ?? 0, 1) / 1000) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-xs text-text-subtle">
                  {audio.durationS ? clock(audio.durationS * 1000) : "--:--"}
                </span>
              </div>

              <div
                role="group"
                aria-label="Playback speed"
                className="inline-flex rounded-2 border border-border bg-surface-2 p-0.5 text-xs"
              >
                {RATES.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={rate === candidate}
                    onClick={() => changeRate(candidate)}
                    className={cn(
                      "rounded-1 px-2 py-1 transition-colors",
                      rate === candidate ? "bg-surface text-text" : "text-text-muted hover:text-text",
                    )}
                  >
                    {candidate}×
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-text-muted">
              The transcript is stored, but this meeting has no audio bytes to play. The seeded
              example is a real audio record whose file was never shipped, and retention also
              removes the bytes while leaving the transcript, this is what that looks like.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-text-subtle">
              {audio.consentName ? `Consent confirmed by ${audio.consentName}. ` : ""}
              {audio.deleteAfter
                ? `Audio deletes ${new Date(audio.deleteAfter).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
                : retention}
            </p>
            {audio.status !== "deleted" ? (
              <form action="/api/audio/delete" method="post">
                <input type="hidden" name="workspace" value={workspace} />
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="assetId" value={audio.id} />
                <button
                  type="submit"
                  className="rounded-1 border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
                >
                  Delete audio now
                </button>
              </form>
            ) : null}
          </div>

          {audio.status === "failed" ? (
            <form action="/api/audio/retry" method="post" className="mt-4">
              <input type="hidden" name="workspace" value={workspace} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="assetId" value={audio.id} />
              <button
                type="submit"
                className="rounded-2 border border-border-strong bg-surface px-4 py-2 text-sm transition-colors hover:bg-surface-2"
              >
                Retry transcription
              </button>
            </form>
          ) : null}

          {audio.status === "uploaded" ? (
            <div className="mt-4 rounded-2 border border-border bg-surface-2 p-3">
              <p className="text-xs leading-relaxed text-text-muted">
                Stored, waiting to be transcribed. Speech-to-text is not configured on this
                deployment, so nothing has been sent anywhere, upload or paste the transcript, or
                set <code className="font-mono text-[0.8em]">DEEPGRAM_API_KEY</code> and retry.
              </p>
              <form action="/api/audio/retry" method="post" className="mt-3">
                <input type="hidden" name="workspace" value={workspace} />
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="assetId" value={audio.id} />
                <button
                  type="submit"
                  className="rounded-1 border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
                >
                  Retry transcription
                </button>
              </form>
            </div>
          ) : null}
        </Card>
      ) : null}

      {speakers.length > 0 ? (
        <Card title="Speakers">
          <p className="text-xs leading-relaxed text-text-muted">
            Diarization returns labels, not names. Point each one at a person and every line
            carrying it is attributed at once.
          </p>
          <ul className="mt-4 space-y-3">
            {speakers.map((speaker) => (
              <li key={speaker.label}>
                <form
                  action="/api/meetings/speakers"
                  method="post"
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="workspace" value={workspace} />
                  <input type="hidden" name="meetingId" value={meetingId} />
                  <input type="hidden" name="label" value={speaker.label} />

                  <label className="min-w-[9rem] flex-1">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-text-subtle">
                      Label · {speaker.count} line{speaker.count === 1 ? "" : "s"}
                    </span>
                    <select
                      name="userId"
                      defaultValue={speaker.userId ?? ""}
                      className="mt-1 h-9 w-full rounded-2 border border-border bg-surface px-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-[9rem] flex-1">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-text-subtle">
                      Shown as
                    </span>
                    <input
                      name="renameTo"
                      defaultValue={speaker.label}
                      maxLength={80}
                      className="mt-1 h-9 w-full rounded-2 border border-border bg-surface px-2 text-sm"
                    />
                  </label>

                  <button
                    type="submit"
                    className="h-9 rounded-2 border border-border-strong bg-surface px-3 text-sm transition-colors hover:bg-surface-2"
                  >
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Transcript">
        {segments.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-muted">
            No transcript lines yet. The recording above is stored and safe; transcription needs a
            provider, and importing a transcript or pasting the minutes works right now.
          </p>
        ) : (
          <ol className="space-y-1">
          {segments.map((segment) => {
            const canSeek = playable && timed && segment.endMs > segment.startMs;
            const isActive = segment.id === activeId;

            return (
              <li key={segment.id}>
                <button
                  type="button"
                  disabled={!canSeek}
                  onClick={() => canSeek && seek(segment.startMs)}
                  aria-current={isActive}
                  className={cn(
                    "flex w-full gap-3 rounded-2 px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-accent-soft" : canSeek ? "hover:bg-surface-2" : "cursor-default",
                  )}
                >
                  <span className="w-24 shrink-0">
                    <span className="block text-xs font-medium">
                      {segment.speakerName ?? segment.speakerLabel}
                    </span>
                    {timed ? (
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-text-subtle">
                        <Play size={9} weight="fill" aria-hidden />
                        {formatTimestamp(segment.startMs)}
                      </span>
                    ) : (
                      <span className="mt-0.5 block font-mono text-[10px] text-text-subtle">
                        line {segment.idx + 1}
                      </span>
                    )}
                  </span>
                  <span className="text-sm leading-relaxed text-text-muted">{segment.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
        )}

        <p className="mt-6 flex items-center gap-2 text-xs text-text-subtle">
          <SpeakerHigh size={14} aria-hidden />
          {retention}
        </p>
      </Card>
    </div>
  );
}
