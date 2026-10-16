import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";

export type PasswordAccount = {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
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
    })
    .from(t.users)
    .innerJoin(t.accounts, eq(t.accounts.userId, t.users.id))
    .where(and(eq(t.users.email, email), eq(t.accounts.provider, "password")))
    .limit(1);

  if (!row?.passwordHash) return null;
  return { ...row, passwordHash: row.passwordHash };
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
