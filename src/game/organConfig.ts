import { normalized, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { WORLD, type Target, type Vec, type WorldGeometry } from './types';
import { BATTLE_BALANCE } from './battleConfig';
import type { OrganId } from './battleTypes';
import type { OrganArena, OrganDefinition } from './campaignTypes';

export const CAMPAIGN_BALANCE = {
  migrationWarning: 12, blockDuration: 2, interceptDuration: 12, travelCooldown: 3,
  backgroundInterval: 5, backgroundGrace: 10, backgroundDamage: .75, backgroundInfection: .8,
  backgroundTripBudget: 15, returnAttackGrace: 1,
  airwayCooldown: 1, closeAirwayCost: 3, openAirwayCost: 1, airwayPressureDuration: 4,
  inhaleDuration: 4, exhaleDuration: 3, airflowStrength: 36,
  retainedSourceHp: 238, migratedSourceHp: 238, carrierHp: 44, carrierSpeed: 62,
  ignoreOrganCost: 10, ignoreInfection: 8, blockOrganCost: 4, blockInfection: 3,
} as const;

export const LUNG_WORLD: WorldGeometry = {
  width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 },
  obstacles: [{ id: 'alveolus-a', x: 435, y: 350, radius: 62 }, { id: 'alveolus-b', x: 965, y: 290, radius: 60 }],
  foreground: { x: 155, y: 550, width: 190, height: 125 },
};
export const ORGAN_DEFINITIONS: Record<OrganId, OrganDefinition> = {
  heart: { id:'heart', geometry: WORLD, entry:{x:1030,y:230}, exit:{x:1060,y:210}, tissue:{x:780,y:610},terminal:{x:340,y:610},research:{x:475,y:610},device:{x:730,y:230},corePosition:{x:785,y:390},migrationGoal:{x:1060,y:210} },
  lung: { id:'lung', geometry: LUNG_WORLD, entry:{x:290,y:470}, exit:{x:245,y:430}, tissue:{x:790,y:610},terminal:{x:340,y:610},research:{x:475,y:610},device:{x:730,y:230},corePosition:{x:780,y:390},migrationGoal:{x:835,y:235} },
};
export const getOrganDefinition=(id:OrganId):OrganDefinition=>ORGAN_DEFINITIONS[id];

export function sourceTarget(id:string,position:Vec,hp:number):Target {
  return {...position,id,kind:'single',role:'source',radius:34,hp,maxHp:hp,hitUntil:0,scanned:false,traits:[],facing:0,born:0};
}

/** A dormant arena is deterministic data; activation is a campaign decision, never a refresh. */
export function createOrganArena(id:OrganId,seed:number):OrganArena {
  const config=getOrganDefinition(id),geometry=config.geometry;
  const rng=new SeedRng((seed^(id==='lung'?0x6c756e67:0x68656172))>>>0);
  const sourceId=id==='lung'?'lung-source-a':'source-a';
  const sourcePosition=id==='lung'?{x:610,y:330}:{x:610,y:330};
  const tissue={...config.tissue,hp:id==='lung'?76:62,maxHp:100,radius:43};
  const deviceId=id==='lung'?'airway':'valve';
  const nodes:OrganArena['graph']['nodes']=[
    {id:sourceId,kind:'source',...sourcePosition,active:true,infected:true},
    {id:deviceId,kind:id==='lung'?'gate':'valve',...config.device,active:true,infected:false},
    {id:'tissue',kind:'tissue',...tissue,active:true,infected:false},
    {id:'retest',kind:'retest',...config.terminal,active:true,infected:false},
    {id:'research',kind:'research',...config.research,active:true,infected:false},
    {id:'exit',kind:'exit',...config.exit,active:true,infected:false},
  ];
  const edges=[[sourceId,deviceId],[deviceId,'tissue']].map(([from,to])=>{
    const a=nodes.find(n=>n.id===from)!,b=nodes.find(n=>n.id===to)!;
    return{id:`${from}:${to}`,from,to,open:true,nextSpread:BATTLE_BALANCE.spreadInterval,flowDirection:normalized(b.x-a.x,b.y-a.y)};
  });
  const targets:Target[]=[sourceTarget(sourceId,sourcePosition,BATTLE_BALANCE.sourceHp)];
  for(let index=0;index<2;index++){
    const position=moveWithCollision(sourcePosition,{x:rng.int(-60,60),y:rng.int(-45,45)},22,geometry);
    targets.push({...position,id:`${id}-initial-${index}`,kind:'single',role:'virus',radius:22,hp:68,maxHp:68,hitUntil:0,scanned:false,traits:[],facing:0,born:0,attackReady:1.5,generation:0,sourceId});
  }
  return {organId:id,activated:id==='heart',geometry,targets,tissue,terminal:{...config.terminal},graph:{nodes,edges},
    pulse:{phase:'charge',phaseRemaining:2,readyAt:0,activeUntil:0,origin:{...config.device},direction:Math.PI/2,uses:0},
    nextSpawnAt:{[sourceId]:BATTLE_BALANCE.spawnInterval},gateChangedAt:-10,organLowSince:null,
    departedAt:null,nextBackgroundAt:CAMPAIGN_BALANCE.backgroundInterval,backgroundLoss:0,backgroundReason:'',
    offscreenElapsed:0,nextBackgroundElapsed:CAMPAIGN_BALANCE.backgroundGrace,lastPressureAt:0,totalBackgroundLoss:0,
    ...(id==='lung'?{flow:{phase:'inhale' as const,phaseRemaining:CAMPAIGN_BALANCE.inhaleDuration,airwayOpen:true,changedAt:-10,pressureUntil:0,origin:{x:750,y:455},direction:{x:0,y:1},strength:CAMPAIGN_BALANCE.airflowStrength}}:{})};
}
