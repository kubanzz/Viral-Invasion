import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const base = 'artifacts/readability-v076', excluded = new Set([`${base}/evidence-inventory.json`, `${base}/staged-byte-check.json`]);
const paths = [...new Set(execFileSync('git', ['-c', 'core.longpaths=true', 'ls-files', '--cached', '--others', '--exclude-standard', '--', base], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean))].filter(path => !excluded.has(path)).sort();
const files = await Promise.all(paths.map(async path => { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }));
await writeFile(`${base}/evidence-inventory.json`, JSON.stringify({ generatedAt: new Date().toISOString(), files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  scope: 'Nonignored current-iteration files. Generated fixture bundles/HTML, release ZIP and this inventory/staged-byte-check are excluded explicitly.', excluded: [...excluded], entries: files }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }));
