import { distance, isLegalPosition, moveWithCollision, normalized } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type InputFrame, type Vec } from './types';
import { IMMUNE_CELL_BALANCE, type ImmuneCellState } from './immuneCells';
export type CampStationId = 'warehouse'|'forge'|'shop'|'departure';
export const CAMP_STATION_NAMES:Record<CampStationId,string>={warehouse:'免疫仓库',forge:'生命锻造台',shop:'补给站',departure:'远征出击台'};
export function campStations(state:GameState):{id:CampStationId;name:string;position:Vec}[]{
  const core=state.territory?.nodes.find(n=>n.id==='core')??state.tissue;
  const points:[CampStationId,number,number][]=[['warehouse',-175,-80],['forge',175,-80],['shop',-175,135],['departure',175,135]];
  return points.map(([id,x,y])=>{const requested={x:core.x+x,y:core.y+y};let position=requested;
    if(!isLegalPosition(position,40,activeWorld(state)))for(let r=20;r<=120;r+=20){let found=false;for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:requested.x+Math.cos(a)*r,y:requested.y+Math.sin(a)*r};if(isLegalPosition(p,40,activeWorld(state))){position=p;found=true;break;}}if(found)break;}
    return{id,name:CAMP_STATION_NAMES[id],position};});
}
export function prepareCampScene(state:GameState,introComplete:boolean):void {
  state.phase='playing';state.result=null;state.elapsed=0;state.tick=0;state.targets=[];state.effects=[];state.events=[];
  state.playerProjectiles=[];state.playerInfection=null;delete state.playerFlight;delete state.smartViruses;delete state.chargedSlash;delete state.traction;
  delete state.hostEvents;delete state.bladeOpening;delete state.bladeFollow;state.scanReady=0;state.scanUntil=0;state.cooldowns={1:0,2:0,3:0};state.chargedSlashReadyAt=0;
  state.camp={introSeconds:0,introComplete};state.message='心脏已成为安全营地 · 靠近设施按E，或使用上方营地菜单。';state.messageUntil=8;
  state.player.hp=100;state.tissue.hp=100;state.player.moving=false;state.player.dashUntil=0;state.player.dashReady=0;state.player.hurtUntil=0;state.player.actionUntil=0;
  if(state.growth){state.growth.cells=[];state.growth.beacons=[];state.growth.beacon=null;state.growth.marks=[];state.growth.draft=null;state.growth.pendingResearch=null;}
  if(state.territory){state.territory.stage='victory';state.territory.campBuilt=true;state.territory.purification=null;delete state.territory.construction;delete state.territory.bossCombat;
    for(const node of state.territory.nodes){node.owner='healthy';node.infectionProgress=0;node.purificationProgress=0;}
    for(const source of Object.values(state.territory.sources))source.destroyed=true;
    const core=state.territory.nodes.find(n=>n.id==='core')!;state.player.x=core.x;state.player.y=core.y+100;}
  if(state.battle)state.battle.graph.nodes=state.battle.graph.nodes.filter(n=>n.kind==='healing');
  if(state.growth&&!introComplete)state.growth.cells=campStations(state).flatMap(station=>[-1,1].map((side,index)=>({
    ...station.position,x:station.position.x+side*56,y:station.position.y+20,id:`camp-builder:${station.id}:${index}`,beaconId:'camp:builders',
    organId:'heart',facing:0,updatedAt:0,born:0,until:7,radius:14,hp:IMMUNE_CELL_BALANCE.health,maxHp:IMMUNE_CELL_BALANCE.health,
    targetId:null,waypoint:null,navigationAt:0,attackReadyAt:0,attackUntil:0,interval:1,damage:0,speed:0,activity:'guarding',
  } as ImmuneCellState)));
}
export function advanceCampScene(state:GameState,input:InputFrame,dt:number):void {
  if(!state.camp||state.phase!=='playing')return;
  state.tick++;state.elapsed+=dt;state.camp.introSeconds+=dt;
  if(state.camp.introComplete&&state.growth)state.growth.cells=[];
  const d=normalized(input.moveX,input.moveY),p=moveWithCollision(state.player,{x:d.x*BALANCE.speed*dt,y:d.y*BALANCE.speed*dt},state.player.radius,activeWorld(state));
  state.player.moving=distance(state.player,p)>.01;state.player.x=p.x;state.player.y=p.y;
  if(state.player.moving)state.player.facing=Math.atan2(d.y,d.x);
}
export function nearbyCampStation(state:GameState){return campStations(state).filter(s=>distance(s.position,state.player)<=110).sort((a,b)=>distance(a.position,state.player)-distance(b.position,state.player))[0];}
