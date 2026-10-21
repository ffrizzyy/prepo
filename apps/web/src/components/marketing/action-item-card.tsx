import { CheckCircle, Clock, User } from "@phosphor-icons/react/dist/ssr";
import { FLAG_COPY, type ActionItem } from "@prepo/shared";
import { cn } from "@/lib/utils";

const priorityStyles: Record<string, string> = {
  p0: "bg-danger/10 text-danger",
  p1: "bg-accent-soft text-accent-ink",
  p2: "bg-surface-2 text-text-muted",
  p3: "bg-surface-2 text-text-subtle",
};

function formatDue(dueAt: string | null) {
  if (!dueAt) return "No date";
  // Fixed locale and UTC: this card is rendered on the server and hydrated in
  // the visitor's timezone, and a 17:00Z sample date becomes the next day in
  // UTC+7. Without the zone the two renders differ text and React reports a
  // hydration mismatch (caught by the Lighthouse console audit).
  return new Date(dueAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ActionItemCard({
  item,
  quote,
  timestamp,
  ticketKey,
  className,
}: {
  item: ActionItem;
  quote?: string;
  timestamp?: string;
  ticketKey?: string | null;
  className?: string;
}) {
  const isTicket = Boolean(ticketKey);

  return (
    <div
      className={cn(
        "rounded-3 border bg-surface p-4 transition-colors",
        isTicket ? "border-success/30" : "border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center",
              isTicket ? "text-success" : "text-accent-ink",
            )}
            aria-hidden
          >
            {isTicket ? (
              <CheckCircle size={20} weight="fill" />
            ) : (
              <span className="size-2.5 rounded-full bg-current" />
            )}
          </span>
          <p className="text-sm font-medium leading-snug">{item.title}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
            priorityStyles[item.priority],
          )}
        >
          {item.priority}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <User size={13} weight="regular" />
          {item.ownerName ?? "Unassigned"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={13} weight="regular" />
          {formatDue(item.dueAt)}
        </span>
      </div>

      {quote ? (
        <blockquote className="mt-3 rounded-2 border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-xs leading-relaxed text-text-muted">
          <span aria-hidden>“</span>
          {quote}
          <span aria-hidden>”</span>
          {timestamp ? (
            <span className="ml-1.5 font-mono text-[10px] text-accent-ink">
              {timestamp}
            </span>
          ) : null}
        </blockquote>
      ) : null}

      {item.flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-subtle"
            >
              {FLAG_COPY[flag]}
            </span>
          ))}
        </div>
      ) : null}

      {ticketKey ? (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
          <span className="font-mono text-text-subtle">{ticketKey}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-success">
            Ticket created
          </span>
        </div>
      ) : null}
    </div>
  );
}
