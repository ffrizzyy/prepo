import {
  CheckCircle,
  Circle,
  CircleDashed,
  CircleHalf,
  Eye,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { PriorityId, TicketStatusId } from "@prepo/shared";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  TicketStatusId,
  { label: string; className: string; Icon: typeof Circle }
> = {
  backlog: { label: "Backlog", className: "text-text-subtle", Icon: Circle },
  todo: { label: "To do", className: "text-text-muted", Icon: CircleDashed },
  in_progress: { label: "In progress", className: "text-accent-ink", Icon: CircleHalf },
  in_review: { label: "In review", className: "text-text", Icon: Eye },
  done: {
    label: "Done",
    className: "text-success",
    Icon: CheckCircle,
  },
};

const PRIORITY_META: Record<PriorityId, string> = {
  p0: "bg-danger/10 text-danger",
  p1: "bg-accent-soft text-accent-ink",
  p2: "bg-surface-2 text-text-muted",
  p3: "bg-surface-2 text-text-subtle",
};

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatusId;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <meta.Icon size={14} weight="fill" aria-hidden />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: PriorityId;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-1 px-1.5 py-0.5 text-[10px] font-medium uppercase",
        PRIORITY_META[priority],
        className,
      )}
    >
      {priority}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-danger",
        className,
      )}
    >
      <WarningCircle size={14} weight="fill" aria-hidden />
      Overdue
    </span>
  );
}

export function ScoreMeter({
  label,
  value,
  hint,
}: {
  label: string;
  /** Null means no extraction has produced this score; it is not zero. */
  value: number | null;
  hint?: string;
}) {
  if (value === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-text-muted">{label}</span>
          <span className="text-xs text-text-subtle">Not scored</span>
        </div>
        <p className="mt-2 text-xs text-text-subtle">{hint}</p>
      </div>
    );
  }

  const tone =
    value >= 70 ? "text-success" : value >= 45 ? "text-accent-ink" : "text-danger";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-text-muted">{label}</span>
        <span className={cn("text-sm tabular-nums", tone)}>{value}</span>
      </div>
      <div
        className={cn(
          "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2",
          tone,
        )}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-current opacity-80"
          style={{ width: `${value}%` }}
        />
      </div>
      {hint ? <p className="mt-2 text-xs text-text-subtle">{hint}</p> : null}
    </div>
  );
}
