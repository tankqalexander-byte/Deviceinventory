/**
 * Cloudflare Worker: serves the React app (static assets) and the same JSON
 * API as server/index.ts, backed by Cloudflare D1.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };
import type { CollectionName } from "../server/snapshot.ts";
import { deleteRecord, getRecord, listRecords, putRecord } from "../server/repo.ts";
import { validateWrite, isValidId } from "../server/validation.ts";
import { checkAccess, type AccessResult } from "../server/access.ts";
import { applyLoanForm, otherSerialMatches, buildContext, safeEqualHex, validateInput, planNewDevice, validateNewDeviceInput } from "../server/automation.ts";
import { d1Db, ensureSchema } from "./d1.ts";
import { ensureImported, ImportPending } from "./import.ts";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_DISABLED?: string;
  ALLOWED_EMAILS?: string;
  AUTOMATION_KEY_SHA256?: string;
}

const ROUTES: Record<string, CollectionName> = {
  devices: "devices",
  staff: "staffMembers",
  categories: "categories",
  departments: "departments",
  subscriptions: "subscriptions",
};

// Only approved Google accounts (see server/access.ts). Tokens are verified
// against Google's public keys for this Firebase project.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);
type AuthOutcome = AccessResult | { ok: false; status: 401; reason: string };
async function authorize(req: Request, env: Env): Promise<AuthOutcome> {
  if (env.AUTH_DISABLED === "true") return { ok: true, email: "auth-disabled" };
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) return { ok: false, status: 401, reason: "Sign-in required" };
  try {
    const { payload } = await jwtVerify(m[1], JWKS, {
      issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      audience: firebaseConfig.projectId,
    });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no subject");
    return checkAccess(payload as any, env.ALLOWED_EMAILS);
  } catch {
    return { ok: false, status: 401, reason: "Invalid or expired sign-in token" };
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") {
    try {
      await ensureSchema(env.DB);
      await env.DB.prepare("SELECT 1").first();
      return json({ ok: true });
    } catch {
      return json({ ok: false }, 503);
    }
  }
  await ensureSchema(env.DB);
  const db = d1Db(env.DB);

  if (url.pathname.startsWith("/api/automation/")) return handleAutomation(req, env, url, db);

  const access = await authorize(req, env);
  if (access.ok === false) return json({ error: access.reason }, "status" in access ? access.status : 403);

  try {
    await ensureImported(env.DB, db, {
      apiKey: firebaseConfig.apiKey,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
    });
  } catch (err) {
    if (err instanceof ImportPending) return new Response(JSON.stringify({ error: err.message }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5" } });
    throw err;
  }

  const [, , segment, rawId, ...rest] = url.pathname.split("/");
  const c = ROUTES[segment];
  if (!c || rest.length) return json({ error: "Unknown collection" }, 404);
  let id: string | undefined;
  try {
    id = rawId === undefined ? undefined : decodeURIComponent(rawId);
  } catch {
    return json({ error: "invalid document id" }, 400);
  }

  if (id === undefined || id === "") {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    return json((await listRecords(db, c)).map((d) => d.data));
  }

  switch (req.method) {
    case "GET": {
      const doc = await getRecord(db, c, id);
      return doc ? json(doc) : json({ error: "Not found" }, 404);
    }
    case "PUT": {
      if (Number(req.headers.get("Content-Length") || 0) > 5 * 1024 * 1024) return json({ error: "Request too large" }, 413);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Malformed JSON" }, 400);
      }
      const error = await db.tx(async (q) => {
        const existing = await getRecord(q, c, id);
        const err = validateWrite(c, id, body, existing);
        if (!err) await putRecord(q, c, id, body as Record<string, unknown>);
        return err;
      });
      return error ? json({ error }, 400) : new Response(null, { status: 204 });
    }
    case "DELETE": {
      if (!isValidId(id)) return json({ error: "invalid document id" }, 400);
      await deleteRecord(db, c, id);
      return new Response(null, { status: 204 });
    }
    default:
      return json({ error: "Method not allowed" }, 405);
  }
}

// --- Loan-form automation (scheduled task) ----------------------------------
// Separate key, checked by SHA-256 fingerprint; it can only read the device /
// staff list and record checkouts/returns (rules in server/automation.ts).
async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleAutomation(req: Request, env: Env, url: URL, db: ReturnType<typeof d1Db>): Promise<Response> {
  const expected = (env.AUTOMATION_KEY_SHA256 || "").toLowerCase();
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!expected || !m || !safeEqualHex(await sha256Hex(m[1]), expected)) return json({ error: "Invalid automation key" }, 401);
  try {
    await ensureImported(env.DB, db, { apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, databaseId: firebaseConfig.firestoreDatabaseId });
  } catch (err) {
    if (err instanceof ImportPending) return json({ error: err.message }, 503);
    throw err;
  }
  if (url.pathname === "/api/automation/context" && req.method === "GET") {
    const devices = (await listRecords(db, "devices")).map((d) => d.data);
    const staff = (await listRecords(db, "staffMembers")).map((d) => d.data);
    return json(buildContext(devices, staff));
  }
  if (url.pathname === "/api/automation/loan-form" && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Malformed JSON" }, 400); }
    const input = validateInput(body);
    if (typeof input === "string") return json({ result: "rejected", message: input }, 400);
    const today = new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10); // allow for time zones ahead of UTC
    const outcome = await db.tx(async (q) => {
      const device = await getRecord(q, "devices", input.deviceId);
      const staff = await getRecord(q, "staffMembers", input.staffId);
      const twins = otherSerialMatches((await listRecords(q, "devices")).map((d) => d.data), input.deviceId, input.serialAsWritten);
      if (twins.length) return { status: 409 as const, result: "conflict" as const, message: `Serial "${input.serialAsWritten}" could also be ${twins.map((d) => `${d.name} (${d.serialNumber})`).join(", ")}; not changed.` };
      const r = applyLoanForm(device, staff, input, today);
      if (r.status === 200 && r.result === "applied" && r.device) {
        const err = validateWrite("devices", input.deviceId, r.device, device);
        if (err) return { status: 422 as const, result: "rejected" as const, message: `Update refused by validation: ${err}` };
        await putRecord(q, "devices", input.deviceId, r.device);
      }
      return r;
    });
    const { device: _d, ...publicResult } = outcome as any;
    return json(publicResult, outcome.status);
  }
  if (url.pathname === "/api/automation/add-device" && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Malformed JSON" }, 400); }
    const input = validateNewDeviceInput(body);
    if (typeof input === "string") return json({ result: "rejected", message: input }, 400);
    const outcome = await db.tx(async (q) => {
      const devices = (await listRecords(q, "devices")).map((d) => d.data);
      const r = planNewDevice(devices, input, `dev-${Date.now()}`);
      if (r.status === 201) {
        const err = validateWrite("devices", r.deviceId, r.device, null);
        if (err) return { status: 400 as const, result: "rejected" as const, message: `New device refused by validation: ${err}` };
        await putRecord(q, "devices", r.deviceId, r.device);
      }
      return r;
    });
    const { device: _d, ...publicResult } = outcome as any;
    return json(publicResult, outcome.status);
  }
  return json({ error: "Unknown automation endpoint" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url);
      } catch (err) {
        console.error("API error:", err);
        return json({ error: "Internal server error" }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
