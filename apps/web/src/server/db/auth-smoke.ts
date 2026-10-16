/**
 * Exercises the authentication core exactly the way the sign-in action does:
 * password hashing, throttling, per-device sessions, revocation and workspace
 * membership. Reseeds first so it is repeatable:
 *   pnpm --filter @prepo/web db:auth
 */
import { getDb } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";
import { seed } from "./seed";
import * as t from "./schema";
import {
  createUserWithPassword,
  findPasswordAccount,
  getUserByEmail,
} from "../auth/accounts";
import { DEMO } from "../auth/demo";
import { countRecentFailures, recordAuthEvent } from "../auth/events";
import {
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../auth/password";
import {
  createSession,
  findActiveSession,
  revokeOtherSessions,
  revokeSession,
} from "../auth/sessions";
import { hashToken } from "../auth/tokens";
import {
  clientTypeFor,
  describeDevice,
  ipPrefixFor,
} from "../auth/user-agent";
import {
  createWorkspaceWithOwner,
  getWorkspaceMembers,
  listWorkspacesForUser,
} from "./repo";

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

const DEVICE = {
  deviceLabel: "Chrome on Windows",
  clientType: "web" as const,
  userAgentHash: "0".repeat(64),
  ipPrefix: "203.0.113",
};

runCli("auth-smoke.ts", async () => {
  await migrateAndApply();
  await seed();

  /* ------------------------------------------------------------- password */

  const account = await findPasswordAccount(DEMO.email);
  check("the seeded demo account has a password", account !== null, DEMO.email);

  const stored = account?.passwordHash ?? "";
  check(
    "the stored password is an argon2id PHC string, not the password",
    stored.startsWith("$argon2id$") && !stored.includes(DEMO.password),
    stored.slice(0, 24) + "…",
  );

  check(
    "the demo password verifies",
    account ? await verifyPassword(DEMO.password, account.passwordHash) : false,
    "argon2Verify",
  );
  check(
    "a wrong password does not verify",
    account
      ? !(await verifyPassword(`${DEMO.password}x`, account.passwordHash))
      : false,
    "rejected",
  );
  check(
    "a malformed stored hash fails closed instead of throwing",
    !(await verifyPassword(DEMO.password, "not-a-phc-string")),
    "false, no throw",
  );

  const salted = await hashPassword(DEMO.password);
  check(
    "the same password hashes differently every time (per-hash salt)",
    salted !== stored &&
      !(await verifyPassword("other", salted)) &&
      (await verifyPassword(DEMO.password, salted)),
    "distinct salts",
  );

  check(
    "the timing decoy is a real hash, so unknown emails cost the same",
    (await dummyPasswordHash()).startsWith("$argon2id$"),
    "argon2id",
  );

  /* ------------------------------------------------------------- throttle */

  const ip = "198.51.100";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await recordAuthEvent({
      kind: "sign_in_failed",
      email: "nobody@example.com",
      ipPrefix: ip,
    });
  }

  const failures = await countRecentFailures({
    email: "nobody@example.com",
    ipPrefix: ip,
    seconds: 60,
  });
  check(
    "failures are counted per email",
    failures.byEmail === 3,
    String(failures.byEmail),
  );
  check(
    "failures are counted per network",
    failures.byIp === 3,
    String(failures.byIp),
  );

  const unrelated = await countRecentFailures({
    email: "someone@else.com",
    ipPrefix: "192.0.2",
    seconds: 60,
  });
  check(
    "an unrelated email and network is unaffected",
    unrelated.byEmail === 0 && unrelated.byIp === 0,
    "0/0",
  );

  const stale = await countRecentFailures({
    email: "nobody@example.com",
    ipPrefix: ip,
    seconds: 0,
  });
  check("the window is honoured", stale.byEmail === 0, String(stale.byEmail));

  /* ------------------------------------------------------------- sessions */

  const userId = account!.userId;
  const created = await createSession({ userId, ...DEVICE });

  const found = await findActiveSession(hashToken(created.token));
  check(
    "a fresh session resolves to its user",
    found?.userId === userId && found.user.email === DEMO.email,
    `${found?.deviceLabel} / ${found?.user.email}`,
  );

  check(
    "the raw token is not what is stored",
    found !== null &&
      (await findActiveSession(created.token)) === null &&
      (await findActiveSession(hashToken(`${created.token}x`))) === null,
    "hash on read",
  );

  const other = await createSession({ userId, ...DEVICE });
  const revokedOthers = await revokeOtherSessions(userId, other.sessionId);
  check(
    "revoking the others keeps the current session",
    revokedOthers >= 1 &&
      (await findActiveSession(hashToken(created.token))) === null &&
      (await findActiveSession(hashToken(other.token))) !== null,
    `${revokedOthers} revoked`,
  );

  check(
    "a session cannot be revoked by a different user",
    !(await revokeSession(other.sessionId, uuidv7())),
    "scoped by user",
  );

  check(
    "the owner can revoke their own session",
    (await revokeSession(other.sessionId, userId)) &&
      (await findActiveSession(hashToken(other.token))) === null,
    "revoked",
  );

  const expiredToken = "expired-session-token";
  const idleToken = "idle-session-token";
  await getDb()
    .insert(t.sessions)
    .values([
      {
        id: uuidv7(),
        userId,
        tokenHash: hashToken(expiredToken),
        deviceLabel: "Past its absolute lifetime",
        clientType: "web",
        userAgentHash: "a".repeat(64),
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        id: uuidv7(),
        userId,
        tokenHash: hashToken(idleToken),
        deviceLabel: "Idle for eight days",
        clientType: "web",
        userAgentHash: "b".repeat(64),
        lastSeenAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);

  check(
    "a session past its absolute expiry is not active",
    (await findActiveSession(hashToken(expiredToken))) === null,
    "expired",
  );
  check(
    "a session idle for too long is not active",
    (await findActiveSession(hashToken(idleToken))) === null,
    "idle",
  );

  /* ------------------------------------------------------- registration */

  const newEmail = "newcomer@example.com";
  const { userId: newUserId } = await createUserWithPassword({
    email: newEmail,
    name: "New Comer",
    passwordHash: await hashPassword("a-long-enough-password"),
    timezone: "UTC",
  });

  const created2 = await findPasswordAccount(newEmail);
  check(
    "a new account can sign in with its password",
    created2 !== null &&
      (await verifyPassword("a-long-enough-password", created2.passwordHash)) &&
      !(await verifyPassword("wrong", created2.passwordHash)),
    newEmail,
  );

  let duplicateRejected = false;
  try {
    await createUserWithPassword({
      email: newEmail,
      name: "Impostor",
      passwordHash: await hashPassword("another-long-password"),
      timezone: "UTC",
    });
  } catch {
    duplicateRejected = true;
  }
  check(
    "a duplicate email is rejected by the unique index",
    duplicateRejected,
    "constraint",
  );

  /* -------------------------------------------- workspace + membership */

  const workspaceId = await createWorkspaceWithOwner({
    name: "Initrode",
    slug: "initrode-smoke",
    ownerId: newUserId,
    ticketPrefix: "INI",
  });

  const owned = await listWorkspacesForUser(newUserId);
  check(
    "creating a workspace makes the creator its owner",
    owned.length === 1 &&
      owned[0]!.id === workspaceId &&
      owned[0]!.role === "owner",
    `${owned[0]?.slug} as ${owned[0]?.role}`,
  );

  const demoWorkspaces = await listWorkspacesForUser(userId);
  check(
    "the new workspace does not leak into another user's list",
    demoWorkspaces.every((workspace) => workspace.id !== workspaceId),
    `${demoWorkspaces.length} workspace(s) for the demo user`,
  );

  const newWorkspace = await getWorkspaceMembers(workspaceId);
  check(
    "a new workspace starts with exactly one member",
    newWorkspace.length === 1 && newWorkspace[0]!.userId === newUserId,
    `${newWorkspace.length} member(s)`,
  );

  /* -------------------------------------------------------------- labels */

  check(
    "a user-agent is summarised for the device list",
    describeDevice(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    ) === "Chrome on Windows",
    describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"),
  );
  check(
    "an IP is stored as a network prefix, not an address",
    ipPrefixFor("203.0.113.42, 70.41.3.18") === "203.0.113",
    String(ipPrefixFor("203.0.113.42, 70.41.3.18")),
  );
  check(
    "the desktop shell is recognised as a desktop client",
    clientTypeFor("Mozilla/5.0 Tauri/2.0") === "desktop" &&
      clientTypeFor("Mozilla/5.0 (Macintosh) Safari/605.1.15") === "web",
    "desktop/web",
  );

  check(
    "an email with no account resolves to no user",
    (await getUserByEmail("nobody@example.com")) === null,
    "unknown email",
  );

  /* ---------------------------------------------------------------- out */

  const failed = checks.filter((entry) => !entry.pass);
  for (const entry of checks) {
    console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.name} — ${entry.detail}`);
  }
  console.log(
    `\n${checks.length - failed.length}/${checks.length} auth checks passed`,
  );
  if (failed.length > 0) throw new Error("auth smoke test failed");
});
