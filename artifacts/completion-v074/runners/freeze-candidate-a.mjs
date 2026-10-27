import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='artifacts/completion-v074/build';
if(existsSync('.tools/v074-frozen.json'))throw Error('Already frozen; preserve previous run.');
mkdirSync(base,{recursive:true});
const startedAt=new Date().toISOString(),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
// An older unit still has a legacy default output. Preserve its new observation
// under this version, then recover the tracked historical bytes unchanged.
const legacy='artifacts/g2-noncounter-routes.json';
const tracked=execFileSync('git',['show','HEAD:'+legacy]);
if(!readFileSync(legacy).equals(tracked)){
 copyFileSync(legacy,'artifacts/completion-v074/g2-noncounter-specialist-observation.json');
 writeFileSync(legacy,tracked);
}
let typeLog='',buildLog='';
try{
 typeLog=execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{encoding:'utf8',windowsHide:true});
 buildLog=execFileSync(process.execPath,['scripts/build-offline.mjs'],{encoding:'utf8',windowsHide:true});
}catch(e){writeFileSync(base+'/failed.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),status:e.status,stdout:e.stdout?.toString(),stderr:e.stderr?.toString()},null,2));throw e;}
const meta=JSON.parse(readFileSync('dist/build-meta.json','utf8'));
if(meta.version!=='0.7.4')throw Error('Wrong version');
const mismatches=Object.entries(meta.sourceManifest).filter(([p,h])=>hash(p)!==h);
if(mismatches.length)throw Error('Build inputs differ');
const outputs=Object.fromEntries(['dist/index.html','dist/game.js','dist/build-meta.json'].map(p=>[p,hash(p)]));
const record={version:meta.version,startedAt,finishedAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),commands:[[process.execPath,'node_modules/typescript/bin/tsc','--noEmit'],[process.execPath,'scripts/build-offline.mjs']],typecheckExitCode:0,buildExitCode:0,gameSha256:outputs['dist/game.js'],outputs,sourceManifest:meta.sourceManifest,sourceInputCount:Object.keys(meta.sourceManifest).length,typeLog,buildLog};
writeFileSync(base+'/freeze.json',JSON.stringify(record,null,2));copyFileSync('dist/build-meta.json',base+'/build-meta.json');
writeFileSync('.tools/v074-frozen.json',JSON.stringify(record,null,2));
console.log(JSON.stringify({version:record.version,gameSha256:record.gameSha256,sourceInputCount:record.sourceInputCount,typecheckExitCode:0,buildExitCode:0}));
