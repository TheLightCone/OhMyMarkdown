import type Vditor from 'vditor';
import type { OutlineItem } from '../types';
import { refreshIrSpecialBlocks } from './irRender';
import { getAlertLabel, slugifyHeading } from './markdownSyntax';
import { useAppStore } from '../stores/appStore';

declare global {
  interface Window {
    Lute?: { GetHeadingID?: (node: { HeadingLevel?: number; Text?: () => string }) => string };
  }
}

const GFM_ALERT_TYPES = new Set(['note', 'tip', 'important', 'warning', 'caution']);

function getIrElement(vditor: Vditor): HTMLElement | null {
  const internal = (vditor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  const fromInternal = internal?.ir?.element;
  if (fromInternal) return fromInternal;

  const root = (vditor as unknown as { element?: HTMLElement }).element;
  return (
    root?.querySelector('.vditor-ir pre.vditor-reset') ??
    root?.querySelector('.vditor-ir') ??
    findIrRootInDocument()
  );
}

export function findIrRootInDocument(): HTMLElement | null {
  return (
    document.querySelector('.editor-container .vditor-ir pre.vditor-reset') ??
    document.querySelector('.editor-container .vditor-ir') ??
    null
  ) as HTMLElement | null;
}

function getScrollContainer(irRoot: HTMLElement): HTMLElement {
  // Vditor 非 auto 高度时在 IR pre 上滚动（见 clickToc）
  if (irRoot.scrollHeight > irRoot.clientHeight + 1) {
    return irRoot;
  }

  const vditorContent = irRoot.closest('.vditor-content') as HTMLElement | null;
  if (vditorContent && vditorContent.scrollHeight > vditorContent.clientHeight + 1) {
    return vditorContent;
  }

  const vditorIr = irRoot.closest('.vditor-ir') as HTMLElement | null;
  if (vditorIr && vditorIr.scrollHeight > vditorIr.clientHeight + 1) {
    return vditorIr;
  }

  return vditorContent ?? irRoot;
}

function getHeadingScrollTarget(block: HTMLElement): HTMLElement {
  return (
    (block.closest('h1.vditor-ir__node, h2.vditor-ir__node, h3.vditor-ir__node, h4.vditor-ir__node, h5.vditor-ir__node, h6.vditor-ir__node') as HTMLElement | null) ??
    (block.closest('h1, h2, h3, h4, h5, h6') as HTMLElement | null) ??
    block
  );
}

/** 从 IR 链接 marker 或 Markdown 括号语法解析 URL */
export function parseLinkHref(raw: string): string {
  const trimmed = raw.replace(/\u200b/g, '').trim();
  if (!trimmed) return '';

  const paren = trimmed.match(/^\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
  if (paren) return paren[1];

  const angle = trimmed.match(/^<([^>]+)>$/);
  if (angle) return angle[1];

  return trimmed;
}

function normalizeHeadingText(text: string): string {
  return text.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

let pinnedOutlineIndex: number | null = null;
let pinnedUntil = 0;

/** 跳转后短暂锁定大纲高亮，避免滚动动画期间被 scroll 同步覆盖 */
export function pinActiveOutlineIndex(index: number, ms = 900): void {
  pinnedOutlineIndex = index;
  pinnedUntil = Date.now() + ms;
}

export function getPinnedOutlineIndex(): number | null {
  if (pinnedOutlineIndex === null || Date.now() >= pinnedUntil) {
    pinnedOutlineIndex = null;
    return null;
  }
  return pinnedOutlineIndex;
}

function findOutlineIndexForHeading(
  outline: OutlineItem[],
  headingEl: HTMLElement,
  allDomHeadings?: HTMLElement[],
): number | null {
  const slug = (headingEl.id || headingEl.getAttribute('data-heading-id') || '').toLowerCase();
  if (slug) {
    const bySlug = outline.find((o) => (o.slug || '').toLowerCase() === slug);
    if (bySlug) return bySlug.index;
  }

  const text = normalizeHeadingText(getHeadingText(headingEl));
  const level = parseInt(headingEl.tagName[1], 10);

  if (allDomHeadings && allDomHeadings.length > 0) {
    let domOccurrence = 0;
    for (const h of allDomHeadings) {
      if (h === headingEl) break;
      if (parseInt(h.tagName[1], 10) === level && normalizeHeadingText(getHeadingText(h)) === text) {
        domOccurrence += 1;
      }
    }
    let seen = 0;
    for (const item of outline) {
      if (item.level === level && normalizeHeadingText(item.text) === text) {
        if (seen === domOccurrence) return item.index;
        seen += 1;
      }
    }
    return null;
  }

  let match: number | null = null;
  for (const item of outline) {
    if (item.level === level && normalizeHeadingText(item.text) === text) {
      match = item.index;
    }
  }
  return match;
}

function activateOutlineForDomHeading(heading: HTMLElement, irRoot: HTMLElement): void {
  const outline = useAppStore.getState().outline;
  if (outline.length === 0) return;
  const idx = findOutlineIndexForHeading(outline, heading, collectIrHeadings(irRoot));
  if (idx === null) return;
  pinActiveOutlineIndex(idx);
  useAppStore.getState().setActiveOutlineIndex(idx);
}

/** IR 模式标题块：优先 .vditor-ir__node，排除 preview 内嵌套重复 h 标签 */
function findIrHeadingBlocks(irRoot: HTMLElement): HTMLElement[] {
  const irNodes = irRoot.querySelectorAll(
    'h1.vditor-ir__node, h2.vditor-ir__node, h3.vditor-ir__node, h4.vditor-ir__node, h5.vditor-ir__node, h6.vditor-ir__node',
  );
  if (irNodes.length > 0) {
    return Array.from(irNodes).filter((el) => getHeadingText(el as HTMLElement)) as HTMLElement[];
  }

  const headings: HTMLElement[] = [];
  irRoot.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((node) => {
    const heading = node as HTMLElement;
    if (heading.closest('.vditor-ir__preview')) return;
    if (!getHeadingText(heading)) return;
    headings.push(heading);
  });
  return headings;
}

function scrollToIrHeadingBlock(heading: HTMLElement, irRoot: HTMLElement): void {
  const block =
    (heading.classList.contains('vditor-ir__node') ? heading : null) ??
    (heading.closest('h1.vditor-ir__node, h2.vditor-ir__node, h3.vditor-ir__node, h4.vditor-ir__node, h5.vditor-ir__node, h6.vditor-ir__node') as HTMLElement | null) ??
    (heading.closest('.vditor-ir__node') as HTMLElement | null) ??
    (heading.closest('[data-block]') as HTMLElement | null) ??
    heading;
  scrollToElement(block, irRoot);
}

function collectIrHeadings(irRoot: HTMLElement): HTMLElement[] {
  return findIrHeadingBlocks(irRoot);
}

/** 根据光标位置返回当前所在大纲标题索引（与 outline[].index 对齐） */
export function getActiveOutlineIndexAtCursor(vditor: Vditor, outline: OutlineItem[]): number | null {
  const irRoot = getIrElement(vditor);
  if (!irRoot || outline.length === 0) return null;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  let node: Node | null = selection.anchorNode;
  if (!node) return null;

  const irEditor = (vditor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor?.ir?.element;
  const inEditor = irRoot.contains(node) || irEditor?.contains(node);
  if (!inEditor) return null;

  const cursorBlock = findCursorIrBlock(node, irRoot) ?? (irEditor ? findCursorIrBlock(node, irEditor) : null);
  if (!cursorBlock) return null;

  const blocks = getTopLevelIrBlocks(irRoot);
  if (blocks.length === 0) return null;

  let cursorBlockIndex = blocks.findIndex((block) => block === cursorBlock || block.contains(cursorBlock));
  if (cursorBlockIndex < 0) return null;

  let lastHeadingBlock: HTMLElement | null = null;
  for (let i = cursorBlockIndex; i >= 0; i--) {
    if (isIrHeadingBlock(blocks[i])) {
      lastHeadingBlock = blocks[i];
      break;
    }
  }

  if (!lastHeadingBlock) return null;

  return findOutlineIndexForHeading(outline, lastHeadingBlock, findIrHeadingBlocks(irRoot));
}

function findCursorIrBlock(node: Node, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.classList.contains('vditor-ir__node')) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function getTopLevelIrBlocks(irRoot: HTMLElement): HTMLElement[] {
  const direct = Array.from(irRoot.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains('vditor-ir__node'),
  );
  if (direct.length > 0) return direct;

  return Array.from(irRoot.querySelectorAll('.vditor-ir__node')).filter(
    (node) => node.parentElement === irRoot,
  ) as HTMLElement[];
}

function isIrHeadingBlock(block: HTMLElement): boolean {
  return /^H[1-6]$/i.test(block.tagName) && block.classList.contains('vditor-ir__node');
}

/** 从 Markdown 源码估算光标行号并匹配大纲 */
function getActiveOutlineIndexFromMarkdownLine(vditor: Vditor, outline: OutlineItem[]): number | null {
  const markdown = vditor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const line = getMarkdownCursorLine(vditor, markdown);
  if (line === null) return null;

  let active: number | null = null;
  for (const item of outline) {
    if (item.line <= line) active = item.index;
    else break;
  }
  return active;
}

function getMarkdownCursorLine(vditor: Vditor, markdown: string): number | null {
  const irRoot = getIrElement(vditor);
  const selection = window.getSelection();
  if (!irRoot || !selection?.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!irRoot.contains(range.startContainer)) return null;

  try {
    const preRange = range.cloneRange();
    preRange.selectNodeContents(irRoot);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString().replace(/\u200b/g, '');
    const irText = (irRoot.textContent ?? '').replace(/\u200b/g, '');
    if (!irText) return 0;

    const ratio = Math.min(1, textBefore.length / irText.length);
    const mdPos = Math.floor(ratio * markdown.length);
    return markdown.slice(0, mdPos).split('\n').length - 1;
  } catch {
    return getApproximateCursorLine(vditor);
  }
}

/** 解析当前应高亮的大纲项（光标优先，滚动次之） */
export function resolveActiveOutlineIndex(
  vditor: Vditor,
  outline: OutlineItem[],
  preferScroll = false,
): number | null {
  const pinned = getPinnedOutlineIndex();
  if (pinned !== null) return pinned;

  const fromCursor = getActiveOutlineIndexAtCursor(vditor, outline);
  const fromScroll = getActiveOutlineIndexFromScroll(vditor, outline);

  if (preferScroll) {
    return fromScroll ?? fromCursor;
  }
  return fromCursor ?? fromScroll;
}

function getApproximateCursorLine(vditor: Vditor): number | null {
  const irRoot = getIrElement(vditor);
  const selection = window.getSelection();
  if (!irRoot || !selection?.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!irRoot.contains(range.startContainer)) return null;

  try {
    const preRange = range.cloneRange();
    preRange.selectNodeContents(irRoot);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    return textBefore.split('\n').length - 1;
  } catch {
    return null;
  }
}

/** 根据编辑器滚动位置返回当前可见区域对应的标题索引 */
export function getActiveOutlineIndexFromScroll(vditor: Vditor, outline: OutlineItem[]): number | null {
  const irRoot = getIrElement(vditor);
  if (!irRoot || outline.length === 0) return null;

  const scroller = getScrollContainer(irRoot);
  const scrollerRect = scroller.getBoundingClientRect();
  const threshold = scrollerRect.top + 72;

  const headings = findIrHeadingBlocks(irRoot);
  if (headings.length === 0) {
    return getActiveOutlineIndexFromMarkdownLine(vditor, outline);
  }

  let domHeadingIndex = -1;
  for (let i = 0; i < headings.length; i++) {
    const rect = headings[i].getBoundingClientRect();
    if (rect.top <= threshold + 12) {
      domHeadingIndex = i;
    } else if (rect.top > scrollerRect.bottom) {
      break;
    }
  }

  if (domHeadingIndex < 0) return null;

  return findOutlineIndexForHeading(outline, headings[domHeadingIndex], headings);
}

export function attachOutlineCursorSync(
  vditor: Vditor,
  onActiveIndex: (index: number | null) => void,
): () => void {
  let rafId = 0;
  let lastIndex: number | null = null;

  const sync = (preferScroll = false) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const outline = useAppStore.getState().outline;
      const next = resolveActiveOutlineIndex(vditor, outline, preferScroll);
      if (next === null || next === lastIndex) return;
      lastIndex = next;
      onActiveIndex(next);
    });
  };

  const onScroll = () => sync(true);
  const onSelectionChange = () => sync(false);
  const onEditorInteraction = () => sync(false);

  document.addEventListener('selectionchange', onSelectionChange);
  const bindRoot = () => getIrElement(vditor);
  const irRoot = bindRoot();
  irRoot?.addEventListener('keyup', onEditorInteraction);
  irRoot?.addEventListener('mouseup', onEditorInteraction);
  irRoot?.addEventListener('click', onEditorInteraction);
  irRoot?.addEventListener('input', onEditorInteraction);

  const scroller = irRoot ? getScrollContainer(irRoot) : null;
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  const vditorIr = irRoot?.closest('.vditor-ir') as HTMLElement | null;
  if (vditorIr && vditorIr !== scroller) {
    vditorIr.addEventListener('scroll', onScroll, { passive: true });
  }

  sync(true);

  return () => {
    cancelAnimationFrame(rafId);
    document.removeEventListener('selectionchange', onSelectionChange);
    const root = bindRoot();
    root?.removeEventListener('keyup', onEditorInteraction);
    root?.removeEventListener('mouseup', onEditorInteraction);
    root?.removeEventListener('click', onEditorInteraction);
    root?.removeEventListener('input', onEditorInteraction);
    scroller?.removeEventListener('scroll', onScroll);
    vditorIr?.removeEventListener('scroll', onScroll);
  };
}

export function scrollToElement(target: HTMLElement, irRoot: HTMLElement): void {
  const heading = getHeadingScrollTarget(target);
  const toolbarOffset = 56;

  // 与 Vditor clickToc 一致：优先在 IR pre 上滚动
  irRoot.scrollTop = Math.max(0, heading.offsetTop - toolbarOffset);

  // 若 IR pre 未产生滚动条，尝试外层可滚动容器
  if (irRoot.scrollTop === 0 && heading.offsetTop > toolbarOffset) {
    const scroller = getScrollContainer(irRoot);
    if (scroller !== irRoot && scroller.contains(heading)) {
      const targetRect = heading.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      scroller.scrollTop = Math.max(0, targetRect.top - scrollerRect.top + scroller.scrollTop - toolbarOffset);
    }
  }

  heading.classList.add('vditor-heading-flash');
  window.setTimeout(() => heading.classList.remove('vditor-heading-flash'), 1200);
}

function computeHeadingSlug(heading: HTMLElement, level: number, text: string): string {
  let slug = slugifyHeading(text);
  if (window.Lute?.GetHeadingID) {
    try {
      slug = window.Lute.GetHeadingID({ HeadingLevel: level, Text: () => text });
    } catch {
      // fallback
    }
  }
  return slug;
}

function getHeadingText(heading: HTMLElement): string {
  const preview = heading.querySelector('.vditor-ir__preview');
  const fromPreview = preview?.textContent?.replace(/\u200b/g, '').trim();
  if (fromPreview) return fromPreview;

  const clone = heading.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.vditor-ir__marker').forEach((m) => m.remove());
  return clone.textContent?.replace(/\u200b/g, '').trim() ?? '';
}

export function assignHeadingIds(irRoot: HTMLElement): Map<string, HTMLElement> {
  const slugCount = new Map<string, number>();
  const slugToElement = new Map<string, HTMLElement>();

  findIrHeadingBlocks(irRoot).forEach((heading) => {
    const text = getHeadingText(heading);
    if (!text) return;

    const level = parseInt(heading.tagName[1], 10);
    let slug = computeHeadingSlug(heading, level, text);
    const count = slugCount.get(slug) ?? 0;
    slugCount.set(slug, count + 1);
    const id = count === 0 ? slug : `${slug}-${count}`;
    heading.id = id;
    heading.setAttribute('data-heading-id', id);
    slugToElement.set(id, heading);
  });

  return slugToElement;
}

export function extractOutlineFromIr(irRoot: HTMLElement): OutlineItem[] {
  assignHeadingIds(irRoot);
  const items: OutlineItem[] = [];

  findIrHeadingBlocks(irRoot).forEach((heading, index) => {
    const text = getHeadingText(heading);
    if (!text) return;

    const level = parseInt(heading.tagName[1], 10);
    const slug = heading.id || heading.getAttribute('data-heading-id') || slugifyHeading(text);
    items.push({
      level,
      text,
      line: index,
      index: items.length,
      id: `heading-${items.length}`,
      slug,
    });
  });

  return items;
}

export function scrollToHash(vditor: Vditor, hash: string): boolean {
  const irRoot = getIrElement(vditor);
  if (!irRoot) return false;

  assignHeadingIds(irRoot);
  const raw = decodeURIComponent(hash.replace(/^#/, '').trim().toLowerCase());
  if (!raw) return false;

  let target: HTMLElement | null = null;
  const normalized = raw.toLowerCase();

  irRoot.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const el = h as HTMLElement;
    if (el.closest('.vditor-ir__preview')) return;
    const text = getHeadingText(el);
    const id = (el.id || el.getAttribute('data-heading-id') || slugifyHeading(text)).toLowerCase();
    if (id === normalized || slugifyHeading(text) === normalized) {
      target = el;
    }
  });

  if (!target) {
    target =
      irRoot.querySelector(`#${CSS.escape(raw)}`) ??
      irRoot.querySelector(`[data-heading-id="${CSS.escape(raw)}"]`) as HTMLElement | null;
  }

  if (target) {
    scrollToIrHeadingBlock(target, irRoot);
    activateOutlineForDomHeading(target, irRoot);
    return true;
  }
  return false;
}

/** 按大纲项定位并滚动到编辑器内对应标题 */
export function scrollToOutlineItem(
  vditor: Vditor,
  item: OutlineItem,
  allItems: OutlineItem[] = [],
): boolean {
  const irRoot = getIrElement(vditor);
  if (!irRoot) return false;

  assignHeadingIds(irRoot);

  const focusEditor = () => {
    try {
      vditor.focus();
    } catch {
      // ignore
    }
  };

  if (item.slug) {
    const slug = item.slug;
    const bySlug =
      irRoot.querySelector(`#${CSS.escape(slug)}`) ??
      irRoot.querySelector(`[data-heading-id="${CSS.escape(slug)}"]`);
    if (bySlug) {
      scrollToIrHeadingBlock(bySlug as HTMLElement, irRoot);
      pinActiveOutlineIndex(item.index);
      useAppStore.getState().setActiveOutlineIndex(item.index);
      focusEditor();
      return true;
    }
  }

  const headings = collectIrHeadings(irRoot);
  const byIndex = headings[item.index];
  if (byIndex) {
    scrollToIrHeadingBlock(byIndex, irRoot);
    pinActiveOutlineIndex(item.index);
    useAppStore.getState().setActiveOutlineIndex(item.index);
    focusEditor();
    return true;
  }

  let occurrence = 0;
  for (const o of allItems) {
    if (o.index >= item.index) break;
    if (o.level === item.level && o.text === item.text) occurrence += 1;
  }

  let seen = 0;
  const targetText = normalizeHeadingText(item.text);
  for (const h of headings) {
    const text = normalizeHeadingText(getHeadingText(h));
    const level = parseInt(h.tagName[1], 10);
    if (text === targetText && level === item.level) {
      if (seen === occurrence) {
        scrollToIrHeadingBlock(h, irRoot);
        pinActiveOutlineIndex(item.index);
        useAppStore.getState().setActiveOutlineIndex(item.index);
        focusEditor();
        return true;
      }
      seen += 1;
    }
  }

  return false;
}

export function scrollToOutlineIndex(vditor: Vditor, outlineIndex: number): boolean {
  const irRoot = getIrElement(vditor);
  if (!irRoot) return false;

  assignHeadingIds(irRoot);
  const headings = collectIrHeadings(irRoot);
  const target = headings[outlineIndex] as HTMLElement | undefined;
  if (!target) return false;

  scrollToIrHeadingBlock(target, irRoot);
  try {
    vditor.focus();
  } catch {
    // ignore
  }
  return true;
}

export function scrollToHeadingSlug(vditor: Vditor, slug: string): boolean {
  if (!slug) return false;
  return scrollToHash(vditor, `#${slug}`);
}

export function scrollToOutlineLine(vditor: Vditor, line: number, outlineLines: number[]): boolean {
  const index = outlineLines.indexOf(line);
  if (index >= 0) return scrollToOutlineIndex(vditor, index);
  return scrollToOutlineIndex(vditor, line);
}

function convertSingleTildeStrikeToSub(irRoot: HTMLElement): void {
  irRoot.querySelectorAll('[data-type="s"].vditor-ir__node').forEach((node) => {
    const markers = Array.from(node.querySelectorAll(':scope > .vditor-ir__marker'));
    if (markers.length !== 2) return;
    const isSingleTilde = markers.every((m) => m.textContent?.replace(/\u200b/g, '').trim() === '~');
    if (!isSingleTilde) return;

    const content = node.querySelector('s, del')?.textContent?.replace(/\u200b/g, '') ?? '';
    const span = document.createElement('span');
    span.className = 'md-sub';
    span.textContent = content;
    node.replaceWith(span);
  });
}

function replaceSubSupOutsideMarkers(html: string): string {
  const parts = html.split(/(<span[^>]*vditor-ir__marker[^>]*>[\s\S]*?<\/span>)/g);
  return parts
    .map((part) => {
      if (part.includes('vditor-ir__marker')) return part;
      return part
        .replace(/~([^~<&]+)~/g, '<span class="md-sub">$1</span>')
        .replace(/\^([^^<&\n]+)\^/g, '<span class="md-sup">$1</span>');
    })
    .join('');
}

function enhanceInlineHtmlPreviews(irRoot: HTMLElement): void {
  irRoot.querySelectorAll('p, li, blockquote, td, th').forEach((block) => {
    const el = block as HTMLElement;
    let assembled = '';
    let openNode: HTMLElement | null = null;

    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        assembled += child.textContent?.replace(/\u200b/g, '') ?? '';
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      if (child.getAttribute('data-type') === 'html-inline') {
        const marker = child.querySelector('.vditor-ir__marker')?.textContent?.replace(/\u200b/g, '') ?? '';
        if (marker.startsWith('<') && !marker.startsWith('</') && !openNode) {
          openNode = child;
        }
        assembled += marker;
      }
    });

    const full = assembled.trim();
    if (!openNode || !/^<[a-z]/i.test(full)) return;

    const preview = openNode.querySelector('.vditor-ir__preview') as HTMLElement | null;
    if (!preview || preview.innerHTML.trim()) return;

    if (/^<(u|span|kbd|del|strong|em|mark)\b[\s\S]*<\/\1>$/i.test(full)) {
      preview.innerHTML = full;
    }
  });
}

function renderSubSupInIr(irRoot: HTMLElement): void {
  const text = irRoot.textContent ?? '';
  if (!/[~^]/.test(text)) return;

  convertSingleTildeStrikeToSub(irRoot);

  irRoot.querySelectorAll('p, li, blockquote, td, th').forEach((block) => {
    const el = block as HTMLElement;
    if (el.closest('[data-type="code-block"]')) return;
    if (/^H[1-6]$/.test(el.tagName)) return;
    const html = el.innerHTML.replace(/\u200b/g, '');
    const next = replaceSubSupOutsideMarkers(html);
    if (next !== html) el.innerHTML = next;
  });
}

function findBlockquoteRoot(node: Element): HTMLElement | null {
  const typed = node.closest('[data-type="blockquote"]') as HTMLElement | null;
  if (typed) return typed;
  const block = node.closest('[data-block]') as HTMLElement | null;
  if (block?.querySelector('blockquote')) return block;
  if (node.tagName === 'BLOCKQUOTE') return node as HTMLElement;
  return null;
}

function enhanceGfmAlerts(irRoot: HTMLElement): void {
  const seen = new Set<HTMLElement>();

  irRoot.querySelectorAll('[data-type="blockquote"], blockquote[data-block], blockquote, [data-block]').forEach((block) => {
    const root = findBlockquoteRoot(block);
    if (!root || seen.has(root)) return;

    const text = root.textContent?.replace(/\u200b/g, '') ?? '';
    const match = text.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (!match) {
      root.classList.remove('md-alert');
      GFM_ALERT_TYPES.forEach((t) => root.classList.remove(`md-alert-${t}`));
      root.removeAttribute('data-alert-type');
      return;
    }

    seen.add(root);
    const type = match[1].toLowerCase();
    root.classList.add('md-alert', `md-alert-${type}`);
    root.setAttribute('data-alert-type', type);
    root.setAttribute('data-alert-label', getAlertLabel(type));

    if (root.tagName === 'BLOCKQUOTE') {
      root.classList.add('md-alert-inner', `md-alert-${type}`);
    }

    root.querySelectorAll('.vditor-ir__preview blockquote, blockquote').forEach((bq) => {
      if (bq.closest('[data-type="blockquote"]') && bq.closest('[data-type="blockquote"]') !== root) return;
      bq.classList.add('md-alert-inner', `md-alert-${type}`);
      bq.setAttribute('data-alert-label', getAlertLabel(type));
    });
  });
}

function getFootnoteDefContent(def: Element): string {
  const preview = def.querySelector('.vditor-ir__preview');
  const source = preview ?? def;
  return (source.textContent ?? '')
    .replace(/^\[\^[^\]]+\]:\s*/, '')
    .replace(/\u200b/g, '')
    .trim();
}

function enrichFootnoteRefs(irRoot: HTMLElement): void {
  const defs = new Map<string, string>();
  irRoot.querySelectorAll('[data-type="footnotes-def"]').forEach((node) => {
    const def = node as HTMLElement;
    const label = def.getAttribute('data-footnotes-label');
    if (!label) return;
    const content = getFootnoteDefContent(def);
    if (content) defs.set(label, content);
  });

  irRoot.querySelectorAll('[data-type="footnotes-ref"]').forEach((node) => {
    const ref = node as HTMLElement;
    const label = ref.getAttribute('data-footnotes-label');
    if (!label) return;

    const content = defs.get(label) ?? '';
    if (content) {
      ref.setAttribute('data-footnote-tip', content);
      ref.setAttribute('title', content);
    } else {
      ref.removeAttribute('data-footnote-tip');
      ref.removeAttribute('title');
    }
  });
}

export function enhanceEditorDom(vditor: Vditor): OutlineItem[] {
  const irRoot = getIrElement(vditor);
  if (!irRoot) return [];
  refreshIrSpecialBlocks(vditor, irRoot);
  renderSubSupInIr(irRoot);
  enhanceInlineHtmlPreviews(irRoot);
  assignHeadingIds(irRoot);
  enhanceGfmAlerts(irRoot);
  enrichFootnoteRefs(irRoot);
  return extractOutlineFromIr(irRoot);
}

function extractLinkHref(linkNode: HTMLElement): string {
  const marker = linkNode.querySelector(':scope > .vditor-ir__marker--link') as HTMLElement | null;
  const markerText = marker?.textContent?.replace(/\u200b/g, '').trim() ?? '';
  if (markerText) return parseLinkHref(markerText);

  const previewLink = linkNode.querySelector('.vditor-ir__preview a[href]') as HTMLAnchorElement | null;
  const href = previewLink?.getAttribute('href')?.trim() ?? '';
  return href ? parseLinkHref(href) : '';
}

function openExternalLink(href: string): void {
  if (!href) return;
  const url = parseLinkHref(href);
  if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) {
    void window.electronAPI?.openExternal?.(url);
  }
}

export function createLinkClickHandler(vditor: Vditor) {
  return (marker: HTMLElement | null) => {
    const linkNode = marker?.closest('[data-type="a"]') as HTMLElement | null;
    const href = linkNode
      ? extractLinkHref(linkNode)
      : parseLinkHref(marker?.textContent?.replace(/\u200b/g, '') ?? '');
    if (!href) return;

    if (href.startsWith('#')) {
      scrollToHash(vditor, href);
    }
  };
}

function resolveLinkFromTarget(target: HTMLElement, irRoot: HTMLElement): string | null {
  if (!irRoot.contains(target)) return null;

  const previewAnchor = target.closest('.vditor-ir__preview a[href]') as HTMLAnchorElement | null;
  if (previewAnchor) {
    const href = previewAnchor.getAttribute('href')?.trim() ?? '';
    if (href) return parseLinkHref(href);
  }

  const linkNode = target.closest('[data-type="a"]') as HTMLElement | null;
  if (linkNode) {
    const href = extractLinkHref(linkNode);
    if (href) return href;
  }

  const marker = target.closest('.vditor-ir__marker--link') as HTMLElement | null;
  if (marker) {
    const href = parseLinkHref(marker.textContent?.replace(/\u200b/g, '') ?? '');
    if (href) return href;
  }

  return null;
}

function scrollToHashInIr(irRoot: HTMLElement, hash: string): boolean {
  assignHeadingIds(irRoot);
  const raw = decodeURIComponent(hash.replace(/^#/, '').trim().toLowerCase());
  if (!raw) return false;

  let target: HTMLElement | null = null;
  findIrHeadingBlocks(irRoot).forEach((h) => {
    const text = getHeadingText(h);
    const id = (h.id || h.getAttribute('data-heading-id') || slugifyHeading(text)).toLowerCase();
    if (id === raw || slugifyHeading(text) === raw) target = h;
  });

  if (!target) {
    target =
      irRoot.querySelector(`#${CSS.escape(raw)}`) ??
      irRoot.querySelector(`[data-heading-id="${CSS.escape(raw)}"]`) as HTMLElement | null;
  }

  if (!target) return false;
  scrollToIrHeadingBlock(target, irRoot);
  activateOutlineForDomHeading(target, irRoot);
  return true;
}

export function jumpToOutlineWithVditor(
  vditor: Vditor,
  item: OutlineItem,
  allItems: OutlineItem[],
): boolean {
  enhanceEditorDom(vditor);
  return scrollToOutlineItem(vditor, item, allItems);
}

export function jumpToOutlineInDom(item: OutlineItem, allItems: OutlineItem[]): boolean {
  const irRoot = findIrRootInDocument();
  if (!irRoot) return false;

  assignHeadingIds(irRoot);
  const headings = collectIrHeadings(irRoot);

  if (item.slug) {
    const bySlug =
      irRoot.querySelector(`#${CSS.escape(item.slug)}`) ??
      irRoot.querySelector(`[data-heading-id="${CSS.escape(item.slug)}"]`);
    if (bySlug) {
      scrollToIrHeadingBlock(bySlug as HTMLElement, irRoot);
      return true;
    }
  }

  const byIndex = headings[item.index];
  if (byIndex) {
    scrollToIrHeadingBlock(byIndex, irRoot);
    return true;
  }

  const targetText = normalizeHeadingText(item.text);
  for (const h of headings) {
    if (normalizeHeadingText(getHeadingText(h)) === targetText && parseInt(h.tagName[1], 10) === item.level) {
      scrollToIrHeadingBlock(h, irRoot);
      return true;
    }
  }

  return false;
}

export function handleCtrlLinkNavigation(event: MouseEvent, vditor: Vditor | null): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;

  const target = event.target as HTMLElement;
  const irRoot = (vditor ? getIrElement(vditor) : null) ?? findIrRootInDocument();
  if (!irRoot?.contains(target)) return false;

  const fnLink = target.closest('.vditor-ir__preview a[href^="#fn"]') as HTMLAnchorElement | null;
  if (fnLink && vditor) {
    event.preventDefault();
    event.stopPropagation();
    const label = fnLink.getAttribute('href')?.replace(/^#fn-?/i, '') ?? '';
    if (label) scrollToFootnote(vditor, label);
    return true;
  }

  const href = resolveLinkFromTarget(target, irRoot);
  if (!href) return false;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (href.startsWith('#')) {
    scrollToHashInIr(irRoot, href);
    return true;
  }

  openExternalLink(href);
  return true;
}

export function scrollToFootnote(vditor: Vditor, label: string): boolean {
  const irRoot = getIrElement(vditor);
  if (!irRoot) return false;

  const def =
    irRoot.querySelector(`[data-type="footnotes-def"][data-footnotes-label="${label}"]`) ??
    irRoot.querySelector(`[data-type="footnotes-block"] [data-footnotes-label="${label}"]`);

  if (!def) return false;
  scrollToElement(def as HTMLElement, irRoot);
  return true;
}

export function attachEditorInteraction(vditor: Vditor, _container: HTMLElement): () => void {
  const onPointer = (event: MouseEvent) => {
    if (event.button !== 0) return;
    handleCtrlLinkNavigation(event, vditor);
  };

  document.addEventListener('mousedown', onPointer, true);
  document.addEventListener('click', onPointer, true);
  return () => {
    document.removeEventListener('mousedown', onPointer, true);
    document.removeEventListener('click', onPointer, true);
  };
}

export function getVditorIrElement(vditor: Vditor): HTMLElement | null {
  return getIrElement(vditor);
}
