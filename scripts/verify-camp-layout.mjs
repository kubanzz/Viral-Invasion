import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Independent acceptance evidence. Supplied camp state and entitlement fixtures
// are explicitly distinct from a naturally unlocked camp or a released ZIP.
const value = name => process.argv.find(v => v.startsWith(name+'='))?.slice(name.length+1);
const label=value('--label')??'pilot';
const output=resolve(value('--out')??`artifacts/camp-layout-v4/${label}`);
const renderOnly=process.argv.includes('--render-only');
const builtDir=value('--built-dir')?resolve(value('--built-dir')):undefined;
await mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={label,scope:'Current production Renderer and game modules; supplied camp state fixtures are not natural unlocking. Live fixture section uses isolated earned-entitlement data and real DOM input.',startedAt:new Date().toISOString(),render:[],live:[],errors:[],pass:false};
const runtimeBytes=await readFile('.art-generated/art-runtime.json'),runtime=JSON.parse(runtimeBytes);
const groundIds=['fantasy.camp.ground.workshop','fantasy.camp.ground.supply','fantasy.camp.ground.departure'];
const groundImages=groundIds.filter(id=>runtime.environments[id]).map(id=>({id,uri:runtime.environments[id].dataUri}));
const requireCompleteArt=label==='final'||!!builtDir;
report.runtime={sha256:sha(runtimeBytes),signature:runtime.inputSignature,sprites:Object.keys(runtime.assets).length,environments:Object.keys(runtime.environments).length,groundIds:groundImages.map(g=>g.id),forgeSource:runtime.assets['fantasy.camp.forge.fixed.ready.00']?.source};
if(requireCompleteArt){assert.deepEqual(groundImages.map(g=>g.id),groundIds);assert.ok(runtime.assets['fantasy.camp.forge.fixed.ready.00'],'New forge must be selected before final acceptance');}
async function installGroundProbe(context){
 // Observation only: call the original drawImage with identical arguments and
 // inspect the HTML image identity afterward. No simulation or render inputs change.
 await context.addInitScript(images=>{
  const ids=new Map(images.map(image=>[image.uri,image.id])),cache=new WeakMap(),seen={};
  window.__campGroundProbe=seen;
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   const returned=Reflect.apply(original,this,[image,...args]);
   try{
    let id=cache.get(image);if(id===undefined){id=ids.get(image.currentSrc||image.src)||null;cache.set(image,id);}
    if(id&&args.length===4){const item=seen[id]??={count:0,width:image.naturalWidth,height:image.naturalHeight,calls:[]};item.count++;if(item.calls.length<8)item.calls.push(args);}
   }catch{}
   return returned;
  };
 },groundImages);
}
function checkGroundUsage(usage,layout){
 for(const {id} of groundImages){const yard=layout.courtyards.find(c=>id.endsWith('.'+c.id)),record=usage[id];assert.ok(record?.count>0&&record.calls.some(call=>Math.abs(call[2]-(yard.rect.right-yard.rect.left))<.01&&Math.abs(call[3]-(yard.rect.bottom-yard.rect.top))<.01),`Actual painted ground draw used: ${id}`);}
}
function checkFacilityFrames(frames){
 for(const id of ['warehouse','forge','shop','departure']){const frame=frames.find(f=>f.entityId===`camp:${id}`);assert.ok(frame?.native&&!frame.fallback,`Native facility frame: ${id}`);if(id==='forge'&&requireCompleteArt)assert.equal(frame.frame,'fantasy.camp.forge.fixed.ready.00','New forge is used, not the legacy stone-anvil fallback');}
}
const renderSource=String.raw`
import {GameSession} from './src/game/session';
import {prepareCampScene} from './src/game/campScene';
import {campLayout,isCampPositionLegal} from './src/game/campLayout';
import {Renderer} from './src/render/phaserRenderer';
const session=new GameSession(20261105,{campaign:true,milestone:'G3',mode:'endless',territory:true});session.start();
prepareCampScene(session.state,true);const initial=structuredClone(session.state),renderer=new Renderer(document.querySelector('canvas'));
let current;
function view(){
 const d=renderer.diagnostics(current),p=current.player,foot=renderer.camera.worldToScreen(p),scale=renderer.camera.scale;
 const bodies=Object.fromEntries(d.art.activeBodies.map(({id,bounds:b})=>[id,{left:foot.x+(b.left-p.x)*scale,right:foot.x+(b.right-p.x)*scale,top:foot.y+(b.top-p.y*.72)*scale,bottom:foot.y+(b.bottom-p.y*.72)*scale,height:(b.bottom-b.top)*scale,width:(b.right-b.left)*scale}]));
 const nativeFrames=d.art.actorFrames.filter(f=>f.entityId==='player'||String(f.entityId).startsWith('camp:')).map(f=>({entityId:f.entityId,frame:f.frame,visible:f.visible,native:f.native,fallback:f.fallback,source:f.source}));
 return{player:{x:p.x,y:p.y,radius:p.radius},layout:campLayout(current),scale,bodies,nativeFrames,contractReady:d.art.actorContract.ready,labels:d.labels,legal:isCampPositionLegal(p,p.radius,campLayout(current))};
}
function paint(target='spawn'){
 current=structuredClone(initial);current.elapsed=8;current.visualTime=8;current.tick=480;current.player.facing=Math.PI/4;
 if(target!=='spawn'){const station=campLayout(current).facilities.find(f=>f.id===target);Object.assign(current.player,station.interactionPosition);}
 renderer.resize();renderer.setHudRects([{left:0,right:600,top:0,bottom:38}]);renderer.prepareCamera(current,{snap:true});renderer.render(current,current.player,{lowEffects:true,cameraPrepared:true});
 document.querySelector('#label').textContent='显式营地渲染 fixture · '+target+' · 生产 Renderer / 未模拟自然解锁';
 return view();
}
window.campRenderFixture={ready:false,paint,view,destroy:()=>renderer.destroy()};renderer.ready.then(()=>{paint();window.campRenderFixture.ready=true;});
`;
const renderBuild=await build({stdin:{contents:renderSource,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',target:'es2022',metafile:true,define:{'process.env.NODE_ENV':'"production"'}});
const sourcePaths=Object.keys(renderBuild.metafile.inputs).filter(p=>p!=='<stdin>');
report.sourceAtRenderBuild=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(p))])));
const fixturePath=join(output,'.render-fixture.html');
await writeFile(fixturePath,`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#eab3a2}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;top:6px;left:8px;z-index:20;padding:5px 9px;border-radius:7px;background:#fff3dce8;color:#375b45;font:11px 'Microsoft YaHei',sans-serif}</style><canvas></canvas><div id="app"></div><div id="label"></div><script>${renderBuild.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const viewport of [{width:1366,height:768},{width:844,height:390},{width:667,height:320}]){
  const name=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage();
  await installGroundProbe(context);
  page.on('pageerror',error=>report.errors.push({scope:'render',viewport,error:error.message}));
  await page.goto(pathToFileURL(fixturePath).href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.campRenderFixture?.ready,{timeout:60000});
  for(const target of ['spawn','warehouse']){
   const result=await page.evaluate(t=>window.campRenderFixture.paint(t),target);await page.waitForTimeout(100);result.groundUsage=await page.evaluate(()=>window.__campGroundProbe);checkGroundUsage(result.groundUsage,result.layout);checkFacilityFrames(result.nativeFrames);
   const file=`render-${name}-${target}.png`;await page.screenshot({path:join(output,file)});
   const hero=result.bodies.player,warehouse=result.bodies['camp:warehouse'];
   assert.ok(result.legal,'Render fixture must stand at a legal production camp position');
   assert.ok(hero&&warehouse,'Production renderer exposes both real hero and warehouse bounds');
   const ratio=warehouse.height/hero.height;assert.ok(ratio>=2.4&&ratio<=3.3,`Warehouse/hero visual ratio ${ratio}`);
   assert.ok(hero.height>=28,`Hero remains readable: ${hero.height}px`);
   if(viewport.width>1024&&target==='spawn')assert.deepEqual(result.labels.placements.map(p=>p.id).sort(),['camp-area:departure','camp-area:supply','camp-area:workshop'],'The desktop overview presents all three distinct area labels');
   if(target==='warehouse')assert.ok(hero.top>=35&&hero.bottom<=viewport.height-8,'Nearby hero stays inside the supplied render viewport');
   report.render.push({name,target,file,...result,warehouseToHero:ratio,pass:true});
   console.log(JSON.stringify({phase:'render',name,target,file,heroHeight:hero.height,warehouseHeight:warehouse.height,ratio}));
  }
  await page.evaluate(()=>window.campRenderFixture.destroy());await context.close();
 }
 if(!renderOnly)await verifyLive(browser);
 report.pass=report.errors.length===0;
}catch(error){report.failure=error.stack??String(error);console.error(report.failure);process.exitCode=1;}
finally{
 await browser.close();await unlink(fixturePath);
 report.completedAt=new Date().toISOString();report.wallSeconds=(Date.parse(report.completedAt)-Date.parse(report.startedAt))/1000;
 report.sourceAfter=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(p))])));
 report.renderSourcesStable=JSON.stringify(report.sourceAtRenderBuild)===JSON.stringify(report.sourceAfter);
 report.pilot=label!=='final';if(label==='final')report.pass&&=report.renderSourcesStable;
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({output,pass:report.pass,pilot:report.pilot,sourcesStable:report.renderSourcesStable,render:report.render.length,live:report.live.length,errors:report.errors.length}));
 if(!report.pass)process.exitCode=1;
}

async function verifyLive(browser){
 const helper=await build({stdin:{contents:"export {CampProfileStore,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {createBossLoot} from './src/game/expedition';export {campLayout,isCampPositionLegal} from './src/game/campLayout';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
 const model=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
 const memory=new Map(),store=new model.CampProfileStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)});
 const fixtureRun='camp-layout-v4:explicit-entitlement-fixture',seed=20261105;
 store.beginExpedition(fixtureRun,seed);const settlement=store.settleVictory(fixtureRun,model.createBossLoot(fixtureRun,seed,true));assert.equal(settlement.accepted,true);store.finishCampIntro();
 const fixtureProfile=memory.get(model.CAMP_PROFILE_STORAGE_KEY);assert.ok(fixtureProfile);
 await writeFile(join(output,'unlocked-profile-fixture.json'),JSON.stringify({scope:'Entitlement fixture produced through current CampProfileStore.beginExpedition/settleVictory/finishCampIntro. No natural Boss fight or rescue is claimed.',profile:JSON.parse(fixtureProfile)},null,2));
 let entry=value('--entry')?resolve(value('--entry')):undefined,liveSources=[];
 if(!entry){
  const buildDir=join(output,'current-build');await mkdir(buildDir,{recursive:true});
  const built=await build({entryPoints:['src/main.ts'],bundle:true,outdir:buildDir,entryNames:'game',format:'iife',target:'chrome110',metafile:true,minify:true,legalComments:'none'});
  const css=await readFile(join(buildDir,'game.css'),'utf8');
  const html=(await readFile('index.html','utf8')).replace('<!-- STYLES -->',`<style>${css}</style>`).replace('<script type="module" src="/src/main.ts"></script>','<script src="./game.js"></script>');
  entry=join(buildDir,'index.html');await writeFile(entry,html);
  liveSources=Object.keys(built.metafile.inputs);report.liveSourceAtBuild=Object.fromEntries(await Promise.all(liveSources.map(async p=>[p,sha(await readFile(p))])));
  await writeFile(join(buildDir,'fixture-build-meta.json'),JSON.stringify({scope:'Independent current production-entry classic offline build for acceptance. Not a packaged release.',sourceManifest:report.liveSourceAtBuild},null,2));
 }
 report.liveEntry={path:entry,sha256:sha(await readFile(entry)),offline:true,entitlementFixture:true};
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const read=page=>page.evaluate(()=>{const s=window.__viral.snapshot();return{player:{x:s.player.x,y:s.player.y,radius:s.player.radius},phase:s.phase,elapsed:s.elapsed,tick:s.tick,camp:!!s.camp,section:document.querySelector('.camp-nav [aria-current="page"]')?.getAttribute('data-section')??null};});
 async function activate(page,touch,selector){const node=page.locator(selector).filter({visible:true}).first();await node.waitFor({state:'visible',timeout:5000});await node.scrollIntoViewIfNeeded();if(touch)await node.tap();else await node.click();}
 function mover(page,touch,cdp){
  const held=new Set();let active=false;
  return{
   async move(dx,dy){
    const magnitude=Math.hypot(dx,dy)||1;dx/=magnitude;dy/=magnitude;
    if(!touch){const next=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of held)if(!next.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}return;}
    const b=await page.locator('[data-stick="move"]').boundingBox();assert.ok(b,'Production move stick exists');const c={x:b.x+b.width/2,y:b.y+b.height/2};
    if(!active){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...c,radiusX:4,radiusY:4,force:1}]});active=true;}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:c.x+dx*36,y:c.y+dy*36,radiusX:4,radiusY:4,force:1}]});
   },
   async release(){for(const key of held)await page.keyboard.up(key);held.clear();if(active){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});active=false;}},
  };
 }
 async function walk(page,movement,target,result,tolerance=10){
  const started=Date.now();let previous=await read(page),still=0,steps=0;
  while(distance(previous.player,target)>tolerance){
   assert.ok(Date.now()-started<14000,`Walking deadline at ${JSON.stringify({target,player:previous.player})}`);assert.ok(previous.camp&&previous.phase==='playing','Actual walking remains in active camp');
   const dx=target.x-previous.player.x,dy=target.y-previous.player.y;
   await movement.move(Math.abs(dx)>5?dx:0,Math.abs(dy)>5?dy:0);
   await page.waitForTimeout(Math.min(110,Math.max(35,(distance(previous.player,target)-5)/235*1000)));
   const next=await read(page);still=distance(previous.player,next.player)<.3?still+1:0;
   assert.ok(still<10,`Production movement stuck: ${JSON.stringify({target,player:next.player})}`);
   previous=next;steps++;
  }
  await movement.release();await page.waitForTimeout(35);const end=await read(page);
  result.walks.push({target,arrived:end.player,steps,elapsed:end.elapsed,actualDistance:distance(end.player,target)});return end;
 }
 async function screenEvidence(page){return page.evaluate(()=>{
  const s=window.__viral.snapshot(),d=window.__viral.diagnostics(),p=s.player,base=window.__viral.toScreen(p),other=window.__viral.toScreen({x:p.x+100,y:p.y}),scale=(other.x-base.x)/100;
  const bodies=Object.fromEntries(d.art.activeBodies.map(({id,bounds:b})=>[id,{left:base.x+(b.left-p.x)*scale,right:base.x+(b.right-p.x)*scale,top:base.y+(b.top-p.y*.72)*scale,bottom:base.y+(b.bottom-p.y*.72)*scale,height:(b.bottom-b.top)*scale,width:(b.right-b.left)*scale,worldHeight:b.bottom-b.top}]));
  const hero=bodies.player,toolbar=document.getElementById('camp-toolbar')?.getBoundingClientRect();
  const samples=hero?[{x:(hero.left+hero.right)/2,y:hero.top+5},{x:(hero.left+hero.right)/2,y:(hero.top+hero.bottom)/2},{x:(hero.left+hero.right)/2,y:hero.bottom-4}].map(q=>({...q,element:document.elementFromPoint(q.x,q.y)?.tagName,id:document.elementFromPoint(q.x,q.y)?.id})):[];
  const nativeFrames=d.art.actorFrames.filter(f=>f.entityId==='player'||String(f.entityId).startsWith('camp:')).map(f=>({entityId:f.entityId,frame:f.frame,visible:f.visible,native:f.native,fallback:f.fallback,source:f.source}));
  return{viewport:{width:innerWidth,height:innerHeight},scale,bodies,nativeFrames,toolbar:toolbar?{left:toolbar.left,top:toolbar.top,right:toolbar.right,bottom:toolbar.bottom}:null,heroSamples:samples,phase:s.phase,camp:!!s.camp};
 });}
 await verifyBuiltSmoke();
 for(const config of [{name:'desktop-1366x768',width:1366,height:768,touch:false},{name:'touch-844x390',width:844,height:390,touch:true},{name:'touch-667x320',width:667,height:320,touch:true}].filter(c=>!value('--case')||c.name===value('--case'))){
  const result={...config,scope:'Isolated entitlement fixture; actual production main-menu entry, controls and camp UI; no state/clock/player writes after load.',walks:[],facilities:[],errors:[],remoteRequests:[],pass:false};report.live.push(result);
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},hasTouch:config.touch,isMobile:config.touch,deviceScaleFactor:1});await context.setOffline(true);await installGroundProbe(context);
  await context.addInitScript(({key,json})=>{try{localStorage.setItem(key,json);}catch{}},{key:model.CAMP_PROFILE_STORAGE_KEY,json:fixtureProfile});
  const page=await context.newPage(),cdp=await context.newCDPSession(page),movement=mover(page,config.touch,cdp);
  page.on('pageerror',error=>result.errors.push(error.message));page.on('request',request=>{if(/^https?:/i.test(request.url()))result.remoteRequests.push(request.url());});
  try{
   const url=pathToFileURL(entry);if(config.touch)url.searchParams.set('mobile','1');
   await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__viral?.diagnostics().art.actorContract.ready,{timeout:60000});await page.bringToFront();
   await activate(page,config.touch,'[data-action="camp-open"]');await page.waitForFunction(()=>!!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');await page.waitForTimeout(250);
   await page.evaluate(()=>{const badge=document.createElement('aside');badge.textContent='已解锁档案 fixture · 真实输入验收';badge.style.cssText='position:fixed;bottom:2px;right:3px;z-index:99999;pointer-events:none;background:#fff5dddc;color:#375743;padding:2px 5px;font:9px sans-serif';document.body.append(badge);});
   const state=await page.evaluate(()=>window.__viral.snapshot()),layout=model.campLayout(state);result.layout=layout;result.entryState=await read(page);result.spawnScreen=await screenEvidence(page);
   await page.screenshot({path:join(output,`live-${config.name}-spawn.png`)});console.log(JSON.stringify({phase:'live-entered',name:config.name,file:`live-${config.name}-spawn.png`}));
   let yard;
   const transit={x:layout.origin.x+100,y:layout.origin.y+100};
   for(const id of ['warehouse','forge','shop','departure']){
    const facility=layout.facilities.find(f=>f.id===id),nextYard=layout.courtyards.find(c=>c.id===facility.courtyardId);
    if(yard&&yard.id!==nextYard.id){
     const dir=yard.gate.side==='east'?1:-1,corridor=yard.gate.center.x-dir*55,now=await read(page);
     for(const target of [{x:corridor,y:now.player.y},{x:corridor,y:yard.gate.center.y},yard.gate.center,{x:yard.gate.center.x+dir*55,y:yard.gate.center.y},transit])await walk(page,movement,target,result);
     yard=undefined;
    }
    const dir=nextYard.gate.side==='east'?1:-1,corridor=nextYard.gate.center.x-dir*55;
    if(!yard){
     await walk(page,movement,transit,result);
     for(const target of [{x:layout.origin.x+100,y:nextYard.gate.center.y},{x:nextYard.gate.center.x+dir*55,y:nextYard.gate.center.y},nextYard.gate.center,{x:corridor,y:nextYard.gate.center.y}])await walk(page,movement,target,result);
    }else{const now=await read(page);await walk(page,movement,{x:corridor,y:now.player.y},result);}
    await walk(page,movement,{x:corridor,y:facility.interactionPosition.y},result);const arrived=await walk(page,movement,facility.interactionPosition,result,12);yard=nextYard;
    const full=await page.evaluate(()=>window.__viral.snapshot());assert.ok(model.isCampPositionLegal(full.player,full.player.radius,model.campLayout(full)),'Actual input ended at a legal camp position');
    const screen=await screenEvidence(page),hero=screen.bodies.player,building=screen.bodies[`camp:${id}`];assert.ok(hero&&building,'Actual destination and hero have native bounds');
    assert.ok(hero.top>=35&&hero.bottom<=config.height-5,`Hero fits ${config.name}/${id}: ${JSON.stringify(hero)}`);
    assert.ok(screen.heroSamples.every(sample=>sample.element==='CANVAS'),`Player head, body and feet stay exposed to the game canvas at ${config.name}/${id}`);
    if(config.touch)assert.ok(building.left>=-3&&building.right<=config.width+3&&building.top>=45&&building.bottom<=config.height-3,`Nearest facility fits mobile camera ${config.name}/${id}: ${JSON.stringify(building)}`);
    if(id==='warehouse'){const ratio=building.height/hero.height;assert.ok(ratio>=2.4&&ratio<=3.3);result.warehouseToHero=ratio;result.campHeroWorldHeight=hero.worldHeight;}
    await page.screenshot({path:join(output,`live-${config.name}-${id}-approach.png`)});
    if(config.touch)await activate(page,true,`#camp-toolbar [data-action="camp-section"][data-section="${id}"]`);else await page.keyboard.press('e');
    await page.waitForFunction(expected=>document.querySelector('.camp-nav [aria-current="page"]')?.getAttribute('data-section')===expected,id);
    const paused=await read(page);assert.equal(paused.phase,'paused');
    await page.keyboard.down('d');await page.waitForTimeout(260);const held=await read(page);await page.keyboard.up('d');
    assert.equal(held.elapsed,paused.elapsed);assert.equal(distance(held.player,paused.player),0,'Facility modal freezes production camp movement');
    await page.screenshot({path:join(output,`live-${config.name}-${id}-modal.png`)});
    await activate(page,config.touch,'[data-action="camp-close"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');await page.waitForTimeout(100);
    const resumed=await read(page);assert.ok(distance(resumed.player,paused.player)<.1,'Closing a modal does not retain blocked keyboard movement');
    result.facilities.push({id,arrival:arrived,screen,paused,held,resumed,pass:true});console.log(JSON.stringify({phase:'live-facility',name:config.name,id,file:`live-${config.name}-${id}-approach.png`}));
   }
   if(config.touch){
    await page.setViewportSize({width:config.height,height:config.width});await page.waitForTimeout(180);const portrait=await read(page);assert.equal(portrait.phase,'paused');
    await page.setViewportSize({width:config.width,height:config.height});await page.waitForTimeout(180);await activate(page,true,'[data-action="camp-close"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
    await page.locator('.camp-overlay').waitFor({state:'hidden'});await page.bringToFront();await page.waitForTimeout(120);
    const hit=await page.locator('[data-stick="move"]').evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:document.elementFromPoint(x,y)?.outerHTML,focus:document.hasFocus()};});
    const before=await read(page);await movement.move(-1,0);await page.waitForFunction(t=>window.__viral.snapshot().elapsed>=t+.16,before.elapsed,{timeout:3000});const after=await read(page);await movement.release();
    result.rotation={portrait,before,after,hit,distance:distance(before.player,after.player)};await page.screenshot({path:join(output,`live-${config.name}-rotation-resumed.png`)});assert.ok(result.rotation.distance>10,'Touch movement resumes after rotation');
   }
   await activate(page,config.touch,'#camp-toolbar [data-action="camp-section"][data-section="overview"]');await activate(page,config.touch,'[data-action="camp-leave"]');
   await page.waitForFunction(()=>window.__viral.snapshot().phase==='menu'&&!window.__viral.snapshot().camp);
   assert.ok(!await page.locator('body').evaluate(n=>n.classList.contains('camp-world')));
   await activate(page,config.touch,'[data-action="camp-open"]');await page.waitForFunction(()=>!!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');await page.waitForTimeout(120);
   result.reentered=await read(page);assert.ok(distance(result.reentered.player,layout.spawn)<.1,'Reentry uses the real camp spawn');
   const profileAfterWalking=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.CAMP_PROFILE_STORAGE_KEY);
   assert.deepEqual(profileAfterWalking,JSON.parse(fixtureProfile),'Walking, looking at facilities, pausing and reentering do not mutate the reward/profile ledger');
   await page.screenshot({path:join(output,`live-${config.name}-reentered.png`)});
   await activate(page,config.touch,'#camp-toolbar [data-action="camp-section"][data-section="departure"]');await activate(page,config.touch,'[data-action="camp-deploy"]');
   await page.waitForFunction(()=>!window.__viral.snapshot().camp&&window.__viral.snapshot().phase!=='menu');await page.waitForTimeout(250);const battle=await screenEvidence(page);
   assert.equal(battle.camp,false);assert.ok(!await page.locator('body').evaluate(n=>n.classList.contains('camp-world')));assert.ok(battle.bodies.player.worldHeight>result.campHeroWorldHeight*1.4,'Battle restores its readable actor scale');
   result.battle=battle;await page.screenshot({path:join(output,`live-${config.name}-departed-battle.png`)});
   if((await read(page)).phase==='playing')await activate(page,config.touch,'[data-action="pause"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='paused');
   await activate(page,config.touch,'[data-action="menu"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='menu');await activate(page,config.touch,'[data-action="camp-open"]');
   await page.waitForFunction(()=>!!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');await page.waitForTimeout(150);result.returnedCamp=await screenEvidence(page);
   assert.ok(Math.abs(result.returnedCamp.bodies.player.worldHeight/result.campHeroWorldHeight-1)<.08,'Battle-to-menu-to-camp restores camp actor scale');checkFacilityFrames(result.returnedCamp.nativeFrames);
   result.groundUsage=await page.evaluate(()=>window.__campGroundProbe);checkGroundUsage(result.groundUsage,layout);
   await page.screenshot({path:join(output,`live-${config.name}-returned-camp.png`)});
   assert.deepEqual(result.errors,[]);assert.deepEqual(result.remoteRequests,[]);result.pass=true;
  }catch(error){result.failure=error.stack??String(error);throw error;}
  finally{await movement.release();await context.close();await writeFile(join(output,`live-${config.name}.json`),JSON.stringify(result,null,2));}
 }
 async function verifyBuiltSmoke(){
  if(!builtDir)return;
  const metadataPath=join(builtDir,'build-meta.json'),metadataBytes=await readFile(metadataPath),metadata=JSON.parse(metadataBytes);
  assert.equal(metadata.art.inputSignature,runtime.inputSignature,'Actual dist uses the frozen runtime artwork');
  assert.equal(metadata.art.spriteIdCount,Object.keys(runtime.assets).length);assert.equal(metadata.art.environmentCount,Object.keys(runtime.environments).length);
  const outputBefore=Object.fromEntries(await Promise.all(Object.keys(metadata.outputManifest).map(async name=>[name,sha(await readFile(join(builtDir,name)))])));
  assert.deepEqual(outputBefore,metadata.outputManifest,'Actual dist output bytes match its own build manifest');
  const sourceMismatches=[];for(const [path,expected] of Object.entries(metadata.sourceManifest))if(sha(await readFile(path))!==expected)sourceMismatches.push(path);assert.deepEqual(sourceMismatches,[],'Actual dist source manifest matches current production files');
  report.builtSmoke={scope:'Root-built dist/index.html, actual classic offline build, explicit isolated entitlement fixture; production source files are not replaced or rebundled for these cases.',entry:join(builtDir,'index.html'),buildMetadataSha256:sha(metadataBytes),artSignature:metadata.art.inputSignature,outputBefore,sourceMismatches,cases:[]};
  for(const config of [{name:'dist-desktop-1366x768',width:1366,height:768,touch:false},{name:'dist-touch-844x390',width:844,height:390,touch:true}]){
   const result={...config,errors:[],remoteRequests:[],walks:[],pass:false};report.builtSmoke.cases.push(result);
   const context=await browser.newContext({viewport:{width:config.width,height:config.height},hasTouch:config.touch,isMobile:config.touch,deviceScaleFactor:1});await context.setOffline(true);await installGroundProbe(context);
   await context.addInitScript(({key,json})=>{try{localStorage.setItem(key,json);}catch{}},{key:model.CAMP_PROFILE_STORAGE_KEY,json:fixtureProfile});
   const page=await context.newPage(),cdp=await context.newCDPSession(page),movement=mover(page,config.touch,cdp);
   page.on('pageerror',error=>result.errors.push(error.message));page.on('request',request=>{if(/^https?:/i.test(request.url()))result.remoteRequests.push(request.url());});
   try{
    const url=pathToFileURL(join(builtDir,'index.html'));if(config.touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__viral?.diagnostics().art.actorContract.ready,{timeout:60000});await page.bringToFront();await activate(page,config.touch,'[data-action="camp-open"]');
    await page.waitForFunction(()=>!!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');await page.waitForTimeout(200);
    const state=await page.evaluate(()=>window.__viral.snapshot()),layout=model.campLayout(state);result.entry=await screenEvidence(page);checkFacilityFrames(result.entry.nativeFrames);
    const loaded=await page.evaluate(()=>({signature:window.__viral.diagnostics().art.signature,grounds:window.__campGroundProbe}));assert.equal(loaded.signature,runtime.inputSignature);checkGroundUsage(loaded.grounds,layout);result.loaded=loaded;
    await page.screenshot({path:join(output,`${config.name}-camp.png`)});
    const yard=layout.courtyards.find(c=>c.id==='workshop'),station=layout.facilities.find(f=>f.id==='warehouse'),corridor=yard.gate.center.x-55;
    for(const target of [{x:layout.origin.x+100,y:layout.origin.y+100},{x:yard.gate.center.x+55,y:yard.gate.center.y},yard.gate.center,{x:corridor,y:yard.gate.center.y},{x:corridor,y:station.interactionPosition.y},station.interactionPosition])await walk(page,movement,target,result);
    await page.screenshot({path:join(output,`${config.name}-warehouse-approach.png`)});
    if(config.touch)await activate(page,true,'#camp-toolbar [data-action="camp-section"][data-section="warehouse"]');else await page.keyboard.press('e');
    await page.waitForFunction(()=>document.querySelector('.camp-nav [aria-current="page"]')?.getAttribute('data-section')==='warehouse');assert.equal((await read(page)).phase,'paused');
    await page.screenshot({path:join(output,`${config.name}-warehouse-modal.png`)});await activate(page,config.touch,'[data-action="camp-close"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
    result.interaction=await read(page);assert.deepEqual(result.errors,[]);assert.deepEqual(result.remoteRequests,[]);result.pass=true;
    console.log(JSON.stringify({phase:'dist-smoke',name:config.name,file:`${config.name}-camp.png`,grounds:Object.keys(loaded.grounds)}));
   }catch(error){result.failure=error.stack??String(error);throw error;}
   finally{await movement.release();await context.close();await writeFile(join(output,`${config.name}.json`),JSON.stringify(result,null,2));}
  }
  report.builtSmoke.outputAfter=Object.fromEntries(await Promise.all(Object.keys(metadata.outputManifest).map(async name=>[name,sha(await readFile(join(builtDir,name)))])));
  assert.deepEqual(report.builtSmoke.outputAfter,outputBefore,'Actual dist outputs stayed unchanged during smoke');
 }
 if(liveSources.length){report.liveSourceAfter=Object.fromEntries(await Promise.all(liveSources.map(async p=>[p,sha(await readFile(p))])));report.liveSourcesStable=JSON.stringify(report.liveSourceAtBuild)===JSON.stringify(report.liveSourceAfter);if(label==='final')assert.ok(report.liveSourcesStable,'Final acceptance sources stayed unchanged');}
}
