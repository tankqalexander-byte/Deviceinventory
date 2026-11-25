// The API must accept and reject the same writes the old Firestore rules did.
import test from "node:test";
import assert from "node:assert/strict";
import { validateWrite } from "../server/validation.ts";
import type { CollectionName } from "../server/snapshot.ts";

const device = {
  id: "dev1", name: "MacBook Pro", model: "M3 Max", serialNumber: "SN123", category: "Laptops",
  status: "available", condition: "Excellent", purchaseDate: "2026-01-01", location: "Office",
  image: "laptop", history: [],
};

test("valid device create and update pass", () => {
  assert.equal(validateWrite("devices", "dev1", device, null), null);
  assert.equal(validateWrite("devices", "dev1", { ...device, status: "loaned", currentLoan: { id: "l" } }, device), null);
});

test("Firestore rules' rejected payloads are rejected", () => {
  const bad: [string, CollectionName, string, unknown, any][] = [
    ["ghost field on staff", "staffMembers", "s1", { id: "s1", name: "a", email: "a@b", department: "x", avatarUrl: "", isAdmin: true }, null],
    ["invalid status", "devices", "dev1", { ...device, status: "destroyed" }, null],
    ["invalid condition", "devices", "dev1", { ...device, condition: "Trash" }, null],
    ["huge id", "devices", "x".repeat(5000), { ...device, id: "x".repeat(5000) }, null],
    ["id with slash", "devices", "a/b", { ...device, id: "a/b" }, null],
    ["oversized email", "staffMembers", "s1", { id: "s1", name: "a", email: "a".repeat(101), department: "x", avatarUrl: "" }, null],
    ["category name overflow", "categories", "c1", { id: "c1", name: "a".repeat(10000) }, null],
    ["category extra key", "categories", "c1", { id: "c1", name: "a", x: 1 }, null],
    ["required field null", "devices", "dev1", { ...device, name: null }, device],
    ["id tampering", "devices", "dev1", { ...device, id: "dev2" }, device],
    ["purchaseDate change", "devices", "dev1", { ...device, purchaseDate: "2020-01-01" }, device],
    ["id/URL mismatch on create", "devices", "dev9", device, null],
    ["missing history", "devices", "dev1", { ...device, history: undefined }, null],
    ["too many device fields", "devices", "dev1", { ...device, a: 1, b: 2, c: 3, d: 4, e: 5 }, null],
    ["subscription cost as string", "subscriptions", "s1", { id: "s1", name: "n", url: "u", username: "u", password: "p", renewalDate: "d", cost: "12" }, null],
    ["non-object body", "devices", "dev1", [device], null],
  ];
  for (const [label, collection, id, body, existing] of bad) {
    // Round-trip through JSON like a real request body (drops undefined keys).
    assert.notEqual(validateWrite(collection, id, JSON.parse(JSON.stringify(body)), existing), null, label);
  }
});

test("subscriptions accept autoRenew (all 13 fields) and reject a non-boolean", () => {
  const sub = { id: "s1", name: "Zoom", url: "u", username: "u", password: "p", renewalDate: "2026-12-12", remarks: "", category: "SaaS & Software", cost: 199, billingCycle: "Annual", contactPerson: "", status: "Active", autoRenew: true };
  assert.equal(validateWrite("subscriptions", "s1", sub, null), null);
  assert.notEqual(validateWrite("subscriptions", "s1", { ...sub, autoRenew: "yes" }, null), null);
});
