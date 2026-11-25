/**
 * Write validation — a port of firestore.rules, so the API accepts and rejects
 * exactly what Firestore did. Returns an error message, or null if valid.
 *
 * (The migration import deliberately skips this: legacy data is copied as-is.)
 */
import type { CollectionName } from "./snapshot.ts";

type Json = Record<string, any>;

const isStr = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isMap = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: Json, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const ID_RE = /^[a-zA-Z0-9_\-]+$/;

export function isValidId(id: string) {
  return typeof id === "string" && id.length <= 128 && ID_RE.test(id);
}

function requireKeys(d: Json, keys: string[]) {
  const missing = keys.filter((k) => !has(d, k));
  return missing.length ? `missing required field(s): ${missing.join(", ")}` : null;
}

function checks(list: [boolean, string][]) {
  for (const [ok, msg] of list) if (!ok) return msg;
  return null;
}

const validators: Record<CollectionName, (d: Json) => string | null> = {
  devices: (d) =>
    requireKeys(d, ["id", "name", "model", "serialNumber", "category", "status", "condition", "purchaseDate", "location", "image", "history"]) ??
    checks([
      [Object.keys(d).length <= 15, "too many fields"],
      [isStr(d.id, 100), "id must be a string ≤ 100 chars"],
      [isStr(d.name, 100), "name must be a string ≤ 100 chars"],
      [isStr(d.model, 100), "model must be a string ≤ 100 chars"],
      [isStr(d.serialNumber, 100), "serialNumber must be a string ≤ 100 chars"],
      [isStr(d.category, 100), "category must be a string ≤ 100 chars"],
      [["available", "loaned", "maintenance", "retired"].includes(d.status), "invalid status"],
      [["Excellent", "Good", "Fair", "Needs Service"].includes(d.condition), "invalid condition"],
      [isStr(d.purchaseDate, 20), "purchaseDate must be a string ≤ 20 chars"],
      [isStr(d.location, 100), "location must be a string ≤ 100 chars"],
      [isStr(d.image, 100), "image must be a string ≤ 100 chars"],
      [Array.isArray(d.history), "history must be a list"],
      [!has(d, "notes") || isStr(d.notes, 2000), "notes must be a string ≤ 2000 chars"],
      [!has(d, "currentLoan") || isMap(d.currentLoan), "currentLoan must be an object"],
    ]),

  staffMembers: (d) =>
    requireKeys(d, ["id", "name", "email", "department", "avatarUrl"]) ??
    checks([
      [Object.keys(d).every((k) => ["id", "name", "email", "department", "avatarUrl", "employmentStatus"].includes(k)), "unexpected field"],
      [isStr(d.id, 100), "id must be a string ≤ 100 chars"],
      [isStr(d.name, 100), "name must be a string ≤ 100 chars"],
      [isStr(d.email, 100), "email must be a string ≤ 100 chars"],
      [isStr(d.department, 100), "department must be a string ≤ 100 chars"],
      [isStr(d.avatarUrl, 2000), "avatarUrl must be a string ≤ 2000 chars"],
      [
        !has(d, "employmentStatus") || ["Full-Time", "Part-Time", "Contractor", "Intern", "On Leave", "Offboarded"].includes(d.employmentStatus),
        "invalid employmentStatus",
      ],
    ]),

  categories: (d) =>
    requireKeys(d, ["id", "name"]) ??
    checks([
      [Object.keys(d).length === 2, "unexpected field"],
      [isStr(d.id, 100), "id must be a string ≤ 100 chars"],
      [isStr(d.name, 100), "name must be a string ≤ 100 chars"],
    ]),

  departments: (d) =>
    requireKeys(d, ["id", "name"]) ??
    checks([
      [Object.keys(d).length === 2, "unexpected field"],
      [isStr(d.id, 100), "id must be a string ≤ 100 chars"],
      [isStr(d.name, 100), "name must be a string ≤ 100 chars"],
    ]),

  subscriptions: (d) =>
    requireKeys(d, ["id", "name", "url", "username", "password", "renewalDate"]) ??
    checks([
      [Object.keys(d).length <= 12, "too many fields"],
      [isStr(d.id, 100), "id must be a string ≤ 100 chars"],
      [isStr(d.name, 150), "name must be a string ≤ 150 chars"],
      [isStr(d.url, 500), "url must be a string ≤ 500 chars"],
      [isStr(d.username, 200), "username must be a string ≤ 200 chars"],
      [isStr(d.password, 200), "password must be a string ≤ 200 chars"],
      [isStr(d.renewalDate, 20), "renewalDate must be a string ≤ 20 chars"],
      [!has(d, "remarks") || isStr(d.remarks, 1000), "remarks must be a string ≤ 1000 chars"],
      [!has(d, "category") || isStr(d.category, 100), "category must be a string ≤ 100 chars"],
      [!has(d, "cost") || (typeof d.cost === "number" && Number.isFinite(d.cost)), "cost must be a number"],
      [!has(d, "billingCycle") || isStr(d.billingCycle, 50), "billingCycle must be a string ≤ 50 chars"],
      [!has(d, "contactPerson") || isStr(d.contactPerson, 150), "contactPerson must be a string ≤ 150 chars"],
      [!has(d, "status") || isStr(d.status, 50), "status must be a string ≤ 50 chars"],
    ]),
};

/** Validate a create/replace. `existing` is the stored record for updates. */
export function validateWrite(name: CollectionName, id: string, data: unknown, existing: Json | null): string | null {
  if (!isValidId(id)) return "invalid document id";
  if (!isMap(data)) return "body must be a JSON object";
  const d = data as Json;
  const err = validators[name](d);
  if (err) return err;
  if (!existing) return d.id === id ? null : "id field must match the URL id";
  // Update rules: id is immutable; device purchaseDate is immutable.
  if (d.id !== existing.id) return "id cannot be changed";
  // A purchase date can be filled in once if it was never recorded (e.g. a device added from a loan form).
  if (name === "devices" && d.purchaseDate !== existing.purchaseDate && (existing.purchaseDate ?? "") !== "") return "purchaseDate cannot be changed";
  return null;
}
