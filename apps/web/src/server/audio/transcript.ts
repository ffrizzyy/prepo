import { UploadRejected } from "./validate";

/**
 * Transcript parsing.
 *
 * Zoom, Meet and Teams all export a cue-based file, but the cue shapes differ:
 * WebVTT uses `.` before milliseconds and may carry a `<v Name>` voice tag, SRT
 * uses `,` and an index line. Both are parsed here without a dependency, and raw
 * minutes fall back to paragraph splitting.
 *
 * A segment is the unit of evidence in this product, PREPO.md §7.2's rule is
 * "no source quote, no ticket", so pasted minutes are stored as paragraphs
 * rather than as one blob, and carry `timed: false` because there is no audio to
 * seek into.
 */

export type ParsedSegment = {
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
  /** False when the source carried no timing at all (pasted minutes). */
  timed: boolean;
};

export type ParsedTranscript = {
  format: "vtt" | "srt" | "text";
  segments: ParsedSegment[];
  /** Set when some cues carried a speaker and others did not. */
  speakers: string[];
};

const VOICE_TAG = /<v\s+([^>]+)>/i;
const CUE_TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const SPEAKER_PREFIX = /^\s*(?:\[?[\d:.]{4,12}\]?\s*)?([A-Z][\w.'-]*(?:\s+[A-Z0-9][\w.'-]*){0,3})\s*:\s*(.+)$/;

/** `00:01:14.500`, `01:14,500` and `74` all resolve to milliseconds. */
export function parseTimestampMs(value: string): number | null {
  const clock = value.match(CUE_TIME);
  if (clock) {
    const hours = Number(clock[1] ?? 0);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    const fraction = Number(clock[4]!.padEnd(3, "0"));
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction;
  }
  const bare = value.trim().match(/^(\d+(?:\.\d+)?)s?$/);
  if (bare) return Math.round(Number(bare[1]) * 1000);
  return null;
}

/** `<v Lena Fischer>`, `Speaker 2:` and a bare line all become a label. */
function speakerAndText(raw: string, fallback: string): { speakerLabel: string; text: string } {
  const voice = raw.match(VOICE_TAG);
  const withoutTags = raw.replace(/<[^>]+>/g, "").trim();

  if (voice) {
    return { speakerLabel: voice[1]!.trim(), text: withoutTags };
  }

  const prefixed = withoutTags.match(SPEAKER_PREFIX);
  if (prefixed) {
    return { speakerLabel: prefixed[1]!.trim(), text: prefixed[2]!.trim() };
  }

  return { speakerLabel: fallback, text: withoutTags };
}

/**
 * Caption files break a sentence into cues, so the same speaker appears many
 * times in a row. Merging them keeps the transcript readable and keeps a quote
 * from being one fragment of a sentence.
 */
export function mergeConsecutive(
  segments: ParsedSegment[],
  maxGapMs = 2500,
): ParsedSegment[] {
  const merged: ParsedSegment[] = [];

  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const gap = previous ? segment.startMs - previous.endMs : Number.POSITIVE_INFINITY;

    if (previous && previous.speakerLabel === segment.speakerLabel && gap <= maxGapMs) {
      previous.text = `${previous.text} ${segment.text}`.replace(/\s+/g, " ").trim();
      previous.endMs = Math.max(previous.endMs, segment.endMs);
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function segmentsFromCues(
  text: string,
  options: {
    separator: (line: string) => boolean;
    defaultSpeaker: string;
  },
): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let current: { startMs: number; endMs: number; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.body.join(" ").replace(/\s+/g, " ").trim();
    if (body.length > 0) {
      const { speakerLabel, text: spoken } = speakerAndText(body, options.defaultSpeaker);
      if (spoken.length > 0) {
        segments.push({
          speakerLabel,
          startMs: current.startMs,
          endMs: current.endMs,
          text: spoken,
          timed: true,
        });
      }
    }
    current = null;
  };

  for (const line of text.split(/\r?\n/)) {
    const time = line.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*((?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3}))/);
    if (time) {
      flush();
      current = {
        startMs: parseTimestampMs(time[0].split("-->")[0]!) ?? 0,
        endMs: parseTimestampMs(time[5]!) ?? 0,
        body: [],
      };
      continue;
    }
    if (!current) {
      // Header lines: WEBVTT, NOTE, STYLE, SRT indices, and blank separators.
      continue;
    }
    if (options.separator(line)) {
      flush();
      continue;
    }
    current.body.push(line);
  }

  flush();
  return mergeConsecutive(segments);
}

export function parseVtt(text: string): ParsedSegment[] {
  const body = text.replace(/^\uFEFF/, "");
  return segmentsFromCues(body, {
    defaultSpeaker: "Speaker",
    separator: (line) => line.trim().length === 0,
  });
}

export function parseSrt(text: string): ParsedSegment[] {
  const body = text.replace(/^\uFEFF/, "");
  return segmentsFromCues(body, {
    defaultSpeaker: "Speaker",
    // SRT also puts a bare index line between cues, which is not content.
    separator: (line) => line.trim().length === 0 || /^\d+$/.test(line.trim()),
  });
}

/**
 * Raw minutes. A line is a new segment when it looks like `Speaker: text`; a
 * paragraph is a segment otherwise. Timestamps in the form `[00:14]` are read
 * when present, so pasted output from a tool that keeps them still lines up.
 */
export function parsePlainText(text: string): ParsedSegment[] {
  const body = text.replace(/^\uFEFF/, "");
  const segments: ParsedSegment[] = [];

  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    for (const line of lines) {
      const timed = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(.*)$/);
      const startMs = timed ? (parseTimestampMs(timed[1]!) ?? 0) : 0;
      const rest = timed ? timed[2]! : line;
      const { speakerLabel, text: spoken } = speakerAndText(rest, "Speaker");
      if (spoken.length === 0) continue;
      segments.push({
        speakerLabel,
        startMs,
        endMs: startMs,
        text: spoken,
        timed: false,
      });
    }
  }

  return segments;
}

const FORMATS: Record<string, "vtt" | "srt" | "text"> = {
  ".vtt": "vtt",
  ".srt": "srt",
  ".txt": "text",
  ".md": "text",
};

export function transcriptFormatFor(filename: string): "vtt" | "srt" | "text" {
  const dot = filename.lastIndexOf(".");
  const extension = dot === -1 ? "" : filename.slice(dot).toLowerCase();
  const format = FORMATS[extension];
  if (!format) {
    throw new UploadRejected(
      "Transcripts can be .vtt, .srt, .txt or .md. For a Word or PDF export, paste the text instead, Prepo stores what it can quote, and it cannot quote a binary.",
    );
  }
  return format;
}

export function parseTranscriptFile(filename: string, text: string): ParsedTranscript {
  const format = transcriptFormatFor(filename);
  const segments =
    format === "vtt" ? parseVtt(text) : format === "srt" ? parseSrt(text) : parsePlainText(text);

  if (segments.length === 0) {
    throw new UploadRejected("No transcript lines were found in that file.");
  }

  return {
    format,
    segments,
    speakers: [...new Set(segments.map((segment) => segment.speakerLabel))],
  };
}

/** Speaker labels the client can send back when a label is corrected. */
export function speakerLabels(segments: { speakerLabel: string }[]): string[] {
  return [...new Set(segments.map((segment) => segment.speakerLabel))];
}
