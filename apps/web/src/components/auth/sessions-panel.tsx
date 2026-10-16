"use client";

import { useFormStatus } from "react-dom";
import { revokeDeviceSession, revokeOtherDevices } from "@/server/auth/actions";

export type SessionView = {
  id: string;
  deviceLabel: string;
  clientType: string;
  ipPrefix: string | null;
  /** Formatted on the server, so the label cannot drift during hydration. */
  lastSeenLabel: string;
  current: boolean;
};

function RevokeButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-[8px] border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
    >
      {pending ? "Revoking…" : label}
    </button>
  );
}

export function SessionsPanel({
  workspace,
  sessions,
}: {
  workspace: string;
  sessions: SessionView[];
}) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-start justify-between gap-3 py-3 first:pt-0"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm">
                {session.deviceLabel}
                {session.current ? (
                  <span className="shrink-0 rounded-full border border-accent-note bg-accent-soft px-2 py-0.5 text-[10px] text-accent-ink">
                    This device
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-text-subtle">
                {session.clientType} · active {session.lastSeenLabel}
                {session.ipPrefix ? ` · ${session.ipPrefix}.x` : ""}
              </p>
            </div>

            <form action={revokeDeviceSession}>
              <input type="hidden" name="workspace" value={workspace} />
              <input type="hidden" name="sessionId" value={session.id} />
              <RevokeButton label={session.current ? "Sign out" : "Revoke"} />
            </form>
          </li>
        ))}
      </ul>

      {sessions.length > 1 ? (
        <form action={revokeOtherDevices}>
          <input type="hidden" name="workspace" value={workspace} />
          <button
            type="submit"
            className="w-full rounded-[10px] border border-border px-3 py-2 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            Sign out every other device
          </button>
        </form>
      ) : null}
    </div>
  );
}
