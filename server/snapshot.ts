/** Snapshot file format shared by the export, import and verify scripts. */

export const COLLECTIONS = ["categories", "departments", "staffMembers", "devices", "subscriptions"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface SnapshotDoc {
  id: string; // Firestore document ID
  data: Record<string, unknown>; // document body, exactly as stored
}

export interface Snapshot {
  format: "firestore-snapshot/v1";
  exportedAt: string;
  projectId: string;
  databaseId: string;
  collections: Record<CollectionName, SnapshotDoc[]>;
}

/**
 * Convert a Firestore document value into plain JSON without losing
 * information. JSON-native values pass through untouched; the rare
 * Firestore-specific types get a tagged object: { "$fs": "<type>", ... }.
 */
export function encodeFirestoreValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) return { $fs: "number", value: String(v) };
    return v;
  }
  if (Array.isArray(v)) return v.map(encodeFirestoreValue);
  const o = v as any;
  if (typeof o.toMillis === "function" && "seconds" in o && "nanoseconds" in o) {
    return { $fs: "timestamp", seconds: o.seconds, nanoseconds: o.nanoseconds, iso: new Date(o.toMillis()).toISOString() };
  }
  if (typeof o.latitude === "number" && typeof o.longitude === "number" && typeof o.isEqual === "function") {
    return { $fs: "geopoint", latitude: o.latitude, longitude: o.longitude };
  }
  if (typeof o.path === "string" && o.firestore && typeof o.id === "string") {
    return { $fs: "reference", path: o.path };
  }
  if (typeof o.toBase64 === "function") {
    return { $fs: "bytes", base64: o.toBase64() };
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) out[k] = encodeFirestoreValue(o[k]);
  return out;
}

export function readSnapshot(text: string): Snapshot {
  const s = JSON.parse(text);
  if (s?.format !== "firestore-snapshot/v1" || typeof s.collections !== "object") {
    throw new Error("Not a firestore-snapshot/v1 file (create one with `npm run migrate:export`).");
  }
  for (const c of COLLECTIONS) {
    if (!Array.isArray(s.collections[c])) throw new Error(`Snapshot is missing collection "${c}".`);
  }
  return s as Snapshot;
}
