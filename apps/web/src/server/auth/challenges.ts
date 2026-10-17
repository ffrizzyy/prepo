import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";
import { hashToken, newSessionToken } from "./tokens";

/**
 * A password that checks out is not enough when the account has a second
 * factor: until that factor is presented the sign-in exists only as a challenge,
 * which carries no authority and expires in five minutes.
 */
export const CHALLENGE_TTL_MINUTES = 5;

export type LoginChallenge = {
  userId: string;
  id: string;
};

function ttl(): Date {
  return new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);
}

export async function createChallenge(input: {
  userId: string;
  kind?: "totp";
}): Promise<{ token: string; expiresAt: Date }> {
  await deleteExpiredChallenges();

  const expiresAt = ttl();
  const token = newSessionToken();

  await getDb()
    .insert(t.loginChallenges)
    .values({
      id: uuidv7(),
      userId: input.userId,
      tokenHash: hashToken(token),
      kind: input.kind ?? "totp",
      expiresAt,
    });

  return { token, expiresAt };
}

/** One read, so a challenge is spent the moment it is used. */
export async function findChallenge(token: string): Promise<LoginChallenge | null> {
  const [row] = await getDb()
    .select({ id: t.loginChallenges.id, userId: t.loginChallenges.userId })
    .from(t.loginChallenges)
    .where(
      and(
        eq(t.loginChallenges.tokenHash, hashToken(token)),
        gt(t.loginChallenges.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function deleteChallenge(token: string): Promise<void> {
  await getDb()
    .delete(t.loginChallenges)
    .where(eq(t.loginChallenges.tokenHash, hashToken(token)));
}

/** Challenges are not trusted to clean up after themselves. */
export async function deleteExpiredChallenges(): Promise<void> {
  await getDb()
    .delete(t.loginChallenges)
    .where(lt(t.loginChallenges.expiresAt, new Date()));
}
