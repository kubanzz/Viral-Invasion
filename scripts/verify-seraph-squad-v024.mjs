import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const option=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const prepareOnly=process.argv.includes('--prepare-only'),root=process.cwd(),output=resolve(option('--out')??'artifacts/seraph-v024/squad-browser');
const selectedWidth=Number(option('--width')??0),selectedMode=option('--mode'),selectedKind=option('--kind');
assert(!selectedWidth||[1366,844,667].includes(selectedWidth));assert(!selectedMode||['standard','low'].includes(selectedMode));
assert(!selectedKind||['field','guard','boss1','boss3'].includes(selectedKind));await mkdir(output,{recursive:true});
const scriptPath=fileURLToPath(import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),posix=value=>value.replaceAll('\\','/');
async function hashFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
let tracked=[];
async function fingerprint(){const files=[];for(const path of [...new Set(tracked)].sort())files.push({path:posix(relative(root,path)),sha256:await hashFile(path)});return{sha256:sha(files.map(file=>file.path+':'+file.sha256).join('\n')),files};}
const source=String.raw`
import { Renderer } from './src/render/phaserRenderer';
import { FixedClock } from './src/game/session';
import { MotionInterpolation } from './src/render/motionInterpolation';
import { Soundscape, SERAPH_SOUND_BUDGET } from './src/audio';
import { SERAPH_VFX_BUDGET } from './src/render/seraphVfx';
import { isLegalPosition, distance } from './src/actors/collision';
import { createSeraphScenario, seraphPilotInput, type SeraphFixtureKind } from './scripts/lib/seraph-v024-fixture';

(async()=>{
 const canvas=document.querySelector('canvas')!,renderer=new Renderer(canvas),sound=new Soundscape();await renderer.ready;
 const query=new URLSearchParams(location.search),kind=(query.get('kind')??'field') as SeraphFixtureKind,low=query.get('mode')==='low';
 const duration=kind==='field'?18:kind==='guard'?8:12;let run:any,session:any,clock:any,motion:MotionInterpolation,raf:number;
 const roles=['commander','lancer','prism'],copy=(p:any)=>({x:p.x,y:p.y});
 const checkpoint=(label:string)=>{if(!run.checkpoints.some((p:any)=>p.label===label))run.checkpoints.push({label,elapsed:session.state.elapsed});};
 function start(){
  const scenario=createSeraphScenario(kind);session=scenario.session;const s=session.state;
  run={kind,low,duration,initial:scenario.initial,startedAt:new Date().toISOString(),startWall:performance.now(),stopped:false,error:null,
   events:[],samples:[],checkpoints:[],frames:[],updateMs:[],renderMs:[],steps:[],lastWall:0,lastSample:-1,interpolatedFrames:0,maximumVisualLag:0,
   formation:null,originalIds:[],maxBodies:0,maxStep:0,illegalSteps:0,energyChanged:false,
   energyAudit:{initial:s.weaponCombat?.ultimateEnergy??0,expected:s.weaponCombat?.ultimateEnergy??0,observed:s.weaponCombat?.ultimateEnergy??0,observations:0,changes:[],violations:[]},beaconIds:[],rolesMoved:{},previous:{},
   bodyRoles:[],bodyIds:[],sourceViolations:[],bodyCountViolations:[],seenMotions:{},vfxMax:{active:0,queued:0,drawn:0,echoBodies:0,echoSamples:0,particleSegments:0,triangles:0,echoTrails:0},vfxKinds:[],audio:{enabled:true,budget:SERAPH_SOUND_BUDGET,scope:'Production Soundscape.update runs on every normal rendered frame. Tone issuance/throttling is covered by the separately reported targeted audio unit tests; no audible-device or runtime oscillator-count claim.'}};
  session.bus.on('event',(event:any)=>{run.events.push(structuredClone(event));renderer.acceptSeraphEvent(event);
   if(event.type==='WEAPON_ENERGY_CHANGED'){const a=run.energyAudit,previous=a.expected;a.expected+=event.data.gained;
    a.changes.push({tick:event.tick,previous,...structuredClone(event.data),expected:a.expected});
    if(!Number.isFinite(event.data.gained)||event.data.gained<=0||a.expected>100||Math.abs(event.data.energy-a.expected)>1e-8)a.violations.push({tick:event.tick,reason:'invalid-authoritative-ledger-entry'});}
   if(event.type==='LEGION_SERAPH_HIT')checkpoint('hit-'+event.data.role);
   if(event.type==='LEGION_SERAPH_ECHO')checkpoint('echo-'+event.data.role);
   if(event.type==='LEGION_SERAPH_FOCUS')checkpoint('q-focus-'+run.events.filter((e:any)=>e.type==='LEGION_SERAPH_FOCUS').length);
  });
  sound.unlock();clock=new FixedClock();clock.reset(performance.now());motion=new MotionInterpolation();renderer.prepareCamera(s,{snap:true});render();
  document.querySelector('#start')!.setAttribute('hidden','');requestAnimationFrame(loop);
 }
 function step(dt:number){
  const s=session.state;motion.step(s,()=>{session.step(seraphPilotInput(s,kind),dt);renderer.witnessSimulation(s);});
  if(s.phase!=='playing')throw Error('Scenario unexpectedly left playing: '+s.phase);
  const cells=(s.growth?.cells??[]).filter((c:any)=>(c.hp??1)>0&&c.until>s.elapsed&&c.legionId==='seraph');
  if(!run.formation&&cells.length){run.formation=cells.map((c:any)=>({id:c.id,role:c.seraphRole,seat:c.seraphSeat,echo:!!c.echo,hp:c.hp,maxHp:c.maxHp,damage:c.damage}));run.originalIds=cells.map((c:any)=>c.id);checkpoint('formation');}
  for(const beacon of s.growth?.beacons??[])if(!run.beaconIds.includes(beacon.id))run.beaconIds.push(beacon.id);
  run.maxBodies=Math.max(run.maxBodies,cells.length);if(s.weaponCombat?.ultimateEnergy!==0)run.energyChanged=true;
  const a=run.energyAudit;a.observations++;a.observed=s.weaponCombat?.ultimateEnergy??0;
  if(Math.abs(a.observed-a.expected)>1e-8)a.violations.push({tick:s.tick,reason:'state-does-not-match-authoritative-ledger',expected:a.expected,observed:a.observed});
  for(const c of cells){if(!isLegalPosition(c,c.radius,s.world))run.illegalSteps++;
   const previous=run.previous[c.id];if(previous){const moved=distance(previous,c);run.maxStep=Math.max(run.maxStep,moved);run.rolesMoved[c.seraphRole]=(run.rolesMoved[c.seraphRole]??0)+moved;}run.previous[c.id]=copy(c);
   if(c.seraphAction){const key=c.seraphRole+':'+c.seraphAction.kind+':'+c.seraphAction.phase;run.seenMotions[key]=(run.seenMotions[key]??0)+1;}
  }
 }
 function render(){
  const s=session.state,shown=motion.present(s,clock.alpha),visualLag=s.elapsed-(shown.visualTime??s.elapsed);
  if(visualLag>1e-7)run.interpolatedFrames++;run.maximumVisualLag=Math.max(run.maximumVisualLag,visualLag);
  renderer.prepareCamera(shown);renderer.render(shown,shown.player,{cameraPrepared:true,lowEffects:low});sound.update(s);
  const d=renderer.diagnostics(shown),v=d.seraphVfx;
  if(v){for(const key of ['active','queued','drawn','echoBodies','echoSamples','particleSegments','triangles','echoTrails'])run.vfxMax[key]=Math.max(run.vfxMax[key],v[key]??0);
   for(const key of Object.keys(v.drawnByKind??{}))if(!run.vfxKinds.includes(key))run.vfxKinds.push(key);
   if(v.active>SERAPH_VFX_BUDGET.active||v.queued>SERAPH_VFX_BUDGET.pending||v.drawn>(low?SERAPH_VFX_BUDGET.lowActive:SERAPH_VFX_BUDGET.active)
    ||v.echoBodies>SERAPH_VFX_BUDGET.echoBodies||v.echoSamples>SERAPH_VFX_BUDGET.echoBodies*SERAPH_VFX_BUDGET.echoSamples
    ||v.particleSegments>(low?0:SERAPH_VFX_BUDGET.active*SERAPH_VFX_BUDGET.particles)||v.triangles>(low?0:2)||v.echoTrails>(low?0:SERAPH_VFX_BUDGET.echoBodies))throw Error('Actual VFX exceeded exported bounded budget');
  }
  if(s.elapsed-run.lastSample<.1)return;run.lastSample=s.elapsed;
  const cells=(s.growth?.cells??[]).filter((c:any)=>c.legionId==='seraph'&&(c.hp??1)>0&&c.until>s.elapsed);
  const ids=new Set(cells.map((c:any)=>c.id)),frames=d.art.actorFrames.filter((f:any)=>ids.has(f.actorId)||[...ids].some(id=>String(f.actorId).startsWith(String(id)+':')));
  if(cells.length&&frames.length!==cells.length)run.bodyCountViolations.push({elapsed:s.elapsed,cells:cells.length,frames:frames.map((f:any)=>({id:f.actorId,semanticId:f.semanticId}))});
  for(const f of frames){
   if(!f.native||f.fallback||!f.registeredArtwork||!f.semanticId?.startsWith('seraph24.'+f.seraphRole+'.')||f.sourceSize?.width!==512||f.sourceSize?.height!==512
     ||Math.abs((f.sourceFoot?.x??0)-256)>.001||Math.abs((f.sourceFoot?.y??0)-435.2)>.001||!f.source?.path||!f.source?.sha256)
     run.sourceViolations.push({elapsed:s.elapsed,frame:f});
   if(!run.bodyRoles.includes(f.seraphRole))run.bodyRoles.push(f.seraphRole);if(!run.bodyIds.includes(f.semanticId))run.bodyIds.push(f.semanticId);
  }
  run.samples.push({elapsed:s.elapsed,visualTime:shown.visualTime??s.elapsed,visualLag,tick:s.tick,phase:s.phase,cells:cells.map((c:any)=>({id:c.id,role:c.seraphRole,seat:c.seraphSeat,echo:!!c.echo,hp:c.hp,x:c.x,y:c.y,action:c.seraphAction?{...c.seraphAction}:null})),
   beacons:structuredClone(s.growth?.beacons),targets:s.targets.map((t:any)=>({id:t.id,hp:t.hp,x:t.x,y:t.y,role:t.role})),frames,vfx:v,bossStage:s.territory?.bossCombat?.heartBoss?.stage??null});
 }
 function finish(error?:unknown){if(run.stopped)return;run.stopped=true;cancelAnimationFrame(raf);run.error=error?String(error):null;
  run.wallSeconds=(performance.now()-run.startWall)/1000;run.simulationSeconds=session.state.elapsed;
  run.final={state:session.snapshot(),diagnostics:renderer.diagnostics(session.state)};
 }
 function loop(now:number){if(run.stopped)return;try{if(run.lastWall)run.frames.push(now-run.lastWall);run.lastWall=now;
  const began=performance.now(),steps=clock.advance(now,step,true),middle=performance.now();if(clock.discontinuity)motion.reset();run.steps.push(steps);run.updateMs.push(middle-began);render();run.renderMs.push(performance.now()-middle);
  if(session.state.elapsed+1e-7>=duration){finish();return;}raf=requestAnimationFrame(loop);
 }catch(error){finish(error);}}
 window.__seraphQA=Object.freeze({ready:true,status:()=>run?{stopped:run.stopped,checkpoints:structuredClone(run.checkpoints)}:null,
  snapshot:()=>session?.snapshot(),diagnostics:()=>session?renderer.diagnostics(session.state):null,result:()=>run?structuredClone(run):null});
 document.querySelector('#start')!.addEventListener('click',start);document.body.dataset.ready='true';
})().catch(error=>{document.body.dataset.bootError=String(error);throw error;});
`;
const report={version:'0.24.0',prepareOnly,acceptanceEligible:!prepareOnly&&!selectedWidth&&!selectedMode&&!selectedKind,
 scope:'Isolated actual GameSession/FixedClock/MotionInterpolation/Renderer fixture. Production motion.step surrounds every normal simulation step, and motion.present(state,clock.alpha) supplies actual lagged visualTime to the renderer; audio reads authoritative state as in main. The complete initial states are disclosed: fed owned seraph slot, normal rank-one unit HP, initial player/tissue HP 10000, no energy grant, static durable source for role timing, separate real-virus guard and live heart-boss initial stages. After setup only normal Q/R InputFrames run: Q at0, R at2s, second Q at12s in field. No live HP/energy/position/phase writes, resurrection or debug endpoints. This is a controlled simulation/render test, not naturally earned progression or trusted touch-controller evidence; a separate final-package camp smoke covers real input.',
 matrix:'6 field cases = 3 sizes x standard/low x18 simulated seconds; guard844 standard8s, boss1 1366 standard12s, boss3 667 low12s. No FPS pass threshold or physical-device claim.',
 performanceThresholdApplied:false,cases:[],failures:[],pass:false,fingerprints:{},harnessSha256:await hashFile(scriptPath)};
const summary=values=>{if(!values.length)return{count:0};const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:sorted[Math.floor((sorted.length-1)*.95)],maxMs:sorted.at(-1)};};
let browser;
try{
 const discovery=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,metafile:true,format:'iife',target:['chrome110'],loader:{'.glb':'dataurl'}});
 report.dependencies=Object.keys(discovery.metafile.inputs).filter(p=>p!=='<stdin>').sort();
 const selection=JSON.parse(await readFile('asserts/art-selection.json','utf8'));
 tracked=[...report.dependencies.map(p=>resolve(p)),...[...selection.sprites,...selection.environments].map(a=>resolve('asserts',a.source)),
  ...['package.json','package-lock.json','tsconfig.json','asserts/art-selection.json','.art-generated/art-runtime.json','scripts/art-sync.mjs','scripts/build-offline.mjs',scriptPath].map(p=>resolve(p))];
 report.fingerprints.before=await fingerprint();
 await writeFile(join(output,'fixture.ts'),source);await writeFile(join(output,'harness.mjs'),await readFile(scriptPath));
 await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,minify:true,format:'iife',target:['chrome110'],loader:{'.glb':'dataurl'},outfile:join(output,'fixture.js')});
 report.bundleSha256=await hashFile(join(output,'fixture.js'));report.fingerprints.afterBundle=await fingerprint();assert.equal(report.fingerprints.before.sha256,report.fingerprints.afterBundle.sha256,'Fixture input closure changed during bundle');
 await writeFile(join(output,'index.html'),'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eff1de}canvas{width:100vw;height:100vh}button{position:fixed;z-index:2;top:12px;left:12px;padding:14px}</style><canvas></canvas><button id="start">受控初始曜卫编队 · 开始Q/R验收</button><script src="fixture.js"></script>');
 if(prepareOnly){report.pass=true;report.preparedOnly=true;}
 else{
  const runtime=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8'));report.roleAssets=[];
  for(const role of ['commander','lancer','prism'])for(const direction of ['front','back'])for(const[action,count]of [['idle',2],['move',4],['attack',4]])for(let i=0;i<count;i++){
   const id=`seraph24.${role}.${direction}.${action}.${String(i).padStart(2,'0')}`,asset=runtime.assets[id],a=asset?.actorRegistration;
   assert(asset?.flags?.includes('seraph-v024-reviewed')&&asset.animation?.approved===true,'Role artwork needs reviewed animation metadata: '+id);
   assert.equal(asset.animation.group,`seraph24.${role}.${direction}.${action}`);assert.equal(asset.animation.index,i);assert.equal(asset.animation.frameCount,count);assert(Number.isFinite(asset.animation.fps)&&asset.animation.fps>0);
   assert.equal(asset.sourceSize?.width,512);assert.equal(asset.sourceSize?.height,512);assert.equal(a?.canvas?.width,512);assert.equal(a?.canvas?.height,512);assert.equal(a?.foot?.x,256);assert(Math.abs(a.foot.y-435.2)<1e-6);
   assert.equal(await hashFile(resolve('asserts',asset.source)),asset.sourceSha256,'Accepted role source bytes changed: '+id);report.roleAssets.push({id,source:asset.source,sha256:asset.sourceSha256});
  }
  const matrix=[];for(const width of [1366,844,667])for(const mode of ['standard','low'])matrix.push({width,mode,kind:'field'});
  matrix.push({width:844,mode:'standard',kind:'guard'},{width:1366,mode:'standard',kind:'boss1'},{width:667,mode:'low',kind:'boss3'});
  browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true,args:['--allow-file-access-from-files']});
  for(const config of matrix.filter(c=>(!selectedWidth||selectedWidth===c.width)&&(!selectedMode||selectedMode===c.mode)&&(!selectedKind||selectedKind===c.kind))){
   const height=config.width===1366?768:config.width===844?390:320,item={...config,height,pass:false,pageErrors:[],remoteRequests:[],screenshots:[]};report.cases.push(item);
   const context=await browser.newContext({viewport:{width:config.width,height},hasTouch:config.width!==1366,isMobile:config.width!==1366,deviceScaleFactor:config.width===1366?1:2,offline:true,recordVideo:{dir:join(output,'video'),size:{width:config.width,height}}});
   const page=await context.newPage(),cdp=await context.newCDPSession(page),videoBegan=Date.now();item.videoTimeline=[];
   page.on('pageerror',error=>item.pageErrors.push(String(error)));page.on('request',request=>{if(/^https?:/.test(request.url()))item.remoteRequests.push(request.url());});
   try{
    const url=pathToFileURL(join(output,'index.html'));url.searchParams.set('kind',config.kind);url.searchParams.set('mode',config.mode);await page.goto(url.href);
    await page.waitForFunction(()=>document.body.dataset.ready==='true'||document.body.dataset.bootError,null,{timeout:90000});assert.equal(await page.evaluate(()=>document.body.dataset.bootError??null),null);await page.locator('#start').click();
    const seen=new Set(),began=Date.now();let result;
    while(true){const status=await page.evaluate(()=>window.__seraphQA.status());assert(status,'Fixture started');
     for(const mark of status.checkpoints){if(seen.has(mark.label))continue;seen.add(mark.label);if(mark.label.startsWith('hit-'))await page.waitForTimeout(60);
      const capturedState=await page.evaluate(()=>window.__seraphQA.snapshot()),file=`${config.width}-${config.mode}-${config.kind}-${mark.label}.png`,frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,file),Buffer.from(frame.data,'base64'));item.screenshots.push(file);item.videoTimeline.push({file,checkpoint:mark,capturedElapsed:capturedState.elapsed,capturedTick:capturedState.tick,videoSeconds:(Date.now()-videoBegan)/1000});}
     if(status.stopped){result=await page.evaluate(()=>window.__seraphQA.result());break;}assert(Date.now()-began<70000,'Scenario wall deadline');await page.waitForTimeout(60);
    }
    const{frames,updateMs,renderMs,steps,...details}=result;item.details=details;item.frameIntervals=summary(frames);item.updateTimes=summary(updateMs);item.renderTimes=summary(renderMs);await writeFile(join(output,`${config.width}-${config.mode}-${config.kind}-timing.json`),JSON.stringify({frames,updateMs,renderMs,steps}));
    assert.equal(result.error,null);assert.deepEqual(item.pageErrors,[]);assert.deepEqual(item.remoteRequests,[]);assert(result.interpolatedFrames>0&&result.maximumVisualLag>1e-4,'Actual production visualTime interpolation must be exercised');assert.equal(result.illegalSteps,0);assert.equal(result.maxBodies,8);assert.equal(result.beaconIds.length,1,'R or second Q cannot create a new deployment/respawn');
    const energyAudit=result.energyAudit;assert.equal(energyAudit.initial,0,'No initial ultimate energy grant');assert(energyAudit.observations>0);assert.deepEqual(energyAudit.violations,[]);assert.equal(energyAudit.expected,energyAudit.observed);assert.equal(energyAudit.observed,result.final.state.weaponCombat.ultimateEnergy);
    assert.equal(result.energyChanged,energyAudit.changes.length>0,'Keep the actual energy-change fact');
    const energyEvents=result.events.filter(e=>e.type==='WEAPON_ENERGY_CHANGED');assert.equal(energyAudit.changes.length,energyEvents.length);
    const creditedIds=new Set();for(const event of energyEvents){const index=result.events.indexOf(event),death=result.events.slice(0,index).findLast(e=>e.tick===event.tick&&e.type==='TARGET_HIT'&&e.data.damage>0&&e.data.remainingHp===0),cleared=result.events[index+1];
     assert(death&&cleared?.type==='TARGET_CLEARED'&&cleared.tick===event.tick&&cleared.data.id===death.data.id&&!cleared.data.suppressRewards,'Energy requires a real positive-to-zero hit and authoritative clear');assert(!creditedIds.has(death.data.id));creditedIds.add(death.data.id);
     const target=result.initial.targets.find(t=>t.id===death.data.id);assert(target,'Energy may only come from disclosed initial targets');const award=['source','nest','core'].includes(target.role)?20:target.role==='elite'?12:(target.generation??0)>0?1:2;assert.equal(event.data.gained,award);}
    item.energyAudit={pass:true,scope:'Initial zero; every fixed-step observed energy exactly equals the authoritative gained ledger; each gain matches a unique positive-to-zero hit and clear of a disclosed target. No live fixture writes or debug calls.',initial:energyAudit.initial,final:energyAudit.observed,observations:energyAudit.observations,changes:energyAudit.changes};
    const counts=result.formation.reduce((a,c)=>(a[c.role]=(a[c.role]??0)+1,a),{});assert.deepEqual(counts,{commander:1,lancer:2,prism:1});assert.deepEqual(result.sourceViolations,[]);assert.deepEqual(result.bodyCountViolations,[]);
    const firstArmySample=result.samples.find(sample=>sample.beacons?.length&&sample.cells.length===4),baseAttackBudget=firstArmySample?.beacons[0]?.damage;
    assert(baseAttackBudget>0);assert(Math.abs(result.formation.reduce((sum,c)=>sum+c.damage,0)/baseAttackBudget-1.8)<1e-7,'Four roles share the declared 1.8x base squad budget');
    const events=result.events,hits=events.filter(e=>e.type==='LEGION_SERAPH_HIT'),releases=events.filter(e=>e.type==='LEGION_SERAPH_RELEASED');
    for(const role of ['commander','lancer','prism']){assert(hits.some(e=>e.data.role===role&&e.data.damage>0),'Each role needs a real accepted hit: '+role);assert(result.bodyRoles.includes(role));assert(result.rolesMoved[role]>10,'Role performs actual movement: '+role);}
    assert.equal(new Set(hits.map(e=>e.data.rootId)).size,hits.length,'Actual hit receipts are unique');
    for(const hit of hits){assert(releases.some(e=>e.tick===hit.tick&&e.data.actionId===hit.data.actionId&&e.data.cellId===hit.data.cellId&&e.data.part===hit.data.part),'Hit must have a same-tick real release');
     assert(events.some(e=>e.type==='TARGET_HIT'&&e.tick===hit.tick&&e.data.rootId===hit.data.rootId&&e.data.id===hit.data.targetId&&e.data.legionId==='seraph'&&Math.abs(e.data.damage-hit.data.damage)<1e-7),'Seraph HIT must match authoritative positive TARGET_HIT');}
    const pursuit=events.filter(e=>e.type==='LEGION_SACRED_PURSUIT');for(let i=0;i<pursuit.length;i++){const e=pursuit[i];assert(hits.some(h=>h.tick===e.tick&&h.data.role==='commander'&&h.data.strong&&h.data.beaconId===e.data.beaconId&&h.data.targetId===e.data.targetId),'Pursuit requires accepted commanded commander melee');if(i)assert(e.tick-pursuit[i-1].tick>=360,'R echoes share the six-second pursuit cooldown');}
    assert(events.some(e=>e.type==='LEGION_SERAPH_ECHO'),'R copies really release attacks');assert(result.final.state.growth.cells.some(c=>c.echo&&c.seraphRole==='prism'));assert.equal(result.final.state.growth.antibodyCharges,1);
    if(config.kind==='field'){assert.equal(events.filter(e=>e.type==='LEGION_SERAPH_FOCUS').length,2);assert(pursuit.length>=2);
     for(const[role,attack]of [['commander','thrust'],['commander','cleave'],['lancer','flank'],['prism','prism']]){
      assert(result.seenMotions[role+':'+attack+':windup']>0&&result.seenMotions[role+':'+attack+':recover']>0,'Missing real windup/recover motion '+role+':'+attack);
      assert(releases.some(event=>event.data.role===role&&event.data.attack===attack),'Missing accepted release '+role+':'+attack);
     }
     const groups=new Map();for(const e of releases.filter(e=>e.data.role==='prism')){const group=groups.get(e.data.actionId)??[];group.push(e);groups.set(e.data.actionId,group);}const complete=[...groups.values()].filter(g=>new Set(g.map(e=>e.data.part)).size===3);assert(complete.length);for(const group of complete){group.sort((a,b)=>a.data.part-b.data.part);assert(group[1].tick-group[0].tick>=4&&group[2].tick-group[1].tick>=4,'Prism volley rays retain distinct release timing');}
    }else if(config.kind==='guard'){assert(result.final.state.growth.beacons[0].guard);assert.equal(pursuit.length,0,'Uncommanded guard does not invent sacred pursuit');}
    else{assert.equal(result.final.state.territory.bossCombat.heartBoss.stage,config.kind==='boss1'?1:3);assert(hits.some(e=>e.data.targetId==='seraph-qa-core'));assert(result.final.state.targets.find(t=>t.id==='seraph-qa-core').hp<result.initial.targets[0].hp);}
    for(const kind of ['windup','release','hit','echo'])assert(result.vfxKinds.includes(kind),'Actual effect kind drawn: '+kind);if(config.kind!=='guard')assert(result.vfxKinds.includes('focus'));
    item.pass=true;
   }catch(error){item.error=String(error.stack??error);report.failures.push(item.error);item.failure=await page.evaluate(()=>window.__seraphQA?.result()).catch(()=>null);}
   finally{const video=page.video();await context.close();if(video)item.video=await video.path();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
   console.log(JSON.stringify({...config,pass:item.pass,error:item.error?.split('\n')[0]}));if(!item.pass)break;
  }
  report.pass=report.cases.length>0&&report.cases.every(c=>c.pass)&&report.failures.length===0;
 }
}catch(error){report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
 await browser?.close();const after=await fingerprint();report.fingerprints.after={sha256:after.sha256,unchanged:after.sha256===report.fingerprints.before?.sha256};if(!report.fingerprints.after.unchanged){report.pass=false;report.failures.push('Actual source/art closure changed');}
 report.bundleUnchanged=report.bundleSha256===await hashFile(join(output,'fixture.js'));if(!report.bundleUnchanged)report.pass=false;report.completedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({pass:report.pass,prepareOnly,acceptanceEligible:report.acceptanceEligible,cases:report.cases.length,output}));if(!report.pass)process.exitCode=1;
