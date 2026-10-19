import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, withWorkspace, type Db } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";
import type { IntegrationStatus } from "../db/schema";
import { audit } from "../writes";
import { linearClient } from "./client";
import {
  ENCRYPTION_KEY_VARIABLE,
  decryptSecret,
  encryptSecret,
  integratingKey,
  type EncryptionKey,
} from "./crypto";
import {
  chooseState,
  fromLinearDate,
  issueDescription,
  matchLinearMember,
  patchFromIssue,
  priorityFromLinear,
  priorityToLinear,
  readMapping,
  statusFromLinear,
  statusToLinear,
  toLinearDate,
  type LinearMapping,
} from "./mapping";
import type {
  LinearClient,
  RemoteIssue,
  RemotePatch,
  RemoteProject,
  RemoteTeam,
  RemoteUser,
} from "./types";

/**
 * The Linear sync (PREPO.md 8.6), as one job and a handful of operations.
 *
 * Two rules shape everything here:
 *
 * 1. **A local write never waits for Linear.** Moving a ticket marks it `pending`
 *    and returns; the job is what talks to the network. Otherwise every board
 *    drag depends on someone else's uptime.
 * 2. **The conflict rule lives in exactly one place.** Both the pull and the
 *    webhook go through `applyRemoteChange`, so "who wins" is decided once and
 *    cannot drift between the two paths.
 *
 * Nothing in this file is called from inside another `withWorkspace` callback:
 * a network call never happens while a transaction is open.
 */

const MINUTE = 60_000;

/** Retry delays, applied by attempt count and then held at the last one. */
export const BACKOFF_MS = [MINUTE, 5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 6 * 60 * MINUTE];

export function backoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index]!;
}

export const LINEAR_NOT_CONNECTED =
  "Linear is not connected for this workspace.";
export const ENCRYPTION_UNCONFIGURED = `A Linear token cannot be stored on this deployment: set ${ENCRYPTION_KEY_VARIABLE} to a 32-byte base64 or 64-character hex key.`;

export type IntegrationRow = typeof t.integrations.$inferSelect;

/** Injectable so the suites can run the whole engine with no network. */
export type LinearDeps = {
  key?: EncryptionKey | null;
  clientFor?: (token: string, authStyle: "personal" | "oauth") => LinearClient;
};

function resolveKey(deps: LinearDeps | undefined): EncryptionKey | null {
  if (deps && deps.key !== undefined) return deps.key;
  return integratingKey(process.env);
}

function makeClient(
  token: string,
  authStyle: "personal" | "oauth",
  deps: LinearDeps | undefined,
): LinearClient {
  return (deps?.clientFor ?? linearClient)(token, authStyle);
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/** Where a mirrored issue's backlink should point. Null when unset, not guessed. */
function appUrl(): string | null {
  return (
    process.env.APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    null
  ) || null;
}

/* ------------------------------------------------------------- connection */

export async function readIntegration(
  workspaceId: string,
): Promise<IntegrationRow | null> {
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select()
      .from(t.integrations)
      .where(
        and(
          eq(t.integrations.workspaceId, workspaceId),
          eq(t.integrations.provider, "linear"),
        ),
      );
    return row ?? null;
  });
}

export type LinearConnection = {
  integrationId: string;
  client: LinearClient;
  mapping: LinearMapping;
  teamId: string | null;
  projectId: string | null;
  sourceOfTruth: "prepo" | "linear";
  lastSyncedAt: Date | null;
};

export type ConnectionResult =
  | { ok: true; connection: LinearConnection }
  | { ok: false; reason: string };

/**
 * A row becomes a usable connection, or a sentence explaining why not. A row
 * whose ciphertext no longer decrypts (rotated key) is reported as unusable
 * rather than crashing the page that reads it.
 */
export function connectionFrom(
  row: IntegrationRow | null,
  deps?: LinearDeps,
): ConnectionResult {
  if (!row || row.status === "disconnected" || !row.encryptedToken) {
    return { ok: false, reason: LINEAR_NOT_CONNECTED };
  }

  const key = resolveKey(deps);
  if (!key) return { ok: false, reason: ENCRYPTION_UNCONFIGURED };

  const token = decryptSecret(row.encryptedToken, key);
  if (!token) {
    return {
      ok: false,
      reason:
        "The stored Linear token could not be decrypted with the current key. Reconnect Linear to store it again.",
    };
  }

  return {
    ok: true,
    connection: {
      integrationId: row.id,
      client: makeClient(token, "personal", deps),
      mapping: readMapping(row.mapping),
      teamId: row.teamId,
      projectId: row.projectId,
      sourceOfTruth: row.sourceOfTruth === "linear" ? "linear" : "prepo",
      lastSyncedAt: row.lastSyncedAt,
    },
  };
}

export type ConnectResult =
  | { ok: true; viewer: RemoteUser; teams: RemoteTeam[] }
  | { ok: false; reason: string };

/**
 * Validates the token against Linear *before* storing anything, so a typo is an
 * error message rather than a row that fails on the first sync. Reconnecting
 * keeps the mapping table (it is Prepo's vocabulary) but clears the team choice
 * and the sync cursor.
 */
export async function connectLinear(input: {
  workspaceId: string;
  actorId: string;
  token: string;
  authStyle?: "personal" | "oauth";
  deps?: LinearDeps;
}): Promise<ConnectResult> {
  const key = resolveKey(input.deps);
  if (!key) return { ok: false, reason: ENCRYPTION_UNCONFIGURED };

  const token = input.token.trim();
  if (!token) return { ok: false, reason: "Enter a token first." };

  const client = makeClient(token, input.authStyle ?? "personal", input.deps);

  let viewer: RemoteUser;
  let teams: RemoteTeam[];
  try {
    viewer = await client.viewer();
    teams = await client.teams();
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }

  const encryptedToken = encryptSecret(token, key);

  await withWorkspace(input.workspaceId, async (tx) => {
    await tx
      .insert(t.integrations)
      .values({
        id: uuidv7(),
        workspaceId: input.workspaceId,
        provider: "linear",
        encryptedToken,
        status: "connected",
        connectedById: input.actorId,
      })
      .onConflictDoUpdate({
        target: [t.integrations.workspaceId, t.integrations.provider],
        set: {
          encryptedToken,
          status: "connected",
          connectedById: input.actorId,
          teamId: null,
          projectId: null,
          lastSyncedAt: null,
          lastError: null,
        },
      });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.linear.connected",
      target: `${viewer.name} <${viewer.email}>`,
    });
  });

  return { ok: true, viewer, teams };
}

/** The team (and optional project) issues are filed into. */
export async function setLinearTeam(input: {
  workspaceId: string;
  actorId: string;
  teamId: string;
  projectId: string | null;
  deps?: LinearDeps;
}): Promise<{ ok: boolean; reason?: string }> {
  const row = await readIntegration(input.workspaceId);
  const connection = connectionFrom(row, input.deps);
  if (!connection.ok) return { ok: false, reason: connection.reason };

  try {
    const teams = await connection.connection.client.teams();
    if (!teams.some((team) => team.id === input.teamId)) {
      return { ok: false, reason: "That team is not visible to this token." };
    }
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }

  await withWorkspace(input.workspaceId, async (tx) => {
    await tx
      .update(t.integrations)
      .set({
        teamId: input.teamId,
        projectId: input.projectId,
        lastSyncedAt: null,
        lastError: null,
      })
      .where(
        and(
          eq(t.integrations.workspaceId, input.workspaceId),
          eq(t.integrations.provider, "linear"),
        ),
      );

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.linear.team_chosen",
      target: `${input.teamId}${input.projectId ? ` / ${input.projectId}` : ""}`,
    });
  });

  return { ok: true };
}

export async function updateLinearSettings(input: {
  workspaceId: string;
  actorId: string;
  mapping?: LinearMapping;
  sourceOfTruth?: "prepo" | "linear";
  webhookSecret?: string | null;
  deps?: LinearDeps;
}): Promise<{ ok: boolean; reason?: string }> {
  const key = resolveKey(input.deps);
  if (input.webhookSecret && !key) {
    return { ok: false, reason: ENCRYPTION_UNCONFIGURED };
  }

  await withWorkspace(input.workspaceId, async (tx) => {
    const set: Partial<typeof t.integrations.$inferInsert> = {};
    if (input.mapping) set.mapping = input.mapping;
    if (input.sourceOfTruth) set.sourceOfTruth = input.sourceOfTruth;
    if (input.webhookSecret !== undefined) {
      set.encryptedWebhookSecret = input.webhookSecret
        ? encryptSecret(input.webhookSecret, key!)
        : null;
    }

    if (Object.keys(set).length > 0) {
      await tx
        .update(t.integrations)
        .set(set)
        .where(
          and(
            eq(t.integrations.workspaceId, input.workspaceId),
            eq(t.integrations.provider, "linear"),
          ),
        );
    }

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.linear.settings_changed",
      target: Object.keys(set).join(", ") || "nothing",
    });
  });

  return { ok: true };
}

/**
 * Disconnecting keeps every Prepo ticket and unlinks the issues (8.6). The token
 * is dropped rather than kept: a revoked credential has no reason to exist.
 */
export async function disconnectLinear(input: {
  workspaceId: string;
  actorId: string;
}): Promise<{ ok: true; unlinked: number }> {
  const unlinked = await withWorkspace(input.workspaceId, async (tx) => {
    const tickets = await tx
      .update(t.tickets)
      .set({
        linearIssueId: null,
        linearUrl: null,
        linearSyncState: null,
        linearSyncError: null,
        linearSyncAttempts: 0,
        linearRetryAfter: null,
        linearSyncedAt: null,
      })
      .where(
        and(
          eq(t.tickets.workspaceId, input.workspaceId),
          sql`${t.tickets.linearIssueId} is not null`,
        ),
      )
      .returning({ id: t.tickets.id });

    await tx
      .update(t.integrations)
      .set({
        encryptedToken: null,
        encryptedWebhookSecret: null,
        status: "disconnected",
        lastError: null,
      })
      .where(
        and(
          eq(t.integrations.workspaceId, input.workspaceId),
          eq(t.integrations.provider, "linear"),
        ),
      );

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.linear.disconnected",
      target: `${tickets.length} ticket(s) unlinked`,
    });

    return tickets.length;
  });

  return { ok: true, unlinked };
}

export type IntegrationSummary = {
  status: IntegrationStatus | null;
  connected: boolean;
  teamId: string | null;
  projectId: string | null;
  mapping: LinearMapping;
  sourceOfTruth: "prepo" | "linear";
  lastSyncedAt: Date | null;
  lastError: string | null;
  hasWebhookSecret: boolean;
  /** Whether this deployment can store a token at all. */
  encryptionReady: boolean;
  /** Whether the stored token still decrypts. */
  usable: boolean;
  blockedReason: string | null;
};

export async function integrationSummary(
  workspaceId: string,
  deps?: LinearDeps,
): Promise<IntegrationSummary> {
  const row = await readIntegration(workspaceId);
  const connection = connectionFrom(row, deps);

  return {
    status: row?.status ?? null,
    connected: row?.status === "connected" && Boolean(row.encryptedToken),
    teamId: row?.teamId ?? null,
    projectId: row?.projectId ?? null,
    mapping: readMapping(row?.mapping),
    sourceOfTruth: row?.sourceOfTruth === "linear" ? "linear" : "prepo",
    lastSyncedAt: row?.lastSyncedAt ?? null,
    lastError: row?.lastError ?? null,
    hasWebhookSecret: Boolean(row?.encryptedWebhookSecret),
    encryptionReady: Boolean(resolveKey(deps)),
    usable: connection.ok,
    blockedReason: connection.ok ? null : connection.reason,
  };
}

/** Teams the token can see, for the picker. Empty with a reason when unusable. */
export async function availableTeams(
  workspaceId: string,
  deps?: LinearDeps,
): Promise<{ ok: true; teams: RemoteTeam[] } | { ok: false; reason: string }> {
  const row = await readIntegration(workspaceId);
  const connection = connectionFrom(row, deps);
  if (!connection.ok) return { ok: false, reason: connection.reason };

  try {
    return { ok: true, teams: await connection.connection.client.teams() };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}

/** Projects in a team, for the optional half of the mapping. */
export async function availableProjects(
  workspaceId: string,
  teamId: string,
  deps?: LinearDeps,
): Promise<
  { ok: true; projects: RemoteProject[] } | { ok: false; reason: string }
> {
  const row = await readIntegration(workspaceId);
  const connection = connectionFrom(row, deps);
  if (!connection.ok) return { ok: false, reason: connection.reason };

  try {
    return {
      ok: true,
      projects: await connection.connection.client.projects(teamId),
    };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}

/* ------------------------------------------------------------ reconciliation */

export type ApplyResult =
  | "applied"
  | "no-ticket"
  | "unchanged"
  | "unmapped"
  | "kept-local"
  | "unlinked";

/**
 * The single place a remote change becomes a Prepo change, used by the pull and
 * by the webhook route, so the two cannot disagree.
 *
 * Only the fields actually present are touched (`undefined` means "not
 * mentioned"). In Prepo-first mode a ticket with an unsent local change keeps
 * it and the remote edit is recorded as overridden; in Linear-first mode Linear
 * also owns title, priority and due date. An unmapped Linear state (its
 * `canceled`) leaves the status alone and says so, it does not pretend the work
 * was finished.
 */
export async function applyRemoteChange(
  tx: Db,
  input: {
    workspaceId: string;
    patch: RemotePatch;
    mapping: LinearMapping;
    sourceOfTruth: "prepo" | "linear";
    removed?: boolean;
    actorId?: string | null;
  },
): Promise<ApplyResult> {
  const [ticket] = await tx
    .select()
    .from(t.tickets)
    .where(
      and(
        eq(t.tickets.workspaceId, input.workspaceId),
        eq(t.tickets.linearIssueId, input.patch.issueId),
      ),
    );

  if (!ticket) return "no-ticket";

  if (input.removed) {
    await tx
      .update(t.tickets)
      .set({
        linearIssueId: null,
        linearUrl: null,
        linearSyncedAt: null,
        linearSyncState: null,
        linearSyncError: "The Linear issue was deleted. This ticket was kept.",
        linearSyncAttempts: 0,
        linearRetryAfter: null,
      })
      .where(eq(t.tickets.id, ticket.id));

    await tx.insert(t.ticketEvents).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      actorId: input.actorId ?? null,
      actorKind: "agent",
      type: "linear_unlinked",
      payload: { issueId: input.patch.issueId, why: "deleted in Linear" },
    });

    return "unlinked";
  }

  if (ticket.linearSyncState === "pending" && input.sourceOfTruth === "prepo") {
    await tx.insert(t.ticketEvents).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      actorId: input.actorId ?? null,
      actorKind: "agent",
      type: "linear_conflict",
      payload: {
        issueId: input.patch.issueId,
        resolution: "kept the local change; it will be pushed",
      },
    });
    return "kept-local";
  }

  const next: Partial<typeof t.tickets.$inferInsert> = {};
  const notes: string[] = [];
  let unmapped = false;

  if (input.patch.stateType !== undefined) {
    const status = statusFromLinear(input.patch.stateType ?? "");
    if (status === null) {
      unmapped = true;
      notes.push(`unmapped Linear state "${input.patch.stateType ?? "unknown"}"`);
    } else if (status !== ticket.status) {
      next.status = status;
      notes.push(`status ${ticket.status} → ${status}`);
    }
  }

  if (input.patch.assigneeEmail !== undefined) {
    const members = await tx
      .select({ userId: t.users.id, email: t.users.email })
      .from(t.memberships)
      .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
      .where(eq(t.memberships.workspaceId, input.workspaceId));

    const email = input.patch.assigneeEmail?.toLowerCase() ?? null;
    const match = email
      ? (members.find((member) => member.email.toLowerCase() === email) ?? null)
      : null;

    if (email && !match) {
      // Do not silently unassign work just because the address is unknown here.
      notes.push(`no member matches ${input.patch.assigneeEmail}`);
    } else if ((match?.userId ?? null) !== ticket.assigneeId) {
      next.assigneeId = match?.userId ?? null;
      notes.push(`assignee → ${match?.email ?? "nobody"}`);
    }
  }

  if (input.sourceOfTruth === "linear") {
    if (
      typeof input.patch.title === "string" &&
      input.patch.title.trim() &&
      input.patch.title !== ticket.title
    ) {
      next.title = input.patch.title;
      notes.push("title taken from Linear");
    }
    if (typeof input.patch.priority === "number") {
      const priority = priorityFromLinear(input.patch.priority, input.mapping);
      if (priority && priority !== ticket.priority) {
        next.priority = priority;
        notes.push(`priority ${ticket.priority} → ${priority}`);
      }
    }
    if (input.patch.dueDate !== undefined) {
      const due = fromLinearDate(input.patch.dueDate ?? null);
      if ((due?.getTime() ?? null) !== (ticket.dueAt?.getTime() ?? null)) {
        next.dueAt = due;
        notes.push(`due date → ${input.patch.dueDate ?? "none"}`);
      }
    }
  }

  const changed = Object.keys(next).length > 0;

  next.linearSyncedAt = input.patch.updatedAt
    ? new Date(input.patch.updatedAt)
    : new Date();
  next.linearSyncState = "synced";
  next.linearSyncError = null;
  next.linearSyncAttempts = 0;
  next.linearRetryAfter = null;
  next.version = sql`${t.tickets.version} + 1` as unknown as number;

  await tx
    .update(t.tickets)
    .set(next)
    .where(eq(t.tickets.id, ticket.id));

  if (changed) {
    await tx.insert(t.ticketEvents).values({
      id: uuidv7(),
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      actorId: input.actorId ?? null,
      actorKind: "agent",
      type: "linear_updated_here",
      payload: {
        issueId: input.patch.issueId,
        identifier: input.patch.identifier ?? null,
        change: notes.join(", "),
        source: input.sourceOfTruth,
      },
    });

    await audit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: "integration.linear.change_applied",
      target: `${ticket.key}: ${notes.join(", ")}`,
    });
  }

  if (unmapped) return "unmapped";
  return changed ? "applied" : "unchanged";
}

async function recordFailure(
  workspaceId: string,
  ticketId: string,
  why: string,
  now: Date,
): Promise<void> {
  await withWorkspace(workspaceId, async (tx) => {
    const [ticket] = await tx
      .select({
        key: t.tickets.key,
        attempts: t.tickets.linearSyncAttempts,
      })
      .from(t.tickets)
      .where(eq(t.tickets.id, ticketId));

    const attempts = (ticket?.attempts ?? 0) + 1;

    await tx
      .update(t.tickets)
      .set({
        linearSyncState: "failed",
        linearSyncError: why.slice(0, 500),
        linearSyncAttempts: attempts,
        linearRetryAfter: new Date(now.getTime() + backoffMs(attempts)),
      })
      .where(eq(t.tickets.id, ticketId));

    await audit(tx, {
      workspaceId,
      actorId: null,
      action: "integration.linear.sync_failed",
      target: `${ticket?.key ?? ticketId}: ${why.slice(0, 120)}`,
    });
  });
}

/** The meeting and quote a ticket came from, for the backlink (8.6). */
async function readOrigin(
  tx: Db,
  actionItemId: string,
): Promise<{ meetingTitle: string; quote: string | null } | null> {
  const [item] = await tx
    .select({
      meetingId: t.actionItems.meetingId,
      segmentIds: t.actionItems.sourceSegmentIds,
    })
    .from(t.actionItems)
    .where(eq(t.actionItems.id, actionItemId));

  if (!item) return null;

  const [meeting] = await tx
    .select({ title: t.meetings.title })
    .from(t.meetings)
    .where(eq(t.meetings.id, item.meetingId));

  const segments = item.segmentIds.length
    ? await tx
        .select({ text: t.transcriptSegments.text })
        .from(t.transcriptSegments)
        .where(inArray(t.transcriptSegments.id, item.segmentIds))
    : [];

  return {
    meetingTitle: meeting?.title ?? "the meeting",
    quote: segments.length
      ? segments.map((segment) => segment.text).join(" ")
      : null,
  };
}

export type PushOutcome = { ok: boolean; detail: string; issueUrl?: string };

/**
 * Sends one ticket to Linear, creating the issue the first time, updating it
 * after. Every failure is recorded on the ticket (with a backoff) rather than
 * swallowed, and the in-app ticket is never rolled back because Linear refused.
 */
export async function pushTicket(input: {
  workspaceId: string;
  ticketId: string;
  now?: Date;
  deps?: LinearDeps;
}): Promise<PushOutcome> {
  const now = input.now ?? new Date();

  const row = await readIntegration(input.workspaceId);
  const connection = connectionFrom(row, input.deps);
  if (!connection.ok) return { ok: false, detail: connection.reason };

  const { client, mapping, teamId, projectId } = connection.connection;
  if (!teamId) {
    return { ok: false, detail: "No Linear team is chosen for this workspace." };
  }

  const snapshot = await withWorkspace(input.workspaceId, async (tx) => {
    const [ticket] = await tx
      .select()
      .from(t.tickets)
      .where(eq(t.tickets.id, input.ticketId));
    if (!ticket) return null;

    const [owner] = ticket.assigneeId
      ? await tx
          .select({ email: t.users.email })
          .from(t.users)
          .where(eq(t.users.id, ticket.assigneeId))
      : [];

    const [workspace] = await tx
      .select({ slug: t.workspaces.slug })
      .from(t.workspaces);

    return {
      ticket,
      ownerEmail: owner?.email ?? null,
      slug: workspace?.slug ?? "",
      origin: ticket.actionItemId
        ? await readOrigin(tx, ticket.actionItemId)
        : null,
    };
  });

  if (!snapshot) return { ok: false, detail: "No such ticket." };

  try {
    const [members, states] = await Promise.all([
      client.members(teamId),
      client.states(teamId),
    ]);

    const member = matchLinearMember(snapshot.ownerEmail, mapping, members);
    const state = chooseState(
      states,
      statusToLinear(snapshot.ticket.status, mapping),
      snapshot.ticket.status,
    );

    const description = issueDescription({
      description: snapshot.ticket.description,
      workspaceSlug: snapshot.slug,
      ticketKey: snapshot.ticket.key,
      origin: snapshot.origin,
      appUrl: appUrl(),
    });

    const creating = !snapshot.ticket.linearIssueId;

    const issue: RemoteIssue = creating
      ? await client.createIssue({
          teamId,
          projectId,
          title: snapshot.ticket.title,
          description,
          priority: priorityToLinear(snapshot.ticket.priority, mapping),
          dueDate: toLinearDate(snapshot.ticket.dueAt),
          assigneeId: member?.id ?? null,
          ...(state ? { stateId: state.id } : {}),
        })
      : await client.updateIssue(snapshot.ticket.linearIssueId!, {
          title: snapshot.ticket.title,
          description,
          priority: priorityToLinear(snapshot.ticket.priority, mapping),
          dueDate: toLinearDate(snapshot.ticket.dueAt),
          assigneeId: member?.id ?? null,
          ...(state ? { stateId: state.id } : {}),
        });

    await withWorkspace(input.workspaceId, async (tx) => {
      await tx
        .update(t.tickets)
        .set({
          linearIssueId: issue.id,
          linearUrl: issue.url,
          linearSyncedAt: new Date(issue.updatedAt),
          linearSyncState: "synced",
          linearSyncError: null,
          linearSyncAttempts: 0,
          linearRetryAfter: null,
        })
        .where(eq(t.tickets.id, input.ticketId));

      await tx.insert(t.ticketEvents).values({
        id: uuidv7(),
        workspaceId: input.workspaceId,
        ticketId: input.ticketId,
        actorId: null,
        actorKind: "agent",
        type: creating ? "linear_linked" : "linear_synced",
        payload: {
          issueId: issue.id,
          identifier: issue.identifier,
          url: issue.url,
          assignee: member ? "matched by email" : "unmatched",
        },
      });

      await audit(tx, {
        workspaceId: input.workspaceId,
        actorId: null,
        action: creating
          ? "integration.linear.issue_created"
          : "integration.linear.issue_updated",
        target: `${snapshot.ticket.key} → ${issue.identifier}`,
      });
    });

    return {
      ok: true,
      detail: `${issue.identifier} ${creating ? "created" : "updated"}.`,
      issueUrl: issue.url,
    };
  } catch (error) {
    const why = reason(error);
    await recordFailure(input.workspaceId, input.ticketId, why, now);
    return { ok: false, detail: why };
  }
}

export type PullReport = {
  ok: boolean;
  reason?: string;
  seen: number;
  applied: number;
  unchanged: number;
  unmapped: number;
  kept: number;
  unlinked: number;
};

/**
 * Walks everything the team changed since the last pass and applies it. The
 * cursor advances whether or not the changes applied, so one unmirrored issue
 * cannot stall the queue; unlinked remote issues are counted and ignored.
 */
export async function pullWorkspace(input: {
  workspaceId: string;
  now?: Date;
  deps?: LinearDeps;
}): Promise<PullReport> {
  const now = input.now ?? new Date();
  const empty: PullReport = {
    ok: false,
    seen: 0,
    applied: 0,
    unchanged: 0,
    unmapped: 0,
    kept: 0,
    unlinked: 0,
  };

  const row = await readIntegration(input.workspaceId);
  const connection = connectionFrom(row, input.deps);
  if (!connection.ok) return { ...empty, reason: connection.reason };

  const { client, mapping, teamId } = connection.connection;
  if (!teamId) return { ...empty, reason: "No Linear team is chosen." };

  const since = connection.connection.lastSyncedAt ?? new Date(0);

  let issues: RemoteIssue[];
  try {
    issues = await client.issuesUpdatedSince(teamId, since.toISOString());
  } catch (error) {
    const why = reason(error);
    await withWorkspace(input.workspaceId, async (tx) => {
      await tx
        .update(t.integrations)
        .set({ status: "error", lastError: why.slice(0, 500) })
        .where(
          and(
            eq(t.integrations.workspaceId, input.workspaceId),
            eq(t.integrations.provider, "linear"),
          ),
        );
      await audit(tx, {
        workspaceId: input.workspaceId,
        actorId: null,
        action: "integration.linear.pull_failed",
        target: why.slice(0, 160),
      });
    });
    return { ...empty, reason: why };
  }

  const report: PullReport = {
    ok: true,
    seen: issues.length,
    applied: 0,
    unchanged: 0,
    unmapped: 0,
    kept: 0,
    unlinked: 0,
  };

  await withWorkspace(input.workspaceId, async (tx) => {
    for (const issue of issues) {
      const result = await applyRemoteChange(tx, {
        workspaceId: input.workspaceId,
        patch: patchFromIssue(issue),
        mapping,
        sourceOfTruth: connection.connection.sourceOfTruth,
      });

      if (result === "applied") report.applied += 1;
      else if (result === "unchanged") report.unchanged += 1;
      else if (result === "unmapped") report.unmapped += 1;
      else if (result === "kept-local") report.kept += 1;
      else if (result === "unlinked") report.unlinked += 1;
    }

    await tx
      .update(t.integrations)
      .set({ lastSyncedAt: now, status: "connected", lastError: null })
      .where(
        and(
          eq(t.integrations.workspaceId, input.workspaceId),
          eq(t.integrations.provider, "linear"),
        ),
      );
  });

  return report;
}

/** Tickets the job should push: queued, or failed and past their backoff. */
export async function pendingTickets(
  workspaceId: string,
  now: Date,
): Promise<{ id: string; key: string }[]> {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select({
        id: t.tickets.id,
        key: t.tickets.key,
      })
      .from(t.tickets)
      .where(
        and(
          eq(t.tickets.workspaceId, workspaceId),
          or(
            eq(t.tickets.linearSyncState, "pending"),
            and(
              eq(t.tickets.linearSyncState, "failed"),
              or(
                isNull(t.tickets.linearRetryAfter),
                lte(t.tickets.linearRetryAfter, now),
              ),
            ),
          ),
        ),
      ),
  );
}

export type LinearReport = {
  workspaces: number;
  connected: number;
  pulled: number;
  applied: number;
  unmapped: number;
  kept: number;
  pushed: number;
  failed: number;
  details: string[];
};

export type WorkspaceSyncReport = {
  connected: boolean;
  reason?: string;
  pull: PullReport | null;
  pushed: number;
  failed: number;
  details: string[];
};

/**
 * One workspace, one pass: pull what Linear changed, then push what Prepo
 * queued. Pulling first matters in Linear-first mode, where a remote change is
 * allowed to override a local one before it is sent.
 *
 * The job and the "Sync now" button both come through here, so an operator
 * pressing the button is running exactly what the scheduler runs.
 */
export async function syncWorkspace(input: {
  workspaceId: string;
  now?: Date;
  deps?: LinearDeps;
}): Promise<WorkspaceSyncReport> {
  const now = input.now ?? new Date();
  const report: WorkspaceSyncReport = {
    connected: false,
    pull: null,
    pushed: 0,
    failed: 0,
    details: [],
  };

  const row = await readIntegration(input.workspaceId);
  if (!row || row.status === "disconnected") return report;

  const connection = connectionFrom(row, input.deps);
  report.connected = true;

  if (!connection.ok) {
    report.reason = connection.reason;
    report.details.push(connection.reason);
    return report;
  }

  if (!connection.connection.teamId) {
    report.reason = "No Linear team is chosen yet.";
    report.details.push(report.reason);
    return report;
  }

  const pull = await pullWorkspace({
    workspaceId: input.workspaceId,
    now,
    deps: input.deps,
  });
  report.pull = pull;
  if (!pull.ok && pull.reason) report.details.push(`pull: ${pull.reason}`);

  const queued = await pendingTickets(input.workspaceId, now);
  for (const ticket of queued) {
    const outcome = await pushTicket({
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      now,
      deps: input.deps,
    });

    if (outcome.ok) report.pushed += 1;
    else report.failed += 1;
    report.details.push(`${ticket.key}: ${outcome.detail}`);
  }

  return report;
}

/**
 * Every workspace with a connection. Workspaces are read as the database owner
 * and everything else happens inside `withWorkspace`, so RLS still decides what
 * is visible. Like the chaser and the retention sweep, this is a script for a
 * scheduler, not a daemon.
 */
export async function runLinearSync(
  options: { now?: Date; deps?: LinearDeps } = {},
): Promise<LinearReport> {
  const now = options.now ?? new Date();
  const report: LinearReport = {
    workspaces: 0,
    connected: 0,
    pulled: 0,
    applied: 0,
    unmapped: 0,
    kept: 0,
    pushed: 0,
    failed: 0,
    details: [],
  };

  const workspaces = await getDb()
    .select({ id: t.workspaces.id })
    .from(t.workspaces);

  report.workspaces = workspaces.length;

  for (const workspace of workspaces) {
    const result = await syncWorkspace({
      workspaceId: workspace.id,
      now,
      deps: options.deps,
    });

    if (!result.connected) continue;
    report.connected += 1;

    report.pulled += result.pull?.seen ?? 0;
    report.applied += result.pull?.applied ?? 0;
    report.unmapped += result.pull?.unmapped ?? 0;
    report.kept += result.pull?.kept ?? 0;
    report.pushed += result.pushed;
    report.failed += result.failed;
    report.details.push(...result.details);
  }

  return report;
}
