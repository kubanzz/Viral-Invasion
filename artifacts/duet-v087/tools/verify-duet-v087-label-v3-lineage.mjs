import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = 'artifacts/duet-v087/render-label-v3';
const read = name => readFileSync(resolve(root, name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prep = JSON.parse(read(`${evidence}/preparation.json`));
const baseline = JSON.parse(read(`${prep.baselineDist}/build-meta.json`));
const finalBytes = read('dist/build-meta.json'), final = JSON.parse(finalBytes);
const out = resolve(root, `${evidence}/source-lineage.json`);
if (existsSync(out)) throw Error('Preserve existing lineage report');
if (sha(read(`${prep.baselineDist}/game.js`)) !== prep.v2GameSha256
  || sha(read(`${prep.baselineDist}/build-meta.json`)) !== prep.v2MetaSha256) throw Error('Saved V2 build changed');
const keys = Object.keys(baseline.sourceManifest).sort();
if (final.version !== baseline.version || final.stage !== baseline.stage || keys.length !== 142
  || !isDeepStrictEqual(keys, Object.keys(final.sourceManifest).sort())
  || !isDeepStrictEqual(baseline.art, final.art) || !isDeepStrictEqual(baseline.engine, final.engine)) {
  throw Error('V3 manifest keys, version, engine, or art differ unexpectedly');
}
const changed = keys.filter(path => baseline.sourceManifest[path] !== final.sourceManifest[path]);
if (changed.length !== 1 || changed[0] !== prep.sourcePath
  || final.sourceManifest[prep.sourcePath] !== prep.candidateSha256) throw Error('V3 must differ only by the prepared render label file');
const checks = keys.map(path => ({ path, expectedSha256: final.sourceManifest[path], actualSha256: sha(read(path)) }));
if (!checks.every(row => row.expectedSha256 === row.actualSha256)) throw Error('Current source differs from final V3 build');
const before = read(prep.baselineSource), after = read(prep.sourcePath);
if (sha(before) !== prep.beforeSha256 || !after.equals(Buffer.from(before.toString('utf8').replaceAll("color: '#77455b'", "color: '#f4dbc6'")))) {
  throw Error('Render diff must remain exactly two colors');
}
const report = { pass: true, checkedAt: new Date().toISOString(), sourceCount: keys.length,
  changedInputs: changed, unchangedInputCount: keys.length - changed.length,
  unchangedGameInputCount: keys.filter(path => path.startsWith('src/game/')).length,
  v2GameSha256: prep.v2GameSha256, v3GameSha256: sha(read('dist/game.js')),
  v2MetaSha256: prep.v2MetaSha256, v3MetaSha256: sha(finalBytes),
  scope: 'Build-input lineage only. V2 browser2 natural progression applies to identical rules; V3 colors require separate presentation replay.',
  sourceChecks: checks };
writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...report, sourceChecks: undefined }));
