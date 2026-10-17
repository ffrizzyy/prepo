"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AUDIO_RETENTION_CHOICES } from "./audio/retention";
import { requireWorkspace } from "./context";
import * as t from "./db/schema";
import {
  addComment as addCommentWrite,
  approveActionItems as approveWrite,
  moveTicket as moveWrite,
  rejectActionItem as rejectWrite,
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
