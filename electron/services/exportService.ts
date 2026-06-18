import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';

export async function exportToHtml(content: string, outputPath: string, title: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vditor/dist/index.css"/>
  <style>
    body { max-width: 860px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .markdown-body { line-height: 1.8; }
  </style>
</head>
<body>
  <div id="preview" class="markdown-body"></div>
  <script src="https://cdn.jsdelivr.net/npm/vditor/dist/method.min.js"></script>
  <script>
    Vditor.preview(document.getElementById('preview'), ${JSON.stringify(content)}, {
      cdn: 'https://cdn.jsdelivr.net/npm/vditor',
      theme: { current: 'light' },
      markdown: { toc: true },
      hljs: { lineNumber: true },
      math: { engine: 'KaTeX' }
    });
  </script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, 'utf-8');
}

export async function exportToPdf(mainWindow: BrowserWindow, outputPath: string): Promise<void> {
  const pdfData = await mainWindow.webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'default' },
  });
  fs.writeFileSync(outputPath, pdfData);
}

export async function exportToImage(mainWindow: BrowserWindow, outputPath: string): Promise<void> {
  const image = await mainWindow.webContents.capturePage();
  fs.writeFileSync(outputPath, image.toPNG());
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportToMarkdownCopy(content: string, outputPath: string): void {
  fs.writeFileSync(outputPath, content, 'utf-8');
}

export function exportToWordHtml(content: string, outputPath: string, title: string): void {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><pre style="font-family: 'Segoe UI', sans-serif; white-space: pre-wrap;">${escapeHtml(content)}</pre></body>
</html>`;
  const wordPath = outputPath.endsWith('.doc') ? outputPath : outputPath.replace(/\.\w+$/, '.doc');
  fs.writeFileSync(wordPath, html, 'utf-8');
}
