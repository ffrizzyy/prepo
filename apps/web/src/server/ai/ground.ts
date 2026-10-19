import type { RawExtraction } from "./schema";

/**
 * Grounding: the step between "the model said so" and "the database says so".
 *
 * Everything here is pure, which is why the test suite can pin it without a key.
 * Three rules make the review queue trustworthy (PREPO.md §7.2, §7.4, §9.3 A08):
 *
 * 1. Evidence is a transcript id, not a sentence the model wrote. An item whose
 *    citations do not resolve is dropped; the quote the review screen shows comes
 *    from the segment itself (`queries.listActionItemsView`), so it cannot be
 *    fabricated.
 * 2. An owner is a member of this workspace or nobody. `ownerRaw` is kept exactly
 *    as said, and a first name that matches two members is ambiguous, not a guess.
 * 3. A date is a real calendar date, stored at 17:00 in the owner's zone ("end of
 *    the working day"). The time of day is an assumption; the date is not.
 */

export type GroundMember = {
  userId: string;
  name: string;
  email: string;
  timezone: string | null;
  aliases: string[];
};

export type GroundInput = {
  raw: RawExtraction;
  /** IANA zone the meeting was held in, used when the owner has no zone. */
  meetingTimezone: string;
  /** Token ↔ database id. The prompt never sees a UUID. */
  segments: { token: string; id: string }[];
  members: GroundMember[];
};

export type GroundedItem = {
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerRaw: string | null;
  ownerConfidence: number | null;
  dueAt: Date | null;
  priority: "p0" | "p1" | "p2" | "p3";
  confidence: number;
  sourceSegmentIds: string[];
  flags: string[];
};

export type GroundResult = {
  summary: string;
  decisions: string[];
  openQuestions: string[];
  items: GroundedItem[];
  dropped: {
    /** Items the model could not cite at all. */
    noEvidence: number;
    /** Items whose title was empty after cleaning. */
    emptyTitle: number;
    /** Citations that did not point at a segment in the input. */
    unknownCitations: number;
  };
  clarityScore: number;
};

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 600;
const SUMMARY_MAX = 2_000;
const LIST_ITEM_MAX = 300;
const LIST_MAX = 12;
const DUE_HOUR = 17;

/* ------------------------------------------------------------------- text */

function clean(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value, LIST_ITEM_MAX);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

/* --------------------------------------------------------------- time zones */

export function validTimeZone(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** How far ahead of UTC `timeZone` is at that instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const read = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    return part ? Number(part.value) : 0;
  };

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return asUtc - at.getTime();
}

/**
 * The instant at which the wall clock in `timeZone` reads `hour` on `date`.
 * Two passes, because the first offset guess can be wrong across a DST change.
 * Returns null for a date that does not exist (`2026-02-31`).
 */
export function localTimeInZone(date: string, hour: number, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, 0, 0);
  if (!Number.isFinite(wall)) return null;
  // Date.UTC rolls 31 February into March, so compare the calendar date back.
  if (new Date(wall).toISOString().slice(0, 10) !== date) return null;

  const zone = validTimeZone(timeZone) ?? "UTC";
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = wall - zoneOffsetMs(new Date(instant), zone);
  }
  return new Date(instant);
}

/** A date from the model becomes the end of that working day, or null. */
export function dueAtFrom(
  dueDate: string | null | undefined,
  timeZone: string,
): Date | null {
  const raw = typeof dueDate === "string" ? dueDate.trim() : "";
  if (!raw) return null;
  return localTimeInZone(raw, DUE_HOUR, timeZone);
}

/* ----------------------------------------------------------------- owners */

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type MemberKeys = {
  member: GroundMember;
  /** Full name, an alias, or the email's local part. */
  strong: Set<string>;
  /** A single first or last name, which is weaker evidence. */
  weak: Set<string>;
};

function memberKeys(members: GroundMember[]): MemberKeys[] {
  return members.map((member) => {
    const strong = new Set<string>();
    const weak = new Set<string>();

    const full = normalizeName(member.name);
    if (full) strong.add(full);

    const local = normalizeName(member.email.split("@")[0] ?? "");
    if (local) strong.add(local);

    for (const alias of member.aliases) {
      const normalized = normalizeName(alias);
      if (normalized) strong.add(normalized);
    }

    const words = full.split(" ").filter((word) => word.length >= 2);
    if (words.length >= 2) {
      for (const word of words) weak.add(word);
    }

    return { member, strong, weak };
  });
}

type OwnerMatch = {
  ownerId: string | null;
  confidence: number | null;
  flag: "no_owner" | "ambiguous_owner" | null;
};

function resolveOwner(raw: string, keys: MemberKeys[]): OwnerMatch {
  const normalized = normalizeName(raw);
  if (!normalized) return { ownerId: null, confidence: null, flag: "no_owner" };

  const strong = keys.filter((key) => key.strong.has(normalized));
  if (strong.length === 1 && strong[0]) {
    return { ownerId: strong[0].member.userId, confidence: 0.95, flag: null };
  }
  if (strong.length > 1) {
    return { ownerId: null, confidence: 0.4, flag: "ambiguous_owner" };
  }

  const weak = keys.filter((key) => key.weak.has(normalized));
  if (weak.length === 1 && weak[0]) {
    return { ownerId: weak[0].member.userId, confidence: 0.75, flag: null };
  }
  if (weak.length > 1) {
    return { ownerId: null, confidence: 0.4, flag: "ambiguous_owner" };
  }

  return { ownerId: null, confidence: null, flag: "no_owner" };
}

/* --------------------------------------------------------------- duplicates */

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "for",
  "of",
  "and",
  "with",
  "on",
  "in",
  "our",
  "this",
  "that",
  "be",
  "is",
  "it",
]);

/**
 * Exported because the cross-meeting necessity score has to use the same
 * definition of "the same words" as the within-meeting duplicate flag. Two
 * tokenizers would let the two rules disagree about the same pair of titles.
 */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ------------------------------------------------------------------ scores */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, value)) * 1_000) / 1_000;
}

/**
 * Clarity is arithmetic over what was actually extracted, not a second model
 * opinion: owners 45%, deadlines 35%, at least one settled decision 20%. A
 * meeting with nothing extracted scores 0, which is why an unscored meeting
 * shows "Not scored" in the UI rather than a zero it did not earn.
 */
export function clarityScore(items: GroundedItem[], decisions: string[]): number {
  const total = items.length;
  const owners = items.filter((item) => item.ownerId !== null).length;
  const dates = items.filter((item) => item.dueAt !== null).length;
  const ownerRatio = total === 0 ? 0 : owners / total;
  const dateRatio = total === 0 ? 0 : dates / total;
  const decisionRatio = decisions.length > 0 ? 1 : 0;
  return Math.round(100 * (0.45 * ownerRatio + 0.35 * dateRatio + 0.2 * decisionRatio));
}

/* ------------------------------------------------------------------ ground */

export function groundExtraction(input: GroundInput): GroundResult {
  const idByToken = new Map(input.segments.map((segment) => [segment.token, segment.id]));
  const knownIds = new Set(input.segments.map((segment) => segment.id));
  const memberById = new Map(input.members.map((member) => [member.userId, member]));
  const keys = memberKeys(input.members);
  const fallbackZone = validTimeZone(input.meetingTimezone) ?? "UTC";

  const dropped = { noEvidence: 0, emptyTitle: 0, unknownCitations: 0 };
  const items: GroundedItem[] = [];
  const seenTitles: Set<string>[] = [];

  for (const rawItem of input.raw.actionItems) {
    const title = clean(rawItem.title, TITLE_MAX);
    if (!title) {
      dropped.emptyTitle += 1;
      continue;
    }

    // Resolve citations: token first, then a raw id (handy for fixtures that
    // already know the database rows). Anything else is not evidence.
    const sourceSegmentIds: string[] = [];
    for (const ref of rawItem.sourceSegmentIds) {
      const key = typeof ref === "string" ? ref.trim() : "";
      if (!key) continue;
      const id = idByToken.get(key) ?? (knownIds.has(key) ? key : null);
      if (!id) {
        dropped.unknownCitations += 1;
        continue;
      }
      if (!sourceSegmentIds.includes(id)) sourceSegmentIds.push(id);
    }

    if (sourceSegmentIds.length === 0) {
      dropped.noEvidence += 1;
      continue;
    }

    const ownerRaw = clean(rawItem.ownerRaw, 120);
    const owner = ownerRaw
      ? resolveOwner(ownerRaw, keys)
      : ({ ownerId: null, confidence: null, flag: "no_owner" } satisfies OwnerMatch);

    const ownerZone = owner.ownerId
      ? validTimeZone(memberById.get(owner.ownerId)?.timezone ?? null)
      : null;
    const dueAt = dueAtFrom(rawItem.dueDate, ownerZone ?? fallbackZone);

    const flags: string[] = [];
    if (owner.flag) flags.push(owner.flag);
    if (!dueAt) flags.push("no_deadline");

    const tokens = titleTokens(title);
    if (seenTitles.some((existing) => jaccard(existing, tokens) >= 0.6)) {
      flags.push("possible_duplicate");
    }
    seenTitles.push(tokens);

    items.push({
      title,
      description: clean(rawItem.description, DESCRIPTION_MAX),
      ownerId: owner.ownerId,
      ownerRaw,
      ownerConfidence: owner.confidence,
      dueAt,
      priority: rawItem.priority,
      confidence: clamp01(rawItem.confidence),
      sourceSegmentIds,
      flags: [...new Set(flags)],
    });
  }

  const decisions = cleanList(input.raw.decisions);
  return {
    summary: clean(input.raw.summary, SUMMARY_MAX) ?? "",
    decisions,
    openQuestions: cleanList(input.raw.openQuestions),
    items,
    dropped,
    clarityScore: clarityScore(items, decisions),
  };
}
