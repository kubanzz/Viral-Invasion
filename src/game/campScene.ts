import { distance, normalized } from '../actors/collision';
import { BALANCE, type GameState, type InputFrame, type Vec } from './types';
import { IMMUNE_CELL_BALANCE, type ImmuneCellState } from './immuneCells';
import { CAMP_INTERACTION_RADIUS, campInteractionLineClear, campLayout, campWorldGeometry, isCampPositionLegal, moveWithCampCollision,
  type CampFacility, type CampLayout, type CampStationId } from './campLayout';
import type { FarmPlot, LegionDeployment } from './legionCatalog';
import type { CampStationAttention } from './campAttention';
import { CAMP_DORMITORY_OFFSETS } from './campProgression';

export interface CampSceneState {
  introSeconds: number; introComplete: boolean; prologue?: 'arrival' | 'building' | 'ready';
  builtFacilities?: CampStationId[]; activeConstruction?: CampStationId; constructionSeconds?: number;
  attention?: Partial<Record<CampStationId, CampStationAttention>>; farmPlots?: FarmPlot[]; food?: number; legions?: LegionDeployment[];
  overview?: boolean;
  farmAction?: { kind: 'plant'; index: number; startedAt: number; duration: number };
  cropFeedback?: { index: number; kind: 'plant' | 'harvest' | 'water' | 'pests' | 'cancel' | 'ripe'; until: number; message?: string };
}

export type { CampStationId } from './campLayout';
export const CAMP_STATION_NAMES: Record<CampStationId, string> = {
  warehouse: '免疫仓库', forge: '生命锻造台', shop: '补给站', departure: '情报出击台', summon: '血流接引点',
  farm: '营养农场', house: '免疫居所',
};
/** Compatibility entry point; all consumers now share the same grounded layout. */
export function campStations(state: GameState): CampFacility[] { return [...campLayout(state).facilities]; }

function campCell(id: string, position: Vec, elapsed: number, facing = 0): ImmuneCellState {
  return { ...position, id, beaconId: 'camp:residents', organId: 'heart', facing, updatedAt: elapsed,
    born: elapsed, until: Number.MAX_SAFE_INTEGER, radius: 14, hp: IMMUNE_CELL_BALANCE.health, maxHp: IMMUNE_CELL_BALANCE.health,
    targetId: null, waypoint: null, navigationAt: 0, attackReadyAt: 0, attackUntil: 0, interval: 1, damage: 0, activity: 'guarding' };
}
function campLegionResidents(state: GameState, layout: CampLayout) {
  const home = layout.facilities.find(site => site.id === 'house')?.position;
  if (!home) return [];
  return ((state.camp as CampSceneState | undefined)?.legions ?? []).flatMap(squad => Array.from({length: squad.legionId === 'seraph' ? 4 : 3}, (_, index) => ({
    id: `camp-resident:legion:${squad.slot}:${squad.legionId}:${index}`,
    position: {x: home.x + CAMP_DORMITORY_OFFSETS[squad.slot].offset.x + (index % 2 ? 20 : -20),
      y: home.y + CAMP_DORMITORY_OFFSETS[squad.slot].offset.y + 64 + Math.floor(index / 2) * 32},
    legionId: squad.legionId, legionRole: squad.legionId === 'seraph' ? index === 0 ? 'leader' as const : 'wing' as const : 'guard' as const,
    seraphRole: squad.legionId === 'seraph' ? index === 0 ? 'commander' as const : index === 3 ? 'prism' as const : 'lancer' as const : undefined, fed: squad.fed,
  })));
}
function installCampCells(state: GameState, layout: CampLayout): void {
  if (!state.growth || !state.camp) return;
  if (state.camp.prologue === 'arrival') {
    state.growth.cells = layout.residents.map((resident, index) => campCell(`camp-escort:${resident.id}`,
      { x: state.player.x + (index % 2 ? 30 : -30), y: state.player.y + 35 + Math.floor(index / 2) * 30 }, state.elapsed));
  } else if (state.camp.activeConstruction || state.camp.builtFacilities !== undefined && !state.camp.introComplete) {
    const station = layout.sites.find(site => site.id === state.camp!.activeConstruction);
    state.growth.cells = layout.residents.map((resident, index) => {
      const desired = station ? { x: station.interactionPosition.x + (index % 2 ? 28 : -28),
        y: station.interactionPosition.y + 18 + Math.floor(index / 2) * 26 } : resident.home;
      return { ...campCell(`camp-builder:${station?.id ?? 'waiting'}:${resident.id}`,
        nearestLegalCampPosition(desired, 14, layout), state.elapsed), beaconId: 'camp:builders' };
    });
  } else if (state.camp.introComplete) {
    state.growth.cells = [...layout.residents.map(resident => campCell(`camp-resident:${resident.id}`, resident.home, state.elapsed, resident.facing)),
      ...campLegionResidents(state, layout).map(resident => ({...campCell(resident.id,resident.position,state.elapsed,-Math.PI/2), legionId: resident.legionId, legionRole: resident.legionRole, seraphRole: resident.seraphRole, fed: resident.fed,
        radius: resident.legionRole === 'leader' ? 18 : 14}))];
  } else if (state.camp.prologue === 'building') {
    state.growth.cells = layout.residents.map((resident, index) => {
      const station = layout.sites[index % layout.sites.length];
      return { ...campCell(`camp-builder:${resident.id}`, { x: station.interactionPosition.x + (index % 2 ? 25 : -25),
        y: station.interactionPosition.y + 15 }, state.elapsed), beaconId: 'camp:builders' };
    });
  } else {
    state.growth.cells = layout.facilities.filter(station => station.id !== 'summon').flatMap(station => [-1, 1].map((side, index) => ({
      ...campCell(`camp-builder:${station.id}:${index}`, { x: station.interactionPosition.x + side * 32, y: station.interactionPosition.y + 8 }, state.elapsed),
      beaconId: 'camp:builders',
    })));
  }
}

export function prepareCampScene(state: GameState, introComplete: boolean, prologue?: 'arrival' | 'building' | 'ready', builtFacilities?: readonly CampStationId[]): void {
  state.phase = 'playing'; state.result = null; state.elapsed = 0; state.tick = 0; state.targets = []; state.effects = []; state.events = [];
  delete state.visualTime;
  state.playerProjectiles = []; state.playerInfection = null; delete state.playerFlight; delete state.smartViruses; delete state.chargedSlash; delete state.traction;
  delete state.hostEvents; delete state.bladeOpening; delete state.bladeFollow; state.scanReady = 0; state.scanUntil = 0;
  state.cooldowns = { 1: 0, 2: 0, 3: 0 }; state.chargedSlashReadyAt = 0;
  state.camp = { introSeconds: 0, introComplete, ...(prologue ? { prologue } : {}), ...(builtFacilities ? { builtFacilities: [...builtFacilities] } : {}) };
  state.message = prologue === 'arrival' ? '小队抵达缓流膜湾 · 带队前往发光的锚定点，靠近按E建立前哨。'
    : '缓流膜湾 · 查看侦查情报，整备后前往微区清剿。'; state.messageUntil = 12;
  state.player.hp = 100; state.tissue.hp = 100; state.player.moving = false; state.player.dashUntil = 0; state.player.dashReady = 0;
  state.player.hurtUntil = 0; state.player.actionUntil = 0;
  if (state.growth) {
    state.growth.cells = []; state.growth.beacons = []; state.growth.beacon = null; state.growth.marks = [];
    state.growth.draft = null; state.growth.pendingResearch = null;
  }
  if (state.territory) {
    state.territory.stage = 'victory'; state.territory.campBuilt = true; state.territory.purification = null;
    delete state.territory.construction; delete state.territory.bossCombat;
    for (const node of state.territory.nodes) { node.owner = 'healthy'; node.infectionProgress = 0; node.purificationProgress = 0; }
    for (const source of Object.values(state.territory.sources)) source.destroyed = true;
  }
  const layout = campLayout(state);
  state.world = campWorldGeometry(state);
  state.player.x = layout.spawn.x; state.player.y = layout.spawn.y;
  if (state.battle) state.battle.graph.nodes = state.battle.graph.nodes.filter(node => node.kind === 'healing');
  installCampCells(state, layout);
}

function advanceResidents(state: GameState, layout: CampLayout, dt: number): void {
  if (!state.growth || !state.camp?.introComplete) return;
  const stationed = campLegionResidents(state, layout);
  if (!state.growth.cells || state.growth.cells.length !== layout.residents.length + stationed.length || state.growth.cells.some(cell => !cell.id.startsWith('camp-resident:'))
    || stationed.some(resident => !state.growth!.cells!.some(cell => cell.id === resident.id))) installCampCells(state, layout);
  const cells = state.growth.cells;
  if (!cells) return;
  for (let index = 0; index < layout.residents.length; index++) {
    const resident = layout.residents[index], cell = cells[index];
    // Station staff mostly work in place; the two path residents make short, slow trips.
    const phase = ((state.elapsed - cell.born) + index * .8) % 10;
    const start = resident.waypoints[0], end = resident.waypoints[1];
    const t = phase < 4 ? 0 : phase < 6 ? (phase - 4) / 2 : phase < 8 ? 1 : (10 - phase) / 2;
    const desired = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    const gap = distance(cell, desired), speed = Math.min(gap, 18 * dt);
    const direction = normalized(desired.x - cell.x, desired.y - cell.y);
    const position = moveWithCampCollision(cell, { x: direction.x * speed, y: direction.y * speed }, cell.radius, layout);
    const moving = distance(cell, position) > .001;
    if (moving) cell.facing = Math.atan2(position.y - cell.y, position.x - cell.x);
    else cell.facing = resident.facing;
    cell.x = position.x; cell.y = position.y; cell.updatedAt = state.elapsed;
    cell.activity = moving ? 'returning' : 'guarding'; cell.waypoint = moving ? desired : null;
    cell.targetId = null; cell.damage = 0; cell.attackUntil = 0;
  }
  for (const resident of stationed) {
    const cell = cells.find(unit => unit.id === resident.id); if (!cell) continue;
    cell.x = resident.position.x; cell.y = resident.position.y; cell.updatedAt = state.elapsed;
    cell.fed = resident.fed; cell.activity = 'guarding'; cell.damage = 0; cell.targetId = null;
  }
}

export function campBuildPoint(state: GameState): Vec {
  const { origin } = campLayout(state); return { x: origin.x, y: origin.y + 110 };
}
export function canEstablishCamp(state: GameState): boolean {
  return state.camp?.prologue === 'arrival' && distance(state.player, campBuildPoint(state)) <= 72;
}
function advanceEscort(state: GameState, layout: CampLayout, dt: number): void {
  if (!state.growth) return;
  if (state.growth.cells?.length !== 6 || !state.growth.cells.every(cell => cell.id.startsWith('camp-escort:'))) installCampCells(state, layout);
  for (const [index, cell] of (state.growth.cells ?? []).entries()) {
    const desired = { x: state.player.x + (index % 2 ? 30 : -30), y: state.player.y + 34 + Math.floor(index / 2) * 28 };
    const delta = normalized(desired.x - cell.x, desired.y - cell.y), gap = distance(cell, desired);
    const p = moveWithCampCollision(cell, { x: delta.x * Math.min(gap, BALANCE.speed * .85 * dt),
      y: delta.y * Math.min(gap, BALANCE.speed * .85 * dt) }, cell.radius, layout);
    cell.activity = gap > 4 ? 'returning' : 'guarding'; if (gap > 4) cell.facing = Math.atan2(delta.y, delta.x);
    cell.x = p.x; cell.y = p.y; cell.updatedAt = state.elapsed;
  }
}

export function advanceCampScene(state: GameState, input: InputFrame, dt: number): void {
  if (!state.camp || state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  const layout = campLayout(state);
  state.tick++; state.elapsed += dt; if (state.camp.prologue !== 'arrival') state.camp.introSeconds += dt;
  const direction = normalized(input.moveX, input.moveY);
  const position = moveWithCampCollision(state.player, { x: direction.x * BALANCE.speed * dt, y: direction.y * BALANCE.speed * dt }, state.player.radius, layout);
  state.player.moving = distance(state.player, position) > .01; state.player.x = position.x; state.player.y = position.y;
  if (state.player.moving) state.player.facing = Math.atan2(direction.y, direction.x);
  if (state.camp.prologue === 'arrival') advanceEscort(state, layout, dt);
  else if (state.camp.activeConstruction || state.camp.builtFacilities !== undefined && !state.camp.introComplete) {
    const prefix = `camp-builder:${state.camp.activeConstruction ?? 'waiting'}:`;
    if (state.growth?.cells?.length !== layout.residents.length || !state.growth.cells.every(cell => cell.id.startsWith(prefix))) installCampCells(state, layout);
  }
  else if (state.camp.prologue === 'building' && state.growth?.cells?.some(cell => cell.id.startsWith('camp-escort:'))) installCampCells(state, layout);
  else advanceResidents(state, layout, dt);
  for (const cell of state.growth?.cells ?? []) {
    if (!isCampPositionLegal(cell, cell.radius, layout)) Object.assign(cell, nearestLegalCampPosition(cell, cell.radius, layout));
  }
}

function closestFacilityPoint(point: Vec, station: CampFacility): Vec {
  const r = station.footprint;
  return { x: Math.max(r.left, Math.min(r.right, point.x)), y: Math.max(r.top, Math.min(r.bottom, point.y)) };
}

/** Distance to the grounded building edge, independent of the walking camera. */
export function campStationDistance(point: Vec, station: CampFacility): number {
  return distance(point, closestFacilityPoint(point, station));
}

function canInteractWithStation(state: GameState, station: CampFacility, layout: CampLayout): boolean {
  return isCampPositionLegal(state.player, state.player.radius, layout)
    && campStationDistance(state.player, station) <= CAMP_INTERACTION_RADIUS
    && campInteractionLineClear(state.player, closestFacilityPoint(state.player, station), layout, station.id);
}

/** Planned sites are interactable before their completed body becomes solid. */
export function canInteractCampStation(state: GameState, id: CampStationId): boolean {
  if (!state.camp || state.camp.prologue === 'arrival') return false;
  const layout = campLayout(state), station = layout.sites.find(site => site.id === id);
  return !!station && canInteractWithStation(state, station, layout);
}

/** Draws are authorized by the physical node, never by a global menu shortcut. */
export function canUseCampSummon(state: GameState): boolean {
  return !!state.camp && (state.camp.builtFacilities === undefined || state.camp.builtFacilities.includes('summon'))
    && canInteractCampStation(state, 'summon');
}

export function nearbyCampStation(state: GameState): CampFacility | undefined {
  if (!state.camp || state.camp.prologue === 'arrival') return undefined;
  const layout = campLayout(state);
  return layout.sites.filter(station => canInteractWithStation(state, station, layout))
    .sort((a, b) => campStationDistance(state.player, a) - campStationDistance(state.player, b) || a.id.localeCompare(b.id))[0];
}

function nearestLegalCampPosition(point: Vec, radius: number, layout: CampLayout): Vec {
  if (isCampPositionLegal(point, radius, layout)) return { x: point.x, y: point.y };
  const b = layout.worldBounds, margin = radius + .5;
  const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
  const candidates: Vec[] = [{ x: clamp(point.x, b.left + margin, b.right - margin), y: clamp(point.y, b.top + margin, b.bottom - margin) }];
  for (const rect of [layout.coreFootprint, ...layout.facilities.flatMap(f => f.additionalFootprints ?? (f.blocksMovement !== false ? [f.footprint] : [])),
    ...layout.plannedAreas.flatMap(area => [area.rect, area.barrier])]) {
    const left = rect.left - margin, right = rect.right + margin, top = rect.top - margin, bottom = rect.bottom + margin;
    candidates.push({ x: left, y: clamp(point.y, top, bottom) }, { x: right, y: clamp(point.y, top, bottom) },
      { x: clamp(point.x, left, right), y: top }, { x: clamp(point.x, left, right), y: bottom },
      { x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom });
  }
  for (const wall of layout.wallSegments) {
    const dx = wall.to.x - wall.from.x, dy = wall.to.y - wall.from.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    const t = clamp(((point.x - wall.from.x) * dx + (point.y - wall.from.y) * dy) / (length * length), 0, 1);
    const nearest = { x: wall.from.x + dx * t, y: wall.from.y + dy * t }, clearance = margin + wall.radius;
    for (const side of [-1, 1]) candidates.push({ x: nearest.x + side * dy / length * clearance, y: nearest.y - side * dx / length * clearance });
  }
  const closest = candidates.filter(candidate => isCampPositionLegal(candidate, radius, layout)).sort((a, c) => distance(point, a) - distance(point, c))[0];
  if (closest) return closest;
  // Overlapping new bodies or an outer world corner can defeat individual edge projections.
  for (let range = 4; range <= 1600; range += 4) {
    const count = Math.max(16, Math.ceil(range * Math.PI / 4));
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count, candidate = { x: point.x + Math.cos(angle) * range, y: point.y + Math.sin(angle) * range };
      if (isCampPositionLegal(candidate, radius, layout)) return candidate;
    }
  }
  return { ...layout.spawn };
}

/** Finishing a building or yard never leaves the player trapped inside its new collision. */
export function ensureCampPlayerLegal(state: GameState): void {
  if (!state.camp) return;
  Object.assign(state.player, nearestLegalCampPosition(state.player, state.player.radius, campLayout(state)));
}
