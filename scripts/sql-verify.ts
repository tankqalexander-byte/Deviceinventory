/**
 * Compare the SQL database with Firestore, record by record.
 *
 *   npm run migrate:verify -- firestore-export.json   compare with a snapshot file
 *   npm run migrate:verify -- --live                  compare with live Firestore now
 *
 * Use --live right before switching over to confirm nothing was written to
 * Firestore after the export. Exits non-zero on any difference.
 */
import "../server/env.ts";
import fs from "node:fs";
import { openDb } from "../server/db.ts";
import { COLLECTIONS, readSnapshot, type CollectionName, type SnapshotDoc } from "../server/snapshot.ts";
import { listRecords } from "../server/repo.ts";
import { compareDocs } from "../server/compare.ts";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: npm run migrate:verify -- <snapshot.json> | --live");

  let source;
  if (arg === "--live") {
    const { fetchFirestoreSnapshot } = await import("./firestore-source.ts");
    console.log("Reading live Firestore…");
    source = await fetchFirestoreSnapshot();
  } else {
    source = readSnapshot(fs.readFileSync(arg, "utf8"));
  }

  const db = await openDb();
  try {
    const actual = {} as Record<CollectionName, SnapshotDoc[]>;
    for (const c of COLLECTIONS) actual[c] = await listRecords(db, c);
    const result = compareDocs(source.collections, actual);
    console.log(`\nSQL: ${db.description}`);
    console.log("Collection       Firestore   SQL   Identical");
    for (const c of COLLECTIONS) {
      const r = result.perCollection[c];
      console.log(`${c.padEnd(16)} ${String(r.expected).padStart(9)} ${String(r.actual).padStart(5)} ${String(r.matched).padStart(11)}`);
    }
    if (!result.ok) {
      console.error("\n" + result.problems.join("\n"));
      throw new Error("SQL and Firestore differ.");
    }
    console.log("\n✓ SQL matches Firestore exactly.");
  } finally {
    await db.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
