import Vditor from 'vditor';

interface VditorInternalOptions {
  cdn: string;
  theme: string;
  preview: {
    hljs: Record<string, unknown>;
    math: { engine?: string; inlineDigit?: boolean; macros?: Record<string, string> };
  };
  customRenders: Array<{ language: string; render: (panel: HTMLElement, vditor: unknown) => void }>;
}

function getInternalOptions(vditor: Vditor): VditorInternalOptions | null {
  const internal = (vditor as unknown as { vditor?: { options?: VditorInternalOptions } }).vditor;
  return internal?.options ?? null;
}

function processCodePanel(previewPanel: HTMLElement, vditor: Vditor, options: VditorInternalOptions): void {
  if (previewPanel.parentElement?.getAttribute('data-type') === 'html-block') {
    previewPanel.setAttribute('data-render', '1');
    return;
  }

  const firstChild = previewPanel.firstElementChild;
  if (!firstChild) return;

  const language = firstChild.className.replace('language-', '').split(/\s+/)[0];
  const { cdn, theme, preview, customRenders } = options;

  if (language === 'abc') {
    Vditor.abcRender(previewPanel, cdn);
  } else if (language === 'mermaid') {
    Vditor.mermaidRender(previewPanel, cdn, theme);
  } else if (language === 'smiles') {
    Vditor.SMILESRender(previewPanel, cdn, theme);
  } else if (language === 'markmap') {
    Vditor.markmapRender(previewPanel, cdn);
  } else if (language === 'flowchart') {
    Vditor.flowchartRender(previewPanel, cdn);
  } else if (language === 'echarts') {
    Vditor.chartRender(previewPanel, cdn, theme);
  } else if (language === 'mindmap') {
    Vditor.mindmapRender(previewPanel, cdn, theme);
  } else if (language === 'plantuml') {
    Vditor.plantumlRender(previewPanel, cdn);
  } else if (language === 'graphviz') {
    Vditor.graphvizRender(previewPanel, cdn);
  } else if (language === 'math') {
    Vditor.mathRender(previewPanel, { cdn, math: preview.math });
  } else {
    const custom = customRenders.find((item) => item.language === language);
    if (custom) {
      custom.render(previewPanel, (vditor as unknown as { vditor?: unknown }).vditor);
    } else {
      Vditor.highlightRender({ ...preview.hljs }, previewPanel, cdn);
      Vditor.codeRender(previewPanel, preview.hljs);
    }
  }

  previewPanel.setAttribute('data-render', '1');
}

/** 渲染 IR 中尚未处理的代码块（Mermaid、数学公式等） */
export function refreshIrSpecialBlocks(vditor: Vditor, irRoot: HTMLElement): void {
  const options = getInternalOptions(vditor);
  if (!options) return;

  irRoot.querySelectorAll(".vditor-ir__preview[data-render='2']").forEach((panel) => {
    processCodePanel(panel as HTMLElement, vditor, options);
  });

  Vditor.mathRender(irRoot, { cdn: options.cdn, math: options.preview.math });
  Vditor.mediaRender(irRoot);
}
