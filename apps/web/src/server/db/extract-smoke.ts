import { and, eq } from "drizzle-orm";
import {
  DEFAULT_EXTRACTION_LIMITS,
  autoApprovable,
  extractMeeting,
  extractionReadiness,
} from "../ai/extract";
import {
  clarityScore,
  dueAtFrom,
  groundExtraction,
  localTimeInZone,
  validTimeZone,
  type GroundedItem,
} from "../ai/ground";
import {
  extractionConfigProblem,
  extractionProvider,
  parseModelJson,
} from "../ai/openrouter";
import { extractionUserPrompt, SYSTEM_PROMPT } from "../ai/prompt";
import { rawExtractionSchema } from "../ai/schema";
import type { ExtractionProvider, ExtractionReply } from "../ai/types";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import { updateSettings } from "../writes";
import { withWorkspace } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

/**
 * Extraction (PREPO.md §7), checked without spending money:
 *   pnpm --filter @prepo/web db:extract-smoke
 *
 * The provider is a fixture, so everything that depends on the model's *output*
 * is exercised, the prompt, the schema gate, grounding, owner and date
 * resolution, the budget, the write, the audit row, auto-approval, while no
 * network call is made. The one thing this suite cannot prove is how well a
 * real model reads a real transcript; that needs a live run and a key.
 *
 * It reseeds at the start and the end, like `db:linear-smoke`, so the demo data
 * is left as it was.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `, ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const NOW = new Date("2026-10-18T09:00:00.000Z");
const UNSET: Record<string, string | undefined> = {};

function providerReturning(
  raw: unknown,
  usage: Partial<ExtractionReply["usage"]> = {},
): ExtractionProvider {
  return {
    name: "fixture",
    async extract(): Promise<ExtractionReply> {
      return {
        raw,
        usage: {
          model: "fixture/extract-1",
          tokensIn: 1_240,
          tokensOut: 218,
          costUsd: 0.0021,
          latencyMs: 37,
          ...usage,
        },
      };
    },
  };
}

/** Fails the test if extraction calls a provider it should have refused before. */
const MUST_NOT_RUN: ExtractionProvider = {
  name: "must-not-run",
  async extract(): Promise<ExtractionReply> {
    throw new Error("the provider was called when the run should have been refused");
  },
};

async function createMeeting(input: {
  workspaceId: string;
  title: string;
  heldAt: Date;
  createdBy: string | null;
  segments: { speaker: string; text: string }[];
}): Promise<{ meetingId: string; segmentIds: string[] }> {
  const meetingId = uuidv7();
  const rows = input.segments.map((segment, index) => ({
    id: uuidv7(),
    workspaceId: input.workspaceId,
    meetingId,
    idx: index,
    speakerLabel: segment.speaker,
    speakerUserId: null,
    startMs: index * 30_000,
    endMs: index * 30_000 + 20_000,
    text: segment.text,
  }));

  await withWorkspace(input.workspaceId, async (tx) => {
    await tx.insert(t.meetings).values({
      id: meetingId,
      workspaceId: input.workspaceId,
      title: input.title,
      heldAt: input.heldAt,
      source: "paste",
      status: "ready",
      createdBy: input.createdBy,
    });
    if (rows.length > 0) {
      await tx.insert(t.transcriptSegments).values(rows);
    }
  });

  return { meetingId, segmentIds: rows.map((row) => row.id) };
}

runCli("extract-smoke.ts", async () => {
  await migrateAndApply();
  await seed();

  const northwind = (await resolveWorkspaceId("northwind"))!;
  const globex = (await resolveWorkspaceId("globex"))!;
  const lena = (await getUserByEmail(DEMO.email))!;

  const [northwindSettings] = await withWorkspace(northwind, (tx) =>
    tx.select({ settings: t.workspaces.settings }).from(t.workspaces),
  );
  const baseSettings = northwindSettings?.settings ?? {};

  /* ------------------------------------------------------ configuration */

  check(
    "with nothing set, the reason names OPENROUTER_API_KEY",
    extractionConfigProblem(UNSET)?.includes("OPENROUTER_API_KEY") === true,
  );
  check(
    "with a key but no model, the reason names AI_MODEL_EXTRACT",
    extractionConfigProblem({ OPENROUTER_API_KEY: "sk-or-fixture" })?.includes(
      "AI_MODEL_EXTRACT",
    ) === true,
  );
  check(
    "with both set, extraction is ready",
    extractionConfigProblem({
      OPENROUTER_API_KEY: "sk-or-fixture",
      AI_MODEL_EXTRACT: "some/model",
    }) === null,
  );
  check(
    "a provider is only built when both values are present",
    extractionProvider(UNSET) === null &&
      extractionProvider({ OPENROUTER_API_KEY: "x", AI_MODEL_EXTRACT: "y" })?.name ===
        "openrouter",
  );
  check(
    "the page can explain why the button is absent",
    extractionReadiness(UNSET).ready === false &&
      extractionReadiness({ OPENROUTER_API_KEY: "x", AI_MODEL_EXTRACT: "y" }).ready === true,
  );

  /* ------------------------------------------------------------- time */

  check(
    "17:00 UTC is 17:00 UTC",
    localTimeInZone("2026-10-16", 17, "UTC")?.toISOString() ===
      "2026-10-16T17:00:00.000Z",
  );
  check(
    "Berlin summer time is two hours ahead",
    localTimeInZone("2026-10-16", 17, "Europe/Berlin")?.toISOString() ===
      "2026-10-16T15:00:00.000Z",
  );
  check(
    "the spring DST change is handled on the day it happens",
    localTimeInZone("2026-03-29", 17, "Europe/Berlin")?.toISOString() ===
      "2026-03-29T15:00:00.000Z",
  );
  check(
    "the autumn DST change is handled on the day it happens",
    localTimeInZone("2026-10-25", 17, "Europe/Berlin")?.toISOString() ===
      "2026-10-25T16:00:00.000Z",
  );
  check("a date that does not exist is refused", localTimeInZone("2026-02-31", 17, "UTC") === null);
  check(
    "an unknown zone falls back to UTC rather than throwing",
    validTimeZone("Not/AZone") === null &&
      localTimeInZone("2026-10-16", 17, "Not/AZone")?.toISOString() ===
        "2026-10-16T17:00:00.000Z",
  );
  check("no date is no deadline", dueAtFrom(null, "UTC") === null && dueAtFrom("", "UTC") === null);

  /* ------------------------------------------------------------ parsing */

  check(
    "fenced JSON is unwrapped",
    typeof parseModelJson('```json\n{"summary":"ok"}\n```') === "object",
  );
  let proseThrew = false;
  try {
    parseModelJson("Here are the action items you asked for:");
  } catch {
    proseThrew = true;
  }
  check("prose instead of JSON is a failed run", proseThrew);

  const prompt = extractionUserPrompt({
    title: "Q4 planning",
    heldAt: new Date("2026-10-12T09:00:00.000Z"),
    timezone: "Europe/Berlin",
    segments: [{ token: "s1", id: "ignored", speaker: "Lena", startMs: 0, text: "Send the SOW." }],
  });
  check("the prompt labels the transcript as untrusted", SYSTEM_PROMPT.includes("untrusted data"));
  check("the prompt carries the citation token, not a UUID", prompt.includes('"s1"') && !prompt.includes("ignored"));
  check("the prompt carries the meeting date", prompt.includes("2026-10-12"));

  const degraded = rawExtractionSchema.parse({
    actionItems: [
      { title: "Do the thing", priority: "urgent", confidence: "high", sourceSegmentIds: "s1" },
    ],
  });
  check(
    "an unknown priority falls back to p2",
    degraded.actionItems[0]?.priority === "p2",
  );
  check(
    "a non-numeric confidence falls back, rather than failing the whole run",
    degraded.actionItems[0]?.confidence === 0.5,
  );
  check(
    "a citation list of the wrong type becomes no citations, which grounding will drop",
    Array.isArray(degraded.actionItems[0]?.sourceSegmentIds) &&
      degraded.actionItems[0]?.sourceSegmentIds.length === 0,
  );
  check(
    "a reply that is not an object fails the schema",
    rawExtractionSchema.safeParse(null).success === false,
  );

  /* ------------------------------------------------------------ grounding */

  const noItems = clarityScore([], []);
  check("nothing extracted is a clarity of 0", noItems === 0);

  const item = (over: Partial<GroundedItem>): GroundedItem => ({
    title: "Do the thing",
    description: null,
    ownerId: null,
    ownerRaw: null,
    ownerConfidence: null,
    dueAt: null,
    priority: "p2",
    confidence: 0.9,
    sourceSegmentIds: ["x"],
    flags: [],
    ...over,
  });
  check("Suggest never auto-approves", autoApprovable(item({}), "suggest") === false);
  check(
    "Assist needs an owner and a date",
    autoApprovable(item({ ownerId: "u", dueAt: new Date() }), "assist") === true &&
      autoApprovable(item({ ownerId: "u" }), "assist") === false,
  );
  check(
    "Autopilot can ticket without an owner or a date",
    autoApprovable(item({}), "autopilot") === true,
  );
  check(
    "no autonomy level auto-tickets an ambiguous or duplicate item",
    autoApprovable(item({ flags: ["possible_duplicate"] }), "autopilot") === false &&
      autoApprovable(item({ flags: ["ambiguous_owner"] }), "autopilot") === false,
  );

  const ambig = groundExtraction({
    raw: rawExtractionSchema.parse({
      summary: "",
      decisions: [],
      openQuestions: [],
      actionItems: [
        {
          title: "Ship the beta",
          ownerRaw: "Alex",
          dueDate: null,
          priority: "p2",
          confidence: 1.4,
          sourceSegmentIds: ["s1"],
        },
      ],
    }),
    meetingTimezone: "UTC",
    segments: [{ token: "s1", id: "00000000-0000-0000-0000-000000000001" }],
    members: [
      {
        userId: "11111111-1111-1111-1111-111111111111",
        name: "Alex Kim",
        email: "alex.kim@example.test",
        timezone: "UTC",
        aliases: [],
      },
      {
        userId: "22222222-2222-2222-2222-222222222222",
        name: "Alex Rivera",
        email: "alex.rivera@example.test",
        timezone: "UTC",
        aliases: [],
      },
    ],
  });
  check(
    "a first name that matches two members is ambiguous, not a guess",
    ambig.items[0]?.ownerId === null &&
      ambig.items[0]?.flags.includes("ambiguous_owner") === true,
  );
  check("confidence is clamped into 0..1", ambig.items[0]?.confidence === 1);
  check(
    "an item whose only citation is unknown is dropped",
    groundExtraction({
      raw: rawExtractionSchema.parse({
        actionItems: [
          {
            title: "Invented work",
            ownerRaw: null,
            dueDate: null,
            priority: "p2",
            confidence: 0.9,
            sourceSegmentIds: ["s99"],
          },
        ],
      }),
      meetingTimezone: "UTC",
      segments: [{ token: "s1", id: "00000000-0000-0000-0000-000000000001" }],
      members: [],
    }).dropped.noEvidence === 1,
  );

  /* --------------------------------------------------- extraction, happy */

  const real = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, Q4 planning",
    heldAt: new Date("2026-10-12T09:00:00.000Z"),
    createdBy: lena.id,
    segments: [
      { speaker: "Lena", text: "I'll send the revised SOW to legal by Friday." },
      { speaker: "Sam", text: "I can book the venue, no date yet." },
      { speaker: "Lena", text: "Book the venue for the offsite." },
      { speaker: "Nadia", text: "We should look at pricing at some point." },
    ],
  });

  const fixture = providerReturning({
    summary:
      "The team reviewed the Q4 launch. Lena will send the revised SOW to legal by Friday, and Sam will book the venue.",
    decisions: ["The launch stays on 15 November."],
    openQuestions: ["Who owns pricing?"],
    actionItems: [
      {
        title: "Send the revised SOW to legal",
        description: "Include the security addendum.",
        ownerRaw: "Lena",
        dueDate: "2026-10-16",
        priority: "p1",
        confidence: 0.92,
        sourceSegmentIds: ["s1"],
      },
      {
        title: "Book the venue",
        ownerRaw: "Sam",
        dueDate: null,
        priority: "p2",
        confidence: 0.7,
        sourceSegmentIds: ["s2"],
      },
      {
        title: "Book the venue for the offsite",
        ownerRaw: "Sam",
        dueDate: null,
        priority: "p3",
        confidence: 0.66,
        sourceSegmentIds: ["s3"],
      },
      {
        title: "Look at pricing",
        ownerRaw: "Zorba",
        dueDate: null,
        priority: "p3",
        confidence: 0.4,
        sourceSegmentIds: ["s4"],
      },
      {
        // The model's best guess, with no segment to back it: must not survive.
        title: "Invent a commitment nobody made",
        ownerRaw: "Lena",
        dueDate: "2026-12-01",
        priority: "p0",
        confidence: 0.99,
        sourceSegmentIds: ["s99"],
      },
      {
        title: "   ",
        ownerRaw: null,
        dueDate: null,
        priority: "p2",
        confidence: 0.5,
        sourceSegmentIds: ["s1"],
      },
    ],
  });

  const report = await extractMeeting({
    workspaceId: northwind,
    meetingId: real.meetingId,
    actorId: lena.id,
    provider: fixture,
    now: NOW,
  });

  check("a grounded extraction reports success", report.status === "extracted", report.reason ?? "");
  check("four of six proposed items survive grounding", report.items === 4, String(report.items));
  check(
    "one item had no evidence and one had no title",
    report.dropped === 2 && report.droppedNoEvidence === 1,
    JSON.stringify({ dropped: report.dropped, noEvidence: report.droppedNoEvidence }),
  );

  const stored = await withWorkspace(northwind, async (tx) => {
    const [meeting] = await tx
      .select()
      .from(t.meetings)
      .where(eq(t.meetings.id, real.meetingId));
    const items = await tx
      .select()
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, real.meetingId));
    const runs = await tx.select().from(t.aiRuns).where(eq(t.aiRuns.traceId, real.meetingId));
    const audits = await tx
      .select()
      .from(t.auditLogs)
      .where(
        and(
          eq(t.auditLogs.target, real.meetingId),
          eq(t.auditLogs.action, "meeting.extracted"),
        ),
      );
    const segments = await tx
      .select({ id: t.transcriptSegments.id })
      .from(t.transcriptSegments)
      .where(eq(t.transcriptSegments.meetingId, real.meetingId));
    const tickets = await tx.select().from(t.tickets);
    return { meeting, items, runs, audits, segments, tickets };
  });

  check(
    "the summary is stored as written by the model",
    stored.meeting?.summary?.startsWith("The team reviewed the Q4 launch.") === true,
  );
  check("a decision is stored", stored.meeting?.keyDecisions.length === 1);
  check("an open question is stored", stored.meeting?.openQuestions.length === 1);
  check(
    "clarity is arithmetic over the stored items (3 owners, 1 date, 1 decision)",
    stored.meeting?.clarityScore === 63,
    String(stored.meeting?.clarityScore),
  );  check(
    "necessity stays uncomputed rather than guessed",
    stored.meeting?.necessityScore === null,
  );

  const lenaItem = stored.items.find((row) => row.title === "Send the revised SOW to legal");
  check(
    "a first name resolves to the member",
    lenaItem?.ownerId === lena.id,
    lenaItem?.ownerId ?? "null",
  );
  check("the transcript's words are kept", lenaItem?.ownerRaw === "Lena");
  check(
    "a name that matches the email's local part resolves strongly",
    lenaItem?.ownerConfidence === "0.950",
    lenaItem?.ownerConfidence ?? "null",
  );
  check(
    "a date becomes 17:00 in the owner's zone",
    lenaItem?.dueAt?.toISOString() === "2026-10-16T15:00:00.000Z",
    lenaItem?.dueAt?.toISOString() ?? "null",
  );

  const samItem = stored.items.find((row) => row.title === "Book the venue");
  check(
    "no date is stored as null, not invented",
    samItem?.dueAt === null && samItem?.flags.includes("no_deadline") === true,
  );
  check(
    "a second, similar item is flagged as a possible duplicate",
    stored.items.find((row) => row.title === "Book the venue for the offsite")?.flags.includes(
      "possible_duplicate",
    ) === true,
  );

  const strangerItem = stored.items.find((row) => row.title === "Look at pricing");
  check(
    "an unknown name is preserved without inventing a member",
    strangerItem?.ownerId === null &&
      strangerItem?.ownerRaw === "Zorba" &&
      strangerItem?.flags.includes("no_owner") === true,
  );

  check(
    "the uncited item never reaches the database",
    stored.items.some((row) => row.title === "Invent a commitment nobody made") === false,
  );
  check(
    "every stored citation points at a segment of this meeting",
    stored.items.every((row) =>
      row.sourceSegmentIds.every((id) => stored.segments.some((segment) => segment.id === id)),
    ),
  );
  check(
    "the run is recorded with tokens, cost, latency and no nonsense",
    stored.runs.length === 1 &&
      stored.runs[0]?.model === "fixture/extract-1" &&
      stored.runs[0]?.tokensIn === 1_240 &&
      stored.runs[0]?.costUsd === "0.002100" &&
      stored.runs[0]?.latencyMs === 37,
  );
  check("the extraction is in the audit log", stored.audits.length === 1);

  /* ----------------------------------------------------------- idempotency */

  const again = await extractMeeting({
    workspaceId: northwind,
    meetingId: real.meetingId,
    actorId: lena.id,
    provider: providerReturning({ actionItems: [] }),
    now: NOW,
  });
  check("a second run refuses to duplicate the first", again.status === "already");
  const afterAgain = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.actionItems.id })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, real.meetingId)),
  );
  check("the refused run wrote nothing", afterAgain.length === 4);

  /* ------------------------------------------------------------- replacing */

  const replaced = await extractMeeting({
    workspaceId: northwind,
    meetingId: real.meetingId,
    actorId: lena.id,
    provider: providerReturning({
      summary: "Replaced minutes.",
      decisions: [],
      openQuestions: [],
      actionItems: [
        {
          title: "Replace the plan",
          ownerRaw: "Lena",
          dueDate: "2026-10-30",
          priority: "p2",
          confidence: 0.8,
          sourceSegmentIds: ["s1"],
        },
      ],
    }),
    replace: true,
    now: NOW,
  });
  const afterReplace = await withWorkspace(northwind, (tx) =>
    tx
      .select({ title: t.actionItems.title })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, real.meetingId)),
  );
  check(
    "an explicit re-run replaces the proposed items instead of doubling them",
    replaced.status === "extracted" &&
      afterReplace.length === 1 &&
      afterReplace[0]?.title === "Replace the plan",
  );

  /* --------------------------------------------------------- no transcript */

  const empty = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, no transcript",
    heldAt: new Date("2026-10-13T09:00:00.000Z"),
    createdBy: lena.id,
    segments: [],
  });
  const noTranscript = await extractMeeting({
    workspaceId: northwind,
    meetingId: empty.meetingId,
    actorId: lena.id,
    provider: MUST_NOT_RUN,
  });
  check(
    "a meeting with no transcript never reaches the provider",
    noTranscript.status === "no-transcript",
  );

  /* --------------------------------------------------------- assist mode */

  await updateSettings({
    workspaceId: northwind,
    settings: { ...baseSettings, autonomy: "assist" },
  });

  const assist = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, assist",
    heldAt: new Date("2026-10-13T10:00:00.000Z"),
    createdBy: lena.id,
    segments: [
      { speaker: "Lena", text: "I'll update the launch checklist by Tuesday." },
      { speaker: "Sam", text: "Someone should look at the pricing page." },
    ],
  });

  const assistReport = await extractMeeting({
    workspaceId: northwind,
    meetingId: assist.meetingId,
    actorId: lena.id,
    provider: providerReturning({
      summary: "Two follow-ups.",
      decisions: [],
      openQuestions: [],
      actionItems: [
        {
          title: "Update the launch checklist",
          ownerRaw: "Lena",
          dueDate: "2026-10-20",
          priority: "p1",
          confidence: 0.93,
          sourceSegmentIds: ["s1"],
        },
        {
          title: "Review the pricing page",
          ownerRaw: null,
          dueDate: null,
          priority: "p3",
          confidence: 0.9,
          sourceSegmentIds: ["s2"],
        },
      ],
    }),
    now: NOW,
  });

  check("Assist auto-approves only the eligible item", assistReport.autoApproved === 1);

  const assistRows = await withWorkspace(northwind, async (tx) => {
    const items = await tx
      .select()
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, assist.meetingId));
    const tickets = await tx
      .select()
      .from(t.tickets)
      .where(
        eq(
          t.tickets.actionItemId,
          items.find((row) => row.title === "Update the launch checklist")?.id ??
            "00000000-0000-0000-0000-000000000000",
        ),
      );
    const events = tickets[0]
      ? await tx
          .select()
          .from(t.ticketEvents)
          .where(eq(t.ticketEvents.ticketId, tickets[0].id))
      : [];
    const followups = tickets[0]
      ? await tx
          .select()
          .from(t.followups)
          .where(eq(t.followups.ticketId, tickets[0].id))
      : [];
    return { items, tickets, events, followups };
  });

  check(
    "the approved item became a ticket",
    assistRows.tickets.length === 1 &&
      assistRows.items.find((row) => row.title === "Update the launch checklist")?.status ===
        "ticketed",
  );
  check(
    "the agent is recorded as the actor, not a person",
    assistRows.events.some(
      (event) => event.actorKind === "prepo" && event.actorId === null,
    ),
  );
  check(
    "the approved ticket got its follow-up ladder",
    assistRows.followups.length > 0,
    `${assistRows.followups.length} rows`,
  );
  check(
    "the item that cannot be auto-approved stays for review",
    assistRows.items.find((row) => row.title === "Review the pricing page")?.status ===
      "proposed",
  );

  /* ------------------------------------------------------ autopilot mode */

  await updateSettings({
    workspaceId: northwind,
    settings: { ...baseSettings, autonomy: "autopilot" },
  });

  const auto = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, autopilot",
    heldAt: new Date("2026-10-14T10:00:00.000Z"),
    createdBy: lena.id,
    segments: [{ speaker: "Nadia", text: "The pricing page needs a refresh and the copy needs a refresh too." }],
  });

  const autoReport = await extractMeeting({
    workspaceId: northwind,
    meetingId: auto.meetingId,
    actorId: null,
    provider: providerReturning({
      summary: "Pricing page refresh.",
      decisions: [],
      openQuestions: [],
      actionItems: [
        {
          title: "Refresh the pricing page",
          ownerRaw: null,
          dueDate: null,
          priority: "p2",
          confidence: 0.9,
          sourceSegmentIds: ["s1"],
        },
        {
          title: "Refresh the pricing page copy",
          ownerRaw: null,
          dueDate: null,
          priority: "p3",
          confidence: 0.9,
          sourceSegmentIds: ["s1"],
        },
      ],
    }),
    now: NOW,
  });

  check(
    "Autopilot tickets a confident item with no owner and no date",
    autoReport.autoApproved === 1,
    String(autoReport.autoApproved),
  );
  const autoStatuses = await withWorkspace(northwind, (tx) =>
    tx
      .select({ title: t.actionItems.title, status: t.actionItems.status })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, auto.meetingId)),
  );
  check(
    "Autopilot still leaves the possible duplicate for a person",
    autoStatuses.find((row) => row.title === "Refresh the pricing page copy")?.status ===
      "proposed",
  );

  /* ------------------------------------------------------------ refusals */

  const long = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, too long",
    heldAt: new Date("2026-10-15T09:00:00.000Z"),
    createdBy: lena.id,
    segments: [{ speaker: "Lena", text: "x".repeat(200) }],
  });
  const tooLong = await extractMeeting({
    workspaceId: northwind,
    meetingId: long.meetingId,
    actorId: lena.id,
    provider: MUST_NOT_RUN,
    limits: { maxChars: 100 },
  });
  check(
    "a transcript over the cap is refused, not truncated",
    tooLong.status === "too-long" && (tooLong.reason?.includes("100") ?? false),
  );

  const budget = await extractMeeting({
    workspaceId: northwind,
    meetingId: long.meetingId,
    actorId: lena.id,
    provider: MUST_NOT_RUN,
    limits: { maxChars: DEFAULT_EXTRACTION_LIMITS.maxChars, monthlyRuns: 0 },
    replace: true,
  });
  check("a workspace over its monthly runs is refused", budget.status === "over-budget");

  const unconfigured = await extractMeeting({
    workspaceId: northwind,
    meetingId: empty.meetingId,
    actorId: lena.id,
    provider: null,
  });
  check(
    "an unconfigured deployment writes nothing and says so",
    unconfigured.status === "unconfigured" &&
      typeof unconfigured.reason === "string" &&
      unconfigured.reason.includes("Extraction is not configured"),
  );

  const invalidMeeting = await createMeeting({
    workspaceId: northwind,
    title: "Extraction fixture, invalid reply",
    heldAt: new Date("2026-10-15T11:00:00.000Z"),
    createdBy: lena.id,
    segments: [{ speaker: "Sam", text: "Let's try the extraction." }],
  });
  const invalid = await extractMeeting({
    workspaceId: northwind,
    meetingId: invalidMeeting.meetingId,
    actorId: lena.id,
    provider: providerReturning(null, { costUsd: 0.001 }),
    now: NOW,
  });
  const invalidRows = await withWorkspace(northwind, async (tx) => ({
    items: await tx
      .select({ id: t.actionItems.id })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, invalidMeeting.meetingId)),
    runs: await tx
      .select()
      .from(t.aiRuns)
      .where(eq(t.aiRuns.traceId, invalidMeeting.meetingId)),
  }));
  check(
    "a reply that is not the agreed shape imports nothing",
    invalid.status === "invalid" && invalidRows.items.length === 0,
  );
  check(
    "but the spend is still recorded",
    invalidRows.runs.length === 1 && invalidRows.runs[0]?.costUsd === "0.001000",
  );

  /* -------------------------------------------------------------- tenancy */

  const missing = await extractMeeting({
    workspaceId: northwind,
    meetingId: uuidv7(),
    actorId: lena.id,
    provider: MUST_NOT_RUN,
  });
  check("an unknown meeting is not found", missing.status === "not-found");

  const foreign = await createMeeting({
    workspaceId: globex,
    title: "Globex fixture, not yours",
    heldAt: new Date("2026-10-16T09:00:00.000Z"),
    createdBy: null,
    segments: [{ speaker: "Nadia", text: "Globex internal notes." }],
  });
  const crossTenant = await extractMeeting({
    workspaceId: northwind,
    meetingId: foreign.meetingId,
    actorId: lena.id,
    provider: MUST_NOT_RUN,
  });
  const foreignAfter = await withWorkspace(globex, async (tx) => ({
    meeting: await tx
      .select({ summary: t.meetings.summary })
      .from(t.meetings)
      .where(eq(t.meetings.id, foreign.meetingId)),
    items: await tx
      .select({ id: t.actionItems.id })
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, foreign.meetingId)),
  }));
  check(
    "another workspace's meeting is indistinguishable from a missing one",
    crossTenant.status === "not-found",
  );
  check(
    "and it was not written to",
    foreignAfter.meeting[0]?.summary === null && foreignAfter.items.length === 0,
  );

  /* -------------------------------------------------------------- restore */

  // The demo workspace's settings and data go back to how they were. The TOTP
  // and audio fixtures are dropped by seed(); reinstall them after this suite.
  await seed();

  console.log("");
  if (failures === 0) {
    console.log("all extraction checks passed");
    return;
  }

  console.log(`${failures} check(s) failed`);
  throw new Error(`${failures} extraction check(s) failed`);
}, "fresh");
