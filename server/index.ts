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
  const app = express();
  app.disable("x-powered-by");

  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

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
      res.json((await listRecords(db, c)).map((d) => d.data));
    } catch (e) { next(e); }
  });

  api.get("/:collection/:id", async (req, res, next) => {
    const c = collectionOf(req, res);
    if (!c) return;
    try {
      const doc = await getRecord(db, c, req.params.id);
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
        const existing = await getRecord(q, c, id);
        const err = validateWrite(c, id, req.body, existing);
        if (err) return err;
        await putRecord(q, c, id, req.body);
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

  app.use("/api", api);
  app.use("/api", (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
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
    console.log(`Device Inventory listening on http://localhost:${PORT}`);
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
