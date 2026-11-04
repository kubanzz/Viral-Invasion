import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile('.art-generated/art-runtime.json'),runtime=JSON.parse(bytes),browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual normal Renderer readiness check on frozen supplied menu/combat states. Exact115 approved asset contract, no preview/master/old source. Complements final parent natural/dense/release verification; not itself final release acceptance.',runtimeSha256:createHash('sha256').update(bytes).digest('hex'),inputSignature:runtime.inputSignature,cases:[]};
try{for(const menu of [false,true]){
  const page=await browser.newPage({viewport:{width:667,height:320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5173/artifacts/territory-20261103/actor-animation-preview.html?normal=1&identity=${menu?'hero':'enemy.thinRay'}&clip=${menu?'idle':'walk'}${menu?'&menu=1':''}`);
  await page.waitForFunction(()=>window.__actorAnimationProbe?.ready);
  const receipt=await page.evaluate(()=>window.__actorAnimationProbe.inspect()),art=receipt.diagnostics.art;
  if(!art.actorContract.ready||art.actorContract.preview||art.actorContract.animationPreview||art.actorContract.oldSourceIds.length||art.actorContract.unexpectedActorIds.length||art.provisional.length||
    !receipt.stateUnchanged||!receipt.baselineUnchanged||art.actorFrames.some(a=>a.fallback||a.candidate||!a.native||!a.groupReady)||receipt.diagnostics.phaser.articulatedMeshes!==0||errors.length)throw Error(`Final actor ready check failed menu=${menu}`);
  if(menu&&!receipt.diagnostics.phaser.nativeSprites.some(a=>a.id==='menu:tool'))throw Error('Normal menu tool absent');
  report.cases.push({menu,errors,stateUnchanged:true,contract:art.actorContract,actors:art.actorFrames,nativeSprites:receipt.diagnostics.phaser.nativeSprites});await page.close();
}}finally{await browser.close();report.runtimeSha256After=createHash('sha256').update(await readFile('.art-generated/art-runtime.json')).digest('hex');report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;
  await writeFile('artifacts/territory-20261103/stable115-normal-ready.json',JSON.stringify(report,null,2));}
if(!report.sameRuntimeBytes)throw Error('Runtime drift during final normal readiness checks');console.log(JSON.stringify({cases:report.cases.length,ready:report.cases.every(c=>c.contract.ready),sameRuntimeBytes:true,inputSignature:runtime.inputSignature}));
