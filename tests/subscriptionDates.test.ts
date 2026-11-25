import { test } from "node:test";
import assert from "node:assert/strict";
import { addCycle, addMonths, effectiveRenewalDate } from "../src/subscriptionDates.ts";

test("addCycle clamps month-end dates", () => {
  assert.equal(addCycle("2026-01-31", "Monthly"), "2026-02-28");
  assert.equal(addCycle("2024-01-31", "Monthly"), "2024-02-29");
  assert.equal(addCycle("2024-02-29", "Annual"), "2025-02-28");
  assert.equal(addCycle("2024-02-29", "Biennially"), "2026-02-28");
});

test("addCycle cycle lengths", () => {
  assert.equal(addCycle("2026-01-15", "Monthly"), "2026-02-15");
  assert.equal(addCycle("2026-01-15", "Quarterly"), "2026-04-15");
  assert.equal(addCycle("2026-01-15", "Annual"), "2027-01-15");
  assert.equal(addCycle("2026-01-15", "Biennially"), "2028-01-15");
  assert.equal(addCycle("2026-11-30", "Quarterly"), "2027-02-28");
  assert.equal(addCycle("2026-12-15", "Monthly"), "2027-01-15");
});

test("addCycle One-time is unchanged", () => {
  assert.equal(addCycle("2026-01-31", "One-time"), "2026-01-31");
});

test("addMonths keeps day-of-month from original", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonths("2026-01-31", 3), "2026-04-30");
});

const base = { renewalDate: "2025-01-10", billingCycle: "Monthly" as const, autoRenew: true, status: "Active" as const };

test("no roll-forward when autoRenew false or missing", () => {
  assert.equal(effectiveRenewalDate({ ...base, autoRenew: false }, "2026-11-25"), "2025-01-10");
  assert.equal(effectiveRenewalDate({ ...base, autoRenew: undefined }, "2026-11-25"), "2025-01-10");
});

test("no roll-forward when Cancelled", () => {
  assert.equal(effectiveRenewalDate({ ...base, status: "Cancelled" }, "2026-11-25"), "2025-01-10");
});

test("no roll-forward for One-time or missing cycle", () => {
  assert.equal(effectiveRenewalDate({ ...base, billingCycle: "One-time" }, "2026-11-25"), "2025-01-10");
  assert.equal(effectiveRenewalDate({ ...base, billingCycle: undefined }, "2026-11-25"), "2025-01-10");
});

test("no roll-forward when date is in the future or today", () => {
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-12-01" }, "2026-11-25"), "2026-12-01");
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-11-25" }, "2026-11-25"), "2026-11-25");
});

test("roll-forward lands on first date >= today", () => {
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2025-11-30" }, "2026-11-25"), "2026-11-30");
  assert.equal(
    effectiveRenewalDate({ ...base, renewalDate: "2024-03-15", billingCycle: "Annual" }, "2026-11-25"),
    "2027-03-15"
  );
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-01-31" }, "2026-04-02"), "2026-04-30");
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-01-31" }, "2026-03-01"), "2026-03-31");
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-01-10" }, "2026-02-10"), "2026-02-10");
});

test("roll-forward works for Pending Cancellation (still renews until cancelled)", () => {
  assert.equal(
    effectiveRenewalDate({ ...base, status: "Pending Cancellation", renewalDate: "2026-10-01" }, "2026-11-25"),
    "2026-12-01"
  );
});

test("bad input is returned unchanged", () => {
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "" }, "2026-11-25"), "");
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "not-a-date" }, "2026-11-25"), "not-a-date");
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "2026-02-30" }, "2026-11-25"), "2026-02-30");
  assert.equal(effectiveRenewalDate(base, ""), "2025-01-10");
  assert.equal(addCycle("", "Monthly"), "");
  assert.equal(addCycle("garbage", "Annual"), "garbage");
});

test("iteration cap leaves absurdly old dates unchanged rather than hanging", () => {
  assert.equal(effectiveRenewalDate({ ...base, renewalDate: "0001-01-01" }, "9999-12-31"), "0001-01-01");
});
