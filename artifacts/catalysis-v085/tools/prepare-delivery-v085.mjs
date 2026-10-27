import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const meta=JSON.parse(readFileSync('dist/build-meta.json','utf8'));
if(meta.version!=='0.8.5'||meta.stage!=='G4')throw Error('Unexpected build');
const game=createHash('sha256').update(readFileSync('dist/game.js')).digest('hex'),count=Object.keys(meta.sourceManifest).length;
let script=readFileSync('.tools/inspect-v084-release.mjs','utf8');
const edits=[
  ["VERSION = '0.8.4'", "VERSION = '0.8.5'"],['SOURCE_COUNT = 136',`SOURCE_COUNT = ${count}`],
  ['2aef65822ee62fbf69a858335705983b826b3956e0aa1e93315a1352f0dd4dc8',game],
  ['inspect-v084-release','inspect-v085-release'],['artifacts/focus-v084','artifacts/catalysis-v085'],
  ['exactly 136 build inputs',`exactly ${count} build inputs`],['136 current build inputs',`${count} current build inputs`],
  ['existing v0.8.4 ZIP/report','existing v0.8.5 ZIP/report'],
];
for(const [before,after]of edits){if(!script.includes(before))throw Error(`Missing exact replacement: ${before}`);script=script.replaceAll(before,after);}
writeFileSync('.tools/inspect-v085-release.mjs',script,{flag:'wx'});
let offline=readFileSync('.tools/verify-offline-v084.mjs','utf8');
for(const [before,after]of [['artifacts/focus-v084','artifacts/catalysis-v085'],['0.8.4-G4','0.8.5-G4']]){
  if(!offline.includes(before))throw Error(`Missing offline replacement: ${before}`);offline=offline.replaceAll(before,after);
}
writeFileSync('.tools/verify-offline-v085.mjs',offline,{flag:'wx'});
console.log(JSON.stringify({version:meta.version,sourceInputs:count,gameSha256:game}));
