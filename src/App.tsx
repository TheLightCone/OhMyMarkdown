import { useEffect, useCallback, useRef } from 'react';
import { collapseTyporaSyntax } from './utils/markdownSyntax';
import { openPluginApiDoc } from './utils/pluginApiDoc';
import { useAppStore } from './stores/appStore';
import Toolbar from './components/Toolbar/Toolbar';
import FileTree from './components/FileTree/FileTree';
import OutlinePanel from './components/Outline/OutlinePanel';
import EditorPanel from './components/Editor/EditorPanel';
import SearchPanel from './components/Search/SearchPanel';
import GlobalHistoryModal from './components/VersionHistory/GlobalHistoryModal';
import FileVersionHistoryModal from './components/VersionHistory/FileVersionHistoryModal';
import PluginManager from './components/PluginManager/PluginManager';
import SettingsPanel from './components/Settings/SettingsPanel';
import type { GlobalHistoryEntry, SearchResult } from './types';

export default function App() {
  const {
    workspacePath,
    setWorkspacePath,
    setFileTree,
    currentFile,
    currentContent,
    setCurrentFile,
    setCurrentContent,
    setIsDirty,
    isDirty,
    settings,
    setSettings,
    showSearch,
    leftSidebarWidth,
    rightSidebarWidth,
    showLeftSidebar,
    showRightSidebar,
  } = useAppStore();

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const recoveryTimer = useRef<NodeJS.Timeout | null>(null);
  const editHistoryTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRecordedEdit = useRef('');

  useEffect(() => {
    window.electronAPI.settings.get().then((loaded) => {
      setSettings({
        theme: loaded.theme ?? 'light',
        hideArchived: loaded.hideArchived ?? false,
        autoSaveInterval: loaded.autoSaveInterval ?? 30,
        appFontSize: loaded.appFontSize ?? 14,
        editorFontSize: loaded.editorFontSize ?? 16,
      });
    });
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${settings.appFontSize}px`);
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
  }, [settings.appFontSize, settings.editorFontSize]);

  const refreshFileTree = useCallback(async () => {
    const tree = await window.electronAPI.file.tree(settings.hideArchived);
    setFileTree(tree);
  }, [settings.hideArchived, setFileTree]);

  const openWorkspace = useCallback(async () => {
    const dir = await window.electronAPI.dialog.openDirectory();
    if (dir) {
      const tree = await window.electronAPI.workspace.open(dir);
      setWorkspacePath(dir);
      setFileTree(tree);
    }
  }, [setWorkspacePath, setFileTree]);

  const openFile = useCallback(async (filePath: string) => {
    if (isDirty && currentFile) {
      const save = confirm('当前文件有未保存的更改，是否保存？');
      if (save) {
        await window.electronAPI.file.write(currentFile, collapseTyporaSyntax(currentContent), 'save');
        setIsDirty(false);
      }
    }

    const recovery = await window.electronAPI.file.getRecovery(filePath);
    const content = await window.electronAPI.file.read(filePath);

    if (recovery && recovery.content !== content) {
      const useRecovery = confirm(
        `检测到未保存的恢复内容（${new Date(recovery.savedAt).toLocaleString()}），是否恢复？`
      );
      if (useRecovery) {
        setCurrentFile(filePath);
        setCurrentContent(recovery.content);
        setIsDirty(true);
        return;
      }
    }

    setCurrentFile(filePath);
    setCurrentContent(content);
    setIsDirty(false);
  }, [isDirty, currentFile, currentContent, setCurrentFile, setCurrentContent, setIsDirty]);

  const saveFile = useCallback(async () => {
    if (!currentFile) return;
    await window.electronAPI.file.write(currentFile, collapseTyporaSyntax(currentContent), 'save');
    setIsDirty(false);
  }, [currentFile, currentContent, setIsDirty]);

  const handleContentChange = useCallback((content: string) => {
    setCurrentContent(content);
    setIsDirty(true);
  }, [setCurrentContent, setIsDirty]);

  useEffect(() => {
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    if (currentFile && settings.autoSaveInterval > 0) {
      autoSaveTimer.current = setInterval(() => {
        if (isDirty && currentFile) {
          window.electronAPI.file.write(currentFile, collapseTyporaSyntax(currentContent), 'autosave');
          setIsDirty(false);
        }
      }, settings.autoSaveInterval * 1000);
    }
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [currentFile, currentContent, isDirty, settings.autoSaveInterval, setIsDirty]);

  useEffect(() => {
    if (recoveryTimer.current) clearInterval(recoveryTimer.current);
    if (currentFile) {
      recoveryTimer.current = setInterval(() => {
        if (isDirty) {
          window.electronAPI.file.saveRecovery(currentFile, currentContent);
        }
      }, 10000);
    }
    return () => { if (recoveryTimer.current) clearInterval(recoveryTimer.current); };
  }, [currentFile, currentContent, isDirty]);

  useEffect(() => {
    lastRecordedEdit.current = '';
    if (editHistoryTimer.current) clearTimeout(editHistoryTimer.current);
  }, [currentFile]);

  useEffect(() => {
    if (!currentFile || !isDirty) return;

    if (editHistoryTimer.current) clearTimeout(editHistoryTimer.current);
    editHistoryTimer.current = setTimeout(() => {
      const content = collapseTyporaSyntax(currentContent);
      if (!content || content === lastRecordedEdit.current) return;
      lastRecordedEdit.current = content;
      void window.electronAPI.history.recordEdit({ filePath: currentFile, content });
    }, 60000);

    return () => {
      if (editHistoryTimer.current) clearTimeout(editHistoryTimer.current);
    };
  }, [currentFile, currentContent, isDirty]);

  useEffect(() => {
    const handlers: [string, () => void][] = [
      ['menu:open-workspace', openWorkspace],
      ['menu:save', saveFile],
      ['menu:toggle-search', () => useAppStore.getState().setShowSearch(!useAppStore.getState().showSearch)],
      ['menu:plugin-manager', () => useAppStore.getState().setShowPluginManager(true)],
      ['menu:plugin-api-doc', openPluginApiDoc],
    ];

    handlers.forEach(([channel, handler]) => window.electronAPI.on(channel, handler));
    return () => handlers.forEach(([channel]) => window.electronAPI.removeAllListeners(channel));
  }, [openWorkspace, saveFile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  const handleExport = async (type: string) => {
    if (!currentFile) { alert('请先打开一个文件'); return; }
    const title = currentFile.split(/[/\\]/).pop()?.replace(/\.\w+$/, '') || 'document';
    try {
      let result: string | null = null;
      switch (type) {
        case 'html': result = await window.electronAPI.export.html(currentContent, title); break;
        case 'pdf': result = await window.electronAPI.export.pdf(); break;
        case 'word': result = await window.electronAPI.export.word(currentContent, title); break;
        case 'image': result = await window.electronAPI.export.image(); break;
      }
      if (result) alert(`导出成功：${result}`);
    } catch (e) {
      alert(`导出失败：${(e as Error).message}`);
    }
  };

  const toggleTheme = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light';
    const newSettings = { ...settings, theme: newTheme };
    setSettings(newSettings);
    window.electronAPI.settings.set(newSettings);
  };

  const handleSearchResultClick = (result: SearchResult) => {
    openFile(result.filePath);
    if (result.lineNumber) {
      setTimeout(() => {
        const jumpFn = (window as unknown as { __jumpToLine?: (line: number) => void }).__jumpToLine;
        if (jumpFn) jumpFn(result.lineNumber! - 1);
      }, 300);
    }
  };

  const handleJumpToHeading = (index: number) => {
    const handler = useAppStore.getState().outlineJumpHandler;
    if (handler) {
      handler(index);
      return;
    }
    const jumpFn = (window as unknown as { __jumpToHeading?: (index: number) => void }).__jumpToHeading;
    jumpFn?.(index);
  };

  const applyHistoryContent = useCallback(async (filePath: string, content: string) => {
    const exists = await window.electronAPI.history.pathExists(filePath);
    if (exists && filePath !== currentFile) {
      if (isDirty && currentFile) {
        const save = confirm('当前文件有未保存的更改，是否保存？');
        if (save) {
          await window.electronAPI.file.write(currentFile, collapseTyporaSyntax(currentContent), 'save');
        }
      }
      setCurrentFile(filePath);
    }
    setCurrentContent(content);
    setIsDirty(true);
  }, [currentFile, currentContent, isDirty, setCurrentFile, setCurrentContent, setIsDirty]);

  const handleGlobalApply = useCallback(async (entry: GlobalHistoryEntry, content: string) => {
    await applyHistoryContent(entry.filePath, content);
  }, [applyHistoryContent]);

  const handleFileVersionRollback = useCallback(async (filePath: string, content: string) => {
    await applyHistoryContent(filePath, content);
  }, [applyHistoryContent]);

  const wordCount = (currentContent ?? '').replace(/\s/g, '').length;

  return (
    <div className="app-layout">
      <Toolbar onOpenWorkspace={openWorkspace} onSave={saveFile} onExport={handleExport} onToggleTheme={toggleTheme} />
      {!workspacePath ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <h2>欢迎使用 OhMyMarkdown</h2>
          <p>一款以 Typora 为功能基准的 Windows Markdown 编辑器，增强文件管理、搜索与插件扩展能力。</p>
          <button className="btn btn-primary" style={{ padding: '8px 24px', fontSize: 15 }} onClick={openWorkspace}>
            打开工作区
          </button>
        </div>
      ) : (
        <>
          <div className="app-body">
            {showLeftSidebar && (
              <div className="sidebar sidebar-left" style={{ width: leftSidebarWidth }}>
                <FileTree onFileOpen={openFile} onRefresh={refreshFileTree} />
              </div>
            )}

            <div className="main-content" style={{ position: 'relative' }}>
              <EditorPanel onContentChange={handleContentChange} />
              {showSearch && <SearchPanel onResultClick={handleSearchResultClick} />}
            </div>

            {showRightSidebar && (
              <div className="sidebar sidebar-right" style={{ width: rightSidebarWidth }}>
                <OutlinePanel onJumpToHeading={handleJumpToHeading} />
              </div>
            )}
          </div>

          <div className="status-bar">
            <span>{currentFile ? currentFile : '未打开文件'}</span>
            <span>{isDirty ? '● 未保存' : '已保存'} · {wordCount} 字</span>
          </div>
        </>
      )}

      <GlobalHistoryModal onApplyContent={handleGlobalApply} />
      <FileVersionHistoryModal onRollback={handleFileVersionRollback} />
      <PluginManager />
      <SettingsPanel />
    </div>
  );
}
