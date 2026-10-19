import type {
  LinearPriority,
  LinearTicketStatus,
  RemoteIssue,
  RemotePatch,
  RemoteState,
  RemoteUser,
} from "./types";

/**
 * The mapping table, as arithmetic (PREPO.md 8.6). Prepo priority maps to
 * Linear priority, owners are matched by email, labels by name, and the whole
 * table is editable, so it lives in one place and is a pure function of the
 * ticket, which makes it assertable without a network.
 */

export type LinearMapping = {
  /** Prepo priority -> Linear's 1..4 scale. */
  priority: Record<LinearPriority, number>;
  /** Prepo status -> Linear workflow state *type*. */
  status: Record<LinearTicketStatus, string>;
  /** Prepo label -> Linear label name. Identity unless a row overrides it. */
  labels: Record<string, string>;
  /** Prepo member email -> Linear member email, when the two differ. */
  owners: Record<string, string>;
};

export const DEFAULT_MAPPING: LinearMapping = {
  priority: { p0: 1, p1: 2, p2: 3, p3: 4 },
  status: {
    backlog: "backlog",
    todo: "unstarted",
    in_progress: "started",
    // Linear has no "in review" state type, so both of these land in started.
    // chooseState() tells them apart by the state's name.
    in_review: "started",
    done: "completed",
  },
  labels: {},
  owners: {},
};

/**
 * Linear's workflow state types, back to Prepo statuses.
 *
 * `canceled` has no Prepo equivalent. Rather than record a cancelled issue as
 * finished, it maps to null: the caller leaves the ticket where it is and says
 * the state was unmapped.
 */
export const STATUS_FROM_LINEAR_STATE: Record<
  string,
  LinearTicketStatus | null
> = {
  backlog: "backlog",
  unstarted: "todo",
  started: "in_progress",
  completed: "done",
  canceled: null,
};

export const LINEAR_PRIORITY_SCALE: { value: number; label: string }[] = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

export function linearPriorityLabel(value: number): string {
  return LINEAR_PRIORITY_SCALE.find((entry) => entry.value === value)?.label ?? `Priority ${value}`;
}

/** Merges whatever is stored with the defaults, so a new field has a value. */
export function readMapping(raw: unknown): LinearMapping {
  const stored = (raw ?? {}) as Partial<LinearMapping>;
  return {
    priority: { ...DEFAULT_MAPPING.priority, ...(stored.priority ?? {}) },
    status: { ...DEFAULT_MAPPING.status, ...(stored.status ?? {}) },
    labels: { ...(stored.labels ?? {}) },
    owners: { ...(stored.owners ?? {}) },
  };
}

export function priorityToLinear(
  priority: LinearPriority,
  mapping: LinearMapping,
): number {
  return mapping.priority[priority] ?? DEFAULT_MAPPING.priority[priority];
}

/**
 * Linear 0 means "no priority", which is not a Prepo priority. Returning null
 * lets the caller decide (leave the ticket alone) instead of inventing one.
 */
export function priorityFromLinear(
  remote: number,
  mapping: LinearMapping,
): LinearPriority | null {
  const entry = (Object.keys(mapping.priority) as LinearPriority[]).find(
    (key) => mapping.priority[key] === remote,
  );
  return entry ?? null;
}

export function statusToLinear(
  status: LinearTicketStatus,
  mapping: LinearMapping,
): string {
  return mapping.status[status] ?? DEFAULT_MAPPING.status[status];
}

/**
 * Picks the workflow state a ticket should be written into.
 *
 * A Linear team can have several states of the same type, the default team has
 * both "In Progress" and "In Review", and both are type `started`. Matching on
 * type alone would file every in-progress ticket into whichever of the two
 * happened to come back first, which is how an in-progress ticket ends up
 * showing as In Review. So when a type has more than one state, the state whose
 * name matches the Prepo status wins; otherwise the first of that type does.
 */
const STATE_NAME_HINTS: Record<LinearTicketStatus, readonly string[]> = {
  backlog: ["backlog"],
  todo: ["todo", "to do", "unstarted"],
  in_progress: ["in progress", "doing"],
  in_review: ["in review", "review"],
  done: ["done", "complete", "completed"],
};

export function chooseState(
  states: readonly RemoteState[],
  stateType: string,
  status: LinearTicketStatus,
): RemoteState | null {
  const ofType = states.filter((state) => state.type === stateType);
  if (ofType.length <= 1) return ofType[0] ?? null;

  for (const hint of STATE_NAME_HINTS[status]) {
    const named = ofType.find(
      (state) => state.name.trim().toLowerCase() === hint,
    );
    if (named) return named;
  }
  return ofType[0]!;
}

export function statusFromLinear(
  stateType: string,
): LinearTicketStatus | null {
  return STATUS_FROM_LINEAR_STATE[stateType] ?? null;
}

/** Labels map by name unless a row says otherwise. */
export function labelsToLinear(
  labels: readonly string[],
  mapping: LinearMapping,
): string[] {
  return labels.map((label) => mapping.labels[label] ?? label);
}

export function ownerEmailToLinear(
  prepoEmail: string | null,
  mapping: LinearMapping,
): string | null {
  if (!prepoEmail) return null;
  return mapping.owners[prepoEmail] ?? prepoEmail;
}

/**
 * Finds the Linear member for a Prepo member by email. The override table is
 * applied first, then a case-insensitive match, because Linear does not
 * normalise addresses either.
 */
export function matchLinearMember(
  prepoEmail: string | null,
  mapping: LinearMapping,
  members: readonly RemoteUser[],
): RemoteUser | null {
  const wanted = ownerEmailToLinear(prepoEmail, mapping)?.toLowerCase();
  if (!wanted) return null;
  return (
    members.find((member) => member.email.toLowerCase() === wanted) ?? null
  );
}

/** `yyyy-mm-dd` from a Date, which is what Linear's `dueDate` field wants. */
export function toLinearDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** The reverse, at UTC midnight so a date does not drift across the day. */
export function fromLinearDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The issue body: the ticket's own words, then where it came from. The backlink
 * is built from the workspace slug and ticket key, never from stored input, so
 * nothing a member typed can become a URL or an injection into Linear.
 */
export function issueDescription(input: {
  description: string | null;
  workspaceSlug: string;
  ticketKey: string;
  origin?: { meetingTitle: string; quote: string | null } | null;
  appUrl: string | null;
}): string {
  const lines: string[] = [];

  if (input.description?.trim()) lines.push(input.description.trim());

  if (input.origin) {
    lines.push("", "---", `**From the meeting:** ${input.origin.meetingTitle}`);
    if (input.origin.quote?.trim()) {
      lines.push("", `> ${input.origin.quote.trim().replace(/\n+/g, " ")}`);
    }
  }

  const link = input.appUrl
    ? `${input.appUrl}/${input.workspaceSlug}/tickets/${input.ticketKey}`
    : null;
  lines.push("", `Mirrored from Prepo · ${input.ticketKey}${link ? ` · ${link}` : ""}`);

  return lines.join("\n");
}

/**
 * Turns a full remote issue into a patch. The pull path uses this so that it
 * goes through exactly the same apply logic as a webhook, which is what stops
 * the two paths from drifting apart.
 */
export function patchFromIssue(issue: RemoteIssue): RemotePatch {
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    stateType: issue.state.type,
    assigneeEmail: issue.assignee?.email ?? null,
    title: issue.title,
    priority: issue.priority,
    dueDate: issue.dueDate,
    updatedAt: issue.updatedAt,
  };
}

/** A compact, human-readable diff used in the ticket's activity timeline. */
export function describeRemoteChange(
  before: { status: LinearTicketStatus; assignee: string | null },
  after: { status: LinearTicketStatus; assignee: string | null },
): string {
  const parts: string[] = [];
  if (before.status !== after.status) {
    parts.push(`status ${before.status} → ${after.status}`);
  }
  if (before.assignee !== after.assignee) {
    parts.push(
      `assignee ${before.assignee ?? "nobody"} → ${after.assignee ?? "nobody"}`,
    );
  }
  return parts.join(", ");
}

/** Used by the settings table to show what a ticket would send, before it does. */
export function previewIssue(issue: {
  title: string;
  priority: number;
  dueDate: string | null;
  stateName: string;
  assignee: RemoteUser | null;
}): string {
  return [
    issue.title,
    `${linearPriorityLabel(issue.priority)} · ${issue.stateName} · ${
      issue.dueDate ?? "no due date"
    } · ${issue.assignee?.name ?? "unassigned"}`,
  ].join(", ");
}

export type { RemoteIssue };
