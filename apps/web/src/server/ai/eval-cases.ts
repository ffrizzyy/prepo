import type { RawExtraction } from "./schema";

/**
 * Golden transcripts and the recorded model output for each one.
 *
 * The outputs are hand-authored to look like a plausible model reply, and they
 * are deliberately imperfect: one meeting loses an action item, one adds an
 * item nobody promised, and one assigns the wrong owner and date. A fixture
 * that matched its gold set perfectly would make the gate a tautology.
 *
 * The citations (`s1`, `s2`, ...) point at the transcript lines below, because
 * grounding would refuse an item that cites nothing. The dates are the words
 * the transcript actually used; the evaluation compares them back in the
 * meeting's own zone (Europe/Berlin, the creator's timezone).
 */

export type EvalCase = {
  id: string;
  title: string;
  heldAt: string;
  segments: { speaker: string; text: string }[];
  fixture: RawExtraction;
  gold: { title: string; ownerName: string; dueDate: string }[];
};

export const EVAL_CASES: EvalCase[] = [
  {
    id: "q4-launch",
    title: "Q4 launch sync",
    heldAt: "2026-10-20T09:00:00.000Z",
    segments: [
      {
        speaker: "Lena",
        text: "Let's lock the Q4 launch for the first week of November. The checklist is the thing that keeps slipping.",
      },
      {
        speaker: "Priya",
        text: "I'll draft the launch checklist by Friday the twenty-fourth, and put it in the shared drive.",
      },
      {
        speaker: "Lena",
        text: "I'll book the customer webinar by the twenty-eighth. I need the final speaker list before that.",
      },
      {
        speaker: "Sam",
        text: "The pricing page copy will be final by the twenty-seventh. Design review is already booked.",
      },
      {
        speaker: "Lena",
        text: "Good. The roadmap slides can wait until after launch; nobody is asking for them this week.",
      },
    ],
    fixture: {
      summary:
        "The team locked the Q4 launch for the first week of November. Checklist, webinar and pricing copy are the critical path before launch.",
      decisions: ["Launch in the first week of November."],
      openQuestions: ["Who presents at the customer webinar?"],
      actionItems: [
        {
          title: "Draft the launch checklist",
          description: "Put the checklist in the shared drive.",
          ownerRaw: "Priya",
          dueDate: "2026-10-24",
          priority: "p1",
          confidence: 0.92,
          sourceSegmentIds: ["s2"],
        },
        {
          title: "Book the customer webinar",
          description: "Needs the final speaker list first.",
          ownerRaw: "Lena",
          dueDate: "2026-10-28",
          priority: "p1",
          confidence: 0.9,
          sourceSegmentIds: ["s3"],
        },
        {
          title: "Finalize the pricing page copy",
          description: "Design review is booked.",
          ownerRaw: "Sam",
          dueDate: "2026-10-27",
          priority: "p2",
          confidence: 0.88,
          sourceSegmentIds: ["s4"],
        },
        {
          title: "Update the roadmap slide",
          description: "Nobody asked for this this week, but the model proposed it anyway.",
          ownerRaw: null,
          dueDate: null,
          priority: "p3",
          confidence: 0.4,
          sourceSegmentIds: ["s5"],
        },
      ],
    },
    gold: [
      { title: "Draft the launch checklist", ownerName: "Priya Nair", dueDate: "2026-10-24" },
      { title: "Book the customer webinar", ownerName: "Lena Fischer", dueDate: "2026-10-28" },
      { title: "Finalize the pricing page copy", ownerName: "Sam Rivera", dueDate: "2026-10-27" },
    ],
  },
  {
    id: "client-kickoff",
    title: "Client kickoff",
    heldAt: "2026-10-21T13:00:00.000Z",
    segments: [
      {
        speaker: "Dana",
        text: "I'll send the onboarding questionnaire tomorrow, the twenty-third. Legal has already approved the wording.",
      },
      {
        speaker: "Marco",
        text: "I can schedule the technical deep dive for the thirtieth, once their data team confirms the timezone.",
      },
      {
        speaker: "Lena",
        text: "Marco, can you own the deep dive end to end? I don't want two people booking the same room.",
      },
      {
        speaker: "Marco",
        text: "Yes, mine. I'll send the invite after their confirmation.",
      },
      {
        speaker: "Dana",
        text: "I'll share the slide deck once it's updated. That's housekeeping, not a client commitment.",
      },
    ],
    fixture: {
      summary:
        "The client kickoff covered onboarding, a technical deep dive and the slide deck. Legal approved the questionnaire.",
      decisions: ["The deep dive has one owner."],
      openQuestions: ["When will the client confirm their timezone?"],
      actionItems: [
        {
          title: "Send the onboarding questionnaire",
          description: "Legal approved the wording.",
          ownerRaw: "Dana",
          dueDate: "2026-10-23",
          priority: "p1",
          confidence: 0.94,
          sourceSegmentIds: ["s1"],
        },
        {
          title: "Share the updated slide deck",
          description: "Housekeeping, not a client commitment.",
          ownerRaw: null,
          dueDate: null,
          priority: "p3",
          confidence: 0.35,
          sourceSegmentIds: ["s5"],
        },
      ],
    },
    gold: [
      { title: "Send the onboarding questionnaire", ownerName: "Dana Okafor", dueDate: "2026-10-23" },
      { title: "Schedule the technical deep dive", ownerName: "Marco Bianchi", dueDate: "2026-10-30" },
    ],
  },
  {
    id: "ops-standup",
    title: "Ops standup",
    heldAt: "2026-10-21T08:00:00.000Z",
    segments: [
      {
        speaker: "Marco",
        text: "I'll rotate the staging database credentials tomorrow, the twenty-second. It's overdue from last month.",
      },
      {
        speaker: "Priya",
        text: "Add an alert for queue depth by Sunday the twenty-fifth. We were blind for two hours yesterday.",
      },
      {
        speaker: "Lena",
        text: "Priya, that alert is yours? I want one owner for it.",
      },
      {
        speaker: "Priya",
        text: "Yes, mine. I'll wire it into the existing dashboard.",
      },
    ],
    fixture: {
      summary:
        "Staging credentials rotate tomorrow, and queue depth gets an alert by the twenty-fifth. One owner each.",
      decisions: ["Queue depth alerts go into the existing dashboard."],
      openQuestions: [],
      actionItems: [
        {
          title: "Rotate the staging database credentials",
          description: "Overdue from last month.",
          ownerRaw: "Marco",
          dueDate: "2026-10-23",
          priority: "p0",
          confidence: 0.9,
          sourceSegmentIds: ["s1"],
        },
        {
          title: "Add an alert for queue depth",
          description: "Wire it into the existing dashboard.",
          ownerRaw: "Sam",
          dueDate: "2026-10-25",
          priority: "p1",
          confidence: 0.82,
          sourceSegmentIds: ["s2"],
        },
      ],
    },
    gold: [
      { title: "Rotate the staging database credentials", ownerName: "Marco Bianchi", dueDate: "2026-10-22" },
      { title: "Add an alert for queue depth", ownerName: "Priya Nair", dueDate: "2026-10-25" },
    ],
  },
];
