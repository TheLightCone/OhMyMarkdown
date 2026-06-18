/**
 * Markdown 功能单元测试
 * 运行: node scripts/test-features.mjs
 */

function slugifyHeading(text) {
  return text.replace(/\u200b/g, '').trim().toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function collapseTyporaSyntax(md) {
  return md
    .replace(/<span class="md-sub">([^<]*)<\/span>/gi, '~$1~')
    .replace(/<span class="md-sup">([^<]*)<\/span>/gi, '^$1^');
}

function hasUnexpandedTyporaSyntax(md) {
  return /~[^~\n]+~/.test(md) || /\^[^\^\n]+\^/.test(md);
}

function parseLinkHref(raw) {
  const trimmed = (raw || '').replace(/\u200b/g, '').trim();
  if (!trimmed) return '';
  const paren = trimmed.match(/^\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
  if (paren) return paren[1];
  const angle = trimmed.match(/^<([^>]+)>$/);
  if (angle) return angle[1];
  return trimmed;
}

function splitMarkdownLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function parseOutlineFromMarkdown(content) {
  const lines = splitMarkdownLines(content);
  const items = [];
  let inCodeBlock = false;
  lines.forEach((line, index) => {
    if (/^```/.test(line.trim())) { inCodeBlock = !inCodeBlock; return; }
    if (inCodeBlock) return;
    const trimmed = line.replace(/\r$/, '');
    const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return;
    const text = match[2].trim().replace(/(\*\*|__|\*|_|~~|`)/g, '').trim();
    if (!text) return;
    items.push({ level: match[1].length, text, line: index, index: items.length, id: `heading-${items.length}`, slug: slugifyHeading(text) });
  });
  return items;
}

function getOutlineRootLevel(items) {
  if (!items.length) return 1;
  return Math.min(...items.map((i) => i.level));
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n=== OhMyMarkdown 功能测试 ===\n');

const md1 = `## 第一章\n\n### 1.1 小节\n\n## 第二章`;
const outline1 = parseOutlineFromMarkdown(md1);
assert('解析 3 个标题', outline1.length === 3);
assert('根级别为 2', getOutlineRootLevel(outline1) === 2);
assert('topLevel 过滤', outline1.filter((i) => i.level === getOutlineRootLevel(outline1)).length === 2);

assert('中文 slug', slugifyHeading('3. 任务列表（GFM）') === '3-任务列表gfm');

const collapsed = collapseTyporaSyntax('<span class="md-sub">2</span> H<span class="md-sup">2</span>O');
assert('上下标折叠', collapsed.includes('~2~') && collapsed.includes('^2^'));
assert('检测未展开语法', hasUnexpandedTyporaSyntax('H~2~O'));

const md2 = '```\n## not\n```\n## real';
assert('代码块标题忽略', parseOutlineFromMarkdown(md2).length === 1);

const mdCrlf = '# 生产预警日度产量问题整理\r\n\r\n## 详细说明\r\n';
assert('CRLF 标题解析', parseOutlineFromMarkdown(mdCrlf).length === 2);

assert('链接 href 解析', parseLinkHref('https://example.com') === 'https://example.com');
assert('括号链接解析', parseLinkHref('(https://example.org "title")') === 'https://example.org');

console.log(`\n---\n结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
