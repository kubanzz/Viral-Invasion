import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const directory=resolve('artifacts/territory-20261103/actor-style-samples'),browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir(directory,{recursive:true});
const hash=async()=>createHash('sha256').update(await readFile('.art-generated/art-runtime.json')).digest('hex');
const report={scope:'Three single-pose source masters only, each with zero animation frame credit.',runtimeSha256:await hash(),cases:[]};
try{for(const viewport of [{width:1440,height:900},{width:667,height:320}])for(const enemyFactor of [3,4.1]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5173/artifacts/territory-20261103/actor-style-preview.html?enemyFactor=${enemyFactor}`);
  await page.waitForFunction(()=>window.__actorStyleProbe?.ready,undefined,{timeout:30000});
  const result=await page.evaluate(()=>window.__actorStyleProbe.inspect()),file=`${viewport.width}x${viewport.height}-enemy-${enemyFactor}.png`;
  await page.screenshot({path:resolve(directory,file)});report.cases.push({viewport,enemyFactor,file,errors,...result});await page.close();
  if(errors.length||!result.stateUnchanged)throw Error(`Style preview failed ${file}`);
}}finally{await browser.close();report.runtimeSha256After=await hash();report.sameRuntimeBytes=report.runtimeSha256===report.runtimeSha256After;
await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));}
if(!report.sameRuntimeBytes)throw Error('Runtime changed while capturing source masters');
console.log(JSON.stringify({directory,cases:report.cases.map(c=>({file:c.file,scale:c.cameraScale,heights:c.heights,errors:c.errors})),sameRuntimeBytes:report.sameRuntimeBytes}));
