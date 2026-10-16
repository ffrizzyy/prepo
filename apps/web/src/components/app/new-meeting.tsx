"use client";

import { useState } from "react";
import {
  FileText,
  Microphone,
  TextT,
  UploadSimple,
} from "@phosphor-icons/react";
import { PIPELINE_STAGES } from "@prepo/shared";
import { Card } from "./page-header";
import { cn } from "@/lib/utils";

const SOURCES = [
  {
    id: "record",
    label: "Record in the app",
    body: "Mic everywhere, plus tab audio in Chromium browsers.",
    icon: Microphone,
  },
  {
    id: "audio",
    label: "Upload a recording",
    body: "mp3, m4a, wav, webm, ogg, or mp4.",
    icon: UploadSimple,
  },
  {
    id: "transcript",
    label: "Upload a transcript",
    body: "vtt, srt, txt, md, docx, or pdf.",
    icon: FileText,
  },
  {
    id: "paste",
    label: "Paste the minutes",
    body: "Drop in raw notes and let the agent structure them.",
    icon: TextT,
  },
];

export function NewMeeting({ workspace }: { workspace: string }) {
  const [source, setSource] = useState("record");
  const [consent, setConsent] = useState(false);
  const needsConsent = source === "record";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
                  name="source"
                  value={option.id}
                  checked={source === option.id}
                  onChange={() => setSource(option.id)}
                  className="sr-only"
                />
                <option.icon size={18} className="mt-0.5 shrink-0 text-accent-ink" />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {option.body}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-text-muted">Title</span>
            <input
              placeholder="Weekly product sync"
              className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm outline-none placeholder:text-text-subtle"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">Held on</span>
            <input
              type="date"
              className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm outline-none"
            />
          </label>
        </div>

        {needsConsent ? (
          <label className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 p-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-text-muted">
              Everyone in this meeting knows it is being recorded. Consent is stored with
              the audio and audio is deleted 30 days after transcription by default.
            </span>
          </label>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-accent-fg opacity-50"
          >
            Start processing
          </button>
          <p className="text-xs text-text-subtle">
            Ingest is wired to the backend in Milestone 3.
          </p>
        </div>
      </Card>

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
                  <p className="mt-0.5 text-xs text-text-muted">
                    {
                      [
                        "Audio lands in a private bucket via a presigned URL.",
                        "Deepgram returns speaker-labelled segments with timestamps.",
                        "Claude summarises, finds decisions, and lists open questions.",
                        "Action items are extracted as structured, evidence-linked output.",
                        "Owners are matched against the roster, and you review before tickets.",
                      ][index]
                    }
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Privacy">
          <p className="text-sm leading-relaxed text-text-muted">
            Transcripts are never used for training and never mixed across workspaces.
            You can delete a meeting and every derived artifact — transcript, tickets, and
            audio — from Settings.
          </p>
        </Card>
      </div>
    </div>
  );
}
