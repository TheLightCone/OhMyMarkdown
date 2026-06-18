import vditorIconAnt from 'vditor/dist/js/icons/ant.js?raw';

/** Electron file:// 下同步 XHR 加载图标脚本会失败，改为打包内联注入 */
export function injectVditorIcons(): void {
  if (document.getElementById('vditorIconScript')) return;
  const script = document.createElement('script');
  script.id = 'vditorIconScript';
  script.textContent = vditorIconAnt;
  document.head.appendChild(script);
}
