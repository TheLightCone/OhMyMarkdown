import { useState, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { FileNode } from '../../types';
import './FileTree.css';

interface FileTreeProps {
  onFileOpen: (path: string) => void;
  onRefresh: () => void;
}

function FileTreeNode({
  node,
  depth,
  currentFile,
  selectedFiles,
  onOpen,
  onToggleSelect,
  onContextMenu,
}: {
  node: FileNode;
  depth: number;
  currentFile: string | null;
  selectedFiles: string[];
  onOpen: (path: string) => void;
  onToggleSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.isDirectory) {
    return (
      <div>
        <div
          className="tree-node directory"
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setExpanded(!expanded)}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          <span className="tree-icon">{expanded ? '📂' : '📁'}</span>
          <span className="tree-label">{node.name}</span>
        </div>
        {expanded && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            currentFile={currentFile}
            selectedFiles={selectedFiles}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    );
  }

  const isActive = currentFile === node.path;
  const isSelected = selectedFiles.includes(node.path);

  return (
    <div
      className={`tree-node file ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
      style={{ paddingLeft: depth * 16 + 8 }}
      onClick={() => onOpen(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <input
        type="checkbox"
        className="tree-checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(node.path); }}
        onClick={(e) => e.stopPropagation()}
      />
      <span className="tree-icon">📄</span>
      <span className="tree-label">{node.name}</span>
      {node.status && node.status !== 'in_progress' && (
        <span className={`badge badge-${node.status}`}>
          {node.status === 'completed' ? '完成' : '归档'}
        </span>
      )}
    </div>
  );
}

export default function FileTree({ onFileOpen, onRefresh }: FileTreeProps) {
  const {
    fileTree,
    currentFile,
    selectedFiles,
    toggleFileSelection,
    workspacePath,
    setShowFileVersionHistory,
    setFileVersionHistoryPath,
  } = useAppStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewDir, setShowNewDir] = useState(false);
  const [newName, setNewName] = useState('');

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = () => setContextMenu(null);

  const handleCreateFile = async () => {
    if (!newName.trim() || !workspacePath) return;
    const dir = contextMenu?.node.isDirectory ? contextMenu.node.path : workspacePath;
    await window.electronAPI.file.create(dir, newName);
    setShowNewFile(false);
    setNewName('');
    closeContextMenu();
    onRefresh();
  };

  const handleCreateDir = async () => {
    if (!newName.trim() || !workspacePath) return;
    const dir = contextMenu?.node.isDirectory ? contextMenu.node.path : workspacePath;
    await window.electronAPI.file.createDir(dir, newName);
    setShowNewDir(false);
    setNewName('');
    closeContextMenu();
    onRefresh();
  };

  const handleRename = async () => {
    if (!contextMenu) return;
    const newNameInput = prompt('输入新名称:', contextMenu.node.name);
    if (newNameInput && newNameInput !== contextMenu.node.name) {
      await window.electronAPI.file.rename(contextMenu.node.path, newNameInput);
      onRefresh();
    }
    closeContextMenu();
  };

  const handleOpenFileHistory = () => {
    if (!contextMenu || contextMenu.node.isDirectory) return;
    setFileVersionHistoryPath(contextMenu.node.path);
    setShowFileVersionHistory(true);
    closeContextMenu();
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    if (confirm(`确定删除 "${contextMenu.node.name}"？`)) {
      await window.electronAPI.file.delete(contextMenu.node.path);
      onRefresh();
    }
    closeContextMenu();
  };

  const handleSetStatus = async (status: string) => {
    if (!contextMenu || contextMenu.node.isDirectory) return;
    await window.electronAPI.file.setMeta(contextMenu.node.path, status);
    onRefresh();
    closeContextMenu();
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (confirm(`确定删除选中的 ${selectedFiles.length} 个文件？`)) {
      await window.electronAPI.file.batchDelete(selectedFiles);
      onRefresh();
    }
  };

  return (
    <div className="file-tree" onClick={closeContextMenu}>
      <div className="sidebar-header">
        <span>文件</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" onClick={() => { setShowNewFile(true); setContextMenu(null); }} title="新建文件">+📄</button>
          <button className="icon-btn" onClick={() => { setShowNewDir(true); setContextMenu(null); }} title="新建文件夹">+📁</button>
          <button className="icon-btn" onClick={onRefresh} title="刷新">🔄</button>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="batch-bar">
          <span>已选 {selectedFiles.length} 项</span>
          <button className="btn btn-danger" onClick={handleBatchDelete}>批量删除</button>
        </div>
      )}

      <div className="sidebar-content">
        {fileTree.length === 0 ? (
          <div className="tree-empty">暂无文件</div>
        ) : (
          fileTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              currentFile={currentFile}
              selectedFiles={selectedFiles}
              onOpen={onFileOpen}
              onToggleSelect={toggleFileSelection}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { setShowNewFile(true); }}>新建文件</button>
          <button onClick={() => { setShowNewDir(true); }}>新建文件夹</button>
          <button onClick={handleRename}>重命名</button>
          <button onClick={handleDelete} className="danger">删除</button>
          {!contextMenu.node.isDirectory && (
            <>
              <div className="context-divider" />
              <button onClick={handleOpenFileHistory}>版本历史</button>
              <div className="context-divider" />
              <button onClick={() => handleSetStatus('in_progress')}>标记：进行中</button>
              <button onClick={() => handleSetStatus('completed')}>标记：已完成</button>
              <button onClick={() => handleSetStatus('archived')}>标记：归档</button>
            </>
          )}
        </div>
      )}

      {(showNewFile || showNewDir) && (
        <div className="modal-overlay" onClick={() => { setShowNewFile(false); setShowNewDir(false); }}>
          <div className="modal" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{showNewFile ? '新建文件' : '新建文件夹'}</div>
            <div className="modal-body">
              <div className="form-group">
                <label>名称</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={showNewFile ? '文件名（无需 .md 后缀）' : '文件夹名'}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && (showNewFile ? handleCreateFile() : handleCreateDir())}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowNewFile(false); setShowNewDir(false); }}>取消</button>
              <button className="btn btn-primary" onClick={showNewFile ? handleCreateFile : handleCreateDir}>创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
