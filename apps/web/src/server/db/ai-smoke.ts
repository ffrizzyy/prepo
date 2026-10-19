/**
 * Checks the two remaining phase 7 pieces against a throwaway database:
 * the Meeting Necessity Score (PREPO.md §7.3) and Ask Prepo (§8.8).
 *
 *   pnpm --filter @prepo/web db:ai-smoke
 *
 * Two rules from the delete-meeting check are kept, because they are the two
 * that make a suite like this reusable:
 *
 * - It runs in its own temporary `PGLITE_DIR`, never the working `.pglite`, so
 *   it reseeds nothing the demo depends on.
 * - Every model call is a fixture provider, so the suite passes with no
 *   `OPENROUTER_API_KEY` and cannot spend anything. The two checks that must
 *   prove "the model was not called" pass a provider that throws instead.
 *
 * The question it answers is not "does the happy path work" but "is the number
 * arithmetic, and is the answer honest": the score is recomputed from stored
 * rows, the citations are resolved against the passages that were actually sent,
 * and a refused run is refused for the stated reason.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { listTicketsView } from "../queries";
import {
  ASK_PURPOSE,
  DEFAULT_ASK_LIMITS,
  askReadiness,
  askWorkspace,
  loadPassages,
} from "../ai/ask";
import { computeNecessity, runNecessity, scoreNecessity } from "../ai/necessity";
import { runExtraction } from "../ai/extract";
import { askConfigProblem, askModel } from "../ai/openrouter";
import type { AskProvider, ExtractionProvider } from "../ai/types";
import { getPglite, withWorkspace } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures += 1;
}

/** A row in a prior meeting, for the pure arithmetic checks. */
function earlier(title: string) {
  return { title, meetingId: "meeting-earlier", meetingTitle: "Earlier standup" };
}

function earlierDecision(text: string) {
  return { text, meetingId: "meeting-earlier", meetingTitle: "Earlier standup" };
}

/* ------------------------------------------------------------ fixture models */

function answerFixture(raw: unknown): AskProvider {
  return {
    name: "fixture",
    async answer() {
      return {
        raw,
        usage: {
          model: "fixture/ask-1",
          tokensIn: 912,
          tokensOut: 74,
          costUsd: 0.0012,
          latencyMs: 23,
        },
      };
    },
  };
}

/** Fails the test if the run calls a model it should have refused first. */
const MUST_NOT_ANSWER: AskProvider = {
  name: "must-not-run",
  async answer() {
    throw new Error("the provider was called when the run should have been refused");
  },
};

const BROKEN: AskProvider = {
  name: "broken",
  async answer() {
    throw new Error("The model provider returned 502.");
  },
};

/** A valid extraction, so the scheduled job can be exercised without a key. */
function extractionFixture(title: string): ExtractionProvider {
  return {
    name: "fixture",
    async extract() {
      return {
        raw: {
          summary: "The team agreed to get the SOW to legal.",
          decisions: [],
          openQuestions: [],
          actionItems: [
            {
              title,
              description: null,
              ownerRaw: null,
              dueDate: null,
              priority: "p2",
              confidence: 0.9,
              sourceSegmentIds: ["s1"],
            },
          ],
        },
        usage: {
          model: "fixture/extract-1",
          tokensIn: 1_240,
          tokensOut: 218,
          costUsd: 0.0021,
          latencyMs: 31,
        },
      };
    },
  };
}

runCli("ai-smoke.ts", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "prepo-ai-"));
  process.env.PGLITE_DIR = workdir;
  delete process.env.DATABASE_URL;

  try {
    await migrateAndApply();
    await seed();

    const northwind = (await resolveWorkspaceId("northwind"))!;
    const globex = (await resolveWorkspaceId("globex"))!;

    /* ------------------------------------------- necessity, as pure arithmetic */

    check(
      "a meeting with nothing extracted is not scored",
      scoreNecessity({
        items: [],
        decisions: [],
        priorItems: [earlier("Anything at all")],
        priorDecisions: [],
      }) === null,
    );

    check(
      "a meeting with no earlier content is not scored, rather than scored 100",
      scoreNecessity({
        items: [{ title: "Hire a designer" }],
        decisions: [],
        priorItems: [],
        priorDecisions: [],
      }) === null,
    );

    const repeated = scoreNecessity({
      items: [{ title: "Send the revised SOW to legal" }],
      decisions: [],
      priorItems: [earlier("Send the revised SOW to legal")],
      priorDecisions: [],
    });
    check(
      "an item that restates an earlier item scores 100",
      repeated?.score === 100,
      String(repeated?.score),
    );
    check(
      "and the reason names the earlier meeting",
      repeated?.strongest?.meetingTitle === "Earlier standup",
      repeated?.reason,
    );

    const novel = scoreNecessity({
      items: [{ title: "Hire a designer" }],
      decisions: [],
      priorItems: [earlier("Fix the checkout webhook retry bug")],
      priorDecisions: [],
    });
    check("an unrelated item scores 0", novel?.score === 0, String(novel?.score));

    const half = scoreNecessity({
      items: [
        { title: "Send the revised SOW to legal" },
        { title: "Hire a designer" },
      ],
      decisions: [],
      priorItems: [earlier("Send the revised SOW to legal")],
      priorDecisions: [],
    });
    check("one of two items repeating scores 50", half?.score === 50, String(half?.score));

    const decisionOnly = scoreNecessity({
      items: [],
      decisions: ["Cut the enterprise tier"],
      priorItems: [],
      priorDecisions: [earlierDecision("Cut the enterprise tier")],
    });
    check(
      "a decision is enough on its own, with no items at all",
      decisionOnly?.score === 100,
      String(decisionOnly?.score),
    );

    const counted = scoreNecessity({
      items: [
        { title: "Send the revised SOW to legal" },
        { title: "Hire a designer" },
      ],
      decisions: ["Ship in March", "Cut the enterprise tier"],
      priorItems: [earlier("Send the revised SOW to legal")],
      priorDecisions: [earlierDecision("Ship in March")],
    });
    check(
      "items and decisions are weighted by count, not by kind",
      counted?.score === 50,
      String(counted?.score),
    );

    const nearDuplicate = scoreNecessity({
      items: [{ title: "Send the SOW to legal today" }],
      decisions: [],
      priorItems: [earlier("Send the SOW to legal")],
      priorDecisions: [],
    });
    check(
      "a near-duplicate above the shared 0.6 threshold counts as a repeat",
      nearDuplicate?.score === 100,
      String(nearDuplicate?.score),
    );

    /* -------------------------------------------- necessity, against real rows */

    const before = await meetingScores(northwind);
    check(
      "the seed ships hand-written scores, so the pass has something to replace",
      before.some((row) => row.necessityScore !== null),
    );

    const run = await runNecessity();
    check(
      "every meeting is accounted for",
      run.scored + run.notScored === run.meetings,
      `${run.scored} scored + ${run.notScored} unscored of ${run.meetings}`,
    );
    check("the pass scores meetings", run.scored >= 1, String(run.scored));
    check(
      "and leaves the ones with nothing to compare against alone",
      run.notScored >= 1,
      String(run.notScored),
    );

    const after = await meetingScores(northwind);
    check(
      "the earliest meeting is never scored, because nothing came before it",
      after[0]?.necessityScore === null,
      `${after[0]?.title}: ${String(after[0]?.necessityScore)}`,
    );
    check(
      "a stale seeded value is cleared rather than kept",
      before.some((row) => row.necessityScore !== null) &&
        after.some((row) => row.necessityScore === null),
    );
    check(
      "every score is a whole number in 0 to 100",
      after.every(
        (row) =>
          row.necessityScore === null ||
          (Number.isInteger(row.necessityScore) &&
            row.necessityScore >= 0 &&
            row.necessityScore <= 100),
      ),
      after.map((row) => String(row.necessityScore)).join(","),
    );

    const second = await runNecessity();
    const third = await meetingScores(northwind);
    check(
      "running it twice changes nothing",
      third.map((row) => String(row.necessityScore)).join(",") ===
        after.map((row) => String(row.necessityScore)).join(","),
    );
    check("and the second pass agrees on the count", second.scored === run.scored);

    const globexMeetings = await meetingScores(globex);
    const crossTenant = await computeNecessity({
      workspaceId: northwind,
      meetingId: globexMeetings[0]!.id,
    });
    check(
      "a meeting in another workspace is not scoreable, and not visible as missing",
      crossTenant.status === "not-found",
    );

    /* ------------------------------------------------------- Ask Prepo, config */

    check(
      "with nothing set, the reason names OPENROUTER_API_KEY",
      askConfigProblem({})?.includes("OPENROUTER_API_KEY") === true,
    );
    check(
      "with a key but no ask model, the reason names AI_MODEL_ASK",
      askConfigProblem({ OPENROUTER_API_KEY: "k" })?.includes("AI_MODEL_ASK") === true,
    );
    check(
      "the extraction model is the documented fallback",
      askConfigProblem({ OPENROUTER_API_KEY: "k", AI_MODEL_EXTRACT: "m" }) === null,
    );
    check(
      "its own model wins when it is set",
      askModel({ OPENROUTER_API_KEY: "k", AI_MODEL_EXTRACT: "m", AI_MODEL_ASK: "fast" }) ===
        "fast",
    );
    check(
      "the page is told it is not ready, and why",
      askReadiness({}).ready === false &&
        (askReadiness({}).reason ?? "").includes("OPENROUTER_API_KEY"),
    );
    check(
      "and told it is ready when configured",
      askReadiness({ OPENROUTER_API_KEY: "k", AI_MODEL_EXTRACT: "m" }).ready === true,
    );

    /* --------------------------------------------------- Ask Prepo, retrieval */

    const passages = await loadPassages(northwind, "checkout webhook retries", DEFAULT_ASK_LIMITS);
    const transcripts = passages.filter((passage) => passage.kind === "transcript");
    check(
      "retrieval finds the transcript lines that say webhook",
      transcripts.some((passage) => /webhook/i.test(passage.text)),
      `${transcripts.length} transcript passages of ${passages.length}`,
    );
    check(
      "every transcript passage carries the row it came from",
      transcripts.every((passage) => Boolean(passage.segmentId) && Boolean(passage.meetingId)),
    );
    check(
      "meetings and tickets come along for the structured questions",
      passages.some((passage) => passage.kind === "meeting") &&
        passages.some((passage) => passage.kind === "ticket"),
    );
    check(
      "a ticket is cited by its own key, not by an invented id",
      passages
        .filter((passage) => passage.kind === "ticket")
        .every((passage) => passage.token === passage.ticketKey),
    );

    const northwindTitles = new Set(before.map((row) => row.title));
    check(
      "no passage names a meeting from another workspace",
      passages.every(
        (passage) =>
          passage.meetingTitle === undefined || northwindTitles.has(passage.meetingTitle),
      ),
    );

    /* ----------------------------------------------- Ask Prepo, refusals first */

    const empty = await askWorkspace({
      workspaceId: northwind,
      question: "   ",
      provider: MUST_NOT_ANSWER,
    });
    check("an empty question is refused before any model call", empty.status === "empty-question");

    const long = await askWorkspace({
      workspaceId: northwind,
      question: "x".repeat(501),
      provider: MUST_NOT_ANSWER,
    });
    check(
      "an over-long question is refused, not truncated",
      long.status === "too-long" && (long.reason ?? "").includes("501"),
      long.reason,
    );

    const unconfigured = await askWorkspace({
      workspaceId: northwind,
      question: "What is blocking the launch?",
      provider: null,
    });
    check("with no model, the run is refused and says so", unconfigured.status === "unconfigured");

    const broke = await askWorkspace({
      workspaceId: northwind,
      question: "What is blocking the launch?",
      provider: MUST_NOT_ANSWER,
      limits: { monthlyRuns: 0 },
    });
    check(
      "the monthly cap refuses the run before the model is called",
      broke.status === "over-budget",
      broke.reason,
    );

    const nothing = await askWorkspace({
      workspaceId: northwind,
      question: "querytermthatmatchesnothinganywhere",
      provider: MUST_NOT_ANSWER,
      limits: { segments: 0, meetings: 0, tickets: 0 },
    });
    check(
      "with nothing retrieved it refuses, rather than answering from nothing",
      nothing.status === "no-sources",
      nothing.reason,
    );

    /* ------------------------------------------------ Ask Prepo, a real answer */

    const runsBefore = await askRuns(northwind);
    const ticketKey = (await listTicketsView(northwind))[0]?.key;
    check("the workspace has a ticket to cite", Boolean(ticketKey));

    // The token to cite is taken from the same retrieval the run will do, so the
    // check does not secretly depend on which words stem to which lexeme.
    const answeredQuestion = "What is the checkout webhook retry bug?";
    const answeredPassages = await loadPassages(
      northwind,
      answeredQuestion,
      DEFAULT_ASK_LIMITS,
    );
    const citeable = answeredPassages.find(
      (passage) => passage.kind === "transcript",
    )?.token;
    check(
      "the question being asked retrieves a transcript line to cite",
      Boolean(citeable),
      `${answeredPassages.filter((passage) => passage.kind === "transcript").length} transcript passages`,
    );

    const answered = await askWorkspace({
      workspaceId: northwind,
      question: answeredQuestion,
      provider: answerFixture({
        answer: "Checkout webhook retries are the blocker.",
        sources: [citeable ?? "s1", "zzz-not-a-passage"],
        confident: true,
      }),
    });

    check(
      "an answer comes back as the model wrote it",
      answered.status === "answered" &&
        (answered.answer ?? "").startsWith("Checkout webhook retries"),
      answered.status,
    );
    check(
      "a citation to a passage that was never sent is dropped and counted",
      answered.droppedCitations === 1,
      String(answered.droppedCitations),
    );
    check(
      "a citation that does resolve becomes a source with its line and its meeting",
      (answered.sources ?? []).some(
        (source) =>
          source.kind === "transcript" &&
          Boolean(source.segmentId) &&
          Boolean(source.meetingId) &&
          Boolean(source.quote),
      ),
    );
    check(
      "an answer with a real citation is not flagged as uncited",
      answered.uncited === false,
    );
    check(
      "the model and the cost are reported, not hidden",
      answered.model === "fixture/ask-1" && answered.costUsd === "0.001200",
      `${answered.model} ${answered.costUsd}`,
    );
    check(
      "how many passages the model read is reported",
      (answered.passageCount ?? 0) === answeredPassages.length,
      `${answered.passageCount} of ${answeredPassages.length}`,
    );

    const citedTicket = await askWorkspace({
      workspaceId: northwind,
      question: "Which ticket is this?",
      provider: answerFixture({
        answer: "It is on the board.",
        sources: [ticketKey!.toLowerCase()],
        confident: true,
      }),
    });
    check(
      "a ticket cited in lower case still resolves to the ticket",
      (citedTicket.sources ?? []).some(
        (source) => source.kind === "ticket" && source.ticketKey === ticketKey,
      ),
      JSON.stringify(citedTicket.sources),
    );

    const uncited = await askWorkspace({
      workspaceId: northwind,
      question: "Is the launch going well?",
      provider: answerFixture({ answer: "Probably fine.", sources: [], confident: true }),
    });
    check(
      "an answer that cites nothing is flagged rather than dressed up",
      uncited.status === "answered" && uncited.uncited === true,
    );

    const unsure = await askWorkspace({
      workspaceId: northwind,
      question: "What did we decide about the data centre move?",
      provider: answerFixture({
        answer: "The passages do not cover that.",
        sources: [],
        confident: false,
      }),
    });
    check(
      "the model saying it does not know is carried through",
      unsure.status === "answered" && unsure.confident === false,
    );

    const runsAfterAnswer = await askRuns(northwind);
    check(
      "each answered run is recorded once",
      runsAfterAnswer.length === runsBefore.length + 4,
      `${runsAfterAnswer.length - runsBefore.length} runs for 4 answers`,
    );
    check(
      "the question itself is never written to the database",
      runsAfterAnswer.every((row) => row.traceId === null),
    );
    check(
      "and only ask runs are counted against the ask budget",
      runsAfterAnswer.every((row) => row.purpose === ASK_PURPOSE),
    );

    /* -------------------------------------------------------- Ask Prepo, a mess */

    const runsBeforeBad = await askRuns(northwind);
    const invalid = await askWorkspace({
      workspaceId: northwind,
      question: "What is blocking the launch?",
      provider: answerFixture({ answer: 42, sources: [], confident: "maybe" }),
    });
    check(
      "an answer that breaks the schema is refused, not shown",
      invalid.status === "invalid" && (invalid.reason ?? "").includes("answer"),
      invalid.reason,
    );
    const runsAfterBad = await askRuns(northwind);
    check(
      "and the rejected run is still recorded, because it was still paid for",
      runsAfterBad.length === runsBeforeBad.length + 1,
    );

    const failed = await askWorkspace({
      workspaceId: northwind,
      question: "What is blocking the launch?",
      provider: BROKEN,
    });
    check(
      "a provider failure is reported with the provider's own words",
      failed.status === "failed" && (failed.reason ?? "").includes("502"),
      failed.reason,
    );

    /* ------------------------- the job keeps the score in step, invisibly */

    // The scheduled path is the one nobody clicks, so it gets its own check: a
    // meeting held after everything seeded, with no summary, whose one action
    // item restates a seeded item. The job should extract it, and the necessity
    // pass running behind the job should find the repetition.
    const seededItem = await withWorkspace(northwind, (tx) =>
      tx.select({ title: t.actionItems.title }).from(t.actionItems).limit(1),
    );
    const repeatTitle = seededItem[0]?.title;
    check("there is a seeded action item to restate", Boolean(repeatTitle));

    const jobMeetingId = uuidv7();
    await withWorkspace(northwind, async (tx) => {
      await tx.insert(t.meetings).values({
        id: jobMeetingId,
        workspaceId: northwind,
        title: "A sync held after everything else",
        // Far enough ahead that every seeded meeting is "earlier" for it.
        heldAt: new Date("2099-01-01T10:00:00.000Z"),
        source: "paste",
        status: "ready",
        createdBy: null,
      });
      await tx.insert(t.transcriptSegments).values({
        id: uuidv7(),
        workspaceId: northwind,
        meetingId: jobMeetingId,
        idx: 0,
        speakerLabel: "Lena",
        speakerUserId: null,
        startMs: 0,
        endMs: 20_000,
        text: "Lena: let us get the SOW to legal this week.",
      });
    });

    const job = await runExtraction({
      provider: extractionFixture(repeatTitle ?? "Something"),
    });
    check(
      "the scheduled job extracts a meeting that has no summary",
      job.extracted >= 1,
      `${job.extracted} extracted of ${job.scanned} scanned`,
    );

    const jobMeeting = await withWorkspace(northwind, (tx) =>
      tx
        .select({
          summary: t.meetings.summary,
          necessityScore: t.meetings.necessityScore,
        })
        .from(t.meetings)
        .where(eq(t.meetings.id, jobMeetingId)),
    );
    check("its minutes were written", Boolean(jobMeeting[0]?.summary));
    check(
      "and the necessity pass ran behind the job: a restated item scores 100",
      jobMeeting[0]?.necessityScore === 100,
      String(jobMeeting[0]?.necessityScore),
    );

    if (failures > 0) process.exitCode = 1;
    console.log(`\n${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  } finally {
    try {
      await getPglite().close();
    } catch {
      // Nothing to do: the directory is a temp one either way.
    }
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
});

/* ------------------------------------------------------------------- helpers */

async function meetingScores(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.meetings.id,
        title: t.meetings.title,
        heldAt: t.meetings.heldAt,
        necessityScore: t.meetings.necessityScore,
      })
      .from(t.meetings)
      .orderBy(asc(t.meetings.heldAt)),
  );
}

async function askRuns(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.aiRuns.id,
        purpose: t.aiRuns.purpose,
        model: t.aiRuns.model,
        traceId: t.aiRuns.traceId,
      })
      .from(t.aiRuns)
      .where(eq(t.aiRuns.purpose, ASK_PURPOSE)),
  );
}
