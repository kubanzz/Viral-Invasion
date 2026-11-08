import { distance, isLegalPosition, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { eventModifierFromState } from './hostEvents';
import type { BeaconState, GrowthCommand, GrowthContext } from './growthTypes';
import type { ImmuneCellState } from './immuneCells';
import { WORLD, type Target, type Vec, type WorldGeometry } from './types';

export type SeraphRole = 'commander' | 'lancer' | 'prism';
export type SeraphAttack = 'thrust' | 'cleave' | 'flank' | 'prism';
export interface SeraphAction {
  actionId: string; kind: SeraphAttack; phase: 'windup' | 'release' | 'recover';
  startedAt: number; phaseStartedAt: number; until: number; targetId: string;
  origin: Vec; aim: Vec; direction: Vec; part: number; sequence: number; strong: boolean; orderId?: string;
  /** Frozen attack budget: a three-ray volley spends exactly one ordinary attack. */
  damage: number; traveled: number; released?: boolean;
  releaseTick?: number; releasedPart?: number; releaseFrom?: Vec; releaseTo?: Vec;
}
/** Exact current-tick evidence, checked again by the host before accepting damage. */
export interface SeraphStrike { actionId: string; part: number; tick: number }
export const SERAPH_BALANCE = {
  commanderWindup: .20, cleaveWindup: .25, lancerWindup: .15, prismWindup: .28,
  dashSpeed: 640, thrustTravel: 55, flankTravel: 100, dashSeconds: .18,
  prismMin: 140, prismMax: 210, prismRange: 340, prismWidth: 7, prismSpread: .075, prismSpacing: .075,
} as const;
const point = (v: Vec): Vec => ({x:v.x,y:v.y});
export function cloneSeraphAction(action?: SeraphAction): SeraphAction | undefined {
  return action && {...action,origin:point(action.origin),aim:point(action.aim),direction:point(action.direction),
    ...(action.releaseFrom?{releaseFrom:point(action.releaseFrom)}:{}),...(action.releaseTo?{releaseTo:point(action.releaseTo)}:{})};
}
export function seraphCellIndex(cell: ImmuneCellState): number {
  const legacySeat=Number(cell.id.match(/:cell:(\d+)(?=:|$)/)?.[1]);
  return cell.seraphSeat ?? (cell.seraphRole==='commander'||cell.legionRole==='leader'?0:cell.seraphRole==='prism'?3:
    Number.isInteger(legacySeat)&&legacySeat>=0&&legacySeat<=3?legacySeat:1);
}
export function seraphRoleOf(cell: ImmuneCellState): SeraphRole {
  return cell.seraphRole ?? (seraphCellIndex(cell)===0?'commander':seraphCellIndex(cell)===3?'prism':'lancer');
}
export function seraphActionEvent(cell: ImmuneCellState, beacon: BeaconState, action: SeraphAction,
  from: Vec, to: Vec, duration: number, part = action.part) {
  return { actionId:action.actionId,cellId:cell.id,beaconId:beacon.id,role:seraphRoleOf(cell),attack:action.kind,
    fromX:from.x,fromY:from.y,x:to.x,y:to.y,targetId:action.targetId,part,sequence:action.sequence,strong:action.strong,
    duration,echo:!!cell.echo,...(action.orderId?{orderId:action.orderId,focusId:action.orderId}:{}) };
}
/** A finite-width light ray sweeps the same width against targets and tissue folds. */
export function seraphBeamLength(from:Vec,direction:Vec,world:WorldGeometry):number {
  return world.obstacles.reduce<number>((range,obstacle)=>Math.min(range,
    rayCircle(from,direction,obstacle,obstacle.radius+SERAPH_BALANCE.prismWidth,SERAPH_BALANCE.prismRange)??Infinity),SERAPH_BALANCE.prismRange);
}
/** Same swept/LOS test is used by command planning and authoritative damage acceptance. */
export function seraphStrikeHits(cell: ImmuneCellState, target: Target, action: SeraphAction, world: WorldGeometry): boolean {
  if(!action.releaseFrom||!action.releaseTo)return false;
  const from=action.releaseFrom,to=action.releaseTo;
  if(action.kind==='prism') {
    const direction=normalized(to.x-from.x,to.y-from.y),length=Math.min(distance(from,to),seraphBeamLength(from,direction,world));
    return rayCircle(from,direction,target,target.radius+SERAPH_BALANCE.prismWidth,length)!==null;
  }
  const gap=distance(cell,target);
  if(gap>cell.radius+target.radius+9+1e-7)return false;
  const wall=wallHit(cell,normalized(target.x-cell.x,target.y-cell.y),gap,world);
  return wall===null||wall>=gap-target.radius;
}
interface SeraphAdvance {
  cell: ImmuneCellState; beacon: BeaconState; context: GrowthContext; target?: Target;
  squad: readonly ImmuneCellState[]; index: number; delta: number; speed: number; canFocus: boolean;
  remainingHp: Map<string,number>; damageMultiplier: number;
  helpers: {
    nextWaypoint(from: Vec,to: Vec,world: WorldGeometry,radius: number):Vec;
    moveCell(cell:ImmuneCellState,to:Vec,squad:readonly ImmuneCellState[],index:number,delta:number,world?:WorldGeometry,speed?:number):void;
    contact(from:Vec,radius:number,target:Target,world?:WorldGeometry):boolean;
    segmentClear(from:Vec,to:Vec,world:WorldGeometry,radius:number):boolean;
  };
}

/** Each class owns a bounded, serializable action. No catch-up loops or HP writes. */
export function advanceSeraphCell(input: SeraphAdvance): GrowthCommand[] {
  const {cell,beacon,context,squad,index,delta,speed,helpers,remainingHp,damageMultiplier}=input;
  const commands:GrowthCommand[]=[],world=context.geometry??WORLD,now=context.elapsed,role=seraphRoleOf(cell);
  cell.seraphRole=role;cell.seraphSeat=seraphCellIndex(cell);
  let action=cell.seraphAction;
  const actionTarget=action&&context.targets.find(t=>t.id===action!.targetId&&t.hp>0);
  const target=action&&action.phase!=='recover'?actionTarget:input.target;
  cell.targetId=target?.id??null;
  const travel=(destination:Vec,moveSpeed=speed)=>{
    if(!cell.waypoint||now>=cell.navigationAt||distance(cell,cell.waypoint)<8||!helpers.segmentClear(cell,cell.waypoint,world,cell.radius)) {
      cell.waypoint=helpers.nextWaypoint(cell,destination,world,cell.radius);cell.navigationAt=now+.12;
    }
    helpers.moveCell(cell,cell.waypoint,squad,index,delta,world,moveSpeed);
  };
  const emit=(type:string,a:SeraphAction,from:Vec,to:Vec,duration:number,part=a.part)=>commands.push({kind:'log',type,
    data:seraphActionEvent(cell,beacon,a,from,to,duration,part)});
  const recover=(a:SeraphAction)=>{a.phase='recover';a.phaseStartedAt=now;a.until=now+(role==='lancer'?.25:.16);cell.activity='biting';};
  const release=(a:SeraphAction,from:Vec,to:Vec,part:number)=>{
    a.releaseTick=context.tick;a.releasedPart=part;a.releaseFrom=point(from);a.releaseTo=point(to);
    cell.attackUntil=now+.24;cell.activity='biting';
    emit('LEGION_SERAPH_RELEASED',a,from,to,role==='prism'?.18:.24,part);
    if(cell.echo)emit('LEGION_SERAPH_ECHO',a,from,to,.24,part);
    const rayDirection=normalized(to.x-from.x,to.y-from.y),rayLength=distance(from,to);
    const rayEntry=(target:Target)=>rayCircle(from,rayDirection,target,target.radius+SERAPH_BALANCE.prismWidth,rayLength)??Infinity;
    const candidates=a.kind==='prism'?context.targets.filter(t=>t.hp>0&&(t.role!=='core'||t.id===a.targetId))
      .filter(t=>seraphStrikeHits(cell,t,a,world)).sort((a,b)=>rayEntry(a)-rayEntry(b)||a.id.localeCompare(b.id)).slice(0,1)
      :a.kind==='cleave'?context.targets.filter(t=>t.hp>0&&(t.role!=='core'||t.id===a.targetId)&&seraphStrikeHits(cell,t,a,world))
      :target&&seraphStrikeHits(cell,target,a,world)?[target]:[];
    for(const hit of candidates) {
      const remaining=remainingHp.get(hit.id)??hit.hp;
      const amount=Math.min(a.damage*(a.kind==='prism'?1/3:1)*(hit.role==='core'?.5:1),remaining/damageMultiplier);
      if(amount<=0)continue;
      const pursuitDamage=role==='commander'&&a.strong&&a.orderId===beacon.seraphOrder?.id&&hit.id===beacon.seraphOrder?.targetId
        &&now>=(beacon.pursuitReadyAt??0)?(30+((beacon.rank??1)-1)*15)*(beacon.fed===false?.75:1)*(hit.role==='core'?.5:1):0;
      const rootId=`${a.actionId}:part:${part}:${hit.id}`;
      commands.push({kind:'damage',protocolId:'IMMUNE_BEACON',organId:context.organId,rootId,targetId:hit.id,amount,pursuitDamage,
        cause:'protocol',hop:0,immuneCellId:cell.id,seraphStrike:{actionId:a.actionId,part,tick:context.tick}},
        {kind:'log',type:'PROTOCOL_BEACON_HIT',data:{protocolId:'IMMUNE_BEACON',rootId,cellId:cell.id,targetId:hit.id,damage:amount,x:cell.x,y:cell.y}});
      remainingHp.set(hit.id,Math.max(0,remaining-amount*damageMultiplier));
    }
  };
  if(delta===0)return commands;
  if(action) {
    if(action.phase==='recover') {
      if(role==='lancer') {
        const side=cell.seraphSeat===2?-1:1;
        const destination={x:action.aim.x-action.direction.x*(cell.radius+(actionTarget?.radius??25)+45)-action.direction.y*side*52,
          y:action.aim.y-action.direction.y*(cell.radius+(actionTarget?.radius??25)+45)+action.direction.x*side*52};
        cell.waypoint=null;travel(destination,250);cell.activity='returning';
      }
      if(now+1e-9>=action.until)delete cell.seraphAction;
      return commands;
    }
    if(!actionTarget) { recover(action);return commands; }
    cell.facing=Math.atan2(action.direction.y,action.direction.x);
    if(action.phase==='windup') {
      cell.activity='guarding';
      if(now+1e-9<action.until)return commands;
      action.phase='release';action.phaseStartedAt=now;action.until=now+SERAPH_BALANCE.dashSeconds;
      if(role==='prism')action.until=now;
    }
    if(action.kind==='prism') {
      if(now+1e-9<action.until)return commands;
      const part=action.part,angle=(part-1)*SERAPH_BALANCE.prismSpread;
      const direction={x:action.direction.x*Math.cos(angle)-action.direction.y*Math.sin(angle),y:action.direction.x*Math.sin(angle)+action.direction.y*Math.cos(angle)};
      const from=point(cell),range=seraphBeamLength(from,direction,world);
      const to={x:from.x+direction.x*range,y:from.y+direction.y*range};
      release(action,from,to,part);action.part++;
      if(action.part>=3)recover(action);else action.until=now+SERAPH_BALANCE.prismSpacing;
      return commands;
    }
    if(action.kind==='cleave') {release(action,point(cell),point(cell),0);recover(action);return commands;}
    if(!helpers.contact(cell,cell.radius,actionTarget,world)) {
      const cap=action.kind==='thrust'?SERAPH_BALANCE.thrustTravel:SERAPH_BALANCE.flankTravel;
      const length=Math.min(SERAPH_BALANCE.dashSpeed*delta,cap-action.traveled);
      if(length>0) {
        const before=point(cell),moved=moveWithCollision(cell,{x:action.direction.x*length,y:action.direction.y*length},cell.radius,world);
        if(isLegalPosition(moved,cell.radius,world)&&distance(before,moved)<=length+1e-7) {cell.x=moved.x;cell.y=moved.y;action.traveled+=distance(before,moved);}
      }
    }
    if(helpers.contact(cell,cell.radius,actionTarget,world)||now+1e-9>=action.until) {
      release(action,action.origin,point(cell),0);recover(action);
    }
    return commands;
  }
  if(!target) {
    const orbit=cell.seraphSeat/4*Math.PI*2;travel({x:beacon.x+Math.cos(orbit)*45,y:beacon.y+Math.sin(orbit)*45});
    cell.activity='returning';return commands;
  }
  const direction=normalized(target.x-cell.x,target.y-cell.y),gap=distance(cell,target);
  cell.facing=Math.atan2(direction.y,direction.x);
  const touching=helpers.contact(cell,cell.radius,target,world);
  const line=wallHit(cell,direction,gap,world),visible=line===null||line>=gap-target.radius;
  let ready=false;
  if(role==='prism') {
    ready=visible&&gap>=SERAPH_BALANCE.prismMin-10&&gap<=SERAPH_BALANCE.prismMax+20;
    if(!ready) {
      const away=normalized(cell.x-target.x,cell.y-target.y),desired={x:target.x+away.x*175,y:target.y+away.y*175};
      travel(desired);cell.activity='seeking';
    }
  } else if(role==='lancer') {
    const side=cell.seraphSeat===2?-1:1;
    const anchor=distance(beacon,target)>10?beacon:distance(context.player,target)>10?context.player:{x:target.x-1,y:target.y};
    const radial=normalized(anchor.x-target.x,anchor.y-target.y),angle=side*.7;
    const out={x:radial.x*Math.cos(angle)-radial.y*Math.sin(angle),y:radial.x*Math.sin(angle)+radial.y*Math.cos(angle)};
    const ring=target.radius+cell.radius+58,seat={x:target.x+out.x*ring,y:target.y+out.y*ring};
    ready=visible&&(touching||gap<=target.radius+cell.radius+85&&distance(cell,seat)<40);
    if(!ready){cell.waypoint=null;travel(seat);cell.activity='seeking';}
  } else {
    ready=touching||visible&&gap<=target.radius+cell.radius+48;
    if(!ready){travel(target);cell.activity='seeking';}
  }
  if(!ready||now+1e-9<cell.attackReadyAt)return commands;
  const sequence=(cell.seraphSequence??0)+1;cell.seraphSequence=sequence;
  const kind:SeraphAttack=role==='prism'?'prism':role==='lancer'?'flank':sequence%2?'thrust':'cleave';
  const windup=kind==='prism'?SERAPH_BALANCE.prismWindup:kind==='flank'?SERAPH_BALANCE.lancerWindup:kind==='cleave'?SERAPH_BALANCE.cleaveWindup:SERAPH_BALANCE.commanderWindup;
  // A cleave must begin in true melee reach; approach during the ordinary movement budget.
  if(kind==='cleave'&&!touching){cell.seraphSequence--;travel(target);return commands;}
  const order=beacon.seraphOrder, strong=!!order&&order.targetId===target.id&&order.until>now;
  action={actionId:`${cell.id}:seraph:${sequence}`,kind,phase:'windup',startedAt:now,phaseStartedAt:now,until:now+windup,
    targetId:target.id,origin:point(cell),aim:point(target),direction:normalized(target.x-cell.x,target.y-cell.y),part:0,sequence,strong,
    damage:cell.damage*((cell.antibodyUntil??0)>now?1.5:1),traveled:0,...(strong?{orderId:order!.id}:{})};
  cell.seraphAction=action;cell.waypoint=null;cell.activity='guarding';
  const frequency=eventModifierFromState(context.hostEvents,context.organId,now,'immuneAttackFrequency',cell);
  cell.attackReadyAt=now+cell.interval/frequency;
  emit('LEGION_SERAPH_WINDUP',action,cell,target,windup);
  return commands;
}
