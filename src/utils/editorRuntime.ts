/**
 * 全局编辑器交互：不依赖 React 回调链，在 Electron 打包环境中更可靠。
 */
import { useAppStore } from '../stores/appStore';
import type { OutlineItem } from '../types';
import {
  getVditorIrElement,
  handleCtrlLinkNavigation,
  jumpToOutlineInDom,
  jumpToOutlineWithVditor,
  pinActiveOutlineIndex,
  resolveActiveOutlineIndex,
} from './editorEnhancements';
import { getActiveVditor, jumpToOutlineHeading as jumpViaVditor } from './vditorBridge';

function readOutlineIndex(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const item = target.closest('.outline-item[data-outline-index]');
  if (!item) return null;
  const index = Number(item.getAttribute('data-outline-index'));
  return Number.isFinite(index) ? index : null;
}

function jumpToOutline(index: number, outline: OutlineItem[]): boolean {
  pinActiveOutlineIndex(index);
  useAppStore.getState().setActiveOutlineIndex(index);

  if (jumpViaVditor(index, outline)) return true;

  const vd = getActiveVditor();
  if (vd) {
    const item = outline[index];
    if (item && jumpToOutlineWithVditor(vd, item, outline)) return true;
  }

  const item = outline[index];
  if (item && jumpToOutlineInDom(item, outline)) return true;

  return false;
}

export function installGlobalEditorRuntime(): () => void {
  const onPointerDown = (event: MouseEvent) => {
    if (event.button !== 0) return;

    const outlineIndex = readOutlineIndex(event.target);
    if (outlineIndex !== null) {
      event.preventDefault();
      event.stopPropagation();
      jumpToOutline(outlineIndex, useAppStore.getState().outline);
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) return;

    const target = event.target;
    if (!(target instanceof Node)) return;
    const inEditor = (target as Element).closest?.('.editor-panel');
    if (!inEditor) return;

    const vd = getActiveVditor();
    const irRoot = vd ? getVditorIrElement(vd) : null;
    if (irRoot?.contains(target) && vd && handleCtrlLinkNavigation(event, vd)) {
      return;
    }

    handleCtrlLinkNavigation(event, null);
  };

  document.addEventListener('mousedown', onPointerDown, true);
  document.addEventListener('click', onPointerDown, true);

  return () => {
    document.removeEventListener('mousedown', onPointerDown, true);
    document.removeEventListener('click', onPointerDown, true);
  };
}

/** 大纲跟随光标/滚动（全局监听，避免 React 链路断裂） */
export function installOutlineSyncRuntime(): () => void {
  let rafId = 0;
  let lastIndex: number | null = null;

  const sync = (preferScroll = false) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const vd = getActiveVditor();
      if (!vd) return;

      const outline = useAppStore.getState().outline;
      if (outline.length === 0) return;

      const useScroll = preferScroll;
      const next = resolveActiveOutlineIndex(vd, outline, useScroll);
      if (next === null || next === lastIndex) return;

      lastIndex = next;
      useAppStore.getState().setActiveOutlineIndex(next);
    });
  };

  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!(target as Element).closest?.('.editor-container')) return;
    sync(true);
  };

  const onEditorActivity = () => sync(false);

  document.addEventListener('selectionchange', onEditorActivity);
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('input', onEditorActivity, true);
  document.addEventListener('keyup', onEditorActivity, true);
  document.addEventListener('mouseup', onEditorActivity, true);
  document.addEventListener('click', onEditorActivity, true);

  return () => {
    cancelAnimationFrame(rafId);
    document.removeEventListener('selectionchange', onEditorActivity);
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('input', onEditorActivity, true);
    document.removeEventListener('keyup', onEditorActivity, true);
    document.removeEventListener('mouseup', onEditorActivity, true);
    document.removeEventListener('click', onEditorActivity, true);
  };
}
