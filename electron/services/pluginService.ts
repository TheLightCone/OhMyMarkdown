import { queryOne, queryAll, runSql } from './database';
import { getPluginsDir as resolvePluginsDir } from './dataPaths';
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description?: string;
}

const BUILTIN_PLUGINS: PluginInfo[] = [
  {
    id: 'word-count',
    name: '字数统计',
    version: '1.0.0',
    enabled: true,
    config: {},
    description: '在状态栏显示文档字数和字符数',
  },
  {
    id: 'auto-toc',
    name: '自动目录',
    version: '1.0.0',
    enabled: true,
    config: {},
    description: '根据标题自动生成目录',
  },
  {
    id: 'export-enhanced',
    name: '增强导出',
    version: '1.0.0',
    enabled: true,
    config: { includeCss: true },
    description: '导出时附加自定义样式',
  },
];

function initBuiltinPlugins(): void {
  for (const plugin of BUILTIN_PLUGINS) {
    const existing = queryOne('SELECT id FROM plugins WHERE id = ?', [plugin.id]);
    if (!existing) {
      runSql('INSERT INTO plugins (id, name, version, enabled, config) VALUES (?, ?, ?, ?, ?)', [
        plugin.id,
        plugin.name,
        plugin.version,
        plugin.enabled ? 1 : 0,
        JSON.stringify(plugin.config),
      ]);
    }
  }
}

export function listPlugins(): PluginInfo[] {
  initBuiltinPlugins();
  const rows = queryAll('SELECT id, name, version, enabled, config FROM plugins');
  const plugins: PluginInfo[] = [];

  for (const [id, name, version, enabled, config] of rows) {
    const builtin = BUILTIN_PLUGINS.find((p) => p.id === id);
    plugins.push({
      id: id as string,
      name: name as string,
      version: version as string,
      enabled: Boolean(enabled),
      config: JSON.parse((config as string) || '{}'),
      description: builtin?.description,
    });
  }
  return plugins;
}

export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  runSql('UPDATE plugins SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, pluginId]);
}

export function setPluginConfig(pluginId: string, config: Record<string, unknown>): void {
  runSql('UPDATE plugins SET config = ? WHERE id = ?', [JSON.stringify(config), pluginId]);
}

export function getPluginApiDoc(): string {
  return `# OhMyMarkdown 插件开发 API

## 概述
插件通过 JavaScript 模块扩展编辑器功能。插件文件放置在用户数据目录的 plugins 文件夹中。

## 插件结构
\`\`\`json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "main": "index.js",
  "description": "插件描述"
}
\`\`\`

## API 接口

### editor
- \`editor.getContent(): string\` - 获取当前文档内容
- \`editor.setContent(content: string): void\` - 设置文档内容
- \`editor.getSelection(): string\` - 获取选中文本

### workspace
- \`workspace.getPath(): string\` - 获取工作区路径
- \`workspace.getCurrentFile(): string\` - 获取当前打开文件

### ui
- \`ui.showNotification(message: string): void\` - 显示通知
- \`ui.registerCommand(id: string, handler: Function): void\` - 注册命令

### hooks
- \`hooks.onSave(callback: Function)\` - 保存时触发
- \`hooks.onOpen(callback: Function)\` - 打开文件时触发

## 示例插件
\`\`\`javascript
module.exports = {
  activate(api) {
    api.hooks.onSave((content) => {
      api.ui.showNotification('文档已保存');
    });
  },
  deactivate() {}
};
\`\`\`
`;
}

export function getPluginsDirectory(): string {
  return resolvePluginsDir();
}
