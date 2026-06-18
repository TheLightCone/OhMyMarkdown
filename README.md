# OhMyMarkdown

Windows 平台 Markdown 编辑器，以 Typora 为功能基准，并在界面布局、文件管理、搜索能力、扩展性四个维度进行增强。

## 功能特性

### P0 - 核心编辑
- 实时预览编辑模式（所见即所得，基于 Vditor IR 模式）
- 标准 Markdown + 扩展语法（表格、流程图、数学公式等）
- 主题切换（浅色/深色）
- 导出功能（PDF、HTML、Word、图片）
- 三栏布局：左侧文件树 / 中央编辑区 / 右侧大纲导航

### P1 - 增强文件管理
- 新建/重命名/移动/复制/删除文件和文件夹
- 批量操作（多选 + 批量删除）
- 版本历史（自动保存快照、查看/对比/回滚）
- 自动备份（可配置间隔和路径）
- 异常关闭恢复（自动保存 recovery）
- 文件生命周期标记（进行中/已完成/归档）

### P2 - 增强搜索
- 多维度搜索：文件名/内容/标签/状态
- 查找范围：当前文件/文件夹/全局工作区
- 匹配规则：区分大小写/全字匹配/正则表达式
- 结果展示：文件名 + 摘要 + 行号，点击跳转

### P3 - 插件系统
- 顶部插件菜单入口
- 插件管理面板（启用/禁用）
- 内置插件（字数统计、自动目录、增强导出）
- 插件开发 API 文档

## 技术栈

- **框架**: Electron 33 + React 18 + TypeScript
- **构建**: Vite 6
- **编辑器**: Vditor（IR 即时渲染模式）
- **数据库**: sql.js（SQLite，版本历史与搜索索引）
- **打包**: electron-builder（Windows NSIS 安装包）

## 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run electron:dev
```

### 打包为 .exe
```bash
npm run electron:build
```

打包完成后，可执行文件位于：

```
release/win-unpacked/OhMyMarkdown.exe
```

直接双击即可运行，或将整个 `win-unpacked` 文件夹复制到任意位置使用。

> 若 Electron 下载较慢，项目已配置 `.npmrc` 使用国内镜像。如遇代码签名权限问题，已在配置中禁用签名（`signAndEditExecutable: false`）。

## 项目结构

```
OhMyMarkdown/
├── electron/           # Electron 主进程
│   ├── main.ts         # 主入口
│   ├── preload.ts      # 预加载脚本（IPC 桥接）
│   └── services/       # 后端服务
│       ├── database.ts     # SQLite 数据库
│       ├── fileService.ts  # 文件操作
│       ├── versionService.ts
│       ├── backupService.ts
│       ├── searchService.ts
│       ├── pluginService.ts
│       └── exportService.ts
├── src/                # React 渲染进程
│   ├── App.tsx
│   ├── components/     # UI 组件
│   ├── stores/         # Zustand 状态管理
│   ├── styles/         # 全局样式与主题
│   └── types/          # TypeScript 类型
├── index.html
├── vite.config.ts
└── package.json
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 打开工作区 |
| Ctrl+S | 保存 |
| Ctrl+Shift+F | 搜索 |

## 许可证

MIT
