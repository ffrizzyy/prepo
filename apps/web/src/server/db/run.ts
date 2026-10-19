import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getPglite } from "./client";
import { loadEnvFiles } from "./env";

/**
 * The database a `db:*` script runs against, said at the call site:
 *
 * - "live" (the default) is the working `.pglite` under `apps/web`, which is
 *   also the directory a running app has open. It is what the operator jobs
 *   (seed, migrate, the fixtures, the chaser, the sync, the backfills) are for,
 *   and it is the *wrong* place for a suite that calls `seed()`, because the
 *   seed truncates every table: a suite that reseeds the workspace would drop
 *   the connections, the sessions and anything else a person had in there.
 *
 * - "fresh" throws a directory away instead of using that: a temp `PGLITE_DIR`
 *   is created before any database access and removed after the suite finishes,
 *   so a check script is self-contained and cannot touch a person's data no
 *   matter what it does inside. It can be pointed anywhere by setting
 *   `PGLITE_DIR` before the run, which is how a suite runs twice side by side.
 *
 * The kind is passed per script, so "what ran against whose data" is readable
 * at the call site rather than remembered.
 */
export type DatabaseKind = "live" | "fresh";

/** Runs a script only when it is the process entrypoint (see package.json). */
export function runCli(
  entryFile: string,
  fn: () => Promise<void>,
  kind: DatabaseKind = "live",
): void {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  if (!entry.endsWith(entryFile)) return;

  // Before the body runs, so a script sees the same environment the server does.
  loadEnvFiles();

  if (kind === "live") {
    fn()
      // A script that sets process.exitCode (a check that failed) keeps it; one
      // that finishes without an opinion exits 0.
      .then(() => process.exit(process.exitCode ?? 0))
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
    return;
  }

  (async () => {
    // A run the operator pointed at a database (`PGLITE_DIR`, and a
    // `DATABASE_URL` if they said so) runs where they pointed it: that is how
    // `db:verify` gets run against a real Postgres. A run left alone is a
    // PGlite run, throwaway, with any stale `DATABASE_URL` dropped, because a
    // generated tmpdir following the `.env.local` key to a remote server would
    // never be a throwaway.
    const operatorDirectory = process.env.PGLITE_DIR;
    const fresh = operatorDirectory ? null : await mkdtemp(path.join(tmpdir(), "prepo-run-"));
    if (fresh) {
      delete process.env.DATABASE_URL;
      process.env.PGLITE_DIR = fresh;
    }

    try {
      await fn();
      process.exit(process.exitCode ?? 0);
    } catch (error: unknown) {
      console.error(error);
      process.exit(1);
    } finally {
      if (fresh) {
        // The WASM database holds its data directory open; it must be closed
        // before the delete or the rm fails on a Windows file lock.
        await getPglite().close().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200));
        await rm(fresh, { recursive: true, force: true }).catch(() => {});
      }
    }
  })();
}
