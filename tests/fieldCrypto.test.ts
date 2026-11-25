import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import {
  EncryptionKeyError,
  decryptField,
  decryptSubscription,
  encryptExistingSubscriptions,
  encryptField,
  encryptSubscription,
  importDataKey,
  readAll,
  readOne,
  toStored,
} from "../server/fieldCrypto.ts";
import { openDb } from "../server/db.ts";
import { listRecords, putRecord } from "../server/repo.ts";

const newKeyB64 = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const newKey = () => importDataKey(newKeyB64());
const PREFIX = "enc:v1:";

describe("importDataKey", () => {
  test("accepts a valid 32-byte base64 key", async () => {
    const key = await importDataKey(newKeyB64());
    assert.equal(key.type, "secret");
    assert.equal(key.algorithm.name, "AES-GCM");
    assert.equal(key.extractable, false);
  });

  test("tolerates surrounding whitespace", async () => {
    const k = newKeyB64();
    const a = await importDataKey(`  ${k}\n`);
    const ct = await encryptField(a, "x", "aad");
    assert.equal(await decryptField(await importDataKey(k), ct, "aad"), "x");
  });

  test("rejects non-base64 input", async () => {
    await assert.rejects(importDataKey("!!!not base64!!!"), EncryptionKeyError);
  });

  test("rejects wrong-length keys", async () => {
    for (const n of [0, 1, 16, 24, 31, 33, 64]) {
      const k = Buffer.alloc(n, 7).toString("base64");
      await assert.rejects(importDataKey(k), EncryptionKeyError, `length ${n}`);
    }
  });

  test("a failed import is not cached forever (still rejects consistently)", async () => {
    await assert.rejects(importDataKey("abc$"), EncryptionKeyError);
    await assert.rejects(importDataKey("abc$"), EncryptionKeyError);
  });
});

describe("encryptField / decryptField", () => {
  const samples: [string, string][] = [
    ["empty string", ""],
    ["ascii", "hunter2-Password!"],
    ["unicode and emoji", "pässwörd-日本語-🔐🚀"],
    ["200 chars", "a1B2".repeat(50)],
  ];

  for (const [name, plain] of samples) {
    test(`round-trips ${name}`, async () => {
      const key = await newKey();
      const ct = await encryptField(key, plain, "subscriptions/s1/password");
      assert.ok(ct.startsWith(PREFIX));
      assert.equal(await decryptField(key, ct, "subscriptions/s1/password"), plain);
    });
  }

  test("output has enc:v1:<iv>:<ct> shape and never contains the plaintext", async () => {
    const key = await newKey();
    const plain = "SuperSecretValue123";
    const ct = await encryptField(key, plain, "aad");
    assert.match(ct, /^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    assert.ok(!ct.includes(plain));
    assert.ok(!ct.includes(Buffer.from(plain).toString("base64")));
  });

  test("is randomized: same input gives different output each call", async () => {
    const key = await newKey();
    const outs = new Set<string>();
    for (let i = 0; i < 10; i++) outs.add(await encryptField(key, "same", "aad"));
    assert.equal(outs.size, 10);
  });

  test("decrypting with a different key throws EncryptionKeyError", async () => {
    const k1 = await newKey();
    const k2 = await newKey();
    const ct = await encryptField(k1, "secret", "aad");
    await assert.rejects(decryptField(k2, ct, "aad"), EncryptionKeyError);
  });

  test("different AAD (other record id or other field) throws", async () => {
    const key = await newKey();
    const ct = await encryptField(key, "secret", "subscriptions/s1/password");
    await assert.rejects(decryptField(key, ct, "subscriptions/s2/password"), EncryptionKeyError);
    await assert.rejects(decryptField(key, ct, "subscriptions/s1/username"), EncryptionKeyError);
    assert.equal(await decryptField(key, ct, "subscriptions/s1/password"), "secret");
  });

  test("tampered ciphertext throws", async () => {
    const key = await newKey();
    const ct = await encryptField(key, "a fairly long secret value here", "aad");
    const [ivB64, ctB64] = ct.slice(PREFIX.length).split(":");
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
    const tamperedCt = `${PREFIX}${ivB64}:${flip(ctB64, 2)}`;
    await assert.rejects(decryptField(key, tamperedCt, "aad"), EncryptionKeyError);
    const tamperedIv = `${PREFIX}${flip(ivB64, 2)}:${ctB64}`;
    await assert.rejects(decryptField(key, tamperedIv, "aad"), EncryptionKeyError);
  });

  test("malformed encrypted values throw EncryptionKeyError rather than garbage", async () => {
    const key = await newKey();
    await assert.rejects(decryptField(key, `${PREFIX}onlyonepart`, "aad"), EncryptionKeyError);
    await assert.rejects(decryptField(key, PREFIX, "aad"), EncryptionKeyError);
    await assert.rejects(decryptField(key, `${PREFIX}%%%:%%%`, "aad"), EncryptionKeyError);
  });
});

describe("encryptSubscription", () => {
  const sub = {
    name: "Figma",
    url: "https://figma.com",
    username: "admin@example.com",
    password: "p@ssw0rd",
    remarks: "shared login",
    cost: 15,
    autoRenew: true,
  };

  test("encrypts only username and password", async () => {
    const key = await newKey();
    const out = await encryptSubscription(key, "s1", sub);
    assert.ok((out.username as string).startsWith(PREFIX));
    assert.ok((out.password as string).startsWith(PREFIX));
    assert.equal(out.name, sub.name);
    assert.equal(out.url, sub.url);
    assert.equal(out.remarks, sub.remarks);
    assert.equal(out.cost, sub.cost);
    assert.equal(out.autoRenew, sub.autoRenew);
    assert.deepEqual(Object.keys(out).sort(), Object.keys(sub).sort());
  });

  test("binds fields to the record and field via AAD", async () => {
    const key = await newKey();
    const out = await encryptSubscription(key, "s1", sub);
    await assert.rejects(decryptField(key, out.password as string, "subscriptions/s2/password"), EncryptionKeyError);
    // swapping username/password ciphertexts must fail
    await assert.rejects(
      decryptSubscription(key, "s1", { ...out, username: out.password, password: out.username }),
      EncryptionKeyError,
    );
  });

  test("leaves empty strings and non-string values alone", async () => {
    const key = await newKey();
    assert.deepEqual(await encryptSubscription(key, "s1", { username: "", password: "" }), { username: "", password: "" });
    const odd = { username: null, password: 12345 };
    assert.deepEqual(await encryptSubscription(key, "s1", odd), odd);
    const missing = { name: "x" };
    assert.deepEqual(await encryptSubscription(key, "s1", missing), missing);
    const obj = { username: { a: 1 }, password: ["x"] };
    assert.deepEqual(await encryptSubscription(key, "s1", obj), obj);
  });

  test("does not double-encrypt an already-encrypted value", async () => {
    const key = await newKey();
    const once = await encryptSubscription(key, "s1", sub);
    const twice = await encryptSubscription(key, "s1", once);
    assert.deepEqual(twice, once);
  });

  test("does not mutate its input", async () => {
    const key = await newKey();
    const input = { ...sub };
    const snapshot = structuredClone(input);
    const out = await encryptSubscription(key, "s1", input);
    assert.deepEqual(input, snapshot);
    assert.notEqual(out, input);
  });
});

describe("decryptSubscription", () => {
  const sub = { name: "Figma", username: "admin", password: "pw", cost: 5, autoRenew: false };

  test("round-trips encryptSubscription exactly", async () => {
    const key = await newKey();
    const enc = await encryptSubscription(key, "s1", sub);
    assert.deepEqual(await decryptSubscription(key, "s1", enc), sub);
  });

  test("round-trips unicode secrets", async () => {
    const key = await newKey();
    const s = { username: "ユーザー", password: "🔐pässwörd" };
    assert.deepEqual(await decryptSubscription(key, "s1", await encryptSubscription(key, "s1", s)), s);
  });

  test("passes legacy plaintext through unchanged", async () => {
    const key = await newKey();
    assert.deepEqual(await decryptSubscription(key, "s1", sub), sub);
  });

  test("passes through empty and non-string values", async () => {
    const key = await newKey();
    const d = { username: "", password: null, cost: 1 };
    assert.deepEqual(await decryptSubscription(key, "s1", d), d);
  });

  test("with null key and an encrypted field throws EncryptionKeyError", async () => {
    const key = await newKey();
    const enc = await encryptSubscription(key, "s1", sub);
    await assert.rejects(decryptSubscription(null, "s1", enc), EncryptionKeyError);
    // only one field encrypted is still enough to throw
    await assert.rejects(decryptSubscription(null, "s1", { username: "plain", password: enc.password }), EncryptionKeyError);
  });

  test("with null key and plaintext returns as-is", async () => {
    assert.deepEqual(await decryptSubscription(null, "s1", sub), sub);
  });

  test("wrong record id throws", async () => {
    const key = await newKey();
    const enc = await encryptSubscription(key, "s1", sub);
    await assert.rejects(decryptSubscription(key, "other", enc), EncryptionKeyError);
  });

  test("does not mutate its input", async () => {
    const key = await newKey();
    const enc = await encryptSubscription(key, "s1", sub);
    const snapshot = structuredClone(enc);
    await decryptSubscription(key, "s1", enc);
    assert.deepEqual(enc, snapshot);
  });
});

describe("toStored", () => {
  const data = { name: "x", username: "u", password: "p" };

  test("encrypts subscriptions when a key is given", async () => {
    const key = await newKey();
    const out = await toStored("subscriptions", "s1", data, key);
    assert.ok((out.username as string).startsWith(PREFIX));
    assert.ok((out.password as string).startsWith(PREFIX));
    assert.equal(out.name, "x");
  });

  test("returns data unchanged for other collections", async () => {
    const key = await newKey();
    for (const c of ["devices", "categories", "departments", "staffMembers"] as const) {
      assert.deepEqual(await toStored(c, "id1", data, key), data);
    }
  });

  test("returns data unchanged when key is null", async () => {
    assert.deepEqual(await toStored("subscriptions", "s1", data, null), data);
  });
});

describe("encryptExistingSubscriptions / readAll / readOne (real database)", () => {
  const dbp = openDb("memory://");
  after(async () => {
    await (await dbp).close();
  });

  const SECRETS = ["alice-user", "alice-pw", "bob-user", "carol-user", "carol-pw", "bob-pw-never"];

  test("full lifecycle", async () => {
    const db = await dbp;
    const key = await newKey();

    const s1 = { id: "s1", name: "Alice Svc", url: "https://a.example", username: "alice-user", password: "alice-pw", cost: 10, remarks: "r1" };
    const s2 = { id: "s2", name: "Bob Svc", username: "bob-user", password: "", cost: 0 };
    const s3Plain = { id: "s3", name: "Carol Svc", username: "carol-user", password: "carol-pw", cost: 3 };
    const s3Stored = await encryptSubscription(key, "s3", s3Plain);
    const device = { id: "d1", name: "Laptop", model: "X1", status: "available", history: [] };

    await putRecord(db, "subscriptions", "s1", s1);
    await putRecord(db, "subscriptions", "s2", s2);
    await putRecord(db, "subscriptions", "s3", s3Stored);
    await putRecord(db, "devices", "d1", device);

    // s1 and s2 need encryption; s3 is already encrypted
    assert.equal(await encryptExistingSubscriptions(db, key), 2);

    const raw = await listRecords(db, "subscriptions");
    assert.equal(raw.length, 3);
    const byId = Object.fromEntries(raw.map((r) => [r.id, r.data]));
    assert.ok((byId.s1.username as string).startsWith(PREFIX));
    assert.ok((byId.s1.password as string).startsWith(PREFIX));
    assert.ok((byId.s2.username as string).startsWith(PREFIX));
    assert.equal(byId.s2.password, "");
    assert.ok((byId.s3.username as string).startsWith(PREFIX));
    assert.ok((byId.s3.password as string).startsWith(PREFIX));
    // non-secret fields untouched
    assert.equal(byId.s1.name, "Alice Svc");
    assert.equal(byId.s1.url, "https://a.example");
    assert.equal(byId.s1.cost, 10);
    assert.equal(byId.s1.remarks, "r1");

    const dump = JSON.stringify(raw);
    for (const secret of SECRETS) assert.ok(!dump.includes(secret), `plaintext leaked: ${secret}`);

    // also check the full table dump straight from SQL
    const { rows } = await db.query(`SELECT * FROM subscriptions`);
    const sqlDump = JSON.stringify(rows);
    for (const secret of SECRETS) assert.ok(!sqlDump.includes(secret), `plaintext leaked in SQL: ${secret}`);

    // reads decrypt back to the original plaintext
    const all = await readAll(db, "subscriptions", key);
    assert.deepEqual(all, [s1, s2, s3Plain]);

    assert.deepEqual(await readOne(db, "subscriptions", "s1", key), s1);
    assert.deepEqual(await readOne(db, "subscriptions", "s2", key), s2);
    assert.deepEqual(await readOne(db, "subscriptions", "s3", key), s3Plain);
    assert.equal(await readOne(db, "subscriptions", "missing", key), null);

    // devices are untouched by the key
    assert.deepEqual(await readAll(db, "devices", key), [device]);
    assert.deepEqual(await readAll(db, "devices", null), [device]);
    assert.deepEqual(await readOne(db, "devices", "d1", key), device);

    // idempotent
    assert.equal(await encryptExistingSubscriptions(db, key), 0);
    assert.deepEqual(await listRecords(db, "subscriptions"), raw);

    // no key => encrypted data cannot be read
    await assert.rejects(readAll(db, "subscriptions", null), EncryptionKeyError);
    await assert.rejects(readOne(db, "subscriptions", "s1", null), EncryptionKeyError);

    // wrong key => cannot be read, and migration refuses to touch nothing-new data
    const wrong = await newKey();
    await assert.rejects(readAll(db, "subscriptions", wrong), EncryptionKeyError);
    await assert.rejects(readOne(db, "subscriptions", "s1", wrong), EncryptionKeyError);
  });
});
