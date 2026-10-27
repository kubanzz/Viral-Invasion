import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const folder = 'artifacts/completion-v075';
const sha = value => createHash('sha256').update(value).digest('hex');
const inventory = JSON.parse(await readFile(folder + '/evidence-inventory.json', 'utf8'));
const paths = [...inventory.files.map(item => item.path), folder + '/evidence-inventory.json'];
const checks = [];
for (const path of paths) {
  const worktree = await readFile(path);
  const staged = execFileSync('git', ['-c', 'core.longpaths=true', 'cat-file', 'blob', ':' + path], { maxBuffer: 64 * 1024 * 1024 });
  const listed = inventory.files.find(item => item.path === path);
  checks.push({ path, bytes: worktree.length, worktreeSha256: sha(worktree), stagedSha256: sha(staged),
    matches: worktree.equals(staged) && (!listed || listed.bytes === worktree.length && listed.sha256 === sha(worktree)) });
}
const result = { checkedAt: new Date().toISOString(), method: 'Read actual Git index blobs and compare original raw bytes, not text-converted diff output.',
  checkedFiles: checks.length, totalBytes: checks.reduce((sum, check) => sum + check.bytes, 0),
  pass: checks.every(check => check.matches), checks };
await writeFile(folder + '/staged-byte-check.json', JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ pass: result.pass, checkedFiles: result.checkedFiles, totalBytes: result.totalBytes }));
if (!result.pass) process.exitCode = 1;
