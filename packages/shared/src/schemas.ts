import { z } from "zod";

export const actionItemFlagSchema = z.enum([
  "no_owner",
  "no_deadline",
  "ambiguous_owner",
  "possible_duplicate",
]);

export const prioritySchema = z.enum(["p0", "p1", "p2", "p3"]);

export const ticketStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);

export const transcriptSegmentSchema = z.object({
  id: z.string(),
  idx: z.number().int().nonnegative(),
  speakerLabel: z.string(),
  speakerName: z.string().nullable(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});

export const actionItemSchema = z.object({
  id: z.string(),
  meetingId: z.string(),
  title: z.string().max(120),
  description: z.string().max(600).optional(),
  ownerRaw: z.string().nullable(),
  ownerName: z.string().nullable(),
  ownerConfidence: z.number().min(0).max(1),
  dueAt: z.string().nullable(),
  priority: prioritySchema,
  confidence: z.number().min(0).max(1),
  sourceSegmentIds: z.array(z.string()).min(1),
  flags: z.array(actionItemFlagSchema),
  status: z.enum(["proposed", "approved", "rejected", "ticketed"]),
});

export const ticketSchema = z.object({
  id: z.string(),
  key: z.string().regex(/^[A-Z]+-\d+$/),
  actionItemId: z.string().nullable(),
  title: z.string(),
  description: z.string().optional(),
  assigneeName: z.string().nullable(),
  status: ticketStatusSchema,
  priority: prioritySchema,
  dueAt: z.string().nullable(),
  labels: z.array(z.string()),
  linearUrl: z.string().nullable(),
  /**
   * Linear sync state. Optional because not every producer of a `Ticket` knows
   * about it (the static sample data predates the integration), and a value of
   * `undefined` reads as "not asked" rather than "not synced".
   */
  linearIssueId: z.string().nullable().optional(),
  linearSyncState: z.enum(["pending", "synced", "failed"]).nullable().optional(),
  linearSyncError: z.string().nullable().optional(),
  linearRetryAfter: z.string().nullable().optional(),
  meetingId: z.string().nullable(),
  sourceQuote: z.string().nullable(),
  createdAt: z.string(),
});

export const meetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  heldAt: z.string(),
  source: z.enum(["paste", "upload", "recording"]),
  status: z.enum(["processing", "ready", "failed"]),
  clarityScore: z.number().min(0).max(100),
  necessityScore: z.number().min(0).max(100),
  summary: z.string(),
  keyDecisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type ActionItem = z.infer<typeof actionItemSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
