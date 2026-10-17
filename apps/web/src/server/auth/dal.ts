import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findActiveSession, touchSession, type ActiveSession } from "./sessions";
import { hashToken } from "./tokens";

const isProduction = process.env.NODE_ENV === "production";

/**
 * `__Host-` is the strictest cookie shape available (secure, path `/`, no
 * domain), but browsers only send it over HTTPS. Development runs on plain
 * http, including over the LAN, so the prefix is reserved for production and the
 * cookie is always HttpOnly, SameSite=Lax and Path=/ (PREPO.md §9.3.1).
 */
export const SESSION_COOKIE = isProduction
  ? "__Host-prepo_session"
  : "prepo_session";

/**
 * Carries a half-completed sign-in: the password checked out, the second factor
 * has not been presented. Five minutes, no authority, and worthless without the
 * account's authenticator.
 */
export const CHALLENGE_COOKIE = isProduction
  ? "__Host-prepo_challenge"
  : "prepo_challenge";

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/**
 * The single place a request becomes authenticated. Cached per render pass so a
 * layout and its page share one lookup. The session is verified against the
 * database, not merely decoded from the cookie.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await findActiveSession(hashToken(token));
  if (!session) return null;

  // Sliding idle window; the write itself is throttled inside touchSession.
  await touchSession(session.id);
  return session;
});

export const requireUser = cache(async (): Promise<ActiveSession> => {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
});

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readChallengeCookie(): Promise<string | null> {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value ?? null;
}

export async function setChallengeCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearChallengeCookie(): Promise<void> {
  const store = await cookies();
  // Only when present, so a plain sign-in does not emit a pointless expiry
  // header alongside the session cookie.
  if (store.get(CHALLENGE_COOKIE)) store.delete(CHALLENGE_COOKIE);
}
