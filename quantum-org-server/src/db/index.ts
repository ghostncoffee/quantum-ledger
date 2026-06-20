import { createClient, type Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });

const DB_PATH = path.join(config.dataDir, 'clan-data-server.db');

const client: Client = createClient({
  url: `file:${DB_PATH}`,
});

// Thin async wrapper around the libsql client, matching the offline tool's db style.
export const db = {
  all: async (sql: string, args: unknown[] = []): Promise<any[]> => {
    const r = await client.execute({ sql, args: args as any });
    return r.rows as any[];
  },
  get: async (sql: string, args: unknown[] = []): Promise<any | null> => {
    const r = await client.execute({ sql, args: args as any });
    return (r.rows[0] as any) ?? null;
  },
  run: async (sql: string, args: unknown[] = []): Promise<{ lastInsertRowid: number; rowsAffected: number }> => {
    const r = await client.execute({ sql, args: args as any });
    return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), rowsAffected: r.rowsAffected };
  },
  exec: async (sql: string): Promise<void> => {
    // ponytail: naive split — breaks if a statement contains a ';' inside a string
    // literal or trigger body. Fine for our static DDL; switch to client.executeMultiple
    // (or a real splitter) if a migration ever needs an embedded semicolon.
    const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of stmts) {
      await client.execute(stmt);
    }
  },
};

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS uploaded_sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  session_type TEXT NOT NULL,
  session_data TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  dedupe_hash TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_dedupe ON uploaded_sessions(member_id, dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON uploaded_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_occurred ON uploaded_sessions(occurred_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(id),
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_occurred ON activity_log(occurred_at);

CREATE TABLE IF NOT EXISTS member_ships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nickname TEXT,
  type TEXT NOT NULL,
  scu_capacity REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ships_member ON member_ships(member_id);

CREATE TABLE IF NOT EXISTS member_blueprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  mission_trigger TEXT,
  discovered_at TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(member_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_blueprints_member ON member_blueprints(member_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_name ON member_blueprints(product_name);

CREATE TABLE IF NOT EXISTS clan_stats (
  id TEXT PRIMARY KEY,
  stat_type TEXT NOT NULL,
  time_period TEXT NOT NULL,
  value TEXT NOT NULL,
  calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stat_type, time_period)
);

CREATE TABLE IF NOT EXISTS server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export async function initDb(): Promise<void> {
  await db.exec(CREATE_TABLES);
  // Idempotent migration: add status column to members (default 'approved' so
  // existing rows stay visible after a server upgrade).
  await db.run("ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'")
    .catch(() => { /* column already exists — safe to ignore */ });
}
