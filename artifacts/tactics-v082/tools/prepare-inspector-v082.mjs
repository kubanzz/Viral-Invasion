import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = createHash('sha256').update(readFileSync('dist/game.js')).digest('hex');
const count = Object.keys(JSON.parse(readFileSync('dist/build-meta.json', 'utf8')).sourceManifest).length;
let source = readFileSync('.tools/inspect-v081-release.mjs', 'utf8')
  .replaceAll('0.8.1', '0.8.2').replaceAll('inspect-v081', 'inspect-v082-final')
  .replaceAll('artifacts/cadence-v081', 'artifacts/tactics-v082')
  .replace('SOURCE_COUNT = 128', `SOURCE_COUNT = ${count}`)
  .replace('exactly 128 build inputs', `exactly ${count} build inputs`)
  .replace('128 current build inputs', `${count} current build inputs`)
  .replaceAll('4d245ac6bf8d766538cad1602515f1475e24c42db2277fc010eca66e1cff4a4d', sha);
writeFileSync('.tools/inspect-v082-final-release.mjs', source, { flag: 'wx' });
console.log(JSON.stringify({ version: '0.8.2', gameSha256: sha, sourceCount: count }));
