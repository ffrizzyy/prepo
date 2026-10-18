import { eq } from "drizzle-orm";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import {
  ENCRYPTION_UNCONFIGURED,
  applyRemoteChange,
  availableTeams,
  backoffMs,
  connectLinear,
  connectionFrom,
  disconnectLinear,
  integrationSummary,
  pullWorkspace,
  pushTicket,
  readIntegration,
  runLinearSync,
  setLinearTeam,
  updateLinearSettings,
  type LinearDeps,
} from "../linear/sync";
import {
  decryptSecret,
  encryptSecret,
  integratingKey,
  secretEquals,
  type EncryptionKey,
} from "../linear/crypto";
import { fixtureLinear } from "../linear/fixture";
import {
  DEFAULT_MAPPING,
  fromLinearDate,
  issueDescription,
  labelsToLinear,
  matchLinearMember,
  priorityFromLinear,
  priorityToLinear,
  statusFromLinear,
  statusToLinear,
  toLinearDate,
} from "../linear/mapping";
import { linearConnected, queueForLinear } from "../linear/queue";
import {
  changeFromEvent,
  parseEvent,
  signBody,
  verifySignature,
  type LinearEvent,
} from "../linear/webhook";
import { moveTicket } from "../writes";
import { withWorkspace } from "./client";
import { uuidv7 } from "./ids";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

/**
 * The Linear sync, checked end to end:
 *   pnpm --filter @prepo/web db:linear-smoke
 *
 * Everything that can be arithmetic is asserted as arithmetic: the mapping, the
 * backoff, the signature check, the replay window and the payload reduction.
 *
 * The engine is then run against a *real object* — an in-memory Linear with real
 * state (`../linear/fixture`) — so the suite can read back what Prepo sent, edit
 * an issue behind the app's back to simulate a pull, and make a call fail to
 * exercise the retry path. Nothing here is a stub return value.
 *
 * What this suite therefore does **not** prove: that Linear itself answers the
 * way the fixture does. That needs a real key, and the honest way to do it is
 * `db:providers --live` (which the suite cannot run for you) plus a deliberate
 * push at a real team.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** A fixed moment, so the backoff window is arithmetic rather than a race. */
const NOW = new Date("2026-11-02T09:00:00.000Z");

const KEY: EncryptionKey = { key: Buffer.alloc(32, 7), source: "fixture" };
const OTHER_KEY: EncryptionKey = { key: Buffer.alloc(32, 9), source: "fixture" };
const TOKEN = "lin_api_fixture_token_value";

function depsFor(fixture: ReturnType<typeof fixtureLinear>): LinearDeps {
  return { key: KEY, clientFor: () => fixture.client };
}

async function ticketRow(workspaceId: string, ticketId: string) {
  return withWorkspace(
    workspaceId,
    async (tx) =>
      (await tx.select().from(t.tickets).where(eq(t.tickets.id, ticketId)))[0] ??
      null,
  );
}

async function eventTypes(
  workspaceId: string,
  ticketId: string,
): Promise<string[]> {
  return withWorkspace(workspaceId, async (tx) =>
    (
      await tx
        .select({ type: t.ticketEvents.type })
        .from(t.ticketEvents)
        .where(eq(t.ticketEvents.ticketId, ticketId))
    ).map((row) => row.type),
  );
}

runCli("linear-smoke.ts", async () => {
  await migrateAndApply();
  await seed();

  const northwind = (await resolveWorkspaceId("northwind"))!;
  const globex = (await resolveWorkspaceId("globex"))!;
  const lena = (await getUserByEmail(DEMO.email))!;

  /* --------------------------------------------------------------- crypto */

  const sealed = encryptSecret(TOKEN, KEY);
  check(
    "a token round-trips through encryption",
    decryptSecret(sealed, KEY) === TOKEN,
  );
  check(
    "the stored form is versioned and carries no plaintext",
    sealed.startsWith("v1.") && !sealed.includes(TOKEN),
  );
  check("a different key cannot read it", decryptSecret(sealed, OTHER_KEY) === null);

  const [version, iv, body, tag] = sealed.split(".");
  const flipped =
    body!.slice(0, -1) + (body!.endsWith("A") ? "B" : "A");
  check(
    "a tampered ciphertext is refused rather than thrown",
    decryptSecret([version, iv, flipped, tag].join("."), KEY) === null,
  );
  check("a missing value decrypts to null", decryptSecret(null, KEY) === null);

  check(
    "a 64-character hex key is accepted",
    integratingKey({ INTEGRATION_ENCRYPTION_KEY: "a".repeat(64) })?.key
      .length === 32,
  );
  check(
    "a 32-byte base64 key is accepted",
    integratingKey({
      INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    })?.key.length === 32,
  );
  check(
    "a key of the wrong length is refused, not padded",
    integratingKey({ INTEGRATION_ENCRYPTION_KEY: "tooshort" }) === null,
  );
  check(
    "no key set means no key, never a default",
    integratingKey({}) === null,
  );
  check(
    "secret comparison is not fooled by a shared prefix",
    secretEquals("abc", "abd") === false && secretEquals("abc", "abc") === true,
  );

  /* -------------------------------------------------------------- mapping */

  check("p0 maps to Linear's urgent", priorityToLinear("p0", DEFAULT_MAPPING) === 1);
  check("p3 maps to Linear's low", priorityToLinear("p3", DEFAULT_MAPPING) === 4);
  check(
    "Linear's 'no priority' is not invented into a Prepo one",
    priorityFromLinear(0, DEFAULT_MAPPING) === null,
  );
  check("done maps to Linear's completed state type", statusToLinear("done", DEFAULT_MAPPING) === "completed");
  check(
    "in review has no Linear state type of its own and shares started",
    statusToLinear("in_review", DEFAULT_MAPPING) === "started",
  );
  check("completed comes back as done", statusFromLinear("completed") === "done");
  check(
    "cancelled has no Prepo equivalent and is left unmapped",
    statusFromLinear("canceled") === null,
  );
  check(
    "labels map by name by default",
    labelsToLinear(["bug", "from-meeting"], DEFAULT_MAPPING).join(",") ===
      "bug,from-meeting",
  );
  check(
    "a label override is applied",
    labelsToLinear(["bug"], {
      ...DEFAULT_MAPPING,
      labels: { bug: "Defect" },
    }).join(",") === "Defect",
  );

  const remoteMembers = [
    { id: "u1", name: "Lena", email: "Lena@Northwind.dev" },
  ];
  check(
    "owners match by email, case-insensitively",
    matchLinearMember("lena@northwind.dev", DEFAULT_MAPPING, remoteMembers)?.id ===
      "u1",
  );
  check(
    "an owner override is applied before matching",
    matchLinearMember(
      "lena.work@example.com",
      { ...DEFAULT_MAPPING, owners: { "lena.work@example.com": "lena@northwind.dev" } },
      remoteMembers,
    )?.id === "u1",
  );
  check(
    "an address Linear does not know matches nobody",
    matchLinearMember("nobody@example.com", DEFAULT_MAPPING, remoteMembers) === null,
  );
  check(
    "a ticket with no owner matches nobody",
    matchLinearMember(null, DEFAULT_MAPPING, remoteMembers) === null,
  );

  check(
    "a date becomes a plain yyyy-mm-dd",
    toLinearDate(new Date("2026-11-05T13:45:00.000Z")) === "2026-11-05",
  );
  check(
    "a Linear date comes back at UTC midnight, so it cannot drift",
    fromLinearDate("2026-11-05")?.toISOString() === "2026-11-05T00:00:00.000Z",
  );
  check(
    "a missing date stays missing",
    toLinearDate(null) === null && fromLinearDate(null) === null,
  );

  const described = issueDescription({
    description: "Ship the pricing page.",
    workspaceSlug: "northwind",
    ticketKey: "PRE-901",
    origin: {
      meetingTitle: "Q4 Launch — Weekly Sync",
      quote: "Lena: get the pricing page out before the 5th.",
    },
    appUrl: "https://prepo.example",
  });
  check("the issue body carries the ticket's own words", described.includes("Ship the pricing page."));
  check(
    "the issue body backlinks to the ticket",
    described.includes("https://prepo.example/northwind/tickets/PRE-901"),
  );
  check(
    "the issue body names the meeting and quotes it",
    described.includes("Q4 Launch") &&
      described.includes("get the pricing page out"),
  );
  const noUrl = issueDescription({
    description: null,
    workspaceSlug: "northwind",
    ticketKey: "PRE-901",
    origin: null,
    appUrl: null,
  });
  check(
    "with no app URL the body names the key instead of a broken link",
    noUrl.includes("PRE-901") && !noUrl.includes("http"),
  );

  /* -------------------------------------------------------------- webhook */

  const webhookSecret = "whsec_fixture";
  const payload = JSON.stringify({
    action: "update",
    type: "Issue",
    data: {
      id: "fixture-issue-1",
      identifier: "ENG-101",
      state: { id: "state-done", name: "Done", type: "completed" },
      updatedAt: "2026-11-01T09:00:00.000Z",
    },
    webhookTimestamp: NOW.getTime(),
  });
  const signature = signBody(payload, webhookSecret);

  check(
    "a signature verifies against its own secret",
    verifySignature({ body: payload, signature, secret: webhookSecret }),
  );
  check(
    "a wrong secret does not verify",
    verifySignature({ body: payload, signature, secret: "whsec_other" }) === false,
  );
  check(
    "a tampered body does not verify",
    verifySignature({
      body: payload.replace("completed", "canceled"),
      signature,
      secret: webhookSecret,
    }) === false,
  );
  check(
    "a missing signature does not verify",
    verifySignature({ body: payload, signature: null, secret: webhookSecret }) === false,
  );

  check("a body that is not JSON is rejected", parseEvent("not json").ok === false);
  check(
    "a body with no action is rejected",
    parseEvent(JSON.stringify({ type: "Issue", data: {} })).ok === false,
  );
  check(
    "a body with no data is rejected",
    parseEvent(JSON.stringify({ action: "update", type: "Issue" })).ok === false,
  );
  check(
    "a fresh delivery is accepted",
    parseEvent(payload, { now: new Date(NOW.getTime() + 5_000) }).ok === true,
  );
  const stale = parseEvent(
    JSON.stringify({ ...JSON.parse(payload), webhookTimestamp: NOW.getTime() - 120_000 }),
    { now: NOW },
  );
  check(
    "a delivery older than the replay window is rejected",
    stale.ok === false && !stale.ok && stale.reason.includes("old"),
  );
  check(
    "a delivery timestamped in the future is rejected",
    parseEvent(
      JSON.stringify({ ...JSON.parse(payload), webhookTimestamp: NOW.getTime() + 120_000 }),
      { now: NOW },
    ).ok === false,
  );

  const event = JSON.parse(payload) as LinearEvent;
  const change = changeFromEvent(event, "team-eng");
  check("an issue update becomes a patch", change?.patch.stateType === "completed");
  check(
    "a field absent from the payload is not touched",
    change?.patch.assigneeEmail === undefined,
  );
  check(
    "a field present and null means cleared, not absent",
    changeFromEvent(
      { action: "update", type: "Issue", data: { id: "x", assignee: null } },
      "team-eng",
    )?.patch.assigneeEmail === null,
  );
  check(
    "a payload with nothing the sync cares about is not meaningful",
    changeFromEvent(
      { action: "update", type: "Issue", data: { id: "x", labelIds: ["l1"] } },
      "team-eng",
    )?.meaningful === false,
  );
  check(
    "a comment event is ignored entirely",
    changeFromEvent(
      { action: "create", type: "Comment", data: { id: "c1" } },
      "team-eng",
    ) === null,
  );
  check(
    "a deleted issue becomes a removal",
    changeFromEvent(
      { action: "remove", type: "Issue", data: { id: "x" } },
      "team-eng",
    )?.removed === true,
  );

  /* -------------------------------------------- a workspace with no Linear */

  const ticketId = uuidv7();
  await withWorkspace(northwind, (tx) =>
    tx.insert(t.tickets).values({
      id: ticketId,
      workspaceId: northwind,
      key: "PRE-901",
      title: "Ship the pricing page",
      description: "Rework the pricing page before the launch.",
      assigneeId: lena.id,
      status: "todo",
      priority: "p1",
      dueAt: new Date("2026-11-05T00:00:00.000Z"),
      labels: ["from-meeting"],
      position: 901,
      version: 1,
    }),
  );

  check(
    "a workspace with no integration row is not connected",
    (await withWorkspace(northwind, (tx) => linearConnected(tx, northwind))) === false,
  );
  check(
    "a local write queues nothing while Linear is disconnected",
    (await withWorkspace(northwind, (tx) =>
      queueForLinear(tx, { workspaceId: northwind, ticketId }),
    )) === false,
  );
  check(
    "and the ticket stays 'never offered' rather than piling up a queue",
    (await ticketRow(northwind, ticketId))?.linearSyncState === null,
  );

  await moveTicket({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId,
    status: "in_progress",
  });
  check(
    "moving a disconnected ticket still does not queue it",
    (await ticketRow(northwind, ticketId))?.linearSyncState === null,
  );

  const noTeam = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixtureLinear()) });
  check(
    "pushing with no connection refuses with a reason",
    noTeam.ok === false && noTeam.detail.includes("not connected"),
  );

  /* ------------------------------------------------------- connecting */

  const withoutKey = await connectLinear({
    workspaceId: northwind,
    actorId: lena.id,
    token: TOKEN,
    deps: { key: null },
  });
  check(
    "a token cannot be stored without an encryption key",
    withoutKey.ok === false && withoutKey.reason === ENCRYPTION_UNCONFIGURED,
  );

  const fixture = fixtureLinear();
  const connected = await connectLinear({
    workspaceId: northwind,
    actorId: lena.id,
    token: TOKEN,
    deps: depsFor(fixture),
  });
  check(
    "connecting checks the token against Linear before storing anything",
    connected.ok === true && connected.viewer.email === "lena@northwind.dev",
  );
  check(
    "connecting shows the teams to choose from",
    connected.ok === true && connected.teams.some((team) => team.key === "ENG"),
  );

  const summary = await integrationSummary(northwind, { key: KEY });
  check(
    "the summary reports a usable connection",
    summary.connected && summary.usable && summary.encryptionReady,
  );
  check(
    "a rotated key is reported as unusable rather than crashing a page",
    (await connectionFromRow(northwind, OTHER_KEY)).includes("could not be decrypted"),
  );
  check(
    "and with no key at all the workspace says tokens cannot be stored",
    (await connectionFromRow(northwind, null)) === ENCRYPTION_UNCONFIGURED,
  );

  const pushWithoutTeam = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  check(
    "a push with no team chosen refuses with a reason",
    pushWithoutTeam.ok === false && /team/i.test(pushWithoutTeam.detail),
  );
  check(
    "and that refusal is not recorded as a ticket failure",
    (await ticketRow(northwind, ticketId))?.linearSyncState === null,
  );

  const invisibleTeam = await setLinearTeam({
    workspaceId: northwind,
    actorId: lena.id,
    teamId: "team-not-mine",
    projectId: null,
    deps: depsFor(fixture),
  });
  check(
    "a team the token cannot see is refused",
    invisibleTeam.ok === false &&
      (invisibleTeam.reason ?? "").includes("not visible"),
  );

  const chosen = await setLinearTeam({
    workspaceId: northwind,
    actorId: lena.id,
    teamId: "team-eng",
    projectId: "project-q4",
    deps: depsFor(fixture),
  });
  check("a visible team is accepted", chosen.ok === true);
  check(
    "the teams endpoint is exposed for the picker",
    (await availableTeams(northwind, depsFor(fixture))).ok === true,
  );

  /* ---------------------------------------------------------- pushing */

  await moveTicket({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId,
    status: "todo",
  });
  check(
    "moving a ticket on the board queues it for Linear",
    (await ticketRow(northwind, ticketId))?.linearSyncState === "pending",
  );

  const pushed = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  check(
    "a push creates the issue",
    pushed.ok === true && fixture.created.length === 1,
  );

  const created = fixture.created[0]!;
  check("the issue carries the mapped priority", created.priority === 2, `${created.priority}`);
  check("the issue carries the due date as a plain date", created.dueDate === "2026-11-05");
  check("the issue is filed into the chosen project", created.projectId === "project-q4");
  check(
    "the issue is assigned by matching the owner's email",
    created.assigneeId === "linear-lena",
  );
  check("the issue body backlinks to the ticket", created.description.includes("PRE-901"));

  const linked = await ticketRow(northwind, ticketId);
  check(
    "the ticket remembers the issue and where it lives",
    Boolean(linked?.linearIssueId) && Boolean(linked?.linearUrl),
  );
  check(
    "and is marked synced with no error left over",
    linked?.linearSyncState === "synced" && linked?.linearSyncError === null,
  );
  check(
    "the linkage is visible in the ticket's own timeline",
    (await eventTypes(northwind, ticketId)).includes("linear_linked"),
  );

  const pushedAgain = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  check(
    "a second push updates rather than creating a duplicate",
    pushedAgain.ok === true && fixture.created.length === 1 && fixture.updates.length === 1,
  );
  check(
    "the update carries the current status as a Linear state",
    fixture.updates[0]?.patch.stateId === "state-todo",
    fixture.updates[0]?.patch.stateId ?? "none",
  );

  await moveTicket({
    workspaceId: northwind,
    actorId: lena.id,
    ticketId,
    status: "in_progress",
  });
  await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  check(
    "a board move reaches Linear as the mapped state",
    fixture.updates.at(-1)?.patch.stateId === "state-progress",
    fixture.updates.at(-1)?.patch.stateId ?? "none",
  );

  /* ------------------------------------------------------- failure handling */

  const refusing = fixtureLinear({
    fail: { updateIssue: "Linear refused it: daily request limit reached" },
  });
  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ linearSyncState: "pending" })
      .where(eq(t.tickets.id, ticketId)),
  );

  const refused = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(refusing) });
  check(
    "a refused push reports Linear's own words",
    refused.ok === false && refused.detail.includes("daily request limit"),
  );

  const afterFailure = await ticketRow(northwind, ticketId);
  check(
    "the failure is recorded on the ticket, never swallowed",
    afterFailure?.linearSyncState === "failed" &&
      afterFailure?.linearSyncError?.includes("daily request limit") === true,
  );
  check(
    "the attempt is counted and a retry is scheduled",
    afterFailure?.linearSyncAttempts === 1 && afterFailure?.linearRetryAfter !== null,
  );
  check(
    "the backoff grows with each attempt and then holds",
    backoffMs(1) < backoffMs(2) &&
      backoffMs(2) < backoffMs(5) &&
      backoffMs(5) === backoffMs(9),
    `${backoffMs(1)}, ${backoffMs(2)}, ${backoffMs(5)}, ${backoffMs(9)} ms`,
  );
  check(
    "a refusal does not touch the ticket itself",
    afterFailure?.linearIssueId === linked?.linearIssueId &&
      afterFailure?.status === "in_progress",
  );
  check(
    "the failure is on the record too",
    (await eventTypes(northwind, ticketId)).includes("linear_synced"),
  );

  const recovered = await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  const afterRecovery = await ticketRow(northwind, ticketId);
  check(
    "a later attempt clears the failure, the count and the backoff",
    recovered.ok === true &&
      afterRecovery?.linearSyncState === "synced" &&
      afterRecovery?.linearSyncError === null &&
      afterRecovery?.linearSyncAttempts === 0 &&
      afterRecovery?.linearRetryAfter === null,
  );

  /* ------------------------------------------------------------- pulling */

  const issueId = afterRecovery!.linearIssueId!;

  fixture.touch(issueId, {
    state: { id: "state-done", name: "Done", type: "completed" },
    updatedAt: new Date(NOW.getTime() + 1_000).toISOString(),
  });
  const pulled = await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check("a pull sees what Linear changed", pulled.ok === true && pulled.seen >= 1);
  check(
    "a completed issue completes the ticket",
    (await ticketRow(northwind, ticketId))?.status === "done",
  );
  check(
    "the change is attributed in the timeline",
    (await eventTypes(northwind, ticketId)).includes("linear_updated_here"),
  );
  check(
    "the cursor advances so the next window is narrower",
    (await integrationSummary(northwind, { key: KEY })).lastSyncedAt !== null,
  );

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ status: "in_progress", linearSyncState: "synced" })
      .where(eq(t.tickets.id, ticketId)),
  );
  fixture.touch(issueId, {
    state: { id: "state-cancelled", name: "Cancelled", type: "canceled" },
    updatedAt: new Date(NOW.getTime() + 2_000).toISOString(),
  });
  const cancelled = await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "a cancelled issue does not pretend the work was finished",
    (await ticketRow(northwind, ticketId))?.status === "in_progress" &&
      cancelled.unmapped >= 1,
  );

  const memberRows = await withWorkspace(northwind, (tx) =>
    tx
      .select({ id: t.users.id, email: t.users.email })
      .from(t.memberships)
      .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
      .where(eq(t.memberships.workspaceId, northwind)),
  );
  const otherMember = memberRows.find((row) => row.id !== lena.id)!;

  fixture.touch(issueId, {
    assignee: { id: "linear-other", name: "Someone", email: otherMember.email },
    state: { id: "state-progress", name: "In Progress", type: "started" },
    updatedAt: new Date(NOW.getTime() + 3_000).toISOString(),
  });
  await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "an assignee change in Linear reaches the ticket",
    (await ticketRow(northwind, ticketId))?.assigneeId === otherMember.id,
  );

  fixture.touch(issueId, {
    assignee: { id: "linear-ghost", name: "Ghost", email: "ghost@nowhere.test" },
    updatedAt: new Date(NOW.getTime() + 4_000).toISOString(),
  });
  await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "an assignee whose address matches nobody here is left alone, not dropped",
    (await ticketRow(northwind, ticketId))?.assigneeId === otherMember.id,
  );

  fixture.touch(issueId, {
    assignee: null,
    updatedAt: new Date(NOW.getTime() + 5_000).toISOString(),
  });
  await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "an issue unassigned in Linear unassigns the ticket",
    (await ticketRow(northwind, ticketId))?.assigneeId === null,
  );

  /* ------------------------------------------------------- source of truth */

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ status: "todo", linearSyncState: "pending", linearSyncAttempts: 0 })
      .where(eq(t.tickets.id, ticketId)),
  );
  fixture.touch(issueId, {
    state: { id: "state-done", name: "Done", type: "completed" },
    updatedAt: new Date(NOW.getTime() + 6_000).toISOString(),
  });
  const kept = await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "with Prepo first, a queued local change is not overwritten",
    (await ticketRow(northwind, ticketId))?.status === "todo" && kept.kept >= 1,
  );
  check(
    "and the override is written down rather than silent",
    (await eventTypes(northwind, ticketId)).includes("linear_conflict"),
  );

  await updateLinearSettings({
    workspaceId: northwind,
    actorId: lena.id,
    sourceOfTruth: "linear",
  });
  const taken = await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "with Linear first, the same change lands",
    (await ticketRow(northwind, ticketId))?.status === "done" && taken.applied >= 1,
  );

  fixture.touch(issueId, {
    title: "Renamed in Linear",
    updatedAt: new Date(NOW.getTime() + 7_000).toISOString(),
  });
  await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "Linear first also takes the title",
    (await ticketRow(northwind, ticketId))?.title === "Renamed in Linear",
  );

  await updateLinearSettings({
    workspaceId: northwind,
    actorId: lena.id,
    sourceOfTruth: "prepo",
  });
  fixture.touch(issueId, {
    title: "Named something else in Linear",
    updatedAt: new Date(NOW.getTime() + 8_000).toISOString(),
  });
  await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "Prepo first ignores a rename it did not make",
    (await ticketRow(northwind, ticketId))?.title === "Renamed in Linear",
  );

  /* ------------------------------------------------------------ the loop */

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ linearSyncState: "pending", linearSyncAttempts: 0 })
      .where(eq(t.tickets.id, ticketId)),
  );
  await pushTicket({ workspaceId: northwind, ticketId, deps: depsFor(fixture) });
  const echo = await pullWorkspace({ workspaceId: northwind, now: NOW, deps: depsFor(fixture) });
  check(
    "the echo of our own push changes nothing back",
    echo.applied === 0 && (await ticketRow(northwind, ticketId))?.linearSyncState === "synced",
    `${echo.applied} applied`,
  );

  /* --------------------------------------------------------- dead issues */

  const removed = await withWorkspace(northwind, (tx) =>
    applyRemoteChange(tx, {
      workspaceId: northwind,
      patch: { issueId },
      mapping: DEFAULT_MAPPING,
      sourceOfTruth: "prepo",
      removed: true,
    }),
  );
  const orphaned = await ticketRow(northwind, ticketId);
  check(
    "an issue deleted in Linear unlinks the ticket but keeps it",
    removed === "unlinked" && orphaned !== null && orphaned.linearIssueId === null,
  );
  check(
    "and says why, instead of looking like it was never linked",
    orphaned?.linearSyncError?.includes("deleted") === true,
  );

  const unknown = await withWorkspace(northwind, (tx) =>
    applyRemoteChange(tx, {
      workspaceId: northwind,
      patch: { issueId: "does-not-exist", stateType: "completed" },
      mapping: DEFAULT_MAPPING,
      sourceOfTruth: "prepo",
    }),
  );
  check("an issue Prepo does not mirror is ignored", unknown === "no-ticket");

  /* ------------------------------------------------------------- the job */

  const job = await runLinearSync({ now: NOW, deps: depsFor(fixture) });
  check(
    "the job counts every workspace and the connected ones",
    job.workspaces >= 2 && job.connected >= 1,
    `${job.workspaces} workspaces, ${job.connected} connected`,
  );
  check(
    "the job says nothing was sent for a workspace with no connection",
    job.connected < job.workspaces || job.connected === job.workspaces,
  );

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ linearSyncState: "pending", linearSyncError: null, linearSyncAttempts: 0 })
      .where(eq(t.tickets.id, ticketId)),
  );
  const jobPush = await runLinearSync({ now: NOW, deps: depsFor(fixture) });
  check(
    "the job pushes what was queued",
    jobPush.pushed >= 1 &&
      (await ticketRow(northwind, ticketId))?.linearSyncState === "synced",
    `${jobPush.pushed} pushed`,
  );

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({
        linearSyncState: "failed",
        linearSyncError: "boom",
        linearSyncAttempts: 1,
        linearRetryAfter: new Date(NOW.getTime() + 60_000),
      })
      .where(eq(t.tickets.id, ticketId)),
  );
  await runLinearSync({ now: NOW, deps: depsFor(fixture) });
  check(
    "a failed ticket inside its backoff is left for a later pass",
    (await ticketRow(northwind, ticketId))?.linearSyncState === "failed",
  );

  await withWorkspace(northwind, (tx) =>
    tx
      .update(t.tickets)
      .set({ linearRetryAfter: new Date(NOW.getTime() - 1_000) })
      .where(eq(t.tickets.id, ticketId)),
  );
  await runLinearSync({ now: NOW, deps: depsFor(fixture) });
  check(
    "past its backoff the same ticket is retried and recovers",
    (await ticketRow(northwind, ticketId))?.linearSyncState === "synced",
  );

  /* ------------------------------------------------------- the webhook secret */

  const storedSecret = await updateLinearSettings({
    workspaceId: northwind,
    actorId: lena.id,
    webhookSecret: webhookSecret,
    deps: { key: KEY },
  });
  const row = await readIntegration(northwind);
  check(
    "the webhook secret is stored, and encrypted like the token",
    storedSecret.ok === true &&
      Boolean(row?.encryptedWebhookSecret) &&
      !row?.encryptedWebhookSecret?.includes(webhookSecret),
  );
  check(
    "and decrypts back to what was set, so deliveries can be checked",
    decryptSecret(row?.encryptedWebhookSecret ?? null, KEY) === webhookSecret,
  );
  check(
    "a secret cannot be stored without a key either",
    (await updateLinearSettings({
      workspaceId: northwind,
      actorId: lena.id,
      webhookSecret: "whsec_x",
      deps: { key: null },
    })).ok === false,
  );

  /* -------------------------------------------------------------- tenancy */

  const globexSummary = await integrationSummary(globex, { key: KEY });
  check(
    "another tenant has no connection of its own",
    globexSummary.connected === false && globexSummary.status === null,
  );
  const globexPush = await pushTicket({ workspaceId: globex, ticketId, deps: depsFor(fixture) });
  check(
    "and cannot push a ticket that belongs to someone else",
    globexPush.ok === false,
  );

  /* ------------------------------------------------------------ disconnecting */

  const disconnect = await disconnectLinear({ workspaceId: northwind, actorId: lena.id });
  const afterwards = await ticketRow(northwind, ticketId);
  check(
    "disconnecting unlinks the tickets",
    disconnect.unlinked >= 1 && afterwards !== null && afterwards.linearIssueId === null,
  );
  check(
    "but keeps the tickets themselves",
    afterwards?.key === "PRE-901" && afterwards?.title.length > 0,
  );
  const gone = await readIntegration(northwind);
  check(
    "and drops the token rather than keeping a revoked credential",
    gone?.encryptedToken === null &&
      gone?.encryptedWebhookSecret === null &&
      gone?.status === "disconnected",
  );
  check(
    "the workspace is no longer usable",
    (await integrationSummary(northwind, { key: KEY })).connected === false,
  );
  check(
    "and a local write stops queueing again",
    (await withWorkspace(northwind, (tx) =>
      queueForLinear(tx, { workspaceId: northwind, ticketId }),
    )) === false,
  );

  /* --------------------------------------------------------------- cleanup */

  // The fixture connection is not part of a demo, and its token cannot be read
  // by any key on this machine. Remove it, then put the seeded data back.
  await withWorkspace(northwind, (tx) =>
    tx.delete(t.integrations).where(eq(t.integrations.workspaceId, northwind)),
  );
  await seed();

  console.log("");
  if (failures === 0) {
    console.log("all Linear checks passed");
    return;
  }

  console.log(`${failures} check(s) failed`);
  throw new Error(`${failures} Linear check(s) failed`);
});

/**
 * Reads a row and turns it into a connection with an arbitrary key, purely to
 * report *why* it is unusable.
 */
async function connectionFromRow(
  workspaceId: string,
  key: EncryptionKey | null,
): Promise<string> {
  const row = await readIntegration(workspaceId);
  const result = connectionFrom(row, { key });
  return result.ok ? "usable" : result.reason;
}
