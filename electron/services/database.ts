import initSqlJs, { Database } from 'sql.js/dist/sql-asm.js';
import fs from 'fs';
import { getDatabasePath } from './dataPaths';

let db: Database | null = null;
let dbPath = '';

export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs();

  dbPath = getDatabasePath();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS version_history (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_version_file ON version_history(file_path);

    CREATE TABLE IF NOT EXISTS global_history (
      id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'save',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_global_history_created ON global_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_global_history_file ON global_history(file_path);

    CREATE TABLE IF NOT EXISTS file_meta (
      file_path TEXT PRIMARY KEY,
      status TEXT DEFAULT 'in_progress',
      tags TEXT DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_index (
      file_path TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'in_progress',
      tags TEXT DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER DEFAULT 1,
      interval_minutes INTEGER DEFAULT 30,
      backup_path TEXT
    );

    CREATE TABLE IF NOT EXISTS recovery (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      config TEXT DEFAULT '{}'
    );
  `);

  persistDatabase();
  return db;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function persistDatabase(): void {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function closeDatabase(): void {
  if (db) {
    persistDatabase();
    db.close();
    db = null;
  }
}

export function queryAll(sql: string, params: unknown[] = []): unknown[][] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows: unknown[][] = [];
  while (stmt.step()) {
    rows.push(stmt.get());
  }
  stmt.free();
  return rows;
}

export function queryOne(sql: string, params: unknown[] = []): unknown[] | null {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let row: unknown[] | null = null;
  if (stmt.step()) {
    row = stmt.get();
  }
  stmt.free();
  return row;
}

export function runSql(sql: string, params: unknown[] = []): void {
  getDatabase().run(sql, params);
  persistDatabase();
}
