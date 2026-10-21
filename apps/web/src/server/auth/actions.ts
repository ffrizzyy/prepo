"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "../context";
import {
  createWorkspaceWithOwner,
  listWorkspacesForUser,
  resolveWorkspaceId,
} from "../db/repo";
import {
  consumeRecoveryCode,
  createUserWithPassword,
  disableTotp as disableTotpInDb,
  enableTotp,
  findPasswordAccount,
  getSecurityAccount,
  getUserByEmail,
  storePendingTotpSecret,
  type SecurityAccount,
} from "./accounts";
import {
  clearChallengeCookie,
  clearSessionCookie,
  getSession,
  readChallengeCookie,
  requireUser,
  setChallengeCookie,
  setSessionCookie,
} from "./dal";
import {
  createChallenge,
  deleteChallenge,
  findChallenge,
} from "./challenges";
import { countRecentFailures, recordAuthEvent } from "./events";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";
import {
  createSession,
  revokeOtherSessions,
  revokeSession as revokeSessionRow,
} from "./sessions";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeCode,
  otpauthUrl,
  verifyTotp,
} from "./totp";
import { hashUserAgent } from "./tokens";
import { clientTypeFor, describeDevice, ipPrefixFor } from "./user-agent";

export type AuthFormState = { error: string } | null;

/** Sign-in is two steps when the account has a second factor. */
export type SignInState = { stage: "credentials" | "totp"; error: string | null };

export type TotpEnrolment =
  | { ok: true; secret: string; otpauth: string }
  | { ok: false; error: string };

export type TotpConfirmed =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: string };

export type TotpDisabled = { ok: true } | { ok: false; error: string };

const PASSWORD_MIN = 12;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Five attempts per minute for one address, twenty for one network (§9.3). */
const LIMITS = { perEmail: 5, perIp: 20, windowSeconds: 60 };

/** Deliberately identical for every failure mode, so responses cannot probe. */
const GENERIC_FAILURE = "Email or password is incorrect.";
const EXPIRED_CHALLENGE = "Your sign-in attempt expired. Start again.";
const CODE_MISMATCH =
  "That code did not match. Codes rotate every 30 seconds, try the current one.";
const THROTTLED = "Too many attempts. Wait a minute and try again.";

async function deviceContext() {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") ?? "";
  return {
    deviceLabel: describeDevice(userAgent),
    clientType: clientTypeFor(userAgent),
    uaHash: hashUserAgent(userAgent),
    ipPrefix: ipPrefixFor(headerList.get("x-forwarded-for")),
  };
}

async function defaultLanding(userId: string): Promise<string> {
  const workspaces = await listWorkspacesForUser(userId);
  const first = workspaces[0];
  return first ? `/${first.slug}` : "/new";
}

/** Only same-origin absolute paths, so `next` cannot become an open redirect. */
function safeNext(value: string): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return null;
  }
  try {
    // Browsers treat a backslash as a slash in special schemes; the check above
    // rejects it, and this parses the rest against a fixed origin so a value
    // that somehow escapes still cannot become another host.
    const parsed = new URL(value, "http://prepo.invalid");
    if (parsed.origin !== "http://prepo.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** Issues a session and hands the browser its cookie. Always redirects. */
async function startSession(input: {
  userId: string;
  email: string;
  next?: string | null;
  factor?: "password" | "totp" | "recovery";
}): Promise<never> {
  const device = await deviceContext();
  const session = await createSession({
    userId: input.userId,
    deviceLabel: device.deviceLabel,
    clientType: device.clientType,
    userAgentHash: device.uaHash,
    ipPrefix: device.ipPrefix,
  });

  await recordAuthEvent({
    kind: "sign_in",
    userId: input.userId,
    email: input.email,
    ipPrefix: device.ipPrefix,
    uaHash: device.uaHash,
    detail: { device: device.deviceLabel, factor: input.factor ?? "password" },
  });

  await setSessionCookie(session.token, session.expiresAt);
  redirect(input.next ?? (await defaultLanding(input.userId)));
}

/* ---------------------------------------------------------------- sign in */

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  // A live challenge means the password has already checked out and the second
  // factor is what is being asked for.
  const challengeToken = await readChallengeCookie();
  if (challengeToken) {
    return completeTotpStep({
      token: challengeToken,
      code: String(formData.get("code") ?? ""),
      next: String(formData.get("next") ?? ""),
    });
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1).max(200) })
    .safeParse({ email, password });
  if (!parsed.success) return { stage: "credentials", error: "Enter your email and password." };

  const device = await deviceContext();
  const failures = await countRecentFailures({
    email,
    ipPrefix: device.ipPrefix,
    seconds: LIMITS.windowSeconds,
  });

  if (failures.byEmail >= LIMITS.perEmail || failures.byIp >= LIMITS.perIp) {
    await recordAuthEvent({
      kind: "sign_in_blocked",
      email,
      ipPrefix: device.ipPrefix,
      uaHash: device.uaHash,
      detail: { byEmail: failures.byEmail, byIp: failures.byIp },
    });
    return { stage: "credentials", error: THROTTLED };
  }

  const account = await findPasswordAccount(email);
  let valid = false;
  if (account) {
    valid = await verifyPassword(password, account.passwordHash);
  } else {
    // Same work as a real verification, so timing does not reveal existence.
    await verifyPassword(password, await dummyPasswordHash());
  }

  if (!account || !valid) {
    await recordAuthEvent({
      kind: "sign_in_failed",
      userId: account?.userId ?? null,
      email,
      ipPrefix: device.ipPrefix,
      uaHash: device.uaHash,
    });
    return { stage: "credentials", error: GENERIC_FAILURE };
  }

  // The password is right, but this account proves a second factor before it
  // gets a session. The challenge carries no authority of its own.
  if (account.totpEnabled) {
    const challenge = await createChallenge({ userId: account.userId });
    await setChallengeCookie(challenge.token, challenge.expiresAt);
    return { stage: "totp", error: null };
  }

  await clearChallengeCookie();
  // `return await` so the compiler sees the redirect as the way out.
  return await startSession({
    userId: account.userId,
    email,
    next: safeNext(next),
  });
}

/**
 * The second step: either a six-digit code from the authenticator, or one of the
 * account's recovery codes, which is consumed by being used.
 */
async function completeTotpStep(input: {
  token: string;
  code: string;
  next: string;
}): Promise<SignInState> {
  const challenge = await findChallenge(input.token);
  if (!challenge) {
    await clearChallengeCookie();
    return { stage: "credentials", error: EXPIRED_CHALLENGE };
  }

  const account = await getSecurityAccount(challenge.userId);
  if (!account?.totpEnabled || !account.totpSecret) {
    await deleteChallenge(input.token);
    await clearChallengeCookie();
    return { stage: "credentials", error: GENERIC_FAILURE };
  }

  const failures = await countRecentFailures({
    userId: challenge.userId,
    seconds: LIMITS.windowSeconds,
  });
  if (failures.byUser >= LIMITS.perEmail) {
    await recordAuthEvent({
      kind: "totp_failed",
      userId: challenge.userId,
      email: account.email,
      detail: { stage: "sign_in", throttled: true },
    });
    return { stage: "totp", error: THROTTLED };
  }

  const clean = normalizeCode(input.code);
  const isDigitCode = /^\d{6}$/.test(clean);
  const accepted = isDigitCode
    ? verifyTotp(account.totpSecret, clean)
    : await consumeRecoveryCode(challenge.userId, hashRecoveryCode(clean));

  if (!accepted) {
    await recordAuthEvent({
      kind: "totp_failed",
      userId: challenge.userId,
      email: account.email,
      detail: { stage: "sign_in", kind: isDigitCode ? "totp" : "recovery" },
    });
    return {
      stage: "totp",
      error: isDigitCode
        ? CODE_MISMATCH
        : "That recovery code has already been used or is not one of yours.",
    };
  }

  if (!isDigitCode) {
    await recordAuthEvent({
      kind: "totp_recovery_used",
      userId: challenge.userId,
      email: account.email,
    });
  }

  await deleteChallenge(input.token);
  await clearChallengeCookie();
  return await startSession({
    userId: challenge.userId,
    email: account.email,
    next: safeNext(input.next),
    factor: isDigitCode ? "totp" : "recovery",
  });
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const timezone = String(formData.get("timezone") ?? "").slice(0, 64);

  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address." };
  }
  if (name.length < 2 || name.length > 80) {
    return { error: "Enter your name (2–80 characters)." };
  }
  if (password.length < PASSWORD_MIN || password.length > 200) {
    return { error: `Use a password of at least ${PASSWORD_MIN} characters.` };
  }
  if (await getUserByEmail(email)) {
    return { error: "That email already has an account. Sign in instead." };
  }

  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    ({ userId } = await createUserWithPassword({
      email,
      name,
      passwordHash,
      timezone: timezone || "UTC",
    }));
  } catch {
    // The unique index on users.email is the real guard against a race.
    return { error: "That email already has an account. Sign in instead." };
  }

  await recordAuthEvent({ kind: "account_created", userId, email });
  return await startSession({ userId, email });
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session) {
    await revokeSessionRow(session.id, session.userId);
    await recordAuthEvent({
      kind: "sign_out",
      userId: session.userId,
      email: session.user.email,
      ipPrefix: session.ipPrefix,
      uaHash: session.userAgentHash,
    });
  }

  await clearSessionCookie();
  redirect("/sign-in");
}

/* --------------------------------------------------------------- sessions */

/** Revokes one of the signed-in user's own sessions. */
export async function revokeDeviceSession(formData: FormData): Promise<void> {
  const context = await requireWorkspace(
    String(formData.get("workspace") ?? ""),
  );
  const session = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!UUID_RE.test(sessionId)) return;

  const revoked = await revokeSessionRow(sessionId, session.userId);
  if (revoked) {
    await recordAuthEvent({
      kind: "session_revoked",
      userId: session.userId,
      email: session.user.email,
      detail: { sessionId },
    });
  }

  // Revoking the session you are holding is a sign-out.
  if (sessionId === session.id) {
    await clearSessionCookie();
    redirect("/sign-in");
  }

  revalidatePath(`/${context.slug}/settings`);
}

export async function revokeOtherDevices(formData: FormData): Promise<void> {
  const context = await requireWorkspace(
    String(formData.get("workspace") ?? ""),
  );
  const session = await requireUser();

  const count = await revokeOtherSessions(session.userId, session.id);
  if (count > 0) {
    await recordAuthEvent({
      kind: "sessions_revoked_others",
      userId: session.userId,
      email: session.user.email,
      detail: { count },
    });
  }

  revalidatePath(`/${context.slug}/settings`);
}

/* ------------------------------------------------- two-factor enrolment */

/**
 * Shared by confirmation, turning the factor off and regenerating codes: the
 * caller must present the code their authenticator shows right now.
 */
async function verifyPresentCode(input: {
  account: SecurityAccount;
  code: string;
  stage: string;
}): Promise<string | null> {
  const failures = await countRecentFailures({
    userId: input.account.userId,
    seconds: LIMITS.windowSeconds,
  });
  if (failures.byUser >= LIMITS.perEmail) return THROTTLED;

  const clean = normalizeCode(input.code);
  const valid =
    /^\d{6}$/.test(clean) && verifyTotp(input.account.totpSecret!, clean);
  if (!valid) {
    await recordAuthEvent({
      kind: "totp_failed",
      userId: input.account.userId,
      email: input.account.email,
      detail: { stage: input.stage },
    });
    return CODE_MISMATCH;
  }
  return null;
}

/**
 * Issues a secret and stores it, but the factor is not on yet: it is switched on
 * by `confirmTotpEnrolment`, once a code from the authenticator has checked out.
 */
export async function startTotpEnrolment(): Promise<TotpEnrolment> {
  const session = await requireUser();
  const account = await getSecurityAccount(session.userId);
  if (!account) return { ok: false, error: "This account has no password set up." };
  if (account.totpEnabled) return { ok: false, error: "Two-factor is already on." };

  const secret = generateTotpSecret();
  await storePendingTotpSecret(session.userId, secret);
  return { ok: true, secret, otpauth: otpauthUrl(session.user.email, secret) };
}

export async function confirmTotpEnrolment(code: string): Promise<TotpConfirmed> {
  const session = await requireUser();
  const account = await getSecurityAccount(session.userId);
  if (!account?.totpSecret || account.totpEnabled) {
    return { ok: false, error: "Start the set-up again." };
  }

  const error = await verifyPresentCode({
    account,
    code,
    stage: "confirm",
  });
  if (error) return { ok: false, error };

  const recoveryCodes = generateRecoveryCodes();
  await enableTotp({
    userId: session.userId,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
  });

  await recordAuthEvent({
    kind: "totp_enrolled",
    userId: session.userId,
    email: account.email,
  });
  return { ok: true, recoveryCodes };
}

export async function turnOffTotp(code: string): Promise<TotpDisabled> {
  const session = await requireUser();
  const account = await getSecurityAccount(session.userId);
  if (!account?.totpEnabled) return { ok: false, error: "Two-factor is not on." };

  const error = await verifyPresentCode({
    account,
    code,
    stage: "disable",
  });
  if (error) return { ok: false, error };

  await disableTotpInDb(session.userId);
  await recordAuthEvent({
    kind: "totp_disabled",
    userId: session.userId,
    email: account.email,
  });
  return { ok: true };
}

export async function regenerateRecoveryCodes(code: string): Promise<TotpConfirmed> {
  const session = await requireUser();
  const account = await getSecurityAccount(session.userId);
  if (!account?.totpEnabled || !account.totpSecret) {
    return { ok: false, error: "Two-factor is not on." };
  }

  const error = await verifyPresentCode({
    account,
    code,
    stage: "regenerate",
  });
  if (error) return { ok: false, error };

  const recoveryCodes = generateRecoveryCodes();
  await enableTotp({
    userId: session.userId,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
  });

  await recordAuthEvent({
    kind: "recovery_codes_regenerated",
    userId: session.userId,
    email: account.email,
  });
  return { ok: true, recoveryCodes };
}

/* --------------------------------------------------------- workspace setup */

function prefixFor(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 3).padEnd(2, "X");
}

async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace";

  let candidate = base;
  for (let suffix = 2; suffix < 50; suffix += 1) {
    if (!(await resolveWorkspaceId(candidate))) return candidate;
    candidate = `${base}-${suffix}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createWorkspace(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const session = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    return { error: "Give the workspace a name (2–80 characters)." };
  }

  const slug = await uniqueSlug(name);
  const workspaceId = await createWorkspaceWithOwner({
    name,
    slug,
    ownerId: session.userId,
    ticketPrefix: prefixFor(name),
  });

  await recordAuthEvent({
    kind: "workspace_created",
    userId: session.userId,
    email: session.user.email,
    detail: { workspaceId, slug },
  });

  redirect(`/${slug}`);
}
