import { CheckCircle, Clock, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { ESCALATION_LADDER } from "@prepo/shared";
import { Card, PageHeader } from "@/components/app/page-header";
import { formatShortDate, getTickets } from "@/lib/workspace-data";

const SENT = [
  { ticket: "PRE-142", to: "Priya Nair", kind: "Reminder (24h before due)", when: "today 09:00" },
  { ticket: "PRE-145", to: "Priya Nair", kind: "On the due day", when: "today 09:00" },
  { ticket: "PRE-139", to: "Priya Nair", kind: "Overdue +1 day nudge", when: "yesterday" },
  { ticket: "PRE-118", to: "Dana Okafor", kind: "Escalation to organizer", when: "Mon 08:30" },
];

export default async function FollowupsPage() {
  const scheduled = getTickets()
    .filter((ticket) => ticket.status !== "done" && ticket.dueAt)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="What the agent will send, and what it already sent."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Scheduled">
            <ul className="divide-y divide-border">
              {scheduled.map((ticket) => (
                <li key={ticket.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <Clock size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      Reminder for{" "}
                      <span className="font-medium">{ticket.title}</span>
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-text-subtle">
                      {ticket.key} · to {ticket.assigneeName ?? "unassigned"} ·{" "}
                      {formatShortDate(ticket.dueAt)}
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
            <p className="mt-4 text-xs text-text-subtle">
              Any pending message can be edited or cancelled before it sends.
            </p>
          </Card>

          <Card title="Sent">
            <ul className="divide-y divide-border">
              {SENT.map((entry) => (
                <li key={entry.ticket + entry.kind} className="flex items-start gap-3 py-3 first:pt-0">
                  <PaperPlaneTilt size={16} className="mt-0.5 shrink-0 text-text-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{entry.kind}</p>
                    <p className="mt-1 font-mono text-[10px] text-text-subtle">
                      {entry.ticket} · to {entry.to} · {entry.when}
                    </p>
                  </div>
                  <CheckCircle size={16} className="shrink-0 text-[#15803d] dark:text-[#4ade80]" aria-hidden />
                </li>
              ))}
            </ul>
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
              Follow-ups are generated with the ticket context and a tone you choose —
              gentle, neutral, or firm — and respect each recipient&apos;s quiet hours in
              their own timezone.
            </p>
            <div className="mt-4 inline-flex rounded-[10px] border border-border bg-surface-2 p-1 text-sm">
              {["Gentle", "Neutral", "Firm"].map((tone) => (
                <span
                  key={tone}
                  className={
                    tone === "Neutral"
                      ? "rounded-[8px] bg-surface px-3 py-1.5 shadow-sm"
                      : "px-3 py-1.5 text-text-muted"
                  }
                >
                  {tone}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
