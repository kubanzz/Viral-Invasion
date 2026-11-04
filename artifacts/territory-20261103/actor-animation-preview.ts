import { GameSession } from '../../src/game/session';
import { activeWorld, type GameState, type Target } from '../../src/game/types';
import { MotherCoreController } from '../../src/game/motherCore';
import { Renderer } from '../../src/render/renderer';
import runtime from '../../.art-generated/art-runtime.json';

const params=new URL(location.href).searchParams;
const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();
const baseline=structuredClone(game.state),world=activeWorld(baseline);
baseline.phase=params.has('menu')?'menu':'playing';baseline.elapsed=3;baseline.visualTime=0;baseline.tick=180;baseline.events=[];baseline.effects=[];
baseline.targets=[];baseline.growth!.cells=[];baseline.growth!.beacon=undefined;
let row={x:1200,y:800};
outer:for(let y=700;y<=1050;y+=70)for(let x=1050;x<=1450;x+=80){
  if([-160,0].every(dx=>x+dx>world.bounds.left+60&&x+dx<world.bounds.right-60&&world.obstacles.every(o=>Math.hypot(o.x-x-dx,o.y-y)>o.radius+90))){row={x,y};break outer;}}
baseline.player.x=row.x-160;baseline.player.y=row.y;baseline.player.facing=.5;baseline.player.moving=false;
const freeze=(value:unknown)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}};
freeze(baseline);const baselineJson=JSON.stringify(baseline);
const normal=params.has('normal');
const renderer=new Renderer(document.querySelector<HTMLCanvasElement>('#game')!,normal?{}:{actorPreview:true,actorAnimationPreview:true});await renderer.ready;
const assets=runtime.assets as Record<string,{animation?:{fps:number;frameCount:number};width:number;height:number;visibleBounds:{width:number;height:number}}>;
type Request={identity:string;clip:string;index:number;direction?:string;aim?:number;low?:boolean;variant?:string};
let active:Request={identity:params.get('identity')??'enemy.basic',clip:params.get('clip')??'walk',index:0,direction:params.get('direction')??'front_right'};
let lastReceipt:unknown;
function sample(request:Request):GameState {
  const state=structuredClone(baseline),direction=request.direction??'front_right',authored=direction.replace('_left','_right'),name=`fantasy.actor.${request.identity}.${request.identity==='immune'||request.identity==='hero'?`${authored}.`:''}${request.clip}`;
  const animation=assets[`${name}.00`]?.animation??assets[name]?.animation??{fps:1,frameCount:1};
  const time=request.index/animation.fps+.00001;
  state.visualTime=time;
  const actor:Target={id:`preview:${request.identity}:${request.clip}:${direction}`,kind:'single',role:'virus',x:row.x,y:row.y,radius:18,hp:50,maxHp:50,hitUntil:0,scanned:false,traits:[],facing:.5,born:1,revealedUntil:10};
  if(request.identity==='hero'){
    state.player.facing=request.aim===undefined?(direction==='back_right'?-.5:direction==='front_left'?Math.PI-.5:direction==='back_left'?Math.PI+.5:.5):request.aim*Math.PI/180;
    state.player.moving=request.clip==='walk';
    if(request.clip==='hurt'){state.elapsed=3+request.index*.15/2+.00001;state.tick=Math.round(state.elapsed*60);state.player.hurtUntil=3.15;state.events=[{type:'PLAYER_HURT',tick:180,data:{damage:5}}];}
    if(request.clip==='dash'){state.elapsed=3+request.index*.16/4+.00001;state.tick=Math.round(state.elapsed*60);state.player.dashUntil=3.16;}
  }else if(request.identity.startsWith('enemy.')){
    const family=request.identity.slice(6);
    if(family==='thinRay')actor.tactic='thin-ray';
    if(family==='carapace')actor.traits=['CARAPACE'];
    if(family==='mimic')actor.traits=['MIMIC'];
    if(family.startsWith('fission.')){actor.traits=['FISSION'];actor.generation=family.endsWith('child')?1:0;if(actor.generation)actor.radius=14;}
    if(request.clip==='windup'){actor.attackWindup=.6;actor.attackAt=state.elapsed+.6*(1-(request.index+.01)/animation.frameCount);
      if(family==='thinRay')actor.attackPlan={kind:'thin-ray',origin:{x:row.x,y:row.y},aim:{x:row.x+100,y:row.y+60},windup:.6} as Target['attackPlan'];}
    if(request.clip==='hurt')actor.hitUntil=state.elapsed+.1;
    if(request.clip==='dissolve'){actor.hp=0;actor.deadAt=state.elapsed-.1;}
    if(request.variant==='addon')actor.territoryTask={kind:'invade',nodeId:'heart-healing-1'};
    if(request.variant==='elite')actor.role='elite';
    state.targets=[actor];
  }else if(request.identity==='immune'){
    state.growth!.cells=[{id:actor.id,beaconId:'preview:beacon',organId:'heart',x:row.x,y:row.y,radius:15,born:0,until:20,facing:direction==='back_right'?-.5:.5,
      damage:8,interval:.8,updatedAt:3,attackReadyAt:4,attackUntil:request.clip==='bite'?state.elapsed+.24*(1-(request.index+.01)/4):0,
      targetId:null,activity:request.clip==='bite'?'biting':'seeking',navigationAt:3,waypoint:null}];
  }else if(request.identity==='mother'){
    actor.role='core';actor.radius=52;actor.hp=request.clip==='purified'?0:500;actor.maxHp=680;
    const traits=request.variant==='mimic'?['MIMIC']:request.variant==='fission'?['FISSION']:['CARAPACE'];
    const combat=new MotherCoreController({coreId:actor.id,organId:'heart',traits:traits as ('CARAPACE'|'MIMIC'|'FISSION')[],tick:180,elapsed:3}).state;
    combat.phase='recovery';combat.membrane.remaining=request.variant==='no-membrane'?0:1;
    combat.exposedUntil=request.clip==='core'&&request.index===1?5:0;
    state.territory!.bossCombat=combat;state.targets=[actor];
  }else if(request.identity==='immune.beacon'){
    state.growth!.beacon={id:'preview:beacon',organId:'heart',x:row.x,y:row.y,until:20,born:1,mode:'protocol',damage:10,interval:1,radius:100,rank:1} as NonNullable<GameState['growth']>['beacon'];
  }
  return state;
}
async function render(request:Request){
  active=request;
  // Prime each clip at phase zero; the actual controller then selects the requested visual phase.
  for(const phase of [0,request.index]){
    const state=sample({...request,index:phase}),before=JSON.stringify(state);freeze(state);
    renderer.prepareCamera(state,{snap:true,minimumScale:.62});renderer.render(state,state.player,{cameraPrepared:true,lowEffects:!!request.low});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const diagnostics=renderer.diagnostics(state),subject=diagnostics.art.actorFrames.filter(a=>a.identity===request.identity);
    lastReceipt={request,scope:`Controlled ${normal?'normal-mode nonhero integration':'candidate animation'} through the actual Renderer; all rule state frozen. No natural-play or performance claim.`,stateUnchanged:JSON.stringify(state)===before,
      baselineUnchanged:JSON.stringify(baseline)===baselineJson,cameraScale:renderer.camera.scale,subject,diagnostics};
  }
  document.querySelector('#scope')!.textContent=`${normal?'正式组集成供态':'未批准候选'} · ${request.identity} ${request.direction??''} ${request.clip} ${request.index} · 实际1x/.62 · ${request.low?'低档':'标准'}`;
  return lastReceipt;
}
await render(active);
Object.defineProperty(window,'__actorAnimationProbe',{value:{ready:true,render,inspect:()=>lastReceipt}});
if(params.has('loop')){
  let index=0;const loop=async()=>{const name=`fantasy.actor.${active.identity}.${active.identity==='immune'?`${active.direction}.`:''}${active.clip}.00`,a=assets[name]?.animation;
    await render({...active,index:index++%(a?.frameCount??1)});setTimeout(loop,1000/(a?.fps??4));};void loop();
}
