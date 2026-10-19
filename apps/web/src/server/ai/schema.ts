import { z } from "zod";

/**
 * The one shape the model is allowed to return (PREPO.md §7.2, "structured
 * extraction schema"). Two representations of the same contract:
 *
 * - `EXTRACTION_JSON_SCHEMA` is sent to the provider as a response schema, so a
 *   model that supports structured outputs is constrained while it generates.
 * - `rawExtractionSchema` validates the reply on arrival, so a model that only
 *   supports JSON mode, or ignores the schema, still has to pass the same gate.
 *
 * Optional-in-practice fields degrade (`priority` falls back to p2, `confidence`
 * to 0.5) because a wrong enum is a preference, not a fact. Structural fields do
 * not degrade: if `title` is a number, the run fails and nothing is imported.
 */
export const rawActionItemSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  ownerRaw: z.string().nullish(),
  /** Date only. A transcript rarely carries a time of day, and we do not invent one. */
  dueDate: z.string().nullish(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).catch("p2"),
  confidence: z.number().catch(0.5),
  /** Citation tokens (`s1`, `s2`, …) into the transcript that was sent. */
  sourceSegmentIds: z.array(z.string()).catch([]),
});

export const rawExtractionSchema = z.object({
  summary: z.string().catch(""),
  decisions: z.array(z.string()).catch([]),
  openQuestions: z.array(z.string()).catch([]),
  actionItems: z.array(rawActionItemSchema).catch([]),
});

export type RawActionItem = z.infer<typeof rawActionItemSchema>;
export type RawExtraction = z.infer<typeof rawExtractionSchema>;

/**
 * OpenAI-style strict JSON Schema. Every property is required (nullability is
 * expressed with a nullable type), because that is what strict structured-output
 * mode demands, and it is also the stricter contract.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "decisions", "openQuestions", "actionItems"],
  properties: {
    summary: {
      type: "string",
      description: "Two to four sentences: what was decided and what happens next.",
    },
    decisions: {
      type: "array",
      description: "Things the group settled. Close to how they were said.",
      items: { type: "string" },
    },
    openQuestions: {
      type: "array",
      description: "Questions the meeting raised and did not resolve.",
      items: { type: "string" },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "ownerRaw",
          "dueDate",
          "priority",
          "confidence",
          "sourceSegmentIds",
        ],
        properties: {
          title: {
            type: "string",
            description: "Imperative and specific, at most 120 characters.",
          },
          description: { type: ["string", "null"] },
          ownerRaw: {
            type: ["string", "null"],
            description: "The name exactly as the transcript says it, or null.",
          },
          dueDate: {
            type: ["string", "null"],
            description: "YYYY-MM-DD, only when the transcript states or implies a date.",
          },
          priority: { type: "string", enum: ["p0", "p1", "p2", "p3"] },
          confidence: {
            type: "number",
            description: "0 to 1: how sure this is a real commitment with this owner and date.",
          },
          sourceSegmentIds: {
            type: "array",
            description: "At least one segment token copied exactly from the input.",
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/* --------------------------------------------------------------- ask Prepo */

/**
 * What Ask Prepo is allowed to return (§8.8). Deliberately three fields: the
 * answer, the passages it rests on, and whether the passages actually contained
 * an answer. There is no free-text "reasoning" field, because anything the model
 * has to say that is not a citation is something a reader cannot check.
 */
export const rawAskSchema = z.object({
  answer: z.string(),
  /**
   * Tokens and ticket keys copied from the passages that were sent. Grounding
   * resolves them; anything that does not resolve is dropped and counted, so a
   * citation to a passage that was never sent cannot reach the screen.
   */
  sources: z.array(z.string()).catch([]),
  /** False when the passages do not answer the question. Shown, not hidden. */
  confident: z.boolean().catch(true),
});

export type RawAsk = z.infer<typeof rawAskSchema>;

export const ASK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sources", "confident"],
  properties: {
    answer: {
      type: "string",
      description:
        "The answer, in two to five sentences, using only the passages. Say plainly when they do not answer the question.",
    },
    sources: {
      type: "array",
      description:
        "Ids copied exactly from the passages that support the answer: segment ids like s3, meeting ids like m1, or ticket keys like PRE-143. Empty when nothing supports it.",
      items: { type: "string" },
    },
    confident: {
      type: "boolean",
      description:
        "True only when the passages actually answer the question. False when they are silent or only partly relevant.",
    },
  },
} as const;
