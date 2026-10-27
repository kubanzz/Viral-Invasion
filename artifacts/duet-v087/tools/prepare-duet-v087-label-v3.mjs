import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(root, '.tools/duet-v087-label-v3-source');
const evidence = resolve(root, 'artifacts/duet-v087/render-label-v3');
const path = 'src/render/eliteTacticCycleVisuals.ts';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => readFileSync(resolve(root, name));
const parsed = name => JSON.parse(read(name));
const metaBytes = read('dist/build-meta.json'), meta = JSON.parse(metaBytes);
const testedMetaBytes = read('artifacts/duet-v087/browser-attempt-2/tested-build-meta.json');
const testedMeta = JSON.parse(testedMetaBytes);
const testedHashesBytes = read('artifacts/duet-v087/browser-attempt-2/tested-game-hash.json');
const testedHashes = JSON.parse(testedHashesBytes);
if (meta.version !== '0.8.7' || meta.stage !== 'G4' || Object.keys(meta.sourceManifest).length !== 142
  || !isDeepStrictEqual(meta, testedMeta) || sha(read('dist/game.js')) !== testedHashes.gameSha256) {
  throw Error('Current build must still be the 142-input browser2 V2 build');
}
for (const [name, hash] of Object.entries(meta.sourceManifest)) {
  if (sha(read(name)) !== hash) throw Error(`V2 input changed: ${name}`);
}
const before = read(path), text = before.toString('utf8');
if (text.split("color: '#77455b'").length !== 3) throw Error('Expected exactly two old label colors');
const after = Buffer.from(text.replaceAll("color: '#77455b'", "color: '#f4dbc6'"));
if (existsSync(work) || existsSync(evidence)) throw Error('Preserve existing V3 preparation');
mkdirSync(resolve(work, 'src/render'), { recursive: true });
mkdirSync(resolve(work, 'v2-source/src/render'), { recursive: true });
mkdirSync(resolve(work, 'v2-dist'), { recursive: true });
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(work, path), after, { flag: 'wx' });
writeFileSync(resolve(work, 'v2-source', path), before, { flag: 'wx' });
for (const name of ['index.html', 'game.js', 'build-meta.json']) {
  writeFileSync(resolve(work, 'v2-dist', name), read(`dist/${name}`), { flag: 'wx' });
}
writeFileSync(resolve(evidence, 'browser2-tested-build-meta.json'), testedMetaBytes, { flag: 'wx' });
writeFileSync(resolve(evidence, 'browser2-tested-game-hash.json'), testedHashesBytes, { flag: 'wx' });
const report = { version: '0.8.7', stage: 'G4', preparedAt: new Date().toISOString(),
  scope: 'Preparation only. Production source/dist unchanged. Candidate changes two label color literals only.',
  sourcePath: path, sourceCount: 142, beforeSha256: sha(before), candidateSha256: sha(after),
  oldColor: '#77455b', newColor: '#f4dbc6', replacements: 2,
  v2GameSha256: testedHashes.gameSha256, v2MetaSha256: sha(metaBytes),
  candidate: '.tools/duet-v087-label-v3-source/' + path,
  baselineDist: '.tools/duet-v087-label-v3-source/v2-dist',
  baselineSource: '.tools/duet-v087-label-v3-source/v2-source/' + path,
  browser2MetaSha256: sha(testedMetaBytes), browser2HashesSha256: sha(testedHashesBytes),
  baselineBuildFiles: Object.fromEntries(['index.html', 'game.js', 'build-meta.json'].map(name => [name, sha(read(`dist/${name}`))])),
};
writeFileSync(resolve(evidence, 'preparation.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
