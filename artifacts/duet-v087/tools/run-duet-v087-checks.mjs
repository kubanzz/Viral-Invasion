import { spawnSync } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd(),out=resolve('artifacts/duet-v087/regression'),mode=process.argv[2];mkdirSync(out,{recursive:true});
const commands={rules:[['main-typecheck',['node_modules/typescript/bin/tsc','--noEmit'],{}],['main-nonseed',['node_modules/vitest/vitest.mjs','run','--exclude','tests/unit/full-system-seeds.test.ts','--maxWorkers=2','--reporter=json',`--outputFile=${resolve(out,'nonseed-results.json')}`],{}]],
 campaign:[['main-campaign',['node_modules/vitest/vitest.mjs','run','tests/unit/full-system-seeds.test.ts','--maxWorkers=1','--reporter=json',`--outputFile=${resolve(out,'campaign-vitest.json')}`],{VI_SYSTEM_REPORT:resolve(out,'full-system-seeds.json')}]],
 build:[['main-build',['scripts/build-offline.mjs'],{}]]};
if(!commands[mode])throw Error('Expected rules, campaign or build');const report=resolve(out,`${mode}-commands.json`);if(existsSync(report))throw Error('Preserve previous check');
for(const[name]of commands[mode])for(const stream of['stdout','stderr'])if(existsSync(resolve(out,`${name}-${stream}.txt`)))throw Error('Preserve stream');
const checks=[];for(const[name,args,extra]of commands[mode]){console.log(JSON.stringify({starting:name,args}));const startedAt=new Date().toISOString();
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:30*1024*1024,env:{...process.env,...extra}});
 for(const stream of['stdout','stderr'])writeFileSync(resolve(out,`${name}-${stream}.txt`),r[stream]??'',{flag:'wx'});
 checks.push({name,args,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?String(r.error):null});writeFileSync(report,JSON.stringify({mode,checks},null,2));console.log(JSON.stringify(checks.at(-1)));
 if(r.status!==0){process.exitCode=1;break;}}
