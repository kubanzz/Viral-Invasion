import { spawnSync } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd(),attempt=process.argv[2]??'1';if(!/^[1-9][0-9]*$/.test(attempt))throw Error('Bad attempt');const out=resolve(`artifacts/duet-v087/browser-attempt-${attempt}`);
if(existsSync(out))throw Error('Preserve browser evidence');mkdirSync(out,{recursive:true});const checks=[];
for(const project of['chrome','edge']){const args=['node_modules/playwright/cli.js','test','tests/e2e/duet-v087.spec.ts',`--project=${project}`];
 const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,VI_E2E_OUTPUT:resolve(out,project,'output'),VI_E2E_REPORT:resolve(out,project,'report.json'),VI_E2E_HTML:resolve(out,project,'html'),VI_E2E_LEAN:'1'}});
 checks.push({project,args,exitCode:r.status,signal:r.signal});writeFileSync(resolve(out,'summary.json'),JSON.stringify({checks,scope:'Natural seed71 public input to20; disclosed hold-fire orbit observation, two real elite tactics/advances,8s warning, pause, normal/compact display. No balance or human comprehension claim.'},null,2));
 if(r.status!==0){process.exitCode=1;break;}}
