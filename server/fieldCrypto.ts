/**
 * Encryption at rest for sensitive subscription fields (username, password).
 *
 * - AES-256-GCM via WebCrypto (works in Cloudflare Workers and Node 20+).
 * - Key: DATA_ENCRYPTION_KEY = base64 of 32 random bytes, stored as a
 *   Cloudflare secret / server env var — never in the database or the repo.
 *   LOSING THE KEY MEANS LOSING THE ENCRYPTED VALUES. Keep a copy safe.
 * - Stored format: "enc:v1:<iv base64>:<ciphertext base64>". Each value is
 *   bound to its record and field (AES-GCM additional data), so encrypted
 *   values can't be swapped between records or fields.
 * - Values without the prefix are legacy plaintext and are returned as-is;
 *   encryptExistingSubscriptions() converts them once the key is set.
 * - Empty strings stay empty (nothing secret to protect).
 */
import type { Queryable } from "./db.ts";
import { listRecords, putRecord } from "./repo.ts";

const PREFIX = "enc:v1:";
export const ENCRYPTED_SUBSCRIPTION_FIELDS = ["username", "password"] as const;

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class EncryptionKeyError extends Error {}

const keyCache = new Map<string, Promise<CryptoKey>>();
export function importDataKey(base64Key: string): Promise<CryptoKey> {
  let p = keyCache.get(base64Key);
  if (!p) {
    p = (async () => {
      let raw: Uint8Array;
      try {
        raw = unb64(base64Key.trim());
      } catch {
        throw new EncryptionKeyError("DATA_ENCRYPTION_KEY is not valid base64.");
      }
      if (raw.length !== 32) throw new EncryptionKeyError("DATA_ENCRYPTION_KEY must be 32 bytes (base64).");
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    })();
    p.catch(() => keyCache.delete(base64Key));
    keyCache.set(base64Key, p);
  }
  return p;
}

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

export async function encryptField(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext)));
  return `${PREFIX}${b64(iv)}:${b64(ct)}`;
}

export async function decryptField(key: CryptoKey, value: string, aad: string): Promise<string> {
  const [ivB64, ctB64] = value.slice(PREFIX.length).split(":");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64), additionalData: enc.encode(aad) }, key, unb64(ctB64));
    return dec.decode(pt);
  } catch {
    throw new EncryptionKeyError("A saved password could not be decrypted (wrong or changed DATA_ENCRYPTION_KEY?).");
  }
}

const aadFor = (id: string, field: string) => `subscriptions/${id}/${field}`;

/** Encrypt the sensitive fields of a subscription before saving. */
export async function encryptSubscription(key: CryptoKey, id: string, data: Record<string, unknown>) {
  const out = { ...data };
  for (const f of ENCRYPTED_SUBSCRIPTION_FIELDS) {
    const v = out[f];
    if (typeof v === "string" && v !== "" && !isEncrypted(v)) out[f] = await encryptField(key, v, aadFor(id, f));
  }
  return out;
}

/** Decrypt for display. Legacy plaintext passes through. Without a key, encrypted values cannot be read. */
export async function decryptSubscription(key: CryptoKey | null, id: string, data: Record<string, unknown>) {
  const out = { ...data };
  for (const f of ENCRYPTED_SUBSCRIPTION_FIELDS) {
    const v = out[f];
    if (isEncrypted(v)) {
      if (!key) throw new EncryptionKeyError("Saved passwords are encrypted but DATA_ENCRYPTION_KEY is not set.");
      out[f] = await decryptField(key, v, aadFor(id, f));
    }
  }
  return out;
}

/**
 * One-off conversion of plaintext subscription fields to encrypted form.
 * Each value is verified to decrypt back exactly before anything is written,
 * and all rows are written in one transaction. Returns how many records changed.
 */
export async function encryptExistingSubscriptions(
  db: { tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> } & Queryable,
  key: CryptoKey,
): Promise<number> {
  const docs = await listRecords(db, "subscriptions");
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  for (const d of docs) {
    const needs = ENCRYPTED_SUBSCRIPTION_FIELDS.some((f) => typeof d.data[f] === "string" && d.data[f] !== "" && !isEncrypted(d.data[f]));
    if (!needs) continue;
    const encrypted = await encryptSubscription(key, d.id, d.data);
    const check = await decryptSubscription(key, d.id, encrypted);
    for (const f of ENCRYPTED_SUBSCRIPTION_FIELDS) {
      if (check[f] !== d.data[f]) throw new Error(`Encryption self-check failed for subscription ${d.id}; nothing was changed.`);
    }
    updates.push({ id: d.id, data: encrypted });
  }
  if (updates.length) {
    await db.tx(async (q) => {
      for (const u of updates) await putRecord(q, "subscriptions", u.id, u.data);
    });
  }
  return updates.length;
}

// --- Read/write helpers used by both servers for every API call -------------
import type { CollectionName } from "./snapshot.ts";
import { getRecord } from "./repo.ts";

/** List records, decrypting subscription secrets for the signed-in user. */
export async function readAll(db: Queryable, c: CollectionName, key: CryptoKey | null) {
  const docs = await listRecords(db, c);
  if (c !== "subscriptions") return docs.map((d) => d.data);
  return Promise.all(docs.map((d) => decryptSubscription(key, d.id, d.data)));
}

/** Read one record, decrypting subscription secrets. */
export async function readOne(db: Queryable, c: CollectionName, id: string, key: CryptoKey | null) {
  const doc = await getRecord(db, c, id);
  if (!doc || c !== "subscriptions") return doc;
  return decryptSubscription(key, id, doc);
}

/** What actually gets stored: subscription secrets encrypted when a key is configured. */
export async function toStored(c: CollectionName, id: string, data: Record<string, unknown>, key: CryptoKey | null) {
  return c === "subscriptions" && key ? encryptSubscription(key, id, data) : data;
}
