/**
 * Time-of-day arithmetic for follow-ups, without a date library.
 *
 * Two rules from PREPO.md §8.7 land here: quiet hours defer ordinary messages,
 * and the weekly digest goes out on a fixed weekday. Both are per *recipient*,
 * in that person's own timezone, which is why nothing here reads the server
 * clock's zone.
 */

export type QuietHours = { from: string; to: string } | null | undefined;

/** Minutes since local midnight, or null when the string is not a clock time. */
export function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function quietWindow(quiet: QuietHours): { from: number; to: number } | null {
  if (!quiet) return null;
  const from = parseClock(quiet.from);
  const to = parseClock(quiet.to);
  if (from === null || to === null || from === to) return null;
  return { from, to };
}

type ZoneInfo = { minutes: number; weekday: number; offsetMinutes: number };

/**
 * The wall clock in a named zone. An unknown zone falls back to UTC rather than
 * throwing, because a bad timezone on one account should not stop the engine.
 */
export function zonedParts(date: Date, timeZone: string): ZoneInfo {
  const zone = safeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const hours = Number(read("hour")) % 24;
  const asUtc = Date.UTC(
    Number(read("year")),
    Number(read("month")) - 1,
    Number(read("day")),
    hours,
    Number(read("minute")),
    Number(read("second")),
  );

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    minutes: hours * 60 + Number(read("minute")),
    weekday: Math.max(0, weekdays.indexOf(read("weekday"))),
    offsetMinutes: Math.round((asUtc - date.getTime()) / 60_000),
  };
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** True when a message sent now would land inside the recipient's quiet hours. */
export function inQuietHours(
  date: Date,
  quiet: QuietHours,
  timeZone: string,
): boolean {
  const window = quietWindow(quiet);
  if (!window) return false;
  const { minutes } = zonedParts(date, timeZone);
  return within(window, minutes);
}

function within(window: { from: number; to: number }, minutes: number): boolean {
  return window.from < window.to
    ? minutes >= window.from && minutes < window.to
    : // A window like 18:00 → 09:00 wraps midnight.
      minutes >= window.from || minutes < window.to;
}

/**
 * The moment a message held back by quiet hours may go out: the end of the quiet
 * window, in the recipient's zone. Returns null when nothing is holding it back.
 */
export function deferPastQuietHours(
  date: Date,
  quiet: QuietHours,
  timeZone: string,
): Date | null {
  const window = quietWindow(quiet);
  if (!window) return null;

  const { minutes } = zonedParts(date, timeZone);
  if (!within(window, minutes)) return null;

  let deltaMinutes: number;
  if (window.from < window.to) {
    deltaMinutes = window.to - minutes;
  } else if (minutes >= window.from) {
    deltaMinutes = 24 * 60 - minutes + window.to;
  } else {
    deltaMinutes = window.to - minutes;
  }

  // Landing exactly on the boundary minute is fine; the next call sees it as
  // outside the window. Round up to the minute so the deferred time is stable.
  const minutes2 = Math.max(1, deltaMinutes);
  return new Date(date.getTime() + minutes2 * 60_000);
}

/**
 * The next occurrence of a weekday + local time, strictly after `now`. Used to
 * place the weekly digest (Monday 09:00 by default) in each recipient's zone.
 */
export function nextWeekdayTime(
  now: Date,
  timeZone: string,
  weekday: number,
  hour = 9,
  minute = 0,
): Date {
  const target = ((weekday % 7) + 7) % 7;
  const zone = safeZone(timeZone);
  const targetMinutes = hour * 60 + minute;

  const { weekday: current, minutes } = zonedParts(now, zone);
  let deltaMinutes =
    ((target - current + 7) % 7) * 24 * 60 + targetMinutes - minutes;
  // Already past today's slot? Then it is next week's.
  if (deltaMinutes <= 0) deltaMinutes += 7 * 24 * 60;

  const candidate = new Date(now.getTime() + deltaMinutes * 60_000);
  const recheck = zonedParts(candidate, zone);

  // A daylight-saving change between now and then moves the wall clock by an
  // hour, so correct once rather than landing at the wrong local time.
  const diff = targetMinutes - recheck.minutes;
  const correction = diff !== 0 && Math.abs(diff) % 60 === 0 && Math.abs(diff) <= 120 ? diff : 0;
  return new Date(candidate.getTime() + correction * 60_000);
}

/** "Mon 09:00" style label for the settings and settings page copy. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayName(weekday: number | undefined, fallback = 1): string {
  return WEEKDAY_NAMES[weekday ?? fallback] ?? "Monday";
}
