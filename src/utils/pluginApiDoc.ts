export function openPluginApiDoc(): void {
  void window.electronAPI.plugin.openApiDoc().catch((err: Error) => {
    alert(`无法打开 API 文档：${err.message}`);
  });
}
