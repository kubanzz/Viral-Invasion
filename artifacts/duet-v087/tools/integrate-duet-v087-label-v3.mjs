import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Root executes only after browser2 Edge completes and grants integration.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = 'artifacts/duet-v087/render-label-v3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => readFileSync(resolve(root, name));
const prep = JSON.parse(read(`${evidence}/preparation.json`));
const log = resolve(root, `${evidence}/integration.json`);
if (existsSync(log)) throw Error('Preserve existing integration report');
if (sha(read('dist/build-meta.json')) !== prep.v2MetaSha256 || sha(read('dist/game.js')) !== prep.v2GameSha256) {
  throw Error('Production V2 build changed before guarded integration');
}
const meta = JSON.parse(read('dist/build-meta.json'));
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  if (sha(read(path)) !== expected) throw Error(`V2 source changed before integration: ${path}`);
}
const before = read(prep.sourcePath), after = read(prep.candidate);
if (sha(before) !== prep.beforeSha256 || sha(after) !== prep.candidateSha256
  || !after.equals(Buffer.from(before.toString('utf8').replaceAll("color: '#77455b'", "color: '#f4dbc6'")))) {
  throw Error('Candidate must be exactly the two prepared color replacements');
}
writeFileSync(resolve(root, prep.sourcePath), after);
const changed = Object.entries(meta.sourceManifest).filter(([path, hash]) => sha(read(path)) !== hash).map(([path]) => path);
if (changed.length !== 1 || changed[0] !== prep.sourcePath) throw Error('Unexpected source change during integration');
const report = { pass: true, integratedAt: new Date().toISOString(), changedInputs: changed,
  beforeSha256: prep.beforeSha256, afterSha256: sha(read(prep.sourcePath)), sourceCount: Object.keys(meta.sourceManifest).length,
  scope: 'Guarded source integration only; no build, simulation, or browser started. V2 dist and browser evidence preserved.' };
writeFileSync(log, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
