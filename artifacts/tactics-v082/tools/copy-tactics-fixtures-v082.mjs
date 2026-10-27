import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
const root = process.cwd(), out = resolve(root, '.tools/tactics-v082-source');
const copied = [];
for (const name of readdirSync(resolve(root, 'tests/unit'))) {
  if (!name.endsWith('.ts')) continue;
  const content = readFileSync(resolve(root, 'tests/unit', name), 'utf8');
  for (const match of content.matchAll(/['"`](artifacts\/[^'"`\r\n]+\.(?:json|ts))['"`]/g)) {
    const file = match[1], src = resolve(root, file), dest = resolve(out, file);
    if (existsSync(src) && !existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true }); cpSync(src, dest);
      copied.push({ file, sha256: createHash('sha256').update(readFileSync(src)).digest('hex') });
    }
  }
}
for (const file of ['.art-generated/art-runtime.json', 'artifacts/completion-v074/pulse-reachability/sweep.ts']) {
  const dest = resolve(out, file); if (existsSync(dest)) continue;
  mkdirSync(dirname(dest), { recursive: true }); cpSync(resolve(root, file), dest);
  copied.push({ file, sha256: createHash('sha256').update(readFileSync(dest)).digest('hex') });
}
writeFileSync(resolve(out, 'fixture-manifest.json'), JSON.stringify(copied, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ copied: copied.length }));
