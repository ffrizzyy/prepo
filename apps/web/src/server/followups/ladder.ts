import type * as t from "../db/schema";
import { uuidv7 } from "../db/ids";

/**
 * The escalation ladder (PREPO.md §8.7), as arithmetic.
 *
 * The defaults the UI has always advertised are: a reminder 24 hours before the
 * due date, one on the due day, an overdue nudge to the owner the next day, and
 * an escalation to the meeting organizer three days overdue. Everything here is
 * a pure function of the due date, so the schedule is inspectable and the same
 * rows can be rebuilt when a due date moves.
 */

export type FollowupChannel = t.FollowupChannel;
export type RungKind = "reminder" | "nudge" | "escalation";

export type Rung = {
  /** Stable id, carried in notification payloads and audit targets. */
  id: string;
  kind: RungKind;
  /** Hours relative to the ticket's due date; negative is before it. */
  offsetHours: number;
  label: string;
  channels: readonly FollowupChannel[];
  /** Who gets chased: the assignee, or the person who ran the meeting. */
  recipient: "owner" | "organizer";
};

export const LADDER: readonly Rung[] = [
  {
    id: "before-due",
    kind: "reminder",
    offsetHours: -24,
    label: "24h before due",
    channels: ["in_app", "email"],
    recipient: "owner",
  },
  {
    id: "due-day",
    kind: "reminder",
    offsetHours: 0,
    label: "On the due day",
    channels: ["in_app", "email"],
    recipient: "owner",
  },
  {
    id: "overdue-1",
    kind: "nudge",
    offsetHours: 24,
    label: "Overdue +1 day",
    channels: ["in_app", "email", "push"],
    recipient: "owner",
  },
  {
    id: "overdue-3",
    kind: "escalation",
    offsetHours: 72,
    label: "Overdue +3 days",
    channels: ["email"],
    recipient: "organizer",
  },
];

export const HOUR_MS = 60 * 60 * 1000;

export function rungTime(dueAt: Date, rung: Rung): Date {
  return new Date(dueAt.getTime() + rung.offsetHours * HOUR_MS);
}

/** The rung a stored row came from, matched on kind and its offset from due. */
export function rungFor(
  kind: string,
  scheduledFor: Date,
  dueAt: Date | null,
): Rung | null {
  if (!dueAt) return null;
  const offsetHours = Math.round(
    (scheduledFor.getTime() - dueAt.getTime()) / HOUR_MS,
  );
  return (
    LADDER.find((rung) => rung.kind === kind && rung.offsetHours === offsetHours) ??
    null
  );
}

export function labelFor(kind: string, scheduledFor: Date | null, dueAt: Date | null): string {
  if (kind === "digest") return "Weekly digest";
  const rung = scheduledFor && dueAt ? rungFor(kind, scheduledFor, dueAt) : null;
  return rung?.label ?? kind;
}

/** Whole days late, or 0 when the ticket is not late yet. */
export function overdueDays(dueAt: Date | null, now: Date): number {
  if (!dueAt || dueAt.getTime() > now.getTime()) return 0;
  return Math.floor((now.getTime() - dueAt.getTime()) / (24 * HOUR_MS));
}

export type LadderRow = typeof t.followups.$inferInsert;

/**
 * The rows that represent the ladder for one ticket. Past rungs are skipped by
 * default: re-scheduling a moment that has already gone would fire it on the
 * next engine run, which is how a "chase" feature turns into spam.
 *
 * A rung with nobody to chase is not scheduled at all, an unassigned ticket has
 * no owner to remind, and only the escalation has somewhere to go.
 */
export function scheduleLadder(input: {
  workspaceId: string;
  ticketId: string;
  dueAt: Date;
  ownerId: string | null;
  organizerId: string | null;
  now: Date;
  /** Push is only scheduled when the recipient actually has a device. */
  pushAvailable: boolean;
  includePast?: boolean;
}): LadderRow[] {
  const rows: LadderRow[] = [];

  for (const rung of LADDER) {
    const recipientId =
      rung.recipient === "owner" ? input.ownerId : input.organizerId;
    if (!recipientId) continue;

    const scheduledFor = rungTime(input.dueAt, rung);
    if (!input.includePast && scheduledFor.getTime() < input.now.getTime()) {
      continue;
    }

    for (const channel of rung.channels) {
      if (channel === "push" && !input.pushAvailable) continue;
      rows.push({
        id: uuidv7(),
        workspaceId: input.workspaceId,
        ticketId: input.ticketId,
        kind: rung.kind,
        channel,
        recipientId,
        scheduledFor,
        status: "scheduled",
      });
    }
  }

  return rows;
}

export const LADDER_CHANNEL_LABEL: Record<FollowupChannel, string> = {
  email: "email",
  in_app: "in-app",
  push: "push",
};
