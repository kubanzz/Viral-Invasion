import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';

// Initial population is explicitly supplied once. Every subsequent game-state
// change belongs to GameSession.step; input arrives through real DOM events.
const output=resolve(process.env.VI_PERF48_OUTPUT??'artifacts/expedition-v015/performance-48');
const candidate=resolve(process.env.VI_PERF48_CANDIDATE??'artifacts/expedition-v015/candidate-1');
await mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const metadata=JSON.parse(await readFile(join(candidate,'build-meta.json'),'utf8'));
const report={method:'Supplied initial 48-actor arena, followed by production GameSession.step, FixedClock, MotionInterpolation, Controller/TouchControls and native Phaser Renderer on its real frame loop. Not natural gameplay; not the complete v0.15 candidate game.js entry or complete HUD; not phone hardware.',
  setup:'1 ritual mother + 3 ritual priests + 1 slime mage + 1 builder + 1 static nest + 4 fastlings + 37 ordinary = 48. No FISSION. Real ritual charges/homing projectiles cap2; finite support/hatching queues absent. Supplied built base pod. Wave2 with one future ordinary at3600s. Player starts normal100HP; no shooting/dash/garrison/refill/replacement or state edits after initialization.',
  measurement:'Four sequential 15-second wall-time groups in one Chrome context; real keyboard on desktop and trusted CDP touch through production TouchControls at touch resolution. Each rendered frame and each fixed simulation step must retain exactly 48 live/reserved actors, playing phase and wave 2. Per-frame production diagnostics add observer overhead. No recording or forced GC during sampling.',
  startedAt:new Date().toISOString(),candidate,version:metadata.version,groups:[],errors:[]};
const source=String.raw`
import {GameSession} from './src/game/session';
import {FixedClock} from './src/core/clock';
import {Renderer} from './src/render/phaserRenderer';
import {MotionInterpolation} from './src/render/motionInterpolation';
import {Controller} from './src/input/controller';
import {TouchControls} from './src/input/touchControls';
import {activeWorld} from './src/game/types';
import {isLegalPosition,distance} from './src/actors/collision';
import {EnemyNavigator} from './src/actors/enemyNavigation';
import {combatPopulation} from './src/game/combatPopulation';
import {SMART_VIRUS_BALANCE as S} from './src/game/smartViruses';
import {RITUAL_BALANCE as R} from './src/game/ritual';
import {initializeConstruction} from './src/game/construction';
const params=new URLSearchParams(location.search),touch=params.get('touch')==='1',low=params.get('low')==='1';
const game=new GameSession(140048,{mode:'endless',territory:true});game.start();
const s=game.state,world=activeWorld(s),used=[];
function legalNear(wanted,radius){
 for(let ring=0;ring<30;ring++)for(let i=0;i<(ring?32:1);i++){
  const a=i*Math.PI/16,p={x:wanted.x+Math.cos(a)*ring*12,y:wanted.y+Math.sin(a)*ring*12};
  if(isLegalPosition(p,radius,world)&&distance(p,s.tissue)>radius+s.tissue.radius+12&&used.every(b=>distance(p,b)>radius+b.radius+7)){used.push({...p,radius});return p;}
 }throw Error('No legal initial position for '+JSON.stringify(wanted));
}
Object.assign(s.player,legalNear({x:1580,y:780},s.player.radius));
const actor=(id,profession,wanted,radius=22)=>{
 const at=legalNear(wanted,radius),hp=profession==='ritual-mother'?R.motherHp:profession==='ritual-priest'?R.priestHp:profession==='slime-caster'?S.casterHp:profession==='nest-builder'?S.builderHp:profession==='brood-nest'?S.nestHp:profession==='fastling'?S.fastlingHp:68;
 return {...at,id:'perf48:'+id,kind:'single',role:profession==='brood-nest'?'nest':'virus',...(profession?{profession}:{}),radius,hp,maxHp:hp,hitUntil:0,scanned:false,traits:[],generation:profession==='fastling'?1:0,born:0,facing:0,tactic:'melee',attackReady:1.5,sourceId:'endless:wave:2',waveId:2,blocksWaveClear:true};
};
s.targets=[actor('mother','ritual-mother',{x:1200,y:660},32),
 ...Array.from({length:3},(_,i)=>actor('priest:'+i,'ritual-priest',{x:1200+Math.cos(i*Math.PI*2/3)*180,y:660+Math.sin(i*Math.PI*2/3)*180})),
 actor('mage:0','slime-caster',{x:1250,y:900}),actor('builder:0','nest-builder',{x:1050,y:490}),
 actor('nest:0','brood-nest',{x:1000,y:1040},28),
 ...Array.from({length:4},(_,i)=>actor('fastling:'+i,'fastling',{x:1320+i*48,y:980},12)),
 ...Array.from({length:37},(_,i)=>actor('basic:'+i,undefined,{x:800+i%8*66,y:470+Math.floor(i/8)*74}))];
const e=s.endless;
Object.assign(e,{wave:2,clearedWaves:1,phase:'combat',phaseStartedAt:0,phaseUntil:0,remainingToSpawn:1,totalToSpawn:49,canceledToSpawn:0,pendingChildren:0,
 spawnedIds:s.targets.map(t=>t.id),creditedKillIds:[],kills:0,score:0,traits:[],eliteWave:false,eliteRemaining:0,supportRemaining:0,source:undefined,
 batchSchedule:[{at:3600,sector:0,spread:0,roles:['ordinary']}],batchIndex:0,batchMemberIndex:0,batchSerial:0,nextSpawnAt:3600,
 territoryTasks:{wave:2,reservedSlots:[],squads:[]},smartSupport:{wave:2,reservedSlots:[],plans:[]},evolution:{history:[],recentPrimaries:[]},reward:undefined});
const priests=s.targets.filter(t=>t.profession==='ritual-priest');
s.smartViruses={serial:0,slime:[],ritual:{serial:0,projectiles:[],encounters:[{id:'perf48:ritual',wave:2,motherId:s.targets[0].id,priestIds:priests.map(t=>t.id),born:0,nextCastAt:Object.fromEntries(priests.map((t,i)=>[t.id,i+1])),nextGroupFireAt:1,shieldBroken:false}]}};
initializeConstruction(s,['launch-pod']);s.territory.construction.building={id:'perf48:built-pod',blueprintId:'launch-pod',x:1070,y:720,nodeId:'core',builtAt:0};
s.growth.cells=[];s.growth.beacons=[];s.growth.beacon=null;
if(s.targets.length!==48||combatPopulation(s).reserved!==48||s.player.hp!==100)throw Error('Invalid supplied arena');
if(s.targets.some(t=>!isLegalPosition(t,t.radius,world)))throw Error('Illegal initial actor');
const initial=structuredClone(s);
// No writes to game state below this line except production GameSession.step.
const canvas=document.querySelector('canvas'),renderer=new Renderer(canvas),clock=new FixedClock(),motion=new MotionInterpolation();
const input=new Controller(canvas,()=>{},()=>{},()=>game.state.phase==='playing',()=>game.state),pilotNavigator=new EnemyNavigator();
const root=document.querySelector('#mobile-controls');root.hidden=!touch;
const touchControls=new TouchControls({root,canvas,input,getState:()=>game.state,screenToWorld:p=>renderer.camera.screenToWorld(p),canAccept:()=>game.state.phase==='playing',enabled:()=>touch});
const samples=[],steps=[],violations=[];let begun=false,done=false,start,last,discontinuities=0;
const counts=()=>({alive:game.state.targets.filter(t=>t.hp>0&&t.role!=='event').length,...combatPopulation(game.state),phase:game.state.phase,wave:game.state.endless.wave,hp:game.state.player.hp,tissue:game.state.tissue.hp});
const check=(c,where)=>{if(c.alive!==48||c.reserved!==48||c.phase!=='playing'||c.wave!==2)violations.push({where,tick:game.state.tick,...c});};
function frame(now){
 if(!begun||done)return;const cpuStart=performance.now();start??=now;
 clock.advance(now,dt=>{const st=game.state,command=input.frame(input.getAim(st,p=>renderer.camera.screenToWorld(p)));
  motion.step(st,()=>game.step(command,dt));renderer.witnessSimulation(game.state);
  const c=counts();steps.push({tick:game.state.tick,elapsed:game.state.elapsed,moveX:command.moveX,moveY:command.moveY,fire:command.fire,...c});check(c,'step');});
 if(clock.discontinuity){discontinuities++;motion.reset();}
 const shown=motion.present(game.state,clock.alpha);renderer.prepareCamera(shown,{snap:last===undefined,deltaSeconds:last===undefined?0:(now-last)/1000});
 renderer.render(shown,input.getAim(shown,p=>renderer.camera.screenToWorld(p)),{lowEffects:low,cameraPrepared:true});
 const d=renderer.diagnostics(shown),c=counts(),native=d.phaser.nativeSprites,ids=new Set(game.state.targets.filter(t=>t.hp>0).map(t=>t.id));check(c,'frame');
 const byProfession={};for(const t of game.state.targets){const key=t.profession??'basic';byProfession[key]??={alive:0,native:0,visible:0};if(t.hp>0)byProfession[key].alive++;const n=native.find(n=>n.id===t.id);if(n)byProfession[key].native++;if(n?.visible)byProfession[key].visible++;}
 samples.push({now,wallSeconds:(now-start)/1000,frameMs:last===undefined?null:now-last,cpuMs:performance.now()-cpuStart,elapsed:game.state.elapsed,tick:game.state.tick,...c,
  ritualProjectiles:game.state.smartViruses?.ritual?.projectiles.length??0,ritualPhases:(game.state.smartViruses?.ritual?.projectiles??[]).map(o=>o.phase),slime:game.state.smartViruses?.slime.length??0,slimePhases:(game.state.smartViruses?.slime??[]).map(c=>c.phase),nativeTotal:native.length,
  nativeEnemies:native.filter(n=>ids.has(n.id)).length,visibleNativeEnemies:native.filter(n=>ids.has(n.id)&&n.visible).length,
  nativePlayers:native.filter(n=>n.id==='player'&&n.visible).length,byProfession});
 last=now;if(now-start>=15000||violations.length){done=true;window.perf48.done=true;}
}
window.perf48={ready:false,done:false,begin:()=>{if(begun)throw Error('Already begun');begun=true;clock.reset();return true;},
 status:(goal)=>({done,elapsed:game.state.elapsed,phase:game.state.phase,player:{...game.state.player},targets:game.state.targets.filter(t=>t.hp>0).map(t=>({id:t.id,x:t.x,y:t.y,radius:t.radius})),world:activeWorld(game.state),orbs:(game.state.smartViruses?.ritual?.projectiles??[]).map(o=>({id:o.id,x:o.x,y:o.y,radius:o.radius,phase:o.phase})),counts:counts(),routeGoal:goal?pilotNavigator.waypoint({...game.state.player,id:'input-only-pilot'},goal,activeWorld(game.state),game.state.elapsed):undefined}),
 result:()=>({initial,final:game.snapshot(),samples,steps,violations,discontinuities,diagnostics:renderer.diagnostics(game.state),touch,low})};
renderer.ready.then(()=>{renderer.resize();renderer.prepareCamera(s,{snap:true});renderer.render(s,s.player,{lowEffects:low,cameraPrepared:true});renderer.startFrameLoop(frame);window.perf48.ready=true;});
`;
const compiled=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',target:'es2022',metafile:true,define:{'process.env.NODE_ENV':'"production"'}});
const inputs=Object.keys(compiled.metafile.inputs).filter(name=>name!=='<stdin>').sort();
const hashInputs=async()=>Object.fromEntries(await Promise.all(inputs.map(async name=>[name,sha(await readFile(name))])));
report.sourceBefore=await hashInputs();report.sourceComparison=inputs.map(name=>({path:name,actual:report.sourceBefore[name],candidate:metadata.sourceManifest[name],matches:metadata.sourceManifest[name]===report.sourceBefore[name]}));
assert(report.sourceComparison.every(item=>item.matches),'Harness production module input does not match frozen v0.15 source manifest');
report.releaseOutputs={};for(const[name,expected]of Object.entries(metadata.outputManifest)){const actual=sha(await readFile(join(candidate,name)));assert.equal(actual,expected);report.releaseOutputs[name]=actual;}
report.harnessSourceSha256=sha(source);report.measurementScriptSha256=sha(await readFile(new URL(import.meta.url)));
await writeFile(join(output,'measurement-script.mjs'),await readFile(new URL(import.meta.url)));
await writeFile(join(output,'fixture-source.ts'),source);
const htmlFile=join(output,'fixture.html');
await writeFile(htmlFile,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#e7c9b9}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;top:6px;left:8px;background:#234441cf;color:#fff4dc;padding:5px;font:11px sans-serif;pointer-events:none}#mobile-controls{position:fixed;left:15px;bottom:15px;touch-action:none}.mobile-stick{position:relative;width:96px;height:96px;background:#315b5499;border:1px solid #d7e8cf;border-radius:50%;touch-action:none}.stick-knob{position:absolute;width:34px;height:34px;left:31px;top:31px;border-radius:50%;background:#ddf0dd}</style><canvas></canvas><div id="label">SUPPLIED INITIAL 48 ARENA · production simulation / Renderer · incomplete HUD</div><div id="mobile-controls"><div class="mobile-stick" data-stick="move"><span class="stick-knob"></span></div></div><script>${compiled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
const save=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
await save();
if(process.env.VI_PERF48_PREPARE_ONLY==='1'){console.log(JSON.stringify({prepared:true,script:'scripts/measure-expedition-48.mjs',output,matchedProductionInputs:inputs.length}));process.exit(0);}

function summary(values){const sorted=values.slice().sort((a,b)=>a-b),sum=values.reduce((a,b)=>a+b,0);return {frames:values.length,durationMs:sum,averageFps:values.length*1000/sum,p95Ms:sorted[Math.floor((sorted.length-1)*.95)],maxMs:sorted.at(-1)};}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// An input-only pilot: evaluate read-only actor/world snapshots, then send real
// keyboard events or an owned trusted finger. It never sends combat actions.
function direction(state,waypoints,pilot){
 const p=state.player;while(Math.hypot(p.x-waypoints[pilot.index].x,p.y-waypoints[pilot.index].y)<100)pilot.index=(pilot.index+1)%waypoints.length;
 const goal=state.routeGoal??waypoints[pilot.index],w=state.world,legal=(q,r)=>q.x>=w.bounds.left+r&&q.x<=w.bounds.right-r&&q.y>=w.bounds.top+r&&q.y<=w.bounds.bottom-r&&w.obstacles.every(o=>Math.hypot(q.x-o.x,q.y-o.y)>=r+o.radius+.05);
 const threats=[...state.targets,...(state.orbs??[])].filter(t=>!t.id.includes(':nest:')).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,6);
 const nearest=q=>Math.min(500,...threats.map(t=>Math.hypot(t.x-q.x,t.y-q.y)-t.radius));let best,score=-Infinity;
 for(let i=0;i<8;i++){const a=i*Math.PI/4,d={x:Math.cos(a),y:Math.sin(a)},q={x:p.x+d.x*55,y:p.y+d.y*55};
  if(![.25,.5,.75,1].every(f=>legal({x:p.x+d.x*55*f,y:p.y+d.y*55*f},p.radius)))continue;
  const gain=Math.hypot(goal.x-p.x,goal.y-p.y)-Math.hypot(goal.x-q.x,goal.y-q.y),s=gain+.15*(nearest(q)-nearest(p));
  if(s>score){score=s;best=d;}
 }return best??{x:0,y:0};
}
let browser,context,page;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,hasTouch:true,offline:true});
 page=await context.newPage();
 report.device={platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),browser:browser.version(),mode:'headless',deviceScaleFactor:1,contextHasTouch:true};
 const selected=process.env.VI_PERF48_GROUPS?.split(',');report.expectedGroups=selected?.length??4;
 for(const touch of [false,true])for(const low of [false,true]){
  const viewport=touch?{width:844,height:390}:{width:1366,height:768};
  const item={id:`${touch?'touch-resolution':'desktop'}-${low?'low':'standard'}`,touch,low,viewport,errors:[],remoteRequests:[],inputs:[]};report.groups.push(item);
  if(selected&&!selected.includes(item.id)){report.groups.pop();continue;}
  const error=e=>item.errors.push(e.message),request=r=>{if(/^https?:/.test(r.url()))item.remoteRequests.push(r.url());};page.on('pageerror',error);page.on('request',request);
  let cdp,held=new Set(),finger;
  try{
   await page.setViewportSize(viewport);const url=pathToFileURL(htmlFile);url.searchParams.set('touch',touch?'1':'0');url.searchParams.set('low',low?'1':'0');
   await page.goto(url.href);await page.waitForFunction(()=>window.perf48?.ready,{timeout:60000});
   if(touch){cdp=await context.newCDPSession(page);const b=await page.locator('[data-stick="move"]').boundingBox();finger={x:b.x+b.width/2,y:b.y+b.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:21,...finger,radiusX:5,radiusY:5,force:1}]});}
   else{await page.keyboard.down('KeyS');held.add('KeyS');}
   await page.evaluate(()=>window.perf48.begin());
   const wallStart=Date.now(),pilot={index:0},waypoints=[{x:1800,y:350},{x:920,y:300},{x:560,y:850},{x:1000,y:1210},{x:1810,y:1180},{x:1860,y:760}];item.waypoints=waypoints;
   while(true){
    const status=await page.evaluate(goal=>window.perf48.status(goal),waypoints[pilot.index]);if(status.done)break;if(Date.now()-wallStart>25000)throw Error('Fixture measurement exceeded wall budget');
    const d=direction(status,waypoints,pilot);item.inputs.push({elapsed:status.elapsed,position:{x:status.player.x,y:status.player.y},direction:d,waypoint:pilot.index});
    if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:21,x:finger.x+d.x*44,y:finger.y+d.y*44,radiusX:5,radiusY:5,force:1}]});
    else{const next=new Set([...(d.x>.3?['KeyD']:d.x<-.3?['KeyA']:[]),...(d.y>.3?['KeyS']:d.y<-.3?['KeyW']:[])]);for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
    await delay(110);
   }
   if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else for(const key of held)await page.keyboard.up(key);held.clear();
   const result=await page.evaluate(()=>window.perf48.result());await writeFile(join(output,`${item.id}-frames.json`),JSON.stringify(result));
   const times=result.samples.flatMap(s=>s.frameMs===null?[]:[s.frameMs]);item.metrics=summary(times);
   item.elapsed=result.final.elapsed;item.wallSeconds=result.samples.at(-1)?.wallSeconds;item.initialHp=result.initial.player.hp;item.finalHp=result.final.player.hp;item.finalPhase=result.final.phase;item.discontinuities=result.discontinuities;
   item.minimumAlive=Math.min(...result.samples.map(s=>s.alive));item.maximumAlive=Math.max(...result.samples.map(s=>s.alive));item.minimumReserved=Math.min(...result.samples.map(s=>s.reserved));item.maximumReserved=Math.max(...result.samples.map(s=>s.reserved));
   item.maximumRitualProjectiles=Math.max(...result.samples.map(s=>s.ritualProjectiles));item.ritualPhases=[...new Set(result.samples.flatMap(s=>s.ritualPhases))];item.minimumVisibleNativeEnemies=Math.min(...result.samples.map(s=>s.visibleNativeEnemies));item.minimumNativeEnemies=Math.min(...result.samples.map(s=>s.nativeEnemies));item.maximumVisibleNativeEnemies=Math.max(...result.samples.map(s=>s.visibleNativeEnemies));item.maximumSlime=Math.max(...result.samples.map(s=>s.slime));
   item.slimePhases=[...new Set(result.samples.flatMap(s=>s.slimePhases))];item.steps=result.steps.length;item.violations=result.violations;
   item.inputScope=touch?'Trusted CDP touch through production TouchControls; minimal movement-stick DOM, not complete mobile HUD.':'Trusted keyboard events through production Controller; not full desktop HUD.';
   item.validDensity=result.samples.length>0&&item.wallSeconds>=15&&result.violations.length===0&&result.samples.every(s=>s.alive===48&&s.reserved===48&&s.phase==='playing'&&s.wave===2)&&result.steps.every(s=>s.alive===48&&s.reserved===48&&s.phase==='playing'&&s.wave===2&&!s.fire);
   item.pass=item.validDensity&&item.maximumRitualProjectiles>0&&item.ritualPhases.includes('flight')&&item.initialHp===100&&item.finalPhase==='playing'&&item.metrics.averageFps>=50&&item.metrics.p95Ms<=33.3&&!item.errors.length&&!item.remoteRequests.length;
   await page.screenshot({path:join(output,`${item.id}-final.png`)});
  }catch(error){item.errors.push(error.stack??String(error));item.pass=false;try{await page.screenshot({path:join(output,`${item.id}-failed.png`)});}catch{}}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await cdp.detach();}for(const k of held)await page.keyboard.up(k).catch(()=>{});page.off('pageerror',error);page.off('request',request);}
  await save();console.log(JSON.stringify({id:item.id,pass:item.pass,validDensity:item.validDensity,metrics:item.metrics,alive:[item.minimumAlive,item.maximumAlive],reserved:[item.minimumReserved,item.maximumReserved],hp:item.finalHp,slime:item.maximumSlime,errors:item.errors}));
 }
}catch(error){report.errors.push(error.stack??String(error));}
finally{
 if(context)await context.close();if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.sourceAfter=await hashInputs();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
 report.pass=report.groups.length===report.expectedGroups&&report.groups.every(g=>g.pass)&&!report.errors.length&&report.sourceUnchanged;report.browsersClosed=true;await save();
}
console.log(JSON.stringify({pass:report.pass,output,groups:report.groups.map(g=>({id:g.id,pass:g.pass,validDensity:g.validDensity,metrics:g.metrics}))}));if(!report.pass)process.exitCode=1;
