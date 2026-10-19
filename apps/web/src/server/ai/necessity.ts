import { and, asc, eq, lt, ne } from "drizzle-orm";
import { withWorkspace } from "../db/client";
import * as t from "../db/schema";
import { jaccard, titleTokens } from "./ground";

/**
 * The Meeting Necessity Score (PREPO.md §7.3): the likelihood that this meeting
 * repeated an earlier one, or only talked about one.
 *
 * It is arithmetic over what was extracted, for the same reason clarity is. A
 * second model opinion would be a number nobody can check, and the review screen
 * has to be able to say *why* a meeting scored 90. The two things it counts are
 * declarable:
 *
 * - **Restated work**: an action item whose title matches an earlier meeting's
 *   item at the same 0.6 Jaccard the within-meeting duplicate flag uses. Sharing
 *   the threshold is load-bearing: two definitions of "the same" would let the
 *   two rules disagree about one pair of titles.
 * - **Restated decisions**: the same rule over the meetings' `keyDecisions`.
 *
 * The score is `100 * repeated / comparable`, where `comparable` is every item
 * and decision on this meeting. A meeting that produced nothing but the echo of
 * a previous one scores 100; one that produced three new items and no decisions
 * scores 0. "Higher is more redundant" is the direction the UI already assumed
 * (`<Score ... invert />`), so it is the direction kept here.
 *
 * It returns null rather than a guess when there is nothing to compare: a
 * meeting with no items and no decisions, or a workspace where nothing was
 * recorded before it. That is the same honesty rule as the clarity score, and it
 * is why the column stays nullable.
 */

/** Matches `ground.ts`, which flags a possible duplicate inside one meeting. */
export const REPEAT_THRESHOLD = 0.6;

export type NecessityMatch = {
  /** What in this meeting repeated something. */
  text: string;
  /** The earlier text it is close to. */
  matchedText: string;
  meetingId: string;
  meetingTitle: string;
  similarity: number;
};

export type NecessityScore = {
  score: number;
  items: number;
  repeatedItems: number;
  decisions: number;
  repeatedDecisions: number;
  /** The closest single match, for the reason line. Null when nothing repeats. */
  strongest: NecessityMatch | null;
  reason: string;
};

export type NecessityInput = {
  items: { title: string }[];
  decisions: string[];
  priorItems: { title: string; meetingId: string; meetingTitle: string }[];
  priorDecisions: { text: string; meetingId: string; meetingTitle: string }[];
};

function best(
  text: string,
  pool: { text: string; meetingId: string; meetingTitle: string }[],
): { match: NecessityMatch; repeat: boolean } | null {
  const tokens = titleTokens(text);
  if (tokens.size === 0) return null;

  let closest: NecessityMatch | null = null;
  for (const candidate of pool) {
    const similarity = jaccard(tokens, titleTokens(candidate.text));
    if (!closest || similarity > closest.similarity) {
      closest = {
        text,
        matchedText: candidate.text,
        meetingId: candidate.meetingId,
        meetingTitle: candidate.meetingTitle,
        similarity: Math.round(similarity * 1_000) / 1_000,
      };
    }
  }

  if (!closest) return null;
  return { match: closest, repeat: closest.similarity >= REPEAT_THRESHOLD };
}

/**
 * Pure, so the suite can pin the arithmetic without a database or a key.
 * Returns null when the score would be a guess rather than a measurement.
 */
export function scoreNecessity(input: NecessityInput): NecessityScore | null {
  const comparable = input.items.length + input.decisions.length;
  if (comparable === 0) return null;

  const priorItems = input.priorItems.map((row) => ({
    text: row.title,
    meetingId: row.meetingId,
    meetingTitle: row.meetingTitle,
  }));
  const priorDecisions = input.priorDecisions.map((row) => ({
    text: row.text,
    meetingId: row.meetingId,
    meetingTitle: row.meetingTitle,
  }));

  // Nothing was recorded before this meeting, so there is nothing it could have
  // repeated. Null, not zero: zero would claim it brought something new.
  if (priorItems.length === 0 && priorDecisions.length === 0) return null;

  let repeatedItems = 0;
  let repeatedDecisions = 0;
  let strongest: NecessityMatch | null = null;

  const note = (found: NecessityMatch | null): void => {
    if (!found) return;
    if (!strongest || found.similarity > strongest.similarity) strongest = found;
  };

  for (const item of input.items) {
    const result = best(item.title, priorItems);
    if (result?.repeat) repeatedItems += 1;
    note(result?.match ?? null);
  }

  for (const decision of input.decisions) {
    const result = best(decision, priorDecisions);
    if (result?.repeat) repeatedDecisions += 1;
    note(result?.match ?? null);
  }

  const repeated = repeatedItems + repeatedDecisions;
  const score = Math.round((100 * repeated) / comparable);

  const parts: string[] = [];
  parts.push(
    input.items.length > 0
      ? `${repeatedItems} of ${input.items.length} action item${input.items.length === 1 ? "" : "s"} restate earlier work`
      : "no action items were extracted",
  );
  parts.push(
    input.decisions.length > 0
      ? `${repeatedDecisions} of ${input.decisions.length} decision${input.decisions.length === 1 ? "" : "s"} restate an earlier decision`
      : "no decisions were recorded",
  );
  if (strongest && repeated > 0) {
    const top: NecessityMatch = strongest;
    parts.push(
      `closest: "${top.text}" to "${top.matchedText}" in "${top.meetingTitle}" (${top.similarity})`,
    );
  }

  return {
    score,
    items: input.items.length,
    repeatedItems,
    decisions: input.decisions.length,
    repeatedDecisions,
    strongest: repeated > 0 ? strongest : null,
    reason: `${parts.join("; ")}.`,
  };
}

export type NecessityReport =
  | ({ status: "scored" } & NecessityScore)
  | { status: "not-scored"; reason: string }
  | { status: "not-found" };

/**
 * Scores one meeting against the history of its own workspace, and stores it.
 * The comparison is one-directional on time (only meetings held earlier count),
 * so a score never changes because a later meeting was added, and re-running it
 * is idempotent.
 */
export async function computeNecessity(input: {
  workspaceId: string;
  meetingId: string;
}): Promise<NecessityReport> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [meeting] = await tx
      .select({
        id: t.meetings.id,
        title: t.meetings.title,
        heldAt: t.meetings.heldAt,
        keyDecisions: t.meetings.keyDecisions,
      })
      .from(t.meetings)
      .where(eq(t.meetings.id, input.meetingId));

    // RLS makes another workspace's meeting indistinguishable from a missing one.
    if (!meeting) return { status: "not-found" } as const;

    const items = await tx
      .select({ title: t.actionItems.title })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, meeting.id));

    const priorMeetings = await tx
      .select({
        id: t.meetings.id,
        title: t.meetings.title,
        keyDecisions: t.meetings.keyDecisions,
      })
      .from(t.meetings)
      .where(
        and(lt(t.meetings.heldAt, meeting.heldAt), ne(t.meetings.id, meeting.id)),
      );

    const priorItems = await tx
      .select({
        title: t.actionItems.title,
        meetingId: t.actionItems.meetingId,
        meetingTitle: t.meetings.title,
      })
      .from(t.actionItems)
      .innerJoin(t.meetings, eq(t.actionItems.meetingId, t.meetings.id))
      .where(lt(t.meetings.heldAt, meeting.heldAt));

    const priorDecisions = priorMeetings.flatMap((prior) =>
      prior.keyDecisions.map((text) => ({
        text,
        meetingId: prior.id,
        meetingTitle: prior.title,
      })),
    );

    const result = scoreNecessity({
      items,
      decisions: meeting.keyDecisions,
      priorItems,
      priorDecisions,
    });

    if (!result) {
      // Explicitly cleared, so a re-run after a meeting's items were replaced
      // cannot leave a stale score behind.
      await tx
        .update(t.meetings)
        .set({ necessityScore: null })
        .where(eq(t.meetings.id, meeting.id));
      return {
        status: "not-scored",
        reason:
          items.length === 0 && meeting.keyDecisions.length === 0
            ? "Nothing was extracted from this meeting, so there is nothing to compare."
            : "No earlier meeting in this workspace has items or decisions to compare against.",
      } as const;
    }

    await tx
      .update(t.meetings)
      .set({ necessityScore: result.score })
      .where(eq(t.meetings.id, meeting.id));

    return { status: "scored", ...result } as const;
  });
}

export type NecessityJobReport = {
  workspaces: number;
  meetings: number;
  scored: number;
  notScored: number;
  lines: string[];
};

/**
 * The scheduler entry point and the backfill: every meeting, oldest first, so a
 * meeting is always compared against a history that is already scored. No
 * network, so it is safe to run as often as wanted.
 */
export async function runNecessity(options: {
  workspaceIds?: string[];
  limitPerWorkspace?: number;
} = {}): Promise<NecessityJobReport> {
  const { getDb } = await import("../db/client");
  const report: NecessityJobReport = {
    workspaces: 0,
    meetings: 0,
    scored: 0,
    notScored: 0,
    lines: [],
  };

  const workspaces = options.workspaceIds
    ? options.workspaceIds.map((id) => ({ id, name: id }))
    : await getDb()
        .select({ id: t.workspaces.id, name: t.workspaces.name })
        .from(t.workspaces);

  const limit = options.limitPerWorkspace ?? 500;

  for (const workspace of workspaces) {
    report.workspaces += 1;
    const meetings = await withWorkspace(workspace.id, (tx) =>
      tx
        .select({ id: t.meetings.id, title: t.meetings.title })
        .from(t.meetings)
        .orderBy(asc(t.meetings.heldAt))
        .limit(limit),
    );

    for (const meeting of meetings) {
      report.meetings += 1;
      const result = await computeNecessity({
        workspaceId: workspace.id,
        meetingId: meeting.id,
      });

      if (result.status === "scored") {
        report.scored += 1;
        report.lines.push(
          `${workspace.name} / ${meeting.title}: necessity ${result.score}`,
        );
      } else if (result.status === "not-scored") {
        report.notScored += 1;
        report.lines.push(`${workspace.name} / ${meeting.title}: not scored`);
      }
    }
  }

  return report;
}
