/**
 * Upload safety (PREPO.md §9.3.1 "Upload and audio safety").
 *
 * The extension a client sends is a claim, not a fact, so the format is decided
 * by sniffing the first bytes. The caps are deliberate and enforced before
 * anything is written to disk.
 */

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 3 * 60 * 60;
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 400_000;
export const MAX_TITLE_CHARS = 200;

export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".ogg", ".mp4"] as const;
export const TRANSCRIPT_EXTENSIONS = [".vtt", ".srt", ".txt", ".md"] as const;

export type AudioFormat = {
  extension: (typeof AUDIO_EXTENSIONS)[number];
  contentType: string;
  label: string;
};

/** Rejection with a message that is safe to show the person who uploaded it. */
export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejected";
  }
}

function startsWith(bytes: Uint8Array, ascii: string, offset = 0): boolean {
  if (bytes.byteLength < offset + ascii.length) return false;
  for (let index = 0; index < ascii.length; index += 1) {
    if (bytes[offset + index] !== ascii.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Identifies the container from its leading bytes.
 *
 * MP4 and M4A are the same container with different brands, and WebM is a
 * Matroska subset, which is why each branch checks more than the first four
 * bytes where it can.
 */
export function sniffAudio(bytes: Uint8Array): AudioFormat | null {
  // ID3v2 tag or a raw MPEG frame sync.
  if (startsWith(bytes, "ID3")) {
    return { extension: ".mp3", contentType: "audio/mpeg", label: "MP3" };
  }
  if (bytes.byteLength > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return { extension: ".mp3", contentType: "audio/mpeg", label: "MP3" };
  }
  // RIFF....WAVE
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WAVE", 8)) {
    return { extension: ".wav", contentType: "audio/wav", label: "WAV" };
  }
  if (startsWith(bytes, "OggS")) {
    return { extension: ".ogg", contentType: "audio/ogg", label: "Ogg" };
  }
  // Matroska / WebM EBML header.
  if (bytes.byteLength > 3 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { extension: ".webm", contentType: "audio/webm", label: "WebM" };
  }
  // ISO base media file format: size('ftyp') at offset 4, brand after it.
  if (startsWith(bytes, "ftyp", 4)) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (brand.startsWith("M4A") || brand.startsWith("mp4a")) {
      return { extension: ".m4a", contentType: "audio/mp4", label: "M4A" };
    }
    if (brand.startsWith("qt")) {
      return { extension: ".mp4", contentType: "video/quicktime", label: "QuickTime" };
    }
    return { extension: ".mp4", contentType: "audio/mp4", label: "MP4" };
  }
  return null;
}

/**
 * Duration for containers where it can be read honestly. WAV carries its byte
 * rate in a fixed header, so the value is computed rather than trusted. For
 * every other container the client's measurement is used, and the cap below is
 * the thing that actually protects the server.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (!startsWith(bytes, "RIFF") || !startsWith(bytes, "WAVE", 8)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 44) return null;
  const byteRate = view.getUint32(28, true);
  if (byteRate === 0) return null;
  const dataBytes = view.byteLength - 44;
  return Math.round(dataBytes / byteRate);
}

export type ValidatedAudio = {
  format: AudioFormat;
  durationS: number;
  sizeBytes: number;
};

/** Throws `UploadRejected` with a user-facing reason when anything is off. */
export function validateAudio(input: {
  filename: string;
  bytes: Uint8Array;
  /** Client-reported; ignored for WAV, where the header is authoritative. */
  reportedDurationS?: number;
}): ValidatedAudio {
  const size = input.bytes.byteLength;

  if (size === 0) throw new UploadRejected("The file was empty.");
  if (size > MAX_AUDIO_BYTES) {
    throw new UploadRejected(
      `Recordings are capped at ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB. Split the meeting or upload a transcript instead.`,
    );
  }

  const format = sniffAudio(input.bytes);
  if (!format) {
    throw new UploadRejected(
      `That file is not audio Prepo recognises. Supported: ${AUDIO_EXTENSIONS.join(", ")}.`,
    );
  }

  const durationS = wavDurationSeconds(input.bytes) ?? Math.round(input.reportedDurationS ?? 0);
  if (durationS > MAX_AUDIO_SECONDS) {
    throw new UploadRejected(
      `Recordings are capped at ${MAX_AUDIO_SECONDS / 3600} hours. Split the meeting into parts.`,
    );
  }

  // The extension is normalised to the sniffed format rather than the claim, so
  // the stored key and the served content type cannot disagree with the bytes.
  return { format, durationS: Math.max(durationS, 0), sizeBytes: size };
}

/** Content type for a stored key, so the player is served the right bytes. */
export function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf(".");
  const extension = dot === -1 ? "" : key.slice(dot).toLowerCase();
  const format = AUDIO_EXTENSIONS.find((candidate) => candidate === extension);
  switch (format) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    case ".mp4":
      return "audio/mp4";
    default:
      // Unknown extensions are served as opaque bytes rather than guessed at.
      return "application/octet-stream";
  }
}

export function validateTitle(title: string): string {  const trimmed = title.trim();
  if (trimmed.length === 0) throw new UploadRejected("Give the meeting a title.");
  if (trimmed.length > MAX_TITLE_CHARS) {
    throw new UploadRejected(`Titles are capped at ${MAX_TITLE_CHARS} characters.`);
  }
  return trimmed;
}

export function validateTranscriptText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new UploadRejected("There was no text in that file.");
  if (trimmed.length > MAX_TRANSCRIPT_CHARS) {
    throw new UploadRejected(
      `Transcripts are capped at ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters.`,
    );
  }
  return trimmed;
}
