/**
 * Recomputes the Meeting Necessity Score for every meeting in every workspace
 * (PREPO.md §7.3).
 *
 *   pnpm --filter @prepo/web db:necessity
 *
 * This is both the backfill and the scheduler entry point. It is idempotent and
 * makes no network call, so running it as often as wanted costs nothing: a
 * meeting is always compared against meetings held before it, so a run changes
 * a score only if that meeting's own items or decisions changed. Meetings that
 * have nothing to compare against are explicitly cleared rather than left with
 * a stale number.
 */
import { runNecessity } from "../ai/necessity";
import { runCli } from "./run";

runCli("necessity.ts", async () => {
  const report = await runNecessity();

  for (const line of report.lines) console.log(line);

  console.log(
    `\n${report.meetings} meeting${report.meetings === 1 ? "" : "s"} in ${report.workspaces} workspace${report.workspaces === 1 ? "" : "s"}: ${report.scored} scored, ${report.notScored} left unscored.`,
  );
});
