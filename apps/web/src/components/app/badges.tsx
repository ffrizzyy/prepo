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
    className: "text-[#15803d] dark:text-[#4ade80]",
    Icon: CheckCircle,
  },
};

const PRIORITY_META: Record<PriorityId, string> = {
  p0: "bg-[#b91c1c]/10 text-[#b91c1c] dark:text-[#f87171]",
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
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
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
        "inline-flex items-center gap-1 text-xs font-medium text-[#b91c1c] dark:text-[#f87171]",
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
  value: number;
  hint?: string;
}) {
  const tone =
    value >= 70
      ? "text-[#15803d] dark:text-[#4ade80]"
      : value >= 45
        ? "text-accent-ink"
        : "text-[#b91c1c] dark:text-[#f87171]";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-text-muted">{label}</span>
        <span className={cn("font-mono text-sm", tone)}>{value}</span>
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
