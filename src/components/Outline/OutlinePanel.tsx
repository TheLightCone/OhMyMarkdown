import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getOutlineRootLevel } from '../../utils/markdownSyntax';
import { jumpToOutlineHeading } from '../../utils/vditorBridge';
import { pinActiveOutlineIndex } from '../../utils/editorEnhancements';
import type { OutlineItem } from '../../types';
import './OutlinePanel.css';

interface OutlinePanelProps {
  onJumpToHeading?: (index: number) => void;
}

function jumpToHeadingIndex(index: number, fallback?: (index: number) => void) {
  pinActiveOutlineIndex(index);
  useAppStore.getState().setActiveOutlineIndex(index);
  const outline = useAppStore.getState().outline;
  if (jumpToOutlineHeading(index, outline)) return;
  const handler = useAppStore.getState().outlineJumpHandler ?? fallback;
  handler?.(index);
}

function OutlineNode({
  item,
  outlineIndex,
  rootLevel,
  collapsed,
  activeOutlineIndex,
  onToggle,
  onJump,
}: {
  item: OutlineItem;
  outlineIndex: number;
  rootLevel: number;
  collapsed: Set<string>;
  activeOutlineIndex: number | null;
  onToggle: (id: string) => void;
  onJump: (index: number) => void;
}) {
  const { outline } = useAppStore();
  const childItems = outline.filter((o, i) => {
    if (i <= outlineIndex) return false;
    if (o.level <= item.level) return false;
    const nextSameLevel = outline.findIndex((n, j) => j > outlineIndex && n.level <= item.level);
    if (nextSameLevel === -1) return true;
    return i < nextSameLevel;
  });
  const directChildren = childItems.filter((c) => c.level === item.level + 1);
  const hasChildren = directChildren.length > 0;
  const isCollapsed = collapsed.has(item.id);
  const isActive = activeOutlineIndex === item.index;

  return (
    <div>
      <div
        className={`outline-item${isActive ? ' active' : ''}`}
        data-outline-index={item.index}
        style={{ paddingLeft: (item.level - rootLevel) * 12 + 8 }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          onJump(item.index);
        }}
      >
        {hasChildren && (
          <span
            className="outline-toggle"
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
          >
            {isCollapsed ? '▸' : '▾'}
          </span>
        )}
        {!hasChildren && <span className="outline-toggle-placeholder" />}
        <span className="outline-text" title={item.text}>{item.text}</span>
      </div>
      {hasChildren && !isCollapsed && directChildren.map((child) => (
        <OutlineNode
          key={child.id}
          item={child}
          outlineIndex={child.index}
          rootLevel={rootLevel}
          collapsed={collapsed}
          activeOutlineIndex={activeOutlineIndex}
          onToggle={onToggle}
          onJump={onJump}
        />
      ))}
    </div>
  );
}

export default function OutlinePanel({ onJumpToHeading }: OutlinePanelProps) {
  const { outline, activeOutlineIndex } = useAppStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rootLevel = getOutlineRootLevel(outline);
  const topLevel = outline.filter((item) => item.level === rootLevel);

  useEffect(() => {
    if (activeOutlineIndex === null) return;

    const itemIndex = outline.findIndex((item) => item.index === activeOutlineIndex);
    if (itemIndex < 0) return;

    const activeItem = outline[itemIndex];
    setCollapsed((prev) => {
      const next = new Set(prev);
      let currentLevel = activeItem.level;
      for (let i = itemIndex - 1; i >= 0; i--) {
        const candidate = outline[i];
        if (candidate.level < currentLevel) {
          next.delete(candidate.id);
          currentLevel = candidate.level;
          if (currentLevel <= rootLevel) break;
        }
      }
      return next;
    });
  }, [activeOutlineIndex, outline, rootLevel]);

  useEffect(() => {
    if (activeOutlineIndex === null || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-outline-index="${activeOutlineIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeOutlineIndex, outline]);

  return (
    <div className="outline-panel">
      <div className="sidebar-header">
        <span>大纲</span>
        <span className="outline-count">{outline.length}</span>
      </div>
      <div className="sidebar-content" ref={listRef}>
        {outline.length === 0 ? (
          <div className="outline-empty">文档中暂无标题</div>
        ) : (
          topLevel.map((item) => (
            <OutlineNode
              key={item.id}
              item={item}
              outlineIndex={item.index}
              rootLevel={rootLevel}
              collapsed={collapsed}
              activeOutlineIndex={activeOutlineIndex}
              onToggle={toggleCollapse}
              onJump={(index) => jumpToHeadingIndex(index, onJumpToHeading)}
            />
          ))
        )}
      </div>
    </div>
  );
}
