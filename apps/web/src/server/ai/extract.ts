import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, withWorkspace } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";
import type { WorkspaceSettings } from "../db/schema";
import { approveActionItems, audit } from "../writes";
import { groundExtraction, type GroundMember, type GroundedItem } from "./ground";
import { computeNecessity } from "./necessity";
import { extractionConfigProblem, extractionProvider } from "./openrouter";
import { rawExtractionSchema } from "./schema";
import type {
  ExtractionInput,
  ExtractionProvider,
  ExtractionReply,
  ExtractionSegment,
  ExtractionUsage,
} from "./types";

/**
 * The extraction run (PREPO.md §7.1): read the transcript, ask the provider
 * outside any transaction, ground the answer, write once.
 *
 * Deliberate choices:
 *
 * - **No network inside a transaction.** A model call can take 30 seconds; the
 *   read and the write are separate short transactions with the call between
 *   them. This is also what keeps PGlite from holding a socket open.
 * - **Nothing is written until the whole answer validates and grounds.** A run
 *   either imports its items or imports none of them.
 * - **Idempotent by default.** An existing summary or action item means "already";
 *   the job never re-extracts. An explicit user action may replace the proposed
 *   items, which is the only way to re-run on the same meeting.
 * - **Bounded.** A transcript over the character cap is refused rather than
 *   silently truncated, and a monthly run budget stops a loop from spending.
 */

/** Recorded in `ai_runs.purpose`; also what the budget counts. */
export const EXTRACTION_PURPOSE = "extract_action_items";

export type ExtractionLimits = {
  /** Longer transcripts are refused, not cut: half a transcript is not minutes. */
  maxChars: number;
  /** Runs per workspace per calendar month (UTC). */
  monthlyRuns: number;
};

export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxChars: 120_000,
  monthlyRuns: 200,
};

export type ExtractionStatus =
  | "extracted"
  | "already"
  | "no-transcript"
  | "unconfigured"
  | "too-long"
  | "over-budget"
  | "invalid"
  | "failed"
  | "not-found";

export type ExtractionReport = {
  status: ExtractionStatus;
  reason?: string;
  meetingId?: string;
  meetingTitle?: string;
  provider?: string;
  model?: string;
  /** Items imported by this run. */
  items?: number;
  /** Items the model proposed that grounding refused. */
  dropped?: number;
  droppedNoEvidence?: number;
  autoApproved?: number;
  clarityScore?: number;
  costUsd?: string | null;
  /** Something worth saying that did not stop the import (e.g. auto-approval). */
  warning?: string;
};

/** What the page needs to say honestly before a button is pressed. */
export function extractionReadiness(
  env: Record<string, string | undefined> = process.env,
): { ready: boolean; reason: string | null } {
  const problem = extractionConfigProblem(env);
  return { ready: problem === null, reason: problem };
}

type LoadedMeeting = {
  id: string;
  title: string;
  heldAt: Date;
  summary: string | null;
  segments: ExtractionSegment[];
  members: GroundMember[];
  settings: WorkspaceSettings;
  totalItems: number;
  runsThisMonth: number;
  meetingTimezone: string;
  characters: number;
};

async function loadMeeting(
  workspaceId: string,
  meetingId: string,
  monthStart: Date,
): Promise<LoadedMeeting | null> {
  return withWorkspace(workspaceId, async (tx) => {
    const [meeting] = await tx
      .select({
        id: t.meetings.id,
        title: t.meetings.title,
        heldAt: t.meetings.heldAt,
        summary: t.meetings.summary,
        createdBy: t.meetings.createdBy,
      })
      .from(t.meetings)
      .where(eq(t.meetings.id, meetingId));

    // RLS makes another workspace's meeting indistinguishable from a missing one.
    if (!meeting) return null;

    const segmentRows = await tx
      .select({
        id: t.transcriptSegments.id,
        speakerLabel: t.transcriptSegments.speakerLabel,
        startMs: t.transcriptSegments.startMs,
        text: t.transcriptSegments.text,
      })
      .from(t.transcriptSegments)
      .where(eq(t.transcriptSegments.meetingId, meetingId))
      .orderBy(asc(t.transcriptSegments.idx));

    const memberRows = await tx
      .select({
        userId: t.users.id,
        name: t.users.name,
        email: t.users.email,
        timezone: t.users.timezone,
        aliases: t.memberships.aliases,
      })
      .from(t.memberships)
      .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
      .orderBy(asc(t.memberships.createdAt));

    const [workspaceRow] = await tx
      .select({ settings: t.workspaces.settings })
      .from(t.workspaces);

    const itemRows = await tx
      .select({ status: t.actionItems.status })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, meetingId));

    const [runs] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.aiRuns)
      .where(
        and(
          eq(t.aiRuns.purpose, EXTRACTION_PURPOSE),
          gte(t.aiRuns.createdAt, monthStart),
        ),
      );

    let creatorTimezone: string | null = null;
    if (meeting.createdBy) {
      const [creator] = await tx
        .select({ timezone: t.users.timezone })
        .from(t.users)
        .where(eq(t.users.id, meeting.createdBy));
      creatorTimezone = creator?.timezone ?? null;
    }

    const segments: ExtractionSegment[] = segmentRows.map((row, index) => ({
      token: `s${index + 1}`,
      id: row.id,
      speaker: row.speakerLabel,
      startMs: row.startMs,
      text: row.text,
    }));

    return {
      id: meeting.id,
      title: meeting.title,
      heldAt: meeting.heldAt,
      summary: meeting.summary,
      segments,
      members: memberRows.map((row) => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        timezone: row.timezone,
        aliases: row.aliases,
      })),
      settings: workspaceRow?.settings ?? {},
      totalItems: itemRows.length,
      runsThisMonth: runs?.count ?? 0,
      meetingTimezone: creatorTimezone ?? "UTC",
      characters: segments.reduce((sum, segment) => sum + segment.text.length, 0),
    };
  });
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function recordRun(input: {
  workspaceId: string;
  meetingId: string;
  usage: ExtractionUsage;
  now: Date;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx.insert(t.aiRuns).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      purpose: EXTRACTION_PURPOSE,
      model: input.usage.model,
      tokensIn: input.usage.tokensIn,
      tokensOut: input.usage.tokensOut,
      costUsd: input.usage.costUsd === null ? null : input.usage.costUsd.toFixed(6),
      latencyMs: input.usage.latencyMs,
      traceId: input.meetingId,
      createdAt: input.now,
    }),
  );
}

/**
 * Assist and Autopilot (PREPO.md §7.1). Assist is the strict one: high
 * confidence, a resolved owner, a real date, and no ambiguity. Autopilot drops
 * the owner/date requirement but still refuses ambiguity and duplicates, those
 * are exactly the decisions a person should make.
 */
export function autoApprovable(item: GroundedItem, autonomy: string): boolean {
  if (autonomy === "suggest") return false;
  if (item.confidence < 0.85) return false;
  if (item.flags.includes("ambiguous_owner") || item.flags.includes("possible_duplicate")) {
    return false;
  }
  if (autonomy === "assist") return item.ownerId !== null && item.dueAt !== null;
  return autonomy === "autopilot";
}

export async function extractMeeting(input: {
  workspaceId: string;
  meetingId: string;
  /** Null when the agent, not a person, is acting (the scheduled job). */
  actorId: string | null;
  /** Omitted: resolve from the environment. Null: explicitly none. */
  provider?: ExtractionProvider | null;
  /** Delete still-proposed items from a previous run before importing. */
  replace?: boolean;
  limits?: Partial<ExtractionLimits>;
  now?: Date;
}): Promise<ExtractionReport> {
  const now = input.now ?? new Date();
  const limits = { ...DEFAULT_EXTRACTION_LIMITS, ...input.limits };

  const provider = input.provider === undefined ? extractionProvider() : input.provider;
  if (!provider) {
    const problem = extractionConfigProblem();
    return {
      status: "unconfigured",
      reason: `Extraction is not configured: ${problem ?? "no provider is available"}.`,
    };
  }

  const loaded = await loadMeeting(input.workspaceId, input.meetingId, startOfMonth(now));
  if (!loaded) {
    return {
      status: "not-found",
      reason: "That meeting is not in this workspace.",
    };
  }

  const base = {
    meetingId: loaded.id,
    meetingTitle: loaded.title,
    provider: provider.name,
  };

  if (loaded.segments.length === 0) {
    return {
      ...base,
      status: "no-transcript",
      reason: "There is no transcript to read. Upload or paste one first.",
    };
  }

  if (!input.replace && (loaded.summary || loaded.totalItems > 0)) {
    return {
      ...base,
      status: "already",
      reason: "This meeting already has minutes or action items.",
      items: loaded.totalItems,
    };
  }

  if (loaded.characters > limits.maxChars) {
    return {
      ...base,
      status: "too-long",
      reason: `The transcript is ${loaded.characters.toLocaleString("en-US")} characters; one extraction is capped at ${limits.maxChars.toLocaleString("en-US")}. Split the meeting rather than importing half of it.`,
    };
  }

  if (loaded.runsThisMonth >= limits.monthlyRuns) {
    return {
      ...base,
      status: "over-budget",
      reason: `This workspace has used ${loaded.runsThisMonth} of ${limits.monthlyRuns} extraction runs this month. The cap resets on the first of the month (UTC).`,
    };
  }

  const providerInput: ExtractionInput = {
    title: loaded.title,
    heldAt: loaded.heldAt,
    timezone: loaded.meetingTimezone,
    segments: loaded.segments,
  };

  let reply: ExtractionReply;
  try {
    reply = await provider.extract(providerInput);
  } catch (error) {
    return {
      ...base,
      status: "failed",
      reason:
        error instanceof Error && error.message
          ? error.message
          : "The extraction provider failed, so nothing was imported.",
    };
  }

  const parsed = rawExtractionSchema.safeParse(reply.raw);
  if (!parsed.success) {
    await recordRun({
      workspaceId: input.workspaceId,
      meetingId: loaded.id,
      usage: reply.usage,
      now,
    });
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "the top level";
    return {
      ...base,
      status: "invalid",
      reason: `The model's answer did not match the extraction schema at ${where}, so nothing was imported.`,
      model: reply.usage.model,
      costUsd: reply.usage.costUsd === null ? null : reply.usage.costUsd.toFixed(6),
    };
  }

  const grounded = groundExtraction({
    raw: parsed.data,
    meetingTimezone: loaded.meetingTimezone,
    segments: loaded.segments.map((segment) => ({ token: segment.token, id: segment.id })),
    members: loaded.members,
  });

  const inserted: { id: string; item: GroundedItem }[] = [];

  await withWorkspace(input.workspaceId, async (tx) => {
    if (input.replace) {
      // Only proposed items: a ticketed or rejected item is history, and a ticket
      // may point at it.
      await tx
        .delete(t.actionItems)
        .where(
          and(
            eq(t.actionItems.meetingId, loaded.id),
            eq(t.actionItems.status, "proposed"),
          ),
        );
    }

    await tx
      .update(t.meetings)
      .set({
        summary: grounded.summary || null,
        keyDecisions: grounded.decisions,
        openQuestions: grounded.openQuestions,
        clarityScore: grounded.clarityScore,
        status: "ready",
      })
      .where(eq(t.meetings.id, loaded.id));

    for (const item of grounded.items) {
      const id = uuidv7();
      inserted.push({ id, item });
      await tx.insert(t.actionItems).values({
        id,
        workspaceId: input.workspaceId,
        meetingId: loaded.id,
        title: item.title,
        description: item.description,
        ownerId: item.ownerId,
        ownerRaw: item.ownerRaw,
        ownerConfidence: item.ownerConfidence === null ? null : item.ownerConfidence.toFixed(3),
        dueAt: item.dueAt,
        priority: item.priority,
        confidence: item.confidence.toFixed(3),
        sourceSegmentIds: item.sourceSegmentIds,
        flags: item.flags,
        status: "proposed",
        createdAt: now,
      });
    }

    await tx.insert(t.aiRuns).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      purpose: EXTRACTION_PURPOSE,
      model: reply.usage.model,
      tokensIn: reply.usage.tokensIn,
      tokensOut: reply.usage.tokensOut,
      costUsd: reply.usage.costUsd === null ? null : reply.usage.costUsd.toFixed(6),
      latencyMs: reply.usage.latencyMs,
      traceId: loaded.id,
      createdAt: now,
    });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "meeting.extracted",
      target: loaded.id,
    });
  });

  const autonomy = loaded.settings.autonomy ?? "suggest";
  const eligible = inserted.filter(({ item }) => autoApprovable(item, autonomy));
  let autoApproved = 0;
  let warning: string | undefined;

  if (eligible.length > 0) {
    try {
      const result = await approveActionItems({
        workspaceId: input.workspaceId,
        // The agent did this, not a person; `ticket_events` says so.
        actorId: null,
        actorKind: "prepo",
        prefix: loaded.settings.ticketPrefix ?? "PRE",
        actionItemIds: eligible.map((entry) => entry.id),
      });
      autoApproved = result.created;
    } catch (error) {
      warning = `The items were extracted, but automatic approval failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`;
    }
  }

  const dropped = grounded.dropped.noEvidence + grounded.dropped.emptyTitle;
  return {
    ...base,
    status: "extracted",
    model: reply.usage.model,
    items: grounded.items.length,
    dropped,
    droppedNoEvidence: grounded.dropped.noEvidence,
    autoApproved,
    clarityScore: grounded.clarityScore,
    costUsd: reply.usage.costUsd === null ? null : reply.usage.costUsd.toFixed(6),
    warning,
  };
}

/* ---------------------------------------------------------------- the job */

export type ExtractionJobReport = {
  scanned: number;
  extracted: number;
  skipped: number;
  failed: number;
  items: number;
  autoApproved: number;
  unconfigured: boolean;
  reason?: string;
  lines: string[];
};

export function describeReport(report: ExtractionReport): string {
  switch (report.status) {
    case "extracted": {
      const parts = [
        `extracted ${report.items ?? 0} item${report.items === 1 ? "" : "s"}`,
        `clarity ${report.clarityScore ?? 0}`,
      ];
      if (report.autoApproved) parts.push(`${report.autoApproved} auto-approved`);
      if (report.dropped) {
        parts.push(
          `${report.dropped} dropped (${report.droppedNoEvidence ?? 0} without evidence)`,
        );
      }
      if (report.warning) parts.push(report.warning);
      return parts.join(", ");
    }
    case "already":
      return "already extracted";
    default:
      return `${report.status}${report.reason ? `, ${report.reason}` : ""}`;
  }
}

/**
 * The scheduler entry point: every ready meeting with no summary, once. It never
 * re-extracts, so running it every five minutes costs nothing beyond the query.
 */
export async function runExtraction(
  options: {
    now?: Date;
    provider?: ExtractionProvider | null;
    limitPerWorkspace?: number;
  } = {},
): Promise<ExtractionJobReport> {
  const now = options.now ?? new Date();
  const provider = options.provider === undefined ? extractionProvider() : options.provider;
  const report: ExtractionJobReport = {
    scanned: 0,
    extracted: 0,
    skipped: 0,
    failed: 0,
    items: 0,
    autoApproved: 0,
    unconfigured: provider === null,
    lines: [],
  };

  if (!provider) {
    report.reason = `Extraction is not configured: ${extractionConfigProblem() ?? "no provider"}.`;
    return report;
  }

  const limit = options.limitPerWorkspace ?? 50;
  const workspaces = await getDb()
    .select({ id: t.workspaces.id, name: t.workspaces.name })
    .from(t.workspaces);

  for (const workspace of workspaces) {
    // The transaction closes before any network call below.
    const targets = await withWorkspace(workspace.id, (tx) =>
      tx
        .select({ id: t.meetings.id, title: t.meetings.title })
        .from(t.meetings)
        .where(and(eq(t.meetings.status, "ready"), isNull(t.meetings.summary)))
        .orderBy(desc(t.meetings.heldAt))
        .limit(limit),
    );

    for (const target of targets) {
      report.scanned += 1;
      const result = await extractMeeting({
        workspaceId: workspace.id,
        meetingId: target.id,
        actorId: null,
        provider,
        now,
      });

      if (result.status === "extracted") {
        report.extracted += 1;
        report.items += result.items ?? 0;
        report.autoApproved += result.autoApproved ?? 0;

        // The necessity score compares this meeting against the ones held before
        // it, which is a read the extraction itself does not do. It runs after
        // the write and only when the write happened. A failure here must not
        // turn a successful extraction into a failed one, so it is swallowed:
        // the meeting keeps "Not scored" rather than a guessed number.
        try {
          await computeNecessity({ workspaceId: workspace.id, meetingId: target.id });
        } catch {
          // See above.
        }
      } else if (result.status === "failed" || result.status === "invalid") {
        report.failed += 1;
      } else {
        report.skipped += 1;
      }

      report.lines.push(`${workspace.name} / ${target.title}: ${describeReport(result)}`);
    }
  }

  return report;
}
