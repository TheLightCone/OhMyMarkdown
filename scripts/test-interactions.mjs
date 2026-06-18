/**
 * 大纲点击跳转 + Ctrl+点击链接 集成测试
 * 运行: node scripts/test-interactions.mjs
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const port = 9881;

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
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
    return;
  }
  res.writeHead(404);
  res.end('404');
});

const INTERACTION_HELPERS = `
window.__externalCalls = [];
window.electronAPI = {
  openExternal: function (url) { window.__externalCalls.push(url); },
};

function parseLinkHref(raw) {
  var trimmed = (raw || '').replace(/\\u200b/g, '').trim();
  if (!trimmed) return '';
  var paren = trimmed.match(/^\\(([^)\\s]+)(?:\\s+["'][^"']*["'])?\\)$/);
  if (paren) return paren[1];
  var angle = trimmed.match(/^<([^>]+)>$/);
  if (angle) return angle[1];
  return trimmed;
}

function getHeadingText(heading) {
  var preview = heading.querySelector('.vditor-ir__preview');
  var fromPreview = preview && preview.textContent ? preview.textContent.replace(/\\u200b/g, '').trim() : '';
  if (fromPreview) return fromPreview;
  var clone = heading.cloneNode(true);
  clone.querySelectorAll('.vditor-ir__marker').forEach(function (m) { m.remove(); });
  return (clone.textContent || '').replace(/\\u200b/g, '').trim();
}

function findIrHeadingBlocks(irRoot) {
  var irNodes = irRoot.querySelectorAll('h1.vditor-ir__node,h2.vditor-ir__node,h3.vditor-ir__node,h4.vditor-ir__node,h5.vditor-ir__node,h6.vditor-ir__node');
  if (irNodes.length > 0) {
    return Array.from(irNodes).filter(function (el) { return getHeadingText(el); });
  }
  var headings = [];
  irRoot.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (node) {
    if (node.closest('.vditor-ir__preview')) return;
    if (!getHeadingText(node)) return;
    headings.push(node);
  });
  return headings;
}

function getScrollContainer(irRoot) {
  if (irRoot.scrollHeight > irRoot.clientHeight + 1) return irRoot;
  var vditorContent = irRoot.closest('.vditor-content');
  if (vditorContent && vditorContent.scrollHeight > vditorContent.clientHeight + 1) return vditorContent;
  return irRoot;
}

function scrollToElement(target, irRoot) {
  var heading = target.closest('h1,h2,h3,h4,h5,h6') || target;
  var scroller = getScrollContainer(irRoot);
  var toolbarOffset = 56;
  if (scroller === irRoot) {
    scroller.scrollTop = Math.max(0, heading.offsetTop - toolbarOffset);
  } else if (scroller.contains(heading)) {
    var targetRect = heading.getBoundingClientRect();
    var scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollTop = Math.max(0, targetRect.top - scrollerRect.top + scroller.scrollTop - toolbarOffset);
  } else {
    heading.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
}

function scrollToOutlineIndex(irRoot, index) {
  var blocks = findIrHeadingBlocks(irRoot);
  var target = blocks[index];
  if (!target) return false;
  scrollToElement(target, irRoot);
  return true;
}

function extractLinkHref(linkNode) {
  var marker = linkNode.querySelector(':scope > .vditor-ir__marker--link');
  var markerText = marker && marker.textContent ? marker.textContent.replace(/\\u200b/g, '').trim() : '';
  if (markerText) return parseLinkHref(markerText);
  var previewLink = linkNode.querySelector('.vditor-ir__preview a[href]');
  var href = previewLink ? (previewLink.getAttribute('href') || '').trim() : '';
  return href ? parseLinkHref(href) : '';
}

function resolveLinkFromEvent(target, irRoot) {
  if (!irRoot.contains(target)) return null;
  var previewAnchor = target.closest('.vditor-ir__preview a[href]');
  if (previewAnchor) {
    var href = (previewAnchor.getAttribute('href') || '').trim();
    if (href) return parseLinkHref(href);
  }
  var linkNode = target.closest('[data-type="a"]');
  if (linkNode) {
    var fromNode = extractLinkHref(linkNode);
    if (fromNode) return fromNode;
  }
  var marker = target.closest('.vditor-ir__marker--link');
  if (marker) {
    var fromMarker = parseLinkHref(marker.textContent.replace(/\\u200b/g, '') || '');
    if (fromMarker) return fromMarker;
  }
  return null;
}

function slugifyHeading(text) {
  return text.replace(/\\u200b/g, '').trim().toLowerCase()
    .replace(/[^\\w\\u4e00-\\u9fff\\s-]/g, '').replace(/\\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function scrollToHash(irRoot, hash) {
  var raw = decodeURIComponent(hash.replace(/^#/, '').trim().toLowerCase());
  if (!raw) return false;
  var target = null;
  findIrHeadingBlocks(irRoot).forEach(function (h) {
    var id = slugifyHeading(getHeadingText(h));
    if (id === raw) target = h;
  });
  if (target) {
    scrollToElement(target, irRoot);
    return true;
  }
  return false;
}

function handleModifierNavigation(event, irRoot) {
  if (!event.ctrlKey && !event.metaKey) return false;
  var href = resolveLinkFromEvent(event.target, irRoot);
  if (!href) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation && event.stopImmediatePropagation();
  if (href.indexOf('#') === 0) {
    scrollToHash(irRoot, href);
    return true;
  }
  window.electronAPI.openExternal(href);
  return true;
}

function applyEditorScrollLayout(container, vditor) {
  if (!vditor || !vditor.vditor || !vditor.element) return;
  var ir = vditor.vditor.ir && vditor.vditor.ir.element;
  if (!ir) return;
  var h = container.clientHeight;
  if (h <= 0) return;
  var vditorEl = vditor.element;
  var toolbar = vditorEl.querySelector('.vditor-toolbar');
  var toolbarH = toolbar ? toolbar.offsetHeight : 41;
  var bodyH = Math.max(120, h - toolbarH);
  vditorEl.style.height = h + 'px';
  vditorEl.style.overflow = 'hidden';
  ir.style.height = bodyH + 'px';
  ir.style.maxHeight = bodyH + 'px';
  ir.style.overflowY = 'auto';
}

function attachEditorInteraction(irRoot, panelRoot) {
  var onPointer = function (event) {
    if (event.button !== 0) return;
    if (!irRoot.contains(event.target)) return;
    handleModifierNavigation(event, irRoot);
  };
  document.addEventListener('mousedown', onPointer, true);
  document.addEventListener('click', onPointer, true);
}

function runCtrlNav(target, irRoot) {
  window.__externalCalls = [];
  return handleModifierNavigation({
    ctrlKey: true, metaKey: false, button: 0, target: target,
    preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {},
  }, irRoot);
}
`;

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('跳过 interactions 测试（未安装 playwright）');
    return true;
  }

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
      .editor-container { height: 220px; overflow: hidden; display: flex; flex-direction: column; }
      .editor-panel { height: 220px; display: flex; flex-direction: column; }
      .editor-container .vditor { height: 100% !important; display: flex; flex-direction: column; }
      .editor-container .vditor-content { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .editor-container .vditor-ir { flex: 1; min-height: 0; overflow: auto; }
      .editor-container .vditor-ir pre.vditor-reset { overflow: auto; min-height: 0; }
    `,
  });
  await page.addScriptTag({ content: INTERACTION_HELPERS });

  const md = readFileSync(path.join(root, 'test-fixtures', 'typora-syntax-test.md'), 'utf-8');
  const setup = await page.evaluate(async ({ content, cdnBase }) => {
    var padded = content + '\\n\\n' + Array.from({ length: 80 }, function (_, i) {
      return '填充段落 ' + (i + 1);
    }).join('\\n\\n');

    await new Promise(function (resolve) {
      var panel = document.createElement('div');
      panel.className = 'editor-panel';
      document.body.appendChild(panel);
      var host = document.createElement('div');
      host.className = 'editor-container';
      host.style.height = '220px';
      panel.appendChild(host);
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
        link: { isOpen: false, click: function () {} },
        preview: { markdown: { mark: true, footnotes: true, sanitize: false, gfmAutoLink: true } },
        after: function () { setTimeout(resolve, 2500); },
      });
      window.__testVditor = testVditor;
    });

    var ir = document.querySelector('.vditor-ir pre.vditor-reset') || document.querySelector('.vditor-ir');
    var panelRoot = document.querySelector('.editor-panel');
    var host = document.querySelector('.editor-container');
    if (!ir || !panelRoot || !host) return { error: 'no ir/panel root' };

    applyEditorScrollLayout(host, window.__testVditor);
    attachEditorInteraction(ir, panelRoot);

    var blocks = findIrHeadingBlocks(ir);
    var scroller = getScrollContainer(ir);
    scroller.scrollTop = 0;
    var scrollBefore = scroller.scrollTop;
    var jumped = scrollToOutlineIndex(ir, Math.min(5, blocks.length - 1));
    var scrollAfterJump = scroller.scrollTop;

    var externalNode = Array.from(ir.querySelectorAll('[data-type="a"]')).find(function (el) {
      var marker = el.querySelector('.vditor-ir__marker--link');
      var markerText = marker && marker.textContent ? marker.textContent : '';
      var previewHref = el.querySelector('.vditor-ir__preview a[href]');
      var href = previewHref ? previewHref.getAttribute('href') : '';
      return markerText.indexOf('example.com') >= 0 || (href && href.indexOf('example.com') >= 0);
    });
    var previewLink = externalNode
      ? (externalNode.querySelector('.vditor-ir__preview a[href]') || externalNode)
      : null;
    var ctrlWorked = externalNode ? runCtrlNav(previewLink || externalNode, ir) : false;
    var externalCalls = window.__externalCalls.slice();

    var hashLink = Array.from(ir.querySelectorAll('.vditor-ir__preview a[href]')).find(function (a) {
      return (a.getAttribute('href') || '').indexOf('#') === 0;
    }) || null;
    var hashWorked = false;
    if (hashLink && blocks.length > 2) {
      scroller.scrollTop = 0;
      runCtrlNav(hashLink, ir);
      hashWorked = scroller.scrollTop > 0;
    }

    return {
      blockCount: blocks.length,
      jumped,
      scrollBefore,
      scrollAfterJump,
      scrollable: scroller.scrollHeight > scroller.clientHeight + 4,
      hasExternalNode: !!externalNode,
      externalCalls,
      ctrlWorked,
      hasHashLink: !!hashLink,
      hashWorked,
    };
  }, { content: md, cdnBase: `${base}/vditor` });

  let listenerWorked = false;
  if (!setup.error && setup.hasExternalNode) {
    await page.evaluate(() => { window.__externalCalls = []; });
    const link = page.locator('[data-type="a"]').filter({ hasText: 'example.com' }).first();
    if (await link.count()) {
      await link.scrollIntoViewIfNeeded();
      await link.click({ modifiers: ['Control'], force: true });
      listenerWorked = await page.evaluate(() =>
        window.__externalCalls.some((u) => String(u).startsWith('http')),
      );
    }
  }

  console.log('\n=== 交互测试 ===');
  if (setup.error) {
    console.error('  ✗', setup.error);
    await browser.close();
    server.close();
    return false;
  }

  console.log('  标题数:', setup.blockCount);
  console.log('  可滚动:', setup.scrollable);
  console.log('  大纲跳转 scrollTop:', setup.scrollBefore, '->', setup.scrollAfterJump);

  let ok = true;
  if (!setup.jumped || setup.blockCount < 2) {
    console.error('  ✗ 大纲 index 跳转失败');
    ok = false;
  } else if (setup.scrollable && setup.scrollAfterJump <= setup.scrollBefore) {
    console.error('  ✗ 大纲跳转后 scrollTop 未变化');
    ok = false;
  } else {
    console.log('  ✓ 大纲点击跳转');
  }

  console.log('  外链节点:', setup.hasExternalNode, '调用:', setup.externalCalls.join(', ') || '(无)');
  if (!setup.hasExternalNode) {
    console.error('  ✗ 未找到测试用外链');
    ok = false;
  } else if (!setup.ctrlWorked || !setup.externalCalls.some((u) => /^https?:\/\//i.test(u))) {
    console.error('  ✗ Ctrl+点击外链逻辑失败');
    ok = false;
  } else {
    console.log('  ✓ Ctrl+点击外链逻辑');
  }

  if (!listenerWorked) {
    console.error('  ✗ Playwright Ctrl+点击未触发 openExternal');
    ok = false;
  } else {
    console.log('  ✓ Playwright Ctrl+点击监听器');
  }

  console.log('  锚点链接:', setup.hasHashLink, 'hash跳转:', setup.hashWorked);
  if (setup.hasHashLink && !setup.hashWorked) {
    console.error('  ✗ Ctrl+点击文档内锚点未滚动');
    ok = false;
  } else if (setup.hasHashLink) {
    console.log('  ✓ Ctrl+点击锚点跳转');
  }

  await browser.close();
  server.close();
  console.log(ok ? '\n=== 交互测试全部通过 ===\n' : '\n=== 交互测试失败 ===\n');
  return ok;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error(e);
    server.close();
    process.exit(1);
  });
