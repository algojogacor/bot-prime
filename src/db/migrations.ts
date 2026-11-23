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
];
