import { create } from 'zustand';
import { parseOutlineFromMarkdown } from '../utils/markdownSyntax';
import type { FileNode, AppSettings, OutlineItem, SearchResult, PluginInfo, VersionSnapshot } from '../types';

interface AppState {
  workspacePath: string;
  fileTree: FileNode[];
  currentFile: string | null;
  currentContent: string;
  isDirty: boolean;
  settings: AppSettings;
  outline: OutlineItem[];
  outlineJumpHandler: ((index: number) => void) | null;
  showSearch: boolean;
  showPluginManager: boolean;
  showVersionHistory: boolean;
  showFileVersionHistory: boolean;
  fileVersionHistoryPath: string | null;
  showSettings: boolean;
  searchResults: SearchResult[];
  plugins: PluginInfo[];
  versions: VersionSnapshot[];
  activeOutlineIndex: number | null;
  selectedFiles: string[];
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  showLeftSidebar: boolean;
  showRightSidebar: boolean;

  setWorkspacePath: (path: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  setCurrentFile: (path: string | null) => void;
  setCurrentContent: (content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setSettings: (settings: AppSettings) => void;
  setOutline: (outline: OutlineItem[]) => void;
  registerOutlineJumpHandler: (handler: ((index: number) => void) | null) => void;
  setShowSearch: (show: boolean) => void;
  setShowPluginManager: (show: boolean) => void;
  setShowVersionHistory: (show: boolean) => void;
  setShowFileVersionHistory: (show: boolean) => void;
  setFileVersionHistoryPath: (path: string | null) => void;
  setShowSettings: (show: boolean) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setPlugins: (plugins: PluginInfo[]) => void;
  setVersions: (versions: VersionSnapshot[]) => void;
  setActiveOutlineIndex: (index: number | null) => void;
  toggleFileSelection: (path: string) => void;
  clearFileSelection: () => void;
  setSelectedFiles: (paths: string[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  workspacePath: '',
  fileTree: [],
  currentFile: null,
  currentContent: '',
  isDirty: false,
  settings: { theme: 'light', hideArchived: false, autoSaveInterval: 30, appFontSize: 14, editorFontSize: 16 },
  outline: [],
  outlineJumpHandler: null,
  showSearch: false,
  showPluginManager: false,
  showVersionHistory: false,
  showFileVersionHistory: false,
  fileVersionHistoryPath: null,
  showSettings: false,
  searchResults: [],
  plugins: [],
  versions: [],
  activeOutlineIndex: null,
  selectedFiles: [],
  leftSidebarWidth: 260,
  rightSidebarWidth: 240,
  showLeftSidebar: true,
  showRightSidebar: true,

  setWorkspacePath: (path) => set({ workspacePath: path }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setCurrentFile: (path) => set({ currentFile: path }),
  setCurrentContent: (content) => set({ currentContent: content }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setSettings: (settings) => set({ settings }),
  setOutline: (outline) => set({ outline }),
  registerOutlineJumpHandler: (handler) => set({ outlineJumpHandler: handler }),
  setShowSearch: (show) => set({ showSearch: show }),
  setShowPluginManager: (show) => set({ showPluginManager: show }),
  setShowVersionHistory: (show) => set({ showVersionHistory: show }),
  setShowFileVersionHistory: (show) => set({ showFileVersionHistory: show }),
  setFileVersionHistoryPath: (path) => set({ fileVersionHistoryPath: path }),
  setShowSettings: (show) => set({ showSettings: show }),
  setSearchResults: (results) => set({ searchResults: results }),
  setPlugins: (plugins) => set({ plugins }),
  setVersions: (versions) => set({ versions }),
  setActiveOutlineIndex: (index) => set({ activeOutlineIndex: index }),
  toggleFileSelection: (path) =>
    set((state) => ({
      selectedFiles: state.selectedFiles.includes(path)
        ? state.selectedFiles.filter((p) => p !== path)
        : [...state.selectedFiles, path],
    })),
  clearFileSelection: () => set({ selectedFiles: [] }),
  setSelectedFiles: (paths) => set({ selectedFiles: paths }),
}));

/** @deprecated 使用 parseOutlineFromMarkdown */
export function parseOutline(content: string): OutlineItem[] {
  return parseOutlineFromMarkdown(content);
}
