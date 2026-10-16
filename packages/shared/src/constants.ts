export const BRAND = {
  name: "Prepo",
  tagline: "The meeting ends. The work starts.",
  description:
    "Prepo reads your meeting minutes, creates a ticket for every action, and follows up with owners until it's done.",
} as const;

export const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "Download", href: "#download" },
] as const;

export const WORKSPACE = {
  name: "Northwind Studio",
  slug: "northwind",
} as const;

export const AUTONOMY_LEVELS = [
  {
    id: "suggest",
    name: "Suggest",
    description: "Everything needs approval before it becomes a ticket.",
  },
  {
    id: "assist",
    name: "Assist",
    description: "Auto-ticket only high-confidence items that have an owner and a date.",
  },
  {
    id: "autopilot",
    name: "Autopilot",
    description: "Auto-ticket and auto-follow-up. External side effects are logged and reversible.",
  },
] as const;

export type AutonomyLevelId = (typeof AUTONOMY_LEVELS)[number]["id"];

export const TICKET_STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "in_review", label: "In review" },
  { id: "done", label: "Done" },
] as const;

export type TicketStatusId = (typeof TICKET_STATUSES)[number]["id"];

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type PriorityId = (typeof PRIORITIES)[number];

export const ACTION_ITEM_FLAGS = [
  "no_owner",
  "no_deadline",
  "ambiguous_owner",
  "possible_duplicate",
] as const;
export type ActionItemFlag = (typeof ACTION_ITEM_FLAGS)[number];

export const FLAG_COPY: Record<ActionItemFlag, string> = {
  no_owner: "No owner mentioned",
  no_deadline: "No deadline",
  ambiguous_owner: "Ambiguous owner",
  possible_duplicate: "Possible duplicate",
};

export const ESCALATION_LADDER = [
  { when: "24h before due", action: "Reminder to owner", channel: "email + in-app" },
  { when: "On the due day", action: "Reminder to owner", channel: "email + in-app" },
  { when: "Overdue +1 day", action: "Nudge to owner", channel: "email + in-app + push" },
  { when: "Overdue +3 days", action: "Escalate to meeting organizer", channel: "email" },
  { when: "Monday", action: "Weekly digest", channel: "email" },
] as const;

export const PIPELINE_STAGES = [
  "Upload",
  "Transcribe",
  "Understand",
  "Extract",
  "Match owners",
] as const;

export const SECURITY_PILLARS = [
  {
    title: "Access",
    body: "Passkeys, TOTP 2FA, and per-device sessions you can revoke instantly.",
  },
  {
    title: "Data",
    body: "Workspace isolation with Postgres RLS, encryption at rest, and audio that deletes itself.",
  },
  {
    title: "AI",
    body: "Prompt-injection defenses, evidence-required outputs, and human approval by default.",
  },
  {
    title: "Assurance",
    body: "OWASP ASVS Level 2 aligned with an append-only audit log.",
  },
] as const;
