/**
 * End-to-end check of the write path. Calls the same write functions the server
 * actions call — with the tenant and actor resolved up front — then reads the
 * results back through the same tenant-scoped queries. It reseeds first so it is
 * repeatable:
 *   pnpm --filter @prepo/web db:smoke
 *
 * The server actions themselves cannot be called here: they read cookies and
 * revalidate, both of which need a request scope a script does not have.
 */
import { eq } from "drizzle-orm";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import {
  listActionItemsView,
  listFollowupsView,
  listTicketComments,
  listTicketEvents,
  listTicketsView,
} from "../queries";
import {
  addComment,
  approveActionItems,
  moveTicket,
  rejectActionItem,
  updateSettings,
} from "../writes";
import { withWorkspace } from "./client";
import { migrateAndApply } from "./migrate";
import { listWorkspacesForUser, resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

runCli("write-smoke.ts", async () => {
  await migrateAndApply();
  await seed();

  const northwind = (await resolveWorkspaceId("northwind"))!;
  const globex = (await resolveWorkspaceId("globex"))!;

  // The actor is the seeded demo account, so this exercises the same membership
  // the sign-in flow resolves to.
  const demo = await getUserByEmail(DEMO.email);
  const actorId = demo!.id;
  check(
    "the demo account is a member of northwind",
    (await listWorkspacesForUser(actorId)).some(
      (workspace) => workspace.id === northwind,
    ),
    DEMO.email,
  );

  const [northwindSettings] = await withWorkspace(northwind, (tx) =>
    tx.select({ settings: t.workspaces.settings }).from(t.workspaces),
  );
  const prefix = northwindSettings!.settings.ticketPrefix ?? "PRE";

  const [globexTicket] = await withWorkspace(globex, (tx) =>
    tx.select({ id: t.tickets.id, key: t.tickets.key }).from(t.tickets),
  );

  /* ------------------------------------------------------------ baseline */
  const seedItems = await listActionItemsView(northwind);
  const seedTickets = await listTicketsView(northwind);
  const proposed = seedItems.filter((item) => item.status === "proposed");

  check(
    "seed has 7 proposed action items",
    proposed.length === 7,
    String(proposed.length),
  );
  check("seed has 9 tickets", seedTickets.length === 9, String(seedTickets.length));
  check(
    "no seeded ticket claims a meeting origin",
    seedTickets.every((ticket) => ticket.meetingId === null),
  );

  /* ----------------------------------------------------------- approve */
  const target = proposed.slice(0, 2);
  await approveActionItems({
    workspaceId: northwind,
    actorId,
    prefix,
    actionItemIds: target.map((item) => item.id),
  });

  const afterTickets = await listTicketsView(northwind);
  const created = afterTickets.filter(
    (ticket) => !seedTickets.some((seeded) => seeded.id === ticket.id),
  );

  check(
    "approving two items created two tickets",
    created.length === 2,
    String(created.length),
  );
  check(
    "new keys continue the sequence",
    created
      .map((ticket) => ticket.key)
      .sort()
      .join(",") === "PRE-142,PRE-143",
    created.map((ticket) => ticket.key).join(","),
  );
  check(
    "new tickets are traced to the meeting",
    created.every(
      (ticket) => ticket.meetingId !== null && ticket.sourceQuote !== null,
    ),
    created
      .map((ticket) => `${ticket.key}:${ticket.meetingId ? "linked" : "none"}`)
      .join(" "),
  );
  check(
    "new tickets get an assignee when the item had an owner",
    created.every(
      (ticket) => ticket.status === "todo" || ticket.status === "backlog",
    ),
  );

  const afterItems = await listActionItemsView(northwind);
  check(
    "approved items moved to ticketed",
    afterItems
      .filter((item) => target.some((chosen) => chosen.id === item.id))
      .every((item) => item.status === "ticketed"),
  );
  check(
    "northwind now sees 11 tickets",
    afterTickets.length === 11,
    String(afterTickets.length),
  );

  /* -------------------------------------------------------- idempotency */
  await approveActionItems({
    workspaceId: northwind,
    actorId,
    prefix,
    actionItemIds: target.map((item) => item.id),
  });
  const afterRepeat = await listTicketsView(northwind);
  check(
    "re-approving the same items creates nothing",
    afterRepeat.length === 11,
    String(afterRepeat.length),
  );

  /* ------------------------------------------------------------ followups */
  const followups = await listFollowupsView(northwind);
  const forNew = followups.filter((entry) =>
    created.some((ticket) => ticket.key === entry.ticketKey),
  );
  const withDue = created.filter((ticket) => ticket.dueAt !== null);
  const rungsFor = (key: string) =>
    followups.filter((entry) => entry.ticketKey === key);

  // Approving an action item schedules the whole ladder from the due date, not
  // one reminder, so the check is about the shape rather than a row count: a
  // dated ticket gets rungs ending in the escalation, an undated one gets none.
  check(
    "a ladder is scheduled per dated ticket",
    withDue.every((ticket) => {
      const rows = rungsFor(ticket.key);
      return (
        rows.length >= 3 &&
        rows.some((entry) => entry.kind === "escalation") &&
        rows.some((entry) => entry.channel === "in_app")
      );
    }),
    `${forNew.length} follow-up(s) for ${withDue.length} dated ticket(s)`,
  );
  check(
    "an undated ticket is not chased",
    created
      .filter((ticket) => ticket.dueAt === null)
      .every((ticket) => rungsFor(ticket.key).length === 0),
  );
  check(
    "every ladder starts no later than its due date",
    withDue.every((ticket) => {
      const rows = rungsFor(ticket.key);
      const due = new Date(ticket.dueAt!).getTime();
      return rows.every((entry) => new Date(entry.scheduledFor).getTime() <= due + 72 * 60 * 60 * 1000);
    }),
  );

  /* --------------------------------------------------------------- move */
  const first = created[0]!;
  const moved = await moveTicket({
    workspaceId: northwind,
    actorId,
    ticketId: first.id,
    status: "done",
  });
  const movedTicket = (await listTicketsView(northwind)).find(
    (ticket) => ticket.id === first.id,
  );
  check("the move is reported as applied", moved, String(moved));
  check(
    "moving a ticket persists the new status",
    movedTicket?.status === "done",
    movedTicket?.status,
  );

  const events = await listTicketEvents(northwind, first.id);
  check(
    "moving a ticket writes an audit event",
    events.some((event) => event.type === "status_changed"),
    events.map((event) => event.type).join(","),
  );
  check(
    "the linked ticket records its meeting origin",
    events.some((event) => event.payload.source === "meeting"),
    events.map((event) => String(event.payload.source)).join(","),
  );
  check(
    "finishing a ticket cancels what was left of its ladder",
    (await listFollowupsView(northwind)).every(
      (entry) => entry.ticketKey !== first.key || entry.status !== "scheduled",
    ),
  );

  /* ------------------------------------------------------------- reject */
  const nextProposed = (await listActionItemsView(northwind)).filter(
    (item) => item.status === "proposed",
  );
  const toReject = nextProposed[0]!;
  await rejectActionItem({ workspaceId: northwind, actionItemId: toReject.id });
  const afterReject = await listActionItemsView(northwind);
  check(
    "rejecting an item records it",
    afterReject.find((item) => item.id === toReject.id)?.status === "rejected",
  );

  /* ------------------------------------------------------------ comment */
  const commented = await addComment({
    workspaceId: northwind,
    actorId,
    ticketKey: first.key,
    body: "Smoke test comment.",
  });
  check("the comment finds its ticket", commented, String(commented));
  const comments = await listTicketComments(northwind, first.id);
  check(
    "a comment is stored against the ticket",
    comments.some((comment) => comment.body === "Smoke test comment."),
    `${comments.length} comment(s)`,
  );

  /* ----------------------------------------------------------- settings */
  await updateSettings({
    workspaceId: northwind,
    settings: { ...northwindSettings!.settings, autonomy: "autopilot" },
  });
  const [savedSettings] = await withWorkspace(northwind, (tx) =>
    tx.select({ settings: t.workspaces.settings }).from(t.workspaces),
  );
  check(
    "the autonomy setting is persisted",
    savedSettings?.settings.autonomy === "autopilot",
    savedSettings?.settings.autonomy,
  );

  /* ------------------------------------------------------------ tenancy */
  const crossed = await moveTicket({
    workspaceId: northwind,
    actorId,
    ticketId: globexTicket!.id,
    status: "done",
  });
  check(
    "a northwind session cannot move a globex ticket",
    crossed === false,
    `target ${globexTicket?.key}`,
  );

  const globexTicketAfter = await withWorkspace(globex, (tx) =>
    tx
      .select({ status: t.tickets.status })
      .from(t.tickets)
      .where(eq(t.tickets.id, globexTicket!.id)),
  );
  check(
    "the globex ticket is untouched",
    globexTicketAfter[0]?.status !== "done",
    globexTicketAfter[0]?.status,
  );

  console.log("");
  console.log(
    failures === 0 ? "all write checks passed" : `${failures} check(s) failed`,
  );
  if (failures > 0) throw new Error("write smoke test failed");
});
