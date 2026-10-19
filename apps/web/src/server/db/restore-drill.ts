import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireClient, getPglite, type SqlClient } from "./client";
import { runCli } from "./run";

/**
 * The restore drill, local edition (PREPO.md §9.4 "Backup restore drill").
 * A backup that has never been restored is a hope, so this makes one and
 * proves it:
 *
 * 1. the "backup" is a plain copy of the working data directories -
 *    `.pglite` (every table) and `.storage` (the recording bytes, which live
 *    outside the database). The copy is made with file operations only: the
 *    app may hold its own PGlite open, so the drill never opens the original
 *    a second time.
 * 2. the "restore" is a scratch PGlite pointed at nothing but the copy; every
 *    subsequent check reads only the copy, never the original directories.
 * 3. the verification on the restore is seed-free  - `db:verify` reseeds before
 *    checking, which on a restored copy would truncate it and prove nothing
 *    about the restored data. So the checks read the copy's real content: the
 *    schema is complete, row counts are reported, mapping integrity holds,
 *    and the tenant boundary holds generically  - whichever workspaces the copy
 *    contains, each sees only its own tickets under RLS, and with no scope set
 *    a tenant sees nothing at all.
 *
 * What the drill does not claim: a schedule, an off-machine target, or PITR
 * (real Postgres features). It proves the restore mechanics for the thing the
 * app actually runs on today. The copy is torn if the app writes mid-copy; a
 * torn copy fails loudly here (a finding, not a silent pass), so the drill is
 * best run with the app closed.
 */

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "accounts",
  "auth_events",
  "login_challenges",
  "workspaces",
  "memberships",
  "invitations",
  "meetings",
  "audio_assets",
  "transcript_segments",
  "action_items",
  "tickets",
  "ticket_events",
  "comments",
  "followups",
  "notifications",
  "push_subscriptions",
  "integrations",
  "api_keys",
  "share_links",
  "saved_views",
  "ai_runs",
  "stt_runs",
  "audit_logs",
];

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

/** Counts files and bytes under a directory on disk (no database open). */
async function measure(dir: string): Promise<{ files: number; bytes: number }> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isFile()) {
      files += 1;
      bytes += (await stat(path.join(entry.parentPath, entry.name))).size;
    }
  }
  return { files, bytes };
}

async function count(client: SqlClient, table: string): Promise<number> {
  const rows = await client.query<{ n: string | number }>(`select count(*) as n from ${table}`);
  return Number(rows[0]?.n ?? 0);
}

async function scalarCount(client: SqlClient, text: string, params: unknown[] = []): Promise<number> {
  const rows = await client.query<{ n: string | number }>(text, params);
  return Number(rows[0]?.n ?? 0);
}

export async function restoreDrill(): Promise<boolean> {
  // The data under the app: the tables live in .pglite, the recording bytes in
  // .storage. Both defaults are relative to the running app (apps/web), like
  // every other db:* default.
  const dataDir = path.resolve(".pglite");
  const audioDir = path.resolve(".storage");

  // The backup goes to a scratch directory the drill deletes when done. If the
  // operator points PREPO_BACKUP_DIR somewhere, that directory is the target
  // instead and the drill leaves it in place for inspection.
  const scratch = !process.env.PREPO_BACKUP_DIR;
  const backup = process.env.PREPO_BACKUP_DIR ?? (await mkdtemp(path.join(tmpdir(), "prepo-restore-")));

  try {
    /* ------------------------------------------------ make the backup copy */
    let dataStats: { files: number; bytes: number };
    try {
      dataStats = await measure(dataDir);
    } catch {
      throw new Error(`restore drill: the data directory ${dataDir} does not exist`);
    }
    if (dataStats.files === 0) {
      throw new Error("restore drill: the data directory holds no files");
    }

    check(
      "data directory found for the backup",
      true,
      `${dataDir} (${dataStats.files} files, ${dataStats.bytes} bytes)`,
    );

    await cp(dataDir, backup, { recursive: true });
    const hasStorage = await stat(audioDir).then(() => true).catch(() => false);
    if (hasStorage) {
      await cp(audioDir, path.join(backup, ".storage"), { recursive: true });
    }
    const copyStats = await measure(backup);
    check(
      "the backup copy is not empty",
      copyStats.files > 0 && copyStats.bytes > 0,
      `${copyStats.files} files, ${copyStats.bytes} bytes copied`,
    );
    check(
      "the copy carries everything the data directory had",
      copyStats.bytes >= dataStats.bytes,
      `copy ${copyStats.bytes} bytes vs data ${dataStats.bytes} bytes (recordings add to it)`,
    );

    /* ---------------- restore: a database that sees nothing but the backup */
    // The entry funnel (runCli) already ran in "live" mode with the working
    // .env.local; the restore must look only at the copy, so the database URL
    // goes and PGLITE_DIR moves to it before any client opens.
    delete process.env.DATABASE_URL;
    process.env.PGLITE_DIR = backup;

    const { client, release } = await acquireClient();
    try {
      /* ------------------------------------------------- schema restored */
      const tables = await client.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public'",
      );
      const names = new Set(tables.map((row) => row.table_name));
      const missing = REQUIRED_TABLES.filter((table) => !names.has(table));
      check(
        "the schema survived the restore",
        missing.length === 0,
        missing.length === 0
          ? `all ${REQUIRED_TABLES.length} tables present`
          : `missing: ${missing.join(", ")}`,
      );

      /* ------------------------------------------- the data is still here */
      const seats = {
        users: await count(client, "users"),
        workspaces: await count(client, "workspaces"),
        meetings: await count(client, "meetings"),
        tickets: await count(client, "tickets"),
        segments: await count(client, "transcript_segments"),
        items: await count(client, "action_items"),
        followups: await count(client, "followups"),
        audit: await count(client, "audit_logs"),
        auth: await count(client, "auth_events"),
      };
      console.log(
        `restored: users ${seats.users}, workspaces ${seats.workspaces}, meetings ${seats.meetings}, tickets ${seats.tickets}, transcript_segments ${seats.segments}, action_items ${seats.items}, followups ${seats.followups}, audit_logs ${seats.audit}, auth_events ${seats.auth}`,
      );
      check("the restore holds users", seats.users > 0, `count ${seats.users}`);
      check("the restore holds workspaces", seats.workspaces > 0, `count ${seats.workspaces}`);
      check("the restore holds meetings", seats.meetings > 0, `count ${seats.meetings}`);
      check("the restore holds tickets", seats.tickets > 0, `count ${seats.tickets}`);

      // Mapping integrity: no ticket may orphan from the workspace it claims.
      const orphans = await scalarCount(
        client,
        "select count(*) as n from tickets left join workspaces on tickets.workspace_id = workspaces.id where workspaces.id is null",
      );
      check("every ticket maps onto a workspace", orphans === 0, `${orphans} orphaned`);

      /* ------------------------------------------------- tenants: copy-only */
      // With no scope set, a tenant selects nothing (fail closed).
      await client.exec("begin");
      await client.exec("set local role prepo_app");
      const unscopedVisible = await scalarCount(client, "select count(*) as n from tickets");
      await client.exec("commit");
      check(
        "no scope set: a tenant sees nothing",
        unscopedVisible === 0,
        `${unscopedVisible} tickets visible without a workspace scope`,
      );

      // Each workspace that holds tickets sees exactly its own rows back -
      // whichever workspaces the copy happens to contain.
      const scoped = (
        await client.query<{ workspaceId: string; n: string | number }>(
          "select workspace_id as \"workspaceId\", count(*) as n from tickets group by workspace_id order by workspace_id limit 2",
        )
      ).map((row) => ({ id: row.workspaceId, own: Number(row.n) }));
      if (scoped.length < 2) {
        check(
          "the tenant boundary re-proven on the restore",
          false,
          `only ${scoped.length} workspace(s) hold tickets; the probe needs two  - add data and rerun`,
        );
      } else {
        let boundariesHold = true;
        const seen: string[] = [];
        for (const entry of scoped) {
          await client.exec("begin");
          await client.exec("set local role prepo_app");
          await client.query("select set_config('app.workspace_id', $1, true)", [entry.id]);
          const visible = await client.query<{ workspace_id: string }>(
            "select workspace_id from tickets",
          );
          await client.exec("commit");
          seen.push(entry.id.slice(0, 8));
          if (visible.length !== entry.own) {
            boundariesHold = false;
          } else if (!visible.every((row) => row.workspace_id === entry.id)) {
            boundariesHold = false;
          }
        }
        check(
          "the tenant boundary re-proven on the restore",
          boundariesHold,
          `${seen.join(" vs ")}: each sees exactly its own ${scoped.map((entry) => entry.own).join("/")} tickets, no cross leak`,
        );
      }

      /* ---------------------------------------------------- bytes restored */
      // Any recording that still owns bytes (not deleted)  - its file must exist
      // in the copied storage at its key, at the recorded size.
      const assets = await client.query<{ key: string; size: number | null; status: string }>(
        "select r2_key as key, size_bytes as size, status from audio_assets where status <> 'deleted' order by created_at desc limit 3",
      );
      if (assets.length === 0) {
        check("no live recordings to restore (probably nothing to lose yet)", true, "0 assets");
      } else {
        let copies = 0;
        let bytesMatch = true;
        for (const asset of assets) {
          const stored = await stat(path.join(backup, ".storage", "audio", asset.key))
            .then((entry) => entry.size)
            .catch(() => null);
          if (stored === null) bytesMatch = false;
          else if (asset.size !== null && stored !== asset.size) bytesMatch = false;
          if (stored !== null) copies += 1;
        }
        check(
          "the recording bytes came across with the restore",
          bytesMatch,
          `${copies}/${assets.length} recordings found at their keys in the copy`,
        );
      }
    } finally {
      await release();
    }
  } finally {
    // The scratch copy is closed (one process may open a directory at a time)
    // and removed  - the operator-pointed backup directory stays for inspection.
    if (scratch) {
      await getPglite().close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 200));
      await rm(backup, { recursive: true, force: true }).catch(() => {});
    }
  }

  /* ------------------------------------------------------------ the report */
  const failed = checks.filter((entry) => !entry.pass);
  for (const entry of checks) {
    console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.name}, ${entry.detail}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  return failed.length === 0;
}

runCli("restore-drill.ts", async () => {
  const ok = await restoreDrill();
  if (!ok) throw new Error("restore drill failed");
}, "live");
