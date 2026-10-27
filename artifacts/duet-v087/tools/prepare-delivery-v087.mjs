import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Execute only after the final v0.8.7 UI V2 build is frozen and verified.
// This prepares new verification helpers; it does not build, package, or browse.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const meta = JSON.parse(read('dist/build-meta.json'));
const packageJson = JSON.parse(read('package.json'));
if (meta.version !== '0.8.7' || meta.stage !== 'G4'
  || packageJson.version !== meta.version || packageJson.viralInvasionStage !== meta.stage) {
  throw Error('Unexpected final build/package version or stage');
}
if (!meta.sourceManifest || typeof meta.sourceManifest !== 'object' || Array.isArray(meta.sourceManifest)) {
  throw Error('Final build source manifest is missing');
}
const count = Object.keys(meta.sourceManifest).length;
if (count === 0) throw Error('Final build source manifest is empty');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  const absolute = resolve(root, path);
  if (!(absolute.startsWith(root + '/') || absolute.startsWith(root + '\\'))
    || !/^[0-9a-f]{64}$/.test(expected)
    || sha(readFileSync(absolute)) !== expected) {
    throw Error(`Final build source mismatch: ${path}`);
  }
}
const game = sha(readFileSync(resolve(root, 'dist/game.js')));
const inspectorPath = resolve(root, '.tools/inspect-v087-release.mjs');
const offlinePath = resolve(root, '.tools/verify-offline-v087.mjs');
if (existsSync(inspectorPath) || existsSync(offlinePath)) throw Error('Refusing to overwrite existing v087 helpers');

function replaceChecked(source, replacements, label) {
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw Error(`Missing exact ${label} replacement: ${before}`);
    source = source.replaceAll(before, after);
  }
  return source;
}

const inspector = replaceChecked(read('.tools/inspect-v086-release.mjs'), [
  ["VERSION = '0.8.6'", "VERSION = '0.8.7'"],
  ['SOURCE_COUNT = 139', `SOURCE_COUNT = ${count}`],
  ['4e62dcb2ab26a18194f1d2986cb1c2c97ee090f0034ab6016ce418e46fe4a7cf', game],
  ['inspect-v086-release', 'inspect-v087-release'],
  ['artifacts/ricochet-v086', 'artifacts/duet-v087'],
  ['exactly 139 build inputs', `exactly ${count} build inputs`],
  ['139 current build inputs', `${count} current build inputs`],
  ['existing v0.8.6 ZIP/report', 'existing v0.8.7 ZIP/report'],
], 'inspector');
const offline = replaceChecked(read('.tools/verify-offline-v086.mjs'), [
  ['artifacts/ricochet-v086', 'artifacts/duet-v087'],
  ['0.8.6-G4', '0.8.7-G4'],
], 'offline');
if (/v086|0\.8\.6|ricochet-v086/.test(inspector + offline)) {
  throw Error('Unexpected stale v086 reference in generated helpers');
}
writeFileSync(inspectorPath, inspector, { flag: 'wx' });
writeFileSync(offlinePath, offline, { flag: 'wx' });
console.log(JSON.stringify({ version: meta.version, stage: meta.stage, sourceInputs: count, gameSha256: game,
  inspector: '.tools/inspect-v087-release.mjs', offline: '.tools/verify-offline-v087.mjs' }));
