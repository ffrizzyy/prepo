"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone, Pause, Play, Stop, Trash } from "@phosphor-icons/react";

/**
 * In-browser recording (PREPO.md §6.1).
 *
 * Mic capture via `MediaRecorder` with pause/resume, a visible timer and a level
 * meter. The take is posted in pieces, so a dropped connection costs one piece
 * instead of the whole meeting; the server stages them and assembles on the final
 * piece.
 *
 * Tab audio (`getDisplayMedia`) is in the specification and is not here: it is
 * Chromium-only and needs a picker flow of its own, so the honest position is
 * that this records the microphone and says so.
 */

const PIECE_BYTES = 2 * 1024 * 1024;

function preferredMimeType(): { mimeType: string; extension: string } {
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: "audio/webm;codecs=opus", extension: ".webm" },
    { mimeType: "audio/webm", extension: ".webm" },
    { mimeType: "audio/mp4", extension: ".m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: ".ogg" },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return { mimeType: "", extension: ".webm" };
}

function xhrUpload(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => resolve({ ok: false, status: 0, body: "Network error" });
    request.onload = () => resolve({ ok: request.status < 400, status: request.status, body: request.responseText });
    request.send(form);
  });
}

export function Recorder({
  workspace,
  consent,
  title,
  heldAt,
}: {
  workspace: string;
  consent: boolean;
  title: string;
  heldAt: string;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "paused" | "uploading" | "error">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const uploadIdRef = useRef<string>("");
  const extensionRef = useRef<string>(".webm");

  // The timer and the meter are driven from one animation frame loop so the
  // component does not re-render on every audio sample.
  useEffect(() => {
    if (phase !== "recording") return;

    let frame = 0;
    const tick = () => {
      if (lastTickRef.current !== null) {
        elapsedRef.current += performance.now() - lastTickRef.current;
      }
      lastTickRef.current = performance.now();
      setElapsedMs(Math.round(elapsedRef.current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      lastTickRef.current = null;
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { mimeType, extension } = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      elapsedRef.current = 0;
      setElapsedMs(0);
      setBytes(0);
      uploadIdRef.current = `${crypto.randomUUID()}`;
      extensionRef.current = extension;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          setBytes((current) => current + event.data.size);
        }
      };

      // A simple meter: the analyser is read in the same frame loop as the timer.
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        if (!recorderRef.current || recorderRef.current.state === "inactive") {
          void context.close();
          return;
        }
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
        if (meterRef.current) meterRef.current.style.width = `${Math.min(peak * 140, 100)}%`;
        requestAnimationFrame(draw);
      };
      draw();

      recorder.start(1000);
      setPhase("recording");
    } catch {
      setMessage("Microphone access was refused, so nothing was recorded. Upload a file or paste the minutes instead.");
      setPhase("error");
    }
  }

  function pause() {
    recorderRef.current?.pause();
    setPhase("paused");
  }

  function resume() {
    recorderRef.current?.resume();
    setPhase("recording");
  }

  function discard() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    chunksRef.current = [];
    recorderRef.current = null;
    elapsedRef.current = 0;
    setElapsedMs(0);
    setBytes(0);
    setPhase("idle");
  }

  async function stopAndUpload() {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const extension = extensionRef.current;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((track) => track.stop());
    setPhase("uploading");
    setProgress(0);

    const durationS = Math.round(elapsedRef.current / 1000);
    const pieces = Math.max(Math.ceil(blob.size / PIECE_BYTES), 1);

    for (let index = 0; index < pieces; index += 1) {
      const piece = blob.slice(index * PIECE_BYTES, (index + 1) * PIECE_BYTES);
      const final = index === pieces - 1;

      const form = new FormData();
      form.set("workspace", workspace);
      form.set("uploadId", uploadIdRef.current);
      form.set("index", String(index));
      form.set("final", final ? "1" : "0");
      form.set("totalBytes", String(blob.size));
      form.set("title", title || "Recorded meeting");
      form.set("heldAt", heldAt);
      form.set("source", "recording");
      form.set("consent", "on");
      form.set("durationS", String(durationS));
      form.set("file", piece, `recording${extension}.part`);

      const result = await xhrUpload("/api/uploads/audio/chunk", form, (fraction) => {
        setProgress(Math.round(((index + fraction) / pieces) * 100));
      });

      if (!result.ok) {
        let detail = "The recording could not be uploaded.";
        try {
          detail = (JSON.parse(result.body) as { error?: string }).error ?? detail;
        } catch {
          // A non-JSON error body is still an error; keep the default wording.
        }
        setMessage(detail);
        setPhase("error");
        return;
      }

      if (final) {
        const parsed = JSON.parse(result.body) as { location?: string };
        window.location.assign(parsed.location ?? `/${workspace}/meetings`);
        return;
      }
    }
  }

  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className="rounded-[10px] border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-accent-ink"
          aria-hidden
        >
          <Microphone size={16} weight={phase === "recording" ? "fill" : "regular"} />
        </span>

        <span
          className="font-mono text-lg tabular-nums"
          aria-live="polite"
          aria-label="Recording time"
        >
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>

        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-surface">
          <div ref={meterRef} className="h-full w-0 rounded-full bg-accent transition-[width] duration-75" />
        </div>

        <span className="font-mono text-[10px] text-text-subtle">
          {(bytes / 1024 / 1024).toFixed(1)} MB
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {phase === "idle" || phase === "error" ? (
          <button
            type="button"
            onClick={start}
            disabled={!consent}
            title={consent ? undefined : "Confirm consent first"}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            <Microphone size={15} weight="bold" />
            Start recording
          </button>
        ) : null}

        {phase === "recording" ? (
          <>
            <button
              type="button"
              onClick={pause}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-sm"
            >
              <Pause size={14} weight="bold" />
              Pause
            </button>
            <button
              type="button"
              onClick={stopAndUpload}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              <Stop size={14} weight="fill" />
              Stop and upload
            </button>
          </>
        ) : null}

        {phase === "paused" ? (
          <>
            <button
              type="button"
              onClick={resume}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-sm"
            >
              <Play size={14} weight="fill" />
              Resume
            </button>
            <button
              type="button"
              onClick={stopAndUpload}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              <Stop size={14} weight="fill" />
              Stop and upload
            </button>
          </>
        ) : null}

        {phase === "recording" || phase === "paused" ? (
          <button
            type="button"
            onClick={discard}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-sm text-text-muted hover:text-text"
          >
            <Trash size={14} />
            Discard
          </button>
        ) : null}

        {phase === "uploading" ? (
          <div className="flex w-full items-center gap-3">
            <span className="text-sm text-text-muted">Uploading…</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-text-subtle">{progress}%</span>
          </div>
        ) : null}
      </div>

      {!consent ? (
        <p className="mt-3 text-xs text-text-subtle">
          Confirm the consent checkbox above before recording. It is stored with the audio.
        </p>
      ) : null}

      {message ? <p className="mt-3 text-xs text-accent-ink">{message}</p> : null}
    </div>
  );
}
