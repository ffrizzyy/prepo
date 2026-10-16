import { getDb, rawQuery } from "../db/client";
import { uuidv7 } from "../db/ids";
import * as t from "../db/schema";

export type AuthEventKind =
  | "sign_in"
  | "sign_in_failed"
  | "sign_in_blocked"
  | "sign_out"
  | "session_revoked"
  | "sessions_revoked_others"
  | "account_created"
  | "workspace_created";

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
 * Failed sign-ins in the last `seconds`, counted per address and per network
 * (PREPO.md §9.3, "sign-in 5/min per IP+email"). Reads the append-only log, so
 * throttling needs no separate state to keep in sync.
 */
export async function countRecentFailures(input: {
  email: string | null;
  ipPrefix: string | null;
  seconds: number;
}): Promise<{ byEmail: number; byIp: number }> {
  const rows = await rawQuery<{ by_email: string | number; by_ip: string | number }>(
    `select
       count(*) filter (where email = $1) as by_email,
       count(*) filter (where coalesce(ip_prefix, '') = $2) as by_ip
     from auth_events
     where kind = 'sign_in_failed'
       and created_at > now() - make_interval(secs => $3::int)`,
    [input.email, input.ipPrefix ?? "", input.seconds],
  );

  return {
    byEmail: Number(rows[0]?.by_email ?? 0),
    byIp: Number(rows[0]?.by_ip ?? 0),
  };
}
