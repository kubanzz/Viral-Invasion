import { normalized, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { type Target, type Vec, type WorldGeometry } from './types';
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

/** Campaign chambers are larger worlds, not a zoomed-out version of the training room. */
export const HEART_WORLD: WorldGeometry = {
  width: 2400, height: 1500, bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [
    { id: 'fold-a', x: 730, y: 650, radius: 85 },
    { id: 'fold-b', x: 1630, y: 1190, radius: 90 },
    { id: 'fold-c', x: 1350, y: 540, radius: 72 },
    { id: 'fold-d', x: 2120, y: 720, radius: 85 },
    { id: 'fold-e', x: 780, y: 980, radius: 70 },
  ],
  foreground: { x: 1110, y: 1195, width: 275, height: 150 },
};
export const LUNG_WORLD: WorldGeometry = {
  width: 2400, height: 1500, bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [
    { id: 'alveolus-a', x: 850, y: 650, radius: 100 },
    { id: 'alveolus-b', x: 1740, y: 1090, radius: 105 },
    { id: 'alveolus-c', x: 1900, y: 360, radius: 78 },
    { id: 'alveolus-d', x: 650, y: 1330, radius: 68 },
  ],
  foreground: { x: 1010, y: 1220, width: 285, height: 150 },
};
export const ORGAN_DEFINITIONS: Record<OrganId, OrganDefinition> = {
  heart: {
    id:'heart', geometry:HEART_WORLD, playerStart:{x:450,y:1070}, entry:{x:2100,y:330}, exit:{x:2170,y:280},
    tissue:{x:850,y:1190}, terminal:{x:350,y:1180}, research:{x:350,y:690},
    gate:{x:1070,y:280}, device:{x:1440,y:950},
    sourcePositions:[{x:1020,y:650},{x:2010,y:1090}], elitePosition:{x:1610,y:470},
    corePosition:{x:1900,y:650}, migrationGoal:{x:2170,y:280},
    retainedSource:{x:1730,y:1020}, migratedSource:{x:2010,y:1090},
    carrierStarts:[{x:2060,y:420},{x:2110,y:460},{x:2150,y:420}], flowOrigin:{x:1440,y:950},
    regions:[
      {id:'arrival',label:'复苏前庭',x:430,y:1120,radius:240},
      {id:'research',label:'抗体研究区',x:350,y:690,radius:220},
      {id:'rhythm',label:'节律枢纽',x:1440,y:950,radius:300},
      {id:'infection',label:'感染前线',x:1040,y:650,radius:255},
      {id:'core',label:'深层病灶',x:1940,y:780,radius:350},
    ],
  },
  lung: {
    id:'lung', geometry:LUNG_WORLD, playerStart:{x:450,y:1060}, entry:{x:450,y:1060}, exit:{x:350,y:1060},
    tissue:{x:1260,y:1120}, terminal:{x:350,y:650}, research:{x:800,y:1150},
    gate:{x:1250,y:330}, device:{x:1250,y:330},
    sourcePositions:[{x:1570,y:600}], elitePosition:{x:1730,y:560},
    corePosition:{x:1880,y:700}, migrationGoal:{x:1660,y:360},
    retainedSource:{x:1570,y:600}, migratedSource:{x:2050,y:1110},
    carrierStarts:[{x:540,y:1020},{x:580,y:1080},{x:530,y:1130}], flowOrigin:{x:1470,y:800},
    regions:[
      {id:'arrival',label:'支气管入口',x:440,y:1030,radius:230},
      {id:'research',label:'免疫集结区',x:900,y:1150,radius:240},
      {id:'airway',label:'气道枢纽',x:1250,y:330,radius:280},
      {id:'infection',label:'感染肺泡',x:1570,y:600,radius:250},
      {id:'core',label:'深层肺泡',x:1990,y:850,radius:330},
    ],
  },
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
  const sourcePosition=config.sourcePositions[0];
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
    ...(id==='lung'?{flow:{phase:'inhale' as const,phaseRemaining:CAMPAIGN_BALANCE.inhaleDuration,airwayOpen:true,changedAt:-10,pressureUntil:0,origin:{...config.flowOrigin},direction:{x:0,y:1},strength:CAMPAIGN_BALANCE.airflowStrength}}:{})};
}
