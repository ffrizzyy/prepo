import { and, asc, desc, eq, sql } from "drizzle-orm";
import { rawQuery, withWorkspace } from "./client";
import * as t from "./schema";

export type WorkspaceRef = {
  id: string;
  slug: string;
  name: string;
  role: t.MembershipRole;
};

export type TicketStatus = (typeof t.ticketStatus.enumValues)[number];

/**
 * Bootstrap: a session knows its slug before it knows its workspace id, and the
 * workspaces table is policy-protected. This is the only path across that gap.
 */
export async function resolveWorkspaceId(slug: string): Promise<string | null> {
  const rows = await rawQuery<{ id: string | null }>(
    "select resolve_workspace_id($1) as id",
    [slug],
  );
  return rows[0]?.id ?? null;
}

export async function listWorkspacesForUser(
  userId: string,
): Promise<WorkspaceRef[]> {
  return rawQuery<WorkspaceRef>(
    "select id, slug, name, role from list_workspaces_for_user($1)",
    [userId],
  );
}

export async function getWorkspace(workspaceId: string) {
  return withWorkspace(workspaceId, async (tx) => {
    const [workspace] = await tx.select().from(t.workspaces).limit(1);
    return workspace ?? null;
  });
}

/* ------------------------------------------------------------- meetings */

export async function listMeetings(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx.select().from(t.meetings).orderBy(desc(t.meetings.heldAt)),
  );
}

export async function getMeetingDetail(workspaceId: string, meetingId: string) {
  return withWorkspace(workspaceId, async (tx) => {
    const [meeting] = await tx
      .select()
      .from(t.meetings)
      .where(eq(t.meetings.id, meetingId));

    if (!meeting) return null;

    const [segments, actionItems] = await Promise.all([
      tx
        .select()
        .from(t.transcriptSegments)
        .where(eq(t.transcriptSegments.meetingId, meetingId))
        .orderBy(asc(t.transcriptSegments.idx)),
      tx
        .select()
        .from(t.actionItems)
        .where(eq(t.actionItems.meetingId, meetingId))
        .orderBy(asc(t.actionItems.createdAt)),
    ]);

    return { meeting, segments, actionItems };
  });
}

/**
 * Retrieval for the agent: tsvector ranking with typo tolerance, never
 * embeddings (PREPO.md §1.3). Returns the passages, not whole transcripts.
 */
export async function searchTranscript(
  workspaceId: string,
  query: string,
  limit = 25,
) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.transcriptSegments.id,
        meetingId: t.transcriptSegments.meetingId,
        speakerLabel: t.transcriptSegments.speakerLabel,
        startMs: t.transcriptSegments.startMs,
        text: t.transcriptSegments.text,
        rank: sql<number>`ts_rank(${t.transcriptSegments.tsv}, websearch_to_tsquery('english', ${query}))`,
      })
      .from(t.transcriptSegments)
      .where(
        sql`${t.transcriptSegments.tsv} @@ websearch_to_tsquery('english', ${query})`,
      )
      .orderBy(
        desc(
          sql`ts_rank(${t.transcriptSegments.tsv}, websearch_to_tsquery('english', ${query}))`,
        ),
      )
      .limit(limit),
  );
}

/* -------------------------------------------------------------- tickets */

export async function listTickets(
  workspaceId: string,
  status?: TicketStatus,
) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select()
      .from(t.tickets)
      .where(
        status
          ? and(eq(t.tickets.workspaceId, workspaceId), eq(t.tickets.status, status))
          : undefined,
      )
      .orderBy(asc(t.tickets.position), asc(t.tickets.key)),
  );
}

export async function getTicketByKey(workspaceId: string, key: string) {
  return withWorkspace(workspaceId, async (tx) => {
    const [ticket] = await tx
      .select()
      .from(t.tickets)
      .where(eq(t.tickets.key, key));

    if (!ticket) return null;

    const [events, thread, followups] = await Promise.all([
      tx
        .select()
        .from(t.ticketEvents)
        .where(eq(t.ticketEvents.ticketId, ticket.id))
        .orderBy(desc(t.ticketEvents.createdAt)),
      tx
        .select()
        .from(t.comments)
        .where(eq(t.comments.ticketId, ticket.id))
        .orderBy(asc(t.comments.createdAt)),
      tx
        .select()
        .from(t.followups)
        .where(eq(t.followups.ticketId, ticket.id))
        .orderBy(asc(t.followups.scheduledFor)),
    ]);

    return { ticket, events, comments: thread, followups };
  });
}

export async function getBoardStats(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        status: t.tickets.status,
        count: sql<number>`count(*)::int`,
      })
      .from(t.tickets)
      .groupBy(t.tickets.status),
  );
}

/* ------------------------------------------------------ action / follow */

export async function listProposedActionItems(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select()
      .from(t.actionItems)
      .where(eq(t.actionItems.status, "proposed"))
      .orderBy(desc(t.actionItems.confidence)),
  );
}

export async function listScheduledFollowups(workspaceId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select()
      .from(t.followups)
      .where(eq(t.followups.status, "scheduled"))
      .orderBy(asc(t.followups.scheduledFor)),
  );
}
