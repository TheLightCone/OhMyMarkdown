import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { openPluginApiDoc } from '../../utils/pluginApiDoc';
import './PluginManager.css';

export default function PluginManager() {
  const { showPluginManager, setShowPluginManager, plugins, setPlugins } = useAppStore();

  useEffect(() => {
    if (showPluginManager) {
      window.electronAPI.plugin.list().then(setPlugins);
    }
  }, [showPluginManager, setPlugins]);

  if (!showPluginManager) return null;

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.plugin.enable(id, enabled);
    const updated = await window.electronAPI.plugin.list();
    setPlugins(updated);
  };

  const handleOpenDir = async () => {
    try {
      await window.electronAPI.plugin.openDir();
    } catch (err) {
      alert(`无法打开插件目录：${(err as Error).message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowPluginManager(false)}>
      <div className="modal plugin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>插件管理</span>
          <button className="icon-btn" onClick={() => setShowPluginManager(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="plugin-tabs">
            <button className="plugin-tab active">已安装</button>
            <button className="plugin-tab" disabled title="插件市场即将推出">插件市场</button>
          </div>

          <div className="plugin-list">
            {plugins.map((plugin) => (
              <div key={plugin.id} className="plugin-item">
                <div className="plugin-info">
                  <div className="plugin-name">{plugin.name}</div>
                  <div className="plugin-meta">v{plugin.version} · {plugin.description}</div>
                </div>
                <label className="plugin-toggle">
                  <input
                    type="checkbox"
                    checked={plugin.enabled}
                    onChange={(e) => handleToggle(plugin.id, e.target.checked)}
                  />
                  <span>{plugin.enabled ? '已启用' : '已禁用'}</span>
                </label>
              </div>
            ))}
          </div>

          <div className="plugin-footer-info">
            <button className="btn btn-ghost" onClick={handleOpenDir}>打开插件目录</button>
            <span className="plugin-hint">
              支持 JavaScript 插件扩展，详见{' '}
              <button type="button" className="plugin-link" onClick={openPluginApiDoc}>
                API 文档
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
