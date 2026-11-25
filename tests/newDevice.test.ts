import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planNewDevice, validateNewDeviceInput, type NewDeviceInput } from "../server/automation.ts";
import { validateWrite } from "../server/validation.ts";

const tmpl = {
  id: "tpl", name: "MacBook Air", model: "MacBook Air M2", serialNumber: "ZZZZ1111AAAA", category: "Laptops",
  status: "available", condition: "Excellent", purchaseDate: "2025-01-01", location: "HQ", image: "laptop", history: [],
};
const mk = (id: string, serialNumber: string) => ({ ...tmpl, id, name: `Dev ${id}`, serialNumber });
const mkInput = (over: Partial<NewDeviceInput> = {}): NewDeviceInput => ({
  fileId: "f1", fileName: "scan-42.pdf", serialAsWritten: "c02 xk-9981 mq", modelAsWritten: "Macbook Air 13", templateDeviceId: "tpl", ...over,
});

describe("planNewDevice", () => {
  test("creates a device from the template", () => {
    const r = planNewDevice([tmpl], mkInput(), "new-1");
    assert.equal(r.status, 201);
    assert.equal(r.result, "created");
    if (r.result !== "created") return;
    assert.equal(r.deviceId, "new-1");
    const d = r.device;
    assert.equal(d.id, "new-1");
    for (const k of ["name", "model", "category", "location", "image"]) assert.equal(d[k], (tmpl as any)[k]);
    assert.equal(d.serialNumber, "C02XK9981MQ");
    assert.equal(d.status, "available");
    assert.equal(d.condition, "Good");
    assert.equal(d.purchaseDate, "");
    assert.deepEqual(d.history, []);
    assert.match(d.notes, /scan-42\.pdf/);
    assert.match(d.notes, /Macbook Air 13/);
    assert.equal(validateWrite("devices", "new-1", d, null), null);
  });

  test("existing serial incl. look-alike characters -> already_exists", () => {
    const devs = [tmpl, mk("a", "HK5HXB7VGWTJ")];
    const r = planNewDevice(devs, mkInput({ serialAsWritten: "hk5hx87vgwtj" }), "n");
    assert.equal(r.status, 200);
    assert.equal(r.result, "already_exists");
    assert.equal((r as any).deviceId, "a");
    assert.equal((r as any).device, undefined);
  });

  test("serial within 1 edit of an existing one -> conflict", () => {
    const devs = [tmpl, mk("a", "HKDHX8VVGWJ")];
    const r = planNewDevice(devs, mkInput({ serialAsWritten: "HKDHX8VVGWTJ" }), "n");
    assert.equal(r.status, 409);
    assert.equal(r.result, "conflict");
    assert.match(r.message, /HKDHX8VVGWJ/);
  });

  test("serial exactly 2 edits away from everything -> created", () => {
    const devs = [tmpl, mk("a", "R4PTCJ00H867168")];
    const r = planNewDevice(devs, mkInput({ serialAsWritten: "R4PTCJ00H867199" }), "n");
    assert.equal(r.status, 201);
    assert.equal(r.result, "created");
  });

  test("serial 3+ edits from everything -> created", () => {
    const devs = [tmpl, mk("a", "HKDHX8VVGWJ")];
    const r = planNewDevice(devs, mkInput({ serialAsWritten: "HKDHX8VVGWTJ99" }), "n");
    assert.equal(r.status, 201);
  });

  test("unknown template -> 404", () => {
    const r = planNewDevice([tmpl], mkInput({ templateDeviceId: "nope" }), "n");
    assert.equal(r.status, 404);
  });

  test("short serial -> 400", () => {
    const r = planNewDevice([tmpl], mkInput({ serialAsWritten: "AB-12" }), "n");
    assert.equal(r.status, 400);
    assert.equal(r.result, "rejected");
  });

  test("two devices matching via look-alikes -> 409", () => {
    const devs = [tmpl, mk("a", "AB0123XY"), mk("b", "ABO123XY")];
    const r = planNewDevice(devs, mkInput({ serialAsWritten: "ABQ123XY" }), "n");
    assert.equal(r.status, 409);
    assert.equal(r.result, "conflict");
    assert.match(r.message, /AB0123XY/);
    assert.match(r.message, /ABO123XY/);
  });
});

describe("validateNewDeviceInput", () => {
  const good = { fileId: "f", fileName: "n.pdf", serialAsWritten: "ABC12345", modelAsWritten: "M", templateDeviceId: "tpl" };
  test("accepts valid body", () => {
    assert.deepEqual(validateNewDeviceInput(good), good);
  });
  for (const k of Object.keys(good)) {
    test(`rejects missing ${k}`, () => {
      const { [k]: _omit, ...rest } = good as Record<string, string>;
      assert.equal(typeof validateNewDeviceInput(rest), "string");
      assert.equal(typeof validateNewDeviceInput({ ...good, [k]: "   " }), "string");
    });
    test(`rejects over-long ${k}`, () => {
      assert.equal(typeof validateNewDeviceInput({ ...good, [k]: "x".repeat(201) }), "string");
    });
  }
  test("rejects non-object", () => {
    assert.equal(typeof validateNewDeviceInput(null), "string");
  });
});

describe("validateWrite purchaseDate rule", () => {
  const base = { ...tmpl, id: "d1", purchaseDate: "" };
  test("empty purchaseDate may be set once", () => {
    assert.equal(validateWrite("devices", "d1", { ...base, purchaseDate: "2025-05-01" }, base), null);
  });
  test("non-empty purchaseDate cannot be changed", () => {
    const existing = { ...base, purchaseDate: "2025-05-01" };
    assert.equal(validateWrite("devices", "d1", { ...existing, purchaseDate: "2025-06-01" }, existing), "purchaseDate cannot be changed");
    assert.equal(validateWrite("devices", "d1", { ...existing, purchaseDate: "" }, existing), "purchaseDate cannot be changed");
  });
});
