# OhMyMarkdown 功能测试文档

用于验证编辑器各项 Markdown 扩展功能。在应用中打开此文件逐项测试。

## 1. 大纲测试

### 1.1 二级标题 A

### 1.2 二级标题 B

## 2. 内部链接

跳转到 [1.1 二级标题 A](#11-二级标题-a)

跳转到 [2. 内部链接](#2-内部链接)

## 3. 任务列表（GFM）

- [x] 已完成
- [ ] 未完成

## 4. GFM Alerts

> [!NOTE]
> 这是一条 Note 提示。

> [!TIP]
> 这是一条 Tip 提示。

> [!WARNING]
> 这是一条 Warning 提示。

## 5. 扩展语法

==这是黄色高亮==

H~2~O 水分子

E = mc^2^

## 6. 脚注

这是一段带脚注的文字[^1]。

[^1]: 这是脚注内容，hover 应显示此文字，Ctrl+点击应跳转至此。

## 7. HTML 标签

<u>下划线</u> <kbd>Ctrl</kbd> <del>删除线</del>

<details>
<summary>点击展开</summary>
隐藏内容
</details>

## 8. 自定义 style

<span style="color: red; background: #ffffcc; border: 1px solid blue; padding: 2px 6px;">红色文字黄色背景蓝色边框</span>

<p style="color: green;">绿色段落</p>
