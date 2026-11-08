import { GameSession } from '../src/game/session';
import { growthContext } from '../src/game/growth';
import { summonImmuneCells } from '../src/game/immuneCells';
import type { BeaconState } from '../src/game/growthTypes';
import type { LegionId } from '../src/game/legionCatalog';
import type { GameEvent, Target } from '../src/game/types';

/** Supplied whiteboard fixture; all movement, clocks, rays and damage after setup use GameSession.step. */
export function measureLegion(legionId: LegionId, q: boolean, seconds=30) {
  const game=new GameSession(241,{mode:'endless'});game.start();
  game.configureExpedition({runId:`seraph-whiteboard:${legionId}:${q}`,seed:241,missionId:'boundary',
    loadout:{weaponId:'steady',rarity:'purple',upgrade:0},blueprints:[],extraAntibodies:0,firstClear:false,
    legions:[{legionId,slot:0,fed:true}]});
  const state=game.state;
  state.world={width:1800,height:1200,bounds:{left:20,right:1780,top:20,bottom:1180},obstacles:[],foreground:{x:0,y:0,width:0,height:0}};
  Object.assign(state.player,{x:500,y:500});Object.assign(state.tissue,{x:300,y:800});
  Object.assign(state.endless!,{phase:'intermission',phaseUntil:Infinity,remainingToSpawn:0,nextSpawnAt:Infinity,
    batchIndex:state.endless!.batchSchedule.length,batchMemberIndex:0,pendingChildren:0});
  // The original mission graph has its own finite source spawn clocks. Disable
  // those supplied initial producers too, leaving exactly one receiver.
  state.battle!.nextSpawnAt={};
  for(const node of state.battle!.graph.nodes)if(node.kind==='source')node.active=false;
  // A source is a stationary real damage receiver, with no attack behavior or territory shield.
  const target:Target={id:'whiteboard-source',x:680,y:500,radius:28,hp:100000,maxHp:100000,kind:'single',role:'source',traits:[],hitUntil:0,scanned:false};
  state.targets=[target];
  const beacon:BeaconState={id:'whiteboard-legion',x:500,y:500,organId:'heart',born:0,until:Infinity,radius:220,
    damage:24,interval:.8,nextAttackAt:0,tuning:'balanced',mode:'protocol',rank:1,cellCount:legionId==='seraph'?4:3,
    legionId,legionSlot:0,fed:true};
  Object.assign(state.growth!,{beacon,beacons:[beacon],cells:summonImmuneCells(beacon,growthContext(state),beacon.cellCount),
    equipped:[{id:'IMMUNE_BEACON',tuning:'balanced',rank:1}],beaconReadyAt:12});
  const events:GameEvent[]=[],releases=new Map<string,{role:string;hit:boolean}>();
  let damage=0,firstHit:number|undefined,maxTargets=1,unexpectedTargets=0;
  game.bus.on('event',event=>{
    if(['TARGET_HIT','LEGION_SERAPH_WINDUP','LEGION_SERAPH_RELEASED','LEGION_SERAPH_HIT','LEGION_SACRED_PURSUIT'].includes(event.type))events.push(structuredClone(event));
    if(event.type==='TARGET_HIT'&&event.data.id===target.id&&event.data.protocolId==='IMMUNE_BEACON') {
      damage+=Number(event.data.damage);firstHit??=state.elapsed;
    }
    const key=`${event.data.actionId}:${event.data.part}`;
    if(event.type==='LEGION_SERAPH_RELEASED')releases.set(key,{role:String(event.data.role),hit:releases.get(key)?.hit??false});
    if(event.type==='LEGION_SERAPH_HIT')releases.set(key,{role:String(event.data.role),hit:true});
  });
  // No supplied-state mutation below this line.
  for(let frame=0;frame<seconds*60;frame++){
    game.step({moveX:0,moveY:0,fire:false,aim:target,...(q&&frame===30?{scan:true,scanAim:target}:{})});
    maxTargets=Math.max(maxTargets,state.targets.length);unexpectedTargets+=state.targets.filter(actor=>actor.id!==target.id).length;
  }
  const roleRows=['commander','lancer','prism'].map(role=>{
    const rays=[...releases.values()].filter(value=>value.role===role);
    return {role,releases:rays.length,empty:rays.filter(value=>!value.hit).length,
      firstHit:events.find(event=>event.type==='LEGION_SERAPH_HIT'&&event.data.role===role)?.tick! / 60 || null,
      damage:events.filter(event=>event.type==='LEGION_SERAPH_HIT'&&event.data.role===role).reduce((sum,event)=>sum+Number(event.data.damage),0)};
  });
  return {legionId,q,seconds,actualSeconds:state.elapsed,damage,dps:damage/seconds,firstHit: firstHit??null,
    pursuit:events.filter(event=>event.type==='LEGION_SACRED_PURSUIT').length,roles:roleRows,
    phase:state.phase,bodies:state.growth!.cells!.length,maxTargets,unexpectedTargets,events};
}
export function measureSeraphComparison() {
  return [false,true].map(q=>{
    const normal=measureLegion('phagocyte',q),seraph=measureLegion('seraph',q);
    return {q,normal,oldTheory:{factor:1.5,damage:normal.damage*1.5,dps:normal.dps*1.5,
      note:'旧1.5按相同白板基础军团实际输出乘系数；用于旧版预算基线，非重跑已移除旧AI'},seraph,
      actualRatio:seraph.damage/normal.damage};
  });
}
