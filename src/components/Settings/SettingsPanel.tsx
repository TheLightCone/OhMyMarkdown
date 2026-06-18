import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import './SettingsPanel.css';

export default function SettingsPanel() {
  const { showSettings, setShowSettings, settings, setSettings } = useAppStore();
  const [backupConfig, setBackupConfig] = useState({ enabled: true, intervalMinutes: 30, backupPath: '' });
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (showSettings) {
      window.electronAPI.backup.getConfig().then(setBackupConfig);
      setLocalSettings(settings);
    }
  }, [showSettings, settings]);

  if (!showSettings) return null;

  const handleSave = async () => {
    await window.electronAPI.settings.set(localSettings);
    setSettings(localSettings);
    await window.electronAPI.backup.setConfig(backupConfig);
    setShowSettings(false);
  };

  const handleBackupNow = async () => {
    try {
      const path = await window.electronAPI.backup.run();
      alert(`备份完成：${path}`);
    } catch (e) {
      alert(`备份失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowSettings(false)}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>设置</span>
          <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
        </div>
        <div className="modal-body">
          <h3 className="settings-section">外观</h3>
          <div className="form-group">
            <label>主题</label>
            <select
              value={localSettings.theme}
              onChange={(e) => setLocalSettings({ ...localSettings, theme: e.target.value as 'light' | 'dark' })}
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>

          <div className="form-group">
            <label>应用界面字号（{localSettings.appFontSize}px）</label>
            <input
              type="range"
              min={12}
              max={20}
              step={1}
              value={localSettings.appFontSize}
              onChange={(e) => setLocalSettings({ ...localSettings, appFontSize: Number(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>编辑器字号（{localSettings.editorFontSize}px）</label>
            <input
              type="range"
              min={12}
              max={32}
              step={1}
              value={localSettings.editorFontSize}
              onChange={(e) => setLocalSettings({ ...localSettings, editorFontSize: Number(e.target.value) })}
            />
          </div>
          <p className="settings-hint">提示：在编辑区按住 Ctrl + 滚轮可快速调节编辑器字号</p>

          <h3 className="settings-section">文件管理</h3>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="hideArchived"
              checked={localSettings.hideArchived}
              onChange={(e) => setLocalSettings({ ...localSettings, hideArchived: e.target.checked })}
            />
            <label htmlFor="hideArchived">隐藏已归档文件</label>
          </div>
          <div className="form-group">
            <label>自动保存间隔（秒）</label>
            <input
              type="number"
              min={5}
              max={300}
              value={localSettings.autoSaveInterval}
              onChange={(e) => setLocalSettings({ ...localSettings, autoSaveInterval: Number(e.target.value) })}
            />
          </div>

          <h3 className="settings-section">自动备份</h3>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="backupEnabled"
              checked={backupConfig.enabled}
              onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })}
            />
            <label htmlFor="backupEnabled">启用自动备份</label>
          </div>
          <div className="form-group">
            <label>备份间隔（分钟）</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={backupConfig.intervalMinutes}
              onChange={(e) => setBackupConfig({ ...backupConfig, intervalMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>备份路径（留空使用默认路径）</label>
            <input
              value={backupConfig.backupPath}
              onChange={(e) => setBackupConfig({ ...backupConfig, backupPath: e.target.value })}
              placeholder="例: D:\Backups\OhMyMarkdown"
            />
          </div>
          <button className="btn btn-ghost" onClick={handleBackupNow}>立即备份</button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
