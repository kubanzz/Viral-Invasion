import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const base = 'artifacts/readability-v076', output = `${base}/staged-byte-check.json`;
const paths = execFileSync('git', ['-c', 'core.longpaths=true', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '--', base], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => path && path !== output);
if (!paths.length) throw Error('Stage the related evidence first.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
for (const path of paths) {
  const working = await readFile(path), staged = execFileSync('git', ['-c', 'core.longpaths=true', 'cat-file', 'blob', `:${path}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  checks.push({ path, bytes: working.length, workingSha256: sha(working), stagedSha256: sha(staged), match: working.equals(staged) });
}
const report = { generatedAt: new Date().toISOString(), count: checks.length, bytes: checks.reduce((sum, check) => sum + check.bytes, 0), pass: checks.every(check => check.match),
  scope: 'Exact Git index blob versus working bytes for staged current-iteration evidence, including the inventory. This output is staged afterward and separately compared.', checks };
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ count: report.count, bytes: report.bytes, pass: report.pass }));
if (!report.pass) process.exitCode = 1;
