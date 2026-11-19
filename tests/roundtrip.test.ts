/**
 * Proves the SQL mapping is lossless: random documents (including malformed
 * legacy shapes) are written and read back, and must deep-equal the input.
 *
 * Runs against embedded PGlite; set TEST_DATABASE_URL=postgres://... to also
 * run against a real PostgreSQL server (the database is wiped).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openDb, type Db } from "../server/db.ts";
import { COLLECTIONS, readSnapshot, type CollectionName, type SnapshotDoc } from "../server/snapshot.ts";
import { listRecords, putRecord, truncateAll, deleteRecord, countRecords } from "../server/repo.ts";
import { compareDocs, deepEqual } from "../server/compare.ts";

// Small seeded PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const str = () => pick(["", "x", "Laptops", "émoji 🎉 ✓", "line\nbreak", "quote's \"q\"", "a".repeat(300), "Needs Service", "available", "active"]);
  const scalar = (): unknown => pick([() => str(), () => r() * 1e6 - 5e5, () => Math.floor(r() * 1000), () => 0, () => r() < 0.5, () => null])();
  const value = (depth = 0): unknown => {
    const k = r();
    if (depth > 2 || k < 0.6) return scalar();
    if (k < 0.8) return Array.from({ length: Math.floor(r() * 4) }, () => value(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(r() * 4) }, (_, i) => [`k${i}${str().slice(0, 3)}`, value(depth + 1)]));
  };
  const maybe = (key: string, good: () => unknown, o: Record<string, unknown>) => {
    const k = r();
    if (k < 0.55) o[key] = good();
    else if (k < 0.75) return; // absent
    else o[key] = value(); // wrong type / null / anything
  };
  const loan = () => {
    const o: Record<string, unknown> = {};
    for (const f of ["id", "deviceId", "userId", "userName", "userEmail", "userDepartment", "checkoutDate", "expectedReturnDate", "returnedDate", "notes"]) maybe(f, str, o);
    maybe("status", () => pick(["active", "returned", "overdue"]), o);
    maybe("conditionOnReturn", () => pick(["Excellent", "Good", "Fair", "Needs Service"]), o);
    if (r() < 0.2) o.surprise = value();
    return o;
  };
  const doc = (c: CollectionName, id: string): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    const k = r();
    if (k < 0.8) o.id = id;
    else if (k < 0.9) o.id = value(); // mismatched / wrong type
    // else: id absent
    const text = (fs: string[]) => fs.forEach((f) => maybe(f, str, o));
    if (c === "categories" || c === "departments") text(["name"]);
    if (c === "staffMembers") {
      text(["name", "email", "department", "avatarUrl"]);
      maybe("employmentStatus", () => pick(["Full-Time", "Part-Time", "Contractor", "Intern", "On Leave", "Offboarded"]), o);
    }
    if (c === "subscriptions") {
      text(["name", "url", "username", "password", "renewalDate", "remarks", "category", "billingCycle", "contactPerson", "status"]);
      maybe("cost", () => r() * 5000, o);
    }
    if (c === "devices") {
      text(["name", "model", "serialNumber", "category", "purchaseDate", "location", "image", "notes"]);
      maybe("status", () => pick(["available", "loaned", "maintenance", "retired"]), o);
      maybe("condition", () => pick(["Excellent", "Good", "Fair", "Needs Service"]), o);
      maybe("history", () => Array.from({ length: Math.floor(r() * 5) }, loan), o);
      if (r() < 0.1) o.history = [loan(), value()]; // non-object entry
      maybe("currentLoan", loan, o);
    }
    if (r() < 0.25) o[`ghost_${seed}`] = value();
    return o;
  };
  return doc;
}

async function roundTrip(db: Db, label: string) {
  await test(`${label}: random documents round-trip exactly`, async () => {
    await truncateAll(db);
    const expected = {} as Record<CollectionName, SnapshotDoc[]>;
    let seed = 1;
    for (const c of COLLECTIONS) {
      expected[c] = [];
      for (let i = 0; i < 150; i++) {
        const id = `${c}-${i}`;
        const data = gen(seed++)(c, id);
        expected[c].push({ id, data });
        await putRecord(db, c, id, data);
      }
    }
    const actual = {} as Record<CollectionName, SnapshotDoc[]>;
    for (const c of COLLECTIONS) actual[c] = await listRecords(db, c);
    const result = compareDocs(expected, actual);
    assert.ok(result.ok, result.problems.slice(0, 5).join("\n"));
  });

  await test(`${label}: replace and delete behave like setDoc/deleteDoc`, async () => {
    await truncateAll(db);
    const dev = { id: "d1", name: "A", history: [{ id: "l1" }, { id: "l2" }], currentLoan: { id: "l1" } } as any;
    await putRecord(db, "devices", "d1", dev);
    const replaced = { id: "d1", name: "B", history: [] };
    await putRecord(db, "devices", "d1", replaced);
    const [got] = await listRecords(db, "devices");
    assert.ok(deepEqual(got.data, replaced), JSON.stringify(got.data));
    await deleteRecord(db, "devices", "d1");
    const counts = await countRecords(db);
    assert.equal(counts.devices, 0);
    assert.equal(counts.loan_records, 0, "loan rows cascade with the device");
  });

  const snap = process.env.SNAPSHOT_FILE;
  if (snap && fs.existsSync(snap)) {
    await test(`${label}: real Firestore snapshot round-trips exactly`, async () => {
      const s = readSnapshot(fs.readFileSync(snap, "utf8"));
      await truncateAll(db);
      await db.tx(async (q) => {
        for (const c of COLLECTIONS) for (const d of s.collections[c]) await putRecord(q, c, d.id, d.data);
      });
      const actual = {} as Record<CollectionName, SnapshotDoc[]>;
      for (const c of COLLECTIONS) actual[c] = await listRecords(db, c);
      const result = compareDocs(s.collections, actual);
      assert.ok(result.ok, result.problems.slice(0, 5).join("\n"));
    });
  }
}

const pglite = await openDb("memory://");
await roundTrip(pglite, "PGlite");
await pglite.close();

if (process.env.TEST_DATABASE_URL) {
  const pg = await openDb(process.env.TEST_DATABASE_URL);
  await roundTrip(pg, "PostgreSQL");
  await pg.close();
}
