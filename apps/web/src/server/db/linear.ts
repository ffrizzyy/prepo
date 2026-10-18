import { runLinearSync } from "../linear/sync";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";

/**
 * The Linear sync (PREPO.md 8.6), meant to be run from a scheduler:
 *   pnpm --filter @prepo/web db:linear
 *
 * One pass per workspace with a connection: pull what Linear changed, then push
 * what Prepo queued. It reports every decision it made, so a cron log says
 * something rather than nothing.
 *
 * A refused ticket is not a failed process: the reason is recorded on the ticket
 * (with a backoff) and the pass continues, so one bad ticket cannot stop the
 * queue behind it.
 */

runCli("linear.ts", async () => {
  await migrateAndApply();

  const report = await runLinearSync();

  console.log("=== linear sync ===");
  console.log(
    `${report.workspaces} workspace(s) · ${report.connected} connected · ` +
      `pulled ${report.pulled} (${report.applied} applied, ${report.unmapped} unmapped, ` +
      `${report.kept} kept local) · pushed ${report.pushed} · failed ${report.failed}`,
  );

  for (const detail of report.details) {
    console.log(`  ${detail}`);
  }

  if (report.connected === 0) {
    console.log(
      "  no workspace has a Linear connection, so nothing was sent anywhere.",
    );
  }
});
