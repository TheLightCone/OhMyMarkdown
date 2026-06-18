import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let dataRoot = '';

export function getUserDataRoot(): string {
  return app.getPath('userData');
}

/** 应用本地数据统一目录，便于后续同步 */
export function getDataRoot(): string {
  if (!dataRoot) {
    dataRoot = path.join(getUserDataRoot(), 'data');
  }
  if (!fs.existsSync(dataRoot)) {
    fs.mkdirSync(dataRoot, { recursive: true });
  }
  return dataRoot;
}

export function getDatabasePath(): string {
  return path.join(getDataRoot(), 'ohmymarkdown.db');
}

export function getSettingsPath(): string {
  return path.join(getDataRoot(), 'settings.json');
}

export function getPluginsDir(): string {
  const dir = path.join(getDataRoot(), 'plugins');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function copyDirRecursive(source: string, target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to);
    } else if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
    }
  }
}

/** 将旧版散落在 userData 根目录的数据迁移到 data/ */
export function migrateLegacyDataPaths(): void {
  getDataRoot();
  const legacyRoot = getUserDataRoot();

  const fileMigrations: [string, string][] = [
    [path.join(legacyRoot, 'ohmymarkdown.db'), getDatabasePath()],
    [path.join(legacyRoot, 'settings.json'), getSettingsPath()],
  ];

  for (const [legacyPath, nextPath] of fileMigrations) {
    if (fs.existsSync(legacyPath) && !fs.existsSync(nextPath)) {
      fs.renameSync(legacyPath, nextPath);
    }
  }

  const legacyPlugins = path.join(legacyRoot, 'plugins');
  const nextPlugins = getPluginsDir();
  if (fs.existsSync(legacyPlugins) && legacyPlugins !== nextPlugins) {
    copyDirRecursive(legacyPlugins, nextPlugins);
  }
}
