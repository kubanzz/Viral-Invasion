import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const output = resolve(root, 'artifacts/completion-v075');
const sourceCommit = '474db0dbebc3ee49e2db304613c72871801c97fc';
const previousEvidenceCommit = '85dd6cc';
const expectedGame = '971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342';
const expectedZip = '184d2e336761966ad5baaf15185bb167c00c99fc346510392ebf0a9a204baf8a';
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: root });
const label = path => relative(root, path).replaceAll('\\', '/');
const meta = JSON.parse(await readFile(resolve(root, 'dist/build-meta.json'), 'utf8'));
const checks = [];
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  const worktreeSha256 = hash(await readFile(resolve(root, path)));
  const committedSha256 = hash(git('cat-file', 'blob', `${sourceCommit}:${path}`));
  checks.push({ path, expectedSha256: expected, worktreeSha256, committedSha256,
    matches: expected === worktreeSha256 && expected === committedSha256 });
}
const gameSha256 = hash(await readFile(resolve(root, 'dist/game.js')));
const zipSha256 = hash(await readFile(resolve(root, 'releases/Viral-Invasion-G4-v0.7.5.zip')));
const protectedDiff = git('diff', previousEvidenceCommit, '--', 'DesignDoc_v1.3',
  'artifacts/completion-v074', 'artifacts/readability-v075').toString('utf8');
const provenance = {
  checkedAt: new Date().toISOString(), version: meta.version, sourceCommit,
  previousEvidenceCommit, branch: git('branch', '--show-current').toString('utf8').trim(),
  headAtCheck: git('rev-parse', 'HEAD').toString('utf8').trim(),
  remotes: git('remote', '-v').toString('utf8').trim() || null,
  gameSha256, zipSha256, checks,
  protectedDesignAndPriorEvidenceUnchanged: protectedDiff === '', protectedDiff,
  pass: meta.version === '0.7.5' && gameSha256 === expectedGame && zipSha256 === expectedZip
    && checks.every(check => check.matches) && protectedDiff === ''
};
await writeFile(resolve(output, 'frozen-provenance.json'), JSON.stringify(provenance, null, 2), { flag: 'wx' });
const items = [];
const evidencePaths = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
  'artifacts/completion-v075').toString('utf8').split('\0').filter(Boolean))]
  .filter(path => !['evidence-inventory.json', 'staged-byte-check.json'].includes(path.split('/').at(-1))).sort();
for (const path of evidencePaths) {
  const bytes = await readFile(resolve(root, path));
  items.push({ path, bytes: bytes.length, sha256: hash(bytes) });
}
await writeFile(resolve(output, 'evidence-inventory.json'), JSON.stringify({
  createdAt: new Date().toISOString(), scope: 'New completion-v075 files only. Frozen earlier evidence is referenced, never overwritten.',
  exclusions: ['evidence-inventory.json', 'staged-byte-check.json', 'Files excluded by repository .gitignore, including videos and isolated fixture bundles'],
  fileCount: items.length, totalBytes: items.reduce((sum, item) => sum + item.bytes, 0), files: items
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ pass: provenance.pass, buildInputs: checks.length,
  gameSha256, zipSha256, evidenceFiles: items.length, protectedDiffEmpty: protectedDiff === '' }));
if (!provenance.pass) process.exitCode = 1;
