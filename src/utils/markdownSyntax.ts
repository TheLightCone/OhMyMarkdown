/** 保存时将 DOM 中的上下标 HTML 转回 ~ ~ / ^ ^ 语法 */
export function collapseTyporaSyntax(md: string): string {
  return md
    .replace(/<span class="md-sub">([^<]*)<\/span>/gi, '~$1~')
    .replace(/<span class="md-sup">([^<]*)<\/span>/gi, '^$1^')
    .replace(/<sub>([^<]*)<\/sub>/gi, '~$1~')
    .replace(/<sup>([^<]*)<\/sup>/gi, '^$1^');
}

/** @deprecated 文件加载不再预展开，改由 DOM 增强渲染 */
export function expandTyporaSyntax(md: string): string {
  return md;
}

/** 是否含有尚未展开的上下标语法 */
export function hasUnexpandedTyporaSyntax(md: string): boolean {
  return /(?<![~])~[^~\n]+~(?!~)/.test(md) || /\^[^\^\n]+\^/.test(md);
}

const ALERT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

export function getAlertLabel(type: string): string {
  return ALERT_LABELS[type.toLowerCase()] ?? type;
}

export function slugifyHeading(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 统一换行并去掉行尾 \\r，避免 Windows CRLF 导致 ATX 标题正则匹配失败 */
function splitMarkdownLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/** 从 Markdown 源码解析标题（跳过代码块） */
export function parseOutlineFromMarkdown(content: string): import('../types').OutlineItem[] {
  const lines = splitMarkdownLines(content);
  const items: import('../types').OutlineItem[] = [];
  const slugCount = new Map<string, number>();
  let inCodeBlock = false;

  const pushHeading = (level: number, text: string, line: number) => {
    let slug = slugifyHeading(text);
    const count = slugCount.get(slug) ?? 0;
    slugCount.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
    items.push({
      level,
      text,
      line,
      index: items.length,
      id: `heading-${items.length}`,
      slug,
    });
  };

  lines.forEach((line, index) => {
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) return;
    if (/^(=+|-+)\s*$/.test(line.trim())) return;

    const trimmed = line.replace(/\r$/, '');
    const match =
      trimmed.match(/^(#{1,6})\s+(.+)$/) ??
      trimmed.match(/^<h([1-6])[^>]*>(.+?)<\/h\1>\s*$/i);
    if (!match) {
      const setext = lines[index + 1]?.match(/^(=+|-+)\s*$/);
      if (setext && line.trim()) {
        const level = setext[1].startsWith('=') ? 1 : 2;
        pushHeading(level, line.trim(), index);
      }
      return;
    }

    const level = match[1].startsWith('#') ? match[1].length : parseInt(match[1], 10);
    const raw = (match[1].startsWith('#') ? match[2] : match[2]).trim();
    const text = raw
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/(\*\*|__|\*|_|~~|`)/g, '')
      .trim();

    if (!text) return;

    pushHeading(level, text, index);
  });

  return items;
}

/** 取文档中最顶层标题级别（用于大纲树根节点） */
export function getOutlineRootLevel(items: { level: number }[]): number {
  if (items.length === 0) return 1;
  return Math.min(...items.map((i) => i.level));
}
