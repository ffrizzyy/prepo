import { Card, PageHeader } from "@/components/app/page-header";
import { AUTONOMY_LEVELS } from "@prepo/shared";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { title: "Profile", body: "Name, avatar, timezone, notification preferences." },
  { title: "Security", body: "Password, TOTP 2FA, passkeys, recovery codes." },
  { title: "Devices & sessions", body: "Signed-in devices with revoke one or revoke all others." },
  { title: "Integrations", body: "Linear OAuth, team and project mapping." },
  { title: "API & webhooks", body: "Scoped API keys and outbound HMAC-signed webhooks." },
  { title: "Audit log", body: "Append-only, searchable, exportable (admins)." },
  { title: "Data", body: "Export the workspace, delete a meeting and everything derived from it." },
  { title: "Billing", body: "Out of scope for v1." },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace behaviour, the agent's autonomy, and your data."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="AI autonomy">
          <fieldset>
            <legend className="sr-only">Autonomy level</legend>
            <div className="space-y-3">
              {AUTONOMY_LEVELS.map((level) => (
                <label
                  key={level.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-[10px] border p-4",
                    level.id === "suggest"
                      ? "border-accent bg-accent-soft/40"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="autonomy"
                    defaultChecked={level.id === "suggest"}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{level.name}</span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {level.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-xs text-text-subtle">
            Autopilot still logs every external side effect and keeps every action
            reversible.
          </p>
        </Card>

        <div className="space-y-6">
          <Card title="Workspace">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-muted">Name</dt>
                <dd>Northwind Studio</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-muted">Slug</dt>
                <dd className="font-mono text-xs">northwind</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-muted">Audio retention</dt>
                <dd>30 days after transcription</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-muted">Transcription minutes</dt>
                <dd className="font-mono text-xs">128 / 300</dd>
              </div>
            </dl>
          </Card>

          <Card title="More">
            <ul className="space-y-3">
              {SECTIONS.map((section) => (
                <li key={section.title} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium">{section.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{section.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
