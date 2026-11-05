
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
