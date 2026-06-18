import { contextBridge, ipcRenderer } from 'electron';

const api = {
  dialog: {
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (defaultName: string, filters: Electron.FileFilter[]): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFile', defaultName, filters),
  },
  workspace: {
    open: (dirPath: string) => ipcRenderer.invoke('workspace:open', dirPath),
    getPath: () => ipcRenderer.invoke('workspace:getPath') as Promise<string>,
  },
  file: {
    tree: (hideArchived?: boolean) => ipcRenderer.invoke('file:tree', hideArchived),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath) as Promise<string>,
    write: (filePath: string, content: string, source?: 'save' | 'autosave') =>
      ipcRenderer.invoke('file:write', filePath, content, source),
    create: (dirPath: string, name: string) => ipcRenderer.invoke('file:create', dirPath, name),
    createDir: (parentPath: string, name: string) => ipcRenderer.invoke('file:createDir', parentPath, name),
    rename: (oldPath: string, newName: string) => ipcRenderer.invoke('file:rename', oldPath, newName),
    move: (sourcePath: string, targetDir: string) => ipcRenderer.invoke('file:move', sourcePath, targetDir),
    copy: (sourcePath: string, targetDir: string) => ipcRenderer.invoke('file:copy', sourcePath, targetDir),
    importAsset: (markdownFilePath: string, fileName: string, data: number[]) =>
      ipcRenderer.invoke('file:importAsset', markdownFilePath, fileName, data) as Promise<string>,
    delete: (targetPath: string) => ipcRenderer.invoke('file:delete', targetPath),
    batchDelete: (paths: string[]) => ipcRenderer.invoke('file:batchDelete', paths),
    batchMove: (paths: string[], targetDir: string) => ipcRenderer.invoke('file:batchMove', paths, targetDir),
    batchRename: (renames: { oldPath: string; newName: string }[]) =>
      ipcRenderer.invoke('file:batchRename', renames),
    setMeta: (filePath: string, status?: string, tags?: string[]) =>
      ipcRenderer.invoke('file:meta', filePath, status, tags),
    getMeta: (filePath: string) => ipcRenderer.invoke('file:getMeta', filePath),
    saveRecovery: (filePath: string, content: string) => ipcRenderer.invoke('file:recovery', filePath, content),
    getRecovery: (filePath: string) => ipcRenderer.invoke('file:getRecovery', filePath),
  },
  version: {
    list: (filePath: string) => ipcRenderer.invoke('version:list', filePath),
    get: (versionId: string) => ipcRenderer.invoke('version:get', versionId),
  },
  history: {
    listGlobal: (limit?: number) => ipcRenderer.invoke('history:listGlobal', limit),
    getGlobal: (id: string) => ipcRenderer.invoke('history:getGlobal', id),
    recordEdit: (payload: { filePath: string; content: string }) =>
      ipcRenderer.invoke('history:recordEdit', payload),
    pathExists: (targetPath: string) => ipcRenderer.invoke('history:pathExists', targetPath) as Promise<boolean>,
  },
  backup: {
    getConfig: () => ipcRenderer.invoke('backup:getConfig'),
    setConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('backup:setConfig', config),
    run: () => ipcRenderer.invoke('backup:run'),
  },
  search: {
    query: (options: Record<string, unknown>) => ipcRenderer.invoke('search:query', options),
  },
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    enable: (id: string, enabled: boolean) => ipcRenderer.invoke('plugin:enable', id, enabled),
    setConfig: (id: string, config: Record<string, unknown>) => ipcRenderer.invoke('plugin:config', id, config),
    getApiDoc: () => ipcRenderer.invoke('plugin:apiDoc') as Promise<string>,
    getDir: () => ipcRenderer.invoke('plugin:dir') as Promise<string>,
    openDir: () => ipcRenderer.invoke('plugin:openDir') as Promise<void>,
    openApiDoc: () => ipcRenderer.invoke('plugin:openApiDoc') as Promise<void>,
  },
  export: {
    html: (content: string, title: string) => ipcRenderer.invoke('export:html', content, title),
    pdf: () => ipcRenderer.invoke('export:pdf'),
    word: (content: string, title: string) => ipcRenderer.invoke('export:word', content, title),
    image: () => ipcRenderer.invoke('export:image'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:set', settings),
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'menu:open-workspace',
      'menu:save',
      'menu:toggle-search',
      'menu:plugin-manager',
      'menu:plugin-api-doc',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
