"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AUDIO_RETENTION_CHOICES } from "./audio/retention";
import { requireWorkspace } from "./context";
import * as t from "./db/schema";
import {
  queueChase as chaseTicketWrite,
  snoozeTicket as snoozeTicketWrite,
} from "./followups/engine";
import {
  addComment as addCommentWrite,
  approveActionItems as approveWrite,
  cancelFollowup as cancelFollowupWrite,
  markNotificationsRead as markNotificationsReadWrite,
  moveTicket as moveWrite,
  rejectActionItem as rejectWrite,
  rescheduleFollowup as rescheduleFollowupWrite,
  setDigestWeekday as setDigestWeekdayWrite,
  setFollowupsEnabled as setFollowupsEnabledWrite,
  stopChasing as stopChasingWrite,
  updateSettings,
} from "./writes";

/**
 * Writes. A client only ever sends the slug that is already in its URL; the
 * workspace id, the acting user and the ticket key are all decided here. The
 * mutations themselves live in `writes.ts`, so the same code is exercised by
 * `db:smoke` without a request scope.
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

  await moveWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    ticketId: parsed.ticketId,
    status: parsed.status,
  });

  revalidateWorkspace(parsed.workspace);
}

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

  const { created } = await approveWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    prefix: context.settings.ticketPrefix ?? "PRE",
    actionItemIds: parsed.actionItemIds,
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

  await rejectWrite({
    workspaceId: context.id,
    actionItemId: parsed.actionItemId,
  });

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

  const found = await addCommentWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    ticketKey: parsed.ticketKey,
    body: parsed.body,
  });

  if (!found) throw new Error("Ticket not found");

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

  await updateSettings({
    workspaceId: context.id,
    settings: { ...context.settings, autonomy: parsed.autonomy },
  });

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

  await updateSettings({
    workspaceId: context.id,
    settings: { ...context.settings, followupTone: parsed.tone },
  });

  revalidateWorkspace(parsed.workspace);
}

/**
 * Audio retention is a workspace setting (PREPO.md §6.2), and "delete as soon as
 * it is transcribed" is one of the choices rather than an afterthought.
 */
export async function setAudioRetention(input: {
  workspace: string;
  days: number;
}): Promise<void> {
  const parsed = z
    .object({
      workspace: slug,
      days: z
        .number()
        .int()
        .refine(
          (value) => (AUDIO_RETENTION_CHOICES as readonly number[]).includes(value),
          "Not a retention choice",
        ),
    })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await updateSettings({
    workspaceId: context.id,
    settings: { ...context.settings, audioRetentionDays: parsed.days },
  });

  revalidateWorkspace(parsed.workspace);
}

/* -------------------------------------------------------------- follow-ups */

/**
 * Cancelling and moving one pending message is the "edit or cancel before it
 * sends" rule from PREPO.md §8.7. Both are scoped by the workspace in the URL, so
 * a follow-up id from another tenant simply is not found.
 */
export async function cancelFollowup(input: {
  workspace: string;
  followupId: string;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, followupId: uuid })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await cancelFollowupWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    followupId: parsed.followupId,
  });

  revalidateWorkspace(parsed.workspace);
}

export async function rescheduleFollowup(input: {
  workspace: string;
  followupId: string;
  /** A `datetime-local` value, interpreted in the sender's own clock. */
  scheduledFor: string;
}): Promise<void> {
  const parsed = z
    .object({
      workspace: slug,
      followupId: uuid,
      scheduledFor: z.string().min(1),
    })
    .parse(input);

  const when = new Date(parsed.scheduledFor);
  if (Number.isNaN(when.getTime())) throw new Error("Not a valid date");
  if (when.getTime() <= Date.now()) {
    throw new Error("Pick a moment in the future");
  }

  const context = await requireWorkspace(parsed.workspace);

  await rescheduleFollowupWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    followupId: parsed.followupId,
    scheduledFor: when,
  });

  revalidateWorkspace(parsed.workspace);
}

/** Queues the owner message now, whatever the ladder had planned. */
export async function chaseTicket(input: {
  workspace: string;
  ticketId: string;
}): Promise<void> {
  const parsed = z.object({ workspace: slug, ticketId: uuid }).parse(input);
  const context = await requireWorkspace(parsed.workspace);

  await chaseTicketWrite({
    workspaceId: context.id,
    ticketId: parsed.ticketId,
    actorId: context.viewer.userId,
  });

  revalidateWorkspace(parsed.workspace);
}

export async function snoozeTicket(input: {
  workspace: string;
  ticketId: string;
  days: number;
}): Promise<void> {
  const parsed = z
    .object({
      workspace: slug,
      ticketId: uuid,
      days: z.number().int().min(1).max(30),
    })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await snoozeTicketWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    ticketId: parsed.ticketId,
    until: new Date(Date.now() + parsed.days * 24 * 60 * 60 * 1000),
  });

  revalidateWorkspace(parsed.workspace);
}

export async function stopChasing(input: {
  workspace: string;
  ticketId: string;
}): Promise<void> {
  const parsed = z.object({ workspace: slug, ticketId: uuid }).parse(input);
  const context = await requireWorkspace(parsed.workspace);

  await stopChasingWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    ticketId: parsed.ticketId,
  });

  revalidateWorkspace(parsed.workspace);
}

/** The workspace-wide switch: off cancels what is pending, not just new rungs. */
export async function setFollowupsEnabled(input: {
  workspace: string;
  enabled: boolean;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, enabled: z.boolean() })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await setFollowupsEnabledWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    enabled: parsed.enabled,
  });

  revalidateWorkspace(parsed.workspace);
}

export async function setDigestWeekday(input: {
  workspace: string;
  weekday: number;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, weekday: z.number().int().min(0).max(6) })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await setDigestWeekdayWrite({
    workspaceId: context.id,
    actorId: context.viewer.userId,
    weekday: parsed.weekday,
  });

  revalidateWorkspace(parsed.workspace);
}

/** Marks one notification read, or the whole inbox when no id is given. */
export async function markNotificationsRead(input: {
  workspace: string;
  notificationId?: string;
}): Promise<void> {
  const parsed = z
    .object({ workspace: slug, notificationId: uuid.optional() })
    .parse(input);

  const context = await requireWorkspace(parsed.workspace);

  await markNotificationsReadWrite({
    workspaceId: context.id,
    userId: context.viewer.userId,
    notificationId: parsed.notificationId,
  });

  revalidateWorkspace(parsed.workspace);
}
