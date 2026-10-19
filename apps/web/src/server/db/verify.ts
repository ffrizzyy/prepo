import { SAMPLE_ACTION_ITEMS, SAMPLE_TICKETS } from "@prepo/shared";
import { acquireClient } from "./client";
import { migrateAndApply } from "./migrate";
import { seed, WORKSPACE_IDS } from "./seed";
import { runCli } from "./run";

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

/**
 * Proves the tenant boundary holds at the database level, not just in
 * application code. Every read runs as `prepo_app` with `set local`, so a
 * missing scope must return nothing.
 */
export async function verify(): Promise<boolean> {
  const { client, release } = await acquireClient();

  const runAsApp = async <T>(
    workspaceId: string | null,
    fn: () => Promise<T>,
  ): Promise<T> => {
    await client.exec("begin");
    await client.exec("set local role prepo_app");
    if (workspaceId) {
      await client.query("select set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
    }
    try {
      const result = await fn();
      await client.exec("commit");
      return result;
    } catch (error) {
      await client.exec("rollback");
      throw error;
    }
  };

  const northwind = WORKSPACE_IDS.northwind;
  const globex = WORKSPACE_IDS.globex;

  try {
    /* ---------------------------------------------------------- reads */
    const northwindTickets = await runAsApp(northwind, () =>
      client.query<{ workspace_id: string }>("select workspace_id from tickets"),
    );
    check(
      "northwind sees only its own tickets",
      northwindTickets.length === SAMPLE_TICKETS.length &&
        northwindTickets.every((row) => row.workspace_id === northwind),
      `${northwindTickets.length} rows, all northwind`,
    );

    const globexTickets = await runAsApp(globex, () =>
      client.query<{ workspace_id: string }>("select workspace_id from tickets"),
    );
    check(
      "globex sees only its own tickets",
      globexTickets.length === 2 &&
        globexTickets.every((row) => row.workspace_id === globex),
      `${globexTickets.length} rows, all globex`,
    );

    const northwindMeetings = await runAsApp(northwind, () =>
      client.query("select id from meetings"),
    );
    const globexMeetings = await runAsApp(globex, () =>
      client.query("select id from meetings"),
    );
    check(
      "meetings are partitioned per workspace",
      northwindMeetings.length === 4 && globexMeetings.length === 1,
      `northwind=${northwindMeetings.length}, globex=${globexMeetings.length}`,
    );

    const globexActionItems = await runAsApp(globex, () =>
      client.query("select id from action_items"),
    );
    const northwindActionItems = await runAsApp(northwind, () =>
      client.query("select id from action_items"),
    );
    check(
      "action items are partitioned per workspace",
      northwindActionItems.length === SAMPLE_ACTION_ITEMS.length &&
        globexActionItems.length === 0,
      `northwind=${northwindActionItems.length}, globex=${globexActionItems.length}`,
    );

    /* ------------------------------------------- deny by default (no scope) */
    const unscoped = await runAsApp(null, () =>
      client.query("select id from tickets"),
    );
    check(
      "an unscoped session sees nothing",
      unscoped.length === 0,
      `${unscoped.length} rows without app.workspace_id`,
    );

    /* ------------------------------------- explicit cross-tenant read attempt */
    const crossRead = await runAsApp(northwind, () =>
      client.query("select id from tickets where workspace_id = $1", [globex]),
    );
    check(
      "cross-tenant read by explicit id returns nothing",
      crossRead.length === 0,
      `${crossRead.length} globex rows visible from northwind`,
    );

    /* ------------------------------------ cross-tenant write is rejected by RLS */
    let writeRejected = false;
    let writeError = "";
    try {
      await runAsApp(northwind, () =>
        client.query(
          `insert into tickets (id, workspace_id, key, title)
           values ('01930000-0000-7000-8000-00000000dead', $1, 'GLO-999', 'smuggled')`,
          [globex],
        ),
      );
    } catch (error) {
      writeRejected = true;
      writeError = error instanceof Error ? error.message : String(error);
    }
    check(
      "cross-tenant write is rejected",
      writeRejected && /row-level security/i.test(writeError),
      writeError || "insert unexpectedly succeeded",
    );

    /* -------------------------------------------- search index is populated */
    const searchHits = await runAsApp(northwind, () =>
      client.query(
        `select id from transcript_segments
         where tsv @@ to_tsquery('english', 'webhook')`,
      ),
    );
    check(
      "full-text search finds the webhook segment",
      searchHits.length >= 1,
      `${searchHits.length} match(es) for "webhook"`,
    );

    /* ------------------------------------- workspace bootstrap resolves a slug */
    const resolved = await runAsApp(null, () =>
      client.query<{ id: string | null }>(
        "select resolve_workspace_id($1) as id",
        ["northwind"],
      ),
    );
    check(
      "resolve_workspace_id maps a slug to an id",
      resolved[0]?.id === northwind,
      String(resolved[0]?.id),
    );

    /* ---------------------------------- bootstrap helper leaks no other rows */
    const allWorkspaces = await runAsApp(northwind, () =>
      client.query("select id from workspaces"),
    );
    check(
      "workspaces table is scoped too",
      allWorkspaces.length === 1,
      `${allWorkspaces.length} workspace row(s) visible`,
    );
  } finally {
    await release();
  }

  const failed = checks.filter((entry) => !entry.pass);
  for (const entry of checks) {
    console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.name}, ${entry.detail}`);
  }
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed`,
  );
  return failed.length === 0;
}

runCli("verify.ts", async () => {
  await migrateAndApply();
  await seed();
  const ok = await verify();
  if (!ok) throw new Error("tenant isolation verification failed");
}, "fresh");
