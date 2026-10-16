import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** tsvector has no native Drizzle type; declared here for the FTS column. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/* ---------------------------------------------------------------- enums */

export const clientType = pgEnum("client_type", ["web", "pwa", "desktop"]);
export const membershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);
export const meetingSource = pgEnum("meeting_source", [
  "paste",
  "upload",
  "recording",
]);
export const meetingStatus = pgEnum("meeting_status", [
  "processing",
  "ready",
  "failed",
]);
export const audioStatus = pgEnum("audio_status", [
  "uploaded",
  "transcribing",
  "transcribed",
  "failed",
  "deleted",
]);
export const priority = pgEnum("priority", ["p0", "p1", "p2", "p3"]);
export const actionItemStatus = pgEnum("action_item_status", [
  "proposed",
  "approved",
  "rejected",
  "ticketed",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);
export const followupKind = pgEnum("followup_kind", [
  "reminder",
  "nudge",
  "escalation",
  "digest",
]);
export const followupChannel = pgEnum("followup_channel", [
  "email",
  "in_app",
  "push",
]);
export const followupStatus = pgEnum("followup_status", [
  "scheduled",
  "sent",
  "cancelled",
  "failed",
]);
export const integrationProvider = pgEnum("integration_provider", ["linear"]);
export const integrationStatus = pgEnum("integration_status", [
  "connected",
  "error",
  "disconnected",
]);
export const savedViewScope = pgEnum("saved_view_scope", [
  "board",
  "tickets",
  "meetings",
]);

/* ------------------------------------------------------- identity tables */

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceLabel: text("device_label").notNull(),
    clientType: clientType("client_type").notNull().default("web"),
    userAgentHash: text("user_agent_hash").notNull(),
    ipPrefix: text("ip_prefix"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id"),
    /** Encrypted at rest with AES-256-GCM. Never read by the browser. */
    totpSecret: text("totp_secret"),
    credentialId: text("credential_id"),
    publicKey: text("public_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

/* --------------------------------------------------------- tenant tables */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings")
    .$type<{
      autonomy?: string;
      followupTone?: string;
      quietHours?: { from: string; to: string };
      audioRetentionDays?: number;
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("member"),
    /** Name variants used for owner matching ("Sam", "Sam from design"). */
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_ws_user_idx").on(table.workspaceId, table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("invitations_ws_idx").on(table.workspaceId)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    heldAt: timestamp("held_at", { withTimezone: true }).notNull(),
    source: meetingSource("source").notNull(),
    status: meetingStatus("status").notNull().default("processing"),
    clarityScore: integer("clarity_score"),
    necessityScore: integer("necessity_score"),
    summary: text("summary"),
    keyDecisions: text("key_decisions").array().notNull().default(sql`'{}'`),
    openQuestions: text("open_questions").array().notNull().default(sql`'{}'`),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meetings_ws_held_idx").on(table.workspaceId, table.heldAt),
  ],
);

export const audioAssets = pgTable(
  "audio_assets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    durationS: integer("duration_s"),
    sizeBytes: integer("size_bytes"),
    status: audioStatus("status").notNull().default("uploaded"),
    deleteAfter: timestamp("delete_after", { withTimezone: true }),
    consentConfirmedBy: uuid("consent_confirmed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audio_ws_idx").on(table.workspaceId)],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    speakerLabel: text("speaker_label").notNull(),
    speakerUserId: uuid("speaker_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    tsv: tsvector("tsv"),
  },
  (table) => [
    index("segments_meeting_idx").on(table.meetingId, table.idx),
  ],
);

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ownerRaw: text("owner_raw"),
    ownerConfidence: numeric("owner_confidence", { precision: 4, scale: 3 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: priority("priority").notNull().default("p2"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    /** Evidence required: no source segment, no ticket. */
    sourceSegmentIds: uuid("source_segment_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    flags: text("flags").array().notNull().default(sql`'{}'`),
    status: actionItemStatus("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("action_items_meeting_idx").on(table.meetingId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    actionItemId: uuid("action_item_id").references(() => actionItems.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: ticketStatus("status").notNull().default("backlog"),
    priority: priority("priority").notNull().default("p2"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    position: integer("position").notNull().default(0),
    /** Optimistic concurrency: mismatched If-Match returns 409. */
    version: integer("version").notNull().default(1),
    linearIssueId: text("linear_issue_id"),
    linearUrl: text("linear_url"),
    linearSyncedAt: timestamp("linear_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tickets_ws_key_idx").on(table.workspaceId, table.key),
    index("tickets_ws_status_idx").on(table.workspaceId, table.status),
  ],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    /** A user id, or null when the actor is the agent. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorKind: text("actor_kind").notNull().default("user"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ticket_events_ticket_idx").on(table.ticketId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Sanitised before storage. */
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("comments_ticket_idx").on(table.ticketId)],
);

export const followups = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    kind: followupKind("kind").notNull(),
    channel: followupChannel("channel").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: followupStatus("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("followups_ws_sched_idx").on(table.workspaceId, table.scheduledFor),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.readAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, {
    onDelete: "cascade",
  }),
  endpoint: text("endpoint").notNull().unique(),
  /** Encrypted VAPID subscription keys. */
  keys: text("keys").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    /** AES-256-GCM ciphertext; the key lives outside the database. */
    encryptedToken: text("encrypted_token").notNull(),
    teamId: text("team_id"),
    mapping: jsonb("mapping").notNull().default({}),
    sourceOfTruth: text("source_of_truth").notNull().default("prepo"),
    status: integrationStatus("status").notNull().default("connected"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("integrations_ws_provider_idx").on(
      table.workspaceId,
      table.provider,
    ),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("api_keys_ws_idx").on(table.workspaceId)],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("share_links_meeting_idx").on(table.meetingId)],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scope: savedViewScope("scope").notNull(),
    filters: jsonb("filters").notNull().default({}),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("saved_views_ws_idx").on(table.workspaceId)],
);

/* --------------------------------------------------- telemetry / audit */

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    latencyMs: integer("latency_ms"),
    traceId: text("trace_id"),
    evalScore: numeric("eval_score", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ai_runs_ws_idx").on(table.workspaceId)],
);

export const sttRuns = pgTable("stt_runs", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  audioAssetId: uuid("audio_asset_id").references(() => audioAssets.id, {
    onDelete: "set null",
  }),
  provider: text("provider").notNull(),
  durationS: integer("duration_s"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    ipPrefix: text("ip_prefix"),
    uaHash: text("ua_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audit_ws_created_idx").on(table.workspaceId, table.createdAt)],
);

/* ----------------------------------------------------------- ts types */

export type ClientType = (typeof clientType.enumValues)[number];
export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type MeetingSource = (typeof meetingSource.enumValues)[number];
export type MeetingStatus = (typeof meetingStatus.enumValues)[number];
export type AudioStatus = (typeof audioStatus.enumValues)[number];
export type Priority = (typeof priority.enumValues)[number];
export type ActionItemStatus = (typeof actionItemStatus.enumValues)[number];
export type TicketStatus = (typeof ticketStatus.enumValues)[number];
export type FollowupKind = (typeof followupKind.enumValues)[number];
export type FollowupChannel = (typeof followupChannel.enumValues)[number];
export type FollowupStatus = (typeof followupStatus.enumValues)[number];
export type IntegrationProvider = (typeof integrationProvider.enumValues)[number];
export type IntegrationStatus = (typeof integrationStatus.enumValues)[number];
export type SavedViewScope = (typeof savedViewScope.enumValues)[number];
