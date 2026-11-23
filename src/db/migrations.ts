export type Migration = {
  version: number;
  name: string;
  /**
   * Statements executed IN ORDER inside one implicit write transaction.
   * libSQL's execute() prepares a single statement, so each SQL statement
   * must be its own array entry — never a multi-statement string.
   */
  up: string[];
};

/**
 * Ordered, forward-only migrations.
 * NOTE: Turso Cloud makes `pragma user_version` read-only, so schema version is tracked
 * in the `_schema_version` table (see migrate.ts).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init-core-tables',
    up: [
      `CREATE TABLE IF NOT EXISTS auth_keys (
        type TEXT NOT NULL,
        key_id TEXT NOT NULL,
        value_enc TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (type, key_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_jid TEXT NOT NULL,
        sender_jid TEXT NOT NULL,
        sender_pn TEXT,
        text TEXT,
        msg_type TEXT NOT NULL,
        is_from_me INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      // Hot query path is "recent messages of one chat": keep it index-only.
      `CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages (chat_jid, timestamp)`,
      // Retention pruning scans by age.
      `CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (timestamp)`,
      `CREATE TABLE IF NOT EXISTS lid_map (
        lid TEXT PRIMARY KEY,
        pn TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS group_meta (
        group_jid TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        announce INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS group_participants (
        group_jid TEXT NOT NULL,
        jid TEXT NOT NULL,
        pn TEXT,
        role TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (group_jid, jid)
      )`,
      `CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        calls INTEGER NOT NULL DEFAULT 1,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON ai_usage (day)`,
    ],
  },
  {
    version: 2,
    name: 'ai-usage-unique-index',
    up: [
      // Enables the day+provider upsert used by the usage tracker.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_day_provider ON ai_usage (day, provider)`,
    ],
  },
  {
    version: 3,
    name: 'long-term-memory',
    up: [
      `CREATE TABLE memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_jid TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_msg_id TEXT,
        importance INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      )`,
      // Lookup path: best memories of one chat (importance first, then recency).
      `CREATE INDEX idx_memories_chat_importance ON memories (chat_jid, importance DESC, created_at DESC)`,
      // Lexical retrieval via FTS5 external-content table, kept in sync by triggers.
      `CREATE VIRTUAL TABLE memories_fts USING fts5(content, content='memories', content_rowid='id')`,
      `CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts (rowid, content) VALUES (new.id, new.content);
      END`,
      `CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts (memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END`,
      `CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts (memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
        INSERT INTO memories_fts (rowid, content) VALUES (new.id, new.content);
      END`,
    ],
  },
  {
    version: 4,
    name: 'stickers-and-blobs',
    up: [
      // Binary content (sticker webp, media) — Koyeb disk is ephemeral, so blobs live in DB.
      `CREATE TABLE blobs (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        data BLOB NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE stickers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        pack TEXT,
        blob_id TEXT NOT NULL REFERENCES blobs (id),
        added_by TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_stickers_name ON stickers (name)`,
    ],
  },
  {
    version: 5,
    name: 'group-settings',
    up: [
      // Persistent participation controls: !prime mode / pause survive restarts.
      `CREATE TABLE group_settings (
        group_jid TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'balanced',
        paused INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
];
