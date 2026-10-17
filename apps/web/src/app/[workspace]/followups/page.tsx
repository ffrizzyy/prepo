import { CheckCircle, Clock, Prohibit, Warning } from "@phosphor-icons/react/dist/ssr";
import { Card, PageHeader } from "@/components/app/page-header";
import {
  DigestWeekdaySelect,
  FollowupsToggle,
  PendingFollowup,
} from "@/components/app/followup-controls";
import { ToneSelect } from "@/components/app/settings-controls";
import { emailSender } from "@/server/followups/channels";
import {
  LADDER,
  LADDER_CHANNEL_LABEL,
  labelFor,
  type FollowupChannel,
} from "@/server/followups/ladder";
import { weekdayName } from "@/server/followups/quiet";
import { requireWorkspace } from "@/server/context";
import { listFollowupsView, type FollowupView } from "@/server/queries";
import { formatShortDate } from "@/lib/workspace-data";

/** The rung a row belongs to, in words: "Overdue +1 day", "Weekly digest". */
function rungLabel(entry: FollowupView): string {
  return labelFor(
    entry.kind,
    new Date(entry.scheduledFor),
    entry.ticketDueAt ? new Date(entry.ticketDueAt) : null,
  );
}

function OutcomeIcon({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <CheckCircle
        size={16}
        className="mt-0.5 shrink-0 text-[#15803d] dark:text-[#4ade80]"
        aria-hidden
      />
    );
  }
  if (status === "failed") {
    return (
      <Warning
        size={16}
        className="mt-0.5 shrink-0 text-accent-ink"
        aria-hidden
      />
    );
  }
  return (
    <Prohibit
      size={16}
      className="mt-0.5 shrink-0 text-text-subtle"
      aria-hidden
    />
  );
}

export default async function FollowupsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const followups = await listFollowupsView(context.id);

  const scheduled = followups.filter((entry) => entry.status === "scheduled");
  const settled = followups.filter((entry) => entry.status !== "scheduled");
  const failed = settled.filter((entry) => entry.status === "failed");

  const emailConfigured = emailSender() !== null;
  const chasingOn = context.settings.followups !== "off";
  const weekday = context.settings.digestWeekday ?? 1;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="What the agent will send, and what it already sent — every row here is a real message, not an example."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!emailConfigured ? (
            <div className="rounded-2xl border border-accent-note bg-accent-soft/60 px-4 py-3 text-xs text-accent-ink">
              <p className="font-medium">Email is not configured on this deployment.</p>
              <p className="mt-1">
                In-app messages are delivered to the notification centre. Anything
                that needs email is marked <span className="font-mono">failed</span>{" "}
                and says why, rather than pretending to have sent. Set{" "}
                <span className="font-mono">RESEND_API_KEY</span> and the same code
                path starts delivering.
              </p>
            </div>
          ) : null}

          <Card title={`Scheduled (${scheduled.length})`}>
            {scheduled.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing scheduled. Prepo only chases work that has a date, and
                stops when the work is done.
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
                        {rungLabel(entry)}{" "}
                        {entry.ticketKey ? (
                          <>
                            for{" "}
                            <a
                              href={`/${context.slug}/tickets/${entry.ticketKey}`}
                              className="font-medium hover:underline"
                            >
                              {entry.ticketTitle}
                            </a>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-text-subtle">
                        {entry.ticketKey ?? "workspace"} · to{" "}
                        {entry.recipientName ?? "nobody"} ·{" "}
                        {formatShortDate(entry.scheduledFor)} ·{" "}
                        {LADDER_CHANNEL_LABEL[entry.channel as FollowupChannel] ??
                          entry.channel}
                      </p>
                    </div>
                    <PendingFollowup
                      workspace={context.slug}
                      followupId={entry.id}
                      scheduledFor={entry.scheduledFor}
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-text-subtle">
              Any pending message can be moved or cancelled before it sends. This
              list is produced by the chaser, which runs from a scheduler —{" "}
              <span className="font-mono">pnpm --filter @prepo/web db:followups</span>{" "}
              is what it runs.
            </p>
          </Card>

          <Card title={`History (${settled.length})`}>
            {settled.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">
                Nothing has gone out yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {settled.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 py-3 first:pt-0"
                  >
                    <OutcomeIcon status={entry.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {rungLabel(entry)}{" "}
                        {entry.ticketKey ? (
                          <a
                            href={`/${context.slug}/tickets/${entry.ticketKey}`}
                            className="font-mono text-xs text-text-muted hover:underline"
                          >
                            {entry.ticketKey}
                          </a>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-text-subtle">
                        to {entry.recipientName ?? "nobody"} ·{" "}
                        {entry.channel} · {entry.status} ·{" "}
                        {formatShortDate(entry.sentAt ?? entry.scheduledFor)}
                      </p>
                      {entry.detail ? (
                        <p className="mt-1 text-xs text-text-muted">
                          {entry.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {failed.length > 0 ? (
              <p className="mt-4 text-xs text-text-subtle">
                {failed.length} message{failed.length === 1 ? "" : "s"} could not be
                delivered. The reason is on the row, and escalations and failures
                are in the audit log.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Escalation ladder">
            <ol className="space-y-4">
              {LADDER.map((rung, index) => (
                <li key={rung.id} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-text-muted">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{rung.label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {rung.kind === "escalation"
                        ? "Escalation to whoever ran the meeting"
                        : "Message to the assignee"}{" "}
                      ·{" "}
                      {rung.channels
                        .map((channel) => LADDER_CHANNEL_LABEL[channel])
                        .join(" + ")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-text-subtle">
              Quiet hours hold a message back until they end, in the
              recipient&apos;s own timezone, rather than dropping it. Push is listed
              on the nudge rung but is never queued here: it needs an installed app
              with a subscription, and this build has no service worker.
            </p>
          </Card>

          <Card title="Tone">
            <p className="text-sm text-text-muted">
              Follow-ups are generated from the ticket, with the due date, how late
              it is, and a link back to it. The tone changes the wording, not the
              facts.
            </p>
            <div className="mt-4">
              <ToneSelect
                workspace={context.slug}
                value={context.settings.followupTone ?? "neutral"}
              />
            </div>
          </Card>

          <Card title="Weekly digest">
            <p className="text-sm text-text-muted">
              A summary of what is late, what is due in the next seven days, and
              what is waiting on review — to owners and admins, on{" "}
              {weekdayName(weekday)} at 09:00 their time.
            </p>
            <div className="mt-4">
              <DigestWeekdaySelect workspace={context.slug} value={weekday} />
            </div>
          </Card>

          <Card title="Chasing">
            <FollowupsToggle workspace={context.slug} enabled={chasingOn} />
            <p className="mt-4 text-xs text-text-subtle">
              Quiet hours are set per person, and the workspace default is 18:00 to
              09:00.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
