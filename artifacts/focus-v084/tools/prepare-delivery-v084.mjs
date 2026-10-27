import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meta = JSON.parse(readFileSync('dist/build-meta.json', 'utf8'));
if (meta.version !== '0.8.4') throw Error('Unexpected build');
const game = sha(readFileSync('dist/game.js')), count = Object.keys(meta.sourceManifest).length;
let inspector = readFileSync('.tools/inspect-v083-release.mjs', 'utf8');
for (const [before, after] of [
  ["VERSION = '0.8.3'", "VERSION = '0.8.4'"], ['SOURCE_COUNT = 133', `SOURCE_COUNT = ${count}`],
  ['20164abf5551375ea44a5d45eb7926527db29c9554c7882a94cdfd8ff994e330', game],
  ['inspect-v083-release', 'inspect-v084-release'], ['artifacts/adaptation-v083', 'artifacts/focus-v084'],
  ['exactly 133 build inputs', `exactly ${count} build inputs`], ['133 current build inputs', `${count} current build inputs`],
  ['existing v0.8.3 ZIP/report', 'existing v0.8.4 ZIP/report'],
]) { if (!inspector.includes(before)) throw Error(`Missing: ${before}`); inspector = inspector.replaceAll(before, after); }
writeFileSync('.tools/inspect-v084-release.mjs', inspector, { flag: 'wx' });
const offline = readFileSync('.tools/verify-offline-v083.mjs', 'utf8').replaceAll('artifacts/adaptation-v083', 'artifacts/focus-v084').replaceAll('0.8.3-G4', '0.8.4-G4');
writeFileSync('.tools/verify-offline-v084.mjs', offline, { flag: 'wx' });
console.log(JSON.stringify({ version: meta.version, sourceInputs: count, gameSha256: game }));
