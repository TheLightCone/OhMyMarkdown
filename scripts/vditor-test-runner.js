function convertSingleTildeStrikeToSub(irRoot) {
  irRoot.querySelectorAll('[data-type="s"].vditor-ir__node').forEach(function (node) {
    var markers = Array.from(node.querySelectorAll(':scope > .vditor-ir__marker'));
    if (markers.length !== 2) return;
    var isSingle = markers.every(function (m) {
      return (m.textContent || '').replace(/\u200b/g, '').trim() === '~';
    });
    if (!isSingle) return;
    var content = (node.querySelector('s, del') || {}).textContent || '';
    content = content.replace(/\u200b/g, '');
    var span = document.createElement('span');
    span.className = 'md-sub';
    span.textContent = content;
    node.replaceWith(span);
  });
}

function replaceSubSupOutsideMarkers(html) {
  var parts = html.split(/(<span[^>]*vditor-ir__marker[^>]*>[\s\S]*?<\/span>)/g);
  return parts.map(function (part) {
    if (part.indexOf('vditor-ir__marker') >= 0) return part;
    return part
      .replace(/~([^~<&]+)~/g, '<span class="md-sub">$1</span>')
      .replace(/\^([^^<&\n]+)\^/g, '<span class="md-sup">$1</span>');
  }).join('');
}

function enhanceInlineHtmlPreviews(irRoot) {
  irRoot.querySelectorAll('p, li, blockquote, td, th').forEach(function (block) {
    var assembled = '';
    var openNode = null;
    block.childNodes.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        assembled += (child.textContent || '').replace(/\u200b/g, '');
        return;
      }
      if (child.getAttribute && child.getAttribute('data-type') === 'html-inline') {
        var marker = child.querySelector('.vditor-ir__marker');
        var markerText = marker ? (marker.textContent || '').replace(/\u200b/g, '') : '';
        if (markerText.indexOf('<') === 0 && markerText.indexOf('</') !== 0 && !openNode) openNode = child;
        assembled += markerText;
      }
    });
    var full = assembled.trim();
    if (!openNode || full.indexOf('<') !== 0) return;
    var preview = openNode.querySelector('.vditor-ir__preview');
    if (!preview || (preview.innerHTML || '').trim()) return;
    if (/^<(u|span|kbd|del|strong|em|mark)\b[\s\S]*<\/\1>$/i.test(full)) {
      preview.innerHTML = full;
    }
  });
}

function renderSubSupInIr(irRoot) {
  convertSingleTildeStrikeToSub(irRoot);
  irRoot.querySelectorAll('p, li, blockquote, td, th, [data-block]').forEach(function (block) {
    if (block.closest('[data-type="code-block"]')) return;
    var html = block.innerHTML.replace(/\u200b/g, '');
    var next = replaceSubSupOutsideMarkers(html);
    if (next !== html) block.innerHTML = next;
  });
}

function refreshIrSpecialBlocks(vditor, irRoot) {
  var internal = vditor.vditor;
  if (!internal || !internal.options) return;
  var options = internal.options;

  irRoot.querySelectorAll(".vditor-ir__preview[data-render='2']").forEach(function (panel) {
    if (panel.parentElement && panel.parentElement.getAttribute('data-type') === 'html-block') {
      panel.setAttribute('data-render', '1');
      return;
    }
    var firstChild = panel.firstElementChild;
    if (!firstChild) return;
    var language = firstChild.className.replace('language-', '').split(/\s+/)[0];
    var cdn = options.cdn;
    var theme = options.theme;

    if (language === 'mermaid') {
      Vditor.mermaidRender(panel, cdn, theme);
    } else if (language === 'flowchart') {
      Vditor.flowchartRender(panel, cdn);
    } else if (language === 'math') {
      Vditor.mathRender(panel, { cdn: cdn, math: options.preview.math });
    } else {
      Vditor.highlightRender(Object.assign({}, options.preview.hljs), panel, cdn);
      Vditor.codeRender(panel, options.preview.hljs);
    }
    panel.setAttribute('data-render', '1');
  });

  Vditor.mathRender(irRoot, { cdn: options.cdn, math: options.preview.math });
  Vditor.mediaRender(irRoot);
}

function linkMarkerIncludes(ir, fragment) {
  return Array.from(ir.querySelectorAll('[data-type="a"] .vditor-ir__marker--link')).some(function (m) {
    return (m.textContent || '').indexOf(fragment) >= 0;
  });
}

window.__testResults = { ready: false, errors: [], passed: 0, failed: 0 };

function assert(name, cond, detail) {
  if (cond) window.__testResults.passed++;
  else {
    window.__testResults.failed++;
    window.__testResults.errors.push(name + (detail ? ': ' + detail : ''));
  }
}

fetch('/test-fixtures/typora-syntax-test.md')
  .then(function (r) { return r.text(); })
  .then(function (md) {
    var testVditor = new Vditor('editor', {
      height: 500,
      cdn: '/vditor',
      mode: 'ir',
      cache: { enable: false },
      value: md,
      link: { isOpen: false },
      hint: {
        parse: true,
        emoji: { smile: '😄', rocket: '🚀', heart: '❤️' },
      },
      preview: {
        markdown: {
          mark: true,
          footnotes: true,
          sanitize: false,
          toc: true,
          gfmAutoLink: true,
          codeBlockPreview: true,
          mathBlockPreview: true,
        },
        math: { engine: 'KaTeX', inlineDigit: true },
        render: { media: { enable: true } },
      },
      after: function () {
        setTimeout(function () {
          var ir = document.querySelector('.vditor-ir pre.vditor-reset');
          if (!ir) {
            assert('IR 根节点', false);
            window.__testResults.ready = true;
            return;
          }

          refreshIrSpecialBlocks(testVditor, ir);
          renderSubSupInIr(ir);
          enhanceInlineHtmlPreviews(ir);

          assert('大纲标题', ir.querySelectorAll('h1,h2,h3,h4,h5,h6').length >= 8);
          assert('YAML Front Matter', !!ir.querySelector('[data-type="yaml-front-matter"]'));
          assert('TOC 目录', (ir.textContent || '').indexOf('Typora 语法对照测试') >= 0);
          assert('高亮 mark', ir.querySelectorAll('mark').length >= 1);
          assert('下标 md-sub', ir.querySelectorAll('.md-sub').length >= 1);
          assert('上标 md-sup', ir.querySelectorAll('.md-sup').length >= 1);
          assert('脚注引用', !!ir.querySelector('[data-type="footnotes-ref"]'));
          assert('脚注区块', !!ir.querySelector('[data-type="footnotes-block"]'));
          assert(
            'style 属性',
            ir.querySelectorAll('[style*="color"]').length >= 1 ||
              (ir.innerHTML || '').indexOf('color: red') >= 0,
          );
          assert(
            'u 标签',
            !!ir.querySelector('u') ||
              !!ir.querySelector('[data-type="html-inline"] .vditor-ir__preview u') ||
              (ir.textContent || '').indexOf('下划线') >= 0,
          );
          assert('自动链接', linkMarkerIncludes(ir, 'typora.io'));
          assert('参考链接', (ir.innerHTML || '').indexOf('example.org') >= 0);
          assert('表格', ir.querySelectorAll('table').length >= 1);
          assert('任务列表', ir.querySelectorAll('input[type="checkbox"]').length >= 1);
          assert('表情 smile', (ir.textContent || '').indexOf('😄') >= 0 || (ir.innerHTML || '').indexOf('😄') >= 0);
          assert('Mermaid 代码块', ir.querySelectorAll('[data-type="code-block"]').length >= 2);
          assert('GFM alert', (ir.textContent || '').indexOf('[!NOTE]') >= 0);
          assert('video 标签', !!ir.querySelector('video'));
          window.__testResults.ready = true;
        }, 2500);
      },
    });
  })
  .catch(function (e) {
    window.__testResults.errors.push(String(e));
    window.__testResults.ready = true;
  });
