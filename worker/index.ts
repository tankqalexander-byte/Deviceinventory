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
import { d1Db, ensureSchema } from "./d1.ts";
import { ensureImported, ImportPending } from "./import.ts";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_DISABLED?: string;
  ALLOWED_EMAILS?: string;
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
async function authorize(req: Request, env: Env): Promise<AccessResult | null> {
  if (env.AUTH_DISABLED === "true") return { ok: true, email: "auth-disabled" };
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], JWKS, {
      issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      audience: firebaseConfig.projectId,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return checkAccess(payload as any, env.ALLOWED_EMAILS);
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  await ensureSchema(env.DB);
  const db = d1Db(env.DB);

  if (url.pathname === "/api/health") {
    await db.query("SELECT 1");
    return json({ ok: true });
  }
  const access = await authorize(req, env);
  if (!access) return json({ error: "Sign-in required" }, 401);
  if (access.ok === false) return json({ error: access.reason }, 403);

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
  const id = rawId === undefined ? undefined : decodeURIComponent(rawId);

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
