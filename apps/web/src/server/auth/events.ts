import { getDb, rawQuery } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";

export type AuthEventKind =
  | "sign_in"
  | "sign_in_failed"
  | "sign_in_blocked"
  | "totp_failed"
  | "totp_recovery_used"
  | "sign_out"
  | "session_revoked"
  | "sessions_revoked_others"
  | "account_created"
  | "workspace_created"
  | "totp_enrolled"
  | "totp_disabled"
  | "recovery_codes_regenerated";

export async function recordAuthEvent(input: {
  kind: AuthEventKind;
  userId?: string | null;
  email?: string | null;
  ipPrefix?: string | null;
  uaHash?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await getDb()
    .insert(t.authEvents)
    .values({
      id: uuidv7(),
      kind: input.kind,
      userId: input.userId ?? null,
      email: input.email ?? null,
      ipPrefix: input.ipPrefix ?? null,
      uaHash: input.uaHash ?? null,
      detail: input.detail ?? {},
    });
}

/**
 * Failed attempts in the last `seconds`: per address, per network and per user
 * (PREPO.md §9.3, "sign-in 5/min per IP+email"). A second factor gets its own
 * counter, since guessing a six-digit code is its own attack. Reads the
 * append-only log, so throttling needs no separate state to keep in sync.
 */
export async function countRecentFailures(input: {
  email?: string | null;
  ipPrefix?: string | null;
  userId?: string | null;
  seconds: number;
}): Promise<{ byEmail: number; byIp: number; byUser: number }> {
  const rows = await rawQuery<{
    by_email: string | number;
    by_ip: string | number;
    by_user: string | number;
  }>(
    `select
       count(*) filter (where email = $1) as by_email,
       count(*) filter (where coalesce(ip_prefix, '') = $2) as by_ip,
       count(*) filter (where user_id::text = $3) as by_user
     from auth_events
     where kind in ('sign_in_failed', 'totp_failed')
       and created_at > now() - make_interval(secs => $4::int)`,
    [
      input.email ?? null,
      input.ipPrefix ?? "",
      input.userId ?? "",
      input.seconds,
    ],
  );

  return {
    byEmail: Number(rows[0]?.by_email ?? 0),
    byIp: Number(rows[0]?.by_ip ?? 0),
    byUser: Number(rows[0]?.by_user ?? 0),
  };
}
