import { parseTimestampMs, type ParsedSegment } from "./transcript";

/**
 * Speech-to-text behind an interface (PREPO.md §6.2: "so another speech-to-text
 * service can replace Deepgram without touching the pipeline").
 *
 * The specification's provider is Deepgram, chosen for diarization and word
 * timestamps, and that is what is implemented below. It needs `DEEPGRAM_API_KEY`,
 * which this repository does not have, so the pipeline reports itself as
 * unconfigured and offers the transcript-upload path instead — that path needs no
 * provider at all.
 *
 * Note the shape of the input: bytes, not a URL. The specification's signature
 * takes an `audioUrl` because R2 hands out presigned links; this storage driver is
 * local and private, so handing over bytes is both simpler and strictly safer —
 * the provider never has to fetch a URL, which is what keeps the SSRF surface
 * closed (PREPO.md §9.3 A10).
 */

export type TranscriptionInput = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
};

export type TranscriptionResult = {
  provider: string;
  model: string;
  language: string | null;
  confidence: number | null;
  durationS: number | null;
  segments: ParsedSegment[];
};

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

export const DEEPGRAM_MODEL = "nova-3";

/** Thrown when transcription is asked for but no provider is configured. */
export class TranscriptionNotConfigured extends Error {
  constructor() {
    super(
      "Speech-to-text is not configured. Set DEEPGRAM_API_KEY, or upload/paste the transcript instead.",
    );
    this.name = "TranscriptionNotConfigured";
  }
}

export class TranscriptionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionFailed";
  }
}

/* ------------------------------------------------------- provider response */

type DeepgramWord = { word?: string; start?: number; end?: number; speaker?: number };
type DeepgramUtterance = {
  start?: number;
  end?: number;
  confidence?: number;
  transcript?: string;
  speaker?: number;
  words?: DeepgramWord[];
};
type DeepgramPayload = {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      detected_language?: string;
      alternatives?: { confidence?: number; transcript?: string; words?: DeepgramWord[] }[];
    }[];
    utterances?: DeepgramUtterance[];
  };
};

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Deepgram's response into our segments. Kept pure and exported so the mapping is
 * pinned by the test suite against a recorded-shape payload — the network call
 * cannot be exercised without a key, but everything downstream of it can.
 */
export function deepgramToResult(payload: DeepgramPayload): TranscriptionResult {
  const channel = payload.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  const utterances = payload.results?.utterances ?? [];
  const segments: ParsedSegment[] = [];

  if (utterances.length > 0) {
    for (const utterance of utterances) {
      const text = (utterance.transcript ?? "").trim();
      if (text.length === 0) continue;
      const startMs = Math.round((utterance.start ?? 0) * 1000);
      const endMs = Math.round((utterance.end ?? 0) * 1000);
      segments.push({
        speakerLabel: `Speaker ${(utterance.speaker ?? 0) + 1}`,
        startMs,
        endMs: Math.max(endMs, startMs),
        text,
        timed: true,
      });
    }
  } else if (alternative?.words?.length) {
    // No diarization output: group consecutive words by speaker rather than
    // losing the labels the provider did return.
    let current: ParsedSegment | null = null;
    for (const word of alternative.words) {
      const speakerLabel = `Speaker ${(word.speaker ?? 0) + 1}`;
      const startMs = Math.round((word.start ?? 0) * 1000);
      const endMs = Math.round((word.end ?? 0) * 1000);
      if (current && current.speakerLabel === speakerLabel) {
        current.text = `${current.text} ${word.word ?? ""}`.trim();
        current.endMs = Math.max(current.endMs, endMs);
        continue;
      }
      current = { speakerLabel, startMs, endMs, text: (word.word ?? "").trim(), timed: true };
      segments.push(current);
    }
  }

  if (segments.length === 0) {
    throw new TranscriptionFailed("The provider returned no transcript for that audio.");
  }

  const confidences = utterances
    .map((utterance) => utterance.confidence)
    .filter((value): value is number => typeof value === "number");

  return {
    provider: "deepgram",
    model: DEEPGRAM_MODEL,
    language: channel?.detected_language ?? null,
    confidence:
      confidences.length > 0
        ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length, 4)
        : (alternative?.confidence ?? null),
    durationS: payload.metadata?.duration ?? null,
    segments,
  };
}

/** Exposed for the test suite: the query string is part of the contract. */
export function deepgramUrl(model = DEEPGRAM_MODEL): string {
  const params = new URLSearchParams({
    model,
    diarize: "true",
    punctuate: "true",
    smart_format: "true",
    utterances: "true",
    detect_language: "true",
  });
  return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

class DeepgramProvider implements TranscriptionProvider {
  readonly name = "deepgram";

  constructor(private readonly apiKey: string) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const response = await fetch(deepgramUrl(), {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": input.contentType,
      },
      body: input.bytes as unknown as BodyInit,
      // A provider that never answers must not hold the request open forever.
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new TranscriptionFailed(
        `The speech-to-text provider returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }

    return deepgramToResult((await response.json()) as DeepgramPayload);
  }
}

/**
 * An environment, narrowed to what these helpers read, so a test can pass a plain
 * object without having to fake the whole `process.env` shape.
 */
export type TranscriptionEnv = Record<string, string | undefined>;

/**
 * The configured provider, or null. Nothing is started with a placeholder key:
 * an unset key means the pipeline stays honest about being unconfigured.
 */
export function transcriptionProvider(
  env: TranscriptionEnv = process.env,
): TranscriptionProvider | null {
  const key = env.DEEPGRAM_API_KEY?.trim();
  if (!key) return null;
  return new DeepgramProvider(key);
}

/**
 * Cost is only recorded when a rate is configured, rather than hard-coding a
 * price that will be wrong within a quarter.
 */
export function transcriptionCostUsd(
  durationS: number | null,
  env: TranscriptionEnv = process.env,
): string | null {
  const perMinute = Number(env.DEEPGRAM_COST_PER_MINUTE ?? "");
  if (!Number.isFinite(perMinute) || perMinute <= 0 || durationS === null) return null;
  return (perMinute * (durationS / 60)).toFixed(6);
}

/** Re-exported so a caller can parse a provider timestamp without a second import. */
export { parseTimestampMs };
