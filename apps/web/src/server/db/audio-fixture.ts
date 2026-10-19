import { eq } from "drizzle-orm";
import { audioKey, audioStorage, contentHash } from "../audio/storage";
import { rawQuery, withWorkspace } from "./client";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import { seed } from "./seed";
import * as t from "./schema";

/**
 * Gives the seeded example meeting real bytes to stream:
 *   pnpm --filter @prepo/web db:audio-fixture
 *
 * The seed creates an `audio_assets` row with a `transcribed` transcript behind
 * it, but no file, the row is honest and the transcript is the real artifact.
 * That leaves the player with nothing to play, so this fixture writes a quiet
 * generated tone whose length matches the seeded transcript.
 *
 * It is a tone, not speech: nothing here is passed off as a recording of the
 * meeting the transcript describes. The point of installing it is that the player,
 * the byte-range route, seeking and the retention sweep can all be exercised
 * against real bytes.
 */

const SAMPLE_RATE = 8_000;
const BYTE_RATE = SAMPLE_RATE * 2; // mono, 16-bit

function toneWav(seconds: number): Uint8Array {
  const dataBytes = BYTE_RATE * seconds;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (value: string, offset: number) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };

  ascii("RIFF", 0);
  view.setUint32(4, bytes.byteLength - 8, true);
  ascii("WAVE", 8);
  ascii("fmt ", 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, BYTE_RATE, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii("data", 36);
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < dataBytes / 2; index += 1) {
    const t = index / SAMPLE_RATE;
    // A slow two-tone pulse at low volume, so it is obviously a placeholder
    // rather than something that sounds like a room recording.
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / 4);
    const sample =
      0.04 * envelope * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t));
    view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
  }

  return bytes;
}

runCli("audio-fixture.ts", async () => {
  await migrateAndApply();

  // An empty database needs the demo under it; an installed one keeps it, so
  // this fixture composes with the TOTP fixture instead of truncating it.
  const existing = await rawQuery<{ n: number }>(
    "select count(*)::int as n from users",
  );
  if ((existing[0]?.n ?? 0) === 0) await seed();

  const workspaceId = (await resolveWorkspaceId("northwind"))!;

  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.audioAssets.id,
        meetingId: t.audioAssets.meetingId,
        sizeBytes: t.audioAssets.sizeBytes,
        status: t.audioAssets.status,
      })
      .from(t.audioAssets)
      .limit(1),
  );

  const asset = rows[0];
  if (!asset) throw new Error("No seeded audio asset to attach a fixture to.");

  // The seeded key ended in .m4a, and the player would be handed audio/mp4 for
  // WAV bytes. The key is regenerated so the served content type matches the file.
  const key = audioKey({
    workspaceId,
    assetId: asset.id,
    extension: ".wav",
  });
  const bytes = toneWav(249);

  await audioStorage().put(key, bytes);
  await withWorkspace(workspaceId, (tx) =>
    tx
      .update(t.audioAssets)
      .set({
        r2Key: key,
        sizeBytes: bytes.byteLength,
        // The seeded transcript runs to 249 s; the tone matches it, so seeking to
        // a quote lands where the quote is.
        durationS: 249,
        status: "transcribed",
        // Kept 30 days from whenever the fixture is installed, so running the
        // retention job does not immediately reclaim the demo's audio.
        deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(t.audioAssets.id, asset.id)),
  );

  console.log(
    [
      `fixture audio installed for asset ${asset.id}`,
      `${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`,
      `249 s`,
      `sha256 ${contentHash(bytes).slice(0, 16)}…`,
      `key ${key}`,
    ].join(" · "),
  );
  console.log("This is a generated tone, not a recording of the meeting.");
});
