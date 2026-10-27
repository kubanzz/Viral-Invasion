import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sourceCommit = '7649a811a709ec1b708a8f968ccb40392dd6c034';
const gameSha256 = '541277f967a8a705be4dc73a9342b87573e2092ca3f2bd6c0c4d61f622a8de63';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meta = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const inputs = [];
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  const working = sha(await readFile(path)), committed = sha(execFileSync('git', ['cat-file', 'blob', `${sourceCommit}:${path}`], { encoding: 'buffer' }));
  inputs.push({ path, expected, working, committed, match: expected === working && expected === committed });
}
const protectedDiff = execFileSync('git', ['diff', '--name-only', '0b8610c', '--', 'DesignDoc_v1.3', 'artifacts/completion-v075', 'artifacts/readability-v075', 'artifacts/completion-v074'], { encoding: 'utf8' }).trim();
const actualGameSha256 = sha(await readFile('dist/game.js'));
const report = { generatedAt: new Date().toISOString(), sourceCommit, version: meta.version, gameSha256: actualGameSha256,
  buildMetaSha256: sha(await readFile('dist/build-meta.json')), inputCount: inputs.length, inputs,
  protectedTrackedDiff: protectedDiff ? protectedDiff.split(/\r?\n/) : [],
  scope: 'Current build inputs checked against committed Git blob and working bytes; protected original designs and prior evidence have no tracked diff from the recorded baseline. No gameplay or acceptance verdict.',
  pass: meta.version === '0.7.6' && actualGameSha256 === gameSha256 && inputs.every(input => input.match) && !protectedDiff };
await writeFile('artifacts/readability-v076/frozen-provenance.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ pass: report.pass, sourceCommit, gameSha256: actualGameSha256, inputCount: inputs.length, protectedDiff: report.protectedTrackedDiff }));
if (!report.pass) process.exitCode = 1;
