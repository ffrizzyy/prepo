import { eq } from "drizzle-orm";
import { extractMeeting } from "../ai/extract";
import { EVAL_CASES } from "../ai/eval-cases";
import {
  EVAL_THRESHOLDS,
  gateFailures,
  scoreActionItems,
  summarize,
  type EvalCaseScore,
  type EvalPrediction,
} from "../ai/eval";
import type { ExtractionProvider, ExtractionReply } from "../ai/types";
import { withWorkspace } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

/**
 * Extraction eval (PREPO.md 7.5), run without a model call:
 *   pnpm --filter @prepo/web db:eval
 *
 * Every case is a golden transcript plus the reply a model *did* give for it
 * (recorded here, not fetched). The reply goes through the real pipeline -
 * schema, grounding, owner resolution, date resolution, the write - and the
 * rows that land are scored against the gold labels. Three fixtures are
 * deliberately imperfect: one lost item, one invented item, one wrong owner
 * and one wrong date.
 *
 * What this gate can prove: a change to the prompt contract, grounding, member
 * resolution or due-date handling does not silently lose work on known inputs.
 * What it cannot prove: how a live model reads a transcript it has not seen.
 * That needs `db:ask-live` and a key, and it is not in CI.
 *
 * The database is fresh and thrown away, like every other `db:*` suite.
 */

const NOW = new Date("2026-10-21T09:00:00.000Z");
// The seeded members (and the meeting creator, Lena) are in Berlin. The date is
// compared back in the zone it was resolved in, not the machine's zone.
const MEETING_TIMEZONE = "Europe/Berlin";

const dateInZone = new Intl.DateTimeFormat("en-CA", {
  timeZone: MEETING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

let failures = 0;
function check(name: string, pass: boolean, detail = ""): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `, ${detail}` : ""}`);
  if (!pass) failures += 1;
}

function providerReturning(raw: unknown): ExtractionProvider {
  return {
    name: "fixture",
    async extract(): Promise<ExtractionReply> {
      return {
        raw,
        usage: {
          model: "fixture/eval-1",
          tokensIn: 1_100,
          tokensOut: 180,
          costUsd: 0,
          latencyMs: 0,
        },
      };
    },
  };
}

runCli(
  "eval.ts",
  async () => {
    /* ------------------------------------------------ the scorer has teeth */
    const oneGold = [{ title: "Draft the launch checklist", ownerId: "u1", dueDate: "2026-10-24" }];
    const perfect = scoreActionItems("self/perfect", oneGold, [
      { title: "Draft the launch checklist", ownerId: "u1", dueDate: "2026-10-24" },
    ]);
    const empty = scoreActionItems("self/empty", oneGold, []);
    const duplicated = scoreActionItems("self/duplicate", oneGold, [
      { title: "Draft the launch checklist", ownerId: "u1", dueDate: "2026-10-24" },
      { title: "Draft the launch checklist", ownerId: "u1", dueDate: "2026-10-24" },
    ]);

    check(
      "a perfect prediction scores 1.000 on every metric",
      perfect.itemF1 === 1 && perfect.ownersCorrect === 1 && perfect.deadlinesCorrect === 1,
    );
    check("an empty prediction scores 0.000 item F1", empty.itemF1 === 0);
    check(
      "a duplicate prediction costs precision",
      duplicated.precision === 0.5 && duplicated.recall === 1,
    );

    /* -------------------------------------------------------- the fixtures */
    await migrateAndApply();
    await seed();

    const northwind = (await resolveWorkspaceId("northwind"))!;

    const memberRows = await withWorkspace(northwind, (tx) =>
      tx
        .select({ id: t.users.id, name: t.users.name })
        .from(t.memberships)
        .innerJoin(t.users, eq(t.memberships.userId, t.users.id))
        .where(eq(t.memberships.workspaceId, northwind)),
    );
    const memberIdByName = new Map(memberRows.map((row) => [row.name, row.id]));
    const lenaId = memberIdByName.get("Lena Fischer");

    if (!lenaId) {
      throw new Error("the seed did not create Lena Fischer, so the eval cannot run");
    }

    const scores: EvalCaseScore[] = [];

    for (const evalCase of EVAL_CASES) {
      const meetingId = uuidv7();
      const segmentRows = evalCase.segments.map((segment, index) => ({
        id: uuidv7(),
        workspaceId: northwind,
        meetingId,
        idx: index,
        speakerLabel: segment.speaker,
        speakerUserId: null,
        startMs: index * 30_000,
        endMs: index * 30_000 + 20_000,
        text: segment.text,
      }));

      await withWorkspace(northwind, async (tx) => {
        await tx.insert(t.meetings).values({
          id: meetingId,
          workspaceId: northwind,
          title: evalCase.title,
          heldAt: new Date(evalCase.heldAt),
          source: "paste",
          status: "ready",
          createdBy: lenaId,
        });
        await tx.insert(t.transcriptSegments).values(segmentRows);
      });

      const report = await extractMeeting({
        workspaceId: northwind,
        meetingId,
        actorId: lenaId,
        provider: providerReturning(evalCase.fixture),
        now: NOW,
      });

      check(
        `${evalCase.id}: the recorded reply imports without being refused`,
        report.status === "extracted",
        report.reason ?? report.status,
      );
      check(
        `${evalCase.id}: grounding dropped no cited item`,
        (report.dropped ?? 0) === 0,
        `${report.dropped ?? 0} dropped`,
      );

      const rows = await withWorkspace(northwind, (tx) =>
        tx
          .select({
            title: t.actionItems.title,
            ownerId: t.actionItems.ownerId,
            dueAt: t.actionItems.dueAt,
          })
          .from(t.actionItems)
          .where(eq(t.actionItems.meetingId, meetingId)),
      );

      const predicted: EvalPrediction[] = rows.map((row) => ({
        title: row.title,
        ownerId: row.ownerId,
        dueDate: row.dueAt ? dateInZone.format(row.dueAt) : null,
      }));

      const gold = evalCase.gold.map((item) => {
        const ownerId = memberIdByName.get(item.ownerName);
        if (!ownerId) {
          // A gold label that cannot resolve is a broken fixture, not a model
          // miss; refusing here keeps the score honest.
          throw new Error(
            `${evalCase.id}: gold owner "${item.ownerName}" is not a northwind member`,
          );
        }
        return { title: item.title, ownerId, dueDate: item.dueDate };
      });

      const score = scoreActionItems(evalCase.id, gold, predicted);
      scores.push(score);

      console.log("");
      console.log(
        `${evalCase.id}: ${score.matched}/${score.gold} gold matched, ${score.predicted} predicted` +
          ` | item P ${score.precision.toFixed(3)} R ${score.recall.toFixed(3)} F1 ${score.itemF1.toFixed(3)}` +
          ` | owners ${score.ownersCorrect}/${score.ownersScored}` +
          ` | deadlines ${score.deadlinesCorrect}/${score.deadlinesScored}`,
      );
    }

    const summary = summarize(scores);
    const failuresList = gateFailures(summary);

    console.log("");
    console.log(
      `overall: ${summary.matched}/${summary.gold} gold matched, ${summary.predicted} predicted` +
        ` | item P ${summary.precision.toFixed(3)} R ${summary.recall.toFixed(3)} F1 ${summary.itemF1.toFixed(3)}` +
        ` | owners ${summary.ownersCorrect}/${summary.ownersScored} (${summary.ownerAccuracy.toFixed(3)})` +
        ` | deadlines ${summary.deadlinesCorrect}/${summary.deadlinesScored} (${summary.deadlineAccuracy.toFixed(3)})`,
    );
    console.log(
      `floors: item F1 >= ${EVAL_THRESHOLDS.itemF1.toFixed(2)}, ` +
        `owners >= ${EVAL_THRESHOLDS.ownerAccuracy.toFixed(2)}, ` +
        `deadlines >= ${EVAL_THRESHOLDS.deadlineAccuracy.toFixed(2)}`,
    );
    console.log(
      `EVAL ${JSON.stringify({
        itemF1: summary.itemF1,
        ownerAccuracy: summary.ownerAccuracy,
        deadlineAccuracy: summary.deadlineAccuracy,
        matched: summary.matched,
        predicted: summary.predicted,
        gold: summary.gold,
      })}`,
    );

    for (const failure of failuresList) {
      check(failure, false);
    }
    if (failuresList.length === 0) {
      console.log("the eval gate passed");
    }

    console.log("");
    if (failures === 0) {
      console.log("all eval checks passed");
      return;
    }

    throw new Error(`${failures} eval check(s) failed`);
  },
  "fresh",
);
