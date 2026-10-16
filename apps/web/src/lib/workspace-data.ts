/**
 * Formatting helpers shared by the app views. Data now comes from Postgres via
 * `@/server/queries`, so nothing here reaches for sample data any more.
 */

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(value: string | null): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function relativeDue(value: string | null): string {
  if (!value) return "No date";
  const due = new Date(value).getTime();
  const now = Date.now();
  const days = Math.round((due - now) / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}

export function isOverdue(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

/** "2 days ago" / "just now", for comment and activity timestamps. */
export function relativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}
