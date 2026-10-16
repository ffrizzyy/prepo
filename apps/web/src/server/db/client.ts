import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as nodeDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

let db: Db | null = null;
let pglite: PGlite | null = null;
let pool: Pool | null = null;

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

/**
 * Local development and tests run on PGlite — real Postgres compiled to WASM —
 * so there is no container to start. Setting DATABASE_URL swaps in a real
 * Postgres (Neon in production); the schema, migrations and queries are identical.
 */
export function getPglite(): PGlite {
  if (!pglite) pglite = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  return pglite;
}

export function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: databaseUrl() });
  return pool;
}

export function getDb(): Db {
  if (db) return db;
  db = databaseUrl()
    ? (nodeDrizzle(getPool(), { schema }) as unknown as Db)
    : pgliteDrizzle(getPglite(), { schema });
  return db;
}

/** Minimal single-connection handle, so `set local` scoping is guaranteed. */
export type SqlClient = {
  query<R>(text: string, params?: unknown[]): Promise<R[]>;
  exec(text: string): Promise<void>;
};

export async function acquireClient(): Promise<{
  client: SqlClient;
  release: () => Promise<void>;
}> {
  if (databaseUrl()) {
    const connection = await getPool().connect();
    return {
      client: {
        async query<R>(text: string, params: unknown[] = []) {
          const result = await connection.query(text, params);
          return result.rows as R[];
        },
        async exec(text) {
          await connection.query(text);
        },
      },
      release: async () => {
        connection.release();
      },
    };
  }

  const embedded = getPglite();
  return {
    client: {
      async query<R>(text: string, params: unknown[] = []) {
        const result = await embedded.query<R>(text, params as never[]);
        return result.rows;
      },
      async exec(text: string) {
        await embedded.exec(text);
      },
    },
    release: async () => {},
  };
}

/** Runs a statement outside of any driver-specific typing. */
export async function rawExec(text: string): Promise<void> {
  if (databaseUrl()) {
    await getPool().query(text);
    return;
  }
  await getPglite().exec(text);
}

export async function rawQuery<R>(
  text: string,
  params: unknown[] = [],
): Promise<R[]> {
  const { client, release } = await acquireClient();
  try {
    return await client.query<R>(text, params);
  } finally {
    await release();
  }
}

/**
 * Runs application queries as the non-owner `prepo_app` role. RLS does not
 * apply to a table's owner or to a superuser, so role switching is what makes
 * the policies enforceable.
 */
export async function asApp<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role prepo_app`);
    return fn(tx as unknown as Db);
  });
}

/**
 * Every tenant query is scoped to one workspace. `set local` keeps the role and
 * the tenant setting bound to this transaction, so pooled connections cannot
 * leak scope into the next request.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role prepo_app`);
    await tx.execute(
      sql`select set_config('app.workspace_id', ${workspaceId}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}
