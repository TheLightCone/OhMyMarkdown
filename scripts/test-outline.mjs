/**
 * 大纲解析与跳转集成测试
 * 运行: npx playwright install chromium && node scripts/test-outline.mjs
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const port = 9880;

function slugifyHeading(text) {
  return text.replace(/\u200b/g, '').trim().toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function parseOutline(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const items = [];
  let inCodeBlock = false;
  lines.forEach((line) => {
    if (/^```/.test(line.trim())) { inCodeBlock = !inCodeBlock; return; }
    if (inCodeBlock) return;
    const match = line.replace(/\r$/, '').match(/^(#{1,6})\s+(.+)$/);
    if (!match) return;
    const text = match[2].trim();
    if (!text) return;
    items.push({ level: match[1].length, text, index: items.length, slug: slugifyHeading(text) });
  });
  return items;
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  let urlPath = req.url?.split('?')[0] ?? '/';
  for (const filePath of [path.join(root, urlPath.slice(1)), path.join(root, 'public', urlPath)]) {
    if (!existsSync(filePath)) continue;
    const ext = path.extname(filePath);
    const type = mime[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(readFileSync(filePath));
    return;
  }
  res.writeHead(404);
  res.end('404');
});

const BROWSER_HELPERS = `
function getHeadingText(heading) {
  var preview = heading.querySelector('.vditor-ir__preview');
  var fromPreview = preview && preview.textContent ? preview.textContent.replace(/\\u200b/g, '').trim() : '';
  if (fromPreview) return fromPreview;
  var clone = heading.cloneNode(true);
  clone.querySelectorAll('.vditor-ir__marker').forEach(function (m) { m.remove(); });
  return (clone.textContent || '').replace(/\\u200b/g, '').trim();
}
function findIrHeadingBlocks(irRoot) {
  var irNodes = irRoot.querySelectorAll(
    'h1.vditor-ir__node, h2.vditor-ir__node, h3.vditor-ir__node, h4.vditor-ir__node, h5.vditor-ir__node, h6.vditor-ir__node',
  );
  if (irNodes.length > 0) {
    return Array.from(irNodes).filter(function (el) { return getHeadingText(el); });
  }
  var headings = [];
  irRoot.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (node) {
    if (node.closest('.vditor-ir__preview')) return;
    if (!getHeadingText(node)) return;
    headings.push(node);
  });
  return headings;
}
function applyEditorScrollLayout(container, vditor) {
  if (!vditor || !vditor.vditor || !vditor.element) return;
  var ir = vditor.vditor.ir && vditor.vditor.ir.element;
  if (!ir) return;
  var h = container.clientHeight;
  if (h <= 0) return;
  var toolbar = vditor.element.querySelector('.vditor-toolbar');
  var toolbarH = toolbar ? toolbar.offsetHeight : 41;
  var bodyH = Math.max(120, h - toolbarH);
  ir.style.height = bodyH + 'px';
  ir.style.maxHeight = bodyH + 'px';
  ir.style.overflowY = 'auto';
}
function getScrollContainer(irRoot) {
  if (irRoot.scrollHeight > irRoot.clientHeight + 1) return irRoot;
  var vditorContent = irRoot.closest('.vditor-content');
  if (vditorContent && vditorContent.scrollHeight > vditorContent.clientHeight + 1) return vditorContent;
  return irRoot;
}
function scrollToElement(target, irRoot) {
  var heading = target.closest('h1,h2,h3,h4,h5,h6') || target;
  irRoot.scrollTop = Math.max(0, heading.offsetTop - 56);
}
`;

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('跳过 outline 测试（未安装 playwright）');
    return true;
  }

  const md = readFileSync(path.join(root, 'test-fixtures', 'production-report.md'), 'utf-8');
  const mdOutline = parseOutline(md);
  console.log('\n=== Markdown 大纲解析 ===');
  console.log('  条目数:', mdOutline.length, mdOutline.map((i) => i.text).join(' | '));
  if (mdOutline.length < 3) {
    console.error('  ✗ Markdown 解析失败');
    return false;
  }
  console.log('  ✓ Markdown 解析通过');

  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${port}`;

  await page.setContent('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>');
  await page.addStyleTag({ url: `${base}/vditor/dist/index.css` });
  await page.addScriptTag({ url: `${base}/vditor/dist/js/lute/lute.min.js` });
  await page.addScriptTag({ url: `${base}/vditor/dist/index.min.js` });
  await page.addStyleTag({
    content: `
      .editor-container { height: 200px; overflow: hidden; display: flex; flex-direction: column; }
      .editor-container .vditor { height: 100% !important; display: flex; flex-direction: column; }
      .editor-container .vditor-content { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .editor-container .vditor-ir { flex: 1; min-height: 0; overflow: auto; }
      .editor-container .vditor-ir pre.vditor-reset { overflow: auto; min-height: 0; }
    `,
  });
  await page.addScriptTag({ content: BROWSER_HELPERS });

  const fixtures = ['production-report.md', 'typora-syntax-test.md'];

  for (const fixture of fixtures) {
    const content = readFileSync(path.join(root, 'test-fixtures', fixture), 'utf-8');
    const result = await page.evaluate(async ({ content, cdnBase }) => {
      var padded = content + '\n\n' + Array.from({ length: 60 }, function (_, i) {
        return '段落填充行 ' + (i + 1);
      }).join('\n\n');

      await new Promise(function (resolve) {
        var host = document.getElementById('editor-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'editor-host';
          host.className = 'editor-container';
          host.style.height = '200px';
          host.style.overflow = 'hidden';
          document.body.appendChild(host);
        } else {
          host.innerHTML = '';
        }
        var el = document.createElement('div');
        el.id = 'editor';
        host.appendChild(el);
        var testVditor = new Vditor('editor', {
          height: '100%',
          minHeight: 120,
          cdn: cdnBase,
          mode: 'ir',
          cache: { enable: false },
          value: padded,
          preview: { markdown: { mark: true, footnotes: true, sanitize: false } },
          after: function () { setTimeout(resolve, 2500); },
        });
        window.__testVditor = testVditor;
      });

      var ir =
        document.querySelector('.vditor-ir pre.vditor-reset') ||
        document.querySelector('.vditor-ir');
      if (!ir) return { error: 'no ir root' };
      var host = document.getElementById('editor-host') || document.querySelector('.editor-container');
      if (host && window.__testVditor) applyEditorScrollLayout(host, window.__testVditor);

      var irNodes = ir.querySelectorAll('h1.vditor-ir__node,h2.vditor-ir__node,h3.vditor-ir__node');
      var allH = ir.querySelectorAll('h1,h2,h3,h4,h5,h6');
      var blocks = findIrHeadingBlocks(ir);

      var samples = [];
      allH.forEach(function (h, i) {
        if (i < 5) samples.push({
          tag: h.tagName,
          cls: h.className,
          text: getHeadingText(h),
          inPreview: !!h.closest('.vditor-ir__preview'),
        });
      });

      var scroller = getScrollContainer(ir);
      scroller.scrollTop = 0;
      var scrollable = scroller.scrollHeight > scroller.clientHeight + 4;
      var scrollBefore = scroller.scrollTop;
      var target = blocks[blocks.length - 1];
      if (target) scrollToElement(target, ir);
      await new Promise(function (r) { setTimeout(r, 300); });
      var scrollAfter = scroller.scrollTop;

      return {
        irNodeCount: irNodes.length,
        allHCount: allH.length,
        blockCount: blocks.length,
        samples,
        scrollable,
        scrollChanged: scrollAfter > scrollBefore,
        scrollAfter,
      };
    }, { content, cdnBase: `http://127.0.0.1:${port}/vditor` });

    console.log(`\n=== Vditor DOM: ${fixture} ===`);
    if (result.error) {
      console.error('  ✗', result.error);
      await browser.close();
      server.close();
      return false;
    }
    console.log('  IR h*.vditor-ir__node:', result.irNodeCount);
    console.log('  全部 h 标签:', result.allHCount);
    console.log('  findIrHeadingBlocks:', result.blockCount);
    console.log('  样本:', JSON.stringify(result.samples, null, 2));
    console.log('  可滚动:', result.scrollable);
    console.log('  滚动变化:', result.scrollChanged, 'scrollTop=', result.scrollAfter);

    if (result.blockCount === 0) {
      console.error('  ✗ DOM 未找到标题');
      await browser.close();
      server.close();
      return false;
    }
    console.log('  ✓ DOM 标题检测通过');
    if (result.scrollable && !result.scrollChanged) {
      console.error('  ✗ 滚动未变化');
      await browser.close();
      server.close();
      return false;
    }
    console.log('  ✓ 滚动跳转通过');
  }

  await browser.close();
  server.close();
  console.log('\n=== 大纲测试全部通过 ===\n');
  return true;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error(e);
    server.close();
    process.exit(1);
  });
