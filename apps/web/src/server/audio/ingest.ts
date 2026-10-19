import type { AudioStatus } from "../db/schema";
import { uuidv7 } from "../db/ids";
import { getTranscriptionUsage } from "../queries";
import * as w from "../writes";
import { retentionAfterTranscription, retentionDeleteAfter } from "./retention";
import { audioKey, audioStorage } from "./storage";
import {
  TranscriptionFailed,
  transcriptionCostUsd,
  transcriptionProvider,
  type TranscriptionProvider,
} from "./transcribe";
import { parsePlainText, parseTranscriptFile, speakerLabels } from "./transcript";
import {
  UploadRejected,
  validateAudio,
  validateTitle,
  validateTranscriptText,
} from "./validate";

/**
 * The ingest pipeline (PREPO.md §6.2), from bytes to stored transcript.
 *
 * The honest boundary: this runs inline in the request rather than in a durable
 * queue, because Inngest is not installed and the specification's workflow
 * engine is its own piece of infrastructure. Inline is correct for the file
 * sizes the caps allow; the step that is *not* here is extraction, which needs a
 * language model (milestone 7). So a recording that transcribes successfully
 * ends as a meeting with a speaker-labelled transcript and no proposed action
 * items yet, and the page says exactly that instead of implying otherwise.
 */

/** Per-workspace monthly ceiling, so a runaway upload cannot spend without end. */
export const DEFAULT_TRANSCRIPTION_MINUTES_CAP = 300;

export const NOT_CONFIGURED_DETAIL =
  "Audio stored. Speech-to-text is not configured on this deployment, so there is no transcript yet, upload or paste one instead, or set DEEPGRAM_API_KEY and retry.";

export type IngestAudioInput = {
  workspaceId: string;
  actorId: string;
  title: string;
  heldAt: Date;
  source: "recording" | "upload";
  filename: string;
  bytes: Uint8Array;
  /** Client-reported duration; the WAV header wins when it is available. */
  reportedDurationS?: number;
  retentionDays?: number;
  minutesCap?: number;
  /** Set false to store without transcribing (used by the test suite). */
  transcribe?: boolean;
};

export type IngestAudioOutcome = {
  meetingId: string;
  assetId: string;
  audioStatus: AudioStatus;
  transcribed: boolean;
  /** A sentence the interface can show as-is. */
  detail: string;
};

type TranscriptionOutcome = {
  audioStatus: AudioStatus;
  transcribed: boolean;
  detail: string;
};

async function runTranscription(input: {
  workspaceId: string;
  meetingId: string;
  assetId: string;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  retentionDays: number | undefined;
  provider: TranscriptionProvider;
  fallbackDurationS: number;
}): Promise<TranscriptionOutcome> {
  await w.setAudioStatus({
    workspaceId: input.workspaceId,
    assetId: input.assetId,
    status: "transcribing",
  });

  try {
    const result = await input.provider.transcribe({
      bytes: input.bytes,
      contentType: input.contentType,
      filename: input.filename,
    });

    const durationS = result.durationS ?? input.fallbackDurationS;
    const transcribedAt = new Date();

    await w.replaceTranscript({
      workspaceId: input.workspaceId,
      meetingId: input.meetingId,
      segments: result.segments,
    });

    await w.setAudioStatus({
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      status: "transcribed",
      durationS: Math.round(durationS),
      // "30 days after transcription" is measured from here, not from upload.
      deleteAfter: retentionAfterTranscription(input.retentionDays, transcribedAt),
    });

    await w.setMeetingStatus({
      workspaceId: input.workspaceId,
      meetingId: input.meetingId,
      status: "ready",
    });

    await w.recordSttRun({
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      provider: result.provider,
      status: "succeeded",
      durationS: Math.round(durationS),
      costUsd: transcriptionCostUsd(durationS),
    });

    return {
      audioStatus: "transcribed",
      transcribed: true,
      detail: `Transcribed ${result.segments.length} speaker-labelled segments with ${result.provider}. Splitting them into proposed actions is the extraction step, which needs a language model and is not configured here.`,
    };
  } catch (error) {
    const detail =
      error instanceof TranscriptionFailed
        ? error.message
        : `Transcription failed: ${(error as Error).message}`;

    await w.setAudioStatus({
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      status: "failed",
    });
    await w.setMeetingStatus({
      workspaceId: input.workspaceId,
      meetingId: input.meetingId,
      status: "failed",
    });
    await w.recordSttRun({
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      provider: input.provider.name,
      status: "failed",
      durationS: null,
      costUsd: null,
      detail,
    });

    return { audioStatus: "failed", transcribed: false, detail };
  }
}

export async function ingestAudio(input: IngestAudioInput): Promise<IngestAudioOutcome> {
  const title = validateTitle(input.title);
  const validated = validateAudio({
    filename: input.filename,
    bytes: input.bytes,
    reportedDurationS: input.reportedDurationS,
  });

  const now = new Date();
  const meetingId = uuidv7();
  const assetId = uuidv7();
  const storageKey = audioKey({
    workspaceId: input.workspaceId,
    assetId,
    extension: validated.format.extension,
  });

  await audioStorage().put(storageKey, input.bytes);

  try {
    await w.createMeetingFromAudio({
      meetingId,
      assetId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      title,
      heldAt: input.heldAt,
      source: input.source,
      storageKey,
      contentType: validated.format.contentType,
      sizeBytes: validated.sizeBytes,
      durationS: validated.durationS,
      deleteAfter: retentionDeleteAfter(input.retentionDays, now),
    });
  } catch (error) {
    // Never leave bytes behind for a row that was not written.
    await audioStorage().remove(storageKey).catch(() => {});
    throw error;
  }

  const provider = input.transcribe === false ? null : transcriptionProvider();
  if (!provider) {
    return {
      meetingId,
      assetId,
      audioStatus: "uploaded",
      transcribed: false,
      detail: NOT_CONFIGURED_DETAIL,
    };
  }

  const cap = input.minutesCap ?? DEFAULT_TRANSCRIPTION_MINUTES_CAP;
  const usage = await getTranscriptionUsage(input.workspaceId);
  if (usage.minutes + validated.durationS / 60 > cap) {
    return {
      meetingId,
      assetId,
      audioStatus: "uploaded",
      transcribed: false,
      detail: `This workspace has used ${Math.round(usage.minutes)} of its ${cap} transcription minutes this month, so this recording was stored but not sent to the provider. Upload the transcript instead, or raise the cap in Settings.`,
    };
  }

  const outcome = await runTranscription({
    workspaceId: input.workspaceId,
    meetingId,
    assetId,
    bytes: input.bytes,
    contentType: validated.format.contentType,
    filename: input.filename,
    retentionDays: input.retentionDays,
    provider,
    fallbackDurationS: validated.durationS,
  });

  return { meetingId, assetId, ...outcome };
}

export type IngestTranscriptInput = {
  workspaceId: string;
  actorId: string;
  title: string;
  heldAt: Date;
  /** Present when a file was uploaded; absent for pasted minutes. */
  filename?: string;
  text: string;
};

export type IngestTranscriptOutcome = {
  meetingId: string;
  segmentCount: number;
  speakers: string[];
  detail: string;
};

export async function ingestTranscript(
  input: IngestTranscriptInput,
): Promise<IngestTranscriptOutcome> {
  const title = validateTitle(input.title);
  const text = validateTranscriptText(input.text);
  const parsed = input.filename
    ? parseTranscriptFile(input.filename, text)
    : { format: "text" as const, segments: parsePlainText(text), speakers: [] };

  if (parsed.segments.length === 0) {
    throw new UploadRejected("No transcript lines were found in that text.");
  }

  const meetingId = uuidv7();

  await w.createMeetingFromText({
    meetingId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    title,
    heldAt: input.heldAt,
    source: input.filename ? "upload" : "paste",
    segments: parsed.segments,
  });

  const speakers = parsed.speakers.length > 0 ? parsed.speakers : speakerLabels(parsed.segments);
  const timed = parsed.segments.some((segment) => segment.timed);

  return {
    meetingId,
    segmentCount: parsed.segments.length,
    speakers,
    detail: timed
      ? `Imported ${parsed.segments.length} timed segments across ${speakers.length} speaker labels.`
      : `Imported ${parsed.segments.length} paragraphs of minutes. There is no timing to seek into, so quotes link to the line rather than to a moment.`,
  };
}

/** Retry for the failed state in PREPO.md §8.12. */
export async function retryTranscription(input: {
  workspaceId: string;
  meetingId: string;
  assetId: string;
  retentionDays?: number;
}): Promise<TranscriptionOutcome & { configured: boolean }> {
  const provider = transcriptionProvider();
  if (!provider) {
    return { configured: false, audioStatus: "uploaded", transcribed: false, detail: NOT_CONFIGURED_DETAIL };
  }

  const asset = await w.findAudioAsset({
    workspaceId: input.workspaceId,
    assetId: input.assetId,
  });
  if (!asset) {
    return { configured: true, audioStatus: "failed", transcribed: false, detail: "That recording is no longer stored." };
  }

  const bytes = await audioStorage().read(asset.r2Key).catch(() => null);
  if (!bytes) {
    return {
      configured: true,
      audioStatus: "failed",
      transcribed: false,
      detail: "The audio bytes are gone, retention may have deleted them. Upload the recording again or paste the transcript.",
    };
  }

  const outcome = await runTranscription({
    workspaceId: input.workspaceId,
    meetingId: input.meetingId,
    assetId: input.assetId,
    bytes,
    contentType: "audio/*",
    filename: asset.r2Key,
    retentionDays: input.retentionDays,
    provider,
    fallbackDurationS: asset.durationS ?? 0,
  });

  return { configured: true, ...outcome };
}
