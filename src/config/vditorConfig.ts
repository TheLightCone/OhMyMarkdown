import type Vditor from 'vditor';
import { TYPORA_EMOJI_MAP } from './typEmojiMap';
import { VDITOR_TOOLBAR } from './vditorToolbar';

export const VDITOR_CDN = './vditor';

export interface VditorConfigContext {
  theme: 'light' | 'dark';
  markdownFilePath: string;
  initialContent: string;
  getVditor: () => Vditor | null;
  onInput: (value: string) => void;
  onReady: () => void;
}

async function importImageFiles(
  files: File[],
  markdownFilePath: string,
  vditor: Vditor | null,
): Promise<string | null> {
  if (!markdownFilePath) return '请先保存并打开 Markdown 文件后再上传图片';
  if (!vditor) return '编辑器未就绪';
  if (!window.electronAPI?.file?.importAsset) return '当前环境不支持图片上传';

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const relativePath = await window.electronAPI.file.importAsset(
      markdownFilePath,
      file.name,
      Array.from(new Uint8Array(buffer)),
    );
    const alt = file.name.replace(/\.[^.]+$/, '');
    vditor.insertValue(`![${alt}](${relativePath})\n`);
  }
  return null;
}

export function buildVditorOptions(ctx: VditorConfigContext) {
  return {
    height: '100%',
    minHeight: 200,
    cdn: VDITOR_CDN,
    lang: 'zh_CN',
    mode: 'ir' as const,
    theme: ctx.theme === 'dark' ? 'dark' : 'classic',
    placeholder: '开始编写 Markdown...',
    cache: { enable: false },
    value: ctx.initialContent,
    icon: 'ant' as const,
    hint: {
      parse: true,
      emoji: TYPORA_EMOJI_MAP,
    },
    link: {
      isOpen: false,
      click: () => {},
    },
    preview: {
      markdown: {
        toc: true,
        mark: true,
        footnotes: true,
        sanitize: false,
        gfmAutoLink: true,
        codeBlockPreview: true,
        mathBlockPreview: true,
      },
      math: {
        engine: 'KaTeX' as const,
        inlineDigit: true,
      },
      hljs: { lineNumber: true },
      render: {
        media: { enable: true },
      },
    },
    upload: {
      accept: 'image/*',
      multiple: true,
      handler: (files: File[]) => importImageFiles(files, ctx.markdownFilePath, ctx.getVditor()),
    },
    toolbar: VDITOR_TOOLBAR,
    input: (value: string) => {
      ctx.onInput(value);
    },
    after: () => {
      ctx.onReady();
    },
  };
}
