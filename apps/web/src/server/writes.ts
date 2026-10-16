import { and, eq, inArray } from "drizzle-orm";
import { withWorkspace } from "./db/client";
import { uuidv7 } from "./db/ids";
import * as t from "./db/schema";
import type { WorkspaceSettings } from "./db/schema";

/**
 * The write path, with the tenant, the acting user and the settings all passed
 * in. `actions.ts` is the only caller in the app: it resolves those from the
 * session and the slug already in the URL, then hands the work here.
 *
 * Keeping the mutations separate from the server actions is what lets `db:smoke`
 * exercise them without a request scope — server actions need one for `cookies()`
 * and `revalidatePath()`, which a script does not have.
 */

/** Keys are sequential per workspace, so the next one follows the highest number. */
function highestKeyNumber(keys: string[]): number {
  return keys.reduce((max, key) => {
    const value = Number(key.split("-")[1]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 100);
}

/**
 * Returns false when the ticket is not in this workspace. RLS is what makes it
 * invisible, so the tenancy check and the existence check are the same statement.
 */
export async function moveTicket(input: {
  workspaceId: string;
  actorId: string;
  ticketId: string;
  status: t.TicketStatus;
}): Promise<boolean> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select()
      .from(t.tickets)
      .where(eq(t.tickets.id, input.ticketId));

    if (!ticket) return false;
    if (ticket.status === input.status) return true;

    await tx
      .update(t.tickets)
      .set({ status: input.status, version: ticket.version + 1 })
      .where(eq(t.tickets.id, ticket.id));

    await tx.insert(t.ticketEvents).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      actorId: input.actorId,
      actorKind: "user",
      type: "status_changed",
      payload: { from: ticket.status, to: input.status },
    });

    return true;
  });
}

/**
 * Approves proposed action items into tickets. Only items still `proposed` are
 * converted, so a double submit cannot create duplicates.
 */
export async function approveActionItems(input: {
  workspaceId: string;
  actorId: string;
  prefix: string;
  actionItemIds: string[];
}): Promise<{ created: number }> {
  let created = 0;

  await withWorkspace(input.workspaceId, async (tx) => {
    const items = await tx
      .select()
      .from(t.actionItems)
      .where(
        and(
          inArray(t.actionItems.id, input.actionItemIds),
          eq(t.actionItems.status, "proposed"),
        ),
      );

    if (items.length === 0) return;

    const existing = await tx
      .select({ key: t.tickets.key, position: t.tickets.position })
      .from(t.tickets);

    let nextNumber = highestKeyNumber(existing.map((row) => row.key)) + 1;
    let nextPosition =
      existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

    for (const item of items) {
      const key = `${input.prefix}-${nextNumber++}`;
      const ticketId = uuidv7();

      await tx.insert(t.tickets).values({
        id: ticketId,
        workspaceId: input.workspaceId,
        key,
        actionItemId: item.id,
        title: item.title,
        description: item.description,
        assigneeId: item.ownerId,
        status: item.ownerId ? "todo" : "backlog",
        priority: item.priority,
        dueAt: item.dueAt,
        labels: ["from-meeting"],
        position: nextPosition++,
        version: 1,
      });

      await tx.insert(t.ticketEvents).values({
        id: uuidv7(),
        workspaceId: input.workspaceId,
        ticketId,
        actorId: input.actorId,
        actorKind: "user",
        type: "created",
        payload: {
          key,
          actionItemId: item.id,
          title: item.title,
          source: "meeting",
        },
      });

      // The follow-up engine is milestone 5; scheduling the first reminder here
      // keeps the follow-ups page honest about what the product will do.
      if (item.dueAt) {
        await tx.insert(t.followups).values({
          id: uuidv7(),
          workspaceId: input.workspaceId,
          ticketId,
          kind: "reminder",
          channel: "email",
          scheduledFor: new Date(item.dueAt.getTime() - 24 * 60 * 60 * 1000),
          status: "scheduled",
        });
      }

      created += 1;
    }

    await tx
      .update(t.actionItems)
      .set({ status: "ticketed" })
      .where(
        inArray(
          t.actionItems.id,
          items.map((item) => item.id),
        ),
      );
  });

  return { created };
}

export async function rejectActionItem(input: {
  workspaceId: string;
  actionItemId: string;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx
      .update(t.actionItems)
      .set({ status: "rejected" })
      .where(eq(t.actionItems.id, input.actionItemId)),
  );
}

/** Returns false when the key names no ticket in this workspace. */
export async function addComment(input: {
  workspaceId: string;
  actorId: string;
  ticketKey: string;
  body: string;
}): Promise<boolean> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select({ id: t.tickets.id })
      .from(t.tickets)
      .where(eq(t.tickets.key, input.ticketKey));

    if (!ticket) return false;

    await tx.insert(t.comments).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      userId: input.actorId,
      body: input.body,
    });

    return true;
  });
}

export async function updateSettings(input: {
  workspaceId: string;
  settings: WorkspaceSettings;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx
      .update(t.workspaces)
      .set({ settings: input.settings })
      .where(eq(t.workspaces.id, input.workspaceId)),
  );
}
