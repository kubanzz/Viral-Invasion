import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// This harness never compiles or rewrites a production entry. The only storage
// seed is a validated owned-blade profile installed before its first navigation.
const option=name=>process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
const entry=option('--url')??process.env.VI_BLADE_SURGE_ENTRY??'http://127.0.0.1:57120/';
const output=resolve(option('--out')??'artifacts/blade-surge-v022/browser');await mkdir(output,{recursive:true});
const modes=(option('--modes')??'standard,low').split(',');assert(modes.every(mode=>['standard','low'].includes(mode)));
const naturalBattle=option('--natural-battle')!=='false';
const reuseTrialPath=option('--reuse-trial-report'), suppliedNaturalPath=option('--natural-report');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const helper=await build({stdin:{contents:"export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {emptyProfile,PROFILE_STORAGE_KEY} from './src/meta/profile';export {campLayout} from './src/game/campLayout';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const model=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture=model.emptyCampProfile();Object.assign(fixture,{campUnlocked:true,campIntroSeen:true,legacyMigrationChecked:true,prologue:'ready',
  builtFacilities:['warehouse','forge','shop','summon','departure'],unlockedLegendaryWeapons:['redblade'],equipped:'redblade'});
fixture.weapons.redblade={repaired:'gold',pending:null,upgrade:0};fixture.inventory.push({id:'qa:blade-surge-v022',templateId:'redblade',kind:'weapon',rarity:'gold',repaired:true});
assert(model.parseCampProfile(fixture),'Legal initial owned-blade fixture');
const sources=['src/main.ts','src/game/bladeTechniques.ts','src/game/weaponSkillsTypes.ts','src/game/campWeaponTrial.ts','src/ui/campWeaponTrial.ts','src/ui/sanctum.css','src/render/weaponUltimateVisuals.ts','src/render/player3DMotion.ts','src/render/player3D.ts','src/audio.ts'];
const fingerprints=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(path))])));
const report={scope:'Validated initial owned-gold-blade profile and an initial general-profile effects preference (standard or low); all subsequent actions use production keyboard, mouse and CDP touchscreen input. The isolated range uses its visible fill button. The natural-battle supplement earns charge through actual melee kills. __viral and canvas datasets are read-only. No live HP, energy, actors, time, position or damage injection. Headless browser touch emulation is not a physical-phone playtest.',
  entry,startedAt:new Date().toISOString(),fixture,phaseContract:'drawing 3s -> commit -> windup .65s closed eyes/open eyes unsheathe -> execution -> FINISHED-driven independent .30s full-body FinishSettle even after wave cleanup',
  sourceBefore:await fingerprints(),harnessSha256:hash(await readFile(new URL(import.meta.url))),cases:[],errors:[],pass:false};
await writeFile(join(output,'harness.mjs'),await readFile(new URL(import.meta.url)));
if(new URL(entry).protocol==='file:'){
  const folder=dirname(fileURLToPath(entry));report.packageBefore=Object.fromEntries(await Promise.all(['index.html','game.js','build-meta.json'].map(async name=>[join(folder,name),hash(await readFile(join(folder,name)))])));
}
if(reuseTrialPath){
  assert(report.packageBefore,'Trial evidence reuse requires an immutable file candidate');
  const bytes=await readFile(resolve(reuseTrialPath)),prior=JSON.parse(bytes);
  assert.equal(prior.entry,entry);assert(prior.cases.length>0&&prior.cases.every(item=>item.pass),'Every reused trial case must have passed');
  assert.deepEqual(prior.packageBefore,report.packageBefore,'Reused trial evidence must describe these exact package bytes');
  await writeFile(join(output,'reused-trial-evidence.json'),bytes);
  report.cases=prior.cases;report.reusedTrialEvidence={path:resolve(reuseTrialPath),sha256:hash(bytes),harnessSha256:prior.harnessSha256,
    note:'Previously completed real-input cases are reused only after exact frozen-package hash equality. Their original report is copied alongside this aggregate.'};
}
const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,accept,label,timeout=10000){const began=Date.now();let value;while(Date.now()-began<timeout){value=await read();if(accept(value))return value;await pause(12);}throw Error(label+': '+JSON.stringify(value).slice(0,1200));}
const browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true});

async function run(width,height,touch,mode){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,recordVideo:{dir:join(output,'video'),size:{width,height}}});
  const preferences=model.emptyProfile();preferences.settings.lowEffects=mode==='low';
  await context.addInitScript(({key,fixture,preferenceKey,preferences})=>{if(!sessionStorage.getItem('blade-surge-initial')){localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem(preferenceKey,JSON.stringify(preferences));sessionStorage.setItem('blade-surge-initial','once');}},{key:model.CAMP_PROFILE_STORAGE_KEY,fixture,preferenceKey:model.PROFILE_STORAGE_KEY,preferences});
  const videoBegan=Date.now(),page=await context.newPage(),cdp=await context.newCDPSession(page),touches=new Map(),keys=new Set(),seenEvents=new Set();
  const item={width,height,touch,mode,pass:false,screenshots:[],samples:[],events:[],pageErrors:[],actions:[],sequences:[],videoTimeline:[]};report.cases.push(item);
  page.on('pageerror',error=>item.pageErrors.push(String(error)));
  const read=()=>page.evaluate(()=>window.__viral.snapshot()),trial=()=>page.evaluate(()=>window.__viral.diagnostics().campTrial);
  const retain=value=>{if(!value)return;for(const event of value.events??[]){const key=JSON.stringify(event);if(!seenEvents.has(key)){seenEvents.add(key);item.events.push(event);}}};
  const cinematic=()=>page.evaluate(()=>{
    const diag=window.__viral.diagnostics(),canvas=document.getElementById('camp-trial-canvas');let dataset;
    try{dataset=canvas?.dataset.cinematic?JSON.parse(canvas.dataset.cinematic):null;}catch{}
    return diag.bladeCinematic??dataset??null;
  });
  const capture=async name=>{const file=`${width}-${mode}-${name}.png`,frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,file),Buffer.from(frame.data,'base64'));item.screenshots.push(file);item.videoTimeline.push({name,file,videoSeconds:(Date.now()-videoBegan)/1000});return file;};
  const click=async selector=>{item.actions.push(selector);for(let attempt=0;;attempt++)try{const node=page.locator(selector).filter({visible:true}).first();await node.scrollIntoViewIfNeeded();if(touch)await node.tap();else await node.click();await page.waitForTimeout(35);return;}catch(error){if(attempt>=3||!/not attached|detached/.test(String(error)))throw error;await page.waitForTimeout(70);}};
  const touchAt=async(type,id,p)=>{if(type==='touchCancel')touches.clear();else if(type==='touchEnd')touches.delete(id);else touches.set(id,{id,...p,radiusX:3,radiusY:3,force:1});await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
  const release=async()=>{if(touches.size)await touchAt('touchCancel',0);for(const key of keys)await page.keyboard.up(key);keys.clear();await page.mouse.up().catch(()=>{});};
  const waitTrial=async(accept,label,timeout)=>until(async()=>{const value=await trial();retain(value);return value;},accept,label,timeout);
  const projection=()=>page.locator('#camp-trial-canvas').evaluate(canvas=>{const rect=canvas.getBoundingClientRect(),p=JSON.parse(canvas.dataset.trialProjection);return{...p,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},pixelWidth:canvas.width,pixelHeight:canvas.height};});
  const screen=point=>page.locator('#camp-trial-canvas').evaluate((canvas,point)=>{const rect=canvas.getBoundingClientRect(),p=JSON.parse(canvas.dataset.trialProjection);return{x:rect.x+canvas.clientLeft+(p.offsetX+point.x*p.scale)*(rect.width-canvas.clientLeft*2)/p.width,y:rect.y+canvas.clientTop+(p.offsetY+point.y*p.scale)*(rect.height-canvas.clientTop*2)/p.height};},point);
  const boundsAudit=async()=>page.evaluate(()=>{
    const canvas=document.getElementById('camp-trial-canvas'),panel=canvas?.closest('.camp-panel'),close=panel?.querySelector('.camp-close'),back=panel?.querySelector('[data-action="camp-trial-return"]');
    const rect=node=>{const r=node?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null;};
    return{canvas:rect(canvas),close:rect(close),back:rect(back),width:innerWidth,height:innerHeight};
  });
  const activate=async()=>{
    await click('[data-action="camp-trial-reset"]');await click('[data-action="camp-trial-layout"][data-layout="melee"]');await click('[data-action="camp-trial-fill"]');
    const before=await trial();await click('[data-action="camp-trial-ultimate"]');
    const start=await waitTrial(value=>value?.bladeTrace?.phase==='drawing','Drawing begins immediately');
    assert.equal(start.bladeTrace.marks.length,4);assert(start.bladeTrace.deadline-start.elapsed>2.65,'Windup cannot consume the three-second drawing budget');
    if(start.bladeTrace.startedAt!==undefined)assert(Math.abs(start.bladeTrace.deadline-start.bladeTrace.startedAt-3)<1e-6,'Exactly three simulated seconds are reserved for drawing');
    const active=await cinematic();assert(!active||!active.active,'No screen cutin intercepts drawing');return{before,start};
  };
  const observeRelease=async(manual,label,start)=>{
    const sequence={label,manual,frames:[],phases:[]};item.sequences.push(sequence);
    const windup=await waitTrial(value=>value?.bladeTrace?.phase==='windup','Committed cutin windup');sequence.phases.push({phase:'windup',elapsed:windup.elapsed});
    assert.equal(windup.bladeTrace.manual,manual);
    if(label!=='draw-detail'){
    const closed=await until(async()=>({cinematic:await cinematic(),view:await trial()}),value=>value.cinematic?.active&&Number(value.cinematic.eyeOpen)<.2&&(value.cinematic.elapsed??0)>=.12,'Closed-eye screen closeup',1500);
    retain(closed.view);sequence.closed=closed.cinematic;sequence.frames.push({stage:'closed',elapsed:closed.view.elapsed,file:await capture(`${label}-closed-eye`)});
    if(closed.cinematic.rect){const r=closed.cinematic.rect,left=r.left??r.x,top=r.top??r.y,right=r.right??left+r.width,bottom=r.bottom??top+r.height;
      assert(Number.isFinite(left)&&Number.isFinite(top)&&left>=0&&right<=width&&top>=0&&bottom<=height,'Screen closeup stays within the safe viewport');}
    const open=await until(async()=>({cinematic:await cinematic(),view:await trial()}),value=>value.cinematic?.active&&Number(value.cinematic.eyeOpen)>.8&&(value.cinematic.elapsed??0)>=.42,'Open-eye unsheathe closeup',1500);
    retain(open.view);sequence.open=open.cinematic;sequence.frames.push({stage:'open',elapsed:open.view.elapsed,file:await capture(`${label}-open-unsheathe`)});
    if(open.cinematic.lowEffects!==undefined)assert.equal(open.cinematic.lowEffects,mode==='low','Actual cinematic receives the chosen effects level');
    }else{
    const draw=await until(async()=>({cinematic:await cinematic(),view:await trial()}),value=>value.cinematic?.active&&Number(value.cinematic.draw)>.7&&(value.cinematic.elapsed??0)>=.55,'Fully drawn blade closeup',700);
    retain(draw.view);sequence.draw=draw.cinematic;sequence.frames.push({stage:'unsheathed',elapsed:draw.view.elapsed,file:await capture(`${label}-blade-drawn`)});
    assert.equal(draw.cinematic.lowEffects,mode==='low','Actual draw closeup receives the chosen effects level');
    }
    const executing=await waitTrial(value=>value?.bladeTrace?.phase==='executing','World piercing released',1800);sequence.phases.push({phase:'executing',elapsed:executing.elapsed});
    if(executing.bladeTrace.executionStartedAt!==undefined&&windup.bladeTrace.windupStartedAt!==undefined)
      assert(Math.abs(executing.bladeTrace.executionStartedAt-windup.bladeTrace.windupStartedAt-.65)<.04,'Windup occupies its own .65s after commit');
    sequence.frames.push({stage:'execution',elapsed:executing.elapsed,file:await capture(`${label}-world-pierce`)});
    const recovery=await waitTrial(value=>value?.bladeTrace?.phase==='recovery','Landing explosion and sheathing',3000);sequence.phases.push({phase:'recovery',elapsed:recovery.elapsed});
    sequence.frames.push({stage:'landing',elapsed:recovery.elapsed,file:await capture(`${label}-landing-sheathe`)});
    const final=await waitTrial(value=>!value?.bladeTrace,'Recovery completes',2500);await until(cinematic,value=>!value?.active,'Closeup is cleaned after recovery');
    sequence.final={elapsed:final.elapsed,damage:final.totalDamage,shots:final.shots};assert(final.totalDamage>start.before.totalDamage);
    assert.equal(final.shots,start.before.shots,'The tracing gesture never becomes a primary attack');
    assert(item.events.some(event=>event.type==='BLADE_TRACE_FINISHED'&&!!event.data.manual===manual));
    assert(item.events.some(event=>event.type==='BLADE_TRACE_IMPACT'),'Each release reaches a real landing-impact receipt');
    const camera=await projection();assert(!camera.expanded,'Original trial camera returns after sheathing');
    await capture(`${label}-complete`);return sequence;
  };
  try{
    const url=new URL(entry);url.searchParams.set('seed','220071');if(touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'load'});await page.bringToFront();
    await until(()=>page.evaluate(()=>window.__viral?.version),Boolean,'Production runtime loaded',60000);
    await click('[data-action="camp-open"]');await until(read,value=>!!value.camp,'Camp entered');const origin=model.campLayout(await read()).origin;
    for(const relative of [{x:0,y:100},{x:-205,y:100},{x:-205,y:-20},{x:-386,y:-20}]){
      const point={x:origin.x+relative.x,y:origin.y+relative.y},began=Date.now();
      while(true){const state=await read(),dx=point.x-state.player.x,dy=point.y-state.player.y,gap=Math.hypot(dx,dy);if(gap<10)break;assert(Date.now()-began<18000,'Real camp walking deadline');
        for(const key of [...(dx< -7?['a']:dx>7?['d']:[]),...(dy< -7?['w']:dy>7?['s']:[])]){await page.keyboard.down(key);keys.add(key);}await page.waitForTimeout(35);for(const key of keys)await page.keyboard.up(key);keys.clear();}
    }
    await page.keyboard.press('e');await until(()=>page.locator('#camp-title').textContent().catch(()=>''),value=>value==='装备仓库','Warehouse opened');
    await click('[data-action="camp-trial"][data-weapon="redblade"]');await waitTrial(value=>value?.loadout.weaponId==='redblade','Blade trial ready');
    const ownedBefore=await page.evaluate(()=>window.__viral.campProfile().data);
    const initial=await activate();await capture('manual-four-points');const canvas=page.locator('#camp-trial-canvas'),node=await canvas.elementHandle(),camera=await projection();
    assert(camera.rect.width>=width-40&&camera.rect.height>=height*.5,'Expanded drawing surface');assert(Math.abs(camera.pixelWidth-camera.width*camera.dpr)<2,'DPR backing is actual pixel size');
    item.bounds=await boundsAudit();for(const rect of [item.bounds.close,item.bounds.back])assert(rect&&rect.left>=0&&rect.right<=width&&rect.top>=0&&rect.bottom<=height,'Cancel entries remain reachable');
    const marks=initial.start.bladeTrace.marks;let point=await screen(marks[0]);if(touch)await touchAt('touchStart',7,point);else{await page.mouse.move(point.x,point.y);await page.mouse.down();}
    point=await screen(marks[1]);if(touch)await touchAt('touchMove',7,point);else await page.mouse.move(point.x,point.y,{steps:3});await capture('manual-partial-route');
    assert.deepEqual(await projection(),camera,'No geometry jump while drawing');assert(await node.evaluate(element=>element===document.getElementById('camp-trial-canvas')),'No DOM rebuild during gesture');
    for(const mark of marks.slice(2)){point=await screen(mark);if(touch)await touchAt('touchMove',7,point);else await page.mouse.move(point.x,point.y,{steps:2});}
    if(touch)await touchAt('touchEnd',7);else await page.mouse.up();await observeRelease(true,'manual',initial);
    const timed=await activate();point=await screen(timed.start.bladeTrace.marks[0]);if(touch){await touchAt('touchStart',7,point);await touchAt('touchCancel',7);}else{await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.up();}
    const focus=()=>page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),wall:performance.now(),trial:window.__viral.diagnostics().campTrial?.elapsed}));
    // Playwright otherwise forces every page visible/focused, even minimized.
    // Remove only that harness override, then observe a real browser focus change.
    const info=await cdp.send('Browser.getWindowForTarget');await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
    await cdp.send('Browser.setWindowBounds',{windowId:info.windowId,bounds:{windowState:'minimized'}});
    await until(focus,value=>!value.focused||value.visibility!=='visible','Real browser blur observed before measuring pause',1000);
    item.pause={method:'Real window minimized with Playwright forced-focus emulation disabled',before:await focus()};await page.waitForTimeout(550);item.pause.after=await focus();
    item.pause.delta=item.pause.after.trial-item.pause.before.trial;
    console.log(JSON.stringify({width,mode,focusPause:item.pause}));
    await cdp.send('Browser.setWindowBounds',{windowId:info.windowId,bounds:{windowState:'normal'}});await page.bringToFront();await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    assert(Math.abs(item.pause.delta)<.15,'Backgrounding freezes the drawing clock');
    const sequence=await observeRelease(false,'timeout',timed);assert(sequence.phases[0].elapsed-timed.start.elapsed>=2.6,'Automatic commit preserves the drawing interval');
    // A separate normal cast dedicates its .55s window to the long-blade image;
    // serial closed/open screenshots must never turn capture latency into a false failure.
    const detailed=await activate();let drawing=false;for(const mark of detailed.start.bladeTrace.marks){const p=await screen(mark);if(touch){await touchAt(drawing?'touchMove':'touchStart',7,p);}else{await page.mouse.move(p.x,p.y);if(!drawing)await page.mouse.down();}drawing=true;}
    if(touch)await touchAt('touchEnd',7);else await page.mouse.up();await observeRelease(true,'draw-detail',detailed);
    const cancel=await activate();await page.keyboard.press('Escape');await page.waitForTimeout(50);
    if(await page.locator('[data-action="camp-trial-return"]').isVisible().catch(()=>false))await click('[data-action="camp-trial-return"]');
    await until(()=>page.locator('#camp-trial-canvas').count(),value=>value===0,'Leaving the trial cleans its camera and cinematic');await until(cinematic,value=>!value?.active,'No lingering cinematic after leaving');
    assert.deepEqual(await page.evaluate(()=>window.__viral.campProfile().data),ownedBefore,'Practicing cannot alter permanent equipment or economy');
    item.cancelPhase=cancel.start.bladeTrace.phase;await capture('leave-clean');assert.deepEqual(item.pageErrors,[]);item.pass=true;
  }catch(error){item.error=String(error.stack??error);item.failure={state:await read().catch(()=>null),trial:await trial().catch(()=>null),cinematic:await cinematic().catch(()=>null)};report.errors.push(item.error);await capture('failure').catch(()=>{});}
  finally{await release().catch(()=>{});const video=page.video();await context.close();if(video)item.video=await video.path();await persist();}
  console.log(JSON.stringify({width,height,mode,pass:item.pass,error:item.error?.split('\n')[0]}));
}
try{
  if(!reuseTrialPath)for(const [width,height,touch]of [[1366,768,false],[844,390,true],[667,320,true]])if(!option('--width')||Number(option('--width'))===width)for(const mode of modes)await run(width,height,touch,mode);
  await browser.close();
  if(suppliedNaturalPath){
    assert(report.packageBefore,'Natural evidence reuse requires an immutable file candidate');
    const bytes=await readFile(resolve(suppliedNaturalPath)),natural=JSON.parse(bytes);
    assert(natural.pass&&natural.cases.length>0&&natural.cases.every(item=>item.pass),'Supplied natural-charge gameplay must have passed');
    for(const item of natural.cases){const castId=item.cast?.castId,events=item.events??[],impacts=events.filter(event=>event.type==='BLADE_TRACE_IMPACT'&&event.data.castId===castId);
      assert.equal(new Set(impacts.map(event=>event.data.mark)).size,4,'Reused natural evidence must reach all four landing marks');
      assert(events.some(event=>event.type==='BLADE_TRACE_FINISHED'&&event.data.castId===castId&&event.data.manual===true),'Reused natural evidence must include a manual finish receipt');
      const settle=item.surgeSequence?.finishSettleProbe,active=settle?.samples?.filter(sample=>sample.clip==='Blade_FinishSettle_v022')??[];
      assert(natural.verifyFinishSettle&&settle?.receipt&&settle.cleared&&typeof settle.earlyCleanupObserved==='boolean'&&active.length,'Reused natural evidence must include rendered FinishSettle and its cleanup observation');
      const earlyCleanup=settle.samples.filter(sample=>sample.tracePhase===null&&sample.elapsed<Number(settle.receipt.data.until)-1e-6);
      if(settle.earlyCleanupObserved)assert(earlyCleanup.length&&earlyCleanup.every(sample=>sample.clip==='Blade_FinishSettle_v022'),'Reused early cleanup must preserve the authored action');
      assert(active.at(-1).poseTime-active[0].poseTime>=.20,'Reused natural evidence must cover the actual full-body recovery action');}
    assert.equal(natural.candidate.entry,entry);assert.deepEqual(natural.candidate.frozenFilesBefore,report.packageBefore,'Natural battle must use the exact same package bytes');
    assert.deepEqual(natural.candidate.frozenFilesAfter,natural.candidate.frozenFilesBefore);
    report.naturalBattle={report:resolve(suppliedNaturalPath),sha256:hash(bytes),code:0,pass:true,cases:natural.cases.map(item=>({width:item.width,result:item.result,video:item.video,screenshots:item.screenshots}))};
  }else if(naturalBattle&&report.cases.every(item=>item.pass)){
    const args=['scripts/verify-blade-battle-v020.mjs',`--url=${entry}`,`--out=${join(output,'natural-battle')}`,'--width=844','--surge-v022=true','--finish-settle=true'];
    const result=await new Promise(done=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const deadline=setTimeout(()=>child.kill(),240000);
      child.stdout.on('data',chunk=>{stdout+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('exit',code=>{clearTimeout(deadline);done({code,stdout,stderr});});});
    report.naturalBattle={...result,scope:'Existing actual-touch battle harness; full meter earned by natural kills, movement while tracing and no accidental primary verified.'};
    if(result.code!==0&&new URL(entry).protocol==='file:'){
      const child=JSON.parse(await readFile(join(output,'natural-battle','report.json'),'utf8'));
      const onlySourceDrift=child.cases.length===1&&child.cases.every(item=>item.pass)&&child.errors.length>0
        &&child.errors.every(error=>error.includes('supplied Vite candidate changed during input verification'));
      report.naturalBattle.frozenFileSourceDriftOnly=onlySourceDrift;
      // The enclosing package hash check remains mandatory after this supplement.
      // Unrelated workspace UI edits cannot invalidate observed frozen-file input.
      assert(onlySourceDrift,'Natural-charge battle gameplay must pass even when workspace files move');
    }else assert.equal(result.code,0,'Natural-charge battle supplement passed');
  }
  report.sourceAfter=await fingerprints();report.sourceStable=JSON.stringify(report.sourceAfter)===JSON.stringify(report.sourceBefore);
  if(new URL(entry).protocol!=='file:')assert.deepEqual(report.sourceAfter,report.sourceBefore,'Live HTTP source changed during verification');
  if(report.packageBefore){report.packageAfter=Object.fromEntries(await Promise.all(Object.keys(report.packageBefore).map(async path=>[path,hash(await readFile(path))])));assert.deepEqual(report.packageAfter,report.packageBefore,'Frozen offline package changed');}
  report.pass=report.cases.length>0&&report.cases.every(item=>item.pass)&&report.errors.length===0;
}catch(error){report.errors.push(String(error.stack??error));}
finally{await browser.close();report.completedAt=new Date().toISOString();await persist();}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,naturalBattle:report.naturalBattle?.code,output}));if(!report.pass)process.exitCode=1;
