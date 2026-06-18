import { useEffect, useState } from 'react';
import * as Diff from 'diff';
import type { VersionSnapshot } from '../../types';
import './VersionHistory.css';
export interface HistoryViewerItem {
  id: string;
  createdAt: number;
  content: string;
  preview?: string;
  meta?: string;
  warning?: string;
}

interface HistoryViewerProps {
  title: string;
  items: HistoryViewerItem[];
  emptyText: string;
  onClose: () => void;
  onRollback: (item: HistoryViewerItem) => void;
  rollbackLabel?: string;
  headerNote?: string;
  /** 嵌入全局历史面板时使用，不渲染外层遮罩 */
  embedded?: boolean;
}

export default function HistoryViewer({
  title,
  items,
  emptyText,
  onClose,
  onRollback,
  rollbackLabel = '回滚',
  headerNote,
  embedded = false,
}: HistoryViewerProps) {
  const [selected, setSelected] = useState<HistoryViewerItem | null>(null);
  const [compareBase, setCompareBase] = useState<HistoryViewerItem | null>(null);
  const [diffText, setDiffText] = useState('');

  useEffect(() => {
    setSelected(null);
    setCompareBase(null);
  }, [items]);

  useEffect(() => {
    if (selected && compareBase) {
      const diff = Diff.createPatch(
        'document',
        compareBase.content,
        selected.content,
        '旧版本',
        '新版本',
      );
      setDiffText(diff);
    } else {
      setDiffText('');
    }
  }, [selected, compareBase]);

  const handleRollback = () => {
    if (!selected) return;
    onRollback(selected);
  };

  const panel = (
    <div className={`modal version-modal${embedded ? ' history-viewer-embedded' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <span>{title}</span>
        {!embedded && <button className="icon-btn" onClick={onClose}>✕</button>}
      </div>
      {headerNote && <div className="history-header-note">{headerNote}</div>}
      <div className="modal-body version-body">
          <div className="version-list">
            {items.length === 0 ? (
              <div className="version-empty">{emptyText}</div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`version-item ${selected?.id === item.id ? 'selected' : ''}`}
                  onClick={() => setSelected(item)}
                  onDoubleClick={() => setCompareBase(item)}
                >
                  <div className="version-time">
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </div>
                  {item.meta && <div className="version-meta">{item.meta}</div>}
                  {item.warning && <div className="version-warning">{item.warning}</div>}
                  <div className="version-preview">
                    {(item.preview ?? item.content).slice(0, 80).replace(/\n/g, ' ')}...
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="version-detail">
            {selected ? (
              <>
                <div className="version-detail-header">
                  <span>版本内容预览</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setCompareBase(selected)}
                      title="双击版本可设为对比基准"
                    >
                      设为对比
                    </button>
                    <button className="btn btn-primary" onClick={handleRollback}>{rollbackLabel}</button>
                  </div>
                </div>
                {selected.warning && <div className="history-detail-warning">{selected.warning}</div>}
                {diffText ? (
                  <pre className="version-diff">{diffText}</pre>
                ) : (
                  <pre className="version-content">{selected.content}</pre>
                )}
                {compareBase && (
                  <div className="compare-info">
                    对比基准: {new Date(compareBase.createdAt).toLocaleString('zh-CN')}
                    <button className="btn btn-ghost" onClick={() => setCompareBase(null)}>清除对比</button>
                  </div>
                )}
              </>
            ) : (
              <div className="version-empty">选择一个版本查看</div>
            )}
          </div>
        </div>
    </div>
  );

  if (embedded) return panel;

  return (
    <div className="modal-overlay" onClick={onClose}>
      {panel}
    </div>
  );
}

export function mapVersionSnapshots(items: VersionSnapshot[], fileExists: boolean): HistoryViewerItem[] {
  return items.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    content: item.content,
    warning: fileExists ? undefined : '原文件已不存在，仍可查看历史内容并回滚到编辑器',
  }));
}
