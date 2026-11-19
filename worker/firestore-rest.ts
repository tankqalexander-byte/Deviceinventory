/**
 * Reads the old Firestore database over its REST API (read-only). Used once,
 * by the first-run import, to copy the existing data into D1. Produces exactly
 * the same snapshot shape as scripts/firestore-export.ts.
 */
import { COLLECTIONS, type Snapshot } from "../server/snapshot.ts";

export interface FirestoreSource {
  apiKey: string;
  projectId: string;
  databaseId: string;
}

type FsValue = Record<string, any>;

function decode(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) {
    const d = v.doubleValue;
    if (typeof d === "number") return d;
    const n = Number(d);
    return Number.isFinite(n) ? n : { $fs: "number", value: String(d) };
  }
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("timestampValue" in v) {
    const s: string = v.timestampValue;
    const m = /\.(\d+)Z$/.exec(s);
    const nanos = m ? Number(m[1].padEnd(9, "0").slice(0, 9)) : 0;
    const seconds = Math.floor(Date.parse(s.replace(/\.\d+Z$/, "Z")) / 1000);
    return { $fs: "timestamp", seconds, nanoseconds: nanos, iso: new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString() };
  }
  if ("geoPointValue" in v) return { $fs: "geopoint", latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ("referenceValue" in v) return { $fs: "reference", path: String(v.referenceValue).replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, "") };
  if ("bytesValue" in v) return { $fs: "bytes", base64: v.bytesValue };
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(v)}`);
}

function decodeFields(fields: Record<string, FsValue>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

export async function fetchFirestoreViaRest(src: FirestoreSource): Promise<Snapshot> {
  // Same access the old app used: an anonymous Firebase sign-in.
  const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${src.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!auth.ok) throw new Error(`Firebase sign-in failed (${auth.status}): ${await auth.text()}`);
  const { idToken } = (await auth.json()) as { idToken: string };

  const base = `https://firestore.googleapis.com/v1/projects/${src.projectId}/databases/${src.databaseId}/documents`;
  const snapshot: Snapshot = {
    format: "firestore-snapshot/v1",
    exportedAt: new Date().toISOString(),
    projectId: src.projectId,
    databaseId: src.databaseId,
    collections: {} as Snapshot["collections"],
  };
  for (const c of COLLECTIONS) {
    // runQuery (what the official SDK uses); the plain list endpoint is
    // refused by the security rules. Returns every document in the collection.
    const res = await fetch(`${base}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: c }] } }),
    });
    if (!res.ok) throw new Error(`Reading Firestore ${c} failed (${res.status}): ${await res.text()}`);
    const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
    const docs = rows
      .filter((r) => r.document)
      .map((r) => ({ id: decodeURIComponent(r.document!.name.split("/").pop()!), data: decodeFields(r.document!.fields ?? {}) }));
    snapshot.collections[c] = docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return snapshot;
}
