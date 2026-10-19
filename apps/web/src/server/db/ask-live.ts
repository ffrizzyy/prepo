/**
 * Asks one real question against the real provider (PREPO.md §8.8).
 *
 *   pnpm --filter @prepo/web db:ask-live "What is the checkout webhook retry bug?"
 *
 * The fixture suite proves the pipeline; only this proves that a real model's
 * answer survives the schema and grounds its citations in passages that were
 * actually sent. It reads the working database, writes nothing but the run row
 * that records what the call cost, and prints the answer with its sources so the
 * citations can be checked by hand rather than taken on trust.
 *
 * Without a configured model it prints the reason and exits non-zero, which is
 * the same thing the page shows.
 */
import { askReadiness, askWorkspace } from "../ai/ask";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";

const DEFAULT_QUESTION = "What is the checkout webhook retry bug?";

runCli("ask-live.ts", async () => {
  const question =
    process.argv
      .slice(2)
      .filter((arg) => !arg.endsWith("ask-live.ts"))
      .join(" ")
      .trim() || DEFAULT_QUESTION;

  const readiness = askReadiness();
  if (!readiness.ready) {
    console.log(readiness.reason);
    process.exitCode = 1;
    return;
  }

  const workspaceId = await resolveWorkspaceId("northwind");
  if (!workspaceId) {
    console.log("There is no 'northwind' workspace in this database. Seed it first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Asking northwind: ${question}\n`);

  const report = await askWorkspace({ workspaceId, question });

  console.log(`status: ${report.status}`);
  if (report.reason) console.log(`reason: ${report.reason}`);

  if (report.answer) console.log(`\n${report.answer}\n`);
  if (report.confident === false) {
    console.log("(the model says the passages do not answer this)");
  }
  if (report.uncited) console.log("(no citation was given for this answer)");

  for (const source of report.sources ?? []) {
    console.log(`- ${source.label}${source.quote ? `: "${source.quote}"` : ""}`);
  }

  if (report.droppedCitations) {
    console.log(
      `\n${report.droppedCitations} citation(s) named a passage that was never sent, and were dropped.`,
    );
  }

  console.log(
    `\n${report.passageCount ?? 0} passages read, model ${report.model ?? "none"}, cost $${report.costUsd ?? "unknown"}, ${report.latencyMs ?? "?"}ms`,
  );

  if (report.status !== "answered") process.exitCode = 1;
});
