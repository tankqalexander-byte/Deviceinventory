import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  serialKey,
  serialMatches,
  validateInput,
  applyLoanForm,
  safeEqualHex,
  type LoanFormInput,
} from "../server/automation.ts";

const TODAY = "2026-11-24";

const staffA = { id: "s1", name: "Alice Tan", email: "alice@example.com", department: "Finance" };
const staffB = { id: "s2", name: "Bob Lim", email: "bob@example.com", department: "Ops" };

const mkDevice = (over: Record<string, any> = {}): Record<string, any> => ({
  id: "d1",
  name: "Laptop 1",
  serialNumber: "X313-33Q90X",
  status: "available",
  condition: "Good",
  history: [],
  ...over,
});

const mkInput = (over: Partial<LoanFormInput> = {}): LoanFormInput => ({
  action: "checkout",
  fileId: "file-1",
  fileName: "scan-001.pdf",
  deviceId: "d1",
  serialAsWritten: "X31333Q90X",
  staffId: "s1",
  date: "2026-11-20",
  ...over,
});

const mkLoan = (over: Record<string, any> = {}): Record<string, any> => ({
  id: "loan-1",
  deviceId: "d1",
  userId: "s1",
  userName: "Alice Tan",
  userEmail: "alice@example.com",
  userDepartment: "Finance",
  checkoutDate: "2026-11-10",
  expectedReturnDate: "",
  status: "active",
  notes: "Original notes",
  formFileId: "file-0",
  ...over,
});

describe("serialKey / serialMatches", () => {
  test("case, spacing and dashes are ignored", () => {
    assert.equal(serialKey("x313-33q90x"), serialKey("X31333Q90X"));
    assert.equal(serialKey(" x313 33q90x "), serialKey("X31333Q90X"));
    assert.ok(serialMatches("x313-33q90x", "X31333Q90X"));
  });

  test("look-alike characters are equivalent", () => {
    for (const [a, b] of [["O", "0"], ["Q", "0"], ["D", "0"], ["I", "1"], ["L", "1"], ["S", "5"], ["B", "8"], ["Z", "2"], ["G", "6"]]) {
      assert.ok(serialMatches(`AB${a}CD`, `AB${b}CD`), `${a} ~ ${b}`);
    }
    assert.ok(serialMatches("HK5HXB7VGWTJ", "HKSHX87VGWTJ"));
  });

  test("genuinely different serials do not match", () => {
    assert.equal(serialMatches("HK5HXB7VGWTJ", "HK5HXB7VGWTK"), false);
    assert.equal(serialMatches("ABCD1234", "ABCD1235"), false);
  });

  test("short strings (<4 significant chars) never match", () => {
    assert.equal(serialMatches("AB1", "AB1"), false);
    assert.equal(serialMatches("A-B-1", "AB1"), false);
    assert.equal(serialMatches("---", "---"), false);
    assert.ok(serialMatches("AB12", "AB12"));
  });

  test("empty / undefined never match", () => {
    assert.equal(serialMatches("", ""), false);
    assert.equal(serialMatches(undefined, undefined), false);
    assert.equal(serialMatches(undefined, "ABCD1234"), false);
    assert.equal(serialMatches("ABCD1234", undefined), false);
    assert.equal(serialMatches(null, null), false);
  });
});

describe("validateInput", () => {
  const valid = {
    action: "checkout",
    fileId: "f",
    fileName: "n.pdf",
    deviceId: "d1",
    serialAsWritten: "ABCD1234",
    staffId: "s1",
    date: "2026-11-20",
  };

  test("accepts a valid body (with and without note)", () => {
    assert.deepEqual(validateInput(valid), valid);
    assert.deepEqual(validateInput({ ...valid, action: "return", note: "Issued by Alexander" }), { ...valid, action: "return", note: "Issued by Alexander" });
  });

  test("rejects non-object / bad action", () => {
    assert.equal(typeof validateInput(null), "string");
    assert.equal(typeof validateInput(undefined), "string");
    assert.equal(typeof validateInput({ ...valid, action: "delete" }), "string");
    assert.equal(typeof validateInput({ ...valid, action: undefined }), "string");
  });

  test("rejects each missing / blank / non-string / too-long field", () => {
    for (const k of ["fileId", "fileName", "deviceId", "serialAsWritten", "staffId", "date"]) {
      assert.equal(typeof validateInput({ ...valid, [k]: undefined }), "string", `${k} missing`);
      assert.equal(typeof validateInput({ ...valid, [k]: "   " }), "string", `${k} blank`);
      assert.equal(typeof validateInput({ ...valid, [k]: 5 }), "string", `${k} number`);
    }
    assert.equal(typeof validateInput({ ...valid, fileName: "x".repeat(301) }), "string");
  });

  test("rejects bad and impossible dates", () => {
    for (const d of ["2026-02-30", "22/5/25", "2026-13-01", "2026-00-10", "2026-1-5", "2026-11-31", "not a date"]) {
      assert.equal(typeof validateInput({ ...valid, date: d }), "string", d);
    }
    assert.equal(typeof validateInput({ ...valid, date: "2028-02-29" }), "object");
    assert.equal(typeof validateInput({ ...valid, date: "2026-02-29" }), "string");
  });

  test("rejects over-long or non-string note", () => {
    assert.equal(typeof validateInput({ ...valid, note: "x".repeat(501) }), "string");
    assert.equal(typeof validateInput({ ...valid, note: 5 }), "string");
    assert.equal(typeof validateInput({ ...valid, note: "x".repeat(500) }), "object");
  });
});

describe("applyLoanForm: checkout", () => {
  test("applies to an available device with matching serial", () => {
    const old = { id: "loan-old", status: "returned", formFileId: "older" };
    const device = mkDevice({ history: [old] });
    const snapshot = structuredClone(device);
    const input = mkInput({ note: "Issued by Alexander" });
    const r = applyLoanForm(device, staffA, input, TODAY);

    assert.equal(r.status, 200);
    assert.equal(r.result, "applied");
    assert.ok("device" in r && r.device);
    const d = (r as any).device;
    assert.equal(d.status, "loaned");
    const cl = d.currentLoan;
    assert.equal(cl.userId, staffA.id);
    assert.equal(cl.userName, staffA.name);
    assert.equal(cl.userEmail, staffA.email);
    assert.equal(cl.userDepartment, staffA.department);
    assert.equal(cl.deviceId, "d1");
    assert.equal(cl.checkoutDate, input.date);
    assert.equal(cl.expectedReturnDate, "");
    assert.equal(cl.status, "active");
    assert.ok(cl.notes.includes(input.fileName));
    assert.ok(cl.notes.includes("Issued by Alexander"));
    assert.equal(cl.formFileId, input.fileId);
    assert.deepEqual(d.history[0], cl);
    assert.deepEqual(d.history.slice(1), [old]);
    assert.equal(d.history.length, 2);
    assert.deepEqual(device, snapshot, "input device must not be mutated");
  });

  test("serial mismatch -> 422 rejected, no device", () => {
    const r = applyLoanForm(mkDevice(), staffA, mkInput({ serialAsWritten: "X31333Q90Y" }), TODAY);
    assert.equal(r.status, 422);
    assert.equal(r.result, "rejected");
    assert.ok(!("device" in r));
  });

  test("too-short serial on form never authorises a write", () => {
    const r = applyLoanForm(mkDevice({ serialNumber: "AB1" }), staffA, mkInput({ serialAsWritten: "AB1" }), TODAY);
    assert.equal(r.status, 422);
    assert.ok(!("device" in r));
  });

  test("null device -> 404; null staff -> 404; future date -> 422", () => {
    const a = applyLoanForm(null, staffA, mkInput(), TODAY);
    assert.equal(a.status, 404);
    assert.ok(!("device" in a));
    const b = applyLoanForm(mkDevice(), null, mkInput(), TODAY);
    assert.equal(b.status, 404);
    assert.ok(!("device" in b));
    const c = applyLoanForm(mkDevice(), staffA, mkInput({ date: "2026-11-25" }), TODAY);
    assert.equal(c.status, 422);
    assert.equal(c.result, "rejected");
    assert.ok(!("device" in c));
    // today itself is allowed
    assert.equal(applyLoanForm(mkDevice(), staffA, mkInput({ date: TODAY }), TODAY).result, "applied");
  });

  test("device loaned to someone else -> 409 conflict, no device", () => {
    const device = mkDevice({ status: "loaned", currentLoan: mkLoan({ userId: "s2", userName: "Bob Lim" }) });
    const r = applyLoanForm(device, staffA, mkInput(), TODAY);
    assert.equal(r.status, 409);
    assert.equal(r.result, "conflict");
    assert.ok(!("device" in r));
  });

  test("maintenance / retired -> 409 conflict, no device", () => {
    for (const status of ["maintenance", "retired"]) {
      const r = applyLoanForm(mkDevice({ status }), staffA, mkInput(), TODAY);
      assert.equal(r.status, 409, status);
      assert.equal(r.result, "conflict", status);
      assert.ok(!("device" in r), status);
    }
  });

  test("status 'available' but stale currentLoan present -> 409", () => {
    const device = mkDevice({ currentLoan: mkLoan({ userId: "s2" }) });
    const r = applyLoanForm(device, staffA, mkInput(), TODAY);
    assert.equal(r.status, 409);
    assert.ok(!("device" in r));
  });

  test("same form sent twice -> already_recorded (history formFileId)", () => {
    const first = applyLoanForm(mkDevice(), staffA, mkInput(), TODAY) as any;
    assert.equal(first.result, "applied");
    // simulate the device being returned afterwards, history retains the form id
    const second = applyLoanForm({ ...first.device, status: "available", currentLoan: undefined }, staffA, mkInput(), TODAY);
    assert.equal(second.status, 200);
    assert.equal(second.result, "already_recorded");
    assert.ok(!("device" in second));
  });

  test("already_recorded when history has the form id, device currently loaned", () => {
    const loan = mkLoan({ formFileId: "file-1" });
    const device = mkDevice({ status: "loaned", currentLoan: loan, history: [loan] });
    const r = applyLoanForm(device, staffA, mkInput(), TODAY);
    assert.equal(r.status, 200);
    assert.equal(r.result, "already_recorded");
    assert.ok(!("device" in r));
  });

  test("already_recorded when currentLoan is same staff and same checkoutDate", () => {
    const device = mkDevice({ status: "loaned", currentLoan: mkLoan({ checkoutDate: "2026-11-20", formFileId: "other" }) });
    const r = applyLoanForm(device, staffA, mkInput({ date: "2026-11-20" }), TODAY);
    assert.equal(r.status, 200);
    assert.equal(r.result, "already_recorded");
    assert.ok(!("device" in r));
  });

  test("same staff but different checkout date while loaned -> conflict, not duplicate", () => {
    const device = mkDevice({ status: "loaned", currentLoan: mkLoan({ checkoutDate: "2026-11-10" }) });
    const r = applyLoanForm(device, staffA, mkInput({ date: "2026-11-20" }), TODAY);
    assert.equal(r.status, 409);
    assert.ok(!("device" in r));
  });
});

describe("applyLoanForm: return", () => {
  const loaned = (over: Record<string, any> = {}) => {
    const loan = mkLoan();
    const other = { id: "loan-prev", userId: "s2", status: "returned", returnedDate: "2026-10-01", notes: "prev" };
    return mkDevice({ status: "loaned", condition: "Fair", currentLoan: loan, history: [loan, other], ...over });
  };
  const ret = (over: Partial<LoanFormInput> = {}) =>
    mkInput({ action: "return", fileId: "file-ret", fileName: "return-scan.pdf", date: "2026-11-20", ...over });

  test("applies a return by the same staff", () => {
    const device = loaned();
    const snapshot = structuredClone(device);
    const r = applyLoanForm(device, staffA, ret(), TODAY) as any;
    assert.equal(r.status, 200);
    assert.equal(r.result, "applied");
    const d = r.device;
    assert.equal(d.status, "available");
    assert.equal("currentLoan" in d, false);
    assert.equal(d.history.length, 2);
    const closed = d.history[0];
    assert.equal(closed.id, "loan-1");
    assert.equal(closed.returnedDate, "2026-11-20");
    assert.equal(closed.status, "returned");
    assert.equal(closed.conditionOnReturn, "Fair");
    assert.equal(closed.returnFormFileId, "file-ret");
    assert.ok(closed.notes.includes("Original notes"));
    assert.ok(closed.notes.includes("return-scan.pdf"));
    assert.equal(closed.formFileId, "file-0");
    assert.deepEqual(d.history[1], device.history[1]);
    assert.deepEqual(device, snapshot, "input device must not be mutated");
  });

  test("return on the checkout date itself is allowed", () => {
    const r = applyLoanForm(loaned(), staffA, ret({ date: "2026-11-10" }), TODAY);
    assert.equal(r.result, "applied");
  });

  test("loaned to a different staff -> 409, no device", () => {
    const r = applyLoanForm(loaned(), staffB, ret({ staffId: "s2" }), TODAY);
    assert.equal(r.status, 409);
    assert.equal(r.result, "conflict");
    assert.ok(!("device" in r));
  });

  test("return date before checkout -> 422", () => {
    const r = applyLoanForm(loaned(), staffA, ret({ date: "2026-11-09" }), TODAY);
    assert.equal(r.status, 422);
    assert.equal(r.result, "rejected");
    assert.ok(!("device" in r));
  });

  test("future return date -> 422", () => {
    const r = applyLoanForm(loaned(), staffA, ret({ date: "2026-12-01" }), TODAY);
    assert.equal(r.status, 422);
    assert.ok(!("device" in r));
  });

  test("serial mismatch on return -> 422, no device", () => {
    const r = applyLoanForm(loaned(), staffA, ret({ serialAsWritten: "WRONG12345" }), TODAY);
    assert.equal(r.status, 422);
    assert.ok(!("device" in r));
  });

  test("no active loan, history shows staff returned that date -> already_recorded", () => {
    const device = mkDevice({
      history: [mkLoan({ status: "returned", returnedDate: "2026-11-20", returnFormFileId: "something-else" })],
    });
    const r = applyLoanForm(device, staffA, ret(), TODAY);
    assert.equal(r.status, 200);
    assert.equal(r.result, "already_recorded");
    assert.ok(!("device" in r));
  });

  test("no active loan, returnFormFileId matches -> already_recorded", () => {
    const device = mkDevice({
      history: [mkLoan({ status: "returned", returnedDate: "2026-11-18", returnFormFileId: "file-ret" })],
    });
    const r = applyLoanForm(device, staffA, ret(), TODAY);
    assert.equal(r.status, 200);
    assert.equal(r.result, "already_recorded");
    assert.ok(!("device" in r));
  });

  test("no active loan and no matching history -> 409", () => {
    const device = mkDevice({
      history: [mkLoan({ status: "returned", returnedDate: "2026-11-15", returnFormFileId: "x" })],
    });
    const r = applyLoanForm(device, staffA, ret(), TODAY);
    assert.equal(r.status, 409);
    assert.equal(r.result, "conflict");
    assert.ok(!("device" in r));
    assert.equal(applyLoanForm(mkDevice(), staffA, ret(), TODAY).status, 409);
  });

  test("another staff's return on the same date does not count as already_recorded", () => {
    const device = mkDevice({
      history: [mkLoan({ userId: "s2", status: "returned", returnedDate: "2026-11-20" })],
    });
    const r = applyLoanForm(device, staffA, ret(), TODAY);
    assert.equal(r.status, 409);
    assert.ok(!("device" in r));
  });
});

describe("safeEqualHex", () => {
  test("equal strings -> true", () => {
    assert.equal(safeEqualHex("deadbeef", "deadbeef"), true);
    assert.equal(safeEqualHex("", ""), true);
  });
  test("different or different-length strings -> false", () => {
    assert.equal(safeEqualHex("deadbeef", "deadbeee"), false);
    assert.equal(safeEqualHex("deadbeef", "deadbee"), false);
    assert.equal(safeEqualHex("dead", "deadbeef"), false);
  });
});

import { otherSerialMatches } from "../server/automation.ts";
test("otherSerialMatches finds look-alike twins but not the device itself", () => {
  const devices = [
    { id: "a", name: "iPad A", serialNumber: "AB0C12" },
    { id: "b", name: "iPad B", serialNumber: "ABOC12" }, // O vs 0 twin
    { id: "c", name: "iPad C", serialNumber: "XY9999" },
  ];
  assert.deepEqual(otherSerialMatches(devices, "a", "ab0c12").map((d) => d.id), ["b"]);
  assert.deepEqual(otherSerialMatches(devices, "c", "XY9999"), []);
});
