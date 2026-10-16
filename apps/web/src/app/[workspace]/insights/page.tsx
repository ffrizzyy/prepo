import { Card, PageHeader } from "@/components/app/page-header";
import { TICKET_STATUSES } from "@prepo/shared";
import { cn } from "@/lib/utils";
import { getMeetings, getTickets } from "@/lib/workspace-data";

const CONVERSION = [
  { label: "Q4 Launch sync", value: 86 },
  { label: "Design critique", value: 71 },
  { label: "Support triage", value: 42 },
  { label: "Retro follow-up", value: 12 },
];

const TIME_TO_TICKET = [
  { label: "Q4 Launch sync", value: 4 },
  { label: "Design critique", value: 9 },
  { label: "Support triage", value: 26 },
  { label: "Retro follow-up", value: 61 },
];

const CLARITY_TREND = [41, 48, 52, 55, 49, 62, 58, 66];

const LOAD = [
  [1, 2, 3, 1, 0],
  [2, 4, 2, 3, 1],
  [1, 3, 5, 2, 0],
  [0, 2, 2, 1, 0],
  [1, 1, 0, 1, 0],
];

export default function InsightsPage() {
  const tickets = getTickets();
  const meetings = getMeetings();
  const maxLoad = Math.max(...LOAD.flat());

  const byStatus = TICKET_STATUSES.map((status) => ({
    ...status,
    count: tickets.filter((ticket) => ticket.status === status.id).length,
  }));
  const maxStatus = Math.max(...byStatus.map((entry) => entry.count), 1);

  return (
    <>
      <PageHeader
        title="Insights"
        description="Whether meetings are turning into work, and where it stalls."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Meeting → action conversion">
          <ul className="space-y-3">
            {CONVERSION.map((entry) => (
              <li key={entry.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{entry.label}</span>
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
        </Card>

        <Card title="Median time: meeting → first ticket">
          <ul className="space-y-3">
            {TIME_TO_TICKET.map((entry) => (
              <li key={entry.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{entry.label}</span>
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
        </Card>

        <Card title="Tickets by status">
          <div className="flex items-end justify-between gap-3">
            {byStatus.map((entry) => (
              <div key={entry.id} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end justify-center">
                  <div
                    className={cn(
                      "w-6 rounded-t",
                      entry.id === "done" ? "bg-[#15803d]/70" : "bg-accent",
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
          <div className="flex h-32 items-end gap-2">
            {CLARITY_TREND.map((value, index) => (
              <div
                key={index}
                className="flex-1 rounded-t bg-text-subtle/40"
                style={{ height: `${value}%` }}
                title={`${value}`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-text-subtle">
            Are the minutes getting clearer over time? Last {CLARITY_TREND.length}{" "}
            meetings.
          </p>
        </Card>

        <Card title="Meeting load heatmap" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <div className="mb-2 flex gap-1 pl-10 text-[10px] text-text-subtle">
                {["9am", "11am", "1pm", "3pm", "5pm"].map((slot) => (
                  <span key={slot} className="flex-1 text-center">
                    {slot}
                  </span>
                ))}
              </div>
              {LOAD.map((row, rowIndex) => (
                <div key={rowIndex} className="mb-1 flex items-center gap-1">
                  <span className="w-10 text-[10px] text-text-subtle">
                    {["Mon", "Tue", "Wed", "Thu", "Fri"][rowIndex]}
                  </span>
                  {row.map((value, colIndex) => (
                    <span
                      key={colIndex}
                      className="h-8 flex-1 rounded-[6px]"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--accent) ${(value / maxLoad) * 100}%, transparent)`,
                      }}
                      title={`${value} meetings`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-text-subtle">
            Overload by weekday and hour. {meetings.length} meetings recorded in this
            window.
          </p>
        </Card>
      </div>
    </>
  );
}
