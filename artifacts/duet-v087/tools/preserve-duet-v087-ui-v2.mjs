import { readFileSync, writeFileSync, renameSync, lstatSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Root authorizes after browser2 has terminated. All four destinations are new.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prep = JSON.parse(read('artifacts/duet-v087/render-label-v3/preparation.json'));
const inspection = JSON.parse(read('artifacts/duet-v087/release/inspection-1/inspection.json'));
const report = JSON.parse(read('artifacts/releases/v0.8.7/release-package.json'));
if (!inspection.pass || inspection.expectedGameSha256 !== prep.v2GameSha256
  || report.version !== '0.8.7' || report.sha256 !== inspection.zipSha256
  || sha(read('releases/Viral-Invasion-G4-v0.8.7.zip')) !== report.sha256) throw Error('Existing V2 release failed preservation checks');
const moves = [
  ['releases/Viral-Invasion-G4-v0.8.7.zip', 'releases/Viral-Invasion-G4-v0.8.7-ui-v2-preview.zip'],
  ['releases/Viral-Invasion-G4-v0.8.7', 'releases/Viral-Invasion-G4-v0.8.7-ui-v2-preview'],
  ['.tools/release-v0.8.7-verified', '.tools/release-v0.8.7-ui-v2-preview-verified'],
  ['artifacts/releases/v0.8.7/release-package.json', 'artifacts/releases/v0.8.7/release-package.ui-v2-preview.json'],
];
const out = resolve(root, 'artifacts/duet-v087/release/preserved-ui-v2-preview.json');
if (existsSync(out)) throw Error('Preserve existing preservation report');
for (const [from, to] of moves) {
  const source = resolve(root, from), target = resolve(root, to);
  if (!(source.startsWith(root + '/') || source.startsWith(root + '\\'))
    || !(target.startsWith(root + '/') || target.startsWith(root + '\\'))
    || lstatSync(source).isSymbolicLink() || existsSync(target)) throw Error(`Unsafe or reused preservation path: ${from} -> ${to}`);
}
for (const file of report.files) {
  for (const folder of ['releases/Viral-Invasion-G4-v0.8.7', '.tools/release-v0.8.7-verified']) {
    if (sha(read(`${folder}/${file.name}`)) !== file.sha256) throw Error(`V2 released file changed: ${folder}/${file.name}`);
  }
}
for (const [from, to] of moves) renameSync(resolve(root, from), resolve(root, to));
const result = { pass: true, preservedAt: new Date().toISOString(), zipSha256: report.sha256,
  gameSha256: prep.v2GameSha256, moves: moves.map(([from, to]) => ({ from: resolve(root, from), to: resolve(root, to) })),
  scope: 'V2 technical preview preserved by in-workspace renames. Prior inspection1 remains historical evidence of the original paths.' };
writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
