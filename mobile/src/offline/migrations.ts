export const CURRENT_SCHEMA_VERSION = 1;

export const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS cache_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      server_id TEXT,
      local_id TEXT,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      pending_sync INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_scope
      ON cache_records(user_id, business_id, entity_type);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_server
      ON cache_records(user_id, business_id, entity_type, server_id)
      WHERE server_id IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_local
      ON cache_records(user_id, business_id, entity_type, local_id)
      WHERE local_id IS NOT NULL;`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      local_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_local_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_scope
      ON sync_queue(user_id, business_id, status, created_at);`,
    `CREATE TABLE IF NOT EXISTS sync_metadata (
      user_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      meta_key TEXT NOT NULL,
      meta_value TEXT NOT NULL,
      PRIMARY KEY (user_id, business_id, meta_key)
    );`,
    `CREATE TABLE IF NOT EXISTS local_id_mappings (
      local_id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      business_id TEXT NOT NULL
    );`,
  ],
};
