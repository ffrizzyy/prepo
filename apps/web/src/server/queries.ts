import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  ActionItem,
  Meeting,
  Ticket,
  TranscriptSegment,
} from "@prepo/shared";
import { withWorkspace, type Db } from "./db/client";
import { getWorkspaceMembers } from "./db/repo";
import { audioStorage } from "./audio/storage";
import * as t from "./db/schema";

/**
 * Read models. The database stores ids and the UI renders names, so every query
 * here joins or resolves what the components need and hands back the shapes the
 * interface already speaks (the `@prepo/shared` view types).
 */

export type ActionItemView = ActionItem & {
  /** The transcript line the item was extracted from — the evidence shown in review. */
  sourceQuote: string | null;
  sourceQuoteAtMs: number | null;
};

export type MeetingView = Meeting & {
  segmentCount: number;
  proposedCount: number;
  ticketedCount: number;
  /**
   * False when no extraction has produced a score. The row's numeric fallback is
   * 0, which is a real score, so "never scored" has to be carried separately or
   * an unread meeting would look like a badly run one.
   */
  clarityScored: boolean;
  necessityScored: boolean;
};

export type TicketCommentView = {
  id: string;
  author: string | null;
  body: string;
  createdAt: string;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function num(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function toMeeting(row: t.MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    heldAt: row.heldAt.toISOString(),
    source: row.source,
    status: row.status,
    clarityScore: row.clarityScore ?? 0,
    necessityScore: row.necessityScore ?? 0,
    summary: row.summary ?? "",
    keyDecisions: row.keyDecisions,
    openQuestions: row.openQuestions,
  };
}

/* ------------------------------------------------------------- meetings */

export async function listMeetingsView(
  workspaceId: string,
): Promise<MeetingView[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const [meetings, itemCounts, segmentCounts, ticketCounts] =
      await Promise.all([
        tx.select().from(t.meetings).orderBy(desc(t.meetings.heldAt)),
        tx
          .select({
            meetingId: t.actionItems.meetingId,
            proposed: sql<number>`count(*)::int`,
            ticketed: sql<number>`count(*) filter (where ${t.actionItems.status} = 'ticketed')::int`,
          })
          .from(t.actionItems)
          .groupBy(t.actionItems.meetingId),
        tx
          .select({
            meetingId: t.transcriptSegments.meetingId,
            count: sql<number>`count(*)::int`,
          })
          .from(t.transcriptSegments)
          .groupBy(t.transcriptSegments.meetingId),
        tx
          .select({
            meetingId: t.actionItems.meetingId,
            count: sql<number>`count(*)::int`,
          })
          .from(t.tickets)
          .innerJoin(t.actionItems, eq(t.actionItems.id, t.tickets.actionItemId))
          .groupBy(t.actionItems.meetingId),
      ]);

    const items = new Map(itemCounts.map((row) => [row.meetingId, row]));
    const segments = new Map(segmentCounts.map((row) => [row.meetingId, row.count]));
    const tickets = new Map(ticketCounts.map((row) => [row.meetingId, row.count]));

    return meetings.map((row) => ({
      ...toMeeting(row),
      clarityScored: row.clarityScore !== null,
      necessityScored: row.necessityScore !== null,
      segmentCount: segments.get(row.id) ?? 0,
      proposedCount: items.get(row.id)?.proposed ?? 0,
      ticketedCount: tickets.get(row.id) ?? items.get(row.id)?.ticketed ?? 0,
    }));
  });
}

export async function getMeetingView(
  workspaceId: string,
  meetingId: string,
): Promise<MeetingView | null> {
  const all = await listMeetingsView(workspaceId);
  return all.find((meeting) => meeting.id === meetingId) ?? null;
}

export async function listSegmentsView(
  workspaceId: string,
  meetingId: string,
): Promise<TranscriptSegment[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({
        segment: t.transcriptSegments,
        speakerName: t.users.name,
      })
      .from(t.transcriptSegments)
      .leftJoin(t.users, eq(t.users.id, t.transcriptSegments.speakerUserId))
      .where(eq(t.transcriptSegments.meetingId, meetingId))
      .orderBy(asc(t.transcriptSegments.idx));

    return rows.map(({ segment, speakerName }) => ({
      id: segment.id,
      idx: segment.idx,
      speakerLabel: segment.speakerLabel,
      speakerName: speakerName ?? null,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    }));
  });
}

/**
 * Resolves the transcript lines referenced by a set of action items, so the UI
 * can show the quote an item was extracted from.
 */
async function quotesFor(
  tx: Db,
  segmentIds: string[],
): Promise<Map<string, { text: string; startMs: number }>> {
  if (segmentIds.length === 0) return new Map();

  const rows = await tx
    .select({
      id: t.transcriptSegments.id,
      text: t.transcriptSegments.text,
      startMs: t.transcriptSegments.startMs,
    })
    .from(t.transcriptSegments)
    .where(inArray(t.transcriptSegments.id, segmentIds));

  return new Map(rows.map((row) => [row.id, { text: row.text, startMs: row.startMs }]));
}

/* -------------------------------------------------------- action items */

export async function listActionItemsView(
  workspaceId: string,
  meetingId?: string,
): Promise<ActionItemView[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({ item: t.actionItems, ownerName: t.users.name })
      .from(t.actionItems)
      .leftJoin(t.users, eq(t.users.id, t.actionItems.ownerId))
      .where(meetingId ? eq(t.actionItems.meetingId, meetingId) : undefined)
      .orderBy(asc(t.actionItems.createdAt));

    const segmentIds = [
      ...new Set(rows.flatMap((row) => row.item.sourceSegmentIds)),
    ];
    const quotes = await quotesFor(tx, segmentIds);

    return rows.map(({ item, ownerName }) => {
      const quoteId = item.sourceSegmentIds[0];
      const quote = quoteId ? quotes.get(quoteId) : undefined;
      return {
        id: item.id,
        meetingId: item.meetingId,
        title: item.title,
        description: item.description ?? undefined,
        ownerRaw: item.ownerRaw,
        ownerName: ownerName ?? null,
        ownerConfidence: num(item.ownerConfidence),
        dueAt: iso(item.dueAt),
        priority: item.priority,
        confidence: num(item.confidence),
        sourceSegmentIds: item.sourceSegmentIds,
        flags: item.flags as ActionItemView["flags"],
        status: item.status,
        sourceQuote: quote?.text ?? null,
        sourceQuoteAtMs: quote?.startMs ?? null,
      } satisfies ActionItemView;
    });
  });
}

/* -------------------------------------------------------------- tickets */

export async function listTicketsView(workspaceId: string): Promise<Ticket[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({ ticket: t.tickets, assigneeName: t.users.name })
      .from(t.tickets)
      .leftJoin(t.users, eq(t.users.id, t.tickets.assigneeId))
      .orderBy(asc(t.tickets.position), asc(t.tickets.key));

    const actionItemIds = rows
      .map((row) => row.ticket.actionItemId)
      .filter((id): id is string => id !== null);

    const originItems = actionItemIds.length
      ? await tx
          .select()
          .from(t.actionItems)
          .where(inArray(t.actionItems.id, actionItemIds))
      : [];
    const originById = new Map(originItems.map((item) => [item.id, item]));

    const quotes = await quotesFor(
      tx,
      originItems.flatMap((item) => item.sourceSegmentIds[0] ?? []),
    );

    return rows.map(({ ticket, assigneeName }) => {
      const origin = ticket.actionItemId
        ? originById.get(ticket.actionItemId)
        : undefined;
      const quoteId = origin?.sourceSegmentIds[0];
      return {
        id: ticket.id,
        key: ticket.key,
        actionItemId: ticket.actionItemId,
        title: ticket.title,
        description: ticket.description ?? undefined,
        assigneeName: assigneeName ?? null,
        status: ticket.status,
        priority: ticket.priority,
        dueAt: iso(ticket.dueAt),
        labels: ticket.labels,
        linearUrl: ticket.linearUrl,
        linearIssueId: ticket.linearIssueId,
        linearSyncState: ticket.linearSyncState,
        linearSyncError: ticket.linearSyncError,
        linearRetryAfter: iso(ticket.linearRetryAfter),
        meetingId: origin?.meetingId ?? null,
        sourceQuote: quoteId ? (quotes.get(quoteId)?.text ?? null) : null,
        createdAt: ticket.createdAt.toISOString(),
      } satisfies Ticket;
    });
  });
}

export async function getTicketView(
  workspaceId: string,
  key: string,
): Promise<Ticket | null> {
  const all = await listTicketsView(workspaceId);
  return all.find((ticket) => ticket.key === key) ?? null;
}

export async function listTicketComments(
  workspaceId: string,
  ticketId: string,
): Promise<TicketCommentView[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({ comment: t.comments, author: t.users.name })
      .from(t.comments)
      .leftJoin(t.users, eq(t.users.id, t.comments.userId))
      .where(eq(t.comments.ticketId, ticketId))
      .orderBy(asc(t.comments.createdAt));

    return rows.map(({ comment, author }) => ({
      id: comment.id,
      author: author ?? null,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    }));
  });
}

export async function getTicketIdByKey(
  workspaceId: string,
  key: string,
): Promise<string | null> {
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select({ id: t.tickets.id })
      .from(t.tickets)
      .where(eq(t.tickets.key, key));
    return row?.id ?? null;
  });
}

export type TicketEventView = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
};

export async function listTicketEvents(
  workspaceId: string,
  ticketId: string,
): Promise<TicketEventView[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({ event: t.ticketEvents, actorName: t.users.name })
      .from(t.ticketEvents)
      .leftJoin(t.users, eq(t.users.id, t.ticketEvents.actorId))
      .where(eq(t.ticketEvents.ticketId, ticketId))
      .orderBy(desc(t.ticketEvents.createdAt));

    return rows.map(({ event, actorName }) => ({
      id: event.id,
      type: event.type,
      payload: (event.payload ?? {}) as Record<string, unknown>,
      actorName: actorName ?? null,
      createdAt: event.createdAt.toISOString(),
    }));
  });
}

/* ------------------------------------------------------------ followups */

export type FollowupView = {
  id: string;
  ticketKey: string | null;
  ticketTitle: string | null;
  ticketId: string | null;
  /** The ticket's due date, so the page can name the rung in the ladder. */
  ticketDueAt: string | null;
  /** The person this one message is for. */
  recipientName: string | null;
  kind: string;
  channel: string;
  scheduledFor: string;
  sentAt: string | null;
  status: string;
  detail: string | null;
};

const followupSelection = {
  id: t.followups.id,
  ticketId: t.followups.ticketId,
  ticketKey: t.tickets.key,
  ticketTitle: t.tickets.title,
  ticketDueAt: t.tickets.dueAt,
  recipientName: t.users.name,
  kind: t.followups.kind,
  channel: t.followups.channel,
  scheduledFor: t.followups.scheduledFor,
  sentAt: t.followups.sentAt,
  status: t.followups.status,
  detail: t.followups.detail,
};

/**
 * The whole timeline, newest history first: the page shows what is pending and
 * what already happened, and both are real rows the engine or a person wrote.
 */
export async function listFollowupsView(
  workspaceId: string,
): Promise<FollowupView[]> {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select(followupSelection)
      .from(t.followups)
      // The digest belongs to the workspace, not a ticket, so this join has to be
      // a left join — an inner one would hide every digest.
      .leftJoin(t.tickets, eq(t.tickets.id, t.followups.ticketId))
      .leftJoin(t.users, eq(t.users.id, t.followups.recipientId))
      .orderBy(asc(t.followups.scheduledFor))
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          ticketDueAt: iso(row.ticketDueAt),
          scheduledFor: row.scheduledFor.toISOString(),
          sentAt: iso(row.sentAt),
        })),
      ),
  );
}

export async function listTicketFollowups(
  workspaceId: string,
  ticketId: string,
): Promise<FollowupView[]> {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select(followupSelection)
      .from(t.followups)
      .leftJoin(t.tickets, eq(t.tickets.id, t.followups.ticketId))
      .leftJoin(t.users, eq(t.users.id, t.followups.recipientId))
      .where(eq(t.followups.ticketId, ticketId))
      .orderBy(asc(t.followups.scheduledFor))
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          ticketDueAt: iso(row.ticketDueAt),
          scheduledFor: row.scheduledFor.toISOString(),
          sentAt: iso(row.sentAt),
        })),
      ),
  );
}

/* -------------------------------------------------------- notifications */

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * The notification centre is per person, not per workspace: two members of the
 * same workspace see different inboxes, which is the point of the matrix in
 * PREPO.md §8.11.2.
 */
export async function listNotifications(
  workspaceId: string,
  userId: string,
  limit = 30,
): Promise<NotificationView[]> {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.notifications.id,
        type: t.notifications.type,
        payload: t.notifications.payload,
        readAt: t.notifications.readAt,
        createdAt: t.notifications.createdAt,
      })
      .from(t.notifications)
      .where(eq(t.notifications.userId, userId))
      .orderBy(desc(t.notifications.createdAt))
      .limit(limit)
      .then((rows) =>
        rows.map((row) => {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            type: row.type,
            title:
              typeof payload.title === "string"
                ? payload.title
                : typeof payload.subject === "string"
                  ? payload.subject
                  : row.type,
            body: typeof payload.body === "string" ? payload.body : "",
            href: typeof payload.href === "string" ? payload.href : null,
            readAt: iso(row.readAt),
            createdAt: row.createdAt.toISOString(),
          };
        }),
      ),
  );
}

export async function countUnreadNotifications(
  workspaceId: string,
  userId: string,
): Promise<number> {
  const [row] = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.userId, userId),
          sql`${t.notifications.readAt} is null`,
        ),
      ),
  );

  return row?.count ?? 0;
}

/* ------------------------------------------------------------------ audio */

export type MeetingAudioView = {
  id: string;
  status: string;
  durationS: number | null;
  sizeBytes: number | null;
  deleteAfter: string | null;
  consentName: string | null;
  /** Whether the bytes are actually in storage — the seeded example has none. */
  available: boolean;
};

export async function getMeetingAudio(
  workspaceId: string,
  meetingId: string,
): Promise<MeetingAudioView | null> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.audioAssets.id,
        r2Key: t.audioAssets.r2Key,
        status: t.audioAssets.status,
        durationS: t.audioAssets.durationS,
        sizeBytes: t.audioAssets.sizeBytes,
        deleteAfter: t.audioAssets.deleteAfter,
        consentName: t.users.name,
      })
      .from(t.audioAssets)
      .leftJoin(t.users, eq(t.users.id, t.audioAssets.consentConfirmedBy))
      .where(eq(t.audioAssets.meetingId, meetingId))
      .orderBy(desc(t.audioAssets.createdAt))
      .limit(1),
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    durationS: row.durationS,
    sizeBytes: row.sizeBytes,
    deleteAfter: iso(row.deleteAfter),
    consentName: row.consentName ?? null,
    available: (await audioStorage().size(row.r2Key)) !== null,
  };
}

export type SpeakerLabelView = {
  label: string;
  count: number;
  userId: string | null;
  userName: string | null;
};

export async function listSpeakerLabels(
  workspaceId: string,
  meetingId: string,
): Promise<SpeakerLabelView[]> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        label: t.transcriptSegments.speakerLabel,
        count: sql<number>`count(*)::int`,
        userId: sql<string | null>`max(${t.transcriptSegments.speakerUserId}::text)`,
      })
      .from(t.transcriptSegments)
      .where(eq(t.transcriptSegments.meetingId, meetingId))
      .groupBy(t.transcriptSegments.speakerLabel)
      .orderBy(asc(t.transcriptSegments.speakerLabel)),
  );

  const members = await getWorkspaceMembers(workspaceId);
  const nameById = new Map(members.map((member) => [member.userId, member.name]));

  return rows.map((row) => ({
    label: row.label,
    count: row.count,
    userId: row.userId,
    userName: row.userId ? (nameById.get(row.userId) ?? null) : null,
  }));
}

/** Transcription minutes used this calendar month, for the budget and Settings. */
export async function getTranscriptionUsage(
  workspaceId: string,
  now = new Date(),
): Promise<{ runs: number; minutes: number }> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        runs: sql<number>`count(*)::int`,
        seconds: sql<number>`coalesce(sum(${t.sttRuns.durationS}), 0)::int`,
      })
      .from(t.sttRuns)
      .where(
        and(
          sql`${t.sttRuns.status} like 'succeeded%'`,
          sql`${t.sttRuns.createdAt} >= ${start.toISOString()}`,
        ),
      ),
  );

  const row = rows[0];
  return { runs: row?.runs ?? 0, minutes: (row?.seconds ?? 0) / 60 };
}

/* -------------------------------------------------------------- insights */
export async function getStatusCounts(
  workspaceId: string,
): Promise<Record<string, number>> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({ status: t.tickets.status, count: sql<number>`count(*)::int` })
      .from(t.tickets)
      .groupBy(t.tickets.status),
  );

  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export async function listMeetingLoad(
  workspaceId: string,
): Promise<{ heldAt: string; clarityScore: number }[]> {
  const meetings = await listMeetingsView(workspaceId);
  return meetings
    .map((meeting) => ({
      heldAt: meeting.heldAt,
      clarityScore: meeting.clarityScore,
    }))
    .sort((a, b) => a.heldAt.localeCompare(b.heldAt));
}

/* --------------------------------------------------------------- linear */

/**
 * What the Linear job would act on right now, counted rather than described.
 * "Pending" means queued and not yet sent; "failed" means a refused push that is
 * waiting out its backoff (PREPO.md §8.6).
 */
export async function linearQueueSummary(workspaceId: string): Promise<{
  linked: number;
  pending: number;
  failed: number;
}> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        state: t.tickets.linearSyncState,
        issueId: t.tickets.linearIssueId,
      })
      .from(t.tickets),
  );

  return {
    linked: rows.filter((row) => row.issueId !== null).length,
    pending: rows.filter((row) => row.state === "pending").length,
    failed: rows.filter((row) => row.state === "failed").length,
  };
}
