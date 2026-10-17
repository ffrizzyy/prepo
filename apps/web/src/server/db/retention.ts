import { sweepExpiredAudio } from "../audio/retention";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";

/**
 * The retention job (PREPO.md §6.2), meant to be run from a scheduler:
 *   pnpm --filter @prepo/web db:retention
 *
 * A deployed build would wire this to the workflow engine's cron. Running it by
 * hand is honest and repeatable: it reports exactly what it reclaimed, including
 * rows whose bytes had already gone, and it also clears unfinished chunked
 * uploads older than an hour.
 */

runCli("retention.ts", async () => {
  await migrateAndApply();

  const result = await sweepExpiredAudio();

  console.log(
    [
      `deleted ${result.deleted} recording(s)`,
      `${(result.bytes / 1024 / 1024).toFixed(2)} MB reclaimed`,
      `${result.alreadyGone} row(s) had no bytes left`,
      `${result.abandoned} row(s) were never transcribed and past the 90-day horizon`,
      `${result.staleUploads} unfinished upload(s) cleared`,
    ].join(" · "),
  );
});
