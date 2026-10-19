import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import { ingestAudio, ingestTranscript, retryTranscription } from "../audio/ingest";
import {
  retentionAfterTranscription,
  retentionDeleteAfter,
  sweepExpiredAudio,
} from "../audio/retention";
import {
  appendChunk,
  audioKey,
  audioStorage,
  beginUpload,
  clearUpload,
  readStagedUpload,
} from "../audio/storage";
import {
  deepgramToResult,
  deepgramUrl,
  transcriptionCostUsd,
  transcriptionProvider,
  TranscriptionFailed,
} from "../audio/transcribe";
import {
  parsePlainText,
  parseSrt,
  parseTimestampMs,
  parseTranscriptFile,
  parseVtt,
} from "../audio/transcript";
import {
  contentTypeForKey,
  sniffAudio,
  UploadRejected,
  validateAudio,
  validateTitle,
  wavDurationSeconds,
} from "../audio/validate";
import { mapSpeaker, markAudioDeleted, findAudioAsset } from "../writes";
import { getMeetingAudio, listSpeakerLabels, getTranscriptionUsage } from "../queries";
import { withWorkspace } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

/**
 * The audio path, checked end to end:
 *   pnpm --filter @prepo/web db:audio
 *
 * What can be exercised without a provider is exercised for real, parsing,
 * sniffing, storage, chunk assembly, the retention clock, the writes and the
 * tenant boundary. What cannot is the network call to Deepgram, so the response
 * *mapping* is pinned against a recorded-shape payload instead, the same way the
 * TOTP core is pinned against RFC 6238 vectors in `db:auth`.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `, ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function u32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

/** A real RIFF/WAVE header followed by silence, so duration is computable. */
function wav(seconds: number): Uint8Array {
  const byteRate = 16_000; // 8 kHz, mono, 16-bit
  const dataBytes = byteRate * seconds;
  const bytes = new Uint8Array(44 + dataBytes);
  bytes.set([...'RIFF'].map((character) => character.charCodeAt(0)), 0);
  u32(bytes, 4, bytes.byteLength - 8);
  bytes.set([..."WAVE"].map((character) => character.charCodeAt(0)), 8);
  bytes.set([..."fmt "].map((character) => character.charCodeAt(0)), 12);
  u32(bytes, 16, 16);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 1, true);
  u32(bytes, 24, 8_000);
  u32(bytes, 28, byteRate);
  new DataView(bytes.buffer).setUint16(32, 2, true);
  new DataView(bytes.buffer).setUint16(34, 16, true);
  bytes.set([..."data"].map((character) => character.charCodeAt(0)), 36);
  u32(bytes, 40, dataBytes);
  return bytes;
}

/** An ISO base media file with an M4A brand, which is what a phone uploads. */
function m4a(): Uint8Array {
  const bytes = new Uint8Array(64);
  u32(bytes, 0, 64);
  bytes.set([..."ftyp"].map((character) => character.charCodeAt(0)), 4);
  bytes.set([..."M4A "].map((character) => character.charCodeAt(0)), 8);
  return bytes;
}

const VTT = `WEBVTT

00:00:00.000 --> 00:00:03.500
<v Lena Fischer>We ship the billing rewrite before the board meeting.

00:00:03.500 --> 00:00:06.000
<v Lena Fischer>That is not optional.

00:01:14.000 --> 00:01:20.500
<v Dmitri Volkov>I'll take the migration, due Friday.
`;

const SRT = `1
00:00:02,000 --> 00:00:05,000
Speaker 1: First line

2
00:00:05,000 --> 00:00:08,000
Speaker 2: Second line
`;

runCli("audio-smoke.ts", async () => {
  // Storage is pointed at a scratch directory before anything else touches it, so
  // this script never writes into the application's real audio directory.
  const scratch = await mkdtemp(path.join(tmpdir(), "prepo-audio-smoke-"));
  process.env.AUDIO_STORAGE_DIR = path.join(scratch, "audio");
  process.env.AUDIO_STAGING_DIR = path.join(scratch, "incoming");

  await migrateAndApply();
  await seed();

  const northwind = (await resolveWorkspaceId("northwind"))!;
  const globex = (await resolveWorkspaceId("globex"))!;
  const demo = await getUserByEmail(DEMO.email);
  const actorId = demo!.id;

  /* ------------------------------------------------------------- parsing */

  const vtt = parseVtt(VTT);
  check("VTT voice tags become speaker labels", vtt[0]?.speakerLabel === "Lena Fischer", vtt[0]?.speakerLabel);
  check("VTT cues are timed", vtt[0]?.startMs === 0 && vtt[0]?.endMs === 6000, `${vtt[0]?.startMs}-${vtt[0]?.endMs}`);
  check("consecutive cues from one speaker merge", vtt.length === 2, String(vtt.length));
  check("a merged line keeps the whole sentence", vtt[0]?.text.includes("That is not optional.") === true);
  check("the second VTT speaker is detected", vtt[1]?.speakerLabel === "Dmitri Volkov", vtt[1]?.speakerLabel);

  const srt = parseSrt(SRT);
  check("SRT index lines are not content", srt.length === 2, String(srt.length));
  check("SRT comma timestamps parse", srt[1]?.startMs === 5000, String(srt[1]?.startMs));
  check("a numbered speaker label survives parsing", srt[0]?.speakerLabel === "Speaker 1", srt[0]?.speakerLabel);

  const minutes = parsePlainText("Lena: We should ship the rewrite.\nDmitri: I'll take the migration.\n\nDecision: ship on Friday.");
  check("plain text keeps speaker prefixes", minutes[0]?.speakerLabel === "Lena", minutes[0]?.speakerLabel);
  check("a paragraph without a speaker is still a segment", minutes.length === 3, String(minutes.length));
  check("plain text is marked untimed", minutes.every((segment) => segment.timed === false));

  check("parseTimestampMs handles HH:MM:SS.mmm", parseTimestampMs("00:01:14.500") === 74_500);
  check("parseTimestampMs handles MM:SS,mmm", parseTimestampMs("01:14,500") === 74_500);

  let docxRejected = false;
  try {
    parseTranscriptFile("meeting.docx", "binary");
  } catch (error) {
    docxRejected = error instanceof UploadRejected;
  }
  check("a .docx transcript is refused with a reason, not silently dropped", docxRejected);

  /* ---------------------------------------------------------- validation */

  const wavBytes = wav(90);
  const wavFormat = sniffAudio(wavBytes);
  check("WAV sniffs from its header", wavFormat?.extension === ".wav", wavFormat?.extension);
  check("WAV duration comes from the header", wavDurationSeconds(wavBytes) === 90, String(wavDurationSeconds(wavBytes)));

  check("an MP3 frame sync sniffs", sniffAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))?.extension === ".mp3");
  check("a WebM/Matroska header sniffs", sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))?.extension === ".webm");
  check("an M4A brand sniffs", sniffAudio(m4a())?.extension === ".m4a");

  const renamed = new TextEncoder().encode("this is not audio, whatever the name says");
  check("a renamed text file does not sniff as audio", sniffAudio(renamed) === null);

  let renamedRejected = false;
  try {
    validateAudio({ filename: "meeting.mp3", bytes: renamed });
  } catch (error) {
    renamedRejected = error instanceof UploadRejected;
  }
  check("a renamed file is rejected before it is stored", renamedRejected);

  let bigRejected = false;
  try {
    validateAudio({
      filename: "huge.wav",
      bytes: new Uint8Array(26 * 1024 * 1024).fill(0),
    });
  } catch (error) {
    bigRejected = error instanceof UploadRejected;
  }
  check("a file over the size cap is rejected", bigRejected);

  const validated = validateAudio({
    filename: "anything.mp3",
    bytes: m4a(),
    reportedDurationS: 12,
  });
  check(
    "the sniffed format overrides the extension the client claimed",
    validated.format.extension === ".m4a",
    validated.format.extension,
  );
  check("the reported duration is used when the container cannot be measured", validated.durationS === 12);

  let longRejected = false;
  try {
    validateAudio({ filename: "long.m4a", bytes: m4a(), reportedDurationS: 4 * 60 * 60 });
  } catch (error) {
    longRejected = error instanceof UploadRejected;
  }
  check("a recording over the duration cap is rejected", longRejected);

  let titleRejected = false;
  try {
    validateTitle("   ");
  } catch (error) {
    titleRejected = error instanceof UploadRejected;
  }
  check("an empty title is rejected", titleRejected);
  check("content types are derived from the stored key", contentTypeForKey("x/y/asset.wav") === "audio/wav");

  /* ------------------------------------------- provider response mapping */

  const recorded = {
    metadata: { duration: 6.2 },
    results: {
      channels: [{ detected_language: "en", alternatives: [{ confidence: 0.94 }] }],
      utterances: [
        { start: 0.1, end: 3.4, confidence: 0.95, speaker: 0, transcript: "We ship the billing rewrite." },
        { start: 3.4, end: 6.1, confidence: 0.93, speaker: 1, transcript: "I'll take the migration." },
        { start: 6.1, end: 6.2, confidence: 0.9, speaker: 1, transcript: "   " },
      ],
    },
  };
  const mapped = deepgramToResult(recorded);
  check("utterances become segments", mapped.segments.length === 2, String(mapped.segments.length));
  check("diarization numbers become Speaker labels", mapped.segments[1]?.speakerLabel === "Speaker 2", mapped.segments[1]?.speakerLabel);
  check("seconds become milliseconds", mapped.segments[0]?.endMs === 3400, String(mapped.segments[0]?.endMs));
  check("empty utterances are dropped", mapped.segments.every((segment) => segment.text.length > 0));
  check("confidence is averaged", mapped.confidence === 0.9267, String(mapped.confidence));
  check("the language is reported", mapped.language === "en", mapped.language ?? "none");
  check("the duration is reported", mapped.durationS === 6.2, String(mapped.durationS));

  const wordsOnly = deepgramToResult({
    results: {
      channels: [
        {
          alternatives: [
            {
              words: [
                { word: "hello", start: 0, end: 0.4, speaker: 0 },
                { word: "there", start: 0.4, end: 0.8, speaker: 0 },
                { word: "yes", start: 0.9, end: 1.1, speaker: 1 },
              ],
            },
          ],
        },
      ],
    },
  });
  check("word-level output groups by speaker", wordsOnly.segments.length === 2, String(wordsOnly.segments.length));
  check("grouped words keep their text", wordsOnly.segments[0]?.text === "hello there", wordsOnly.segments[0]?.text);

  let emptyFailed = false;
  try {
    deepgramToResult({ results: {} });
  } catch (error) {
    emptyFailed = error instanceof TranscriptionFailed;
  }
  check("an empty provider response is a failure, not an empty transcript", emptyFailed);

  check("no key means no provider", transcriptionProvider({}) === null);
  check(
    "a key means the Deepgram provider",
    transcriptionProvider({ DEEPGRAM_API_KEY: "test-key" })?.name === "deepgram",
  );
  check(
    "the request asks for diarization and utterances",
    deepgramUrl().includes("diarize=true") && deepgramUrl().includes("utterances=true"),
  );
  check("cost is not invented without a rate", transcriptionCostUsd(600, {}) === null);
  check(
    "cost is computed when a rate is configured",
    transcriptionCostUsd(600, { DEEPGRAM_COST_PER_MINUTE: "0.01" }) === "0.100000",
  );

  /* ------------------------------------------------------------- storage */

  const storage = audioStorage();
  const key = audioKey({ workspaceId: northwind, assetId: uuidv7(), extension: ".wav" });
  await storage.put(key, wavBytes);
  check("bytes round-trip through the driver", (await storage.size(key)) === wavBytes.byteLength);
  check(
    "a byte range reads the requested window",
    (await storage.readRange(key, 0, 11))?.byteLength === 12,
  );
  check(
    "the RIFF tag survives the round trip",
    new TextDecoder().decode((await storage.read(key)).subarray(0, 4)) === "RIFF",
  );

  let escaped = false;
  try {
    await storage.put("../../escape.wav", wavBytes);
  } catch {
    escaped = true;
  }
  check("a key cannot escape the storage root", escaped);

  const uploadId = uuidv7();
  await beginUpload(uploadId, {
    workspaceId: northwind,
    userId: actorId,
    title: "Chunked",
    heldAt: new Date().toISOString(),
    source: "recording",
    consent: true,
    filename: "recording.webm",
    totalBytes: 12,
    nextIndex: 1,
    createdAt: new Date().toISOString(),
  });
  await appendChunk(uploadId, 0, new Uint8Array([1, 2, 3, 4]));
  await appendChunk(uploadId, 1, new Uint8Array([5, 6, 7, 8]));
  await appendChunk(uploadId, 2, new Uint8Array([9, 10, 11, 12]));
  const staged = await readStagedUpload(uploadId);
  check("chunks append in order", staged?.byteLength === 12, String(staged?.byteLength));
  await clearUpload(uploadId);
  check("a finished upload is cleaned up", (await readStagedUpload(uploadId)) === null);

  let outOfOrder = false;
  try {
    await appendChunk(uuidv7(), 3, new Uint8Array([1]));
  } catch {
    outOfOrder = true;
  }
  check("a piece that arrives without its predecessors is refused", outOfOrder);

  /* ----------------------------------------------------------- retention */

  const now = new Date("2026-10-17T09:00:00.000Z");
  check(
    "the default keeps audio for 30 days",
    retentionDeleteAfter(undefined, now)?.toISOString() === "2026-11-16T09:00:00.000Z",
  );
  check("days are honoured", retentionDeleteAfter(7, now)?.toISOString() === "2026-10-24T09:00:00.000Z");
  check("'keep' means no delete date", retentionDeleteAfter(-1, now) === null);
  check(
    "'immediately after transcription' waits for the transcript",
    retentionDeleteAfter(0, now) === null,
  );
  check(
    "'immediately after transcription' deletes at that moment",
    retentionAfterTranscription(0, now)?.toISOString() === now.toISOString(),
  );
  check("the clock restarts at transcription", retentionAfterTranscription(30, now)?.toISOString() === "2026-11-16T09:00:00.000Z");

  /* --------------------------------------------------------------- ingest */

  const audioOutcome = await ingestAudio({
    workspaceId: northwind,
    actorId,
    title: "Recorded standup",
    heldAt: now,
    source: "recording",
    filename: "standup.wav",
    bytes: wavBytes,
    transcribe: false,
    retentionDays: 30,
  });
  check("ingest stores a meeting and an asset", Boolean(audioOutcome.meetingId && audioOutcome.assetId));
  check(
    "without a provider the asset stays uploaded",
    audioOutcome.audioStatus === "uploaded",
    audioOutcome.audioStatus,
  );
  check(
    "the outcome says transcription is unconfigured rather than pretending",
    audioOutcome.detail.includes("not configured"),
  );

  const storedAsset = await findAudioAsset({ workspaceId: northwind, assetId: audioOutcome.assetId });
  check("the asset key is workspace-scoped", storedAsset?.r2Key.startsWith(`${northwind}/`) === true, storedAsset?.r2Key);
  check("the bytes are on disk", (await audioStorage().size(storedAsset!.r2Key)) === wavBytes.byteLength);
  check("WAV duration was not taken on trust", storedAsset?.durationS === 90, String(storedAsset?.durationS));

  const [assetRow] = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        consent: t.audioAssets.consentConfirmedBy,
        deleteAfter: t.audioAssets.deleteAfter,
        status: t.audioAssets.status,
      })
      .from(t.audioAssets)
      .where(eq(t.audioAssets.id, audioOutcome.assetId)),
  );
  check("consent is recorded with the audio", assetRow?.consent === actorId);
  // The delete date is measured from the real clock at ingest, not the fixed
  // date this script passed as the meeting's held-at, so the window is checked
  // rather than an exact timestamp.
  const daysUntilDelete = assetRow?.deleteAfter
    ? (assetRow.deleteAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : -1;
  check(
    "an upload gets a delete date even before it is transcribed",
    daysUntilDelete > 29 && daysUntilDelete < 31,
    `${daysUntilDelete.toFixed(2)} days`,
  );

  const audioView = await getMeetingAudio(northwind, audioOutcome.meetingId);
  check("the meeting reads its audio back", audioView?.available === true);
  check("the consenting person's name is resolved", audioView?.consentName === demo!.name, audioView?.consentName ?? "none");

  const pasteOutcome = await ingestTranscript({
    workspaceId: northwind,
    actorId,
    title: "Minutes by paste",
    heldAt: now,
    text: "Lena: We ship on Friday.\nDmitri: I'll handle the migration.",
  });
  check("pasted minutes become quotable segments", pasteOutcome.segmentCount === 2, String(pasteOutcome.segmentCount));
  check(
    "the paste outcome admits there is no timing",
    pasteOutcome.detail.includes("no timing"),
  );

  const vttOutcome = await ingestTranscript({
    workspaceId: northwind,
    actorId,
    title: "Captions from Zoom",
    heldAt: now,
    filename: "meeting.vtt",
    text: VTT,
  });
  check("a VTT file imports timed segments", vttOutcome.segmentCount === 2, String(vttOutcome.segmentCount));
  check("its speakers are reported", vttOutcome.speakers.includes("Dmitri Volkov"));

  const [pasteMeeting] = await withWorkspace(northwind, (tx) =>
    tx
      .select({ source: t.meetings.source, status: t.meetings.status })
      .from(t.meetings)
      .where(eq(t.meetings.id, pasteOutcome.meetingId)),
  );
  check("a pasted meeting is recorded as a paste and is ready", pasteMeeting?.source === "paste" && pasteMeeting?.status === "ready");

  const labels = await listSpeakerLabels(northwind, vttOutcome.meetingId);
  check("speaker labels are listed with their line counts", labels.length === 2, String(labels.length));
  check("an unmapped label reads as unassigned", labels[0]?.userId === null);

  const mappedCount = await mapSpeaker({
    workspaceId: northwind,
    meetingId: vttOutcome.meetingId,
    actorId,
    label: "Lena Fischer",
    userId: actorId,
    renameTo: "Lena F.",
  });
  check("mapping attributes every line with the label", mappedCount === 1, String(mappedCount));

  const afterMapping = await listSpeakerLabels(northwind, vttOutcome.meetingId);
  const lena = afterMapping.find((label) => label.label === "Lena F.");
  check("the label is renamed", Boolean(lena));
  check("the label points at the person", lena?.userId === actorId, lena?.userName ?? "none");

  const unassigned = await mapSpeaker({
    workspaceId: northwind,
    meetingId: vttOutcome.meetingId,
    actorId,
    label: "Lena F.",
    userId: null,
  });
  check("a mapping can be taken back", unassigned === 1, String(unassigned));

  const noProvider = await retryTranscription({
    workspaceId: northwind,
    meetingId: audioOutcome.meetingId,
    assetId: audioOutcome.assetId,
  });
  check("a retry without a provider says so instead of failing silently", noProvider.configured === false);

  const usage = await getTranscriptionUsage(northwind);
  check("usage stays at zero when nothing was sent", usage.minutes === 0 && usage.runs === 0);

  /* ------------------------------------------------------------ retention job */

  const expired = await ingestAudio({
    workspaceId: northwind,
    actorId,
    title: "Old recording",
    heldAt: now,
    source: "upload",
    filename: "old.wav",
    bytes: wav(5),
    transcribe: false,
  });
  const expiredAsset = await findAudioAsset({ workspaceId: northwind, assetId: expired.assetId });
  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.audioAssets)
      .set({ deleteAfter: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(t.audioAssets.id, expired.assetId)),
  );

  const sweep = await sweepExpiredAudio(now);
  check("the sweep deletes at least the expired asset", sweep.deleted >= 1, String(sweep.deleted));
  check("the sweep reports the bytes it reclaimed", sweep.bytes > 0, String(sweep.bytes));
  check(
    "the expired blob is gone from storage",
    (await audioStorage().size(expiredAsset!.r2Key)) === null,
  );

  const [expiredRow] = await withWorkspace(northwind, (tx) =>
    tx
      .select({ status: t.audioAssets.status })
      .from(t.audioAssets)
      .where(eq(t.audioAssets.id, expired.assetId)),
  );
  check("the expired row is marked deleted rather than removed", expiredRow?.status === "deleted", expiredRow?.status);

  const keepRow = await findAudioAsset({ workspaceId: northwind, assetId: audioOutcome.assetId });
  check("a future-dated asset is untouched by the sweep", keepRow?.status === "uploaded", keepRow?.status);

  const afterSweep = await getMeetingAudio(northwind, expired.meetingId);
  check("a deleted recording reads as unavailable", afterSweep?.available === false);

  /* --------------------------------------------------------- delete audio */

  const deleted = await markAudioDeleted({
    workspaceId: northwind,
    actorId,
    assetId: audioOutcome.assetId,
  });
  check("deleting audio returns its key", Boolean(deleted.storageKey));
  await audioStorage().remove(deleted.storageKey!);
  const deletedView = await getMeetingAudio(northwind, audioOutcome.meetingId);
  check("the deleted recording is reported as deleted", deletedView?.status === "deleted", deletedView?.status);
  check("and it is not available to play", deletedView?.available === false);

  /* --------------------------------------------------------------- tenancy */

  const crossed = await findAudioAsset({ workspaceId: globex, assetId: audioOutcome.assetId });
  check("a globex scope cannot see a northwind asset", crossed === null);
  const crossedMeeting = await getMeetingAudio(globex, audioOutcome.meetingId);
  check("a globex scope cannot read a northwind meeting's audio", crossedMeeting === null);
  const crossedMap = await mapSpeaker({
    workspaceId: globex,
    meetingId: vttOutcome.meetingId,
    actorId,
    label: "Lena F.",
    userId: null,
  });
  check("a cross-tenant speaker map changes nothing", crossedMap === 0, String(crossedMap));

  await rm(scratch, { recursive: true, force: true });

  console.log("");
  console.log(failures === 0 ? "all audio checks passed" : `${failures} check(s) failed`);
  if (failures > 0) throw new Error("audio smoke test failed");
}, "fresh");
