/**
 * Maps app records (the same JSON shapes the app used to store in Firestore)
 * to and from SQL rows.
 *
 * The mapping is lossless by construction: decode(encode(doc)) deep-equals doc
 * for any JSON document. Known fields with the expected type go into typed
 * columns; anything else (unknown keys, wrong types, explicit nulls) is kept
 * verbatim in the row's `extra` column.
 */
import type { Queryable } from "./db.ts";
import { COLLECTIONS, type CollectionName, type SnapshotDoc } from "./snapshot.ts";

type Json = Record<string, unknown>;

interface Field {
  key: string; // property name in the app record
  col: string; // SQL column
  kind: "text" | "number";
  enum?: readonly string[];
}

const DEVICE_STATUS = ["available", "loaned", "maintenance", "retired"] as const;
const CONDITION = ["Excellent", "Good", "Fair", "Needs Service"] as const;
const EMPLOYMENT = ["Full-Time", "Part-Time", "Contractor", "Intern", "On Leave", "Offboarded"] as const;
const LOAN_STATUS = ["active", "returned", "overdue"] as const;

const t = (key: string, col = key, en?: readonly string[]): Field => ({ key, col, kind: "text", enum: en });

const ENTITIES = {
  categories: { table: "categories", fields: [t("name")] },
  departments: { table: "departments", fields: [t("name")] },
  staffMembers: {
    table: "staff_members",
    fields: [t("name"), t("email"), t("department"), t("employmentStatus", "employment_status", EMPLOYMENT), t("avatarUrl", "avatar_url")],
  },
  devices: {
    table: "devices",
    fields: [
      t("name"), t("model"), t("serialNumber", "serial_number"), t("category"),
      t("status", "status", DEVICE_STATUS), t("condition", "condition", CONDITION),
      t("purchaseDate", "purchase_date"), t("location"), t("image"), t("notes"),
    ],
  },
  subscriptions: {
    table: "subscriptions",
    fields: [
      t("name"), t("url"), t("username"), t("password"), t("renewalDate", "renewal_date"),
      t("remarks"), t("category"), { key: "cost", col: "cost", kind: "number" },
      t("billingCycle", "billing_cycle"), t("contactPerson", "contact_person"), t("status"),
    ],
  },
} satisfies Record<CollectionName, { table: string; fields: Field[] }>;

const LOAN_FIELDS: Field[] = [
  t("id"), t("deviceId", "loan_device_id"), t("userId", "user_id"), t("userName", "user_name"),
  t("userEmail", "user_email"), t("userDepartment", "user_department"), t("checkoutDate", "checkout_date"),
  t("expectedReturnDate", "expected_return_date"), t("returnedDate", "returned_date"), t("notes"),
  t("status", "status", LOAN_STATUS), t("conditionOnReturn", "condition_on_return", CONDITION),
];

/** Overflow for values that don't fit a typed column. */
interface Extra {
  fields?: Json; // verbatim values
  absent?: string[]; // keys the decoder would otherwise add (id, history)
}

const fits = (f: Field, v: unknown) =>
  f.kind === "number"
    ? typeof v === "number" && Number.isFinite(v)
    : typeof v === "string" && (!f.enum || f.enum.includes(v));

const isPlainObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function encodeFields(fields: Field[], data: Json, handled: Set<string>, extra: Extra) {
  const cols: Record<string, unknown> = {};
  for (const f of fields) {
    handled.add(f.key);
    cols[f.col] = null;
    if (!Object.prototype.hasOwnProperty.call(data, f.key)) continue;
    const v = data[f.key];
    if (fits(f, v)) cols[f.col] = v;
    else (extra.fields ??= {})[f.key] = v;
  }
  for (const k of Object.keys(data)) if (!handled.has(k)) (extra.fields ??= {})[k] = data[k];
  return cols;
}

function decodeFields(fields: Field[], row: Json, out: Json) {
  for (const f of fields) if (row[f.col] !== null && row[f.col] !== undefined) out[f.key] = row[f.col];
}

function applyExtra(out: Json, extra: Extra | null | undefined) {
  if (!extra) return out;
  for (const k of extra.absent ?? []) delete out[k];
  Object.assign(out, extra.fields ?? {});
  return out;
}

const extraJson = (e: Extra) => JSON.stringify(e.fields || e.absent ? e : {});

/** Encode a record; `id` is the primary key (the Firestore document ID). */
function encode(name: CollectionName, id: string, data: Json) {
  const extra: Extra = {};
  const handled = new Set<string>(["id"]);
  if (!Object.prototype.hasOwnProperty.call(data, "id")) (extra.absent ??= []).push("id");
  else if (data.id !== id) (extra.fields ??= {}).id = data.id;
  if (name === "devices") handled.add("history").add("currentLoan");
  const cols = encodeFields(ENTITIES[name].fields, data, handled, extra);

  const loans: { slot: "history" | "current"; position: number; cols: Record<string, unknown>; extra: string }[] = [];
  if (name === "devices") {
    const encodeLoan = (slot: "history" | "current", position: number, rec: Json) => {
      const e: Extra = {};
      loans.push({ slot, position, cols: encodeFields(LOAN_FIELDS, rec, new Set(), e), extra: extraJson(e) });
    };
    const h = data.history;
    if (!Object.prototype.hasOwnProperty.call(data, "history")) (extra.absent ??= []).push("history");
    else if (Array.isArray(h) && h.every(isPlainObject)) h.forEach((rec, i) => encodeLoan("history", i, rec));
    else (extra.fields ??= {}).history = h;

    if (Object.prototype.hasOwnProperty.call(data, "currentLoan")) {
      if (isPlainObject(data.currentLoan)) encodeLoan("current", 0, data.currentLoan);
      else (extra.fields ??= {}).currentLoan = data.currentLoan;
    }
  }
  return { cols, extra: extraJson(extra), loans };
}

// ---------------------------------------------------------------- queries --

export async function listRecords(q: Queryable, name: CollectionName, onlyId?: string): Promise<SnapshotDoc[]> {
  const { table, fields } = ENTITIES[name];
  const where = onlyId === undefined ? "" : "WHERE id = $1";
  const params = onlyId === undefined ? [] : [onlyId];
  const { rows } = await q.query<Json>(`SELECT * FROM ${table} ${where} ORDER BY id`, params);
  const loansByDevice = new Map<string, Json[]>();
  if (name === "devices" && rows.length) {
    const { rows: loanRows } = await q.query<Json>(
      `SELECT * FROM loan_records ${onlyId === undefined ? "" : "WHERE device_id = $1"} ORDER BY device_id, slot, position`,
      params,
    );
    for (const r of loanRows) {
      const k = r.device_id as string;
      if (!loansByDevice.has(k)) loansByDevice.set(k, []);
      loansByDevice.get(k)!.push(r);
    }
  }
  return rows.map((row) => {
    const id = row.id as string;
    const out: Json = { id };
    decodeFields(fields, row, out);
    if (name === "devices") {
      const loans = loansByDevice.get(id) ?? [];
      const decodeLoan = (r: Json) => {
        const o: Json = {};
        decodeFields(LOAN_FIELDS, r, o);
        return applyExtra(o, r.extra as Extra);
      };
      out.history = loans.filter((r) => r.slot === "history").map(decodeLoan);
      const cur = loans.find((r) => r.slot === "current");
      if (cur) out.currentLoan = decodeLoan(cur);
    }
    return { id, data: applyExtra(out, row.extra as Extra) };
  });
}

export async function getRecord(q: Queryable, name: CollectionName, id: string): Promise<Json | null> {
  const [doc] = await listRecords(q, name, id);
  return doc?.data ?? null;
}

/** Insert or fully replace one record (same semantics as Firestore setDoc). */
export async function putRecord(q: Queryable, name: CollectionName, id: string, data: Json) {
  const { table } = ENTITIES[name];
  const { cols, extra, loans } = encode(name, id, data);
  const names = ["id", ...Object.keys(cols), "extra"];
  const values = [id, ...Object.values(cols), extra];
  const ph = names.map((n, i) => (n === "extra" ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const updates = names.filter((n) => n !== "id").map((n) => `${n} = EXCLUDED.${n}`);
  await q.query(
    `INSERT INTO ${table} (${names.join(", ")}) VALUES (${ph.join(", ")})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`,
    values,
  );
  if (name === "devices") {
    await q.query(`DELETE FROM loan_records WHERE device_id = $1`, [id]);
    for (const l of loans) {
      const ln = ["device_id", "slot", "position", ...Object.keys(l.cols), "extra"];
      const lv = [id, l.slot, l.position, ...Object.values(l.cols), l.extra];
      const lph = ln.map((n, i) => (n === "extra" ? `$${i + 1}::jsonb` : `$${i + 1}`));
      await q.query(`INSERT INTO loan_records (${ln.join(", ")}) VALUES (${lph.join(", ")})`, lv);
    }
  }
}

export async function deleteRecord(q: Queryable, name: CollectionName, id: string) {
  await q.query(`DELETE FROM ${ENTITIES[name].table} WHERE id = $1`, [id]);
}

export async function countRecords(q: Queryable): Promise<Record<CollectionName, number> & { loan_records: number }> {
  const out: any = {};
  for (const c of COLLECTIONS) {
    const { rows } = await q.query(`SELECT count(*)::int AS n FROM ${ENTITIES[c].table}`);
    out[c] = Number(rows[0].n);
  }
  const { rows } = await q.query(`SELECT count(*)::int AS n FROM loan_records`);
  out.loan_records = Number(rows[0].n);
  return out;
}

export async function truncateAll(q: Queryable) {
  await q.query(`TRUNCATE loan_records, devices, staff_members, categories, departments, subscriptions`);
}

export const TABLES = Object.fromEntries(COLLECTIONS.map((c) => [c, ENTITIES[c].table])) as Record<CollectionName, string>;
