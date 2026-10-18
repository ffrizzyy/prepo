/**
 * Checks "delete a meeting" (PREPO.md §8.9) against a throwaway database.
 *
 * It deliberately does NOT use the working `.pglite` directory: the live demo
 * data lives there, and a destructive check that reseeds it would take the
 * Linear connection and the TOTP/audio fixtures with it. It creates its own
 * temporary directory, migrates and seeds into it, and removes it afterwards.
 *
 *   pnpm --filter @prepo/web db:meeting-delete
 *
 * The question it answers is not "does the row go away" but "does exactly the
 * right set of rows go away": the transcript, the action items, the audio row
 * and the recap links, while the tickets created from those items survive with
 * their link cleared, and the audit entry survives the thing it describes.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { SAMPLE_MEETING } from "@prepo/shared";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import {
  listActionItemsView,
  listMeetingsView,
  listSegmentsView,
  listTicketsView,
} from "../queries";
import { approveActionItems, deleteMeeting, meetingDeletionImpact } from "../writes";
import { getPglite, withWorkspace } from "./client";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import * as t from "./schema";
import { seed } from "./seed";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures += 1;
}

runCli("meeting-delete-smoke.ts", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "prepo-delete-"));
  process.env.PGLITE_DIR = workdir;
  delete process.env.DATABASE_URL;

  try {
    await migrateAndApply();
    await seed();

    const northwind = (await resolveWorkspaceId("northwind"))!;
    const globex = (await resolveWorkspaceId("globex"))!;
    const demo = await getUserByEmail(DEMO.email);
    const actorId = demo!.id;

    const northwindMeetings = await listMeetingsView(northwind);
    const target = northwindMeetings.find(
      (meeting) => meeting.title === SAMPLE_MEETING.title,
    );
    check("the seeded northwind meeting is there to delete", Boolean(target));

    const globexMeetings = await listMeetingsView(globex);
    const globexMeeting = globexMeetings[0];
    check("globex has a meeting of its own", Boolean(globexMeeting));

    /* --------------------------------------------------- what would go, counted */

    const impact = await meetingDeletionImpact({
      workspaceId: northwind,
      meetingId: target!.id,
    });

    check("the impact is readable", impact !== null);
    check(
      "it counts the transcript",
      (impact?.segments ?? 0) > 0,
      String(impact?.segments),
    );
    check(
      "it counts the action items",
      (impact?.actionItems ?? 0) > 0,
      String(impact?.actionItems),
    );
    check(
      "it names the stored recording",
      impact?.storageKey === `meetings/${target!.id}/audio.m4a`,
      impact?.storageKey ?? "none",
    );
    check(
      "nothing is claimed to be kept yet",
      impact?.ticketsKept === 0,
      String(impact?.ticketsKept),
    );

    /* ------------------------------------------------------- the tenant boundary */

    const crossed = await deleteMeeting({
      workspaceId: northwind,
      actorId,
      meetingId: globexMeeting!.id,
    });
    check("a meeting in another workspace is not found, so not deleted", crossed === null);
    check(
      "and it is still there in its own workspace",
      (await listMeetingsView(globex)).length === globexMeetings.length,
    );

    /* ---------------------------------------- work created from the meeting survives */

    const items = await listActionItemsView(northwind);
    const fromTarget = items.filter(
      (item) => item.meetingId === target!.id && item.status === "proposed",
    );
    check(
      "the meeting has proposed items to convert",
      fromTarget.length > 0,
      String(fromTarget.length),
    );

    await approveActionItems({
      workspaceId: northwind,
      actorId,
      prefix: "PRE",
      actionItemIds: [fromTarget[0]!.id],
    });

    const ticketsAfterApprove = await listTicketsView(northwind);
    const derived = ticketsAfterApprove.filter(
      (ticket) => ticket.meetingId === target!.id,
    );
    check(
      "approving an item from that meeting made a ticket",
      derived.length === 1,
      String(derived.length),
    );

    const impactWithTicket = await meetingDeletionImpact({
      workspaceId: northwind,
      meetingId: target!.id,
    });
    check(
      "the impact now says one ticket would be kept",
      impactWithTicket?.ticketsKept === 1,
      String(impactWithTicket?.ticketsKept),
    );

    /* ------------------------------------------------------------------- delete */

    const before = northwindMeetings.length;
    const deleted = await deleteMeeting({
      workspaceId: northwind,
      actorId,
      meetingId: target!.id,
    });

    check("the delete reports what it removed", deleted !== null);
    check(
      "it hands back the key whose bytes the caller must remove",
      deleted?.storageKey === `meetings/${target!.id}/audio.m4a`,
      deleted?.storageKey ?? "none",
    );

    const remaining = await listMeetingsView(northwind);
    check(
      "the meeting is gone from the list",
      remaining.length === before - 1 &&
        !remaining.some((meeting) => meeting.id === target!.id),
      `${before} -> ${remaining.length}`,
    );
    check(
      "its transcript segments are gone",
      (await listSegmentsView(northwind, target!.id)).length === 0,
    );
    check(
      "its action items are gone",
      (await listActionItemsView(northwind)).every(
        (item) => item.meetingId !== target!.id,
      ),
    );

    const orphanedAudio = await withWorkspace(northwind, (tx) =>
      tx
        .select({ id: t.audioAssets.id })
        .from(t.audioAssets)
        .where(eq(t.audioAssets.meetingId, target!.id)),
    );
    check("its audio row is gone", orphanedAudio.length === 0);

    const shareLinks = await withWorkspace(northwind, (tx) =>
      tx
        .select({ id: t.shareLinks.id })
        .from(t.shareLinks)
        .where(eq(t.shareLinks.meetingId, target!.id)),
    );
    check("its recap links are gone", shareLinks.length === 0);

    const keptTicket = await withWorkspace(northwind, (tx) =>
      tx
        .select({ id: t.tickets.id, key: t.tickets.key, actionItemId: t.tickets.actionItemId })
        .from(t.tickets)
        .where(eq(t.tickets.id, derived[0]!.id)),
    );
    check("the ticket created from it survives", keptTicket.length === 1);
    check(
      "and its link back to the meeting's item is cleared, not dangling",
      keptTicket[0]?.actionItemId === null,
      String(keptTicket[0]?.actionItemId),
    );

    const auditRows = await withWorkspace(northwind, (tx) =>
      tx
        .select({ action: t.auditLogs.action, target: t.auditLogs.target })
        .from(t.auditLogs)
        .where(eq(t.auditLogs.action, "meeting.deleted")),
    );
    check(
      "the audit entry survives the meeting it describes",
      auditRows.length === 1 && (auditRows[0]?.target ?? "").startsWith(target!.id),
      auditRows[0]?.target ?? "none",
    );

    /* -------------------------------------------------------------- repeatable */

    const again = await deleteMeeting({
      workspaceId: northwind,
      actorId,
      meetingId: target!.id,
    });
    check("deleting it twice is a no-op, not an error", again === null);
    check(
      "and it wrote no second audit entry",
      (
        await withWorkspace(northwind, (tx) =>
          tx
            .select({ id: t.auditLogs.id })
            .from(t.auditLogs)
            .where(eq(t.auditLogs.action, "meeting.deleted")),
        )
      ).length === 1,
    );

    if (failures > 0) process.exitCode = 1;
    console.log(`\n${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  } finally {
    try {
      await getPglite().close();
    } catch {
      // Nothing to do: the directory is a temp one either way.
    }
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
});
