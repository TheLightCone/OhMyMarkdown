import fs from 'fs';
import path from 'path';
import { queryOne, runSql } from './database';

export interface BackupConfig {
  enabled: boolean;
  intervalMinutes: number;
  backupPath: string;
}

let backupTimer: NodeJS.Timeout | null = null;
let currentWorkspace = '';

export function getBackupConfig(): BackupConfig {
  const row = queryOne('SELECT enabled, interval_minutes, backup_path FROM backup_config WHERE id = 1');
  if (row) {
    return {
      enabled: Boolean(row[0]),
      intervalMinutes: (row[1] as number) || 30,
      backupPath: (row[2] as string) || '',
    };
  }
  return { enabled: true, intervalMinutes: 30, backupPath: '' };
}

export function setBackupConfig(config: Partial<BackupConfig>): BackupConfig {
  const current = getBackupConfig();
  const updated = { ...current, ...config };
  runSql(
    'INSERT OR REPLACE INTO backup_config (id, enabled, interval_minutes, backup_path) VALUES (1, ?, ?, ?)',
    [updated.enabled ? 1 : 0, updated.intervalMinutes, updated.backupPath]
  );
  return updated;
}

export function setWorkspaceForBackup(workspacePath: string): void {
  currentWorkspace = workspacePath;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function runBackup(workspacePath?: string): string {
  const ws = workspacePath || currentWorkspace;
  if (!ws || !fs.existsSync(ws)) throw new Error('未打开工作区');

  const config = getBackupConfig();
  const backupRoot = config.backupPath || path.join(path.dirname(ws), '.ohmymarkdown-backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupRoot, path.basename(ws), timestamp);

  copyDir(ws, dest);
  return dest;
}

export function startBackupScheduler(onBackup: () => void): void {
  stopBackupScheduler();
  const config = getBackupConfig();
  if (!config.enabled) return;

  backupTimer = setInterval(() => {
    try {
      onBackup();
    } catch {
      // ignore backup errors
    }
  }, config.intervalMinutes * 60 * 1000);
}

export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

export function restartBackupScheduler(onBackup: () => void): void {
  stopBackupScheduler();
  startBackupScheduler(onBackup);
}
