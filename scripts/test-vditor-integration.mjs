/**
 * Vditor DOM 集成测试
 * 运行: npx playwright install chromium && node scripts/test-vditor-integration.mjs
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const port = 9876;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  let urlPath = req.url?.split('?')[0] ?? '/';
  if (urlPath === '/') urlPath = '/scripts/vditor-test-page.html';

  const candidates = [
    path.join(root, urlPath.slice(1)),
    path.join(root, 'public', urlPath),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const data = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
      return;
    } catch { /* try next */ }
  }

  res.writeHead(404);
  res.end('404: ' + urlPath);
});

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('跳过 Vditor 集成测试（未安装 playwright）');
    return true;
  }

  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Page error:', e.message));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__testResults?.ready, { timeout: 45000 });

  const results = await page.evaluate(() => window.__testResults);
  await browser.close();
  server.close();

  console.log('\n=== Vditor DOM 集成测试 ===\n');
  results.errors?.forEach((e) => console.error('  ✗', e));
  console.log(`  通过: ${results.passed ?? 0}, 失败: ${results.failed ?? 0}\n`);
  return (results.failed ?? 0) === 0;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error(e);
    server.close();
    process.exit(1);
  });
