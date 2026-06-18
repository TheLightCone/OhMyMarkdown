import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './services/database';
import { migrateLegacyDataPaths, getSettingsPath } from './services/dataPaths';
import * as fileService from './services/fileService';
import * as versionService from './services/versionService';
import * as globalHistoryService from './services/globalHistoryService';
import * as backupService from './services/backupService';
import * as searchService from './services/searchService';
import * as pluginService from './services/pluginService';
import * as exportService from './services/exportService';

let mainWindow: BrowserWindow | null = null;
let workspacePath = '';

const isDev = !app.isPackaged;

async function createWindow(): Promise<void> {
  migrateLegacyDataPaths();
  await initDatabase();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'OhMyMarkdown',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('#')) {
      return { action: 'deny' };
    }
    if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  createAppMenu();
  registerIpcHandlers();
  setupBackupScheduler();
}

function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开工作区',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-workspace'),
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '搜索',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow?.webContents.send('menu:toggle-search'),
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '插件',
      submenu: [
        {
          label: '插件管理',
          click: () => mainWindow?.webContents.send('menu:plugin-manager'),
        },
        {
          label: '插件 API 文档',
          click: () => mainWindow?.webContents.send('menu:plugin-api-doc'),
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 OhMyMarkdown',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '关于',
              message: 'OhMyMarkdown v1.0.0',
              detail: 'Windows 平台 Markdown 编辑器\n以 Typora 为功能基准，增强文件管理、搜索与插件扩展能力。',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupBackupScheduler(): void {
  backupService.startBackupScheduler(() => {
    if (workspacePath) {
      try {
        backupService.runBackup(workspacePath);
      } catch {
        // ignore
      }
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string, filters: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters,
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('workspace:open', async (_e, dirPath: string) => {
    workspacePath = dirPath;
    backupService.setWorkspaceForBackup(dirPath);
    fileService.indexWorkspace(dirPath);
    return fileService.buildFileTree(dirPath);
  });

  ipcMain.handle('workspace:getPath', () => workspacePath);

  ipcMain.handle('file:tree', (_e, hideArchived?: boolean) => {
    if (!workspacePath) return [];
    return fileService.buildFileTree(workspacePath, hideArchived);
  });

  ipcMain.handle('file:read', (_e, filePath: string) => fileService.readFile(filePath));
  ipcMain.handle('file:write', (_e, filePath: string, content: string, source?: globalHistoryService.GlobalHistorySource) => {
    fileService.writeFile(filePath, content);
    versionService.saveVersion(filePath, content);
    globalHistoryService.recordGlobalHistory({
      workspacePath,
      filePath,
      content,
      source: source ?? 'save',
    });
    fileService.clearRecovery(filePath);
  });

  ipcMain.handle('file:create', (_e, dirPath: string, name: string) => fileService.createFile(dirPath, name));
  ipcMain.handle('file:createDir', (_e, parentPath: string, name: string) =>
    fileService.createDirectory(parentPath, name)
  );
  ipcMain.handle('file:rename', (_e, oldPath: string, newName: string) =>
    fileService.renamePath(oldPath, newName)
  );
  ipcMain.handle('file:move', (_e, sourcePath: string, targetDir: string) =>
    fileService.movePath(sourcePath, targetDir)
  );
  ipcMain.handle('file:copy', (_e, sourcePath: string, targetDir: string) =>
    fileService.copyPath(sourcePath, targetDir)
  );
  ipcMain.handle(
    'file:importAsset',
    (_e, markdownFilePath: string, fileName: string, data: number[]) =>
      fileService.importAsset(markdownFilePath, fileName, Buffer.from(data)),
  );
  ipcMain.handle('file:delete', (_e, targetPath: string) => fileService.deletePath(targetPath));
  ipcMain.handle('file:batchDelete', (_e, paths: string[]) => fileService.batchDelete(paths));
  ipcMain.handle('file:batchMove', (_e, paths: string[], targetDir: string) =>
    fileService.batchMove(paths, targetDir)
  );
  ipcMain.handle('file:batchRename', (_e, renames: { oldPath: string; newName: string }[]) =>
    fileService.batchRename(renames)
  );

  ipcMain.handle('file:meta', (_e, filePath: string, status?: string, tags?: string[]) =>
    fileService.setFileMeta(filePath, status, tags)
  );
  ipcMain.handle('file:getMeta', (_e, filePath: string) => {
    const all = fileService.getAllMeta();
    return all.find((m) => m.filePath === filePath) || { filePath, status: 'in_progress', tags: [] };
  });

  ipcMain.handle('file:recovery', (_e, filePath: string, content: string) =>
    fileService.saveRecovery(filePath, content)
  );
  ipcMain.handle('file:getRecovery', (_e, filePath: string) => fileService.getRecovery(filePath));

  ipcMain.handle('version:list', (_e, filePath: string) => versionService.listVersions(filePath));
  ipcMain.handle('version:get', (_e, versionId: string) => versionService.getVersion(versionId));

  ipcMain.handle('history:listGlobal', (_e, limit?: number) => globalHistoryService.listGlobalHistory(limit));
  ipcMain.handle('history:getGlobal', (_e, id: string) => globalHistoryService.getGlobalHistory(id));
  ipcMain.handle(
    'history:recordEdit',
    (_e, payload: { filePath: string; content: string }) => {
      if (!payload?.filePath) return null;
      return globalHistoryService.recordGlobalHistory({
        workspacePath,
        filePath: payload.filePath,
        content: payload.content,
        source: 'edit',
      });
    },
  );
  ipcMain.handle('history:pathExists', (_e, targetPath: string) =>
    globalHistoryService.checkPathExists(targetPath),
  );

  ipcMain.handle('backup:getConfig', () => backupService.getBackupConfig());
  ipcMain.handle('backup:setConfig', (_e, config: Partial<backupService.BackupConfig>) => {
    const result = backupService.setBackupConfig(config);
    backupService.restartBackupScheduler(() => {
      if (workspacePath) backupService.runBackup(workspacePath);
    });
    return result;
  });
  ipcMain.handle('backup:run', () => backupService.runBackup(workspacePath));

  ipcMain.handle('search:query', (_e, options: searchService.SearchOptions) =>
    searchService.search(options, workspacePath)
  );

  ipcMain.handle('plugin:list', () => pluginService.listPlugins());
  ipcMain.handle('plugin:enable', (_e, id: string, enabled: boolean) =>
    pluginService.setPluginEnabled(id, enabled)
  );
  ipcMain.handle('plugin:config', (_e, id: string, config: Record<string, unknown>) =>
    pluginService.setPluginConfig(id, config)
  );
  ipcMain.handle('plugin:apiDoc', () => pluginService.getPluginApiDoc());
  ipcMain.handle('plugin:dir', () => pluginService.getPluginsDirectory());
  ipcMain.handle('plugin:openDir', async () => {
    const dir = pluginService.getPluginsDirectory();
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  });
  ipcMain.handle('plugin:openApiDoc', () => {
    const doc = pluginService.getPluginApiDoc();
    const child = new BrowserWindow({
      width: 720,
      height: 640,
      title: '插件 API 文档',
      parent: mainWindow ?? undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    const escaped = doc
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>插件 API 文档</title>
<style>body{margin:0;padding:24px;font-family:Consolas,"Courier New",monospace;font-size:14px;line-height:1.6;white-space:pre-wrap;}</style>
</head><body>${escaped}</body></html>`;
    void child.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  ipcMain.handle('export:html', async (_e, content: string, title: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${title}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await exportService.exportToHtml(content, result.filePath, title);
    return result.filePath;
  });

  ipcMain.handle('export:pdf', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath || !mainWindow) return null;
    await exportService.exportToPdf(mainWindow, result.filePath);
    return result.filePath;
  });

  ipcMain.handle('export:word', async (_e, content: string, title: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${title}.doc`,
      filters: [{ name: 'Word', extensions: ['doc'] }],
    });
    if (result.canceled || !result.filePath) return null;
    exportService.exportToWordHtml(content, result.filePath, title);
    return result.filePath;
  });

  ipcMain.handle('export:image', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'document.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath || !mainWindow) return null;
    await exportService.exportToImage(mainWindow, result.filePath);
    return result.filePath;
  });

  ipcMain.handle('settings:get', () => {
    const defaults = { theme: 'light', hideArchived: false, autoSaveInterval: 30, appFontSize: 14, editorFontSize: 16 };
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) };
    }
    return defaults;
  });

  ipcMain.handle('settings:set', (_e, settings: Record<string, unknown>) => {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  });

  ipcMain.handle('shell:openExternal', (_e, rawUrl: string) => {
    const url = String(rawUrl ?? '').trim().replace(/^<|>$/g, '');
    const paren = url.match(/^\(([^)\s]+)/);
    const normalized = paren ? paren[1] : url;
    if (/^https?:\/\//i.test(normalized) || normalized.startsWith('mailto:')) {
      void shell.openExternal(normalized);
    }
  });
}

app.whenReady().then(createWindow).catch((err: Error) => {
  console.error('Failed to start:', err);
  dialog.showErrorBox('启动失败', `OhMyMarkdown 无法启动：\n${err.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  closeDatabase();
  backupService.stopBackupScheduler();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  closeDatabase();
  backupService.stopBackupScheduler();
});
