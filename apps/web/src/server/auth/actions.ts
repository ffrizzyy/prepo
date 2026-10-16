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
  createUserWithPassword,
  findPasswordAccount,
  getUserByEmail,
} from "./accounts";
import { clearSessionCookie, getSession, requireUser, setSessionCookie } from "./dal";
import { countRecentFailures, recordAuthEvent } from "./events";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";
import {
  createSession,
  revokeOtherSessions,
  revokeSession as revokeSessionRow,
} from "./sessions";
import { hashUserAgent } from "./tokens";
import { clientTypeFor, describeDevice, ipPrefixFor } from "./user-agent";

export type AuthFormState = { error: string } | null;

const PASSWORD_MIN = 12;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Five attempts per minute for one address, twenty for one network (§9.3). */
const LIMITS = { perEmail: 5, perIp: 20, windowSeconds: 60 };

/** Deliberately identical for every failure mode, so responses cannot probe. */
const GENERIC_FAILURE = "Email or password is incorrect.";

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
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/** Issues a session and hands the browser its cookie. Always redirects. */
async function startSession(input: {
  userId: string;
  email: string;
  next?: string | null;
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
    detail: { device: device.deviceLabel },
  });

  await setSessionCookie(session.token, session.expiresAt);
  redirect(input.next ?? (await defaultLanding(input.userId)));
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1).max(200) })
    .safeParse({ email, password });
  if (!parsed.success) return { error: "Enter your email and password." };

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
    return { error: "Too many attempts. Wait a minute and try again." };
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
    return { error: GENERIC_FAILURE };
  }

  // `return await` so the compiler sees the redirect as the way out.
  return await startSession({
    userId: account.userId,
    email,
    next: safeNext(next),
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
