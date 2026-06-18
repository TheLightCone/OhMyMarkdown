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

export interface VersionSnapshot {
  id: string;
  filePath: string;
  content: string;
  createdAt: number;
}

export interface GlobalHistoryEntry {
  id: string;
  workspacePath: string;
  filePath: string;
  fileName: string;
  content: string;
  source: 'save' | 'autosave' | 'edit';
  createdAt: number;
  fileExists: boolean;
  workspaceExists: boolean;
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  lineNumber?: number;
  snippet: string;
  matchType: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description?: string;
}

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  index: number;
  id: string;
  slug: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  hideArchived: boolean;
  autoSaveInterval: number;
  appFontSize: number;
  editorFontSize: number;
}

declare global {
  interface Window {
    electronAPI: {
      dialog: {
        openDirectory: () => Promise<string | null>;
        saveFile: (defaultName: string, filters: Electron.FileFilter[]) => Promise<string | null>;
      };
      workspace: {
        open: (dirPath: string) => Promise<FileNode[]>;
        getPath: () => Promise<string>;
      };
      file: {
        tree: (hideArchived?: boolean) => Promise<FileNode[]>;
        read: (filePath: string) => Promise<string>;
        write: (filePath: string, content: string, source?: 'save' | 'autosave') => Promise<void>;
        create: (dirPath: string, name: string) => Promise<string>;
        createDir: (parentPath: string, name: string) => Promise<string>;
        rename: (oldPath: string, newName: string) => Promise<string>;
        move: (sourcePath: string, targetDir: string) => Promise<string>;
        copy: (sourcePath: string, targetDir: string) => Promise<string>;
        importAsset: (markdownFilePath: string, fileName: string, data: number[]) => Promise<string>;
        delete: (targetPath: string) => Promise<void>;
        batchDelete: (paths: string[]) => Promise<void>;
        batchMove: (paths: string[], targetDir: string) => Promise<string[]>;
        batchRename: (renames: { oldPath: string; newName: string }[]) => Promise<string[]>;
        setMeta: (filePath: string, status?: string, tags?: string[]) => Promise<FileMeta>;
        getMeta: (filePath: string) => Promise<FileMeta>;
        saveRecovery: (filePath: string, content: string) => Promise<void>;
        getRecovery: (filePath: string) => Promise<{ content: string; savedAt: number } | null>;
      };
      version: {
        list: (filePath: string) => Promise<VersionSnapshot[]>;
        get: (versionId: string) => Promise<VersionSnapshot | null>;
      };
      history: {
        listGlobal: (limit?: number) => Promise<GlobalHistoryEntry[]>;
        getGlobal: (id: string) => Promise<GlobalHistoryEntry | null>;
        recordEdit: (payload: { filePath: string; content: string }) => Promise<GlobalHistoryEntry | null>;
        pathExists: (targetPath: string) => Promise<boolean>;
      };
      backup: {
        getConfig: () => Promise<{ enabled: boolean; intervalMinutes: number; backupPath: string }>;
        setConfig: (config: Record<string, unknown>) => Promise<unknown>;
        run: () => Promise<string>;
      };
      search: {
        query: (options: Record<string, unknown>) => Promise<SearchResult[]>;
      };
      plugin: {
        list: () => Promise<PluginInfo[]>;
        enable: (id: string, enabled: boolean) => Promise<void>;
        setConfig: (id: string, config: Record<string, unknown>) => Promise<void>;
        getApiDoc: () => Promise<string>;
        getDir: () => Promise<string>;
        openDir: () => Promise<void>;
        openApiDoc: () => Promise<void>;
      };
      export: {
        html: (content: string, title: string) => Promise<string | null>;
        pdf: () => Promise<string | null>;
        word: (content: string, title: string) => Promise<string | null>;
        image: () => Promise<string | null>;
      };
      settings: {
        get: () => Promise<AppSettings>;
        set: (settings: AppSettings) => Promise<void>;
      };
      openExternal: (url: string) => Promise<void>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export {};
