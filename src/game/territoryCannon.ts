import { distance, isLegalPosition } from '../actors/collision';
import { activeWorld, type GameState, type Vec } from './types';
import type { TerritoryRuleEvent } from './territoryTypes';
import { BUILDING_DEFINITIONS } from './constructionTypes';
import { territoryNodeAt } from './territory';

export const TERRITORY_CANNON_BALANCE = {
  origin: { x: 1070, y: 720 }, interactionRange: 110,
  range: 1100, radius: 240, damage: 260, reloadSeconds: 24, flightSeconds: .75,
  apex: 120, landingSnap: 60,
} as const;
export interface TerritoryCannonShot {
  id: string; from: Vec; to: Vec; born: number; landsAt: number;
  /** Frozen at launch: replacing a building cannot alter a shell in flight. */
  damage?: number; radius?: number;
}
export type TerritoryPlayerFlight = TerritoryCannonShot;
export interface TerritoryCannonState { readyAt: number; serial: number; reloadSeconds?: number; shot?: TerritoryCannonShot }
export function initializeTerritoryCannon(state:GameState):void{
  // The challenge begins without a built facility. Campaign valves remain
  // untouched; an actual building instance later owns its graph node.
  if(state.territory&&state.battle)state.battle.graph.nodes=state.battle.graph.nodes.filter(node=>node.kind!=='valve');
}

/** The accepted flight owns the player until its landing transaction claims it. */
export function isTerritoryPlayerAirborne(state:Pick<GameState,'playerFlight'>):boolean{return !!state.playerFlight;}
export function territoryPlayerFlightProgress(state:Pick<GameState,'playerFlight'|'elapsed'>,time=state.elapsed):number{
  const f=state.playerFlight;return f?Math.max(0,Math.min(1,(time-f.born)/(f.landsAt-f.born))):0;
}
export function territoryPlayerFlightHeight(state:Pick<GameState,'playerFlight'|'elapsed'|'visualTime'>):number{
  return state.playerFlight?Math.sin(Math.PI*territoryPlayerFlightProgress(state,state.visualTime??state.elapsed))*TERRITORY_CANNON_BALANCE.apex:0;
}
export function advanceTerritoryPlayerFlight(state:GameState):void{
  const f=state.playerFlight;if(!f||state.phase!=='playing'||state.player.hp<=0)return;
  const t=territoryPlayerFlightProgress(state);state.player.x=f.from.x+(f.to.x-f.from.x)*t;state.player.y=f.from.y+(f.to.y-f.from.y)*t;
  state.player.moving=false;
}

/** Preview and committed shells share the same range and arena projection. */
export function territoryCannonAim(state: GameState, aim: Vec): Vec | undefined {
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return;
  const view = territoryCannonView(state);
  if (!view.exists || !view.enabled) return;
  const origin = view.origin;
  const dx = aim.x - origin.x, dy = aim.y - origin.y, length = Math.hypot(dx, dy);
  const factor = length > view.range ? view.range / length : 1;
  const bounds = activeWorld(state).bounds;
  const radius=state.player.radius,world=activeWorld(state);
  const requested={x:Math.max(bounds.left+radius,Math.min(bounds.right-radius,origin.x+dx*factor)),
    y:Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,origin.y+dy*factor))};
  const legal=(p:Vec)=>distance(origin,p)<=view.range+1e-7&&isLegalPosition(p,radius,world);
  if(legal(requested))return requested;
  // Bounded, deterministic local correction. The preview shows this exact
  // point; an impossible landing does not consume the launcher's charge.
  for(let r=4;r<=TERRITORY_CANNON_BALANCE.landingSnap;r+=4)for(let i=0;i<32;i++){
    const angle=i/32*Math.PI*2,p={x:requested.x+Math.cos(angle)*r,y:requested.y+Math.sin(angle)*r};if(legal(p))return p;
  }
}

/** Presentation is read-only, including on paused and freshly created runs. */
export function territoryCannonView(state: GameState) {
  const building = state.territory?.construction?.building;
  const definition = BUILDING_DEFINITIONS[building?.blueprintId ?? 'launch-pod'];
  const origin = building ? { x: building.x, y: building.y } : { ...TERRITORY_CANNON_BALANCE.origin };
  const owner = building && state.territory && territoryNodeAt(state.territory, building);
  const enabled = !!building && owner?.owner === 'healthy';
  const remaining = Math.max(0, (state.territory?.cannon?.readyAt ?? 0) - state.elapsed);
  return { origin, exists: !!building, enabled, buildingId: building?.id, blueprintId: building?.blueprintId,
    range: definition.range, radius: definition.radius, damage: definition.damage, reloadSeconds: definition.reloadSeconds,
    nearby: enabled && distance(state.player, origin) <= TERRITORY_CANNON_BALANCE.interactionRange + 1e-7,
    ready: enabled && !isTerritoryPlayerAirborne(state) && remaining <= 1e-7, remaining, airborne:isTerritoryPlayerAirborne(state),
    progress: Math.max(0, Math.min(1, 1 - remaining / (state.territory?.cannon?.reloadSeconds ?? definition.reloadSeconds))) };
}

export function launchTerritoryCannon(state: GameState, aim: Vec): { accepted: boolean; reason?: 'inactive' | 'range' | 'reload' | 'aim'; events: TerritoryRuleEvent[] } {
  const reject = (reason: 'inactive' | 'range' | 'reload' | 'aim') => ({ accepted: false, reason, events: [] });
  if (!state.territory || state.phase !== 'playing' || state.territory.stage === 'victory' || state.player.hp <= 0 || state.tissue.hp <= 0) return reject('inactive');
  const view = territoryCannonView(state);
  if (!view.exists || !view.enabled) return reject('inactive');
  if (!view.nearby) return reject('range');
  if (!view.ready) return reject('reload');
  const to = territoryCannonAim(state, aim);
  if (!to) return reject('aim');
  const cannon = state.territory.cannon ??= { readyAt: 0, serial: 0 };
  const id = `territory:launch:${state.tick}:${++cannon.serial}`;
  state.playerFlight = { id, from: {x:state.player.x,y:state.player.y}, to, born: state.elapsed, landsAt: state.elapsed + TERRITORY_CANNON_BALANCE.flightSeconds,
    damage: view.damage, radius: view.radius };
  state.player.moving=false;state.player.dashUntil=state.elapsed;
  state.player.facing=Math.atan2(to.y-state.player.y,to.x-state.player.x);
  cannon.readyAt = state.elapsed + view.reloadSeconds; cannon.reloadSeconds = view.reloadSeconds;
  return { accepted: true, events: [{ type: 'TERRITORY_CANNON_FIRED', data: { id, fromX: view.origin.x, fromY: view.origin.y,
    x: to.x, y: to.y, landsAt: state.playerFlight.landsAt, radius: view.radius,playerLaunched:true } }] };
}

/** Claim before damage callbacks: reentrant events cannot resolve one shell twice. */
export function takeTerritoryCannonImpact(state: GameState): TerritoryCannonShot | undefined {
  const shot = state.playerFlight;
  if (state.phase !== 'playing' || state.player.hp<=0||state.tissue.hp<=0||!shot || state.elapsed + 1e-7 < shot.landsAt) return;
  state.player.x=shot.to.x;state.player.y=shot.to.y;state.player.moving=false;
  delete state.playerFlight;
  return shot;
}
export const takeTerritoryPlayerLanding=takeTerritoryCannonImpact;

export function territoryCannonTargets(state: GameState, center: Vec, radius: number = TERRITORY_CANNON_BALANCE.radius) {
  return state.targets.filter(target => target.hp > 0 && (target.role === 'virus' || target.role === 'elite'||target.role==='nest')
    && distance(target, center) <= radius + target.radius + 1e-7)
    .sort((a, b) => a.id.localeCompare(b.id));
}
