import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const out=resolve(process.env.VI_OFFLINE_OUTPUT??'artifacts/weapon-v016/offline-final');
const metadataPath=resolve(process.env.VI_BUILD_META??'artifacts/weapon-v016/candidate-3/build-meta.json');
const mobileHtml=resolve(process.env.VI_WEAPON_MOBILE_HTML??'releases/Viral-Invasion-Mobile.html');
const desktopZip=resolve(process.env.VI_WEAPON_DESKTOP_ZIP??'releases/Viral-Invasion-G4-v0.16.0.zip');
const mobileZip=resolve(process.env.VI_WEAPON_MOBILE_ZIP??'releases/Viral-Invasion-Mobile.zip');
await mkdir(out,{recursive:true});
await writeFile(join(out,'harness.mjs'),await readFile(fileURLToPath(import.meta.url)));
const meta=JSON.parse(await readFile(metadataPath,'utf8'));
const sourceHashes=async()=>Object.fromEntries(await Promise.all(Object.keys(meta.sourceManifest).map(async path=>[path,sha(await readFile(path))])));
const require=createRequire(import.meta.url);
const {yauzl}=require(join(dirname(require.resolve('playwright-core')),'lib/utilsBundle.js'));
async function decodeZip(path){
 const bytes=await readFile(path),files=new Map();
 await new Promise((done,fail)=>yauzl.open(path,{lazyEntries:true},(error,archive)=>{
  if(error)return fail(error);archive.on('error',fail);
  archive.on('entry',entry=>{(async()=>{
   assert.ok(!isAbsolute(entry.fileName)&&!entry.fileName.split(/[\\/]/).includes('..'),'Unsafe package entry');
   if(entry.fileName.endsWith('/')){archive.readEntry();return;}
   const data=await new Promise((finish,reject)=>archive.openReadStream(entry,(err,stream)=>{
    if(err)return reject(err);(async()=>{const chunks=[];for await(const chunk of stream)chunks.push(chunk);finish(Buffer.concat(chunks));})().catch(reject);
   }));files.set(entry.fileName,data);archive.readEntry();
  })().catch(err=>{archive.close();fail(err);});});archive.on('end',done);archive.readEntry();
 }));
 return {path,sha256:sha(bytes),bytes:bytes.length,files};
}
const report={version:'0.16.0',startedAt:new Date().toISOString(),
 scope:'Independent ZIP decoding; exact packaged bytes boot through immutable allowlisted loopback HTTP with all external requests blocked; after assets finish loading, browser context is set offline before real start/fire/123/pause/resume inputs. No battlefield/storage/clock injection. This is offline-running evidence, not file:// cold-start or physical-phone evidence.',
 harnessSha256:sha(await readFile(fileURLToPath(import.meta.url))),cases:[],pass:false};
let served;
try{
 assert.equal(meta.version,'0.16.0');report.sourceBefore=await sourceHashes();assert.deepEqual(report.sourceBefore,meta.sourceManifest,'Production inputs must match final metadata before offline package smoke');
 const desktop=await decodeZip(desktopZip),mobile=await decodeZip(mobileZip),base=dirname(metadataPath);
 for(const name of ['index.html','game.js','build-meta.json'])assert.ok(desktop.files.get(name)?.equals(await readFile(join(base,name))),`Desktop ZIP ${name} differs from final candidate`);
 assert.ok(mobile.files.get('手机试玩说明.txt')?.equals(await readFile('Docs/ViralInvasion_Mobile_Playtest.md')),'Mobile instructions differ from the attested current source');
 assert.deepEqual([...desktop.files.keys()].sort(),['index.html','game.js','build-meta.json','Open-Game.cmd','README.txt'].sort(),'Unexpected desktop package entries');
 assert.deepEqual([...mobile.files.keys()].sort(),['Viral-Invasion-Mobile.html','手机试玩说明.txt'].sort(),'Unexpected mobile package entries');
 assert.equal(desktop.files.get('Open-Game.cmd').toString(),'@echo off\r\nstart \"\" \"%~dp0index.html\"\r\n');
 const instructions=desktop.files.get('README.txt').toString();assert.ok(instructions.includes('v0.16.0')&&instructions.includes('1/2/3')&&instructions.includes('F在附近'));assert.ok(!instructions.includes('双靶'),'Desktop README must not describe retired dual-target-only practice');
 const mobileBytes=await readFile(mobileHtml);assert.ok(mobile.files.get('Viral-Invasion-Mobile.html')?.equals(mobileBytes),'Mobile archive HTML differs from delivered file');
 const summarize=x=>({path:x.path,sha256:x.sha256,bytes:x.bytes,files:[...x.files].map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)}))});
 report.packages=[summarize(desktop),summarize(mobile)];
 const runtimeBytes=(await Promise.all(['index.html','game.js','game.css'].map(async name=>(await stat(join(base,name))).size))).reduce((a,b)=>a+b,0);
 report.resourceBudget={limitBytes:32 * 1024 * 1024,desktopConservativeBytes:runtimeBytes,mobileHtmlBytes:mobileBytes.length,artEmbeddedBytes:meta.art.runtimeBytes};
 assert.ok(runtimeBytes<=report.resourceBudget.limitBytes&&mobileBytes.length<=report.resourceBudget.limitBytes,'Runtime bytes exceed 32MiB budget');
 served=await startServedCandidate({metadataPath,mobileHtml,expectedVersion:'0.16.0'});const origin=new URL(served.entry).origin;
 report.outputBefore=await served.diskHashes();
 const cases=[{name:'chrome-desktop',channel:'chrome',touch:false,viewport:{width:1366,height:768}},
  {name:'edge-desktop',channel:'msedge',touch:false,viewport:{width:1366,height:768}},
  {name:'chrome-mobile-667',channel:'chrome',touch:true,viewport:{width:667,height:320}},
  {name:'edge-mobile-844',channel:'msedge',touch:true,viewport:{width:844,height:390}}];
 for(const config of cases){
  const result={...config,errors:[],externalRequests:[],requestsAfterOffline:[],responseHashes:{},pass:false};let browser,context;
  try{
   browser=await chromium.launch({channel:config.channel,headless:true});context=await browser.newContext({viewport:config.viewport,hasTouch:config.touch,isMobile:config.touch,deviceScaleFactor:1});
   let offline=false;
   await context.route('**/*',route=>{const url=route.request().url(),parsed=new URL(url);if(parsed.protocol==='data:'||parsed.protocol==='blob:')return route.continue();if(parsed.origin!==origin){result.externalRequests.push(url);return route.abort('blockedbyclient');}return route.continue();});
   const page=await context.newPage(),cdp=await context.newCDPSession(page);
   page.on('pageerror',error=>result.errors.push(error.message));page.on('request',request=>{if(offline&&/^https?:/.test(request.url()))result.requestsAfterOffline.push(request.url());});
   const drain=await observeServedResponses(cdp,result,origin);
   const path=config.touch?'/mobile.html':'/index.html';await page.goto(origin+path+'?seed=71');
   await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true',{timeout:30000});
   await page.waitForLoadState('networkidle');await drain();
   assert.match(await page.evaluate(()=>window.__viral.version),/^0\.16\.0/);
   assert.equal(result.responseHashes[path.slice(1)],sha(config.touch?mobileBytes:desktop.files.get('index.html')),'Returned entry is not the released package bytes');
   if(!config.touch)assert.equal(result.responseHashes['game.js'],sha(desktop.files.get('game.js')),'Returned desktop game.js mismatch');
   await context.setOffline(true);offline=true;result.offlineBeforeStart=true;
   const center=async selector=>{const locator=page.locator(selector).filter({visible:true}).first();const before=await locator.boundingBox();await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();assert.ok(b);const p={x:b.x+b.width/2,y:b.y+b.height/2};assert.ok(p.x>=0&&p.x<=config.viewport.width&&p.y>=0&&p.y<=config.viewport.height,'UI target outside viewport: '+selector);(result.controlTargets??=[]).push({selector,before,after:b});return p;};
   const touchAt=async(point,hold=40)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:4,radiusY:4,force:1}]});await page.waitForTimeout(hold);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...point,id:1,radiusX:4,radiusY:4,force:1}]});};
   const tap=async selector=>config.touch?touchAt(await center(selector)):page.locator(selector).filter({visible:true}).first().click();
   const read=()=>page.evaluate(()=>window.__viral.snapshot());
   await tap('[data-action="endless-start"]');await expect.poll(async()=>(await read()).phase).toBe('playing');
   const initial=await read();result.initial={seed:initial.seed,loadout:initial.expedition.loadout,phase:initial.phase};assert.deepEqual(initial.expedition.loadout,{weaponId:'steady',rarity:'white',upgrade:0});
   if(config.touch)await touchAt(await center('[data-stick="attack"]'),450);
   else{const p=await page.evaluate(()=>window.__viral.toScreen({x:window.__viral.snapshot().player.x+250,y:window.__viral.snapshot().player.y}));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();}
   await expect.poll(async()=>(await read()).shots).toBeGreaterThan(0);
   for(const slot of [3,1,2]){
    if(config.touch)await tap(`[data-weapon-skill="${slot}"]`);else await page.keyboard.press('Digit'+slot);
    await expect.poll(async()=>(await read()).weaponCombat.cooldowns[slot]).toBeGreaterThan(0);
    await page.waitForTimeout(slot===1?450:200);
   }
   const active=await read();result.offlineCombat={elapsed:active.elapsed,shots:active.shots,skillCooldowns:active.weaponCombat.cooldowns,tool:active.tool};
   assert.equal(active.tool,1);assert.equal(active.chargedSlash,undefined);
   await page.screenshot({path:join(out,config.name+'-offline-combat.png')});
   await tap('[data-action="pause"]');await expect.poll(async()=>(await read()).phase).toBe('paused');
   const paused=await read();await page.waitForTimeout(350);assert.equal((await read()).elapsed,paused.elapsed);
   await tap('[data-action="continue"]');await expect.poll(async()=>(await read()).elapsed).toBeGreaterThan(paused.elapsed);
   const resumed=await read();await page.waitForTimeout(180);assert.equal((await read()).shots,resumed.shots,'Pause/resume retained stale fire');
   if(config.touch)await touchAt(await center('[data-stick="attack"]'),250);
   else{const p=await page.evaluate(()=>window.__viral.toScreen({x:window.__viral.snapshot().player.x+250,y:window.__viral.snapshot().player.y}));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();}
   await expect.poll(async()=>(await read()).shots).toBeGreaterThan(resumed.shots);result.freshInputAfterResume=true;
   await drain();assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);assert.deepEqual(result.requestsAfterOffline,[]);
   result.pass=true;
  }catch(error){result.failure=error.stack??String(error);}
  finally{await context?.close();await browser?.close();report.cases.push(result);await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
 }
 report.outputAfter=await served.diskHashes();report.outputsUnchanged=JSON.stringify(report.outputBefore)===JSON.stringify(report.outputAfter);assert.ok(report.outputsUnchanged);
 report.sourceAfter=await sourceHashes();report.sourcesUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);assert.ok(report.sourcesUnchanged);
 report.transport=served.snapshot();report.pass=report.cases.length===4&&report.cases.every(x=>x.pass);
}catch(error){report.failure=error.stack??String(error);}
finally{await served?.close();report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,resourceBudget:report.resourceBudget,cases:report.cases.map(({name,pass,errors,externalRequests,requestsAfterOffline,failure})=>({name,pass,errors,externalRequests,requestsAfterOffline,failure})),failure:report.failure}));if(!report.pass)process.exitCode=1;
