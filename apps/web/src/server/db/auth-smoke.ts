/**
 * Exercises the authentication core exactly the way the sign-in action does:
 * password hashing, throttling, per-device sessions, revocation and workspace
 * membership. Reseeds first so it is repeatable:
 *   pnpm --filter @prepo/web db:auth
 */
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";
import { seed } from "./seed";
import * as t from "./schema";
import {
  consumeRecoveryCode,
  createUserWithPassword,
  disableTotp as disableTotpInDb,
  enableTotp,
  findPasswordAccount,
  getSecurityAccount,
  getUserByEmail,
  storePendingTotpSecret,
} from "../auth/accounts";
import {
  createChallenge,
  deleteChallenge,
  findChallenge,
} from "../auth/challenges";
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
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeCode,
  totpAt,
  verifyTotp,
} from "../auth/totp";
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

  /* ------------------------------------------------------------------ totp */

  // RFC 4648 round-trip, and the exact secret RFC 6238's vectors are computed
  // over (the 20 ASCII bytes "12345678901234567890").
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
  check(
    "base32 encoding matches the RFC's own key material",
    rfcSecret === "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" &&
      base32Decode(rfcSecret).toString("ascii") === "12345678901234567890",
    rfcSecret,
  );

  // The six vectors from RFC 6238, Appendix B, for SHA-1 and eight digits.
  const rfcVectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [at, code] of rfcVectors) {
    check(
      `RFC 6238 vector at t=${at}`,
      totpAt(rfcSecret, at, 8) === code,
      `${totpAt(rfcSecret, at, 8)} vs ${code}`,
    );
  }

  const liveSecret = generateTotpSecret();
  const now = Math.floor(Date.now() / 1000);
  check(
    "a freshly generated secret is 32 base32 characters",
    liveSecret.length === 32 && /^[A-Z2-7]+$/.test(liveSecret),
    `${liveSecret.length} chars`,
  );
  check(
    "the current code verifies",
    verifyTotp(liveSecret, totpAt(liveSecret, now)),
    "±0 steps",
  );
  check(
    "one step back still verifies (the ±1 window)",
    verifyTotp(liveSecret, totpAt(liveSecret, now - 30)),
    "-30s",
  );
  check(
    "three steps back does not",
    !verifyTotp(liveSecret, totpAt(liveSecret, now - 90)),
    "-90s",
  );
  check(
    "a code of the wrong shape is refused",
    !verifyTotp(liveSecret, "12345") && !verifyTotp(liveSecret, "12ab45"),
    "shape",
  );

  /* ------------------------------------------------- enrolment round-trip */

  const codes = generateRecoveryCodes();
  check(
    "recovery codes come as eight XXXXX-XXXXX strings",
    codes.length === 8 &&
      codes.every((code) => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(code)) &&
      new Set(codes).size === 8,
    codes[0]!,
  );
  check(
    "recovery hashes survive case, spacing and dash differences",
    hashRecoveryCode(codes[0]!.replace("-", "").toLowerCase()) ===
      hashRecoveryCode(codes[0]!),
    normalizeCode(codes[0]!),
  );

  let security = await getSecurityAccount(newUserId);
  check(
    "a fresh account has no second factor",
    security !== null &&
      !security.totpEnabled &&
      security.totpSecret === null &&
      security.recoveryCodeHashes.length === 0,
    "off",
  );

  const enrolSecret = generateTotpSecret();
  await storePendingTotpSecret(newUserId, enrolSecret);
  security = await getSecurityAccount(newUserId);
  check(
    "a stored secret alone does not switch the factor on",
    security?.totpSecret === enrolSecret && security.totpEnabled === false,
    "pending",
  );

  await enableTotp({
    userId: newUserId,
    recoveryCodeHashes: codes.map(hashRecoveryCode),
  });
  security = await getSecurityAccount(newUserId);
  check(
    "confirming turns the factor on and stores hashed codes",
    security?.totpEnabled === true &&
      security.recoveryCodeHashes.length === 8 &&
      security.recoveryCodeHashes[0] !== codes[0],
    "on",
  );
  check(
    "a live 6-digit code from the secret verifies (the sign-in check)",
    security !== null && verifyTotp(security.totpSecret!, totpAt(enrolSecret, now)),
    "totp",
  );
  check(
    "a code from a different secret does not",
    !verifyTotp(enrolSecret, totpAt(liveSecret, now)),
    "foreign secret",
  );

  check(
    "an unknown recovery code consumes nothing",
    !(await consumeRecoveryCode(newUserId, hashRecoveryCode("ZZZZZ-ZZZZZ"))),
    "rejected",
  );
  check(
    "a recovery code is consumed by being used",
    (await consumeRecoveryCode(newUserId, hashRecoveryCode(codes[0]!))) &&
      (await consumeRecoveryCode(newUserId, hashRecoveryCode(codes[0]!))) ===
        false,
    "once",
  );
  security = await getSecurityAccount(newUserId);
  check(
    "the spent code is gone from the stored hashes",
    security?.recoveryCodeHashes.length === 7,
    "7 left",
  );

  await disableTotpInDb(newUserId);
  security = await getSecurityAccount(newUserId);
  check(
    "turning the factor off clears the secret and the codes",
    security?.totpEnabled === false &&
      security.totpSecret === null &&
      security.recoveryCodeHashes.length === 0,
    "off",
  );

  /* ------------------------------------------------------------ challenges */

  const challenge = await createChallenge({ userId: newUserId });
  const challengeRow = await findChallenge(challenge.token);
  check(
    "a challenge resolves by token to its user",
    challengeRow?.userId === newUserId,
    "found",
  );
  check(
    "a challenge is spent on deletion and strangers' tokens find nothing",
    (await findChallenge("a-token-that-never-existed")) === null &&
      (await deleteChallenge(challenge.token), true),
    "deleted",
  );
  check(
    "a deleted challenge cannot be used",
    (await findChallenge(challenge.token)) === null,
    "gone",
  );

  const expiring = await createChallenge({ userId: newUserId });
  const expiresNow = new Date(Date.now() - 1000);
  await getDb()
    .update(t.loginChallenges)
    .set({ expiresAt: expiresNow })
    .where(
      // Only this challenge: its hash is the only identifying column stored.
      eq(t.loginChallenges.tokenHash, hashToken(expiring.token)),
    );
  check(
    "an expired challenge is not usable",
    (await findChallenge(expiring.token)) === null,
    "expired",
  );

  await recordAuthEvent({
    kind: "totp_failed",
    userId: newUserId,
    email: newEmail,
  });
  const perUser = await countRecentFailures({
    userId: newUserId,
    seconds: 60,
  });
  check(
    "second-factor failures throttle per user",
    perUser.byUser === 1,
    String(perUser.byUser),
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
    console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.name}, ${entry.detail}`);
  }
  console.log(
    `\n${checks.length - failed.length}/${checks.length} auth checks passed`,
  );
  if (failed.length > 0) throw new Error("auth smoke test failed");
}, "fresh");
