import { normalized } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type Vec } from './types';
import { CAMPAIGN_BALANCE as B } from './organConfig';
import type { CampaignCommand, LungFlowState } from './campaignTypes';

/** Physics deltas use world XY; the host resolves each one with the lung geometry. */
export function lungFlowDirection(flow:LungFlowState,position:Vec):Vec {
  if(!flow.airwayOpen)return{x:0,y:0};
  return flow.phase==='inhale'?normalized((flow.origin.x-position.x)*1.6,(flow.origin.y-position.y)*.35):normalized(Math.sign(position.x-flow.origin.x)*.55,1);
}

export function advanceLungFlow(flow:LungFlowState,game:GameState):CampaignCommand[] {
  if(game.phase!=='playing'||game.battle?.organId!=='lung')return[];
  const period=B.inhaleDuration+B.exhaleDuration,beat=game.elapsed%period;
  const phase=beat<B.inhaleDuration?'inhale':'exhale';
  const commands:CampaignCommand[]=[];
  if(flow.phase!==phase)commands.push({kind:'log',type:'LUNG_PHASE_CHANGED',data:{phase,airwayOpen:flow.airwayOpen,organId:'lung'}});
  flow.phase=phase;flow.phaseRemaining=(phase==='inhale'?B.inhaleDuration:period)-beat;
  flow.direction=phase==='inhale'?{x:0,y:-1}:{x:0,y:1};
  if(!flow.airwayOpen)return commands;
  for(const target of game.targets){
    const bounds = activeWorld(game).bounds;
    if(target.hp<=0||target.role==='source'||target.role==='core'||target.x<bounds.left||target.x>bounds.right||target.y<bounds.top||target.y>bounds.bottom)continue;
    const mass=target.traits?.includes('CARAPACE') ? .35 : (target.generation??0)>0 ? 1.45 : target.role==='elite' ? .6 : 1;
    const direction=lungFlowDirection(flow,target);
    commands.push({kind:'moveActor',organId:'lung',targetId:target.id,delta:{x:direction.x*flow.strength*mass*BALANCE.step,y:direction.y*flow.strength*mass*BALANCE.step}});
  }
  return commands;
}

export function toggleAirway(flow:LungFlowState,game:GameState):CampaignCommand[] {
  if(game.phase!=='playing'||game.battle?.organId!=='lung')return[];
  if(game.elapsed-flow.changedAt<B.airwayCooldown)return[{kind:'notice',text:'气道正在切换，请稍候。',seconds:1}];
  flow.airwayOpen=!flow.airwayOpen;flow.changedAt=game.elapsed;flow.pressureUntil=game.elapsed+B.airwayPressureDuration;
  const cost=flow.airwayOpen?B.openAirwayCost:B.closeAirwayCost,eventId=`lung-airway:${game.tick}`;
  return[{kind:'setRoute',organId:'lung',nodeId:'airway',open:flow.airwayOpen,eventId},
    {kind:'organDamage',organId:'lung',amount:cost,reason:'airway-pressure',eventId:`${eventId}:cost`},
    {kind:'log',type:'AIRWAY_CHANGED',data:{organId:'lung',open:flow.airwayOpen,tissueCost:cost}},
    {kind:'notice',text:flow.airwayOpen?`气道开启：恢复聚散气流与传播，肺部承压 −${cost}。`:`气道关闭：截断传播和气流，肺部承压 −${cost}；玩家出口仍可通行。`,seconds:5}];
}
