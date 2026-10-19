import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";

/**
 * Queuing helpers, deliberately kept out of `sync.ts`.
 *
 * `writes.ts` needs to mark a ticket as needing a push, and `sync.ts` needs
 * `writes.ts` for its audit helper. Putting these two functions here breaks that
 * circle: this module imports nothing but drizzle and the schema.
 *
 * The point of queueing rather than sending is that a local write never waits on
 * Linear. Dragging a card on the board marks the ticket `pending` and returns;
 * `db:linear` is what talks to the network.
 */

/** Whether this workspace can actually send anything, right now. */
export async function linearConnected(
  tx: Db,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: t.integrations.id })
    .from(t.integrations)
    .where(
      and(
        eq(t.integrations.workspaceId, workspaceId),
        eq(t.integrations.provider, "linear"),
        eq(t.integrations.status, "connected"),
        sql`${t.integrations.encryptedToken} is not null`,
      ),
    );
  return Boolean(row);
}

/**
 * Marks a ticket as needing a push and clears the failure state, so a retry
 * after a failure starts its backoff from the beginning rather than inheriting
 * the old attempt count.
 */
export async function markTicketPending(
  tx: Db,
  input: { workspaceId: string; ticketId: string },
): Promise<void> {
  await tx
    .update(t.tickets)
    .set({
      linearSyncState: "pending",
      linearSyncError: null,
      linearSyncAttempts: 0,
      linearRetryAfter: null,
    })
    .where(eq(t.tickets.id, input.ticketId));
}

/**
 * The one call a local write makes: queue the ticket if Linear is connected, and
 * do nothing at all if it is not. A disconnected workspace leaves
 * `linear_sync_state` null, "never offered", rather than accumulating a queue
 * of pending rows that would all fire at once on the next connect.
 */
export async function queueForLinear(
  tx: Db,
  input: { workspaceId: string; ticketId: string },
): Promise<boolean> {
  if (!(await linearConnected(tx, input.workspaceId))) return false;
  await markTicketPending(tx, input);
  return true;
}
