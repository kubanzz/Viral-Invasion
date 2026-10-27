import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meta = JSON.parse(readFileSync('dist/build-meta.json', 'utf8'));
if (meta.version !== '0.8.3') throw Error('Unexpected version');
const count = Object.keys(meta.sourceManifest).length;
const game = sha(readFileSync('dist/game.js'));
let inspector = readFileSync('.tools/inspect-v082-final-release.mjs', 'utf8');
for (const [before, after] of [
  ["VERSION = '0.8.2'", "VERSION = '0.8.3'"],
  ['SOURCE_COUNT = 130', `SOURCE_COUNT = ${count}`],
  ['048f26c174c329d2abfddff51ced6c25350e128e87b90c4905a69396934701c9', game],
  ['inspect-v082-final-release', 'inspect-v083-release'],
  ['artifacts/tactics-v082', 'artifacts/adaptation-v083'],
  ['exactly 130 build inputs', `exactly ${count} build inputs`],
  ['130 current build inputs', `${count} current build inputs`],
  ['existing v0.8.2 ZIP/report', 'existing v0.8.3 ZIP/report'],
]) {
  if (!inspector.includes(before)) throw Error(`Missing exact replacement: ${before}`);
  inspector = inspector.replaceAll(before, after);
}
writeFileSync('.tools/inspect-v083-release.mjs', inspector, { flag: 'wx' });
let offline = readFileSync('.tools/verify-offline-v082.mjs', 'utf8')
  .replaceAll('artifacts/tactics-v082', 'artifacts/adaptation-v083')
  .replaceAll('inspection-2', 'inspection-1')
  .replaceAll('0.8.2-G4', '0.8.3-G4');
writeFileSync('.tools/verify-offline-v083.mjs', offline, { flag: 'wx' });
console.log(JSON.stringify({ version: meta.version, sourceInputs: count, gameSha256: game }));
