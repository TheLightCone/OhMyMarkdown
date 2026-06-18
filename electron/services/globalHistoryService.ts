import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, persistDatabase, queryAll, queryOne, runSql } from './database';

export type GlobalHistorySource = 'save' | 'autosave' | 'edit';

export interface GlobalHistoryEntry {
  id: string;
  workspacePath: string;
  filePath: string;
  fileName: string;
  content: string;
  source: GlobalHistorySource;
  createdAt: number;
  fileExists: boolean;
  workspaceExists: boolean;
}

const MAX_GLOBAL_ENTRIES = 500;

function basename(filePath: string): string {
  return path.basename(filePath);
}

function pathExists(targetPath: string): boolean {
  if (!targetPath) return false;
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function trimOldEntries(): void {
  const countRow = queryOne('SELECT COUNT(*) FROM global_history');
  const count = (countRow?.[0] as number) || 0;
  if (count <= MAX_GLOBAL_ENTRIES) return;

  const oldRows = queryAll(
    'SELECT id FROM global_history ORDER BY created_at ASC LIMIT ?',
    [count - MAX_GLOBAL_ENTRIES],
  );
  for (const [oldId] of oldRows) {
    runSql('DELETE FROM global_history WHERE id = ?', [oldId]);
  }
}

export function recordGlobalHistory(options: {
  workspacePath: string;
  filePath: string;
  content: string;
  source: GlobalHistorySource;
}): GlobalHistoryEntry {
  const id = uuidv4();
  const createdAt = Date.now();
  const fileName = basename(options.filePath);

  getDatabase().run(
    'INSERT INTO global_history (id, workspace_path, file_path, file_name, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, options.workspacePath || '', options.filePath, fileName, options.content, options.source, createdAt],
  );

  trimOldEntries();
  persistDatabase();

  return {
    id,
    workspacePath: options.workspacePath || '',
    filePath: options.filePath,
    fileName,
    content: options.content,
    source: options.source,
    createdAt,
    fileExists: pathExists(options.filePath),
    workspaceExists: pathExists(options.workspacePath),
  };
}

function enrichEntry(row: unknown[]): GlobalHistoryEntry {
  const workspacePath = (row[1] as string) || '';
  const filePath = row[2] as string;
  return {
    id: row[0] as string,
    workspacePath,
    filePath,
    fileName: row[3] as string,
    content: row[4] as string,
    source: row[5] as GlobalHistorySource,
    createdAt: row[6] as number,
    fileExists: pathExists(filePath),
    workspaceExists: pathExists(workspacePath),
  };
}

export function listGlobalHistory(limit = 200): GlobalHistoryEntry[] {
  const rows = queryAll(
    'SELECT id, workspace_path, file_path, file_name, content, source, created_at FROM global_history ORDER BY created_at DESC LIMIT ?',
    [limit],
  );
  return rows.map(enrichEntry);
}

export function getGlobalHistory(id: string): GlobalHistoryEntry | null {
  const row = queryOne(
    'SELECT id, workspace_path, file_path, file_name, content, source, created_at FROM global_history WHERE id = ?',
    [id],
  );
  if (!row) return null;
  return enrichEntry(row);
}

export function checkPathExists(targetPath: string): boolean {
  return pathExists(targetPath);
}
