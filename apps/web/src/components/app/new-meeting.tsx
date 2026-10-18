"use client";

import { useState } from "react";
import { FileText, Microphone, TextT, UploadSimple, Warning } from "@phosphor-icons/react";
import { PIPELINE_STAGES } from "@prepo/shared";
import { Card } from "./page-header";
import { Recorder } from "./recorder";
import { cn } from "@/lib/utils";

/**
 * Ingest. Each of the four routes is a real form post to a route handler, so the
 * three that do not need a microphone work with JavaScript switched off; the
 * recorder needs JavaScript by definition and posts in pieces.
 */

const SOURCES = [
  {
    id: "record",
    label: "Record in the app",
    body: "Microphone, with pause and a level meter.",
    icon: Microphone,
    needsConsent: true,
  },
  {
    id: "audio",
    label: "Upload a recording",
    body: "mp3, m4a, wav, webm, ogg, or mp4.",
    icon: UploadSimple,
    needsConsent: true,
  },
  {
    id: "transcript",
    label: "Upload a transcript",
    body: "vtt, srt, txt, or md.",
    icon: FileText,
    needsConsent: false,
  },
  {
    id: "paste",
    label: "Paste the minutes",
    body: "Drop in raw notes; paragraphs become quotable lines.",
    icon: TextT,
    needsConsent: false,
  },
] as const;

const STAGE_NOTES = [
  "Bytes are checked by sniffing, not by the extension, and capped at 25 MB.",
  "Deepgram returns speaker-labelled segments with timestamps. It is not configured on this deployment, so a transcript can be uploaded or pasted instead.",
  "A language model summarises and finds decisions. Not configured in this build, so a new import lands with its transcript and no summary yet.",
  "Evidence-linked action items. No source quote, no ticket.",
  "Owners are matched against the roster and you review before anything becomes a ticket.",
];

export function NewMeeting({
  workspace,
  notice,
  error,
}: {
  workspace: string;
  notice?: string;
  error?: string;
}) {
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("record");
  const [consent, setConsent] = useState(false);
  const [title, setTitle] = useState("");
  const [heldAt, setHeldAt] = useState("");

  const selected = SOURCES.find((option) => option.id === source)!;
  const action = source === "audio" ? "/api/uploads/audio" : "/api/uploads/transcript";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {error ? (
          <p className="flex items-start gap-2 rounded-2xl border border-accent-note bg-accent-soft p-4 text-sm text-accent-ink">
            <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-muted">
            {notice}
          </p>
        ) : null}

        <Card title="How are you bringing this meeting in?">
          <fieldset>
            <legend className="sr-only">Meeting source</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOURCES.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-[10px] border p-3 transition-colors",
                    source === option.id
                      ? "border-accent bg-accent-soft/50"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="source-picker"
                    value={option.id}
                    checked={source === option.id}
                    onChange={() => setSource(option.id)}
                    className="sr-only"
                  />
                  <option.icon size={18} className="mt-0.5 shrink-0 text-accent-ink" />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-text-muted">{option.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <form action={action} method="post" encType="multipart/form-data" className="mt-6">
            <input type="hidden" name="workspace" value={workspace} />
            {source === "record" || source === "audio" ? (
              <input type="hidden" name="source" value={source} />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-text-muted">Title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Weekly product sync"
                  className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm placeholder:text-text-subtle"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Held on</span>
                <input
                  type="date"
                  name="heldAt"
                  value={heldAt}
                  onChange={(event) => setHeldAt(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm"
                />
              </label>
            </div>

            {selected.needsConsent ? (
              <label className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 p-3 text-sm">
                <input
                  type="checkbox"
                  name="consent"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-text-muted">
                  Everyone in this meeting knows it is being recorded. Consent is stored with the
                  audio, and audio is deleted on this workspace&rsquo;s retention schedule.
                </span>
              </label>
            ) : null}

            <div className="mt-6">
              {source === "record" ? (
                <Recorder workspace={workspace} consent={consent} title={title} heldAt={heldAt} />
              ) : null}

              {source === "audio" ? (
                <>
                  <input
                    type="file"
                    name="file"
                    required
                    accept=".mp3,.m4a,.wav,.webm,.ogg,.mp4,audio/*"
                    className="block w-full cursor-pointer rounded-[10px] border border-dashed border-border bg-surface-2 px-3 py-6 text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm"
                  />
                  <p className="mt-2 text-xs text-text-subtle">
                    Up to 25 MB and three hours. The format is decided by the file&rsquo;s own
                    bytes, so a renamed file is rejected rather than trusted.
                  </p>
                </>
              ) : null}

              {source === "transcript" ? (
                <>
                  <input
                    type="file"
                    name="file"
                    required
                    accept=".vtt,.srt,.txt,.md"
                    className="block w-full cursor-pointer rounded-[10px] border border-dashed border-border bg-surface-2 px-3 py-6 text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm"
                  />
                  <p className="mt-2 text-xs text-text-subtle">
                    Zoom, Meet and Teams all export WebVTT or SRT, which keep their timestamps and
                    speaker labels. A Word or PDF export should be pasted instead — Prepo quotes
                    from text, and it cannot quote a binary.
                  </p>
                </>
              ) : null}

              {source === "paste" ? (
                <>
                  <textarea
                    name="text"
                    rows={12}
                    required
                    placeholder={"Lena: We should ship the billing rewrite before the board meeting.\nDmitri: I'll take the migration, due Friday."}
                    className="block w-full rounded-[10px] border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed placeholder:text-text-subtle"
                  />
                  <p className="mt-2 text-xs text-text-subtle">
                    A line that starts with <code className="font-mono">Name:</code> becomes a
                    speaker label; every other paragraph becomes a quotable line of its own.
                  </p>
                </>
              ) : null}
            </div>

            {source !== "record" ? (
              <button
                type="submit"
                disabled={selected.needsConsent && !consent}
                className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-50"
              >
                {source === "audio"
                  ? "Upload and transcribe"
                  : source === "transcript"
                    ? "Import transcript"
                    : "Import minutes"}
              </button>
            ) : null}
          </form>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="What happens next">
          <ol className="space-y-4">
            {PIPELINE_STAGES.map((stage, index) => (
              <li key={stage} className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-text-muted">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{stage}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{STAGE_NOTES[index]}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Privacy">
          <p className="text-sm leading-relaxed text-text-muted">
            Audio is stored privately and is reachable only through an authorization check — there
            is no public link, and the player streams through the app so byte ranges can be served
            for seeking. It is deleted on this workspace&rsquo;s retention schedule, transcript
            included only when the meeting itself is deleted.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            The only provider involved is the speech-to-text service, and it is not configured on
            this deployment: nothing is sent anywhere today. Transcripts are never used for
            training and never mixed across workspaces.
          </p>
        </Card>
      </div>
    </div>
  );
}
