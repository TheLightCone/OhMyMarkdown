# Electron 打包后必测清单

本文档记录 OhMyMarkdown 在 **Windows 打包 exe** 环境下的测试流程与常见陷阱。  
编辑器相关功能（大纲跳转、Ctrl+点击链接等）**必须以打包 exe 验证为准**，不能仅依赖 `npm run test` 或 `npm run electron:dev`。

---

## 1. 为什么需要单独测 Electron？

| 环境 | 布局 | 事件链路 | 可靠性 |
|------|------|----------|--------|
| `npm run test`（Playwright） | 测试脚本手动设固定高度 | 部分为模拟 JS，非打包 bundle | 易**假阳性** |
| `npm run electron:dev` | 接近生产，但走 Vite dev server | React 热更新、生命周期不同 | 参考 |
| **`npm run electron:build` → exe** | 真实 flex 布局 + asar | 全局 runtime + DOM 回退 | **准绳** |

### 曾踩过的坑

1. **Playwright 通过 ≠ exe 有效**  
   测试页给容器设了 `height: 200px`，IR 区域天然可滚动；打包后 flex 子项若无固定高度，内容无限增高，`scrollTop` 改了也看不出效果。

2. **「有大纲条目」≠「跳转链路正常」**  
   大纲可来自 `parseOutlineFromMarkdown`（纯文本解析），与 Vditor 是否 ready、handler 是否注册无关。

3. **Vditor 滚动不是滚 window**  
   `height: 'auto'` 时 Vditor 用 `window.scrollTo`，但应用 `html/body` 为 `overflow: hidden`；正确做法是在 **`pre.vditor-reset`** 上设置 `scrollTop`（与 Vditor 自带 TOC 一致）。

4. **React 回调链在打包环境可能断裂**  
   依赖 `onReady` → `outlineJumpHandler` → ref 的多层传递不稳定；最终方案改为 **`main.tsx` 全局 document 捕获 + DOM 回退**。

---

## 2. 构建与运行

### 2.1 构建命令

```bash
npm run electron:build
```

产物路径：

- 绿色版：`release\win-unpacked\OhMyMarkdown.exe`
- 安装包：`release\OhMyMarkdown Setup 1.0.0.exe`

### 2.2 构建前

- [ ] 关闭所有正在运行的 `OhMyMarkdown.exe`（否则可能 `EBUSY` 导致打包失败）
- [ ] 本地 `npm run test` 全部通过（快速回归，不能替代 exe 测试）

### 2.3 确认运行的是新包

1. 任务管理器结束所有 `OhMyMarkdown.exe`
2. 双击 **`release\win-unpacked\OhMyMarkdown.exe`**（勿用旧快捷方式）
3. 查看 `dist\index.html` 引用的 JS 文件名（如 `index-CQthv1M0.js`），应与 asar 内一致：

```bash
npx asar list release\win-unpacked\resources\app.asar | findstr index-
```

---

## 3. 手动测试清单（打包 exe）

### 3.1 基础

- [ ] 打开工作区，左侧文件树显示 `.md` 文件
- [ ] 打开文件，编辑器可输入，工具栏图标正常（非空白）
- [ ] 保存、切换文件、切换主题正常

### 3.2 大纲（Outline）

**准备：** 打开含多级标题的长文档（如 `test-fixtures/typora-syntax-test.md` 或自有文档）。

- [ ] 右侧「大纲」显示条目数 > 0
- [ ] 先向下滚动编辑器，再点击大纲中**非首条**标题
- [ ] 编辑器滚到对应位置
- [ ] 目标标题出现 **蓝色描边 + 背景闪烁**（约 1 秒，`vditor-heading-flash`）

**CRLF 文档：** 打开 Windows 换行（`\r\n`）的 `.md`，大纲仍应有条目（至少 H1）。

**注意：** 普通列表项 `1. xxx` 不是 Markdown 标题，不应出现在大纲中。

### 3.3 Ctrl+点击链接

**准备：** 文档中含 `[内联链接](https://example.com)` 或自动链接。

- [ ] **Ctrl + 左键**（Mac：Cmd + 左键）点击链接
- [ ] 系统默认浏览器打开对应 URL
- [ ] 普通左键点击链接：用于编辑/定位光标，**不应**直接打开浏览器（Typora 行为）

**文档内锚点：** Ctrl+点击 `[跳转](#某标题)` 应滚到对应标题并高亮。

### 3.4 滚动与布局

- [ ] 长文档在编辑器**内部**滚动（非整窗滚动）
- [ ] 调整窗口大小后，编辑器仍可滚动、大纲跳转仍有效

---

## 4. 自动化测试说明

```bash
npm run test
```

包含：

| 脚本 | 内容 |
|------|------|
| `test-features.mjs` | Markdown 解析、CRLF、链接 href |
| `test-vditor-integration.mjs` | Vditor DOM、语法渲染 |
| `test-outline.mjs` | 大纲解析 + IR 标题 + 滚动 |
| `test-interactions.mjs` | 大纲 index 跳转 + Ctrl+点击外链 |

**局限：** Playwright 在浏览器中模拟 Vditor，布局与 Electron 打包不完全一致。  
**原则：** `npm run test` 通过是必要条件；**编辑器交互类改动必须再跑 exe 手动清单**。

---

## 5. 关键实现（便于排查）

### 5.1 全局交互入口

- 文件：`src/utils/editorRuntime.ts`
- 启动：`src/main.tsx` → `installGlobalEditorRuntime()`
- 行为：在 `document` **捕获阶段**监听
  - 大纲：`.outline-item[data-outline-index]`
  - Ctrl+点击：`.editor-panel` 内 IR 区域链接

### 5.2 Vditor 实例与滚动

- 文件：`src/utils/vditorBridge.ts`
- `setActiveVditor`：创建 Vditor 后立即注册，并写入 `container.__vditorInstance`
- `applyEditorScrollLayout`：`ResizeObserver` 按容器像素高度限制 IR（`pre.vditor-reset`）使内部可滚动

### 5.3 跳转与链接

- 文件：`src/utils/editorEnhancements.ts`
- `jumpToOutlineInDom`：无 Vditor 实例时，直接 query IR DOM 滚动（回退）
- `handleCtrlLinkNavigation`：Ctrl+点击 → `electronAPI.openExternal` 或锚点滚动
- 配置：`src/config/vditorConfig.ts` 中 `height: '100%'`（勿改回 `auto`）

### 5.4 Electron 主进程

- 文件：`electron/main.ts`
- `shell:openExternal`：处理外链；需 normalize `(url)` 等 Markdown 括号格式

---

## 6. 常见问题排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 大纲为 0 | CRLF 未解析 / 文档无 `#` 标题 | 检查文件换行与标题语法 |
| 有大纲，点击无反应 | 旧 exe / handler 未绑定 | 结束进程，确认 asar 内 JS hash；查 global runtime |
| 点击无反应、无高亮 | IR 不可滚动 | 查 `applyEditorScrollLayout`、窗口 resize |
| Ctrl+点击无反应 | 未按 Ctrl / 点在非链接区 | 确认按 Ctrl；点预览区 `<a>` 或链接文字 |
| 测试通过 exe 失败 | 测试布局与 exe 不一致 | 按本文档 §3 手动测 exe |
| 打包 EBUSY | exe 仍在运行 | 任务管理器结束进程后重打包 |

### 调试建议

- 开发模式：`npm run electron:dev` 可开 DevTools（`main.ts` 中 `openDevTools`）
- 打包版默认无 DevTools；可临时在 `electron/main.ts` 的 `loadFile` 后加 `mainWindow.webContents.openDevTools()`
- 控制台搜索：`Vditor onReady failed` 表示 ready 回调异常（现已有 DOM 回退，不应阻断大纲）

---

## 7. 改动编辑器交互时的检查顺序

1. 改代码
2. `npm run test`
3. `npm run electron:build`
4. 结束旧进程，运行新 exe
5. 完成 **§3 手动测试清单** 全部项
6. 再提交 / 发版

---

## 8. 相关文件索引

| 文件 | 职责 |
|------|------|
| `src/main.tsx` | 注册全局 editor runtime |
| `src/utils/editorRuntime.ts` | 大纲 / Ctrl+点击 document 委托 |
| `src/utils/vditorBridge.ts` | Vditor 实例、滚动布局 |
| `src/utils/editorEnhancements.ts` | IR 解析、滚动、链接、大纲 DOM |
| `src/components/Outline/OutlinePanel.tsx` | 大纲 UI、`data-outline-index` |
| `src/components/Editor/EditorPanel.tsx` | Vditor 初始化、layout |
| `src/config/vditorConfig.ts` | Vditor 高度、CDN、toolbar |
| `src/styles/editor-extensions.css` | 标题高亮动画 |
| `scripts/test-*.mjs` | 自动化回归 |
| `test-fixtures/*.md` | 测试用 Markdown |

---

*最后更新：2026-06（大纲跳转 / Ctrl+点击链接 Electron 修复完成后整理）*
