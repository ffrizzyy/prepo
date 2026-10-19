import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { withWorkspace } from "../db/client";
import { uuidv7 } from "../db/ids";
import { searchTranscript } from "../db/repo";
import * as t from "../db/schema";
import { askConfigProblem, askProvider } from "./openrouter";
import { rawAskSchema } from "./schema";
import type { AskPassage, AskProvider, AskReply } from "./types";

/**
 * Ask Prepo (PREPO.md §8.8): a question, the passages that might answer it, and
 * a cited answer that a reader can check.
 *
 * Three deliberate choices, all of them about not overstating what this is:
 *
 * - **No embeddings.** Retrieval is Postgres full-text (`tsvector` with
 *   `websearch_to_tsquery`, built in `drizzle/policies/002_search.sql`), because
 *   §1.3 asks for exactly that and because a similarity score nobody can read is
 *   harder to debug than a ranking they can. Payloads are passages, not whole
 *   transcripts.
 * - **Cited or labelled.** Every answer arrives with the passages it used, and
 *   the passages the reader sees are the rows themselves, not a paraphrase. An
 *   answer that cites nothing is shown as such rather than dressed up as
 *   sourced, and "the passages do not answer that" is a permitted answer.
 * - **Bounded and scoped.** The question is capped in length, runs are counted
 *   against a monthly budget, and retrieval happens inside one tenant scope, so
 *   the agent can only ever see what the asking user's workspace contains.
 *
 * What is not here, and is documented rather than implied: the streaming
 * response, the side panel, and the deep link to the exact transcript line and
 * audio moment. The answer links to the meeting's transcript tab, and the quoted
 * line is shown inline.
 */

/** Recorded in `ai_runs.purpose`; also what the budget counts. */
export const ASK_PURPOSE = "ask_workspace";

export type AskLimits = {
  /** A question is a sentence or two, not a pasted document. */
  maxQuestionChars: number;
  /** Runs per workspace per calendar month (UTC). */
  monthlyRuns: number;
  /** Transcript passages sent, ranked. */
  segments: number;
  /** Recent meeting entries sent. */
  meetings: number;
  /** Ticket entries sent. */
  tickets: number;
};

export const DEFAULT_ASK_LIMITS: AskLimits = {
  maxQuestionChars: 500,
  monthlyRuns: 300,
  segments: 20,
  meetings: 12,
  tickets: 40,
};

export type AskStatus =
  | "answered"
  | "unconfigured"
  | "empty-question"
  | "too-long"
  | "over-budget"
  | "no-sources"
  | "invalid"
  | "failed";

export type AskSource = {
  kind: "transcript" | "meeting" | "ticket";
  /**
   * Ids, not URLs: this module does not know the workspace slug, and building a
   * link from an id the caller already has keeps the href out of the server
   * logic where it could drift from the route.
   */
  meetingId: string | null;
  segmentId: string | null;
  ticketKey: string | null;
  /** One line for the source list. */
  label: string;
  /** The transcript words, when the source is a transcript line. */
  quote: string | null;
  startMs: number | null;
};

export type AskReport = {
  status: AskStatus;
  reason?: string;
  question?: string;
  answer?: string;
  confident?: boolean;
  /** A confident answer that cited nothing. Surfaced, never hidden. */
  uncited?: boolean;
  sources?: AskSource[];
  /** How many passages retrieval handed the model. */
  passageCount?: number;
  /** Citations the model invented. Non-zero means the answer was not trusted. */
  droppedCitations?: number;
  provider?: string;
  model?: string;
  costUsd?: string | null;
  latencyMs?: number;
};

/** What the page needs to say honestly before the box is used. */
export function askReadiness(
  env: Record<string, string | undefined> = process.env,
): { ready: boolean; reason: string | null } {
  const problem = askConfigProblem(env);
  if (problem === null) return { ready: true, reason: null };
  return {
    ready: false,
    reason: `${problem}. Ask Prepo needs a language model; retrieval works without one and is what feeds it.`,
  };
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function day(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * The passages, in one pass over three sources. Transcript lines are ranked by
 * the question; meetings and tickets are listed rather than searched, because a
 * workspace-sized ticket list is both cheap to send and the only way to answer
 * "which of Sam's tasks are overdue" without guessing what "Sam" implies.
 */
async function loadPassages(
  workspaceId: string,
  question: string,
  limits: AskLimits,
): Promise<AskPassage[]> {
  const matched = await searchTranscript(workspaceId, question, limits.segments);

  const rest = await withWorkspace(workspaceId, async (tx) => {
    const meetingRows = await tx
      .select({
        id: t.meetings.id,
        title: t.meetings.title,
        heldAt: t.meetings.heldAt,
        summary: t.meetings.summary,
      })
      .from(t.meetings)
      .orderBy(desc(t.meetings.heldAt))
      // Bounded on purpose: a title lookup for a matched segment plus the recent
      // summaries that get sent. A workspace with more history than this sends
      // the most recent, which is what a question about "the last three
      // meetings" means anyway.
      .limit(200);

    const ticketRows = await tx
      .select({
        key: t.tickets.key,
        title: t.tickets.title,
        status: t.tickets.status,
        priority: t.tickets.priority,
        dueAt: t.tickets.dueAt,
        ownerName: t.users.name,
      })
      .from(t.tickets)
      .leftJoin(t.users, eq(t.tickets.assigneeId, t.users.id))
      .orderBy(asc(t.tickets.position), asc(t.tickets.key))
      .limit(limits.tickets);

    return { meetingRows, ticketRows };
  });

  const titleById = new Map(rest.meetingRows.map((row) => [row.id, row.title]));
  const passages: AskPassage[] = [];

  matched.forEach((segment, index) => {
    passages.push({
      token: `s${index + 1}`,
      kind: "transcript",
      text: segment.text,
      meetingTitle: titleById.get(segment.meetingId) ?? "a meeting",
      speaker: segment.speakerLabel ?? "Unknown",
      startMs: segment.startMs,
      segmentId: segment.id,
      meetingId: segment.meetingId,
    });
  });

  rest.meetingRows.slice(0, limits.meetings).forEach((meeting, index) => {
    const held = day(meeting.heldAt) ?? "an unrecorded date";
    passages.push({
      token: `m${index + 1}`,
      kind: "meeting",
      text: `${meeting.title} (held ${held}). ${
        meeting.summary ? `Minutes: ${meeting.summary}` : "No minutes were recorded."
      }`,
      meetingTitle: meeting.title,
      meetingId: meeting.id,
    });
  });

  for (const ticket of rest.ticketRows) {
    passages.push({
      token: ticket.key,
      kind: "ticket",
      text: `${ticket.key} "${ticket.title}", status ${ticket.status}, priority ${ticket.priority}, ${
        ticket.ownerName ? `owner ${ticket.ownerName}` : "unassigned"
      }, due ${day(ticket.dueAt) ?? "no date"}`,
      ticketKey: ticket.key,
    });
  }

  return passages;
}

async function recordRun(input: {
  workspaceId: string;
  usage: { model: string; tokensIn: number | null; tokensOut: number | null; costUsd: number | null; latencyMs: number };
  now: Date;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx.insert(t.aiRuns).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      purpose: ASK_PURPOSE,
      model: input.usage.model,
      tokensIn: input.usage.tokensIn,
      tokensOut: input.usage.tokensOut,
      costUsd: input.usage.costUsd === null ? null : input.usage.costUsd.toFixed(6),
      latencyMs: input.usage.latencyMs,
      // No trace id: the question is the one piece of free text a person writes
      // here, and it is not stored anywhere.
      traceId: null,
      createdAt: input.now,
    }),
  );
}

export async function askWorkspace(input: {
  workspaceId: string;
  question: string;
  /** Omitted: resolve from the environment. Null: explicitly none. */
  provider?: AskProvider | null;
  limits?: Partial<AskLimits>;
  now?: Date;
}): Promise<AskReport> {
  const now = input.now ?? new Date();
  const limits = { ...DEFAULT_ASK_LIMITS, ...input.limits };
  const question = input.question.replace(/\s+/g, " ").trim();

  if (question.length < 3) {
    return {
      status: "empty-question",
      reason: "Ask a question in a few words at least.",
    };
  }

  if (question.length > limits.maxQuestionChars) {
    return {
      status: "too-long",
      reason: `That question is ${question.length.toLocaleString("en-US")} characters; one question is capped at ${limits.maxQuestionChars.toLocaleString("en-US")}. Ask the part you need.`,
    };
  }

  const provider = input.provider === undefined ? askProvider() : input.provider;
  if (!provider) {
    return {
      status: "unconfigured",
      reason: `Ask Prepo is not configured: ${askConfigProblem() ?? "no provider is available"}.`,
      question,
    };
  }

  const runsThisMonth = await withWorkspace(input.workspaceId, async (tx) => {
    const [runs] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.aiRuns)
      .where(
        and(eq(t.aiRuns.purpose, ASK_PURPOSE), gte(t.aiRuns.createdAt, startOfMonth(now))),
      );
    return runs?.count ?? 0;
  });

  if (runsThisMonth >= limits.monthlyRuns) {
    return {
      status: "over-budget",
      question,
      provider: provider.name,
      reason: `This workspace has used ${runsThisMonth} of ${limits.monthlyRuns} Ask Prepo runs this month. The cap resets on the first of the month (UTC).`,
    };
  }

  const passages = await loadPassages(input.workspaceId, question, limits);
  if (passages.length === 0) {
    return {
      status: "no-sources",
      question,
      provider: provider.name,
      reason:
        "Nothing in this workspace matches the question. Ask Prepo reads transcripts, minutes and tickets, so try the words that were actually used.",
    };
  }

  let reply: AskReply;
  try {
    reply = await provider.answer({ question, passages });
  } catch (error) {
    return {
      status: "failed",
      question,
      provider: provider.name,
      passageCount: passages.length,
      reason:
        error instanceof Error && error.message
          ? error.message
          : "The answering model failed, so there is no answer.",
    };
  }

  const parsed = rawAskSchema.safeParse(reply.raw);
  if (!parsed.success) {
    await recordRun({ workspaceId: input.workspaceId, usage: reply.usage, now });
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "the top level";
    return {
      status: "invalid",
      question,
      provider: provider.name,
      model: reply.usage.model,
      passageCount: passages.length,
      costUsd: reply.usage.costUsd === null ? null : reply.usage.costUsd.toFixed(6),
      reason: `The model's answer did not match the answer schema at ${where}, so it was not shown.`,
    };
  }

  // Ground the citations the way extraction grounds evidence: a token the model
  // wrote that was never sent is not a source, and it is counted rather than
  // quietly ignored.
  const byToken = new Map(passages.map((passage) => [passage.token, passage]));
  const byUpperKey = new Map(
    passages
      .filter((passage) => passage.kind === "ticket")
      .map((passage) => [passage.token.toUpperCase(), passage]),
  );

  const sources: AskSource[] = [];
  const seen = new Set<string>();
  let droppedCitations = 0;

  for (const ref of parsed.data.sources) {
    const key = typeof ref === "string" ? ref.trim() : "";
    if (!key) continue;
    const passage = byToken.get(key) ?? byUpperKey.get(key.toUpperCase());
    if (!passage) {
      droppedCitations += 1;
      continue;
    }
    if (seen.has(passage.token)) continue;
    seen.add(passage.token);

    if (passage.kind === "transcript") {
      sources.push({
        kind: "transcript",
        meetingId: passage.meetingId ?? null,
        segmentId: passage.segmentId ?? null,
        ticketKey: null,
        label: `${passage.speaker ?? "Someone"} in "${passage.meetingTitle ?? "a meeting"}"`,
        quote: passage.text,
        startMs: passage.startMs ?? null,
      });
      continue;
    }

    if (passage.kind === "ticket") {
      sources.push({
        kind: "ticket",
        meetingId: null,
        segmentId: null,
        ticketKey: passage.ticketKey ?? passage.token,
        label: passage.token,
        quote: null,
        startMs: null,
      });
      continue;
    }

    sources.push({
      kind: "meeting",
      meetingId: passage.meetingId ?? null,
      segmentId: null,
      ticketKey: null,
      label: `"${passage.meetingTitle ?? "a meeting"}"`,
      quote: null,
      startMs: null,
    });
  }

  await recordRun({ workspaceId: input.workspaceId, usage: reply.usage, now });

  return {
    status: "answered",
    question,
    answer: parsed.data.answer.trim(),
    confident: parsed.data.confident,
    uncited: sources.length === 0,
    sources,
    passageCount: passages.length,
    droppedCitations,
    provider: provider.name,
    model: reply.usage.model,
    costUsd: reply.usage.costUsd === null ? null : reply.usage.costUsd.toFixed(6),
    latencyMs: reply.usage.latencyMs,
  };
}

/** Exported for the suite and the page: the passage budget is part of the contract. */
export { loadPassages };
