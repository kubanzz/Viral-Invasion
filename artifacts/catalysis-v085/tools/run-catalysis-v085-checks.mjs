import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const mode = process.argv[2], root = process.cwd(), output = resolve(root,'artifacts/catalysis-v085/regression');
mkdirSync(output,{recursive:true});
const choices = {
  rules: [
    ['main-typecheck',['node_modules/typescript/bin/tsc','--noEmit'],{}],
    ['main-nonseed',['node_modules/vitest/vitest.mjs','run','--exclude','tests/unit/full-system-seeds.test.ts','--maxWorkers=2','--reporter=json',`--outputFile=${resolve(output,'main-nonseed-results.json')}`],{}],
  ],
  campaign: [['full-system',['node_modules/vitest/vitest.mjs','run','tests/unit/full-system-seeds.test.ts','--maxWorkers=1','--reporter=json',`--outputFile=${resolve(output,'full-system-vitest-results.json')}`],{VI_SYSTEM_REPORT:resolve(output,'full-system-seeds.json')}]],
  build: [['build',['scripts/build-offline.mjs'],{}]],
};
if (!choices[mode]) throw Error('Expected rules, campaign or build');
const resultPath=resolve(output,`${mode}-commands.json`);if(existsSync(resultPath))throw Error('Preserve previous checks');
const rows=[];
for(const [name,args,env]of choices[mode]){
  const startedAt=new Date().toISOString(); console.log(JSON.stringify({starting:name,args}));
  const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:30*1024*1024,env:{...process.env,...env}});
  writeFileSync(resolve(output,`${name}-stdout.txt`),r.stdout??'',{flag:'wx'});
  writeFileSync(resolve(output,`${name}-stderr.txt`),r.stderr??'',{flag:'wx'});
  rows.push({name,args,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?String(r.error):null});
  writeFileSync(resultPath,JSON.stringify({mode,rows},null,2));console.log(JSON.stringify(rows.at(-1)));
  if(r.status!==0){process.exitCode=1;break;}
}
