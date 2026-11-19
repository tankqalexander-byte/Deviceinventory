# Device Inventory

Equipment loan tracker. Firebase is used only for sign-in; the data lives in SQL.
It runs on **Cloudflare Workers + D1** (`worker/`), or as a Node server with
PostgreSQL (`server/`). Both serve the same app and the same API.

## Deploy to Cloudflare (Workers + D1)

1. Before deploying, set who may sign in. Edit `wrangler.jsonc` → `"vars"` → `"ALLOWED_EMAILS"`.
   It takes a comma-separated list of Google account emails, or `@yourdomain.com` to allow a whole domain.
   If it's empty, nobody can get in. To change it later, edit the file and push; Cloudflare redeploys.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**
   → pick this repo → **Deploy**. (Or locally: `npx wrangler login && npm run cf:deploy`.)
   The build creates the `device-inventory` D1 database automatically.
3. Open the app. On its first request the Worker creates the tables and copies
   all existing Firestore data into D1, then checks every record against
   Firestore before serving anything. It does this once; after that Firestore
   is never read or written again. If D1 already has data, the copy is skipped.
4. For **Google sign-in**, add the new address (e.g. `device-inventory.<you>.workers.dev`)
   in Firebase console → Authentication → Settings → **Authorized domains**.

Local preview with a local D1 database: `npm run cf:dev` (http://localhost:8787).

## Run locally

Prerequisite: Node.js 20+

```bash
npm install
npm run dev            # http://localhost:3000
```

Put `ALLOWED_EMAILS=you@gmail.com` in `.env.local` (Node server), or `AUTH_DISABLED=true` for local testing only.

With no `DATABASE_URL` set, the server uses an embedded Postgres (PGlite)
stored in `./data/pglite`, so there is nothing else to install. To use a real
server, put `DATABASE_URL=postgres://user:pass@host:5432/dbname` in `.env.local`.

The schema is created automatically on first start (`server/schema.ts`).

## Production

```bash
npm run build
DATABASE_URL=postgres://... npm start
```

Always set `DATABASE_URL` in production (e.g. Cloud SQL for PostgreSQL).
Cloud Run's local disk is wiped on every deploy/restart, so the embedded
fallback would lose data there.

## Migrating the existing Firestore data

All three steps are safe to repeat. Firestore is only ever read, never modified.

```bash
# 1. Export every Firestore record to a JSON snapshot (read-only)
npm run migrate:export -- firestore-export.json

# 2. Load it into SQL. Runs in a single transaction and compares every record
#    with the snapshot before committing; any difference rolls it all back.
#    Add --replace if the SQL database already has data (e.g. a dry run).
DATABASE_URL=postgres://... npm run migrate:import -- firestore-export.json

# 3. Re-check against live Firestore right before switching traffic over
DATABASE_URL=postgres://... npm run migrate:verify -- --live
```

**Cutover:** the old app keeps writing to Firestore until it is replaced, so
do the export/import as the last step before deploying, then run
`migrate:verify -- --live`. If it reports differences, someone made a change
in between; re-run steps 1–2 with `--replace`.

The snapshot holds staff details and subscription passwords in plain text.
Keep it somewhere safe and delete it once you're satisfied.

### How the data is stored

| Firestore collection | SQL table |
| --- | --- |
| `devices` | `devices` + `loan_records` (one row per history entry, plus the active loan) |
| `staffMembers` | `staff_members` |
| `categories` | `categories` |
| `departments` | `departments` |
| `subscriptions` | `subscriptions` |

Every field gets its own typed column. Each table also has an `extra` jsonb
column that keeps anything that doesn't fit a column (unknown fields, values of
an unexpected type), so any record reads back exactly as it was in Firestore.
For the current data `extra` is empty.

## API

All routes require a Firebase ID token (`Authorization: Bearer <token>`) from a
Google account listed in `ALLOWED_EMAILS`. Anonymous (guest) sessions and unverified
emails are refused. Requests without a valid token get `401`; signed-in accounts
that aren't approved get `403`.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/{devices,staff,categories,departments,subscriptions}` | list |
| GET | `/api/<collection>/<id>` | one record |
| PUT | `/api/<collection>/<id>` | create or replace (validated like `firestore.rules`) |
| DELETE | `/api/<collection>/<id>` | delete |

## Tests

```bash
npm test                                               # PGlite
TEST_DATABASE_URL=postgres://.../scratch_db npm test   # also real Postgres (wipes that DB)
SNAPSHOT_FILE=firestore-export.json npm test           # also round-trip your real data
```
