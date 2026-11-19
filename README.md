# Device Inventory

Equipment loan tracker. Data is stored in **PostgreSQL** behind a small Express
API (`server/`). Firebase is used only for sign-in.

## Run locally

Prerequisite: Node.js 20+

```bash
npm install
npm run dev            # http://localhost:3000
```

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

All routes require a Firebase ID token (`Authorization: Bearer <token>`),
matching the old Firestore rules: any signed-in user, including anonymous.

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
