/**
 * App server: JSON API backed by SQL, plus the React front end
 * (Vite middleware in development, the built dist/ in production).
 *
 *   npm run dev      development (hot reload)
 *   npm run build && npm start   production
 */
import "./env.ts";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { openDb } from "./db.ts";
import { deleteRecord, getRecord, listRecords, putRecord } from "./repo.ts";
import { validateWrite, isValidId } from "./validation.ts";
import { checkAccess } from "./access.ts";
import { EncryptionKeyError, encryptExistingSubscriptions, importDataKey, readAll, readOne, toStored } from "./fieldCrypto.ts";
import { createHash } from "node:crypto";
import { applyLoanForm, otherSerialMatches, buildContext, safeEqualHex, validateInput, planNewDevice, validateNewDeviceInput } from "./automation.ts";
import type { CollectionName } from "./snapshot.ts";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";

// URL segment -> collection
const ROUTES: Record<string, CollectionName> = {
  devices: "devices",
  staff: "staffMembers",
  categories: "categories",
  departments: "departments",
  subscriptions: "subscriptions",
};

// --- Auth -------------------------------------------------------------------
// Only approved Google accounts (ALLOWED_EMAILS, see server/access.ts).
// Tokens are verified server-side with firebase-admin.
const authDisabled = process.env.AUTH_DISABLED === "true";
let verifyToken: ((t: string) => Promise<Record<string, any>>) | null = null;
async function getVerifier() {
  if (!verifyToken) {
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const app = getApps()[0] ?? initializeApp({ projectId: firebaseConfig.projectId });
    verifyToken = (t) => getAuth(app).verifyIdToken(t);
  }
  return verifyToken;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (authDisabled) return next();
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return res.status(401).json({ error: "Sign-in required" });
  let claims: Record<string, any>;
  try {
    claims = await (await getVerifier())(m[1]);
  } catch {
    return res.status(401).json({ error: "Invalid or expired sign-in token" });
  }
  const access = checkAccess(claims, process.env.ALLOWED_EMAILS);
  if (access.ok === false) return res.status(403).json({ error: access.reason });
  (req as any).userEmail = access.email;
  next();
}

// --- App --------------------------------------------------------------------
async function main() {
  const db = await openDb();
  // Encryption at rest for subscription usernames/passwords (see server/fieldCrypto.ts).
  const dataKey = process.env.DATA_ENCRYPTION_KEY ? await importDataKey(process.env.DATA_ENCRYPTION_KEY) : null;
  if (dataKey) {
    const n = await encryptExistingSubscriptions(db, dataKey);
    if (n) console.log(`Encrypted saved logins/passwords of ${n} subscription(s).`);
  }
  const app = express();
  app.disable("x-powered-by");

  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true, encryption: dataKey ? "on" : "off" });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Loan-form automation (scheduled task): separate key, limited endpoints.
  const automation = express.Router();
  automation.use(express.json({ limit: "1mb" }));
  automation.use((req, res, next) => {
    const expected = (process.env.AUTOMATION_KEY_SHA256 || "").toLowerCase();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    const got = m ? createHash("sha256").update(m[1]).digest("hex") : "";
    if (!expected || !m || !safeEqualHex(got, expected)) return res.status(401).json({ error: "Invalid automation key" });
    next();
  });
  automation.get("/context", async (_req, res, next) => {
    try {
      const devices = (await listRecords(db, "devices")).map((d) => d.data);
      const staff = (await listRecords(db, "staffMembers")).map((d) => d.data);
      res.json(buildContext(devices, staff));
    } catch (e) { next(e); }
  });
  automation.post("/loan-form", async (req, res, next) => {
    const input = validateInput(req.body);
    if (typeof input === "string") return res.status(400).json({ result: "rejected", message: input });
    const today = new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10);
    try {
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
      res.status(outcome.status).json(publicResult);
    } catch (e) { next(e); }
  });
  automation.post("/add-device", async (req, res, next) => {
    const input = validateNewDeviceInput(req.body);
    if (typeof input === "string") return res.status(400).json({ result: "rejected", message: input });
    try {
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
      res.status(outcome.status).json(publicResult);
    } catch (e) { next(e); }
  });
  automation.use((_req, res) => res.status(404).json({ error: "Unknown automation endpoint" }));
  app.use("/api/automation", automation);

  const api = express.Router();
  api.use(express.json({ limit: "5mb" }));
  api.use(requireAuth);

  const collectionOf = (req: Request, res: Response): CollectionName | null => {
    const c = ROUTES[req.params.collection];
    if (!c) res.status(404).json({ error: "Unknown collection" });
    return c ?? null;
  };

  api.get("/:collection", async (req, res, next) => {
    const c = collectionOf(req, res);
    if (!c) return;
    try {
      res.json(await readAll(db, c, dataKey));
    } catch (e) { next(e); }
  });

  api.get("/:collection/:id", async (req, res, next) => {
    const c = collectionOf(req, res);
    if (!c) return;
    try {
      const doc = await readOne(db, c, req.params.id, dataKey);
      doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
    } catch (e) { next(e); }
  });

  // Create or fully replace (same semantics as Firestore setDoc).
  api.put("/:collection/:id", async (req, res, next) => {
    const c = collectionOf(req, res);
    if (!c) return;
    const id = req.params.id;
    try {
      const status = await db.tx(async (q) => {
        const existing = await readOne(q, c, id, dataKey);
        const err = validateWrite(c, id, req.body, existing);
        if (err) return err;
        await putRecord(q, c, id, await toStored(c, id, req.body, dataKey));
        return null;
      });
      status ? res.status(400).json({ error: status }) : res.status(204).end();
    } catch (e) { next(e); }
  });

  api.delete("/:collection/:id", async (req, res, next) => {
    const c = collectionOf(req, res);
    if (!c) return;
    if (!isValidId(req.params.id)) return res.status(400).json({ error: "invalid document id" });
    try {
      await deleteRecord(db, c, req.params.id);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // Same answers as the Cloudflare Worker for unsupported methods / paths.
  api.all("/:collection", (req, res) =>
    ROUTES[req.params.collection] ? res.status(405).json({ error: "Method not allowed" }) : res.status(404).json({ error: "Unknown collection" }));
  api.all("/:collection/:id", (_req, res) => res.status(405).json({ error: "Method not allowed" }));
  api.use((_req, res) => res.status(404).json({ error: "Unknown collection" }));

  app.use("/api", api);
  app.use("/api", (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
    if (err instanceof URIError || err?.status === 400) return res.status(400).json({ error: "invalid document id" });
    if (err instanceof EncryptionKeyError) return res.status(500).json({ error: err.message });
    console.error("API error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // --- Front end ---
  if (isProd) {
    const dist = path.resolve(process.cwd(), "dist");
    app.use(express.static(dist, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mavis Device Inventory listening on http://localhost:${PORT}`);
    console.log(`Database: ${db.description}${authDisabled ? "  [AUTH DISABLED]" : ""}`);
  });

  const shutdown = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
