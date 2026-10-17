import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, withWorkspace, type Db } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";
import type { WorkspaceSettings } from "../db/schema";
import { audit } from "../writes";
import {
  EMAIL_UNCONFIGURED,
  PUSH_UNCONFIGURED,
  emailSender,
  type EmailSender,
} from "./channels";
import { HOUR_MS, labelFor, overdueDays, rungFor, scheduleLadder } from "./ladder";
import {
  digestBody,
  digestSubject,
  messageBody,
  messageSubject,
  notificationBody,
  type DigestContext,
  type DigestLine,
  type MessageContext,
} from "./message";
import {
  deferPastQuietHours,
  nextWeekdayTime,
  weekdayName,
} from "./quiet";

/**
 * The follow-up engine (PREPO.md §8.7).
 *
 * It is a job rather than a background daemon, in the same spirit as the audio
 * retention sweep: `runFollowups()` does one pass and returns a report, and a
 * scheduler calls it. Reading the list of workspaces happens as the database
 * owner; every message, count and write then happens inside that workspace's own
 * transaction, so RLS still decides what is visible.
 *
 * Three behaviours are what stop a chaser from becoming a spammer, and each is
 * tested:
 *
 * - a completed ticket cancels its pending rungs instead of chasing a ghost;
 * - a rung whose moment no longer matches the due date is cancelled, so moving a
 *   due date cannot leave a stale message waiting to fire;
 * - quiet hours *defer* a message rather than dropping it, in the recipient's own
 *   timezone.
 */

export const DIGEST_HOUR = 9;
export const DEFAULT_DIGEST_WEEKDAY = 1; // Monday, matching the ladder in the UI

/** Tickets due inside this window are "due soon" in the digest. */
const DIGEST_HORIZON_DAYS = 7;

export type RunReport = {
  /** Rows that were due at `now` when the pass started. */
  considered: number;
  sent: number;
  failed: number;
  deferred: number;
  cancelled: number;
  /** In-app notifications written, one per delivered in-app message. */
  notifications: number;
  /** Digest rows that went out. */
  digests: number;
  /** Digest rows placed for the coming week. */
  digestsScheduled: number;
  /** One human line per decision, for the scheduler's log. */
  details: string[];
};

export function emptyReport(): RunReport {
  return {
    considered: 0,
    sent: 0,
    failed: 0,
    deferred: 0,
    cancelled: 0,
    notifications: 0,
    digests: 0,
    digestsScheduled: 0,
    details: [],
  };
}

export async function runFollowups(
  options: { now?: Date; limitPerWorkspace?: number } = {},
): Promise<RunReport> {
  const now = options.now ?? new Date();
  const report = emptyReport();
  const limit = options.limitPerWorkspace ?? 200;
  const sender = emailSender();

  const workspaces = await getDb()
    .select({ id: t.workspaces.id })
    .from(t.workspaces);

  for (const workspace of workspaces) {
    await withWorkspace(workspace.id, async (tx) => {
      const [workspaceRow] = await tx
        .select({ name: t.workspaces.name, settings: t.workspaces.settings })
        .from(t.workspaces);

      const settings = workspaceRow?.settings ?? {};

      report.digestsScheduled += await ensureDigests(tx, settings, now);

      const due = await tx
        .select()
        .from(t.followups)
        .where(
          and(
            eq(t.followups.status, "scheduled"),
            lte(t.followups.scheduledFor, now),
          ),
        )
        .orderBy(asc(t.followups.scheduledFor))
        .limit(limit);

      for (const row of due) {
        report.considered += 1;
        if (row.ticketId === null) {
          await deliverDigest(
            tx,
            row,
            workspaceRow?.name ?? "the workspace",
            settings,
            now,
            sender,
            report,
          );
        } else {
          await deliverRung(tx, row, settings, now, sender, report);
        }
      }
    });
  }

  return report;
}

/* --------------------------------------------------------------- one rung */

async function deliverRung(
  tx: Db,
  row: typeof t.followups.$inferSelect,
  settings: WorkspaceSettings,
  now: Date,
  sender: EmailSender | null,
  report: RunReport,
): Promise<void> {
  const ticketId = row.ticketId!;

  const settle = (status: "sent" | "failed" | "cancelled", detail: string) =>
    tx
      .update(t.followups)
      .set({ status, sentAt: status === "cancelled" ? null : now, detail })
      .where(eq(t.followups.id, row.id));

  const cancel = async (detail: string) => {
    await settle("cancelled", detail);
    report.cancelled += 1;
    report.details.push(`cancelled ${row.kind} — ${detail}`);
  };

  if (settings.followups === "off") {
    await cancel("Chasing is switched off for this workspace.");
    return;
  }

  const [ticket] = await tx
    .select({
      key: t.tickets.key,
      title: t.tickets.title,
      status: t.tickets.status,
      dueAt: t.tickets.dueAt,
      assigneeId: t.tickets.assigneeId,
      actionItemId: t.tickets.actionItemId,
    })
    .from(t.tickets)
    .where(eq(t.tickets.id, ticketId));

  if (!ticket) {
    await cancel("The ticket was deleted before this went out.");
    return;
  }

  if (ticket.status === "done") {
    await settle("cancelled", "The work was finished before this was due.");
    report.cancelled += 1;
    report.details.push(`cancelled ${ticket.key} ${row.kind} — already done`);
    return;
  }

  // A due date that moved (or went away) leaves rungs whose moment no longer
  // exists. `refreshLadder` cancels those when the change is made through the app;
  // this is the safety net for a row that was never rebuilt. A row the engine or a
  // person has already moved (`detail` set — deferred for quiet hours, snoozed,
  // queued by hand) is deliberately off the ladder, so it is left alone.
  const movedByHand = row.detail !== null;
  const matchesLadder =
    ticket.dueAt !== null &&
    rungFor(row.kind, row.scheduledFor, ticket.dueAt) !== null;
  if (!movedByHand && !matchesLadder) {
    await cancel("The due date changed, so this message is out of date.");
    report.details.push(`cancelled ${ticket.key} ${row.kind} — due date moved`);
    return;
  }

  const recipientId = row.recipientId ?? ticket.assigneeId;
  const [recipient] = recipientId
    ? await tx
        .select({
          id: t.users.id,
          name: t.users.name,
          email: t.users.email,
          timezone: t.users.timezone,
        })
        .from(t.users)
        .where(eq(t.users.id, recipientId))
    : [];

  if (!recipient) {
    await cancel("There is nobody left in this workspace to send it to.");
    return;
  }

  // Quiet hours hold ordinary messages back. Only security events are exempt, and
  // none of those are sent from here.
  const quietUntil = deferPastQuietHours(
    now,
    settings.quietHours,
    recipient.timezone,
  );
  if (quietUntil) {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: recipient.timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(quietUntil);
    await tx
      .update(t.followups)
      .set({
        scheduledFor: quietUntil,
        detail: `Held for quiet hours until ${local} (${recipient.timezone || "UTC"}).`,
      })
      .where(eq(t.followups.id, row.id));
    report.deferred += 1;
    report.details.push(
      `deferred ${ticket.key} ${row.kind} → ${quietUntil.toISOString()}`,
    );
    return;
  }

  const meeting = await meetingForTicket(tx, ticket.actionItemId);

  let organizerName: string | null = null;
  if (meeting?.createdBy && meeting.createdBy !== recipient.id) {
    const [organizer] = await tx
      .select({ name: t.users.name })
      .from(t.users)
      .where(eq(t.users.id, meeting.createdBy));
    organizerName = organizer?.name ?? null;
  }

  const [workspaceRow] = await tx
    .select({ name: t.workspaces.name, slug: t.workspaces.slug })
    .from(t.workspaces);

  const context: MessageContext = {
    tone: settings.followupTone ?? "neutral",
    kind: row.kind,
    rungLabel: labelFor(row.kind, row.scheduledFor, ticket.dueAt),
    ticketKey: ticket.key,
    ticketTitle: ticket.title,
    dueAt: ticket.dueAt,
    overdueDays: overdueDays(ticket.dueAt, now),
    assigneeName: null,
    organizerName,
    workspaceName: workspaceRow?.name ?? "the workspace",
    meetingTitle: meeting?.title ?? null,
    url: `/${workspaceRow?.slug ?? ""}/tickets/${ticket.key}`,
  };

  if (row.channel === "in_app") {
    await tx.insert(t.notifications).values({
      id: uuidv7(),
      workspaceId: row.workspaceId,
      userId: recipient.id,
      type: "followup",
      payload: {
        ticketId,
        ticketKey: ticket.key,
        title: ticket.title,
        rung: row.kind,
        rungLabel: context.rungLabel,
        body: notificationBody(context),
        dueAt: ticket.dueAt?.toISOString() ?? null,
        href: context.url,
      },
    });
    await settle("sent", "Delivered to the notification centre.");
    report.sent += 1;
    report.notifications += 1;
    return;
  }

  if (row.channel === "push") {
    await settle("failed", PUSH_UNCONFIGURED);
    report.failed += 1;
    report.details.push(`no push device for ${ticket.key} ${row.kind}`);
    return;
  }

  if (!sender) {
    await settle("failed", EMAIL_UNCONFIGURED);
    report.failed += 1;
    report.details.push(`email not configured — ${ticket.key} ${row.kind}`);
    await audit(tx, {
      workspaceId: row.workspaceId,
      actorId: null,
      action: "followup.failed",
      target: `${ticket.key}:${row.kind}`,
    });
    return;
  }

  const outcome = await sender.send({
    to: recipient.email,
    subject: messageSubject(context),
    body: messageBody(context),
  });

  await settle(outcome.delivered ? "sent" : "failed", outcome.detail);
  if (outcome.delivered) {
    report.sent += 1;
  } else {
    report.failed += 1;
    report.details.push(`email failed — ${ticket.key} ${row.kind}`);
    await audit(tx, {
      workspaceId: row.workspaceId,
      actorId: null,
      action: "followup.failed",
      target: `${ticket.key}:${row.kind}`,
    });
  }

  if (row.kind === "escalation") {
    await audit(tx, {
      workspaceId: row.workspaceId,
      actorId: null,
      action: "followup.escalated",
      target: `${ticket.key} → ${recipient.name}`,
    });
  }
}

/* ------------------------------------------------------------ the digest */

async function deliverDigest(
  tx: Db,
  row: typeof t.followups.$inferSelect,
  workspaceName: string,
  settings: WorkspaceSettings,
  now: Date,
  sender: EmailSender | null,
  report: RunReport,
): Promise<void> {
  const settle = (status: "sent" | "failed" | "cancelled", detail: string) =>
    tx
      .update(t.followups)
      .set({ status, sentAt: status === "cancelled" ? null : now, detail })
      .where(eq(t.followups.id, row.id));

  if (settings.followups === "off") {
    await settle("cancelled", "Chasing is switched off for this workspace.");
    report.cancelled += 1;
    return;
  }

  const [recipient] = row.recipientId
    ? await tx
        .select({
          id: t.users.id,
          email: t.users.email,
          timezone: t.users.timezone,
        })
        .from(t.users)
        .where(eq(t.users.id, row.recipientId))
    : [];

  if (!recipient) {
    await settle("cancelled", "There is nobody left in this workspace to send it to.");
    report.cancelled += 1;
    return;
  }

  const quietUntil = deferPastQuietHours(
    now,
    settings.quietHours,
    recipient.timezone,
  );
  if (quietUntil) {
    await tx
      .update(t.followups)
      .set({ scheduledFor: quietUntil, detail: "Held for quiet hours." })
      .where(eq(t.followups.id, row.id));
    report.deferred += 1;
    return;
  }

  const digest = await buildDigest(tx, workspaceName, now, settings);

  if (row.channel === "in_app") {
    await tx.insert(t.notifications).values({
      id: uuidv7(),
      workspaceId: row.workspaceId,
      userId: recipient.id,
      type: "digest",
      payload: {
        subject: digestSubject(digest),
        body: digestBody(digest),
        href: digest.url,
        overdue: digest.overdue.length,
        dueThisWeek: digest.dueThisWeek.length,
      },
    });
    await settle("sent", "Delivered to the notification centre.");
    report.sent += 1;
    report.digests += 1;
    report.notifications += 1;
    return;
  }

  if (row.channel === "push") {
    await settle("failed", PUSH_UNCONFIGURED);
    report.failed += 1;
    return;
  }

  if (!sender) {
    await settle("failed", EMAIL_UNCONFIGURED);
    report.failed += 1;
    report.details.push("digest email not configured");
    return;
  }

  const outcome = await sender.send({
    to: recipient.email,
    subject: digestSubject(digest),
    body: digestBody(digest),
  });
  await settle(outcome.delivered ? "sent" : "failed", outcome.detail);
  if (outcome.delivered) {
    report.sent += 1;
    report.digests += 1;
  } else {
    report.failed += 1;
    report.details.push("digest email failed");
  }
}

/**
 * What the digest is about: what is late, what is coming, and what is waiting on
 * a human. Read through the tenant scope like everything else.
 */
export async function buildDigest(
  tx: Db,
  workspaceName: string,
  now: Date,
  settings: WorkspaceSettings,
): Promise<DigestContext> {
  const horizon = new Date(now.getTime() + DIGEST_HORIZON_DAYS * 24 * HOUR_MS);

  const open = await tx
    .select({
      key: t.tickets.key,
      title: t.tickets.title,
      dueAt: t.tickets.dueAt,
      assigneeName: t.users.name,
    })
    .from(t.tickets)
    .leftJoin(t.users, eq(t.users.id, t.tickets.assigneeId))
    .where(ne(t.tickets.status, "done"))
    .orderBy(asc(t.tickets.dueAt));

  const overdue: DigestLine[] = [];
  const dueThisWeek: DigestLine[] = [];

  for (const row of open) {
    if (!row.dueAt) continue;
    const line: DigestLine = {
      key: row.key,
      title: row.title,
      assigneeName: row.assigneeName,
      dueAt: row.dueAt,
      overdueDays: overdueDays(row.dueAt, now),
    };
    if (row.dueAt.getTime() < now.getTime()) overdue.push(line);
    else if (row.dueAt.getTime() <= horizon.getTime()) dueThisWeek.push(line);
  }

  const [review] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(t.actionItems)
    .where(eq(t.actionItems.status, "proposed"));

  const [workspace] = await tx
    .select({ slug: t.workspaces.slug })
    .from(t.workspaces);

  return {
    workspaceName,
    url: `/${workspace?.slug ?? ""}`,
    overdue: overdue.slice(0, 10),
    dueThisWeek: dueThisWeek.slice(0, 10),
    awaitingReview: review?.count ?? 0,
    weekdayLabel: weekdayName(settings.digestWeekday),
  };
}

/**
 * Places the coming week's digest for every owner and admin, in their own
 * timezone. Idempotent: a recipient who already has a pending digest is left
 * alone, so running the engine twice in a day does not send two.
 */
async function ensureDigests(
  tx: Db,
  settings: WorkspaceSettings,
  now: Date,
): Promise<number> {
  if (settings.followups === "off") return 0;

  const [workspace] = await tx
    .select({ id: t.workspaces.id })
    .from(t.workspaces);
  if (!workspace) return 0;

  const owners = await tx
    .select({ userId: t.memberships.userId, timezone: t.users.timezone })
    .from(t.memberships)
    .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
    .where(inArray(t.memberships.role, ["owner", "admin"]));

  const pending = await tx
    .select({ recipientId: t.followups.recipientId })
    .from(t.followups)
    .where(
      and(
        eq(t.followups.kind, "digest"),
        eq(t.followups.status, "scheduled"),
        isNull(t.followups.ticketId),
        gte(t.followups.scheduledFor, now),
      ),
    );

  const alreadyPlaced = new Set(
    pending
      .map((row) => row.recipientId)
      .filter((id): id is string => id !== null),
  );

  const weekday = settings.digestWeekday ?? DEFAULT_DIGEST_WEEKDAY;
  let scheduled = 0;

  for (const owner of owners) {
    if (alreadyPlaced.has(owner.userId)) continue;

    const scheduledFor = nextWeekdayTime(
      now,
      owner.timezone,
      weekday,
      DIGEST_HOUR,
      0,
    );

    for (const channel of ["in_app", "email"] as const) {
      await tx.insert(t.followups).values({
        id: uuidv7(),
        workspaceId: workspace.id,
        ticketId: null,
        kind: "digest",
        channel,
        recipientId: owner.userId,
        scheduledFor,
        status: "scheduled",
      });
      scheduled += 1;
    }
  }

  return scheduled;
}

/* ------------------------------------------------- getting the ladder there */

/**
 * Rebuilds a ticket's pending rungs from its due date. Pending rungs are
 * *cancelled* rather than deleted, so the timeline keeps the record of what was
 * going to happen and a rescheduled message is visible as such.
 */
export async function refreshLadder(input: {
  workspaceId: string;
  actorId: string | null;
  ticketId: string;
  dueAt: Date | null;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();

  return withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select({
        assigneeId: t.tickets.assigneeId,
        actionItemId: t.tickets.actionItemId,
      })
      .from(t.tickets)
      .where(eq(t.tickets.id, input.ticketId));

    if (!ticket) return 0;

    await cancelPendingFollowups(
      tx,
      input.ticketId,
      "Replaced when the schedule changed.",
    );

    if (!input.dueAt) return 0;

    const meeting = await meetingForTicket(tx, ticket.actionItemId);

    return scheduleTicketLadder(tx, {
      workspaceId: input.workspaceId,
      ticketId: input.ticketId,
      dueAt: input.dueAt,
      ownerId: ticket.assigneeId,
      meetingId: meeting?.id ?? null,
      now,
    });
  });
}

/**
 * A ticket reaches its meeting through the action item it came from — there is no
 * direct link, so this is the join the escalation recipient depends on.
 */
async function meetingForTicket(
  tx: Db,
  actionItemId: string | null,
): Promise<{ id: string; title: string; createdBy: string | null } | null> {
  if (!actionItemId) return null;

  const [row] = await tx
    .select({
      id: t.meetings.id,
      title: t.meetings.title,
      createdBy: t.meetings.createdBy,
    })
    .from(t.actionItems)
    .innerJoin(t.meetings, eq(t.meetings.id, t.actionItems.meetingId))
    .where(eq(t.actionItems.id, actionItemId));

  return row ?? null;
}

/** Cancels every pending rung for a ticket: "stop chasing this". */
export async function cancelPendingFollowups(
  tx: Db,
  ticketId: string,
  detail: string,
): Promise<number> {
  const cancelled = await tx
    .update(t.followups)
    .set({ status: "cancelled", detail })
    .where(
      and(
        eq(t.followups.ticketId, ticketId),
        eq(t.followups.status, "scheduled"),
      ),
    )
    .returning({ id: t.followups.id });

  return cancelled.length;
}

/**
 * The rungs a new ticket gets. Called from `approveActionItems`, so the ladder is
 * real from the first due date rather than a single optimistic reminder.
 */
export async function scheduleTicketLadder(
  tx: Db,
  input: {
    workspaceId: string;
    ticketId: string;
    dueAt: Date;
    ownerId: string | null;
    meetingId: string | null;
    now: Date;
  },
): Promise<number> {
  const [meeting] = input.meetingId
    ? await tx
        .select({ createdBy: t.meetings.createdBy })
        .from(t.meetings)
        .where(eq(t.meetings.id, input.meetingId))
    : [];

  const rows = scheduleLadder({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    dueAt: input.dueAt,
    ownerId: input.ownerId,
    // The spec says "escalate to the meeting organizer"; the closest real field
    // is whoever created the meeting, falling back to the workspace owner.
    organizerId: meeting?.createdBy ?? (await workspaceOwnerId(tx)),
    now: input.now,
    pushAvailable: false,
  });

  if (rows.length === 0) return 0;
  await tx.insert(t.followups).values(rows);
  return rows.length;
}

/** The owner of the workspace, used when a meeting has no creator on record. */
async function workspaceOwnerId(tx: Db): Promise<string | null> {
  const [row] = await tx
    .select({ userId: t.memberships.userId })
    .from(t.memberships)
    .where(eq(t.memberships.role, "owner"))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * A one-off chase, for the button on a ticket. It queues the same owner message
 * the ladder would, immediately, without disturbing the rest of the schedule.
 */
export async function queueChase(input: {
  workspaceId: string;
  ticketId: string;
  actorId: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();

  return withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select({ assigneeId: t.tickets.assigneeId, key: t.tickets.key })
      .from(t.tickets)
      .where(eq(t.tickets.id, input.ticketId));

    if (!ticket?.assigneeId) return 0;

    // The owner gets the same message the ladder would send, on the channels it
    // would use, but right now: this is "chase it", not a new rung.
    const channels = ["in_app", "email"] as const;

    const inserted = await tx
      .insert(t.followups)
      .values(
        channels.map((channel) => ({
          id: uuidv7(),
          workspaceId: input.workspaceId,
          ticketId: input.ticketId,
          kind: "nudge" as const,
          channel,
          recipientId: ticket.assigneeId,
          scheduledFor: now,
          status: "scheduled" as const,
          // Marked as moved by a person: the engine re-checks an untouched rung
          // against the due date, and a hand-queued message is not on the ladder.
          detail: "Queued by hand.",
        })),
      )
      .returning({ id: t.followups.id });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "followup.chased",
      target: ticket.key,
    });

    return inserted.length;
  });
}

/**
 * Pushes a ticket's pending rungs out to `until`, for "snooze". The ladder is
 * left intact otherwise: this is a delay, not a cancellation.
 */
export async function snoozeTicket(input: {
  workspaceId: string;
  actorId: string;
  ticketId: string;
  until: Date;
}): Promise<number> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const updated = await tx
      .update(t.followups)
      .set({ scheduledFor: input.until, detail: `Snoozed to ${input.until.toISOString()}.` })
      .where(
        and(
          eq(t.followups.ticketId, input.ticketId),
          eq(t.followups.status, "scheduled"),
          lte(t.followups.scheduledFor, input.until),
        ),
      )
      .returning({ id: t.followups.id });

    if (updated.length === 0) return 0;

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "followup.snoozed",
      target: `${input.ticketId} → ${input.until.toISOString()}`,
    });

    return updated.length;
  });
}
