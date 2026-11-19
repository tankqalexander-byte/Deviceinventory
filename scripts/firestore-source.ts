/**
 * Reads every collection the app uses from Firestore (read-only).
 * Uses the app's own Firebase config and an anonymous sign-in, which the
 * Firestore rules allow to read.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, terminate } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };
import { COLLECTIONS, encodeFirestoreValue, type Snapshot } from "../server/snapshot.ts";

export async function fetchFirestoreSnapshot(log = true): Promise<Snapshot> {
  const app = initializeApp(firebaseConfig, `export-${Date.now()}`);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  const snapshot: Snapshot = {
    format: "firestore-snapshot/v1",
    exportedAt: new Date().toISOString(),
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    collections: {} as Snapshot["collections"],
  };
  try {
    for (const name of COLLECTIONS) {
      const qs = await getDocs(collection(db, name));
      snapshot.collections[name] = qs.docs
        .map((d) => ({ id: d.id, data: encodeFirestoreValue(d.data()) as Record<string, unknown> }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (log) console.log(`  ${name.padEnd(14)} ${qs.size} documents`);
    }
  } finally {
    await terminate(db);
  }
  return snapshot;
}
