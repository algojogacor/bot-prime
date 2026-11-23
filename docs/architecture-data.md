# Architecture — Data

Single Turso database, forward-only migrations, one row-cost budget in mind everywhere.

## Migration system (`src/db/migrate.ts`, `src/db/migrations.ts`)

- Version tracking uses the `_schema_version` table — `pragma user_version` is
  read-only on Turso Cloud (research §6.4).
- Each migration is an **array of statements** run with `db.batch(..., 'write')`
  together with its version stamp: all-or-nothing, never half-applied.
- Rule learned the hard way in testing: libSQL `execute()` prepares a single statement,
  so a multi-statement string would silently apply only its first statement.

## Schema (migration 001–004)

| Table | Purpose | Hot queries / indexes |
| --- | --- | --- |
| `_schema_version` | applied migrations | PK version |
| `auth_keys` | encrypted Baileys auth blobs (type, key_id) | PK (type, key_id) |
| `messages` | normalized chat history | `(chat_jid, timestamp)` desc reads, `timestamp` pruning |
| `lid_map` | PN↔LID pairs seen (v7 one-way resolution) | PK lid; pn lookup |
| `group_meta`, `group_participants` | metadata + participant snapshots | PK group_jid |
| `ai_usage` | daily usage per provider | unique `(day, provider)` upsert (migration 002) |
| `memories` + `memories_fts` | long-term memory + FTS5 external-content index | `(chat_jid, importance, created_at)`; triggers keep FTS in sync |
| `blobs`, `stickers` | sticker webp bytes + pack metadata | PK id / index name |

## Cost model (Turso meters rows READ as row SCANS)

- Every hot query is indexed and `LIMIT`ed: recent messages by `(chat_jid, timestamp)`,
  memories by `(chat_jid, importance, created_at)`, sticker matching loads the pack
  list once per match (bounded at 500 rows — a pack is small).
- `COUNT(*)`-style stats are avoided in hot paths; `!stats` reads `ai_usage` (small)
  and the sticker list only.
- Retention is mandatory, not optional: messages > 60 days and low-importance
  memories > 30 days are pruned daily. `VACUUM` is disabled on Turso, so space must
  simply not accumulate.
- Exceeding quota surfaces as the `BLOCKED` error code on queries; the bot logs and
  keeps running on in-memory state instead of crashing.

## Encryption at rest (`src/db/crypto.ts`)

- `AUTH_ENCRYPTION_KEY` (base64; 32 raw bytes used as-is, otherwise SHA-256 hashed)
  keys AES-256-GCM. Payload = base64(iv 12B ‖ tag 16B ‖ ciphertext).
- Everything in `auth_keys` (session keys, pre-keys, sender keys, app-state keys,
  `lid-mapping`, `device-list`, `tctoken`, creds) is encrypted; tampering fails the
  auth tag and the entry is treated as missing (logged).
- Serialization uses Baileys `BufferJSON` replacer/reviver — plain `JSON.stringify`
  corrupts Buffer fields (research §5.4).
- Chat message text and memory contents are stored in plaintext by design: they are
  the working data of the bot and are covered by the retention policy and the
  community-data handling rules in `docs/security.md`.

## Access patterns to keep an eye on

1. `searchMemories` uses quoted-term OR queries; terms are stripped of quotes to keep
   FTS5 happy. No term → no query (free).
2. Sticker matching loads the pack list; at pack sizes > ~500 an in-memory index
   should replace it (documented, not yet needed).
3. `insertMessages` batches a whole burst into one write transaction — one billing
   unit per burst instead of per message.
