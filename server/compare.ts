import { COLLECTIONS, type CollectionName, type SnapshotDoc } from "./snapshot.ts";

/** Strict JSON deep equality. Object key order is ignored (it is not meaningful in Firestore or JSON). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return typeof a !== "number" || !Object.is(a, -0) === !Object.is(b, -0);
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ak = Object.keys(a as object), bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as any)[k], (b as any)[k]));
}

export interface CompareResult {
  ok: boolean;
  perCollection: Record<CollectionName, { expected: number; actual: number; matched: number }>;
  problems: string[];
}

/** Compare two sets of documents, collection by collection, document by document. */
export function compareDocs(
  expected: Record<CollectionName, SnapshotDoc[]>,
  actual: Record<CollectionName, SnapshotDoc[]>,
  maxProblems = 50,
): CompareResult {
  const problems: string[] = [];
  const perCollection = {} as CompareResult["perCollection"];
  for (const c of COLLECTIONS) {
    const exp = new Map(expected[c].map((d) => [d.id, d.data]));
    const act = new Map(actual[c].map((d) => [d.id, d.data]));
    let matched = 0;
    for (const [id, data] of exp) {
      if (!act.has(id)) problems.push(`${c}/${id}: missing from SQL`);
      else if (!deepEqual(data, act.get(id))) problems.push(`${c}/${id}: differs\n  expected ${JSON.stringify(data)}\n  actual   ${JSON.stringify(act.get(id))}`);
      else matched++;
    }
    for (const id of act.keys()) if (!exp.has(id)) problems.push(`${c}/${id}: in SQL but not in source`);
    perCollection[c] = { expected: exp.size, actual: act.size, matched };
  }
  return { ok: problems.length === 0, perCollection, problems: problems.slice(0, maxProblems) };
}
