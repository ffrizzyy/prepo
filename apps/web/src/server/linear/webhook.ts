import { createHmac } from "node:crypto";
import { secretEquals } from "./crypto";
import type { RemotePatch } from "./types";

/**
 * Linear's signed webhooks (PREPO.md 8.6, 9.3 A08): the body is HMAC-SHA256
 * signed with the webhook's own secret, and the payload carries a timestamp so
 * an old delivery cannot be replayed. Both checks live here, as pure functions,
 * so the whole thing is testable without a network or a database.
 *
 * Nothing in this file trusts the request beyond the signature: a payload that
 * verifies is still shape-checked before anything reads a field from it.
 */

export const SIGNATURE_HEADER = "linear-signature";
export const DELIVERY_HEADER = "linear-delivery";
export const EVENT_HEADER = "linear-event";

/** Linear's own guidance: reject a delivery older than a minute. */
export const MAX_AGE_MS = 60_000;

export const LINEAR_ENDPOINT_PATH = "/api/integrations/linear/webhook";

export type LinearEventData = {
  id?: string;
  identifier?: string;
  title?: string;
  priority?: number;
  dueDate?: string | null;
  updatedAt?: string;
  teamId?: string;
  team?: { id?: string };
  state?: { id?: string; name?: string; type?: string } | null;
  assignee?: { id?: string; name?: string; email?: string } | null;
  /** Linear sends whatever the issue has; only the fields above are acted on. */
  [key: string]: unknown;
};

export type LinearEvent = {
  action: string;
  type: string;
  data: LinearEventData;
  webhookTimestamp?: number;
  webhookId?: string;
};

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Compared in constant time; the hex form is normalised first. */
export function verifySignature(input: {
  body: string;
  signature: string | null;
  secret: string;
}): boolean {
  if (!input.signature) return false;
  return secretEquals(signBody(input.body, input.secret), input.signature.trim().toLowerCase());
}

export type ParsedEvent =
  | { ok: true; event: LinearEvent }
  | { ok: false; reason: string };

/**
 * Shape-checks a payload and applies the replay window. Returns a reason rather
 * than throwing, because the route answers a rejected webhook with 400 and a
 * sentence, not a stack trace.
 */
export function parseEvent(
  body: string,
  options: { now?: Date; maxAgeMs?: number } = {},
): ParsedEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "The body is not JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "The body is not an object." };
  }

  const candidate = parsed as Partial<LinearEvent>;
  if (typeof candidate.action !== "string" || typeof candidate.type !== "string") {
    return { ok: false, reason: "The payload has no action or type." };
  }
  if (typeof candidate.data !== "object" || candidate.data === null) {
    return { ok: false, reason: "The payload has no data." };
  }

  const now = options.now ?? new Date();
  const maxAge = options.maxAgeMs ?? MAX_AGE_MS;
  if (typeof candidate.webhookTimestamp === "number") {
    const age = now.getTime() - candidate.webhookTimestamp;
    // A little clock skew is tolerated; a delivery from the future is not.
    if (age > maxAge) {
      return { ok: false, reason: `The delivery is ${Math.round(age / 1000)}s old.` };
    }
    if (age < -maxAge) {
      return { ok: false, reason: "The delivery is timestamped in the future." };
    }
  }

  return {
    ok: true,
    event: {
      action: candidate.action,
      type: candidate.type,
      data: candidate.data,
      webhookTimestamp: candidate.webhookTimestamp,
      webhookId: candidate.webhookId,
    },
  };
}

export type EventChange = {
  /** The issue was deleted in Linear: the ticket is unlinked, never deleted. */
  removed: boolean;
  teamId: string | null;
  patch: RemotePatch;
  /** True when a field the sync cares about was actually present. */
  meaningful: boolean;
};

/**
 * Reduces a verified payload to the fields the sync can act on, so the engine
 * never reads a webhook field directly. A payload that only carries a comment or
 * a label produces `meaningful: false` and changes nothing.
 */
export function changeFromEvent(
  event: LinearEvent,
  teamId: string,
): EventChange | null {
  if (event.type !== "Issue") return null;

  if (event.action === "remove") {
    return {
      removed: true,
      teamId: event.data.team?.id ?? event.data.teamId ?? teamId,
      patch: {
        issueId: event.data.id ?? "",
        identifier: event.data.identifier ?? null,
        updatedAt: event.data.updatedAt ?? null,
      },
      meaningful: true,
    };
  }

  if (!event.data.id) return null;

  const patch: RemotePatch = { issueId: event.data.id };

  // `assignee` present but null is a real change (unassigned); absent is not
  // mentioned at all, and must not be read as "nobody".
  if ("assignee" in event.data) {
    patch.assigneeEmail = event.data.assignee?.email ?? null;
  }
  if (typeof event.data.state?.type === "string") {
    patch.stateType = event.data.state.type;
  }
  if (typeof event.data.title === "string") patch.title = event.data.title;
  if (typeof event.data.priority === "number") patch.priority = event.data.priority;
  if ("dueDate" in event.data) patch.dueDate = event.data.dueDate ?? null;
  if (typeof event.data.identifier === "string") patch.identifier = event.data.identifier;
  if (typeof event.data.updatedAt === "string") patch.updatedAt = event.data.updatedAt;

  const meaningful =
    patch.assigneeEmail !== undefined ||
    patch.stateType !== undefined ||
    patch.title !== undefined ||
    patch.priority !== undefined ||
    patch.dueDate !== undefined;

  return {
    removed: false,
    teamId: event.data.team?.id ?? event.data.teamId ?? teamId,
    patch,
    meaningful,
  };
}
