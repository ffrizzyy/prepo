import {
  SAMPLE_ACTION_ITEMS,
  SAMPLE_MEETING,
  SAMPLE_MEETING_LIST,
  SAMPLE_ROSTER,
  SAMPLE_SEGMENTS,
  SAMPLE_TICKETS,
} from "@prepo/shared";
import { getDb, rawExec } from "./client";
import { uuidv7 } from "./ids";
import * as t from "./schema";
import { runCli } from "./run";
import { DEMO } from "../auth/demo";
import { hashPassword } from "../auth/password";

/** Fixed ids so verification and deep links can rely on them. */
export const WORKSPACE_IDS = {
  northwind: "01930000-0000-7000-8000-000000000001",
  globex: "01930000-0000-7000-8000-000000000002",
} as const;

export type SeedSummary = {
  northwind: { meetings: number; tickets: number; actionItems: number; members: number };
  globex: { meetings: number; tickets: number; actionItems: number; members: number };
};

function emailFor(name: string, domain: string): string {
  return `${name.split(" ")[0]!.toLowerCase()}@${domain}`;
}

export async function seed(): Promise<SeedSummary> {
  const db = getDb();

  // Truncate every table rather than a hard-coded list, so adding a table to the
  // schema cannot silently leave stale rows behind.
  await rawExec(`
    do $$
    declare target text;
    begin
      for target in select tablename from pg_tables where schemaname = 'public' loop
        execute format('truncate table %I cascade', target);
      end loop;
    end $$;
  `);

  /* ------------------------------------------------------------- people */
  const userIdByName = new Map<string, string>();
  const userRows: (typeof t.users.$inferInsert)[] = [];

  for (const person of SAMPLE_ROSTER) {
    const id = uuidv7();
    userIdByName.set(person.name, id);
    userRows.push({
      id,
      email: emailFor(person.name, "northwind.dev"),
      name: person.name,
      timezone: "Europe/Berlin",
    });
  }
  for (const person of [
    { name: "Nadia Rahman", domain: "globex.dev" },
    { name: "Tom Wagner", domain: "globex.dev" },
  ]) {
    const id = uuidv7();
    userIdByName.set(person.name, id);
    userRows.push({
      id,
      email: emailFor(person.name, person.domain),
      name: person.name,
      timezone: "America/New_York",
    });
  }
  await db.insert(t.users).values(userRows);

  /* ------------------------------------------------------------- sign-in */
  // Every seeded person shares the demo password but is hashed with its own
  // salt, so any of them can sign in and the demo still exercises real hashing.
  const passwordHashes = await Promise.all(
    userRows.map(() => hashPassword(DEMO.password)),
  );
  await db.insert(t.accounts).values(
    userRows.map((user, index) => ({
      id: uuidv7(),
      userId: user.id!,
      provider: "password",
      providerAccountId: user.email,
      passwordHash: passwordHashes[index]!,
    })),
  );

  /* --------------------------------------------------------- workspaces */
  await db.insert(t.workspaces).values([
    {
      id: WORKSPACE_IDS.northwind,
      name: "Northwind Studio",
      slug: "northwind",
      settings: {
        autonomy: "suggest",
        followupTone: "neutral",
        ticketPrefix: "PRE",
        quietHours: { from: "18:00", to: "09:00" },
        audioRetentionDays: 30,
      },
    },
    {
      id: WORKSPACE_IDS.globex,
      name: "Globex",
      slug: "globex",
      settings: { autonomy: "assist", followupTone: "gentle", ticketPrefix: "GLO" },
    },
  ]);

  const northwindRoles: Record<string, "owner" | "admin" | "member"> = {
    "Lena Fischer": "owner",
    "Priya Nair": "admin",
    "Sam Rivera": "member",
    "Marco Bianchi": "member",
    "Dana Okafor": "member",
  };

  await db.insert(t.memberships).values([
    ...SAMPLE_ROSTER.map((person) => ({
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.northwind,
      userId: userIdByName.get(person.name)!,
      role: northwindRoles[person.name] ?? ("member" as const),
      aliases: person.aliases,
    })),
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.globex,
      userId: userIdByName.get("Nadia Rahman")!,
      role: "owner" as const,
      aliases: ["Nadia"],
    },
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.globex,
      userId: userIdByName.get("Tom Wagner")!,
      role: "member" as const,
      aliases: ["Tom"],
    },
  ]);

  /* ----------------------------------------------------------- meetings */
  const meetingIdBySample = new Map<string, string>();
  const meetingRows: (typeof t.meetings.$inferInsert)[] = [];

  for (const meeting of SAMPLE_MEETING_LIST) {
    const id = uuidv7();
    meetingIdBySample.set(meeting.id, id);
    meetingRows.push({
      id,
      workspaceId: WORKSPACE_IDS.northwind,
      title: meeting.title,
      heldAt: new Date(meeting.heldAt),
      source: meeting.source,
      status: meeting.status,
      clarityScore: meeting.clarityScore,
      necessityScore: meeting.necessityScore,
      summary: meeting.summary,
      keyDecisions: meeting.keyDecisions,
      openQuestions: meeting.openQuestions,
      createdBy: userIdByName.get("Lena Fischer")!,
    });
  }

  const globexMeetingId = uuidv7();
  meetingRows.push({
    id: globexMeetingId,
    workspaceId: WORKSPACE_IDS.globex,
    title: "Globex — Platform Standup",
    heldAt: new Date("2026-10-12T13:00:00.000Z"),
    source: "paste",
    status: "ready",
    clarityScore: 81,
    necessityScore: 44,
    summary:
      "Short standup. One action: rotate the staging database credentials.",
    keyDecisions: ["Staging credentials rotate monthly."],
    openQuestions: [],
    createdBy: userIdByName.get("Nadia Rahman")!,
  });

  await db.insert(t.meetings).values(meetingRows);

  const mainMeetingId = meetingIdBySample.get(SAMPLE_MEETING.id)!;

  /* ------------------------------------------------------- transcript */
  const segmentIdBySample = new Map<string, string>();
  const segmentRows = SAMPLE_SEGMENTS.map((segment) => {
    const id = uuidv7();
    segmentIdBySample.set(segment.id, id);
    return {
      id,
      workspaceId: WORKSPACE_IDS.northwind,
      meetingId: mainMeetingId,
      idx: segment.idx,
      speakerLabel: segment.speakerLabel,
      speakerUserId: segment.speakerName
        ? (userIdByName.get(segment.speakerName) ?? null)
        : null,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    };
  });
  await db.insert(t.transcriptSegments).values(segmentRows);

  await db.insert(t.audioAssets).values({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    meetingId: mainMeetingId,
    r2Key: `meetings/${mainMeetingId}/audio.m4a`,
    durationS: 249,
    sizeBytes: 4_182_016,
    status: "transcribed",
    deleteAfter: new Date("2026-11-12T09:30:00.000Z"),
    consentConfirmedBy: userIdByName.get("Lena Fischer")!,
  });

  /* ------------------------------------------------------ action items */
  // The Q4 sync re-raised the enterprise legal review, which duplicates the
  // existing PRE-118. That stays a `possible_duplicate` flag for a human to
  // resolve in review — linking the old ticket to this meeting would claim the
  // meeting created it, which is not true.
  const actionItemRows = SAMPLE_ACTION_ITEMS.map((item) => ({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    meetingId: meetingIdBySample.get(item.meetingId) ?? mainMeetingId,
    title: item.title,
    description: item.description ?? null,
    ownerId: item.ownerName ? (userIdByName.get(item.ownerName) ?? null) : null,
    ownerRaw: item.ownerRaw,
    ownerConfidence: String(item.ownerConfidence),
    dueAt: item.dueAt ? new Date(item.dueAt) : null,
    priority: item.priority,
    confidence: String(item.confidence),
    sourceSegmentIds: item.sourceSegmentIds
      .map((sid) => segmentIdBySample.get(sid))
      .filter((sid): sid is string => Boolean(sid)),
    flags: item.flags,
    status: item.status,
  }));
  await db.insert(t.actionItems).values(actionItemRows);

  /* ------------------------------------------------------------ tickets */
  const ticketRows: (typeof t.tickets.$inferInsert)[] = SAMPLE_TICKETS.map(
    (ticket, index) => ({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    key: ticket.key,
    // Every seeded ticket already existed; only approving an action item links a
    // ticket back to the item and the meeting it came from.
    actionItemId: null,
    title: ticket.title,
    description: ticket.description ?? null,
    assigneeId: ticket.assigneeName
      ? (userIdByName.get(ticket.assigneeName) ?? null)
      : null,
    status: ticket.status,
    priority: ticket.priority,
    dueAt: ticket.dueAt ? new Date(ticket.dueAt) : null,
    labels: ticket.labels,
    position: index,
    version: 1,
    linearUrl: ticket.linearUrl,
    createdAt: new Date(ticket.createdAt),
  }));

  ticketRows.push(
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.globex,
      key: "GLO-101",
      actionItemId: null,
      title: "Rotate the staging database credentials",
      description: "Monthly rotation.",
      assigneeId: userIdByName.get("Tom Wagner")!,
      status: "todo" as const,
      priority: "p1" as const,
      dueAt: new Date("2026-10-18T17:00:00.000Z"),
      labels: ["staging"],
      position: 0,
      version: 1,
      linearUrl: null,
      createdAt: new Date("2026-10-12T13:10:00.000Z"),
    },
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.globex,
      key: "GLO-102",
      actionItemId: null,
      title: "Retire the legacy metrics exporter",
      description: null,
      assigneeId: userIdByName.get("Nadia Rahman")!,
      status: "backlog" as const,
      priority: "p3" as const,
      dueAt: null,
      labels: ["cleanup"],
      position: 1,
      version: 1,
      linearUrl: null,
      createdAt: new Date("2026-10-12T13:12:00.000Z"),
    },
  );

  await db.insert(t.tickets).values(ticketRows);

  /* ------------------------------------- events, follow-ups, the rest */
  await db.insert(t.ticketEvents).values(
    ticketRows.map((ticket) => ({
      id: uuidv7(),
      workspaceId: ticket.workspaceId,
      ticketId: ticket.id,
      actorId: null,
      actorKind: "agent" as const,
      type: "created",
      payload: { key: ticket.key, source: "seed" },
    })),
  );

  const dupTicket = ticketRows.find((ticket) => ticket.key === "PRE-118")!;
  await db.insert(t.comments).values([
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.northwind,
      ticketId: dupTicket.id,
      userId: userIdByName.get("Dana Okafor")!,
      body: "Raised again in the Q4 sync. Still waiting on the enterprise terms from counsel.",
      createdAt: new Date("2026-10-13T11:00:00.000Z"),
    },
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.northwind,
      ticketId: dupTicket.id,
      userId: userIdByName.get("Lena Fischer")!,
      body: "Noted — keep it here so we do not open a second ticket for the same thing.",
      createdAt: new Date("2026-10-13T11:04:00.000Z"),
    },
  ]);

  // A reminder 24h before each open ticket's due date is the first rung of the
  // escalation ladder, so the follow-ups page reflects real rows.
  const followupRows: (typeof t.followups.$inferInsert)[] = [];
  for (const ticket of ticketRows) {
    if (ticket.workspaceId !== WORKSPACE_IDS.northwind) continue;
    if (ticket.status === "done" || !ticket.dueAt) continue;
    followupRows.push({
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.northwind,
      ticketId: ticket.id,
      kind: "reminder",
      channel: "email",
      scheduledFor: new Date(ticket.dueAt.getTime() - 24 * 60 * 60 * 1000),
      status: "scheduled",
    });
  }

  const overduedTicket = ticketRows.find((ticket) => ticket.key === "PRE-139")!;
  followupRows.push({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    ticketId: overduedTicket.id,
    kind: "nudge",
    channel: "in_app",
    scheduledFor: new Date("2026-10-15T09:00:00.000Z"),
    sentAt: new Date("2026-10-15T09:00:03.000Z"),
    status: "sent",
  });

  await db.insert(t.followups).values(followupRows);

  await db.insert(t.notifications).values({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    userId: userIdByName.get("Lena Fischer")!,
    type: "action_items_ready",
    payload: {
      meetingId: mainMeetingId,
      count: SAMPLE_ACTION_ITEMS.length,
      title: SAMPLE_MEETING.title,
    },
  });

  await db.insert(t.savedViews).values({
    id: uuidv7(),
    workspaceId: WORKSPACE_IDS.northwind,
    userId: userIdByName.get("Lena Fischer")!,
    name: "Blocked this week",
    scope: "board",
    filters: { priority: ["p0", "p1"], dueWithinDays: 7 },
    isShared: true,
  });

  await db.insert(t.aiRuns).values([
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.northwind,
      purpose: "extract_action_items",
      model: "claude-sonnet-5",
      tokensIn: 8420,
      tokensOut: 1180,
      costUsd: "0.043000",
      latencyMs: 6120,
      traceId: "seed-trace-1",
      evalScore: "0.9200",
    },
    {
      id: uuidv7(),
      workspaceId: WORKSPACE_IDS.globex,
      purpose: "extract_action_items",
      model: "claude-sonnet-5",
      tokensIn: 1200,
      tokensOut: 210,
      costUsd: "0.008000",
      latencyMs: 2400,
      traceId: "seed-trace-2",
      evalScore: "0.8800",
    },
  ]);

  await db.insert(t.auditLogs).values(
    userRows.slice(0, 2).map((user, index) => ({
      id: uuidv7(),
      workspaceId: index === 0 ? WORKSPACE_IDS.northwind : WORKSPACE_IDS.globex,
      actorId: user.id,
      action: "workspace.seeded",
      target: index === 0 ? "northwind" : "globex",
      ipPrefix: "203.0.113.",
      uaHash: "seed",
    })),
  );

  return {
    northwind: {
      meetings: SAMPLE_MEETING_LIST.length,
      tickets: SAMPLE_TICKETS.length,
      actionItems: SAMPLE_ACTION_ITEMS.length,
      members: SAMPLE_ROSTER.length,
    },
    globex: { meetings: 1, tickets: 2, actionItems: 0, members: 2 },
  };
}

runCli("seed.ts", async () => {
  const summary = await seed();
  console.log(
    `✓ seeded northwind (${summary.northwind.tickets} tickets) and globex (${summary.globex.tickets} tickets)`,
  );
});
