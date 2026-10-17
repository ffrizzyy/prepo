import { Card, PageHeader } from "@/components/app/page-header";
import {
  AutonomySelect,
  RetentionSelect,
  ToneSelect,
} from "@/components/app/settings-controls";
import {
  SessionsPanel,
  type SessionView,
} from "@/components/auth/sessions-panel";
import { TwoFactorPanel } from "@/components/auth/two-factor-panel";
import {
  DEFAULT_AUDIO_RETENTION_DAYS,
} from "@/server/audio/retention";
import {
  DEFAULT_TRANSCRIPTION_MINUTES_CAP,
} from "@/server/audio/ingest";
import { transcriptionProvider } from "@/server/audio/transcribe";
import { requireUser } from "@/server/auth/dal";
import { signOut } from "@/server/auth/actions";
import { getSecurityAccount } from "@/server/auth/accounts";
import { listSessionsForUser } from "@/server/auth/sessions";
import { requireWorkspace } from "@/server/context";
import { getTranscriptionUsage } from "@/server/queries";
import { relativeTime } from "@/lib/workspace-data";

const SECTIONS = [
  {
    title: "Profile",
    body: "Name, avatar, timezone, notification preferences.",
  },
  { title: "Integrations", body: "Linear OAuth, team and project mapping." },
  {
    title: "API & webhooks",
    body: "Scoped API keys and outbound HMAC-signed webhooks.",
  },
  {
    title: "Audit log",
    body: "Append-only, searchable, exportable (admins).",
  },
  {
    title: "Data",
    body: "Export the workspace, delete a meeting and everything derived from it.",
  },
  { title: "Billing", body: "Out of scope for v1." },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const session = await requireUser();

  // The security card needs the account's second-factor state, not the
  // workspace's.
  const security = await getSecurityAccount(session.userId);

  // Transcription is metered per workspace so a runaway import cannot spend
  // without bound, and Settings is where that is visible.
  const [usage, provider] = [
    await getTranscriptionUsage(context.id),
    transcriptionProvider(),
  ];

  // Every sign-in is its own row, so this list *is* the device list (§9.1).
  const sessions: SessionView[] = (
    await listSessionsForUser(session.userId)
  ).map((row) => ({
    id: row.id,
    deviceLabel: row.deviceLabel,
    clientType: row.clientType,
    ipPrefix: row.ipPrefix,
    lastSeenLabel: relativeTime(row.lastSeenAt.toISOString()),
    current: row.id === session.id,
  }));
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace behaviour, the agent's autonomy, and your data."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Workspace">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Name</dt>
                <dd>{context.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">URL</dt>
                <dd className="font-mono text-xs">/{context.slug}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Ticket prefix</dt>
                <dd className="font-mono text-xs">
                  {context.settings.ticketPrefix ?? "PRE"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Signed in as</dt>
                <dd>
                  {context.viewer.name}
                  <span className="ml-2 text-xs text-text-subtle">
                    {ROLE_LABEL[context.viewer.role] ?? context.viewer.role}
                  </span>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-text-subtle">
              Signed in as {context.viewer.email}. Your role here decides what
              you can change.
            </p>
          </Card>

          <Card title="Agent autonomy">
            <AutonomySelect
              workspace={context.slug}
              value={context.settings.autonomy ?? "suggest"}
            />
          </Card>

          <Card title="Follow-up tone">
            <ToneSelect
              workspace={context.slug}
              value={context.settings.followupTone ?? "neutral"}
            />
            <p className="mt-4 text-xs text-text-subtle">
              Quiet hours:{" "}
              {context.settings.quietHours
                ? `${context.settings.quietHours.from}–${context.settings.quietHours.to}`
                : "off"}
              .
            </p>
          </Card>

          <Card title="Audio & transcription">
            <RetentionSelect
              workspace={context.slug}
              value={context.settings.audioRetentionDays ?? DEFAULT_AUDIO_RETENTION_DAYS}
            />
            <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Speech-to-text</dt>
                <dd className="text-xs">
                  {provider ? (
                    <span className="font-mono">{provider.name}</span>
                  ) : (
                    <span className="text-text-subtle">not configured</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Transcribed this month</dt>
                <dd className="font-mono text-xs">
                  {usage.minutes.toFixed(1)} / {DEFAULT_TRANSCRIPTION_MINUTES_CAP} min
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-text-subtle">
              {provider
                ? "Recordings are sent to the provider above and the segments come back with speaker labels. The clock for the setting you picked starts when the transcript is stored."
                : "No provider is configured, so recordings are stored and never sent anywhere. Upload a transcript or paste the minutes to keep working; set DEEPGRAM_API_KEY to switch transcription on."}
            </p>
          </Card>

          <Card title="Members">
            <ul className="divide-y divide-border">
              {context.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{member.name}</p>
                    <p className="mt-0.5 truncate text-xs text-text-subtle">
                      {member.email}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                    {ROLE_LABEL[member.role] ?? member.role}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Two-factor sign-in">
            <TwoFactorPanel enabled={security?.totpEnabled ?? false} />
          </Card>

          <Card title="Devices & sessions">
            <SessionsPanel workspace={context.slug} sessions={sessions} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="max-w-[46ch] text-xs text-text-subtle">
                Every sign-in creates its own session. Revoking one takes effect
                on that device&rsquo;s next request.
              </p>
              <form action={signOut}>
                <button
                  type="submit"
                  className="shrink-0 rounded-[8px] border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
                >
                  Sign out
                </button>
              </form>
            </div>
          </Card>
        </div>

        <Card title="Planned sections">
          <ul className="divide-y divide-border">
            {SECTIONS.map((section) => (
              <li key={section.title} className="py-3 first:pt-0">
                <p className="text-sm font-medium">{section.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">{section.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
