/**
 * Loan-form automation: records checkouts and returns read from scanned
 * "Digital Asset Issuance" forms (Google Drive → scheduled task → this API).
 *
 * Safety rules enforced here, whatever the caller sends:
 * - The serial number as written on the form must match the device's serial,
 *   allowing only for look-alike characters (0/O/Q/D, 1/I/L, 5/S, 8/B, 2/Z, 6/G).
 * - Only checkouts and returns; nothing is deleted or otherwise edited.
 * - A device on loan to someone else, in maintenance or retired is never
 *   touched (conflict → the form goes to "Needs review").
 * - Re-sending the same form is harmless (already_recorded).
 *
 * Pure functions; both backends (Worker, Node) call these.
 */
type Json = Record<string, any>;

const CONFUSABLE: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };

export function serialKey(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OQDILSBZG]/g, (c) => CONFUSABLE[c]);
}

export function serialMatches(asWritten: unknown, actual: unknown): boolean {
  const a = serialKey(asWritten);
  return a.length >= 4 && a === serialKey(actual);
}

const isIsoDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** What the scheduled task needs to match forms: no subscriptions, no passwords. */
export function buildContext(devices: Json[], staff: Json[]) {
  return {
    devices: devices.map((d) => ({
      id: d.id, name: d.name, model: d.model, serialNumber: d.serialNumber, category: d.category, status: d.status,
      currentLoan: d.currentLoan ? { userId: d.currentLoan.userId, userName: d.currentLoan.userName, checkoutDate: d.currentLoan.checkoutDate } : null,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, email: s.email, department: s.department, employmentStatus: s.employmentStatus })),
  };
}

export interface LoanFormInput {
  action: "checkout" | "return";
  fileId: string; // Google Drive file id (for idempotency)
  fileName: string;
  deviceId: string;
  serialAsWritten: string;
  staffId: string;
  date: string; // YYYY-MM-DD: date of issue (checkout) or date of return
  note?: string; // e.g. "Issued by Alexander"
}

export type LoanFormResult =
  | { status: 200; result: "applied" | "already_recorded"; message: string; device?: Json }
  | { status: 400 | 404 | 409 | 422; result: "rejected" | "conflict"; message: string };

export function validateInput(body: unknown): LoanFormInput | string {
  const b = (body ?? {}) as Json;
  if (b.action !== "checkout" && b.action !== "return") return 'action must be "checkout" or "return"';
  for (const k of ["fileId", "fileName", "deviceId", "serialAsWritten", "staffId", "date"]) {
    if (typeof b[k] !== "string" || !b[k].trim() || b[k].length > 300) return `${k} is required`;
  }
  if (!isIsoDate(b.date)) return "date must be YYYY-MM-DD";
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 500)) return "note must be a string ≤ 500 chars";
  return b as LoanFormInput;
}

/** Decide what a form means for a device. Returns the updated device when something should be written. */
export function applyLoanForm(device: Json | null, staff: Json | null, input: LoanFormInput, today: string): LoanFormResult {
  if (!device) return { status: 404, result: "rejected", message: `No device with id ${input.deviceId}.` };
  if (!serialMatches(input.serialAsWritten, device.serialNumber)) {
    return { status: 422, result: "rejected", message: `Serial on form "${input.serialAsWritten}" does not match ${device.name} (${device.serialNumber}).` };
  }
  if (!staff) return { status: 404, result: "rejected", message: `No staff member with id ${input.staffId}.` };
  if (input.date > today) return { status: 422, result: "rejected", message: `Date ${input.date} is in the future.` };

  const history: Json[] = Array.isArray(device.history) ? device.history : [];
  const source = `Loan form: ${input.fileName}${input.note ? ` (${input.note})` : ""}`;

  if (input.action === "checkout") {
    const already = history.some((l) => l.formFileId === input.fileId) ||
      (device.currentLoan && device.currentLoan.userId === staff.id && device.currentLoan.checkoutDate === input.date);
    if (already) return { status: 200, result: "already_recorded", message: `${device.name} is already recorded as issued to ${staff.name} on ${input.date}.` };
    if (device.status !== "available" || device.currentLoan) {
      const who = device.currentLoan ? ` to ${device.currentLoan.userName} since ${device.currentLoan.checkoutDate}` : "";
      return { status: 409, result: "conflict", message: `${device.name} is ${device.status}${who}; not changed.` };
    }
    const loan: Json = {
      id: `loan-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      deviceId: device.id,
      userId: staff.id,
      userName: staff.name,
      userEmail: staff.email,
      userDepartment: staff.department,
      checkoutDate: input.date,
      expectedReturnDate: "",
      status: "active",
      notes: source,
      formFileId: input.fileId,
    };
    const updated = { ...device, status: "loaned", currentLoan: loan, history: [loan, ...history] };
    return { status: 200, result: "applied", message: `Recorded ${device.name} issued to ${staff.name} on ${input.date}.`, device: updated };
  }

  // return
  const cur = device.currentLoan;
  if (!cur) {
    const done = history.some((l) => l.returnFormFileId === input.fileId || (l.userId === staff.id && l.returnedDate === input.date));
    if (done) return { status: 200, result: "already_recorded", message: `${device.name} is already recorded as returned by ${staff.name} on ${input.date}.` };
    return { status: 409, result: "conflict", message: `${device.name} has no active loan to return; not changed.` };
  }
  if (cur.userId !== staff.id) {
    return { status: 409, result: "conflict", message: `${device.name} is on loan to ${cur.userName}, not ${staff.name}; not changed.` };
  }
  if (cur.checkoutDate && input.date < cur.checkoutDate) {
    return { status: 422, result: "rejected", message: `Return date ${input.date} is before the checkout date ${cur.checkoutDate}.` };
  }
  const closed = {
    ...cur,
    returnedDate: input.date,
    conditionOnReturn: device.condition,
    status: "returned",
    notes: cur.notes ? `${cur.notes} | Return ${source.charAt(0).toLowerCase()}${source.slice(1)}` : `Return ${source.charAt(0).toLowerCase()}${source.slice(1)}`,
    returnFormFileId: input.fileId,
  };
  const { currentLoan: _drop, ...rest } = device;
  const updated = { ...rest, status: "available", history: history.map((l) => (l.id === cur.id ? closed : l)) };
  return { status: 200, result: "applied", message: `Recorded ${device.name} returned by ${staff.name} on ${input.date}.`, device: updated };
}

/** Other devices whose serial would also match what was written (look-alike collision). */
export function otherSerialMatches(devices: Json[], deviceId: string, asWritten: string): Json[] {
  return devices.filter((d) => d.id !== deviceId && serialMatches(asWritten, d.serialNumber));
}

/** Constant-time comparison of two hex strings. */
export function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
