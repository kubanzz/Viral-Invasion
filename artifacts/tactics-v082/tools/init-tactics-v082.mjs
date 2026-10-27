import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const root = process.cwd(), out = resolve(root, '.tools/tactics-v082-source');
if (existsSync(out)) throw new Error('Refuse to overwrite isolated candidate');
mkdirSync(out);
for (const item of ['src', 'tests', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'vite.config.ts', 'playwright.config.ts', 'index.html']) cpSync(resolve(root, item), resolve(out, item), { recursive: true });
symlinkSync(resolve(root, 'node_modules'), resolve(out, 'node_modules'), 'junction');
const files = [];
function walk(dir) { for (const item of readdirSync(dir, { withFileTypes: true })) { const p = resolve(dir, item.name); if (item.isDirectory()) walk(p); else files.push({ path: relative(out, p).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(p)).digest('hex') }); } }
walk(resolve(out, 'src')); walk(resolve(out, 'tests'));
writeFileSync(resolve(out, 'baseline-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), root, out, files }, null, 2));
console.log(JSON.stringify({ out, files: files.length }));
