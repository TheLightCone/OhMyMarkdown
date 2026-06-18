import { useAppStore } from '../../stores/appStore';
import { openPluginApiDoc } from '../../utils/pluginApiDoc';
import './Toolbar.css';

interface ToolbarProps {
  onOpenWorkspace: () => void;
  onSave: () => void;
  onExport: (type: string) => void;
  onToggleTheme: () => void;
}

export default function Toolbar({ onOpenWorkspace, onSave, onExport, onToggleTheme }: ToolbarProps) {
  const {
    isDirty,
    showSearch,
    setShowSearch,
    setShowPluginManager,
    setShowVersionHistory,
    setShowSettings,
    settings,
  } = useAppStore();

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onOpenWorkspace} title="打开工作区">
          📁 打开
        </button>
        <button className="toolbar-btn" onClick={onSave} title="保存 (Ctrl+S)" disabled={!isDirty}>
          💾 保存
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="dropdown">
          <button className="toolbar-btn" title="导出">📤 导出 ▾</button>
          <div className="dropdown-menu">
            <button onClick={() => onExport('html')}>导出 HTML</button>
            <button onClick={() => onExport('pdf')}>导出 PDF</button>
            <button onClick={() => onExport('word')}>导出 Word</button>
            <button onClick={() => onExport('image')}>导出图片</button>
          </div>
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${showSearch ? 'active' : ''}`}
          onClick={() => setShowSearch(!showSearch)}
          title="搜索 (Ctrl+Shift+F)"
        >
          🔍 搜索
        </button>
        <button className="toolbar-btn" onClick={() => setShowVersionHistory(true)} title="全局历史（所有编辑记录）">
          🕐 历史
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="dropdown">
          <button className="toolbar-btn" title="插件">🔌 插件 ▾</button>
          <div className="dropdown-menu">
            <button onClick={() => setShowPluginManager(true)}>插件管理</button>
            <button onClick={openPluginApiDoc}>API 文档</button>
          </div>
        </div>
        <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="设置">
          ⚙️ 设置
        </button>
        <button className="toolbar-btn" onClick={onToggleTheme} title={settings.theme === 'light' ? '切换为深色主题' : '切换为浅色主题'}>
          {settings.theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </div>
  );
}
