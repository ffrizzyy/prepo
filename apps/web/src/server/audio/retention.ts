import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { audioStorage, sweepStaleUploads } from "./storage";

/**
 * Audio retention (PREPO.md §6.2). The default is **30 days after
 * transcription**, configurable per workspace, and "delete immediately after
 * transcription" has to be a real option for anyone recording something
 * sensitive.
 *
 * Two details make the rule hold rather than merely look good:
 *
 * - the clock restarts when a transcript is stored, so "30 days after
 *   transcription" means what it says;
 * - a recording that never gets transcribed is still bounded, because the
 *   delete date is set at upload as well, and a sweep with a longer horizon
 *   reclaims anything abandoned outright.
 */

export const KEEP_FOREVER = -1;
export const DEFAULT_AUDIO_RETENTION_DAYS = 30;
export const AUDIO_RETENTION_CHOICES = [0, 7, 30, 90, KEEP_FOREVER] as const;

/** Nothing is kept unattended for longer than this, whatever the settings say. */
export const ABANDONED_AFTER_DAYS = 90;

/** How long unfinished chunked uploads are allowed to sit around. */
export const STALE_UPLOAD_MS = 60 * 60 * 1000;

function days(value: number): number {
  return value * 24 * 60 * 60 * 1000;
}

/**
 * The delete date for an asset, or null when it is kept until the meeting is
 * deleted. `from` is the upload time or the transcription time depending on
 * which boundary is being recorded.
 */
export function retentionDeleteAfter(
  retentionDays: number | undefined,
  from: Date,
): Date | null {
  const setting = retentionDays ?? DEFAULT_AUDIO_RETENTION_DAYS;
  if (setting === KEEP_FOREVER) return null;
  if (setting <= 0) return null; // "immediately after transcription", set when the transcript lands
  return new Date(from.getTime() + days(setting));
}

/** The delete date once a transcript exists, which is what the setting names. */
export function retentionAfterTranscription(
  retentionDays: number | undefined,
  transcribedAt: Date,
): Date | null {
  const setting = retentionDays ?? DEFAULT_AUDIO_RETENTION_DAYS;
  if (setting === KEEP_FOREVER) return null;
  if (setting <= 0) return transcribedAt;
  return new Date(transcribedAt.getTime() + days(setting));
}

export function retentionLabel(retentionDays: number | undefined): string {
  const setting = retentionDays ?? DEFAULT_AUDIO_RETENTION_DAYS;
  if (setting === KEEP_FOREVER) return "Keep audio until the meeting is deleted";
  if (setting <= 0) return "Delete audio as soon as it is transcribed";
  return `Delete audio ${setting} days after transcription`;
}

export type SweepResult = {
  deleted: number;
  bytes: number;
  /** Rows whose bytes had already gone, reported rather than silently counted. */
  alreadyGone: number;
  abandoned: number;
  staleUploads: number;
};

/**
 * The retention job. It runs as the database owner rather than through a
 * workspace scope, because a maintenance sweep spans every workspace; the
 * request path never does this, and every workspace-scoped read still goes
 * through RLS.
 */
export async function sweepExpiredAudio(now = new Date()): Promise<SweepResult> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - days(ABANDONED_AFTER_DAYS));

  const rows = await db
    .select({
      id: t.audioAssets.id,
      r2Key: t.audioAssets.r2Key,
      sizeBytes: t.audioAssets.sizeBytes,
      deleteAfter: t.audioAssets.deleteAfter,
    })
    .from(t.audioAssets)
    .where(
      and(
        or(
          lte(t.audioAssets.deleteAfter, now),
          // Never transcribed, never marked for deletion, and old enough that
          // nothing is going to happen to it.
          and(
            isNull(t.audioAssets.deleteAfter),
            lt(t.audioAssets.createdAt, cutoff),
            or(
              eq(t.audioAssets.status, "uploaded"),
              eq(t.audioAssets.status, "failed"),
            ),
          ),
        ),
        sql`${t.audioAssets.status} <> 'deleted'`,
      ),
    );

  let deleted = 0;
  let bytes = 0;
  let alreadyGone = 0;

  for (const row of rows) {
    const size = await audioStorage().size(row.r2Key);
    if (size === null) alreadyGone += 1;
    else bytes += size;

    await audioStorage().remove(row.r2Key);
    await db
      .update(t.audioAssets)
      .set({ status: "deleted" })
      .where(eq(t.audioAssets.id, row.id));
    deleted += 1;
  }

  const staleUploads = await sweepStaleUploads(STALE_UPLOAD_MS);

  return {
    deleted,
    bytes,
    alreadyGone,
    abandoned: rows.filter((row) => row.deleteAfter === null).length,
    staleUploads,
  };
}

/** Deletes one asset's bytes for the meeting-level delete. */
export async function removeAudioBlob(key: string): Promise<void> {
  await audioStorage().remove(key);
}
