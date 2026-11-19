/**
 * Step 1 of the migration: read-only export of all Firestore data to a JSON
 * snapshot file. Nothing in Firestore is modified.
 *
 *   npm run migrate:export                 -> firestore-export-<timestamp>.json
 *   npm run migrate:export -- out.json     -> out.json
 *
 * The snapshot contains staff details and subscription passwords in plain
 * text. Store it somewhere safe and delete it once the migration is verified.
 */
import fs from "node:fs";
import { fetchFirestoreSnapshot } from "./firestore-source.ts";

const out = process.argv[2] || `firestore-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

console.log("Reading Firestore…");
fetchFirestoreSnapshot()
  .then((snapshot) => {
    fs.writeFileSync(out, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    console.log(`\nSnapshot written to ${out}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Export failed:", err);
    process.exit(1);
  });
