/**
 * What a follow-up actually says (PREPO.md §8.7): generated from the ticket's
 * context, linked back to the ticket, and written in the workspace's tone.
 *
 * Pure string work, so the wording is pinned by tests rather than described. The
 * tone changes the opening line and the sign-off, not the facts: the ticket key,
 * the title, the due date and how late it is read the same in all three.
 */

export type MessageContext = {
  tone: string;
  kind: string;
  rungLabel: string;
  ticketKey: string;
  ticketTitle: string;
  dueAt: Date | null;
  overdueDays: number;
  assigneeName: string | null;
  organizerName: string | null;
  workspaceName: string;
  meetingTitle: string | null;
  /** Where the recipient reads the rest of it. */
  url: string;
};

const OPENERS: Record<string, Record<string, string>> = {
  gentle: {
    reminder: "A small heads-up:",
    nudge: "This one slipped past its date:",
    escalation: "Escalating gently:",
  },
  neutral: {
    reminder: "Reminder:",
    nudge: "Now overdue:",
    escalation: "Escalated:",
  },
  firm: {
    reminder: "Due soon:",
    nudge: "Overdue and unowned since:",
    escalation: "Overdue and escalated:",
  },
};

function opener(context: MessageContext): string {
  const byTone = OPENERS[normalizeTone(context.tone)];
  return byTone?.[context.kind] ?? "Follow-up:";
}

export function normalizeTone(tone: string | undefined): "gentle" | "neutral" | "firm" {
  return tone === "gentle" || tone === "firm" ? tone : "neutral";
}

export function formatDue(dueAt: Date | null): string {
  if (!dueAt) return "no due date";
  return dueAt.toISOString().slice(0, 10);
}

export function messageSubject(context: MessageContext): string {
  const prefix = context.kind === "escalation" ? "Escalation" : "Follow-up";
  return `${prefix}: ${context.ticketKey} ${context.ticketTitle}`;
}

export function messageBody(context: MessageContext): string {
  const lines: string[] = [];

  lines.push(`${opener(context)} ${context.ticketKey}, ${context.ticketTitle}`);

  if (context.dueAt) {
    const late = context.overdueDays > 0 ? ` (${context.overdueDays} day${context.overdueDays === 1 ? "" : "s"} late)` : "";
    lines.push(`Due ${formatDue(context.dueAt)}${late}.`);
  } else {
    lines.push("This ticket has no due date, so nothing was scheduled from it.");
  }

  if (context.kind === "escalation" && context.organizerName) {
    lines.push(
      `${context.assigneeName ?? "Nobody is assigned"} has not moved it, so it is with you, ${context.organizerName}.`,
    );
  } else if (context.assigneeName) {
    lines.push(`${context.assigneeName}, this is yours.`);
  }

  if (context.meetingTitle) {
    lines.push(`From “${context.meetingTitle}”.`);
  }

  lines.push(`Open it: ${context.url}`);

  if (normalizeTone(context.tone) === "firm") {
    lines.push("If it is no longer needed, close it and Prepo stops chasing.");
  } else if (normalizeTone(context.tone) === "gentle") {
    lines.push("No rush if the date moved, just let the ticket know.");
  }

  lines.push(`Prepo, on behalf of ${context.workspaceName}`);

  return lines.join("\n\n");
}

/** One line for the notification centre, where there is no room for a letter. */
export function notificationBody(context: MessageContext): string {
  const late =
    context.overdueDays > 0
      ? ` · ${context.overdueDays}d late`
      : context.dueAt
        ? ` · due ${formatDue(context.dueAt)}`
        : "";
  return `${context.rungLabel}${late}`;
}

export type DigestLine = {
  key: string;
  title: string;
  assigneeName: string | null;
  dueAt: Date | null;
  overdueDays: number;
};

export type DigestContext = {
  workspaceName: string;
  url: string;
  overdue: DigestLine[];
  dueThisWeek: DigestLine[];
  awaitingReview: number;
  weekdayLabel: string;
};

export function digestSubject(context: DigestContext): string {
  const parts: string[] = [];
  if (context.overdue.length) parts.push(`${context.overdue.length} overdue`);
  if (context.dueThisWeek.length) parts.push(`${context.dueThisWeek.length} due soon`);
  if (context.awaitingReview) parts.push(`${context.awaitingReview} to review`);
  const summary = parts.length ? parts.join(", ") : "all clear";
  return `${context.weekdayLabel} digest, ${summary}`;
}

export function digestBody(context: DigestContext): string {
  const lines: string[] = [`Where ${context.workspaceName} stands.`];

  if (context.overdue.length === 0 && context.dueThisWeek.length === 0 && context.awaitingReview === 0) {
    lines.push("Nothing is overdue, nothing falls due this week, and nothing is waiting on review.");
  }

  if (context.overdue.length) {
    lines.push(
      "Overdue:\n" +
        context.overdue
          .map(
            (line) =>
              `- ${line.key} ${line.title}, ${line.assigneeName ?? "unassigned"}, ${line.overdueDays}d late`,
          )
          .join("\n"),
    );
  }

  if (context.dueThisWeek.length) {
    lines.push(
      "Due this week:\n" +
        context.dueThisWeek
          .map(
            (line) =>
              `- ${line.key} ${line.title}, ${line.assigneeName ?? "unassigned"}, due ${formatDue(line.dueAt)}`,
          )
          .join("\n"),
    );
  }

  if (context.awaitingReview) {
    lines.push(
      `${context.awaitingReview} action item${context.awaitingReview === 1 ? "" : "s"} still awaiting review.`,
    );
  }

  lines.push(`Open the workspace: ${context.url}`);
  lines.push("Prepo");

  return lines.join("\n\n");
}
