
import art from './.art-generated/art-runtime.json';
import { GameSession } from './src/game/session';
import { Renderer } from './src/render/renderer';
import { MotherCoreController } from './src/game/motherCore';
import { enemyAttackPlan } from './src/game/enemyTactics';
import { createTerritoryState } from './src/game/territory';
import { summonImmuneCells, IMMUNE_CELL_BALANCE } from './src/game/immuneCells';
import { growthContext } from './src/game/growth';
import { COMPACT_COMBAT_MINIMUM_SCALE } from './src/render/camera';
const encode=JSON.stringify;
const tickAt=time=>Math.floor(time*60+1e-7);
const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}};
const sourceSession=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});sourceSession.start();
const source=JSON.parse(encode(sourceSession.snapshot())),sourceJson=encode(source);freeze(source);
const legacySession=new GameSession(71,{campaign:true,milestone:'G3'});legacySession.start();
const legacySource=JSON.parse(encode(legacySession.snapshot())),legacySourceJson=encode(legacySource);freeze(legacySource);
let renderer,serial=0,currentSpec,currentStates=[],removedAssets=[];
const originalAssetKeys=Object.keys(art.assets).sort().join('|');
function restoreAssets(){for(const[id,asset]of removedAssets)art.assets[id]=asset;removedAssets=[];return Object.keys(art.assets).sort().join('|')===originalAssetKeys;}
const views=[['front_right',Math.PI/4],['back_right',-Math.PI/4],['front_left',3*Math.PI/4],['back_left',-3*Math.PI/4]];
const actions=[['idle',1],['walk',1],['fire',.6],['walk-fire',1],['dash',.16],['charge',1.3],['release',.35],['scan',.6],['heal',.6],['hurt',.15]];
const cases=[];
for(const scene of ['heart','lung'])for(const owner of ['healthy','infected'])for(const low of [false,true])for(const [direction,angle]of views)
  cases.push({id:scene+'-'+owner+'-'+(low?'low':'standard')+'-'+direction,scene,owner,low,direction,angle,kind:'sequence',
    motherTraits:direction==='back_right'?['CARAPACE','MIMIC']:direction==='front_left'?['FISSION','MIMIC']:['CARAPACE','FISSION']});
for(const low of [false,true])cases.push({id:'training-'+(low?'low':'standard'),scene:'training',owner:'healthy',low,direction:'front_right',angle:Math.PI/4,kind:'sequence'});
cases.push({id:'menu',scene:'menu',owner:'healthy',low:false,direction:'front_right',angle:Math.PI/4,kind:'menu'});
for(const scene of ['heart','lung'])for(const owner of ['healthy','infected'])for(const low of [false,true])for(const compact of [false,true])
  cases.push({id:'dense48-'+scene+'-'+owner+'-'+(low?'low':'standard')+'-'+(compact?'compact':'desktop'),scene,owner,low,compact,direction:'front_right',angle:Math.PI/4,kind:'dense'});
for(const low of [false,true])for(let directionIndex=0;directionIndex<8;directionIndex++)for(const ruleVariant of ['carapace-protected','carapace-exposed','thinRay-locked-plan'])
 cases.push({id:'rule-'+ruleVariant+'-'+directionIndex+'-'+(low?'low':'standard'),scene:'heart',owner:'healthy',low,direction:'rule-'+directionIndex,
  directionIndex,angle:directionIndex*Math.PI/4,ruleVariant,kind:'rule-direction'});
cases.push({id:'forced-missing-actor-art',scene:'heart',owner:'infected',low:false,direction:'front_right',angle:Math.PI/4,kind:'fallback'});
function actor(id,x,y,changes={}){return{id,x,y,kind:'single',role:'virus',radius:25,hp:100,maxHp:100,hitUntil:0,scanned:true,traits:[],born:1,facing:0,...changes};}
function base(spec){
 const state=structuredClone(spec.scene==='lung'?legacySource:source);state.phase=spec.kind==='menu'?'menu':'playing';state.tick=600;state.elapsed=10;state.visualTime=10;
 state.world={width:1200,height:800,bounds:{left:65,right:1135,top:110,bottom:735},obstacles:[],foreground:{x:3000,y:3000,width:10,height:10}};
 Object.assign(state.player,{x:600,y:660,hp:95,facing:spec.angle,moving:false,dashUntil:0,hurtUntil:0,actionUntil:0});
 state.effects=[];state.events=[];state.targets=[];state.scanUntil=0;state.result=null;state.chargedSlash=undefined;state.playerProjectiles=[];
 state.tissue={x:400,y:640,radius:40,hp:60,maxHp:100};state.terminal={x:1000,y:700};state.tool=1;
 state.battle.organId=spec.scene==='lung'?'lung':'heart';state.battle.graph.nodes=[];state.battle.graph.edges=[];
 state.battle.lastAim={x:600+Math.cos(spec.angle)*300,y:660+Math.sin(spec.angle)*300};
 if(spec.scene==='lung'){
  delete state.territory;state.campaign.activeOrganId='lung';state.campaign.arenas.lung.activated=true;state.campaign.core.combat=undefined;
  state.battle.graph.nodes=[{id:'probe:lung-ground-owner',kind:'tissue',x:state.tissue.x,y:state.tissue.y,active:true,infected:spec.owner==='infected'}];
 }else{state.territory=createTerritoryState();for(const node of state.territory.nodes){node.owner=spec.owner;node.infectionProgress=spec.owner==='infected'?100:0;}state.campaign=undefined;}
 state.growth.runId='derived-actor-'+(++serial);state.growth.cells=[];state.growth.beacon=null;state.growth.beacons=[];state.growth.marks=[];state.growth.draft=null;state.growth.pendingResearch=null;
 if(spec.scene==='training'){delete state.battle;delete state.growth;delete state.endless;delete state.endlessGrowth;delete state.territory;}
 return state;
}
function lineup(state,spec){
 state.targets=[actor('probe:basic',180,300),actor('probe:thin-ray',350,300,{tactic:'thin-ray'}),actor('probe:carapace',520,300,{role:'elite',traits:['CARAPACE'],tactic:'crystal-charge'}),
 actor('probe:fission-parent',690,300,{traits:['FISSION'],generation:0,tactic:'fission-burst'}),actor('probe:fission-child',860,300,{traits:['FISSION'],generation:1,radius:17}),
 actor('probe:mimic',1030,300,{traits:['MIMIC'],tactic:'mimic-corrosion'}),actor('probe:invader',180,485,{territoryTask:{kind:'invade',nodeId:'heart-healing-1'}}),
 actor('probe:source',360,485,{role:'source',radius:34}),actor('probe:mother',965,565,{role:'core',radius:52,hp:680,maxHp:680,traits:spec.motherTraits??['CARAPACE','MIMIC']})];
 for(const target of state.targets)target.facing=spec.angle;
 const mother=state.targets.find(target=>target.role==='core');
 const combat=new MotherCoreController({coreId:mother.id,organId:state.battle.organId,traits:mother.traits,tick:state.tick,elapsed:state.elapsed}).state;
 if(state.territory){state.territory.bossCombat=combat;state.territory.bossId=mother.id;}
 else Object.assign(state.campaign.core,{status:'active',organId:state.battle.organId,actorId:mother.id,traits:mother.traits,combat});
 const beacon={id:'probe:beacon',organId:state.battle.organId,x:680,y:510,born:1,until:1000,radius:190,damage:30,interval:.8,nextAttackAt:100,tuning:'balanced',mode:'protocol'};
 state.growth.beacon=beacon;state.growth.beacons=[beacon];state.growth.cells=summonImmuneCells(beacon,growthContext(state),1);
 Object.assign(state.growth.cells[0],{x:680,y:510,born:1,facing:spec.angle,activity:'guarding',attackUntil:0});
}
function states(spec){
 const initial=base(spec);if(spec.kind==='menu')return[{state:initial,action:'menu',sample:0}];
 if(spec.kind==='rule-direction'){
  const theta=spec.angle,thin=spec.ruleVariant==='thinRay-locked-plan',exposed=spec.ruleVariant==='carapace-exposed';
  const target=actor('probe:rule-direction',650,420,{radius:32,facing:theta,traits:thin?[]:['CARAPACE'],tactic:thin?'thin-ray':'melee',
    exposedUntil:exposed?initial.elapsed+2:0,recoverUntil:!thin&&!exposed&&spec.directionIndex%2?initial.elapsed+1:0});
  initial.targets=[target];initial.player.x=thin?target.x+Math.cos(theta)*240:250;initial.player.y=thin?target.y+Math.sin(theta)*240:650;
  initial.player.facing=Math.atan2(target.y-initial.player.y,target.x-initial.player.x);initial.battle.lastAim={x:target.x,y:target.y};
  if(thin){target.facing=theta+Math.PI;target.attackPlan=enemyAttackPlan(target,initial);if(!target.attackPlan)throw Error('A real thin-ray plan was rejected in the supplied inspection world');
   target.attackAt=initial.elapsed+.6;target.attackWindup=target.attackPlan.windup;target.attackAim={...target.attackPlan.aim};target.attackTarget='player';
   target.x+=17;target.y+=11;}
  const halfAngle=Math.acos(.2),project=angle=>Math.atan2(Math.sin(angle)*.72,Math.cos(angle));
  const planAngle=thin?Math.atan2(target.attackPlan.aim.y-target.attackPlan.origin.y,target.attackPlan.aim.x-target.attackPlan.origin.x):theta;
  const ruleExpectation=thin?{kind:'thin-ray-plan',actorId:target.id,worldAngle:planAngle,requestedAngle:theta,projectedAngle:project(planAngle),
    planOrigin:target.attackPlan.origin,planAim:target.attackPlan.aim,planRange:target.attackPlan.range,planRadius:target.attackPlan.radius,worldBounds:initial.world.bounds,
    deliberatelyOppositeBodyFacing:target.facing,displacedCurrentBody:{x:target.x,y:target.y}}
   :{kind:'carapace-sector',actorId:target.id,worldAngle:theta,projectedAngle:project(theta),halfAngle,exposed,protected:!exposed,
    projectedBoundaryAngles:[project(theta-halfAngle),project(theta+halfAngle)],recoveryWithoutExposure:target.recoverUntil>initial.elapsed&&!exposed,
    ruleSamples:[0,halfAngle-1e-4,halfAngle+1e-4,Math.PI].map(delta=>({delta,protected:!exposed&&Math.cos(delta)>.2}))};
  return [false,true].map((labelsOff,sample)=>({state:structuredClone(initial),action:spec.ruleVariant,sample,labelsOff,ruleExpectation}));
 }
 if(spec.scene!=='training')lineup(initial,spec);
 if(spec.kind==='dense'){
  initial.targets=Array.from({length:48},(_,i)=>actor('probe:dense:'+i,190+(i%8)*115,200+Math.floor(i/8)*65,{traits:i%4===1?['CARAPACE']:i%4===2?['FISSION']:i%4===3?['MIMIC']:[],generation:i%8===6?1:0,facing:spec.angle}));
  if(initial.territory)initial.territory.bossCombat=undefined;if(initial.campaign)initial.campaign.core.combat=undefined;initial.growth.cells=[];initial.growth.beacon=null;initial.growth.beacons=[];
  return Array.from({length:12},(_,sample)=>{const state=structuredClone(initial);state.visualTime=10+sample/12;state.tick=tickAt(state.visualTime);state.elapsed=state.tick/60;return{state,action:'dense48',sample};});
 }
 const frames=[];let start=10;
 for(const [action,duration]of actions){
  start=Math.ceil(start*60-1e-7)/60;
  const count=action==='dash'||action==='hurt'?8:12;
  for(let sample=0;sample<count;sample++){
   const state=structuredClone(initial),age=duration*sample/count;state.visualTime=start+age;state.tick=tickAt(state.visualTime);state.elapsed=state.tick/60;
   state.player.moving=action==='walk'||action==='walk-fire';state.player.facing=spec.angle;
   if(state.player.moving){state.player.x+=Math.cos(spec.angle)*age*60;state.player.y+=Math.sin(spec.angle)*age*60;}
   if(action==='dash'){state.player.dashUntil=start+.16;state.player.x+=Math.cos(spec.angle)*age*160;state.player.y+=Math.sin(spec.angle)*age*160;}
   const aim={x:state.player.x+Math.cos(spec.angle)*300,y:state.player.y+Math.sin(spec.angle)*300};if(state.battle)state.battle.lastAim=aim;
   if(action==='fire'||action==='walk-fire'||action==='heal'){
    const tool=action==='heal'?3:1;state.tool=tool;state.player.actionUntil=state.elapsed+.1;
    state.events.push({type:'TOOL_FIRED',tick:Math.floor((state.elapsed-age% .18)*60),data:{tool,x:aim.x,y:aim.y,hit:false}});
    state.effects.push({id:1,kind:tool===3?'heal':'beam',from:{x:state.player.x,y:state.player.y},to:tool===3?state.tissue:aim,radius:tool===3?40:0,born:state.elapsed-.02,duration:.2});
   }
   if(action==='charge'){state.chargedSlash={startedAt:start-.25,aim};}
   if(action==='release'){state.events.push({type:'PLAYER_CHARGE_RELEASED',tick:tickAt(start),data:{progress:1}});state.effects.push({id:2,kind:'slash',from:state.player,to:aim,radius:90,born:start,duration:.35,angle:spec.angle});}
   if(action==='scan'){state.scanUntil=state.elapsed+1;state.effects.push({id:3,kind:'scan',from:state.player,to:state.player,radius:300,born:start,duration:.7});}
   if(action==='hurt'){state.player.hurtUntil=start+.55;state.events.push({type:'PLAYER_HURT',tick:tickAt(start),data:{damage:5,reason:'derived-inspection'}});}
   if(state.battle){
    const enemyAction=action==='walk'?'windup':action==='fire'?'attack':action==='scan'?'hurt':action==='heal'?'defeat'
      :action==='dash'||action==='release'?'recovery':'move';
    for(const target of state.targets){if(target.role==='source'||target.role==='core')continue;
     if(enemyAction==='move')target.x+=sample*2;
     if(enemyAction==='windup'||enemyAction==='attack'){target.attackAim={...state.player};target.attackTarget='player';target.attackPlan=enemyAttackPlan(target,state);
      target.attackWindup=target.attackPlan?.windup??1;target.attackAt=state.elapsed+(enemyAction==='windup'?target.attackWindup*(1-sample/count):0);}
     if(enemyAction==='hurt')target.hitUntil=state.elapsed+.1;
     if(enemyAction==='recovery')target.recoverUntil=state.elapsed+1;
     if(enemyAction==='defeat'){target.hp=0;target.deadAt=start;}
    }
    const combat=state.territory?.bossCombat??state.campaign.core.combat,mother=state.targets.find(target=>target.role==='core');
    combat.phase=action==='idle'?'awakening':action==='walk'?'windup':action==='heal'?'defeated':'recovery';combat.phaseStartedAt=start;combat.facing=spec.angle;
    combat.exposedUntil=action==='charge'||action==='scan'?start+duration+1:0;combat.membrane.remaining=combat.exposedUntil?0:2;
    if(action==='heal'){mother.hp=0;mother.deadAt=start;combat.cleared=true;combat.clearedAt=start;}
    const cell=state.growth.cells[0];cell.attackUntil=action==='scan'?state.elapsed+IMMUNE_CELL_BALANCE.attackPose*(1-sample/count):0;
    cell.activity=cell.attackUntil?'biting':'seeking';if(!cell.attackUntil)cell.x+=sample*2;
    frames.push({state,action,sample,enemyAction});
   }else frames.push({state,action,sample});
  }
  start+=duration+.2;
 }
 return frames;
}
async function prepare(id){
 currentSpec=cases.find(item=>item.id===id);if(!currentSpec)throw Error('Unknown case '+id);
 renderer?.destroy();await next();if(!restoreAssets())throw Error('Derived runtime assets were not restored');
 if(currentSpec.kind==='fallback')for(const id of Object.keys(art.assets))if(/^(fantasy\.actor\.|hero\.|enemy\.|mother\.|immune\.|weapon\.)/.test(id)){removedAssets.push([id,art.assets[id]]);delete art.assets[id];}
 const canvas=document.createElement('canvas');canvas.id='probe';document.querySelector('#probe').replaceWith(canvas);
 renderer=new Renderer(canvas);await renderer.ready;await document.fonts.ready;currentStates=states(currentSpec);
 return{spec:currentSpec,count:currentStates.length,sourceJson,sourceSha256:await digest(sourceJson),legacySourceJson,legacySourceSha256:await digest(legacySourceJson),artSignature:art.inputSignature};
}
async function render(index){
 const {state,...details}=currentStates[index],before=encode(state),beforeHash=await digest(before);
 // Missing availability is fixed before Renderer construction, not hidden by a
 // controller that has already cached a complete group. destroy() restores it.
  const compact=currentSpec.compact===true||renderer.camera.width<=1024||renderer.camera.height<=600,minimumScale=compact&&state.phase!=='menu'?COMPACT_COMBAT_MINIMUM_SCALE:undefined;
  const labels=renderer.painter.labels,drawLabels=labels.draw;if(details.labelsOff)labels.draw=()=>{};
  try{freeze(state);renderer.prepareCamera(state,{snap:true,...(minimumScale?{minimumScale}:{})});renderer.render(state,state.battle?.lastAim??{x:state.player.x+200,y:state.player.y},{lowEffects:currentSpec.low,cameraPrepared:true});await next();await next();}
  finally{labels.draw=drawLabels;}
  const after=encode(state),diagnostics=renderer.diagnostics(state);if(before!==after||sourceJson!==encode(source)||legacySourceJson!==encode(legacySource))throw Error('Renderer mutated supplied/source state');
  return{...details,index,tick:state.tick,elapsed:state.elapsed,phase:state.phase,expectedDirection:currentSpec.direction,player:{...state.player},
   cameraProjection:{origin:renderer.camera.worldToScreen({x:0,y:0}),unitX:renderer.camera.worldToScreen({x:1,y:0}),unitY:renderer.camera.worldToScreen({x:0,y:1})},
   camera:{actualScale:renderer.camera.scale,minimumScale:minimumScale??null,canvasCSS:{width:renderer.camera.width,height:renderer.camera.height},view:'Explicitly supplied 1200x800 inspection overview, not production arena framing'},
   expectedActorIds:state.phase==='menu'?['menu:hero','menu:tool']:['player',...state.targets.filter(t=>t.hp>0||t.role==='core'||t.deadAt!==undefined&&state.elapsed-t.deadAt<.3).map(t=>t.id),...(state.growth?.cells??[]).map(c=>c.id)],
   logicalTargets:state.targets.map(t=>({id:t.id,role:t.role,x:t.x,y:t.y,hp:t.hp,facing:t.facing,traits:t.traits,tactic:t.tactic,generation:t.generation,attackAt:t.attackAt,attackPlanned:!!t.attackPlan,attackPlan:t.attackPlan??null,hitUntil:t.hitUntil,deadAt:t.deadAt,recoverUntil:t.recoverUntil,exposedUntil:t.exposedUntil})),
   labelControl:details.labelsOff?'DERIVED probe temporarily suppresses only SceneLabels.draw; body, geometric cues and danger paths still render':'Normal actual Renderer label drawing',
   beforeSha256:beforeHash,afterSha256:await digest(after),completeStateUnchanged:before===after,sourceUnchanged:sourceJson===encode(source)&&legacySourceJson===encode(legacySource),
   forcedMissingAssetIds:removedAssets.map(([id])=>id),diagnostics};
}
window.__actorProbe={cases:()=>cases,prepare,render,states:()=>encode(currentStates),destroy:()=>{renderer?.destroy();return{assetsRestored:restoreAssets()};}};
