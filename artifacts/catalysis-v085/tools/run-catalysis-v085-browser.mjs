import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd(),attempt=process.argv[2]??'1';if(!/^[1-9][0-9]*$/.test(attempt))throw Error('Bad attempt');
const output=resolve(root,`artifacts/catalysis-v085/browser-attempt-${attempt}`);
if(existsSync(output))throw Error('Preserve browser evidence');mkdirSync(output,{recursive:true});
const checks=[];
for(const project of ['chrome','edge']){
  const args=['node_modules/playwright/cli.js','test','tests/e2e/catalysis-v085.spec.ts',`--project=${project}`];
  const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,
    VI_E2E_OUTPUT:resolve(output,project,'output'),VI_E2E_REPORT:resolve(output,project,'report.json'),
    VI_E2E_HTML:resolve(output,project,'html'),VI_E2E_LEAN:'1'}});
  checks.push({project,exitCode:r.status,signal:r.signal,command:args});
  writeFileSync(resolve(output,'summary.json'),JSON.stringify({scope:'Natural public-input optional catalyst acquisition,2→1 and2→actual-cell, pause and normal/compact status. No human comprehension or FPS claim.',checks},null,2));
  if(r.status!==0){process.exitCode=1;break;}
}
