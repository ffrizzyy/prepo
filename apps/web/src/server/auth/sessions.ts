import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";
import { hashToken, newSessionToken } from "./tokens";

/** Absolute lifetime of a session, however active it stays. */
export const SESSION_TTL_DAYS = 30;
/** Idle lifetime: an unused session stops working well before it expires. */
export const SESSION_IDLE_DAYS = 7;
/** `last_seen_at` is not worth a write on every request. */
const TOUCH_AFTER_MINUTES = 5;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

export type ActiveSession = {
  id: string;
  userId: string;
  deviceLabel: string;
  clientType: t.ClientType;
  userAgentHash: string;
  ipPrefix: string | null;
  lastSeenAt: Date;
  expiresAt: Date;
  user: SessionUser;
};

function ttl(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Every sign-in creates a new row and a new token — sessions are rotated on
 * login, and the old token is never reused (§9.3 A07). Only the hash is stored,
 * so the returned token is the single moment the plaintext exists.
 */
export async function createSession(input: {
  userId: string;
  deviceLabel: string;
  clientType: t.ClientType;
  userAgentHash: string;
  ipPrefix: string | null;
}): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const sessionId = uuidv7();
  const expiresAt = ttl();
  const token = newSessionToken();

  await getDb()
    .insert(t.sessions)
    .values({
      id: sessionId,
      userId: input.userId,
      tokenHash: hashToken(token),
      deviceLabel: input.deviceLabel,
      clientType: input.clientType,
      userAgentHash: input.userAgentHash,
      ipPrefix: input.ipPrefix,
      expiresAt,
    });

  return { sessionId, token, expiresAt };
}

/**
 * The one lookup that decides whether a request is authenticated: the token must
 * match, the session must not be revoked, must be inside its absolute lifetime
 * and must not have been idle for too long.
 */
export async function findActiveSession(
  tokenHash: string,
): Promise<ActiveSession | null> {
  const [row] = await getDb()
    .select({
      id: t.sessions.id,
      userId: t.sessions.userId,
      deviceLabel: t.sessions.deviceLabel,
      clientType: t.sessions.clientType,
      userAgentHash: t.sessions.userAgentHash,
      ipPrefix: t.sessions.ipPrefix,
      lastSeenAt: t.sessions.lastSeenAt,
      expiresAt: t.sessions.expiresAt,
      userName: t.users.name,
      userEmail: t.users.email,
      userTimezone: t.users.timezone,
    })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(
      and(
        eq(t.sessions.tokenHash, tokenHash),
        isNull(t.sessions.revokedAt),
        gt(t.sessions.expiresAt, sql`now()`),
        gt(
          t.sessions.lastSeenAt,
          sql`now() - make_interval(days => ${SESSION_IDLE_DAYS})`,
        ),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    deviceLabel: row.deviceLabel,
    clientType: row.clientType,
    userAgentHash: row.userAgentHash,
    ipPrefix: row.ipPrefix,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      timezone: row.userTimezone,
    },
  };
}

export async function touchSession(sessionId: string): Promise<void> {
  await getDb()
    .update(t.sessions)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(t.sessions.id, sessionId),
        lt(
          t.sessions.lastSeenAt,
          sql`now() - make_interval(mins => ${TOUCH_AFTER_MINUTES})`,
        ),
      ),
    );
}

export async function listSessionsForUser(
  userId: string,
): Promise<ActiveSession[]> {
  const rows = await getDb()
    .select({
      id: t.sessions.id,
      userId: t.sessions.userId,
      deviceLabel: t.sessions.deviceLabel,
      clientType: t.sessions.clientType,
      userAgentHash: t.sessions.userAgentHash,
      ipPrefix: t.sessions.ipPrefix,
      lastSeenAt: t.sessions.lastSeenAt,
      expiresAt: t.sessions.expiresAt,
      userName: t.users.name,
      userEmail: t.users.email,
      userTimezone: t.users.timezone,
    })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.userId, userId), isNull(t.sessions.revokedAt)))
    .orderBy(desc(t.sessions.lastSeenAt));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    deviceLabel: row.deviceLabel,
    clientType: row.clientType,
    userAgentHash: row.userAgentHash,
    ipPrefix: row.ipPrefix,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      timezone: row.userTimezone,
    },
  }));
}

/**
 * Scoped by `userId` as well as session id, so a stale or guessed id can only
 * ever revoke a session belonging to the caller.
 */
export async function revokeSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const revoked = await getDb()
    .update(t.sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(t.sessions.id, sessionId),
        eq(t.sessions.userId, userId),
        isNull(t.sessions.revokedAt),
      ),
    )
    .returning({ id: t.sessions.id });

  return revoked.length > 0;
}

export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const revoked = await getDb()
    .update(t.sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(t.sessions.userId, userId),
        ne(t.sessions.id, keepSessionId),
        isNull(t.sessions.revokedAt),
      ),
    )
    .returning({ id: t.sessions.id });

  return revoked.length;
}
