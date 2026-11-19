/**
 * Cloudflare D1 (SQLite) adapter for the shared repository code in server/.
 *
 * The repository is written in PostgreSQL syntax; this adapter rewrites the
 * few differences ($1 -> ?1, drops ::jsonb / ::int casts) and parses the
 * `extra` JSON column, so server/repo.ts runs unchanged on D1.
 */
import type { Db, Queryable } from "../server/db.ts";

const toSqlite = (sql: string) => sql.replace(/::(jsonb|int)\b/g, "").replace(/\$(\d+)/g, "?$1");

function parseRow(row: Record<string, unknown>) {
  if (typeof row.extra === "string") row.extra = JSON.parse(row.extra);
  return row;
}

const isWrite = (sql: string) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);

export function d1Db(d1: D1Database): Db {
  const prepare = (sql: string, params: unknown[] = []) => d1.prepare(toSqlite(sql)).bind(...params);
  const query: Queryable["query"] = async (sql, params) => {
    const res = await prepare(sql, params).all();
    return { rows: (res.results as any[]).map(parseRow) as any[] };
  };
  return {
    description: "Cloudflare D1",
    query,
    // D1 has no interactive transactions. Reads run immediately; writes are
    // collected and committed together with d1.batch(), which is atomic.
    async tx(fn) {
      const writes: D1PreparedStatement[] = [];
      const result = await fn({
        query: async (sql, params) => {
          if (isWrite(sql)) {
            writes.push(prepare(sql, params));
            return { rows: [] };
          }
          return query(sql, params);
        },
      });
      if (writes.length) await d1.batch(writes);
      return result;
    },
    close: async () => {},
  };
}

/** SQLite version of server/schema.ts (same tables, columns and constraints). */
const SCHEMA_V1 = [
  `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, extra TEXT NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT, extra TEXT NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS staff_members (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, department TEXT,
    employment_status TEXT CHECK (employment_status IN ('Full-Time','Part-Time','Contractor','Intern','On Leave','Offboarded')),
    avatar_url TEXT, extra TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS staff_members_email_idx ON staff_members (lower(email))`,
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, name TEXT, model TEXT, serial_number TEXT, category TEXT,
    status TEXT CHECK (status IN ('available','loaned','maintenance','retired')),
    condition TEXT CHECK (condition IN ('Excellent','Good','Fair','Needs Service')),
    purchase_date TEXT, location TEXT, image TEXT, notes TEXT, extra TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS devices_status_idx ON devices (status)`,
  `CREATE INDEX IF NOT EXISTS devices_category_idx ON devices (category)`,
  `CREATE INDEX IF NOT EXISTS devices_serial_idx ON devices (serial_number)`,
  `CREATE TABLE IF NOT EXISTS loan_records (
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK (slot IN ('history','current')),
    position INTEGER NOT NULL,
    id TEXT, loan_device_id TEXT, user_id TEXT, user_name TEXT, user_email TEXT, user_department TEXT,
    checkout_date TEXT, expected_return_date TEXT, returned_date TEXT, notes TEXT,
    status TEXT CHECK (status IN ('active','returned','overdue')),
    condition_on_return TEXT CHECK (condition_on_return IN ('Excellent','Good','Fair','Needs Service')),
    extra TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (device_id, slot, position),
    CHECK (slot = 'history' OR position = 0))`,
  `CREATE INDEX IF NOT EXISTS loan_records_user_idx ON loan_records (user_id)`,
  `CREATE INDEX IF NOT EXISTS loan_records_status_idx ON loan_records (status)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, name TEXT, url TEXT, username TEXT, password TEXT, renewal_date TEXT,
    remarks TEXT, category TEXT, cost REAL, billing_cycle TEXT, contact_person TEXT, status TEXT,
    extra TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS subscriptions_renewal_idx ON subscriptions (renewal_date)`,
  `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1')`,
];

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use (once per Worker instance). */
export function ensureSchema(d1: D1Database) {
  schemaReady ??= (async () => {
    const row = await d1
      .prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`)
      .first<{ value: string }>()
      .catch(() => null);
    if (row) return;
    await d1.batch(SCHEMA_V1.map((s) => d1.prepare(s)));
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
