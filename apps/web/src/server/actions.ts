"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "./context";
import { withWorkspace } from "./db/client";
import { uuidv7 } from "./db/ids";
import * as t from "./db/schema";

/**
 * Writes. A client only ever sends the slug that is already in its URL; the
 * workspace id, the acting user and the ticket key are all decided here.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = z.string().regex(UUID_RE, "Must be a UUID");
const slug = z.string().min(1).max(64);
const ticketKey = z.string().regex(/^[A-Z]+-\d+$/);

const AUTONOMY = ["suggest", "assist", "autopilot"] as const;
const TONES = ["gentle", "neutral", "firm"] as const;

function revalidateWorkspace(workspaceSlug: string): void {
  // The layout scope covers every page nested under the workspace.
  revalidatePath(`/${workspaceSlug}`, "layout");
}

/** Keys are sequential per workspace, so the next one follows the highest number. */
function highestKeyNumber(keys: string[]): number {
  return keys.reduce((max, key) => {
    const value = Number(key.split("-")[1]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 100);
}

export async function moveTicket(input: {
  workspace: string;
  ticketId: string;
  status: string;
}): Promise<void> {
  const parsed = z
    .object({
      workspace: slug,
      ticketId: uuid,
      status: z.enum(t.ticketStatus.enumValues),
    })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await withWorkspace(context.id, async (tx) => {
    const [ticket] = await tx
      .select()
      .from(t.tickets)
      .where(eq(t.tickets.id, parsed.ticketId));

    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status === parsed.status) return;

    await tx
      .update(t.tickets)
      .set({ status: parsed.status, version: ticket.version + 1 })
      .where(eq(t.tickets.id, ticket.id));

    await tx.insert(t.ticketEvents).values({
      id: uuidv7(),
      workspaceId: context.id,
      ticketId: ticket.id,
      actorId: context.viewer.userId,
      actorKind: "user",
      type: "status_changed",
      payload: { from: ticket.status, to: parsed.status },
    });
  });

  revalidateWorkspace(parsed.workspace);
}

/**
 * Approves proposed action items into tickets. Only items still `proposed` are
 * converted, so a double submit cannot create duplicates.
 */
export async function approveActionItems(input: {
  workspace: string;
  actionItemIds: string[];
}): Promise<{ created: number }> {
  const parsed = z
    .object({
      workspace: slug,
      actionItemIds: z.array(uuid).min(1).max(50),
    })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);
  const prefix = context.settings.ticketPrefix ?? "PRE";
  let created = 0;

  await withWorkspace(context.id, async (tx) => {
    const items = await tx
      .select()
      .from(t.actionItems)
      .where(
        and(
          inArray(t.actionItems.id, parsed.actionItemIds),
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
      const key = `${prefix}-${nextNumber++}`;
      const ticketId = uuidv7();

      await tx.insert(t.tickets).values({
        id: ticketId,
        workspaceId: context.id,
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
        workspaceId: context.id,
        ticketId,
        actorId: context.viewer.userId,
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
          workspaceId: context.id,
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

  revalidateWorkspace(parsed.workspace);
  return { created };
}

export async function rejectActionItem(input: {
  workspace: string;
  actionItemId: string;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, actionItemId: uuid })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await withWorkspace(context.id, (tx) =>
    tx
      .update(t.actionItems)
      .set({ status: "rejected" })
      .where(eq(t.actionItems.id, parsed.actionItemId)),
  );

  revalidateWorkspace(parsed.workspace);
}

export async function addComment(input: {
  workspace: string;
  ticketKey: string;
  body: string;
}): Promise<void> {
  const parsed = z
    .object({
      workspace: slug,
      ticketKey,
      body: z.string().trim().min(1).max(2000),
    })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await withWorkspace(context.id, async (tx) => {
    const [ticket] = await tx
      .select({ id: t.tickets.id })
      .from(t.tickets)
      .where(eq(t.tickets.key, parsed.ticketKey));

    if (!ticket) throw new Error("Ticket not found");

    await tx.insert(t.comments).values({
      id: uuidv7(),
      workspaceId: context.id,
      ticketId: ticket.id,
      userId: context.viewer.userId,
      body: parsed.body,
    });
  });

  revalidateWorkspace(parsed.workspace);
}

export async function setAutonomy(input: {
  workspace: string;
  autonomy: string;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, autonomy: z.enum(AUTONOMY) })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await withWorkspace(context.id, (tx) =>
    tx
      .update(t.workspaces)
      .set({ settings: { ...context.settings, autonomy: parsed.autonomy } })
      .where(eq(t.workspaces.id, context.id)),
  );

  revalidateWorkspace(parsed.workspace);
}

export async function setFollowupTone(input: {
  workspace: string;
  tone: string;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, tone: z.enum(TONES) })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await withWorkspace(context.id, (tx) =>
    tx
      .update(t.workspaces)
      .set({ settings: { ...context.settings, followupTone: parsed.tone } })
      .where(eq(t.workspaces.id, context.id)),
  );

  revalidateWorkspace(parsed.workspace);
}
