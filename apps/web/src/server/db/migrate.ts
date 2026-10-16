import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, rawExec } from "./client";
import { runCli } from "./run";

const MIGRATIONS_FOLDER = join(process.cwd(), "drizzle");

/**
 * Applies Drizzle migrations, then the hand-written SQL that the schema cannot
 * express: RLS policies, grants, helper functions and full-text search.
 */
export async function migrateAndApply(): Promise<void> {
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // Both drizzle drivers expose the same migrator contract.
    await migrate(getDb() as never, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
  }

  const policiesDir = join(MIGRATIONS_FOLDER, "policies");
  if (!existsSync(policiesDir)) return;

  for (const file of readdirSync(policiesDir).sort()) {
    if (!file.endsWith(".sql")) continue;
    await rawExec(readFileSync(join(policiesDir, file), "utf8"));
  }
}

runCli("migrate.ts", async () => {
  await migrateAndApply();
  console.log("✓ migrations applied; policies, grants and search configured");
});
