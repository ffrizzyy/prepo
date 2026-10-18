import { runExtraction } from "../ai/extract";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";

/**
 * The extraction job (PREPO.md §7.1), meant to be run from a scheduler:
 *   pnpm --filter @prepo/web db:extract
 *
 * It reads every ready meeting that has no minutes yet, asks the configured
 * model once per meeting, and imports what the transcript supports. It never
 * re-runs a meeting that already has a summary, so a schedule is cheap and
 * cannot quietly spend twice on the same transcript.
 *
 * With no OPENROUTER_API_KEY or AI_MODEL_EXTRACT it does nothing and says so,
 * rather than importing a placeholder.
 */

runCli("extract.ts", async () => {
  await migrateAndApply();

  const report = await runExtraction();

  console.log("extract.ts");

  if (report.unconfigured) {
    console.log(`  ${report.reason ?? "Extraction is not configured."}`);
    console.log("  Nothing was read or written.");
    return;
  }

  for (const line of report.lines) {
    console.log(`  ${line}`);
  }

  if (report.scanned === 0) {
    console.log(
      "  Nothing to extract: every ready meeting already has minutes or no ready meeting has a transcript.",
    );
  }

  const auto = report.autoApproved > 0 ? `, ${report.autoApproved} auto-approved` : "";
  console.log(
    `  ${report.extracted} extracted, ${report.skipped} skipped, ${report.failed} failed; ${report.items} items${auto}.`,
  );

  if (report.failed > 0) process.exitCode = 1;
});
