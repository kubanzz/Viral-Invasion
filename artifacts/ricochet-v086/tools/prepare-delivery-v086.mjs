import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const meta=JSON.parse(readFileSync('dist/build-meta.json','utf8'));
if(meta.version!=='0.8.6'||meta.stage!=='G4')throw Error('Unexpected build');
const game=createHash('sha256').update(readFileSync('dist/game.js')).digest('hex'),count=Object.keys(meta.sourceManifest).length;
let inspector=readFileSync('.tools/inspect-v085-release.mjs','utf8');
for(const[before,after]of[["VERSION = '0.8.5'","VERSION = '0.8.6'"],['SOURCE_COUNT = 139',`SOURCE_COUNT = ${count}`],
 ['e0a4e92aad26c05bb0ea28cc27e2f8bda6fe176d18e039e01e85e0c640542bac',game],['inspect-v085-release','inspect-v086-release'],
 ['artifacts/catalysis-v085','artifacts/ricochet-v086'],['exactly 139 build inputs',`exactly ${count} build inputs`],
 ['139 current build inputs',`${count} current build inputs`],['existing v0.8.5 ZIP/report','existing v0.8.6 ZIP/report']]){
  if(!inspector.includes(before))throw Error(`Missing exact replacement: ${before}`);inspector=inspector.replaceAll(before,after);
}
writeFileSync('.tools/inspect-v086-release.mjs',inspector,{flag:'wx'});
let offline=readFileSync('.tools/verify-offline-v085.mjs','utf8');
for(const[before,after]of[['artifacts/catalysis-v085','artifacts/ricochet-v086'],['0.8.5-G4','0.8.6-G4']]){
  if(!offline.includes(before))throw Error(`Missing exact offline replacement: ${before}`);offline=offline.replaceAll(before,after);
}
writeFileSync('.tools/verify-offline-v086.mjs',offline,{flag:'wx'});
console.log(JSON.stringify({version:meta.version,sourceInputs:count,gameSha256:game}));
