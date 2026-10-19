import { Card, PageHeader } from "@/components/app/page-header";
import { TICKET_STATUSES } from "@prepo/shared";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/context";
import { listMeetingsView, listTicketsView } from "@/server/queries";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const SLOTS = ["9am", "11am", "1pm", "3pm", "5pm"] as const;

/** Buckets a UTC hour into one of the five working-day slots. */
function slotFor(hour: number): number {
  if (hour < 10) return 0;
  if (hour < 12) return 1;
  if (hour < 14) return 2;
  if (hour < 16) return 3;
  return 4;
}

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);

  const [tickets, meetings] = await Promise.all([
    listTicketsView(context.id),
    listMeetingsView(context.id),
  ]);

  const chronological = [...meetings].sort((a, b) =>
    a.heldAt.localeCompare(b.heldAt),
  );

  const byStatus = TICKET_STATUSES.map((status) => ({
    ...status,
    count: tickets.filter((ticket) => ticket.status === status.id).length,
  }));
  const maxStatus = Math.max(...byStatus.map((entry) => entry.count), 1);

  // Share of a meeting's action items that became tickets.
  const conversion = meetings
    .filter((meeting) => meeting.proposedCount > 0)
    .map((meeting) => ({
      label: meeting.title,
      value: Math.round((meeting.ticketedCount / meeting.proposedCount) * 100),
    }));

  // Hours from the meeting to the first ticket traced back to it.
  const timeToTicket = meetings
    .map((meeting) => {
      const created = tickets
        .filter((ticket) => ticket.meetingId === meeting.id)
        .map((ticket) => new Date(ticket.createdAt).getTime());
      if (created.length === 0) return null;
      const first = Math.min(...created);
      const hours = (first - new Date(meeting.heldAt).getTime()) / 3_600_000;
      if (hours < 0) return null;
      return { label: meeting.title, value: Math.round(hours) };
    })
    .filter((entry): entry is { label: string; value: number } => entry !== null);

  const clarityTrend = chronological
    .filter((meeting) => meeting.clarityScored)
    .map((meeting) => meeting.clarityScore);

  // Meetings per weekday and time slot, built from real meeting timestamps.
  const load = WEEKDAYS.map(() => SLOTS.map(() => 0));
  for (const meeting of meetings) {
    const held = new Date(meeting.heldAt);
    const weekday = held.getUTCDay() - 1;
    if (weekday < 0 || weekday > 4) continue;
    const row = load[weekday];
    if (!row) continue;
    const slot = slotFor(held.getUTCHours());
    row[slot] = (row[slot] ?? 0) + 1;
  }
  const maxLoad = Math.max(1, ...load.flat());

  return (
    <>
      <PageHeader
        title="Insights"
        description="Whether meetings are turning into work, and where it stalls."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Meeting → action conversion">
          {conversion.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-subtle">
              No meeting has produced action items yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {conversion.map((entry) => (
                <li key={entry.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-text-muted">{entry.label}</span>
                    <span className="font-mono">{entry.value}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${entry.value}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Median time: meeting → first ticket">
          {timeToTicket.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-subtle">
              No ticket has been traced back to a meeting yet. Approve an action
              item and it will show up here.
            </p>
          ) : (
            <ul className="space-y-3">
              {timeToTicket.map((entry) => (
                <li key={entry.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-text-muted">{entry.label}</span>
                    <span className="font-mono">{entry.value}h</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent-ink/60"
                      style={{ width: `${Math.min(entry.value, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tickets by status">
          <div className="flex items-end justify-between gap-3">
            {byStatus.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-32 w-full items-end justify-center">
                  <div
                    className={cn(
                      "w-6 rounded-t",
                      entry.id === "done" ? "bg-success/70" : "bg-accent",
                    )}
                    style={{ height: `${(entry.count / maxStatus) * 100}%` }}
                    title={`${entry.count} ${entry.label}`}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-subtle">
                  {entry.count}
                </span>
                <span className="text-center text-[10px] text-text-muted">
                  {entry.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Clarity score trend">
          {clarityTrend.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-subtle">
              No meeting has a clarity score yet. Scores come from extraction.
            </p>
          ) : (
            <>
              <div className="flex h-32 items-end gap-2">
                {clarityTrend.map((value, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t bg-text-subtle/40"
                    style={{ height: `${value}%` }}
                    title={`${value}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-text-subtle">
                Are the minutes getting clearer over time? Last{" "}
                {clarityTrend.length} scored meeting
                {clarityTrend.length === 1 ? "" : "s"}.
                {clarityTrend.length < chronological.length
                  ? " Meetings without an extraction are not scored, so they are not plotted."
                  : ""}
              </p>
            </>
          )}
        </Card>

        <Card title="Meeting load heatmap" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <div className="mb-2 flex gap-1 pl-10 text-[10px] text-text-subtle">
                {SLOTS.map((slot) => (
                  <span key={slot} className="flex-1 text-center">
                    {slot}
                  </span>
                ))}
              </div>
              {load.map((row, rowIndex) => (
                <div key={WEEKDAYS[rowIndex]} className="mb-1 flex items-center gap-1">
                  <span className="w-10 text-[10px] text-text-subtle">
                    {WEEKDAYS[rowIndex]}
                  </span>
                  {row.map((value, colIndex) => (
                    <span
                      key={SLOTS[colIndex]}
                      className="h-8 flex-1 rounded-[6px] bg-surface-2"
                      style={{
                        backgroundColor:
                          value === 0
                            ? undefined
                            : `color-mix(in srgb, var(--accent) ${(value / maxLoad) * 100}%, transparent)`,
                      }}
                      title={`${value} meeting${value === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-text-subtle">
            Overload by weekday and hour. {meetings.length} meeting
            {meetings.length === 1 ? "" : "s"} recorded in this window.
          </p>
        </Card>
      </div>
    </>
  );
}
