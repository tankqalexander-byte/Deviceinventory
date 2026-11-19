/**
 * Step 2 of the migration: load a Firestore snapshot into SQL.
 *
 *   npm run migrate:import -- firestore-export.json [--replace]
 *
 * Everything happens in ONE transaction. Before committing, every record is
 * read back from SQL and compared field by field with the snapshot; if a
 * single value differs, the transaction is rolled back and nothing is written.
 *
 * Refuses to run against a database that already has data unless --replace
 * is given (which wipes the SQL tables first, never Firestore).
 */
import "../server/env.ts";
import fs from "node:fs";
import { openDb } from "../server/db.ts";
import { COLLECTIONS, readSnapshot, type Snapshot, type CollectionName, type SnapshotDoc } from "../server/snapshot.ts";
import { countRecords, listRecords, putRecord, truncateAll } from "../server/repo.ts";
import { compareDocs } from "../server/compare.ts";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const replace = args.includes("--replace");
  if (!file) throw new Error("Usage: npm run migrate:import -- <snapshot.json> [--replace]");

  const snapshot: Snapshot = readSnapshot(fs.readFileSync(file, "utf8"));
  const db = await openDb();
  console.log(`Target: ${db.description}`);
  console.log(`Source: ${file} (exported ${snapshot.exportedAt} from ${snapshot.projectId}/${snapshot.databaseId})\n`);

  try {
    const before = await countRecords(db);
    const nonEmpty = COLLECTIONS.some((c) => before[c] > 0);
    if (nonEmpty && !replace) {
      throw new Error(
        `The SQL database already contains data (${JSON.stringify(before)}).\n` +
          `Re-run with --replace to wipe the SQL tables and import the snapshot.`,
      );
    }

    await db.tx(async (q) => {
      if (replace) await truncateAll(q);
      for (const c of COLLECTIONS) {
        for (const doc of snapshot.collections[c]) await putRecord(q, c, doc.id, doc.data);
      }
      // Verify inside the transaction so a mismatch rolls everything back.
      const actual = {} as Record<CollectionName, SnapshotDoc[]>;
      for (const c of COLLECTIONS) actual[c] = await listRecords(q, c);
      const result = compareDocs(snapshot.collections, actual);
      if (!result.ok) {
        console.error(result.problems.join("\n"));
        throw new Error("Verification failed — transaction rolled back, nothing was written.");
      }
    });

    // Independent check after commit, on a fresh read.
    const actual = {} as Record<CollectionName, SnapshotDoc[]>;
    for (const c of COLLECTIONS) actual[c] = await listRecords(db, c);
    const result = compareDocs(snapshot.collections, actual);
    const counts = await countRecords(db);

    console.log("Collection       Firestore   SQL   Identical");
    for (const c of COLLECTIONS) {
      const r = result.perCollection[c];
      console.log(`${c.padEnd(16)} ${String(r.expected).padStart(9)} ${String(r.actual).padStart(5)} ${String(r.matched).padStart(11)}`);
    }
    console.log(`(loan_records rows: ${counts.loan_records})`);
    if (!result.ok) throw new Error("Post-commit verification failed:\n" + result.problems.join("\n"));
    console.log("\n✓ Import complete. Every record in SQL is identical to the Firestore snapshot.");
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
