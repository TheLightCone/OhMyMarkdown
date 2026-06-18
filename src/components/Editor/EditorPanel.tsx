import { Component, useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import Vditor from 'vditor';
import { useAppStore } from '../../stores/appStore';
import { buildVditorOptions } from '../../config/vditorConfig';
import { collapseTyporaSyntax, parseOutlineFromMarkdown } from '../../utils/markdownSyntax';
import {
  attachEditorInteraction,
  createLinkClickHandler,
  enhanceEditorDom,
  scrollToOutlineLine,
  scrollToOutlineItem,
} from '../../utils/editorEnhancements';
import {
  applyEditorScrollLayout,
  jumpToOutlineHeading,
  setActiveVditor,
} from '../../utils/vditorBridge';
import './EditorPanel.css';

interface EditorPanelProps {
  onContentChange: (content: string) => void;
}

interface VditorEditorProps {
  filePath: string;
  initialContent: string;
  theme: 'light' | 'dark';
  editorFontSize: number;
  onContentChange: (content: string) => void;
  onVditorInstance?: (vditor: Vditor | null) => void;
}

function isVditorReady(vditor: Vditor): boolean {
  const internal = (vditor as unknown as { vditor?: { ir?: { element?: unknown } } }).vditor;
  return Boolean(internal?.ir?.element);
}

class EditorErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="editor-error">
          <p>编辑器加载失败</p>
          <pre>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function VditorEditor({ filePath, initialContent, theme, editorFontSize, onContentChange, onVditorInstance }: VditorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const onChangeRef = useRef(onContentChange);
  const contentRef = useRef(initialContent);
  const themeRef = useRef(theme);
  const lastEmittedContentRef = useRef(initialContent);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enhanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setOutline } = useAppStore();

  onChangeRef.current = onContentChange;
  contentRef.current = initialContent;
  themeRef.current = theme;

  const syncOutlineFromMarkdown = useCallback((markdown: string) => {
    const mdOutline = parseOutlineFromMarkdown(collapseTyporaSyntax(markdown));
    setOutline(mdOutline);
  }, [setOutline]);

  const scheduleDomEnhance = useCallback((vditor: Vditor) => {
    if (enhanceTimerRef.current) clearTimeout(enhanceTimerRef.current);
    enhanceTimerRef.current = setTimeout(() => {
      if (!readyRef.current || vditorRef.current !== vditor) return;
      enhanceEditorDom(vditor);
    }, 800);
  }, []);

  useEffect(() => {
    lastEmittedContentRef.current = initialContent;
    syncOutlineFromMarkdown(initialContent);
  }, [filePath, syncOutlineFromMarkdown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    readyRef.current = false;
    setReady(false);
    let destroyed = false;
    let detachInteraction: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const layoutEditor = () => {
      const instance = vditorRef.current;
      const host = containerRef.current;
      if (!instance || !host || destroyed) return;
      applyEditorScrollLayout(host, instance);
    };

    const vditor = new Vditor(
      container,
      buildVditorOptions({
        theme: themeRef.current,
        markdownFilePath: filePath,
        initialContent: contentRef.current,
        getVditor: () => vditorRef.current,
        onInput: (value: string) => {
          contentRef.current = value;
          const collapsed = collapseTyporaSyntax(value);
          lastEmittedContentRef.current = collapsed;
          isTypingRef.current = true;
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => {
            isTypingRef.current = false;
          }, 200);

          onChangeRef.current(collapsed);
          if (readyRef.current && vditorRef.current) {
            syncOutlineFromMarkdown(value);
            scheduleDomEnhance(vditorRef.current);
          }
        },
        onReady: () => {
          if (destroyed) return;
          try {
            vditor.options.link.click = createLinkClickHandler(vditor);
            readyRef.current = true;
            setReady(true);
            syncOutlineFromMarkdown(vditor.getValue());
            scheduleDomEnhance(vditor);
            detachInteraction = attachEditorInteraction(vditor, container);
            onVditorInstance?.(vditor);
            layoutEditor();
            if (typeof ResizeObserver !== 'undefined') {
              resizeObserver = new ResizeObserver(() => layoutEditor());
              resizeObserver.observe(container);
            }
            window.setTimeout(() => {
              layoutEditor();
              enhanceEditorDom(vditor);
            }, 300);
          } catch (err) {
            console.error('Vditor onReady failed:', err);
            onVditorInstance?.(vditor);
          }
        },
      }),
    );

    vditorRef.current = vditor;
    setActiveVditor(vditor, container);
    onVditorInstance?.(vditor);

    return () => {
      destroyed = true;
      detachInteraction?.();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (enhanceTimerRef.current) clearTimeout(enhanceTimerRef.current);
      resizeObserver?.disconnect();
      readyRef.current = false;
      setReady(false);
      vditor.destroy();
      vditorRef.current = null;
      setActiveVditor(null, null);
      onVditorInstance?.(null);
    };
  }, [filePath, syncOutlineFromMarkdown, scheduleDomEnhance, onVditorInstance]);

  useEffect(() => {
    const vditor = vditorRef.current;
    if (!vditor || !ready || !isVditorReady(vditor)) return;
    if (isTypingRef.current) return;
    if (initialContent === lastEmittedContentRef.current) return;

    try {
      const editorValue = collapseTyporaSyntax(vditor.getValue());
      if (initialContent !== editorValue) {
        vditor.setValue(initialContent);
        lastEmittedContentRef.current = initialContent;
        syncOutlineFromMarkdown(initialContent);
        scheduleDomEnhance(vditor);
      }
    } catch {
      // ignore
    }
  }, [initialContent, syncOutlineFromMarkdown, scheduleDomEnhance, ready]);

  useEffect(() => {
    const vditor = vditorRef.current;
    if (!vditor || !ready || !isVditorReady(vditor)) return;
    const contentTheme = theme === 'dark' ? 'dark' : 'light';
    const codeTheme = theme === 'dark' ? 'native' : 'github';
    vditor.setTheme(theme === 'dark' ? 'dark' : 'classic', contentTheme, codeTheme);
  }, [theme, ready]);

  useEffect(() => {
    containerRef.current?.style.setProperty('--editor-font-size', `${editorFontSize}px`);
  }, [editorFontSize, ready]);

  return <div className="editor-container" ref={containerRef} />;
}

export default function EditorPanel({ onContentChange }: EditorPanelProps) {
  const { currentFile, currentContent, settings, outline, registerOutlineJumpHandler } = useAppStore();
  const vditorInstanceRef = useRef<Vditor | null>(null);

  const handleVditorInstance = useCallback((vditor: Vditor | null) => {
    vditorInstanceRef.current = vditor;
    const container = document.querySelector('.editor-container') as HTMLElement | null;
    setActiveVditor(vditor, container);
  }, []);

  const jumpToLine = useCallback((line: number) => {
    const vd = vditorInstanceRef.current;
    if (vd) {
      scrollToOutlineLine(vd, line, outline.map((o) => o.line));
    }
  }, [outline]);

  const jumpToHeading = useCallback((index: number) => {
    const items = useAppStore.getState().outline;
    if (jumpToOutlineHeading(index, items)) return;

    const vd = vditorInstanceRef.current;
    const item = items[index];
    if (vd && item) scrollToOutlineItem(vd, item, items);
  }, []);

  useEffect(() => {
    registerOutlineJumpHandler(jumpToHeading);
    return () => registerOutlineJumpHandler(null);
  }, [jumpToHeading, registerOutlineJumpHandler]);

  useEffect(() => {
    (window as unknown as { __jumpToLine?: (line: number) => void }).__jumpToLine = jumpToLine;
    (window as unknown as { __jumpToHeading?: (index: number) => void }).__jumpToHeading = jumpToHeading;
    return () => {
      delete (window as unknown as { __jumpToLine?: (line: number) => void }).__jumpToLine;
      delete (window as unknown as { __jumpToHeading?: (index: number) => void }).__jumpToHeading;
    };
  }, [jumpToLine, jumpToHeading]);

  useEffect(() => {
    const panel = document.querySelector('.editor-panel');
    if (!panel) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const current = useAppStore.getState().settings.editorFontSize;
      const next = Math.min(32, Math.max(12, current + delta));
      if (next === current) return;
      const newSettings = { ...useAppStore.getState().settings, editorFontSize: next };
      useAppStore.getState().setSettings(newSettings);
      window.electronAPI.settings.set(newSettings);
    };

    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, [currentFile]);

  if (!currentFile) {
    return (
      <div className="editor-empty">
        <div className="empty-state">
          <h2>OhMyMarkdown</h2>
          <p>请从左侧文件树选择文件，或打开一个工作区开始编辑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <span className="editor-filename">{currentFile.split(/[/\\]/).pop()}</span>
      </div>
      <EditorErrorBoundary>
        <VditorEditor
          key={currentFile}
          filePath={currentFile}
          initialContent={currentContent}
          theme={settings.theme}
          editorFontSize={settings.editorFontSize}
          onContentChange={onContentChange}
          onVditorInstance={handleVditorInstance}
        />
      </EditorErrorBoundary>
    </div>
  );
}
