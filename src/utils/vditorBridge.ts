import type Vditor from 'vditor';
import type { OutlineItem } from '../types';
import {
  enhanceEditorDom,
  jumpToOutlineInDom,
  jumpToOutlineWithVditor,
} from './editorEnhancements';

let activeVditor: Vditor | null = null;
let editorContainer: HTMLElement | null = null;

export function setActiveVditor(vditor: Vditor | null, container?: HTMLElement | null): void {
  activeVditor = vditor;
  if (container !== undefined) {
    editorContainer = container;
  }
  if (container && vditor) {
    (container as HTMLElement & { __vditorInstance?: Vditor }).__vditorInstance = vditor;
  }
  (window as unknown as { __vditor?: Vditor | null }).__vditor = vditor;
}

export function getActiveVditor(): Vditor | null {
  if (activeVditor) {
    const internal = (activeVditor as unknown as { vditor?: { ir?: { element?: unknown } } }).vditor;
    if (internal?.ir?.element) return activeVditor;
  }

  const fromWindow = (window as unknown as { __vditor?: Vditor | null }).__vditor;
  if (fromWindow) {
    const internal = (fromWindow as unknown as { vditor?: { ir?: { element?: unknown } } }).vditor;
    if (internal?.ir?.element) return fromWindow;
  }

  const container =
    editorContainer ??
    document.querySelector('.editor-container') ??
    null;
  const fromDom = container
    ? (container as HTMLElement & { __vditorInstance?: Vditor }).__vditorInstance
    : null;
  return fromDom ?? null;
}

/** 绑定 Vditor 高度与 IR 滚动区域（Electron 下 flex 布局必须显式限制高度） */
export function applyEditorScrollLayout(container: HTMLElement, vditor: Vditor): void {
  const internal = (vditor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  const ir = internal?.ir?.element;
  const vditorEl = (vditor as unknown as { element?: HTMLElement }).element;
  if (!ir || !vditorEl) return;

  const h = container.clientHeight;
  if (h <= 0) return;

  const toolbar = vditorEl.querySelector('.vditor-toolbar') as HTMLElement | null;
  const toolbarH = toolbar?.offsetHeight ?? 41;
  const bodyH = Math.max(120, h - toolbarH);

  vditorEl.style.height = `${h}px`;
  vditorEl.style.minHeight = '0';
  vditorEl.style.overflow = 'hidden';
  vditorEl.style.display = 'flex';
  vditorEl.style.flexDirection = 'column';

  const content = vditorEl.querySelector('.vditor-content') as HTMLElement | null;
  if (content) {
    content.style.flex = '1';
    content.style.minHeight = '0';
    content.style.overflow = 'hidden';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
  }

  const irWrap = ir.closest('.vditor-ir') as HTMLElement | null;
  if (irWrap) {
    irWrap.style.flex = '1';
    irWrap.style.minHeight = '0';
    irWrap.style.overflow = 'hidden';
    irWrap.style.display = 'flex';
    irWrap.style.flexDirection = 'column';
  }

  ir.style.flex = '1';
  ir.style.minHeight = '0';
  ir.style.height = `${bodyH}px`;
  ir.style.maxHeight = `${bodyH}px`;
  ir.style.overflowY = 'auto';
  ir.style.overflowX = 'hidden';
  ir.style.boxSizing = 'border-box';
}

export function jumpToOutlineHeading(index: number, items?: OutlineItem[]): boolean {
  const outline = items ?? [];
  const item = outline[index];
  if (!item) return false;

  const vd = getActiveVditor();
  if (vd) {
    enhanceEditorDom(vd);
    if (jumpToOutlineWithVditor(vd, item, outline)) return true;
  }

  return jumpToOutlineInDom(item, outline);
}
