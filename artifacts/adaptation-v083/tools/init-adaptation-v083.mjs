import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
const root = process.cwd(), out = resolve(root, '.tools/adaptation-v083-source');
if (existsSync(out)) throw new Error('Preserve isolated source'); mkdirSync(out);
for (const item of ['src', 'tests', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'vite.config.ts', 'playwright.config.ts', 'index.html']) cpSync(resolve(root, item), resolve(out, item), { recursive: true });
symlinkSync(resolve(root, 'node_modules'), resolve(out, 'node_modules'), 'junction');
const files = [], fixtures = [], sha = data => createHash('sha256').update(data).digest('hex');
function walk(dir) { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = resolve(dir, item.name); if (item.isDirectory()) walk(path); else files.push({ path: relative(out, path).replaceAll('\\', '/'), sha256: sha(readFileSync(path)) }); } }
walk(resolve(out, 'src')); walk(resolve(out, 'tests'));
for (const entry of files.filter(file => file.path.startsWith('tests/unit/'))) {
  const content = readFileSync(resolve(root, entry.path), 'utf8');
  for (const match of content.matchAll(/['"`](artifacts\/[^'"`\r\n]+\.(?:json|ts))['"`]/g)) {
    const file = match[1], source = resolve(root, file), target = resolve(out, file);
    if (existsSync(source) && !existsSync(target)) { mkdirSync(dirname(target), { recursive: true }); cpSync(source, target); fixtures.push({ path: file, sha256: sha(readFileSync(source)) }); }
  }
}
for (const file of ['.art-generated/art-runtime.json', 'artifacts/completion-v074/pulse-reachability/sweep.ts']) {
  const target = resolve(out, file); if (existsSync(target)) continue;
  mkdirSync(dirname(target), { recursive: true }); cpSync(resolve(root, file), target); fixtures.push({ path: file, sha256: sha(readFileSync(target)) });
}
writeFileSync(resolve(out, 'isolation-manifest.json'), JSON.stringify({ at: new Date().toISOString(), root, out, files, fixtures }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, files: files.length, fixtures: fixtures.length }));
