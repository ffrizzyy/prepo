import { CheckCircle, Clock, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { ESCALATION_LADDER } from "@prepo/shared";
import { Card, PageHeader } from "@/components/app/page-header";
import { ToneSelect } from "@/components/app/settings-controls";
import { formatShortDate } from "@/lib/workspace-data";
import { requireWorkspace } from "@/server/context";
import { listFollowupsView } from "@/server/queries";

const KIND_LABEL: Record<string, string> = {
  reminder: "Reminder (24h before due)",
  nudge: "Overdue nudge",
  digest: "Daily digest",
  escalation: "Escalation to organizer",
};

export default async function FollowupsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const followups = await listFollowupsView(context.id);

  const scheduled = followups.filter((entry) => entry.sentAt === null);
  const sent = followups.filter((entry) => entry.sentAt !== null);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="What the agent will send, and what it already sent."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title={`Scheduled (${scheduled.length})`}>
            {scheduled.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing scheduled. Prepo only chases work that has a date.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {scheduled.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 py-3 first:pt-0"
                  >
                    <Clock
                      size={16}
                      className="mt-0.5 shrink-0 text-accent-ink"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {KIND_LABEL[entry.kind] ?? entry.kind} for{" "}
                        <span className="font-medium">{entry.ticketTitle}</span>
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-text-subtle">
                        {entry.ticketKey} · to {entry.assigneeName ?? "unassigned"}{" "}
                        · {formatShortDate(entry.scheduledFor)} · {entry.channel}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-[10px] border border-border px-2.5 py-1 text-xs text-text-muted hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-text-subtle">
              Any pending message can be edited or cancelled before it sends.
            </p>
          </Card>

          <Card title={`Sent (${sent.length})`}>
            {sent.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing has gone out yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sent.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 py-3 first:pt-0"
                  >
                    <PaperPlaneTilt
                      size={16}
                      className="mt-0.5 shrink-0 text-text-subtle"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {KIND_LABEL[entry.kind] ?? entry.kind}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-text-subtle">
                        {entry.ticketKey} · to {entry.assigneeName ?? "unassigned"}{" "}
                        · {formatShortDate(entry.sentAt)}
                      </p>
                    </div>
                    <CheckCircle
                      size={16}
                      className="shrink-0 text-[#15803d] dark:text-[#4ade80]"
                      aria-hidden
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Escalation ladder">
            <ol className="space-y-4">
              {ESCALATION_LADDER.map((step, index) => (
                <li key={step.when} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-text-muted">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{step.when}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {step.action} · {step.channel}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Tone and quiet hours">
            <p className="text-sm text-text-muted">
              Follow-ups are generated with the ticket context and a tone you
              choose — gentle, neutral, or firm — and respect each
              recipient&apos;s quiet hours in their own timezone.
            </p>
            <div className="mt-4">
              <ToneSelect
                workspace={context.slug}
                value={context.settings.followupTone ?? "neutral"}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
