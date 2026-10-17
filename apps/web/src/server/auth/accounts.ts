import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";

export type PasswordAccount = {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  /** Set once the account has a second factor to present. */
  totpEnabled: boolean;
};

export type SecurityAccount = {
  userId: string;
  email: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  recoveryCodeHashes: string[];
};

/**
 * Identity lookups run on the owner connection: `users`, `accounts` and
 * `auth_events` carry no workspace scope, so RLS (which is keyed on
 * `workspace_id`) does not apply to them.
 */
export async function findPasswordAccount(
  email: string,
): Promise<PasswordAccount | null> {
  const [row] = await getDb()
    .select({
      userId: t.users.id,
      name: t.users.name,
      email: t.users.email,
      passwordHash: t.accounts.passwordHash,
      totpEnabledAt: t.accounts.totpEnabledAt,
    })
    .from(t.users)
    .innerJoin(t.accounts, eq(t.accounts.userId, t.users.id))
    .where(and(eq(t.users.email, email), eq(t.accounts.provider, "password")))
    .limit(1);

  if (!row?.passwordHash) return null;
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    totpEnabled: row.totpEnabledAt !== null,
  };
}

/** The security half of an account, read for enrolment, confirmation and sign-in. */
export async function getSecurityAccount(
  userId: string,
): Promise<SecurityAccount | null> {
  const [row] = await getDb()
    .select({
      userId: t.accounts.userId,
      email: t.users.email,
      totpSecret: t.accounts.totpSecret,
      totpEnabledAt: t.accounts.totpEnabledAt,
      recoveryCodeHashes: t.accounts.totpRecoveryCodeHashes,
    })
    .from(t.accounts)
    .innerJoin(t.users, eq(t.users.id, t.accounts.userId))
    .where(and(eq(t.accounts.userId, userId), eq(t.accounts.provider, "password")))
    .limit(1);

  if (!row) return null;
  return {
    userId: row.userId,
    email: row.email,
    totpSecret: row.totpSecret,
    totpEnabled: row.totpEnabledAt !== null,
    recoveryCodeHashes: row.recoveryCodeHashes,
  };
}

/**
 * Stores a generated secret but does not switch the factor on: enrolment is only
 * complete once a code from the authenticator has been checked against it.
 */
export async function storePendingTotpSecret(
  userId: string,
  secret: string,
): Promise<void> {
  await getDb()
    .update(t.accounts)
    .set({ totpSecret: secret })
    .where(and(eq(t.accounts.userId, userId), eq(t.accounts.provider, "password")));
}

export async function enableTotp(input: {
  userId: string;
  recoveryCodeHashes: string[];
}): Promise<void> {
  await getDb()
    .update(t.accounts)
    .set({
      totpEnabledAt: new Date(),
      totpRecoveryCodeHashes: input.recoveryCodeHashes,
    })
    .where(
      and(eq(t.accounts.userId, input.userId), eq(t.accounts.provider, "password")),
    );
}

export async function disableTotp(userId: string): Promise<void> {
  await getDb()
    .update(t.accounts)
    .set({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodeHashes: [] })
    .where(
      and(eq(t.accounts.userId, userId), eq(t.accounts.provider, "password")),
    );
}

/** Consuming a code removes its hash, so a recovery code works exactly once. */
export async function consumeRecoveryCode(
  userId: string,
  codeHash: string,
): Promise<boolean> {
  const account = await getSecurityAccount(userId);
  if (!account || !account.recoveryCodeHashes.includes(codeHash)) return false;

  const remaining = account.recoveryCodeHashes.filter((hash) => hash !== codeHash);
  await getDb()
    .update(t.accounts)
    .set({ totpRecoveryCodeHashes: remaining })
    .where(
      and(eq(t.accounts.userId, userId), eq(t.accounts.provider, "password")),
    );

  return true;
}

export async function getUserByEmail(email: string) {
  const [row] = await getDb()
    .select()
    .from(t.users)
    .where(eq(t.users.email, email))
    .limit(1);
  return row ?? null;
}

export async function createUserWithPassword(input: {
  email: string;
  name: string;
  passwordHash: string;
  timezone: string;
}): Promise<{ userId: string }> {
  const userId = uuidv7();

  await getDb().transaction(async (tx) => {
    await tx.insert(t.users).values({
      id: userId,
      email: input.email,
      name: input.name,
      timezone: input.timezone,
    });
    await tx.insert(t.accounts).values({
      id: uuidv7(),
      userId,
      provider: "password",
      providerAccountId: input.email,
      passwordHash: input.passwordHash,
    });
  });

  return { userId };
}
