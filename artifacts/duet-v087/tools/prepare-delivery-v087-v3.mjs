import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lineage = JSON.parse(read('artifacts/duet-v087/render-label-v3/source-lineage.json'));
const meta = JSON.parse(read('dist/build-meta.json'));
if (!lineage.pass || sha(read('dist/game.js')) !== lineage.v3GameSha256 || meta.version !== '0.8.7'
  || meta.stage !== 'G4' || Object.keys(meta.sourceManifest).length !== 142) throw Error('Final V3 build lineage required');
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  if (sha(read(path)) !== expected) throw Error(`Final V3 input changed: ${path}`);
}
const inspectorPath = resolve(root, '.tools/inspect-v087-release-v3.mjs');
const offlinePath = resolve(root, '.tools/verify-offline-v087-v3.mjs');
if (existsSync(inspectorPath) || existsSync(offlinePath)) throw Error('Preserve existing V3 delivery helpers');
function replace(source, before, after) {
  if (!source.includes(before)) throw Error(`Missing exact replacement: ${before}`);
  return source.replaceAll(before, after);
}
let inspector = read('.tools/inspect-v087-release.mjs').toString('utf8');
inspector = replace(inspector, lineage.v2GameSha256, lineage.v3GameSha256);
inspector = replace(inspector, 'inspect-v087-release', 'inspect-v087-release-v3');
let offline = read('.tools/verify-offline-v087.mjs').toString('utf8');
offline = replace(offline, 'release/inspection-1', 'release/inspection-2');
offline = replace(offline, 'release/offline-smoke-1', 'release/offline-smoke-2');
writeFileSync(inspectorPath, inspector, { flag: 'wx' });
writeFileSync(offlinePath, offline, { flag: 'wx' });
console.log(JSON.stringify({ version: meta.version, sourceInputs: 142, gameSha256: lineage.v3GameSha256,
  inspector: '.tools/inspect-v087-release-v3.mjs', inspectionCommand: 'node .tools/inspect-v087-release-v3.mjs --run --attempt=2',
  offline: '.tools/verify-offline-v087-v3.mjs', offlineOutput: 'artifacts/duet-v087/release/offline-smoke-2/report.json' }));
