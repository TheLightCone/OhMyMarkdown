import { v4 as uuidv4 } from 'uuid';
import { getDatabase, persistDatabase, queryOne, queryAll, runSql } from './database';

export interface VersionSnapshot {
  id: string;
  filePath: string;
  content: string;
  createdAt: number;
}

const MAX_VERSIONS_PER_FILE = 50;

export function saveVersion(filePath: string, content: string): VersionSnapshot {
  const id = uuidv4();
  const createdAt = Date.now();

  getDatabase().run('INSERT INTO version_history (id, file_path, content, created_at) VALUES (?, ?, ?, ?)', [
    id,
    filePath,
    content,
    createdAt,
  ]);

  const countRow = queryOne('SELECT COUNT(*) FROM version_history WHERE file_path = ?', [filePath]);
  const count = (countRow?.[0] as number) || 0;
  if (count > MAX_VERSIONS_PER_FILE) {
    const oldVersions = queryAll(
      'SELECT id FROM version_history WHERE file_path = ? ORDER BY created_at ASC LIMIT ?',
      [filePath, count - MAX_VERSIONS_PER_FILE]
    );
    for (const [oldId] of oldVersions) {
      runSql('DELETE FROM version_history WHERE id = ?', [oldId]);
    }
  }

  persistDatabase();
  return { id, filePath, content, createdAt };
}

export function listVersions(filePath: string): VersionSnapshot[] {
  const rows = queryAll(
    'SELECT id, file_path, content, created_at FROM version_history WHERE file_path = ? ORDER BY created_at DESC',
    [filePath]
  );
  return rows.map(([id, fp, content, createdAt]) => ({
    id: id as string,
    filePath: fp as string,
    content: content as string,
    createdAt: createdAt as number,
  }));
}

export function getVersion(versionId: string): VersionSnapshot | null {
  const row = queryOne(
    'SELECT id, file_path, content, created_at FROM version_history WHERE id = ?',
    [versionId]
  );
  if (!row) return null;
  return {
    id: row[0] as string,
    filePath: row[1] as string,
    content: row[2] as string,
    createdAt: row[3] as number,
  };
}
