# Deploying Turso

## Setup

```bash
turso db create omak --location fra        # or was — Koyeb regions note below
turso db show omak --url                   # → TURSO_DATABASE_URL (libsql://...)
turso db tokens create omak                # → TURSO_AUTH_TOKEN
```

Both are stored as Koyeb secrets — never committed. Local development uses
`TURSO_DATABASE_URL=file:./data/omak.db` (no token needed).

## Why this client

`@libsql/client` was chosen over the newer `@tursodatabase/serverless` because it
speaks both `libsql://` (production) and `file:` (tests/dev) from one API
(docs.turso.tech/sdk/ts/reference). Migration 001+ are forward-only and tracked in
`_schema_version` because `pragma user_version` is read-only on Turso Cloud.

## Quotas and the cost model (docs.turso.tech/help/usage-and-billing)

- Plans are metered monthly on **rows read**, **rows written**, and **storage**
  (4 KB pages). Exact quota numbers are plan-specific — check the console/plan API;
  do not hardcode assumptions.
- **A "row read" is a row scan**: non-indexed queries bill every row they touch,
  aggregates scan everything, `select 1` still counts one read. This is why every hot
  query in Omak is indexed + `LIMIT`ed (see architecture-data.md).
- Rows written count inserts/updates even inside aborted transactions; `VACUUM` is
  disabled — retention (daily prune) is the space control.
- Over quota → queries fail with the `BLOCKED` error code. Omak logs and continues on
  in-memory state; alerts should watch for `BLOCKED` in logs.

## Omak-specific numbers to expect

Steady-state writes per active evening (rough, measurable via ai_usage/logs):

- 1 batch insert per burst (1 write unit per burst, not per message),
- 1 `ai_usage` upsert per AI call,
- memory/summary writes (a few per hour).

The dominant reads are per-burst memory lookups (indexed, ≤5 rows) and the sticker
pack list per match (bounded). If Turso bills surprises, `EXPLAIN QUERY PLAN` any
suspicious query — full scans show up immediately.

## Concurrency notes

- `busy_timeout` and `journal_mode` pragmas are unsupported on Turso Cloud — the code
  never sets them.
- Interactive transactions lock writes with a 5 s timeout; Omak uses `batch()`
  instead everywhere.
- Default client concurrency is up to 20 requests — adequate for one bot instance.
