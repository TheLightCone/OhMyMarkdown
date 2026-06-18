import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import HistoryViewer, { mapVersionSnapshots, type HistoryViewerItem } from './HistoryViewer';

interface FileVersionHistoryModalProps {
  onRollback: (filePath: string, content: string) => void | Promise<void>;
}

export default function FileVersionHistoryModal({ onRollback }: FileVersionHistoryModalProps) {
  const {
    showFileVersionHistory,
    fileVersionHistoryPath,
    setShowFileVersionHistory,
    versions,
    setVersions,
  } = useAppStore();
  const [fileExists, setFileExists] = useState(true);

  useEffect(() => {
    if (showFileVersionHistory && fileVersionHistoryPath) {
      window.electronAPI.version.list(fileVersionHistoryPath).then(setVersions);
      window.electronAPI.history.pathExists(fileVersionHistoryPath).then(setFileExists);
    }
  }, [showFileVersionHistory, fileVersionHistoryPath, setVersions]);

  if (!showFileVersionHistory || !fileVersionHistoryPath) return null;

  const fileName = fileVersionHistoryPath.split(/[/\\]/).pop() || fileVersionHistoryPath;
  const items = mapVersionSnapshots(versions, fileExists);

  const handleRollback = (item: HistoryViewerItem) => {
    const version = versions.find((v) => v.id === item.id);
    if (!version) return;

    const message = fileExists
      ? '确定回滚到此版本？当前未保存的更改将丢失。'
      : '原文件已不存在。内容将应用到当前编辑器，您可手动另存。是否继续？';

    if (!confirm(message)) return;

    void Promise.resolve(onRollback(fileVersionHistoryPath, version.content));
    setShowFileVersionHistory(false);
  };

  return (
    <HistoryViewer
      title={`文件版本历史 · ${fileName}`}
      items={items}
      emptyText="该文件暂无保存版本"
      headerNote={
        fileExists
          ? '按文件保存的版本记录，文件删除后历史仍保留在本地。'
          : '原文件已不存在，以下为本地的历史版本记录。'
      }
      onClose={() => setShowFileVersionHistory(false)}
      onRollback={handleRollback}
    />
  );
}
