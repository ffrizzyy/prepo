import { and, eq, lte } from "drizzle-orm";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import { EMAIL_UNCONFIGURED, emailSender } from "../followups/channels";
import {
  queueChase,
  refreshLadder,
  runFollowups,
  snoozeTicket,
} from "../followups/engine";
import {
  LADDER,
  labelFor,
  overdueDays,
  rungFor,
  rungTime,
  scheduleLadder,
} from "../followups/ladder";
import {
  digestBody,
  digestSubject,
  messageBody,
  messageSubject,
  normalizeTone,
  notificationBody,
  type MessageContext,
} from "../followups/message";
import {
  deferPastQuietHours,
  inQuietHours,
  nextWeekdayTime,
  parseClock,
  quietWindow,
  weekdayName,
} from "../followups/quiet";
import { listFollowupsView, listNotifications } from "../queries";
import {
  markNotificationsRead,
  moveTicket,
  setFollowupsEnabled,
  stopChasing,
} from "../writes";
import { withWorkspace } from "./client";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

/**
 * The follow-up engine, checked end to end:
 *   pnpm --filter @prepo/web db:followup-smoke
 *
 * The arithmetic, the quiet-hours clock and the wording are pure functions, so
 * they are asserted directly. The engine is then run against the seeded data at a
 * fixed moment, Monday 19 October 2026, 10:00 UTC, which is why the digest lands
 * on that day for Berlin and on the same day for New York: the point is that the
 * placement is per person, in their own zone.
 *
 * There is no email provider on this machine, so the one thing that cannot be
 * exercised is the HTTP call to Resend. Everything either side of it is: that a
 * message is attempted, that it is marked *failed with the reason*, that the
 * in-app copy is still delivered, and that nothing is silently marked sent.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `, ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Monday, 19 October 2026, 10:00 UTC. */
const NOW = new Date("2026-10-19T10:00:00.000Z");

const HOUR = 60 * 60 * 1000;

function context(overrides: Partial<MessageContext> = {}): MessageContext {
  return {
    tone: "neutral",
    kind: "nudge",
    rungLabel: "Overdue +1 day",
    ticketKey: "PRE-139",
    ticketTitle: "Fix the billing webhook retry storm",
    dueAt: new Date("2026-10-16T09:00:00.000Z"),
    overdueDays: 3,
    assigneeName: "Dmitri Volkov",
    organizerName: "Lena Fischer",
    workspaceName: "Northwind",
    meetingTitle: "Q4 Launch, Weekly Sync",
    url: "/northwind/tickets/PRE-139",
    ...overrides,
  };
}

runCli("followup-smoke.ts", async () => {
  await migrateAndApply();
  await seed();

  const northwind = (await resolveWorkspaceId("northwind"))!;
  const globex = (await resolveWorkspaceId("globex"))!;
  const lena = (await getUserByEmail(DEMO.email))!;

  /* ------------------------------------------------ the ladder, as arithmetic */

  check("the ladder has the four documented rungs", LADDER.length === 4);
  check(
    "the rungs are ordered from before the due date to three days late",
    LADDER.map((rung) => rung.offsetHours).join(",") === "-24,0,24,72",
    LADDER.map((rung) => rung.offsetHours).join(","),
  );
  check(
    "the escalation goes to the organizer and the rest to the owner",
    LADDER.filter((rung) => rung.recipient === "organizer").length === 1 &&
      LADDER.find((rung) => rung.recipient === "organizer")?.kind ===
        "escalation",
  );
  check(
    "the nudge is the only rung that lists push",
    LADDER.filter((rung) => rung.channels.includes("push")).length === 1 &&
      LADDER.find((rung) => rung.channels.includes("push"))?.kind === "nudge",
  );

  const dueAt = new Date("2026-10-20T09:00:00.000Z");
  check(
    "a rung's moment is the due date plus its offset",
    rungTime(dueAt, LADDER[0]!).toISOString() === "2026-10-19T09:00:00.000Z" &&
      rungTime(dueAt, LADDER[3]!).toISOString() === "2026-10-23T09:00:00.000Z",
    `${rungTime(dueAt, LADDER[0]!).toISOString()} … ${rungTime(dueAt, LADDER[3]!).toISOString()}`,
  );

  const ladderRows = scheduleLadder({
    workspaceId: northwind,
    ticketId: "00000000-0000-7000-8000-000000000001",
    dueAt,
    ownerId: "00000000-0000-7000-8000-000000000002",
    organizerId: "00000000-0000-7000-8000-000000000003",
    now: new Date("2026-10-19T00:00:00.000Z"),
    pushAvailable: false,
  });
  check(
    "the whole ladder is scheduled when the due date is far enough ahead",
    ladderRows.length === 7,
    `${ladderRows.length} rows`,
  );
  check(
    "no push row is scheduled while no device is subscribed",
    ladderRows.every((row) => row.channel !== "push"),
  );
  check(
    "the escalation row belongs to the organizer",
    ladderRows.filter((row) => row.kind === "escalation").every((row) => row.recipientId === "00000000-0000-7000-8000-000000000003"),
  );

  const withPush = scheduleLadder({
    workspaceId: northwind,
    ticketId: "00000000-0000-7000-8000-000000000001",
    dueAt,
    ownerId: "00000000-0000-7000-8000-000000000002",
    organizerId: "00000000-0000-7000-8000-000000000003",
    now: new Date("2026-10-19T00:00:00.000Z"),
    pushAvailable: true,
  });
  check(
    "push is scheduled once a device exists",
    withPush.some((row) => row.channel === "push"),
  );

  const midway = scheduleLadder({
    workspaceId: northwind,
    ticketId: "00000000-0000-7000-8000-000000000001",
    dueAt,
    ownerId: "00000000-0000-7000-8000-000000000002",
    organizerId: "00000000-0000-7000-8000-000000000003",
    now: new Date("2026-10-20T12:00:00.000Z"),
    pushAvailable: false,
  });
  check(
    "rungs whose moment has already passed are not scheduled",
    midway.length === 3,
    `${midway.length} rows`,
  );
  check(
    "an already-overdue ticket still gets its remaining rungs",
    midway.map((row) => row.kind).join(",") === "nudge,nudge,escalation",
    midway.map((row) => row.kind).join(","),
  );

  const unassigned = scheduleLadder({
    workspaceId: northwind,
    ticketId: "00000000-0000-7000-8000-000000000001",
    dueAt,
    ownerId: null,
    organizerId: "00000000-0000-7000-8000-000000000003",
    now: new Date("2026-10-19T00:00:00.000Z"),
    pushAvailable: false,
  });
  check(
    "an unassigned ticket is not reminded, but is still escalated",
    unassigned.length === 1 && unassigned[0]!.kind === "escalation",
    `${unassigned.length} rows`,
  );

  check(
    "rungFor recovers the rung from a stored row",
    rungFor("nudge", new Date(dueAt.getTime() + 24 * HOUR), dueAt)?.id ===
      "overdue-1",
  );
  check(
    "rungFor returns nothing when the moment does not match the due date",
    rungFor("nudge", new Date(dueAt.getTime() + 30 * HOUR), dueAt) === null,
  );
  check(
    "labelFor names a digest and a rung",
    labelFor("digest", null, null) === "Weekly digest" &&
      labelFor("reminder", new Date(dueAt.getTime() - 24 * HOUR), dueAt) ===
        "24h before due",
    `${labelFor("digest", null, null)} / ${labelFor("reminder", new Date(dueAt.getTime() - 24 * HOUR), dueAt)}`,
  );

  check(
    "overdueDays counts whole days late",
    overdueDays(new Date("2026-10-14T09:00:00.000Z"), NOW) === 5 &&
      overdueDays(new Date("2026-10-20T09:00:00.000Z"), NOW) === 0 &&
      overdueDays(null, NOW) === 0,
  );

  /* --------------------------------------------------------------- quiet hours */

  check(
    "parseClock reads a clock time and refuses nonsense",
    parseClock("18:00") === 1080 &&
      parseClock("9:05") === 545 &&
      parseClock("25:00") === null &&
      parseClock("9:0") === null &&
      parseClock(9) === null,
  );
  check(
    "a window that starts and ends at the same minute is no window",
    quietWindow({ from: "09:00", to: "09:00" }) === null &&
      quietWindow(undefined) === null,
  );

  const overnight = { from: "18:00", to: "09:00" };
  check(
    "22:00 is inside an overnight quiet window",
    inQuietHours(new Date("2026-10-19T22:00:00.000Z"), overnight, "UTC"),
  );
  check(
    "12:00 is outside it",
    !inQuietHours(new Date("2026-10-19T12:00:00.000Z"), overnight, "UTC"),
  );
  check(
    "the window is read in the recipient's zone, not the server's",
    inQuietHours(new Date("2026-10-19T17:00:00.000Z"), overnight, "Europe/Berlin") &&
      !inQuietHours(new Date("2026-10-19T09:00:00.000Z"), overnight, "Europe/Berlin"),
  );
  check(
    "an unknown timezone falls back to UTC rather than throwing",
    inQuietHours(new Date("2026-10-19T22:00:00.000Z"), overnight, "Mars/Olympus"),
  );

  const deferred = deferPastQuietHours(
    new Date("2026-10-19T22:00:00.000Z"),
    overnight,
    "UTC",
  );
  check(
    "a nightly hold ends at the morning boundary",
    deferred?.toISOString() === "2026-10-20T09:00:00.000Z",
    deferred?.toISOString() ?? "none",
  );
  check(
    "a message outside the window is not held",
    deferPastQuietHours(new Date("2026-10-19T12:00:00.000Z"), overnight, "UTC") ===
      null,
  );
  check(
    "a daytime window defers to its own end",
    deferPastQuietHours(
      new Date("2026-10-19T13:00:00.000Z"),
      { from: "12:00", to: "14:00" },
      "UTC",
    )?.toISOString() === "2026-10-19T14:00:00.000Z",
  );

  check(
    "the digest lands on the next Monday at 09:00",
    nextWeekdayTime(
      new Date("2026-10-14T12:00:00.000Z"),
      "UTC",
      1,
    ).toISOString() === "2026-10-19T09:00:00.000Z",
  );
  check(
    "a digest slot later today is used rather than skipped a week",
    nextWeekdayTime(
      new Date("2026-10-19T08:00:00.000Z"),
      "UTC",
      1,
    ).toISOString() === "2026-10-19T09:00:00.000Z",
  );
  check(
    "a digest slot already passed waits for the next week",
    nextWeekdayTime(
      new Date("2026-10-19T10:00:00.000Z"),
      "UTC",
      1,
    ).toISOString() === "2026-10-26T09:00:00.000Z",
  );
  check(
    "the digest is placed at 09:00 in the recipient's own zone",
    nextWeekdayTime(
      new Date("2026-10-19T10:00:00.000Z"),
      "America/New_York",
      1,
    ).toISOString() === "2026-10-19T13:00:00.000Z",
  );
  check("weekdayName names a day", weekdayName(1) === "Monday");

  /* ------------------------------------------------------------------ wording */

  check(
    "the subject names the ticket and mirrors the rung",
    messageSubject(context()).startsWith("Follow-up: PRE-139") &&
      messageSubject(context({ kind: "escalation" })).startsWith(
        "Escalation: PRE-139",
      ),
  );
  const body = messageBody(context());
  check(
    "the body carries the facts: key, title, due date and how late",
    body.includes("PRE-139") &&
      body.includes("Fix the billing webhook retry storm") &&
      body.includes("2026-10-16") &&
      body.includes("3 days late"),
  );
  check(
    "the body links back to the ticket",
    body.includes("/northwind/tickets/PRE-139"),
  );
  check(
    "the escalation names the organizer, not the assignee",
    messageBody(context({ kind: "escalation" })).includes("Lena Fischer"),
  );
  const gentle = messageBody(context({ tone: "gentle" }));
  const firm = messageBody(context({ tone: "firm" }));
  check(
    "the tone changes the wording",
    gentle !== firm &&
      gentle.includes("A small heads-up") === false &&
      gentle.includes("just let the ticket know"),
  );
  check(
    "every tone still carries the facts",
    [gentle, firm, messageBody(context({ tone: "neutral" }))].every(
      (text) =>
        text.includes("PRE-139") &&
        text.includes("2026-10-16") &&
        text.includes("3 days late"),
    ),
  );
  check(
    "an unknown tone is read as neutral",
    normalizeTone("shouty") === "neutral" && normalizeTone(undefined) === "neutral",
  );
  check(
    "a due-today notification says so rather than claiming lateness",
    notificationBody(context({ overdueDays: 0 })).includes("due 2026-10-16") &&
      notificationBody(context()).includes("3d late"),
  );

  const digest = {
    workspaceName: "Northwind",
    url: "/northwind",
    overdue: [
      {
        key: "PRE-139",
        title: "Fix the billing webhook retry storm",
        assigneeName: "Dmitri Volkov",
        dueAt: new Date("2026-10-16T09:00:00.000Z"),
        overdueDays: 3,
      },
    ],
    dueThisWeek: [],
    awaitingReview: 4,
    weekdayLabel: "Monday",
  };
  check(
    "the digest subject summarises the week",
    digestSubject(digest) === "Monday digest, 1 overdue, 4 to review",
    digestSubject(digest),
  );
  check(
    "an empty week is called all clear rather than sent as a blank",
    digestSubject({ ...digest, overdue: [], awaitingReview: 0 }) ===
      "Monday digest, all clear" &&
      digestBody({ ...digest, overdue: [], awaitingReview: 0 }).includes(
        "Nothing is overdue",
      ),
  );
  check(
    "the digest body lists the tickets and links to the workspace",
    digestBody(digest).includes("PRE-139") &&
      digestBody(digest).includes("/northwind"),
  );

  /* -------------------------------------------------------------- the channels */

  check(
    "no email sender exists without a key",
    emailSender({}) === null,
  );
  check(
    "a key produces the Resend sender",
    emailSender({ RESEND_API_KEY: "test-key" })?.name === "resend",
  );
  check(
    "the unconfigured reason names the variable to set",
    EMAIL_UNCONFIGURED.includes("RESEND_API_KEY") &&
      EMAIL_UNCONFIGURED.startsWith("Not sent"),
  );

  /* ----------------------------------------------------------- the engine, live */

  // Quiet hours are a property of the person, so the engine test starts from the
  // demo user's real zone and the workspace's seeded 18:00–09:00 window. At 10:00
  // UTC that is 12:00 in Berlin: outside the window.
  const seededTickets = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        id: t.tickets.id,
        key: t.tickets.key,
        status: t.tickets.status,
        dueAt: t.tickets.dueAt,
        assigneeId: t.tickets.assigneeId,
      })
      .from(t.tickets),
  );
  // The ticket the engine tests work on. It has to be one whose due date is still
  // ahead of NOW, because the rebuild further down is about *replacing pending*
  // rungs: a ticket whose whole ladder is already in the past has nothing left to
  // cancel, and that check would pass without testing anything. Sorting fixes the
  // choice too, the select has no ORDER BY, so the row order is not a promise.
  const target = seededTickets
    .filter(
      (ticket) =>
        ticket.status !== "done" &&
        ticket.dueAt !== null &&
        ticket.dueAt.getTime() > NOW.getTime() &&
        ticket.assigneeId !== null,
    )
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0]!;
  check(
    "the seed provides an open ticket, with a date ahead of now and an owner",
    Boolean(target),
  );

  const dueBefore = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.followups.id })
      .from(t.followups)
      .where(
        and(
          eq(t.followups.status, "scheduled"),
          lte(t.followups.scheduledFor, NOW),
        ),
      ),
  );
  check("the seed has messages that are already due", dueBefore.length > 0);

  // Chasing now adds the in-app copy the seeded rows do not have, so the pass has
  // something it can actually deliver as well as something it cannot.
  const handQueued = await queueChase({
    workspaceId: northwind,
    ticketId: target.id,
    actorId: lena.id,
    now: NOW,
  });
  check("chasing a ticket queues both channels", handQueued === 2);

  const chaseAudited = await withWorkspace(northwind, async (tx) => {
    const rows = await tx
      .select({ id: t.auditLogs.id })
      .from(t.auditLogs)
      .where(eq(t.auditLogs.action, "followup.chased"));
    return rows.length > 0;
  });
  check("chasing is recorded in the audit log", chaseAudited);

  const report = await runFollowups({ now: NOW });
  check(
    "the engine considers every message that is due",
    report.considered >= dueBefore.length,
    `${report.considered} considered`,
  );
  check(
    "the in-app copies are delivered",
    report.sent > 0 && report.notifications > 0,
    `${report.sent} sent, ${report.notifications} notifications`,
  );
  check(
    "email is attempted and recorded as failed, not silently sent",
    report.failed > 0,
    `${report.failed} failed`,
  );

  const emailRows = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        status: t.followups.status,
        detail: t.followups.detail,
      })
      .from(t.followups)
      .where(eq(t.followups.channel, "email")),
  );
  // Two environments, one claim: a refused email always says why. With a provider
  // configured the reason is the provider's own words; without one it is that the
  // variable is missing. The earlier check pins the second wording; this one is
  // about never recording a failure with nothing to explain it.
  const providerConfigured = emailSender() !== null;
  const failedEmails = emailRows.filter((row) => row.status === "failed");
  check(
    "every attempted email says why it did not go out",
    failedEmails.length > 0 &&
      failedEmails.every((row) =>
        providerConfigured
          ? (row.detail ?? "").length > 0
          : (row.detail ?? "").includes("RESEND_API_KEY"),
      ),
    `${failedEmails.length} failed, provider ${providerConfigured ? "configured" : "absent"}`,
  );
  check(
    "a failed message is stamped with the attempt time and a reason",
    await withWorkspace(northwind, async (tx) => {
      const rows = await tx
        .select({ sentAt: t.followups.sentAt, detail: t.followups.detail })
        .from(t.followups)
        .where(eq(t.followups.status, "failed"));
      return (
        rows.length > 0 &&
        rows.every((row) => row.sentAt !== null && row.detail !== null)
      );
    }),
  );

  const leftDue = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.followups.id })
      .from(t.followups)
      .where(
        and(
          eq(t.followups.status, "scheduled"),
          lte(t.followups.scheduledFor, NOW),
        ),
      ),
  );
  check(
    "nothing due is left in the scheduled state",
    leftDue.length === 0,
    `${leftDue.length} still scheduled`,
  );

  // Running again must not double-send: a sent row is no longer scheduled.
  const secondPass = await runFollowups({ now: NOW });
  check(
    "a second pass at the same moment has nothing left to do",
    secondPass.considered === 0 && secondPass.sent === 0,
    `${secondPass.considered} considered`,
  );

  /* ------------------------------------------------------------- the digest */

  const digests = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        id: t.followups.id,
        channel: t.followups.channel,
        scheduledFor: t.followups.scheduledFor,
        recipientId: t.followups.recipientId,
        status: t.followups.status,
      })
      .from(t.followups)
      .where(eq(t.followups.kind, "digest")),
  );
  check(
    "a digest is placed for owners and admins, on both channels",
    digests.filter((row) => row.channel === "in_app").length >= 1 &&
      digests.filter((row) => row.channel === "email").length >= 1,
    `${digests.length} rows`,
  );
  check(
    "digest rows belong to the workspace, not a ticket",
    await withWorkspace(northwind, async (tx) => {
      const rows = await tx
        .select({ ticketId: t.followups.ticketId })
        .from(t.followups)
        .where(eq(t.followups.kind, "digest"));
      return rows.every((row) => row.ticketId === null);
    }),
  );

  const digestIdempotencePass = await runFollowups({ now: NOW });
  check(
    "running the engine again does not place a second digest",
    digestIdempotencePass.digestsScheduled === 0,
    `${digestIdempotencePass.digestsScheduled} placed`,
  );

  const digestAt = new Date(
    digests.find((row) => row.recipientId === lena.id)?.scheduledFor ??
      "2026-10-19T13:00:00.000Z",
  );
  const berlinLocal = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(digestAt);
  check(
    "the demo user's digest is placed at 09:00 in Berlin",
    berlinLocal === "09:00",
    `${digestAt.toISOString()} = ${berlinLocal} Berlin`,
  );

  const beforeDigest = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.notifications.id, payload: t.notifications.payload })
      .from(t.notifications),
  );
  const digestReport = await runFollowups({ now: digestAt });
  check(
    "the digest is delivered when its moment arrives",
    digestReport.digests >= 1,
    `${digestReport.digests} digest(s)`,
  );
  const afterDigest = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.notifications.id, payload: t.notifications.payload })
      .from(t.notifications),
  );
  check(
    "the digest writes an in-app notification",
    afterDigest.length > beforeDigest.length,
  );
  const digestPayload = afterDigest.find(
    (row) =>
      typeof (row.payload as Record<string, unknown>).subject === "string" &&
      ((row.payload as Record<string, unknown>).subject as string).includes(
        "digest",
      ),
  );
  check(
    "the digest notification carries the summary and a link",
    Boolean(digestPayload) &&
      typeof (digestPayload!.payload as Record<string, unknown>).href ===
        "string",
  );

  /* ---------------------------------------------------------- quiet hours, live */

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.users)
      .set({ timezone: "Pacific/Kiritimati" })
      .where(eq(t.users.id, target.assigneeId!)),
  );

  const chaseCount = await queueChase({
    workspaceId: northwind,
    ticketId: target.id,
    actorId: lena.id,
    now: NOW,
  });
  check(
    "chasing queues the owner message on both channels",
    chaseCount === 2,
    `${chaseCount} rows`,
  );

  const quietReport = await runFollowups({ now: NOW });
  check(
    "a message inside quiet hours is deferred rather than dropped",
    quietReport.deferred >= 1,
    `${quietReport.deferred} deferred`,
  );

  const held = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        status: t.followups.status,
        scheduledFor: t.followups.scheduledFor,
        detail: t.followups.detail,
      })
      .from(t.followups)
      .where(
        and(
          eq(t.followups.ticketId, target.id),
          eq(t.followups.channel, "in_app"),
          eq(t.followups.status, "scheduled"),
        ),
      ),
  );
  check(
    "the deferred row keeps its place in the queue",
    held.length >= 1 &&
      held.every((row) => row.scheduledFor.getTime() > NOW.getTime()),
    held.map((row) => row.scheduledFor.toISOString()).join(","),
  );
  check(
    "the row says it was held for quiet hours",
    held.some((row) => row.detail?.includes("quiet hours")),
    held.find((row) => row.detail)?.detail ?? "no detail",
  );

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.users)
      .set({ timezone: "Europe/Berlin" })
      .where(eq(t.users.id, target.assigneeId!)),
  );

  const afterQuiet = await runFollowups({
    now: new Date(NOW.getTime() + 24 * HOUR),
  });
  check(
    "once it is morning again the held message goes out",
    afterQuiet.sent >= 1,
    `${afterQuiet.sent} sent`,
  );

  /* ------------------------------------------------- the ticket and the person */

  const nearDue = new Date(NOW.getTime() + HOUR);

  // Give the ticket a ladder that is entirely ahead of it first. Which ticket
  // `target` is comes from the seed's row order, and the steps above may already
  // have consumed its rungs, scheduling one here is what makes the next check
  // about cancellation rather than luck.
  await refreshLadder({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    dueAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
    now: NOW,
  });

  const pendingBefore = await withWorkspace(northwind, async (tx) =>
    (
      await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(
          and(
            eq(t.followups.ticketId, target.id),
            eq(t.followups.status, "scheduled"),
          ),
        )
    ).length,
  );
  check(
    "a ladder scheduled ahead of the due date is pending",
    pendingBefore > 0,
    `${pendingBefore} pending`,
  );

  const ladderTotal = await refreshLadder({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    dueAt: nearDue,
    now: NOW,
  });
  check(
    "rebuilding the ladder cancels the old rungs and schedules the new ones",
    ladderTotal >= 4 && pendingBefore > 0,
    `${ladderTotal} new row(s), ${pendingBefore} replaced`,
  );
  const rebuilt = await withWorkspace(northwind, (tx) =>
    tx
      .select({
        status: t.followups.status,
        detail: t.followups.detail,
        scheduledFor: t.followups.scheduledFor,
      })
      .from(t.followups)
      .where(eq(t.followups.ticketId, target.id)),
  );
  check(
    "the old rungs are cancelled, not deleted",
    rebuilt.filter(
      (row) =>
        row.status === "cancelled" &&
        row.detail === "Replaced when the schedule changed.",
    ).length >= pendingBefore,
    `${pendingBefore} pending → cancelled`,
  );
  check(
    "the new rungs sit on the new due date",
    rebuilt
      .filter((row) => row.status === "scheduled")
      .some(
        (row) => row.scheduledFor.getTime() === nearDue.getTime(),
      ) &&
      rebuilt
        .filter((row) => row.status === "scheduled")
        .every(
          (row) =>
            row.scheduledFor.getTime() <= nearDue.getTime() + 72 * HOUR + 1,
        ),
  );

  // The safety net: a due date changed behind the app's back leaves a rung whose
  // moment no longer exists. The engine cancels it rather than sending it.
  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ dueAt: new Date(NOW.getTime() + 10 * 24 * HOUR) })
      .where(eq(t.tickets.id, target.id)),
  );
  const stalePass = await runFollowups({
    now: new Date(NOW.getTime() + 2 * HOUR),
  });
  const staleCancels = await withWorkspace(northwind, async (tx) =>
    (
      await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(
          and(
            eq(t.followups.ticketId, target.id),
            eq(
              t.followups.detail,
              "The due date changed, so this message is out of date.",
            ),
          ),
        )
    ).length,
  );
  check(
    "a rung left behind by a due-date change is cancelled, not sent",
    stalePass.cancelled >= 1 && staleCancels >= 1,
    `${staleCancels} stale row(s)`,
  );

  // A ladder whose rungs all fall inside the snooze window, so the snooze has
  // something to move.
  await refreshLadder({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    dueAt: new Date(NOW.getTime() + 24 * HOUR),
    now: NOW,
  });
  const snoozed = await snoozeTicket({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    until: new Date(NOW.getTime() + 5 * 24 * HOUR),
  });
  check("snoozing moves the pending rungs", snoozed >= 5, `${snoozed} rows`);

  const afterSnooze = await withWorkspace(northwind, (tx) =>
    tx
      .select({ scheduledFor: t.followups.scheduledFor })
      .from(t.followups)
      .where(
        and(
          eq(t.followups.ticketId, target.id),
          eq(t.followups.status, "scheduled"),
        ),
      ),
  );
  check(
    "nothing fires during a snooze",
    afterSnooze.every(
      (row) => row.scheduledFor.getTime() >= NOW.getTime() + 5 * 24 * HOUR,
    ),
  );

  const stopped = await stopChasing({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
  });
  check("stopping clears what was pending", stopped >= 4, `${stopped} rows`);
  await runFollowups({ now: NOW });
  check(
    "a stopped ticket is not chased on the next pass",
    await withWorkspace(northwind, async (tx) => {
      const rows = await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(
          and(
            eq(t.followups.ticketId, target.id),
            eq(t.followups.status, "scheduled"),
          ),
        );
      return rows.length === 0;
    }),
  );

  await refreshLadder({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    dueAt: new Date("2026-11-09T09:00:00.000Z"),
    now: NOW,
  });
  await moveTicket({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    status: "done",
  });
  check(
    "finishing the work cancels the rest of the ladder",
    await withWorkspace(northwind, async (tx) => {
      const rows = await tx
        .select({ status: t.followups.status, detail: t.followups.detail })
        .from(t.followups)
        .where(eq(t.followups.ticketId, target.id));
      return (
        rows.every((row) => row.status !== "scheduled") &&
        rows.some((row) => row.detail?.includes("marked done"))
      );
    }),
  );

  const rowsBeforeDonePass = await withWorkspace(northwind, async (tx) =>
    (
      await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(eq(t.followups.ticketId, target.id))
    ).length,
  );
  await runFollowups({ now: NOW });
  const rowsAfterDonePass = await withWorkspace(northwind, async (tx) =>
    (
      await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(eq(t.followups.ticketId, target.id))
    ).length,
  );
  check(
    "a completed ticket gets no new messages from the next pass",
    rowsAfterDonePass === rowsBeforeDonePass,
    `${rowsBeforeDonePass} → ${rowsAfterDonePass}`,
  );

  /* ------------------------------------------------------- the notification box */

  const inbox = await listNotifications(northwind, lena.id);
  check("the demo user's inbox has entries", inbox.length > 0, `${inbox.length}`);
  check(
    "an inbox entry names its type and has a body",
    inbox.every((entry) => entry.type.length > 0 && entry.title.length > 0),
  );

  const otherMember = await withWorkspace(northwind, async (tx) => {
    const rows = await tx
      .select({ userId: t.memberships.userId })
      .from(t.memberships);
    return rows.map((row) => row.userId).find((id) => id !== lena.id) ?? null;
  });
  check("the workspace has more than one member to compare", Boolean(otherMember));

  const othersUnreadBefore = otherMember
    ? (await listNotifications(northwind, otherMember)).filter(
        (entry) => entry.readAt === null,
      ).length
    : 0;

  const lenaRead = await markNotificationsRead({
    workspaceId: northwind,
    userId: lena.id,
  });
  check("marking the inbox read marks the demo user's messages", lenaRead > 0);
  const lenaUnread = (await listNotifications(northwind, lena.id)).filter(
    (entry) => entry.readAt === null,
  );
  check("nothing of the demo user's is left unread", lenaUnread.length === 0);

  const othersUnreadAfter = otherMember
    ? (await listNotifications(northwind, otherMember)).filter(
        (entry) => entry.readAt === null,
      ).length
    : 0;
  check(
    "another member's inbox is not touched by that",
    othersUnreadAfter === othersUnreadBefore,
    `${othersUnreadBefore} → ${othersUnreadAfter}`,
  );
  const soleRow = await withWorkspace(northwind, async (tx) => {
    const [row] = await tx
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(eq(t.notifications.userId, lena.id));
    if (!row) return null;
    await tx
      .update(t.notifications)
      .set({ readAt: null })
      .where(eq(t.notifications.id, row.id));
    return row.id;
  });

  const singleChanged = soleRow
    ? await markNotificationsRead({
        workspaceId: northwind,
        userId: lena.id,
        notificationId: soleRow,
      })
    : 0;
  const singleAfter = soleRow
    ? await withWorkspace(northwind, async (tx) => {
        const [row] = await tx
          .select({ readAt: t.notifications.readAt })
          .from(t.notifications)
          .where(eq(t.notifications.id, soleRow));
        return row?.readAt ?? null;
      })
    : null;
  check(
    "a notification can be marked read on its own",
    singleChanged === 1 && singleAfter !== null,
  );

  /* ------------------------------------------------------------ the off switch */

  await refreshLadder({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId: target.id,
    dueAt: new Date("2026-11-16T09:00:00.000Z"),
    now: NOW,
  });
  await setFollowupsEnabled({
    workspaceId: northwind,
    actorId: lena.id,
    enabled: false,
  });
  check(
    "turning chasing off cancels what is pending",
    await withWorkspace(northwind, async (tx) => {
      const rows = await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(eq(t.followups.status, "scheduled"));
      return rows.length === 0;
    }),
  );
  const offPass = await runFollowups({ now: NOW });
  check(
    "nothing is sent while chasing is off",
    offPass.sent === 0 && offPass.digestsScheduled === 0,
    `${offPass.sent} sent`,
  );

  await setFollowupsEnabled({
    workspaceId: northwind,
    actorId: lena.id,
    enabled: true,
  });
  const onPass = await runFollowups({ now: NOW });
  check(
    "turning it back on places the next digest again",
    onPass.digestsScheduled >= 1,
    `${onPass.digestsScheduled} placed`,
  );

  /* ------------------------------------------------------------ tenant boundary */

  const globexFollowups = await listFollowupsView(globex);
  check(
    "another tenant's timeline holds only its own rows",
    globexFollowups.every(
      (entry) => entry.kind === "digest" && entry.ticketId === null,
    ),
    `${globexFollowups.length} rows`,
  );
  const northwindFollowups = await listFollowupsView(northwind);
  check(
    "the northwind timeline carries the reason on a failed row",
    northwindFollowups.some((entry) => entry.detail !== null),
  );
  check(
    "a digest row appears in the timeline with no ticket",
    northwindFollowups.some(
      (entry) => entry.kind === "digest" && entry.ticketId === null,
    ),
  );

  const foreignStop = await withWorkspace(globex, async (tx) => {
    const [ticket] = await tx.select({ id: t.tickets.id }).from(t.tickets);
    return ticket?.id ?? null;
  });
  const stoppedElsewhere = foreignStop
    ? await stopChasing({
        workspaceId: globex,
        actorId: lena.id,
        ticketId: foreignStop,
      })
    : 0;
  const northwindStillThere = (await listFollowupsView(northwind)).length;
  check(
    "stopping chasing in one tenant does not empty another",
    stoppedElsewhere === 0 && northwindStillThere > 0,
    `${stoppedElsewhere} stopped, ${northwindStillThere} rows`,
  );

  const globexCancels = await withWorkspace(globex, async (tx) =>
    (
      await tx
        .select({ id: t.followups.id })
        .from(t.followups)
        .where(eq(t.followups.status, "cancelled"))
    ).length,
  );
  check(
    "the globex cancel did not reach across the tenant boundary",
    globexCancels === 0,
  );

  /* ------------------------------------------------------------------- report */

  // Leaves the database as a demo wants it: the seed's own rows, not this run's.
  await seed();

  console.log("");
  if (failures === 0) {
    console.log("all follow-up checks passed");
    return;
  }

  console.log(`${failures} check(s) failed`);
  throw new Error(`${failures} follow-up check(s) failed`);
}, "fresh");
