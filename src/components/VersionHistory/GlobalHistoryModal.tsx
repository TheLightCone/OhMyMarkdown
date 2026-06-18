import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { GlobalHistoryEntry } from '../../types';
import HistoryViewer, { type HistoryViewerItem } from './HistoryViewer';
import './VersionHistory.css';

const SOURCE_LABEL: Record<GlobalHistoryEntry['source'], string> = {
  save: '保存',
  autosave: '自动保存',
  edit: '编辑快照',
};

interface GlobalHistoryFileGroup {
  filePath: string;
  displayName: string;
  pathHint: string;
  fileExists: boolean;
  workspaceExists: boolean;
  latestAt: number;
  count: number;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function groupByFile(entries: GlobalHistoryEntry[]): GlobalHistoryFileGroup[] {
  const map = new Map<string, GlobalHistoryFileGroup>();

  for (const entry of entries) {
    const existing = map.get(entry.filePath);
    if (!existing) {
      map.set(entry.filePath, {
        filePath: entry.filePath,
        displayName: entry.fileExists ? basename(entry.filePath) : `${entry.fileName}（已删除）`,
        pathHint: entry.filePath,
        fileExists: entry.fileExists,
        workspaceExists: entry.workspaceExists,
        latestAt: entry.createdAt,
        count: 1,
      });
      continue;
    }

    existing.count += 1;
    existing.latestAt = Math.max(existing.latestAt, entry.createdAt);
    existing.fileExists = entry.fileExists;
    existing.workspaceExists = entry.workspaceExists;
    if (entry.fileExists) {
      existing.displayName = basename(entry.filePath);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
}

function mapFileEntries(entries: GlobalHistoryEntry[], filePath: string): HistoryViewerItem[] {
  return entries
    .filter((entry) => entry.filePath === filePath)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      content: entry.content,
      meta: SOURCE_LABEL[entry.source],
      warning:
        !entry.fileExists || (entry.workspacePath && !entry.workspaceExists)
          ? [
              !entry.fileExists ? '原文件已不存在' : '',
              entry.workspacePath && !entry.workspaceExists ? '原工作区已不存在' : '',
            ]
              .filter(Boolean)
              .join('；')
          : undefined,
    }));
}

interface GlobalHistoryModalProps {
  onApplyContent: (entry: GlobalHistoryEntry, content: string) => void | Promise<void>;
}

export default function GlobalHistoryModal({ onApplyContent }: GlobalHistoryModalProps) {
  const { showVersionHistory, setShowVersionHistory, currentFile } = useAppStore();
  const [entries, setEntries] = useState<GlobalHistoryEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (showVersionHistory) {
      window.electronAPI.history.listGlobal().then((loaded) => {
        setEntries(loaded);
        const groups = groupByFile(loaded);
        const defaultPath =
          (currentFile && groups.some((group) => group.filePath === currentFile) && currentFile) ||
          groups[0]?.filePath ||
          null;
        setSelectedFilePath(defaultPath);
      });
    }
  }, [showVersionHistory, currentFile]);

  const fileGroups = useMemo(() => groupByFile(entries), [entries]);
  const selectedGroup = fileGroups.find((group) => group.filePath === selectedFilePath) ?? null;
  const selectedItems = selectedFilePath ? mapFileEntries(entries, selectedFilePath) : [];

  if (!showVersionHistory) return null;

  const handleRollback = async (item: HistoryViewerItem) => {
    const entry = entries.find((e) => e.id === item.id);
    if (!entry) return;

    let message = '确定将此历史版本应用到编辑器？当前未保存的更改将丢失。';
    if (!entry.fileExists) {
      message = '原文件已不存在。内容将应用到当前编辑器，您可手动另存为新文件。是否继续？';
    } else if (entry.workspacePath && !entry.workspaceExists) {
      message = '原工作区已不存在，但文件可能仍在磁盘上。确定将此历史版本应用到编辑器？';
    }

    if (!confirm(message)) return;

    await onApplyContent(entry, entry.content);
    setShowVersionHistory(false);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowVersionHistory(false)}>
      <div className="modal global-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>全局历史</span>
          <button className="icon-btn" onClick={() => setShowVersionHistory(false)}>✕</button>
        </div>
        <div className="history-header-note">
          按文件路径分组（路径不变，重命名后会同步更新）。数据保存在本地，不随文件或工作区删除而丢失。
        </div>
        <div className="global-history-body">
          <div className="global-history-files">
            {fileGroups.length === 0 ? (
              <div className="version-empty">暂无全局历史记录</div>
            ) : (
              fileGroups.map((group) => (
                <button
                  key={group.filePath}
                  type="button"
                  className={`global-history-file-item${selectedFilePath === group.filePath ? ' selected' : ''}`}
                  onClick={() => setSelectedFilePath(group.filePath)}
                  title={group.pathHint}
                >
                  <div className="global-history-file-name">{group.displayName}</div>
                  <div className="global-history-file-path">{group.pathHint}</div>
                  <div className="global-history-file-meta">
                    {group.count} 条 · {new Date(group.latestAt).toLocaleString('zh-CN')}
                  </div>
                  {!group.fileExists && <div className="version-warning">文件已删除</div>}
                </button>
              ))
            )}
          </div>

          {selectedGroup ? (
            <div className="global-history-detail">
              <HistoryViewer
                title={selectedGroup.displayName}
                items={selectedItems}
                emptyText="该文件暂无历史记录"
                headerNote={selectedGroup.fileExists ? undefined : '原文件已不存在，以下为本地保留的历史内容'}
                onClose={() => setShowVersionHistory(false)}
                onRollback={handleRollback}
                rollbackLabel="应用到编辑器"
                embedded
              />
            </div>
          ) : (
            <div className="global-history-empty-detail">
              <div className="version-empty">请选择左侧文件查看历史</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
