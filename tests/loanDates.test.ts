import test from "node:test";
import assert from "node:assert/strict";
import { applyLoanDateChanges, validateLoanDates } from "../src/loanDates.ts";
import type { Device, LoanRecord } from "../src/types.ts";

const loan = (id: string, over: Partial<LoanRecord> = {}): LoanRecord => ({
  id, deviceId: "d1", userId: "u1", userName: "A", userEmail: "a@x.com", userDepartment: "Ops",
  checkoutDate: "2026-01-01", expectedReturnDate: "2026-01-10", status: "returned", ...over,
});
const active = loan("L2", { status: "active", expectedReturnDate: "" });
const past = loan("L1", { returnedDate: "2026-01-09" });
const mk = (id: string): Device => ({
  id, name: "n", model: "m", serialNumber: "s", category: "c", status: "loaned", condition: "Good",
  purchaseDate: "2025-01-01", location: "l", image: "", currentLoan: active, history: [active, past],
});

test("editing the active loan updates currentLoan and its history copy identically", () => {
  const d = mk("d1");
  const out = applyLoanDateChanges(d, "L2", { checkoutDate: "2026-02-02", expectedReturnDate: "2026-03-03" });
  assert.equal(out.currentLoan?.checkoutDate, "2026-02-02");
  assert.deepEqual(out.history[0], out.currentLoan);
  assert.equal(out.currentLoan?.status, "active");
  assert.deepEqual(out.history[1], past);
  assert.equal(d.currentLoan?.checkoutDate, "2026-01-01"); // immutable
});

test("clearing due date sets empty string", () => {
  const d = { ...mk("d1"), currentLoan: { ...active, expectedReturnDate: "2026-05-05" } };
  d.history = [d.currentLoan, past];
  const out = applyLoanDateChanges(d, "L2", { expectedReturnDate: "" });
  assert.equal(out.currentLoan?.expectedReturnDate, "");
  assert.equal(out.history[0].expectedReturnDate, "");
});

test("editing a past loan leaves currentLoan untouched", () => {
  const d = mk("d1");
  const out = applyLoanDateChanges(d, "L1", { checkoutDate: "2026-01-02", returnedDate: "2026-01-08" });
  assert.equal(out.currentLoan, d.currentLoan);
  assert.equal(out.history[1].checkoutDate, "2026-01-02");
  assert.equal(out.history[1].returnedDate, "2026-01-08");
  assert.deepEqual(out.history[0], active);
});

test("other devices are unchanged by a per-device edit", () => {
  const a = mk("d1"), b = mk("d2");
  const out = [a, b].map((x) => (x.id === "d1" ? applyLoanDateChanges(x, "L2", { checkoutDate: "2026-02-02" }) : x));
  assert.equal(out[1], b);
});

test("validation rules", () => {
  const t = "2026-06-01";
  assert.equal(validateLoanDates({ checkout: "", due: "" }, "active", t), "Checkout date is required.");
  assert.ok(validateLoanDates({ checkout: "2026-06-02" }, "active", t));
  assert.ok(validateLoanDates({ checkout: "2026-02-30" }, "active", t));
  assert.equal(validateLoanDates({ checkout: "2026-05-01", due: "" }, "active", t), null);
  assert.ok(validateLoanDates({ checkout: "2026-05-01", due: "2026-04-30" }, "active", t));
  assert.equal(validateLoanDates({ checkout: "2026-05-01", due: "2026-05-01" }, "active", t), null);
  assert.ok(validateLoanDates({ checkout: "2026-05-01", returned: "" }, "past", t));
  assert.ok(validateLoanDates({ checkout: "2026-05-01", returned: "2026-04-01" }, "past", t));
  assert.ok(validateLoanDates({ checkout: "2026-05-01", returned: "2026-06-02" }, "past", t));
  assert.equal(validateLoanDates({ checkout: "2026-05-01", returned: "2026-06-01" }, "past", t), null);
});
