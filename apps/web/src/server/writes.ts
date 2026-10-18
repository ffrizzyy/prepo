import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { withWorkspace, type Db } from "./db/client";
import { uuidv7 } from "./db/ids";
import * as t from "./db/schema";
import type { WorkspaceSettings } from "./db/schema";
import { cancelPendingFollowups, scheduleTicketLadder } from "./followups/engine";
import { markTicketPending, queueForLinear } from "./linear/queue";

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

    // Queued, not sent: the board move returns immediately and `db:linear` does
    // the talking. Nothing happens at all unless Linear is connected.
    await queueForLinear(tx, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
    });

    // Finishing the work stops the chaser. Anything still pending is cancelled
    // rather than left to fire against a ticket nobody needs to hear about.
    if (input.status === "done") {
      await cancelPendingFollowups(
        tx,
        ticket.id,
        "The work was marked done, so there is nothing left to chase.",
      );
    }

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
  /** Null when the agent auto-approved under Assist or Autopilot. */
  actorId: string | null;
  /** "user" unless the agent acted; recorded on every ticket event. */
  actorKind?: string;
  prefix: string;
  actionItemIds: string[];
}): Promise<{ created: number }> {
  let created = 0;
  const now = new Date();

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
        actorKind: input.actorKind ?? "user",
        type: "created",
        payload: {
          key,
          actionItemId: item.id,
          title: item.title,
          source: "meeting",
        },
      });

      // A brand new ticket is exactly what Linear wants to hear about, if the
      // workspace has a connection.
      await queueForLinear(tx, { workspaceId: input.workspaceId, ticketId });

      // The whole ladder, from the due date: reminders before and on the day, a
      // nudge when it slips, and an escalation to whoever ran the meeting.
      if (item.dueAt) {
        await scheduleTicketLadder(tx, {
          workspaceId: input.workspaceId,
          ticketId,
          dueAt: item.dueAt,
          ownerId: item.ownerId,
          meetingId: item.meetingId,
          now,
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

/* ------------------------------------------- ingest: audio and transcripts */

/**
 * Exported because the follow-up engine writes audit entries too: an escalation
 * and a failed send are exactly what the log is for.
 */
export async function audit(
  tx: Db,
  input: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    target: string;
  },
): Promise<void> {
  await tx.insert(t.auditLogs).values({
    id: uuidv7(),
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    target: input.target,
  });
}

/**
 * Creates the meeting and its audio asset in one transaction, so a failure
 * between the two cannot leave a meeting pointing at audio that was never
 * recorded.
 */
export async function createMeetingFromAudio(input: {
  meetingId: string;
  assetId: string;
  workspaceId: string;
  actorId: string;
  title: string;
  heldAt: Date;
  source: "recording" | "upload";
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  durationS: number;
  deleteAfter: Date | null;
}): Promise<void> {
  const meetingId = input.meetingId;
  const assetId = input.assetId;

  await withWorkspace(input.workspaceId, async (tx) => {
    await tx.insert(t.meetings).values({
      id: meetingId,
      workspaceId: input.workspaceId,
      title: input.title,
      heldAt: input.heldAt,
      source: input.source,
      // Processing until a transcript lands; the page says which step is next.
      status: "processing",
      createdBy: input.actorId,
    });

    await tx.insert(t.audioAssets).values({
      id: assetId,
      workspaceId: input.workspaceId,
      meetingId,
      r2Key: input.storageKey,
      durationS: input.durationS,
      sizeBytes: input.sizeBytes,
      status: "uploaded",
      deleteAfter: input.deleteAfter,
      // Consent is required and confirmed before this is reachable.
      consentConfirmedBy: input.actorId,
    });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: `audio.${input.source}`,
      target: `${meetingId}:${input.contentType}:${input.sizeBytes}`,
    });
  });
}

/** Transcript-only ingest: no audio, so no consent and no retention clock. */
export async function createMeetingFromText(input: {
  meetingId: string;
  workspaceId: string;
  actorId: string;
  title: string;
  heldAt: Date;
  source: "paste" | "upload";
  segments: { speakerLabel: string; startMs: number; endMs: number; text: string }[];
}): Promise<void> {
  const meetingId = input.meetingId;

  await withWorkspace(input.workspaceId, async (tx) => {
    await tx.insert(t.meetings).values({
      id: meetingId,
      workspaceId: input.workspaceId,
      title: input.title,
      heldAt: input.heldAt,
      source: input.source,
      status: "ready",
      createdBy: input.actorId,
    });

    if (input.segments.length > 0) {
      await tx.insert(t.transcriptSegments).values(
        input.segments.map((segment, index) => ({
          id: uuidv7(),
          workspaceId: input.workspaceId,
          meetingId,
          idx: index,
          speakerLabel: segment.speakerLabel,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        })),
      );
    }

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: `transcript.${input.source}`,
      target: `${meetingId}:${input.segments.length}`,
    });
  });
}

export async function setAudioStatus(input: {
  workspaceId: string;
  assetId: string;
  status: t.AudioStatus;
  durationS?: number;
  deleteAfter?: Date | null;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx
      .update(t.audioAssets)
      .set({
        status: input.status,
        ...(input.durationS === undefined ? {} : { durationS: input.durationS }),
        ...(input.deleteAfter === undefined ? {} : { deleteAfter: input.deleteAfter }),
      })
      .where(eq(t.audioAssets.id, input.assetId)),
  );
}

export async function setMeetingStatus(input: {
  workspaceId: string;
  meetingId: string;
  status: t.MeetingStatus;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx
      .update(t.meetings)
      .set({ status: input.status })
      .where(eq(t.meetings.id, input.meetingId)),
  );
}

/**
 * Replaces any existing segments for the meeting, so a retry after a partial
 * transcription cannot end up with two transcripts interleaved.
 */
export async function replaceTranscript(input: {
  workspaceId: string;
  meetingId: string;
  segments: { speakerLabel: string; startMs: number; endMs: number; text: string }[];
}): Promise<number> {
  await withWorkspace(input.workspaceId, async (tx) => {
    await tx
      .delete(t.transcriptSegments)
      .where(eq(t.transcriptSegments.meetingId, input.meetingId));

    if (input.segments.length === 0) return;

    await tx.insert(t.transcriptSegments).values(
      input.segments.map((segment, index) => ({
        id: uuidv7(),
        workspaceId: input.workspaceId,
        meetingId: input.meetingId,
        idx: index,
        speakerLabel: segment.speakerLabel,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      })),
    );
  });

  return input.segments.length;
}

export async function recordSttRun(input: {
  workspaceId: string;
  assetId: string | null;
  provider: string;
  status: "succeeded" | "failed" | "skipped";
  durationS: number | null;
  costUsd: string | null;
  detail?: string;
}): Promise<void> {
  await withWorkspace(input.workspaceId, (tx) =>
    tx.insert(t.sttRuns).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      audioAssetId: input.assetId,
      provider: input.provider,
      durationS: input.durationS,
      costUsd: input.costUsd,
      // The provider's own message is kept, truncated: it is the thing that
      // makes a failed run diagnosable later.
      status: input.detail ? `${input.status}: ${input.detail.slice(0, 300)}` : input.status,
    }),
  );
}

/**
 * Points every segment carrying a label at a real person, and optionally
 * renames the label itself. Both are one-click fixes in the transcript panel.
 */
export async function mapSpeaker(input: {
  workspaceId: string;
  meetingId: string;
  actorId: string;
  label: string;
  userId: string | null;
  renameTo?: string;
}): Promise<number> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const updated = await tx
      .update(t.transcriptSegments)
      .set({
        speakerUserId: input.userId,
        ...(input.renameTo ? { speakerLabel: input.renameTo } : {}),
      })
      .where(
        and(
          eq(t.transcriptSegments.meetingId, input.meetingId),
          eq(t.transcriptSegments.speakerLabel, input.label),
        ),
      )
      .returning({ id: t.transcriptSegments.id });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "speaker.mapped",
      target: `${input.meetingId}:${input.label}->${input.userId ?? "unassigned"}`,
    });

    return updated.length;
  });
}

/** The stored audio for one meeting, or null. */
export async function findAudioAsset(input: {
  workspaceId: string;
  assetId: string;
}): Promise<{
  id: string;
  meetingId: string;
  r2Key: string;
  status: t.AudioStatus;
  durationS: number | null;
} | null> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [asset] = await tx
      .select({
        id: t.audioAssets.id,
        meetingId: t.audioAssets.meetingId,
        r2Key: t.audioAssets.r2Key,
        status: t.audioAssets.status,
        durationS: t.audioAssets.durationS,
      })
      .from(t.audioAssets)
      .where(eq(t.audioAssets.id, input.assetId));
    return asset ?? null;
  });
}

/** Marks the asset deleted; the caller removes the bytes. */
export async function markAudioDeleted(input: {
  workspaceId: string;
  actorId: string;
  assetId: string;
}): Promise<{ storageKey: string | null }> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [asset] = await tx
      .select({ r2Key: t.audioAssets.r2Key })
      .from(t.audioAssets)
      .where(eq(t.audioAssets.id, input.assetId));

    if (!asset) return { storageKey: null };

    await tx
      .update(t.audioAssets)
      .set({ status: "deleted", deleteAfter: null })
      .where(eq(t.audioAssets.id, input.assetId));

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "audio.deleted",
      target: input.assetId,
    });

    return { storageKey: asset.r2Key };
  });
}

/* ---------------------------------------------------------------- meetings */

/**
 * What deleting a meeting would take with it, counted rather than described.
 * The counts come from the same tenant scope the delete runs in, so they cannot
 * promise to remove something the delete will not see.
 */
export type MeetingDeletionImpact = {
  meetingId: string;
  title: string;
  segments: number;
  actionItems: number;
  /** Tickets created from this meeting's items. They are kept, not deleted. */
  ticketsKept: number;
  shareLinks: number;
  /** The stored recording, when one still exists. Its bytes are the caller's. */
  audioAssetId: string | null;
  storageKey: string | null;
};

async function countDeletionImpact(
  tx: Db,
  meetingId: string,
): Promise<Omit<MeetingDeletionImpact, "meetingId" | "title">> {
  const [segments] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(t.transcriptSegments)
    .where(eq(t.transcriptSegments.meetingId, meetingId));

  const [items] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(t.actionItems)
    .where(eq(t.actionItems.meetingId, meetingId));

  const [kept] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(t.tickets)
    .innerJoin(t.actionItems, eq(t.tickets.actionItemId, t.actionItems.id))
    .where(eq(t.actionItems.meetingId, meetingId));

  const [links] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(t.shareLinks)
    .where(eq(t.shareLinks.meetingId, meetingId));

  const [asset] = await tx
    .select({
      id: t.audioAssets.id,
      r2Key: t.audioAssets.r2Key,
      status: t.audioAssets.status,
    })
    .from(t.audioAssets)
    .where(eq(t.audioAssets.meetingId, meetingId));

  // A recording already marked deleted has no bytes left to reclaim, so it is
  // not offered as something the caller should go and remove.
  const bytesRemain = asset !== undefined && asset.status !== "deleted";

  return {
    segments: segments?.count ?? 0,
    actionItems: items?.count ?? 0,
    ticketsKept: kept?.count ?? 0,
    shareLinks: links?.count ?? 0,
    audioAssetId: bytesRemain ? asset.id : null,
    storageKey: bytesRemain ? asset.r2Key : null,
  };
}

/**
 * The counts behind the confirmation panel. Exported separately from the delete
 * so the page can show real numbers before anyone commits to anything.
 */
export async function meetingDeletionImpact(input: {
  workspaceId: string;
  meetingId: string;
}): Promise<MeetingDeletionImpact | null> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [meeting] = await tx
      .select({ id: t.meetings.id, title: t.meetings.title })
      .from(t.meetings)
      .where(eq(t.meetings.id, input.meetingId));

    if (!meeting) return null;

    return {
      meetingId: meeting.id,
      title: meeting.title,
      ...(await countDeletionImpact(tx, meeting.id)),
    };
  });
}

/**
 * Deletes a meeting and everything derived from it (PREPO.md §8.9): the
 * transcript, the audio row, the proposed and rejected action items, and any
 * recap links. Tickets already created from its items are kept, and their link
 * back to the meeting is set to null, because deleting the source of a task does
 * not delete the task.
 *
 * Returns null when the meeting is not in this workspace, which RLS makes the
 * same statement as "it does not exist".
 */
export async function deleteMeeting(input: {
  workspaceId: string;
  actorId: string;
  meetingId: string;
}): Promise<MeetingDeletionImpact | null> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [meeting] = await tx
      .select({ id: t.meetings.id, title: t.meetings.title })
      .from(t.meetings)
      .where(eq(t.meetings.id, input.meetingId));

    if (!meeting) return null;

    const impact = await countDeletionImpact(tx, meeting.id);

    // Written first, and it survives: audit_logs has no foreign key to meetings,
    // so the record of the deletion outlives what it describes. It is written
    // inside the same transaction, so a rollback takes the claim with it.
    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "meeting.deleted",
      target: `${meeting.id}:${meeting.title}:${impact.segments}seg:${impact.actionItems}items:${impact.ticketsKept}tickets kept`,
    });

    // One statement. The cascades in the schema do the rest, and the caller
    // removes the audio bytes after this commits.
    await tx.delete(t.meetings).where(eq(t.meetings.id, meeting.id));

    return { meetingId: meeting.id, title: meeting.title, ...impact };
  });
}

/* -------------------------------------------------------------- follow-ups */

/**
 * Cancels one pending message. Returns false when the row is not in this
 * workspace, which is the same statement as "it does not exist here".
 */
export async function cancelFollowup(input: {
  workspaceId: string;
  actorId: string;
  followupId: string;
  reason?: string;
}): Promise<boolean> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [row] = await tx
      .select({ id: t.followups.id, status: t.followups.status })
      .from(t.followups)
      .where(eq(t.followups.id, input.followupId));

    if (!row) return false;
    if (row.status !== "scheduled") return true;

    await tx
      .update(t.followups)
      .set({
        status: "cancelled",
        detail: input.reason ?? "Cancelled by a person before it went out.",
      })
      .where(eq(t.followups.id, input.followupId));

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "followup.cancelled",
      target: input.followupId,
    });

    return true;
  });
}

/** Moves one pending message to a new time. Only future times are accepted. */
export async function rescheduleFollowup(input: {
  workspaceId: string;
  actorId: string;
  followupId: string;
  scheduledFor: Date;
}): Promise<boolean> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [row] = await tx
      .select({ id: t.followups.id, status: t.followups.status })
      .from(t.followups)
      .where(eq(t.followups.id, input.followupId));

    if (!row || row.status !== "scheduled") return false;

    await tx
      .update(t.followups)
      .set({
        scheduledFor: input.scheduledFor,
        detail: `Moved to ${input.scheduledFor.toISOString()} by hand.`,
      })
      .where(eq(t.followups.id, input.followupId));

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "followup.rescheduled",
      target: `${input.followupId} → ${input.scheduledFor.toISOString()}`,
    });

    return true;
  });
}

/** "Stop chasing this ticket": cancels everything still pending for it. */
export async function stopChasing(input: {
  workspaceId: string;
  actorId: string;
  ticketId: string;
}): Promise<number> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const cancelled = await cancelPendingFollowups(
      tx,
      input.ticketId,
      "Chasing stopped by a person.",
    );

    if (cancelled > 0) {
      await audit(tx, {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "followup.stopped",
        target: input.ticketId,
      });
    }

    return cancelled;
  });
}

/** The workspace-wide switch, in Settings. */
export async function setFollowupsEnabled(input: {
  workspaceId: string;
  actorId: string;
  enabled: boolean;
}): Promise<void> {
  await withWorkspace(input.workspaceId, async (tx) => {
    const [row] = await tx
      .select({ settings: t.workspaces.settings })
      .from(t.workspaces);

    const settings: WorkspaceSettings = {
      ...(row?.settings ?? {}),
      followups: input.enabled ? "on" : "off",
    };

    await tx.update(t.workspaces).set({ settings }).where(
      eq(t.workspaces.id, input.workspaceId),
    );

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "settings.changed",
      target: `followups=${settings.followups}`,
    });

    // Turning it off cancels what is pending, so "off" means off rather than
    // "stop scheduling new ones while these still fire".
    if (!input.enabled) {
      await tx
        .update(t.followups)
        .set({
          status: "cancelled",
          detail: "Automatic chasing was switched off for the workspace.",
        })
        .where(eq(t.followups.status, "scheduled"));
    }
  });
}

export async function setDigestWeekday(input: {
  workspaceId: string;
  actorId: string;
  weekday: number;
}): Promise<void> {
  await withWorkspace(input.workspaceId, async (tx) => {
    const [row] = await tx
      .select({ settings: t.workspaces.settings })
      .from(t.workspaces);

    const settings: WorkspaceSettings = {
      ...(row?.settings ?? {}),
      digestWeekday: input.weekday,
    };

    await tx
      .update(t.workspaces)
      .set({ settings })
      .where(eq(t.workspaces.id, input.workspaceId));

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "settings.changed",
      target: `digestWeekday=${input.weekday}`,
    });
  });
}

/** Marks one notification read, or all of them when no id is given. */
export async function markNotificationsRead(input: {
  workspaceId: string;
  userId: string;
  notificationId?: string;
}): Promise<number> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const read = await tx
      .update(t.notifications)
      .set({ readAt: new Date() })
      .where(
        input.notificationId
          ? and(
              eq(t.notifications.id, input.notificationId),
              eq(t.notifications.userId, input.userId),
              isNull(t.notifications.readAt),
            )
          : and(
              eq(t.notifications.userId, input.userId),
              isNull(t.notifications.readAt),
            ),
      )
      .returning({ id: t.notifications.id });

    return read.length;
  });
}

/**
 * Puts a ticket back in the Linear queue by hand, after a failure. The bug it
 * guards against is a failed sync that nobody notices: the badge on the ticket
 * says so, and this is the one click that answers it (PREPO.md 8.6).
 */
export async function queueTicketForLinear(input: {
  workspaceId: string;
  actorId: string;
  ticketId: string;
}): Promise<boolean> {
  return withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select({ id: t.tickets.id, key: t.tickets.key })
      .from(t.tickets)
      .where(eq(t.tickets.id, input.ticketId));

    if (!ticket) return false;

    await markTicketPending(tx, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
    });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.linear.retry_queued",
      target: ticket.key,
    });

    return true;
  });
}
