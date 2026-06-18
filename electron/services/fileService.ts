import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, persistDatabase, queryOne, queryAll, runSql } from './database';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  status?: string;
}

export interface FileMeta {
  filePath: string;
  status: 'in_progress' | 'completed' | 'archived';
  tags: string[];
}

const MARKDOWN_EXT = ['.md', '.markdown', '.mdown', '.mkd'];

function isMarkdown(filePath: string): boolean {
  return MARKDOWN_EXT.includes(path.extname(filePath).toLowerCase());
}

function getMeta(filePath: string): FileMeta {
  const row = queryOne('SELECT status, tags FROM file_meta WHERE file_path = ?', [filePath]);
  if (row) {
    return {
      filePath,
      status: (row[0] as FileMeta['status']) || 'in_progress',
      tags: JSON.parse((row[1] as string) || '[]'),
    };
  }
  return { filePath, status: 'in_progress', tags: [] };
}

export function setFileMeta(filePath: string, status?: string, tags?: string[]): FileMeta {
  const existing = getMeta(filePath);
  const newStatus = status || existing.status;
  const newTags = tags !== undefined ? tags : existing.tags;
  runSql(
    'INSERT OR REPLACE INTO file_meta (file_path, status, tags, updated_at) VALUES (?, ?, ?, ?)',
    [filePath, newStatus, JSON.stringify(newTags), Date.now()]
  );
  indexFile(filePath);
  return { filePath, status: newStatus as FileMeta['status'], tags: newTags };
}

export function indexFile(filePath: string): void {
  if (!fs.existsSync(filePath) || !isMarkdown(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const meta = getMeta(filePath);
  const fileName = path.basename(filePath);
  const now = Date.now();

  runSql('DELETE FROM search_index WHERE file_path = ?', [filePath]);
  runSql(
    'INSERT INTO search_index (file_path, file_name, content, status, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [filePath, fileName, content, meta.status, JSON.stringify(meta.tags), now]
  );
}

export function indexWorkspace(workspacePath: string): void {
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isMarkdown(fullPath)) {
        indexFile(fullPath);
      }
    }
  }
  walk(workspacePath);
}

export function buildFileTree(dirPath: string, hideArchived = false): FileNode[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const children = buildFileTree(fullPath, hideArchived);
      nodes.push({ name: entry.name, path: fullPath, isDirectory: true, children });
    } else if (isMarkdown(fullPath)) {
      const meta = getMeta(fullPath);
      if (hideArchived && meta.status === 'archived') continue;
      nodes.push({ name: entry.name, path: fullPath, isDirectory: false, status: meta.status });
    }
  }

  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
  indexFile(filePath);
}

export function createFile(dirPath: string, name: string): string {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(dirPath, fileName);
  if (fs.existsSync(filePath)) throw new Error('文件已存在');
  fs.writeFileSync(filePath, `# ${path.basename(fileName, '.md')}\n\n`, 'utf-8');
  indexFile(filePath);
  return filePath;
}

export function createDirectory(parentPath: string, name: string): string {
  const dirPath = path.join(parentPath, name);
  if (fs.existsSync(dirPath)) throw new Error('文件夹已存在');
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function renamePath(oldPath: string, newName: string): string {
  const dir = path.dirname(oldPath);
  const newPath = path.join(dir, newName);
  if (fs.existsSync(newPath)) throw new Error('目标名称已存在');
  fs.renameSync(oldPath, newPath);

  runSql('UPDATE file_meta SET file_path = ? WHERE file_path = ?', [newPath, oldPath]);
  runSql('UPDATE search_index SET file_path = ? WHERE file_path = ?', [newPath, oldPath]);
  runSql('UPDATE version_history SET file_path = ? WHERE file_path = ?', [newPath, oldPath]);
  runSql('UPDATE global_history SET file_path = ?, file_name = ? WHERE file_path = ?', [
    newPath,
    path.basename(newPath),
    oldPath,
  ]);
  indexFile(newPath);
  return newPath;
}

export function movePath(sourcePath: string, targetDir: string): string {
  const newPath = path.join(targetDir, path.basename(sourcePath));
  if (fs.existsSync(newPath)) throw new Error('目标位置已存在同名文件');
  fs.renameSync(sourcePath, newPath);

  runSql('UPDATE file_meta SET file_path = ? WHERE file_path = ?', [newPath, sourcePath]);
  runSql('UPDATE search_index SET file_path = ? WHERE file_path = ?', [newPath, sourcePath]);
  runSql('UPDATE version_history SET file_path = ? WHERE file_path = ?', [newPath, sourcePath]);
  runSql('UPDATE global_history SET file_path = ?, file_name = ? WHERE file_path = ?', [
    newPath,
    path.basename(newPath),
    sourcePath,
  ]);
  indexFile(newPath);
  return newPath;
}

export function importAsset(
  markdownFilePath: string,
  fileName: string,
  data: Buffer | Uint8Array,
): string {
  const dir = path.dirname(markdownFilePath);
  const safeName = path.basename(fileName).replace(/[<>:"|?*]/g, '_');
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  let targetPath = path.join(dir, safeName);
  let counter = 1;

  while (fs.existsSync(targetPath)) {
    targetPath = path.join(dir, `${base}-${counter}${ext}`);
    counter += 1;
  }

  fs.writeFileSync(targetPath, data);
  return path.relative(dir, targetPath).split(path.sep).join('/');
}

export function copyPath(sourcePath: string, targetDir: string): string {
  const newPath = path.join(targetDir, path.basename(sourcePath));
  let finalPath = newPath;
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    const ext = path.extname(newPath);
    const base = path.basename(newPath, ext);
    finalPath = path.join(targetDir, `${base}_copy${counter}${ext}`);
    counter++;
  }
  fs.copyFileSync(sourcePath, finalPath);
  indexFile(finalPath);
  return finalPath;
}

export function deletePath(targetPath: string): void {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
    runSql('DELETE FROM file_meta WHERE file_path = ?', [targetPath]);
    runSql('DELETE FROM search_index WHERE file_path = ?', [targetPath]);
  }
}

export function batchDelete(paths: string[]): void {
  for (const p of paths) deletePath(p);
}

export function batchMove(paths: string[], targetDir: string): string[] {
  return paths.map((p) => movePath(p, targetDir));
}

export function batchRename(renames: { oldPath: string; newName: string }[]): string[] {
  return renames.map(({ oldPath, newName }) => renamePath(oldPath, newName));
}

export function saveRecovery(filePath: string, content: string): void {
  runSql('DELETE FROM recovery WHERE file_path = ?', [filePath]);
  getDatabase().run('INSERT INTO recovery (id, file_path, content, saved_at) VALUES (?, ?, ?, ?)', [
    uuidv4(),
    filePath,
    content,
    Date.now(),
  ]);
  persistDatabase();
}

export function getRecovery(filePath: string): { content: string; savedAt: number } | null {
  const row = queryOne('SELECT content, saved_at FROM recovery WHERE file_path = ?', [filePath]);
  if (row) {
    return { content: row[0] as string, savedAt: row[1] as number };
  }
  return null;
}

export function clearRecovery(filePath: string): void {
  runSql('DELETE FROM recovery WHERE file_path = ?', [filePath]);
}

export function getAllMeta(): FileMeta[] {
  const rows = queryAll('SELECT file_path, status, tags FROM file_meta');
  return rows.map(([filePath, status, tags]) => ({
    filePath: filePath as string,
    status: (status as FileMeta['status']) || 'in_progress',
    tags: JSON.parse((tags as string) || '[]'),
  }));
}
