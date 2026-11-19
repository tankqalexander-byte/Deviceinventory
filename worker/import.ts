/**
 * One-time move of the old Firestore data into D1, run automatically by the
 * Worker before it serves its first API request.
 *
 * - Runs only while D1 has never been initialised. If D1 already holds data,
 *   it is never touched.
 * - Copies every collection, then reads everything back from D1 and compares
 *   it record by record with what Firestore returned. On any difference the
 *   copy is wiped and the API keeps answering 503, so the app never starts on
 *   partial data (and never seeds its sample data over it).
 * - After success, the app never reads from or writes to Firestore again.
 */
import { COLLECTIONS, type CollectionName, type Snapshot, type SnapshotDoc } from "../server/snapshot.ts";
import { ENTITIES, encode, listRecords, countRecords } from "../server/repo.ts";
import { compareDocs } from "../server/compare.ts";
import type { Db } from "../server/db.ts";
import { fetchFirestoreViaRest, type FirestoreSource } from "./firestore-rest.ts";

export class ImportPending extends Error {}

const KEY = "firestore_import";
const STALE_MS = 2 * 60 * 1000;
let done = false; // cached per Worker instance

export async function ensureImported(d1: D1Database, db: Db, src: FirestoreSource): Promise<void> {
  if (done) return;
  const state = await d1.prepare(`SELECT value FROM app_meta WHERE key = ?1`).bind(KEY).first<{ value: string }>();
  if (state?.value.startsWith("done")) {
    done = true;
    return;
  }

  // Never overwrite data that is already in D1.
  if (!state) {
    const counts = await countRecords(db);
    if (COLLECTIONS.some((c) => counts[c] > 0)) {
      await d1.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, ?2)`).bind(KEY, `done:skipped-existing-data:${new Date().toISOString()}`).run();
      done = true;
      return;
    }
  }

  // Take the lock so only one request performs the import.
  const now = Date.now();
  const lock = await d1
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?1, ?2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value
       WHERE app_meta.value NOT LIKE 'done%'
         AND (app_meta.value NOT LIKE 'running:%' OR CAST(substr(app_meta.value, 9) AS INTEGER) < ?3)`,
    )
    .bind(KEY, `running:${now}`, now - STALE_MS)
    .run();
  if (!lock.meta.changes) throw new ImportPending("Moving data from Firestore — try again in a few seconds.");

  try {
    const snapshot = await fetchFirestoreViaRest(src);
    await bulkInsert(d1, snapshot);

    const actual = {} as Record<CollectionName, SnapshotDoc[]>;
    for (const c of COLLECTIONS) actual[c] = await listRecords(db, c);
    const result = compareDocs(snapshot.collections, actual);
    if (!result.ok) throw new Error("Verification failed:\n" + result.problems.slice(0, 10).join("\n"));

    const summary = COLLECTIONS.map((c) => `${c}=${result.perCollection[c].matched}`).join(",");
    await d1.prepare(`UPDATE app_meta SET value = ?2 WHERE key = ?1`).bind(KEY, `done:${new Date().toISOString()}:${summary}`).run();
    console.log(`Firestore import complete and verified: ${summary}`);
    done = true;
  } catch (err) {
    console.error("Firestore import failed:", err);
    await d1.batch([
      ...Object.values(ENTITIES).map((e) => d1.prepare(`DELETE FROM ${e.table}`)),
      d1.prepare(`DELETE FROM loan_records`),
      d1.prepare(`DELETE FROM app_meta WHERE key = ?1`).bind(KEY),
    ]);
    throw new ImportPending(`Data import from Firestore failed: ${(err as Error).message}`);
  }
}

/** Inserts a whole collection per statement (via json_each) to stay well under D1's per-request query limits. */
async function bulkInsert(d1: D1Database, snapshot: Snapshot) {
  const stmts: D1PreparedStatement[] = [
    d1.prepare(`DELETE FROM loan_records`),
    ...Object.values(ENTITIES).map((e) => d1.prepare(`DELETE FROM ${e.table}`)),
  ];
  const loans: Record<string, unknown>[] = [];
  for (const c of COLLECTIONS) {
    const rows = snapshot.collections[c].map((d) => {
      const enc = encode(c, d.id, d.data);
      for (const l of enc.loans) loans.push({ device_id: d.id, slot: l.slot, position: l.position, ...l.cols, extra: l.extra });
      return { id: d.id, ...enc.cols, extra: enc.extra };
    });
    const cols = ["id", ...ENTITIES[c].fields.map((f) => f.col), "extra"];
    stmts.push(...insertJson(d1, ENTITIES[c].table, cols, rows));
  }
  const loanCols = ["device_id", "slot", "position", "id", "loan_device_id", "user_id", "user_name", "user_email", "user_department",
    "checkout_date", "expected_return_date", "returned_date", "notes", "status", "condition_on_return", "extra"];
  stmts.push(...insertJson(d1, "loan_records", loanCols, loans));
  await d1.batch(stmts); // atomic
}

function insertJson(d1: D1Database, table: string, cols: string[], rows: Record<string, unknown>[]) {
  const out: D1PreparedStatement[] = [];
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) SELECT ${cols.map((c) => `json_extract(value, '$.${c}')`).join(", ")} FROM json_each(?1)`;
  // Chunk to keep each bound parameter comfortably under D1's size limits.
  let chunk: Record<string, unknown>[] = [], size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length;
    if (chunk.length && size + s > 500_000) {
      out.push(d1.prepare(sql).bind(JSON.stringify(chunk)));
      chunk = [];
      size = 0;
    }
    chunk.push(r);
    size += s;
  }
  if (chunk.length) out.push(d1.prepare(sql).bind(JSON.stringify(chunk)));
  return out;
}
