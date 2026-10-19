/**
 * Meeting understanding behind an interface (PREPO.md §7.1–7.2): one call that
 * turns a transcript into minutes and candidate action items.
 *
 * The provider returns *raw* JSON. Nothing here is trusted: the orchestrator
 * validates the shape and then grounds every item in the transcript before a
 * single row is written. A model that invents an owner, a date, or a citation
 * cannot get that invention into the database.
 */

export type ExtractionSegment = {
  /**
   * What the model sees and cites: `s1`, `s2`, … A UUID is 36 characters it
   * would mistype, and a mistyped citation must not silently become "no
   * evidence" for an otherwise real item.
   */
  token: string;
  /** The database id, kept out of the prompt and restored after grounding. */
  id: string;
  speaker: string;
  startMs: number;
  text: string;
};

export type ExtractionInput = {
  title: string;
  heldAt: Date;
  /** IANA zone the meeting was held in, for resolving "next Friday". */
  timezone: string;
  segments: ExtractionSegment[];
};

export type ExtractionUsage = {
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** What the provider says it charged, in USD. Null when it does not say. */
  costUsd: number | null;
  latencyMs: number;
};

export type ExtractionReply = {
  /** Parsed JSON, unchecked. `rawExtractionSchema` decides whether it is usable. */
  raw: unknown;
  usage: ExtractionUsage;
};

export interface ExtractionProvider {
  readonly name: string;
  extract(input: ExtractionInput): Promise<ExtractionReply>;
}

/** Thrown when extraction is asked for but no provider is configured. */
export class ExtractionNotConfigured extends Error {
  constructor(message = "Extraction is not configured.") {
    super(message);
    this.name = "ExtractionNotConfigured";
  }
}

/** A provider that answered badly, timed out, or refused. */
export class ExtractionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionFailed";
  }
}

/* ------------------------------------------------------------- ask Prepo */

/**
 * One passage handed to the answering model (PREPO.md §8.8). Retrieval decides
 * what it sees; this type is the boundary between "what Postgres found" and
 * "what the model read", which is the thing worth being able to print and check.
 */
export type AskPassage = {
  /**
   * What the model cites. `s1`… for transcript lines, `m1`… for meeting
   * summaries, and a ticket's own key (`PRE-143`) for tickets, because a key is
   * already a stable, human-readable id and inventing a second one would give
   * the model two ways to cite the same ticket.
   */
  token: string;
  kind: "transcript" | "meeting" | "ticket";
  text: string;
  meetingTitle?: string;
  speaker?: string;
  startMs?: number;
  ticketKey?: string;
  /**
   * The row each passage came from, so a citation can be resolved back to the
   * exact line instead of being matched against the passage text.
   */
  segmentId?: string;
  meetingId?: string;
};

export type AskInput = {
  question: string;
  passages: AskPassage[];
};

export type AskReply = {
  /** Parsed JSON, unchecked. `rawAskSchema` decides whether it is usable. */
  raw: unknown;
  usage: ExtractionUsage;
};

export interface AskProvider {
  readonly name: string;
  answer(input: AskInput): Promise<AskReply>;
}

/** Thrown when an answer failed at the provider. */
export class AskFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskFailed";
  }
}
