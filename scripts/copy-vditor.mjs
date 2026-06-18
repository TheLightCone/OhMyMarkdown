import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, '..', 'node_modules', 'vditor', 'dist');
const dest = path.join(root, '..', 'public', 'vditor', 'dist');

if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Copied vditor dist to public/vditor/dist');
} else {
  console.warn('vditor dist not found, skip copy');
}
