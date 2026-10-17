import { runFollowups } from "../followups/engine";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";

/**
 * The chaser (PREPO.md §8.7), meant to be run from a scheduler:
 *   pnpm --filter @prepo/web db:followups
 *   pnpm --filter @prepo/web db:followups -- --at 2026-10-19T09:00:00Z
 *
 * It runs one pass and reports what it decided, so a cron log is readable rather
 * than a shrug. `--at` is for demonstrating the ladder without waiting for a
 * Monday, and for the tests.
 */

function parseMoment(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--at needs an ISO date, got "${value}"`);
  }
  return parsed;
}

runCli("followups.ts", async () => {
  await migrateAndApply();

  const index = process.argv.indexOf("--at");
  const now = parseMoment(index >= 0 ? process.argv[index + 1] : undefined);

  const report = await runFollowups({ now });

  console.log(
    [
      `considered ${report.considered} due message(s)`,
      `${report.sent} sent`,
      `${report.failed} failed`,
      `${report.deferred} deferred for quiet hours`,
      `${report.cancelled} cancelled`,
      `${report.notifications} notification(s) written`,
      `${report.digests} digest(s) delivered`,
      `${report.digestsScheduled} digest row(s) placed`,
    ].join(" · "),
  );

  if (report.details.length > 0) {
    for (const line of report.details) console.log(`  ${line}`);
  }
});
