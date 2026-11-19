/**
 * Database connection. One SQL dialect (PostgreSQL), two drivers:
 *
 *   DATABASE_URL=postgres://...   -> node-postgres against a real server
 *                                   (use this in production, e.g. Cloud SQL)
 *   DATABASE_URL unset            -> PGlite: embedded Postgres stored in
 *                                   ./data/pglite (zero-setup local dev)
 *
 * Note: a container's local disk on Cloud Run is wiped on every deploy and
 * restart, so the embedded fallback is for development only.
 */
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_MIGRATIONS } from "./schema.ts";

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Runs fn inside a transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly description: string;
}

export async function openDb(url = process.env.DATABASE_URL): Promise<Db> {
  const db = url && /^postgres(ql)?:\/\//.test(url) ? await openPg(url) : await openPglite(url);
  await migrate(db);
  return db;
}

async function openPg(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE || 10) });
  return {
    description: `PostgreSQL (${new URL(url).host})`,
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (sql, params) => client.query(sql, params as any[]) as any });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openPglite(url?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  // Accepts "memory://", "file:./some/dir", a bare directory path, or nothing.
  let dataDir: string | undefined;
  if (url === "memory://") dataDir = undefined;
  else {
    dataDir = path.resolve(url ? url.replace(/^file:/, "") : "data/pglite");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  // PGlite is single-connection; serialize transactions so they never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    description: dataDir ? `embedded PGlite (${dataDir})` : "embedded PGlite (in-memory)",
    query: (sql, params) => serialize(() => pg.query(sql, params as any[]) as any),
    tx: (fn) => serialize(() => pg.transaction((t) => fn({ query: (sql, params) => t.query(sql, params as any[]) as any }))),
    close: () => pg.close(),
  };
}

async function migrate(db: Db) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ version: number }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => Number(r.version)));
  for (const m of SCHEMA_MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await db.tx(async (q) => {
      for (const stmt of m.statements) await q.query(stmt);
      await q.query("INSERT INTO schema_migrations (version) VALUES ($1)", [m.version]);
    });
  }
}
