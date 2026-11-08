import type { GameState, Vec, WorldGeometry } from './types';
import { CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS } from './campProgression';

export type CampStationId = 'warehouse' | 'forge' | 'shop' | 'departure' | 'summon' | 'farm' | 'house';
export type CampCourtyardId = 'workshop' | 'supply' | 'departure';
export interface CampRect { left: number; top: number; right: number; bottom: number }
export interface CampGate { side: 'east' | 'west'; center: Vec; width: number }
export interface CampCourtyard { id: CampCourtyardId; name: string; rect: CampRect; gate: CampGate }
export interface CampFacilityDefinition {
  id: CampStationId; name: string; courtyardId?: CampCourtyardId;
  /** Floating service nodes have an interaction footprint without a solid body. */
  blocksMovement?: boolean;
  position: Vec; interactionOffset: Vec; footprint: CampRect; logicalWidth: number;
  additionalFootprints?: readonly CampRect[];
}
export interface CampFacility extends Omit<CampFacilityDefinition, 'interactionOffset'> { interactionPosition: Vec }
export interface CampWall { id: string; courtyardId: CampCourtyardId; rect: CampRect }
export interface CampWallSegment {
  readonly courtyardId: CampCourtyardId; readonly from: Readonly<Vec>; readonly to: Readonly<Vec>;
  readonly radius: number; readonly bounds: Readonly<CampRect>;
}
export interface CampResident { id: string; home: Vec; waypoints: readonly Vec[]; facing: number }
export interface CampLayout {
  origin: Vec; spawn: Vec; worldBounds: CampRect; coreFootprint: CampRect;
  courtyards: readonly CampCourtyard[]; completedCourtyards: readonly CampCourtyard[];
  /** Every planned location; only completed facilities contribute solid bodies. */
  sites: readonly CampFacility[]; facilities: readonly CampFacility[]; walls: readonly CampWall[];
  wallSegments: readonly CampWallSegment[];
  paths: { spine: CampRect; forecourt: CampRect; branches: readonly CampRect[] };
  residents: readonly CampResident[];
  plannedAreas: readonly CampPlannedArea[];
}
export interface CampPlannedArea {id:'breeding'|'healing'|'research';name:string;status:string;rect:CampRect;entrance:Vec;barrier:CampRect}
export { CAMP_DORMITORY_OFFSETS } from './campProgression';
export const CAMP_PLANNED_AREAS:readonly CampPlannedArea[]=[
  {id:'breeding',name:'育种园',status:'筹建中 · 尚未开放',rect:{left:-230,top:-980,right:230,bottom:-790},entrance:{x:0,y:-760},barrier:{left:-230,top:-800,right:230,bottom:-786}},
  {id:'research',name:'研究区',status:'筹建中 · 尚未开放',rect:{left:-910,top:-660,right:-690,bottom:-350},entrance:{x:-655,y:-490},barrier:{left:-698,top:-660,right:-680,bottom:-350}},
  {id:'healing',name:'疗愈林',status:'筹建中 · 尚未开放',rect:{left:690,top:-660,right:910,bottom:-350},entrance:{x:655,y:-490},barrier:{left:680,top:-660,right:698,bottom:-350}},
];
export const CAMP_LIFE_GARDEN_BOUNDS:Readonly<CampRect>={left:-590,top:-720,right:590,bottom:-270};

export const CAMP_WALL_THICKNESS = 14;
export const CAMP_WALL_CORNER_RADIUS = 24;
export const CAMP_INTERACTION_RADIUS = 64;
export const CAMP_SPAWN: Readonly<Vec> = { x: 0, y: 270 };
export const CAMP_WORLD_BOUNDS: Readonly<CampRect> = { left: -960, top: -1040, right: 960, bottom: 500 };
export const CAMP_CORE_FOOTPRINT: Readonly<CampRect> = { left: -48, top: -45, right: 48, bottom: 10 };
/** Ground coordinates relative to the heart core; shared by physics and painting. */
export const CAMP_COURTYARDS: readonly CampCourtyard[] = [
  { id: 'workshop', name: '整备院', rect: { left: -535, top: -235, right: -150, bottom: 260 },
    gate: { side: 'east', center: { x: -150, y: 100 }, width: 136 } },
  { id: 'supply', name: '补给院', rect: { left: 150, top: -235, right: 520, bottom: 30 },
    gate: { side: 'west', center: { x: 150, y: -40 }, width: 136 } },
  { id: 'departure', name: '出击院', rect: { left: 150, top: 150, right: 520, bottom: 375 },
    gate: { side: 'west', center: { x: 150, y: 250 }, width: 136 } },
];
/** Footprints describe grounded bodies, not the upright roofs or their alpha bounds. */
export const CAMP_FACILITIES: readonly CampFacilityDefinition[] = Object.values(CAMP_FACILITY_PROGRESS)
  .map(({ purpose: _purpose, section: _section, prerequisites: _prerequisites, requiredForIntro: _requiredForIntro, ...facility }) => facility);
export const CAMP_PATHS = {
  spine: { left: -85, top: 80, right: 85, bottom: 410 },
  forecourt: { left: -95, top: -110, right: 95, bottom: 115 },
  branches: [
    // Broad service fronts connect directly instead of funnelling every trip through one gate.
    { left: -440, top: 22, right: 200, bottom: 100 },
    { left: -90, top: 64, right: 395, bottom: 122 },
    { left: 85, top: -62, right: 250, bottom: 12 },
    { left: -85, top: 222, right: 240, bottom: 296 },
    { left: 200, top: 316, right: 435, bottom: 370 },
    // Both sides of the solid heart lead north to the living garden.
    { left: -142, top: -330, right: -72, bottom: 110 },
    { left: 72, top: -330, right: 142, bottom: 120 },
  ],
} as const;
/** Main living-area routes; the loop remains a secondary walk rather than the only connection. */
export const CAMP_LIFE_PATHS = {
  northSpine: { left: -38, top: -760, right: 38, bottom: -270 },
  serviceCross: { left: -555, top: -336, right: 555, bottom: -270 },
  farmAisle: { left: -360, top: -665, right: -300, bottom: -270 },
  houseApproach: { left: 288, top: -355, right: 372, bottom: -270 },
} as const;
export const CAMP_RESIDENTS: readonly CampResident[] = [
  { id: 'warehouse', home: { x: -430, y: -5 }, waypoints: [{ x: -430, y: -5 }, { x: -415, y: 7 }], facing: -.5 },
  { id: 'forge', home: { x: -235, y: 175 }, waypoints: [{ x: -235, y: 175 }, { x: -225, y: 193 }], facing: Math.PI },
  { id: 'supply', home: { x: 425, y: -40 }, waypoints: [{ x: 425, y: -40 }, { x: 410, y: -25 }], facing: Math.PI },
  { id: 'departure', home: { x: 425, y: 285 }, waypoints: [{ x: 425, y: 285 }, { x: 440, y: 300 }], facing: Math.PI },
  { id: 'forecourt', home: { x: -30, y: 180 }, waypoints: [{ x: -30, y: 180 }, { x: -30, y: 205 }], facing: -Math.PI / 2 },
  { id: 'entrance', home: { x: 30, y: 330 }, waypoints: [{ x: 30, y: 330 }, { x: 45, y: 350 }], facing: -Math.PI / 2 },
];

export function campLayoutOrigin(state: GameState): Vec {
  const core = state.territory?.nodes.find(node => node.id === 'core') ?? state.tissue;
  return { x: core.x, y: core.y };
}
const translatePoint = (point: Vec, origin: Vec): Vec => ({ x: point.x + origin.x, y: point.y + origin.y });
const translateRect = (rect: CampRect, origin: Vec): CampRect => ({
  left: rect.left + origin.x, top: rect.top + origin.y, right: rect.right + origin.x, bottom: rect.bottom + origin.y,
});

/** Open yard corners retain district identity while all four long sides stay passable.
 * The same short corner traces drive the painted curb and its physical collision. */
export function campCourtyardBoundaryTraces(courtyard: CampCourtyard): Vec[][] {
  const { rect: r } = courtyard, corner = CAMP_WALL_CORNER_RADIUS, arm = 44;
  return ([-1, 1] as const).flatMap(sx => ([-1, 1] as const).map(sy => {
    const x = sx < 0 ? r.left : r.right, y = sy < 0 ? r.top : r.bottom;
    const cx = x - sx * corner, cy = y - sy * corner;
    const points: Vec[] = [{ x, y: y - sy * arm }, { x, y: cy }];
    for (let n = 1; n <= 6; n++) {
      const angle = n / 6 * Math.PI / 2;
      points.push({ x: cx + sx * Math.cos(angle) * corner, y: cy + sy * Math.sin(angle) * corner });
    }
    points.push({ x: x - sx * arm, y });
    return points;
  }));
}
const relativeWallSegments: readonly CampWallSegment[] = CAMP_COURTYARDS.flatMap(c => {
  const radius = CAMP_WALL_THICKNESS / 2;
  return campCourtyardBoundaryTraces(c).flatMap(points => points.slice(1).map((to, i) => {
    const from = points[i];
    return { courtyardId: c.id, from, to, radius,
      bounds: { left: Math.min(from.x, to.x) - radius, right: Math.max(from.x, to.x) + radius,
        top: Math.min(from.y, to.y) - radius, bottom: Math.max(from.y, to.y) + radius } };
  }));
});
let wallSegmentCache: { origin: Vec; segments: readonly CampWallSegment[] } | undefined;
function wallSegmentsAt(origin: Vec): readonly CampWallSegment[] {
  if (wallSegmentCache?.origin.x === origin.x && wallSegmentCache.origin.y === origin.y) return wallSegmentCache.segments;
  const segments = relativeWallSegments.map(segment => ({ ...segment, from: translatePoint(segment.from, origin),
    to: translatePoint(segment.to, origin), bounds: translateRect(segment.bounds, origin) }));
  wallSegmentCache = { origin, segments };return segments;
}

export function campLayout(state: GameState): CampLayout {
  const origin = campLayoutOrigin(state);
  const arrived = state.camp?.prologue === 'arrival';
  const built = new Set(state.camp?.builtFacilities ?? INTRO_FACILITY_IDS);
  const courtyards = CAMP_COURTYARDS.map(c => ({ ...c, rect: translateRect(c.rect, origin),
    gate: { ...c.gate, center: translatePoint(c.gate.center, origin) } }));
  const completedCourtyards = arrived ? [] : courtyards.filter(c => CAMP_FACILITIES.filter(f => f.courtyardId === c.id).every(f => built.has(f.id)));
  const completedCourtyardIds = new Set(completedCourtyards.map(c => c.id));
  const planned = state.camp?.prologue === 'ready' ? CAMP_FACILITIES : CAMP_FACILITIES.filter(f => CAMP_FACILITY_PROGRESS[f.id].requiredForIntro);
  const sites = (arrived ? [] : planned).map(f => {
    const position = translatePoint(f.position, origin), { interactionOffset, ...definition } = f;
    return { ...definition, position, interactionPosition: translatePoint(interactionOffset, position), footprint: translateRect(f.footprint, position),
      ...(f.additionalFootprints?{additionalFootprints:f.additionalFootprints.map(r=>translateRect(r,position))}:{}) };
  });
  return {
    origin, spawn: translatePoint(CAMP_SPAWN, origin), worldBounds: translateRect(CAMP_WORLD_BOUNDS, origin),
    coreFootprint: translateRect(arrived ? { left: -2000, top: -2000, right: -2000, bottom: -2000 } : CAMP_CORE_FOOTPRINT, origin), courtyards, completedCourtyards,
    walls: wallSegmentsAt(origin).filter(wall => completedCourtyardIds.has(wall.courtyardId)).map((wall,index)=>({id:`camp-corner:${wall.courtyardId}:${index}`,courtyardId:wall.courtyardId,rect:wall.bounds})),
    wallSegments: wallSegmentsAt(origin).filter(wall => completedCourtyardIds.has(wall.courtyardId)),
    sites, facilities: sites.filter(f => built.has(f.id)),
    paths: { spine: translateRect(CAMP_PATHS.spine, origin), forecourt: translateRect(CAMP_PATHS.forecourt, origin),
      branches: CAMP_PATHS.branches.map(rect => translateRect(rect, origin)) },
    residents: CAMP_RESIDENTS.map(resident => ({ ...resident, home: translatePoint(resident.home, origin),
      waypoints: resident.waypoints.map(point => translatePoint(point, origin)) })),
    plannedAreas: state.camp?.prologue==='ready'?CAMP_PLANNED_AREAS.map(area=>({...area,rect:translateRect(area.rect,origin),barrier:translateRect(area.barrier,origin),entrance:translatePoint(area.entrance,origin)})):[],
  };
}

export function campWorldGeometry(state: GameState): WorldGeometry {
  const b = campLayout(state).worldBounds;
  return { width: Math.max(state.world?.width ?? 0, b.right + 85), height: Math.max(state.world?.height ?? 0, b.bottom + 85),
    bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, obstacles: [],
    // The former battle foreground must not obscure the central camp paths.
    foreground: { x: b.right + 1000, y: b.bottom + 1000, width: 0, height: 0 } };
}

// Only the short shared corner curbs block movement; service fronts remain open.
const blockers = (layout: CampLayout): readonly CampRect[] => [layout.coreFootprint, ...layout.facilities.flatMap(f => f.additionalFootprints ?? (f.blocksMovement !== false?[f.footprint]:[])),
  ...layout.plannedAreas.flatMap(area=>[area.rect,area.barrier])];
function circleTouchesRect(point: Vec, radius: number, rect: CampRect): boolean {
  const x = Math.max(rect.left, Math.min(rect.right, point.x)), y = Math.max(rect.top, Math.min(rect.bottom, point.y));
  return (point.x - x) ** 2 + (point.y - y) ** 2 < radius ** 2 - 1e-7;
}
function pointSegmentDistanceSquared(point: Readonly<Vec>, from: Readonly<Vec>, to: Readonly<Vec>): number {
  const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  return (point.x - from.x - dx * t) ** 2 + (point.y - from.y - dy * t) ** 2;
}
function circleTouchesWall(point: Vec, radius: number, wall: CampWallSegment): boolean {
  const bounds = wall.bounds;
  if (point.x + radius < bounds.left || point.x - radius > bounds.right || point.y + radius < bounds.top || point.y - radius > bounds.bottom) return false;
  return pointSegmentDistanceSquared(point, wall.from, wall.to) < (radius + wall.radius) ** 2 - 1e-7;
}
export function isCampPositionLegal(point: Vec, radius: number, layout: CampLayout): boolean {
  const b = layout.worldBounds;
  return point.x >= b.left + radius && point.x <= b.right - radius && point.y >= b.top + radius && point.y <= b.bottom - radius
    && blockers(layout).every(rect => !circleTouchesRect(point, radius, rect))
    && layout.wallSegments.every(wall => !circleTouchesWall(point, radius, wall));
}

/** Camp walls stay separate from the combat obstacle list and its render entities. */
export function moveWithCampCollision(position: Vec, delta: Vec, radius: number, layout: CampLayout): Vec {
  const result = { ...position };
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(2, radius * .25)));
  for (let i = 0; i < count; i++) {
    const x = { x: result.x + delta.x / count, y: result.y };
    if (isCampPositionLegal(x, radius, layout)) result.x = x.x;
    const y = { x: result.x, y: result.y + delta.y / count };
    if (isCampPositionLegal(y, radius, layout)) result.y = y.y;
  }
  return result;
}

/** A nearby label cannot activate a station through a courtyard wall or a building. */
export function campInteractionLineClear(from: Vec, to: Vec, layout: CampLayout, ignoredStationId?: CampStationId): boolean {
  const interactionBlockers = [layout.coreFootprint, ...layout.facilities.filter(f=>f.id!==ignoredStationId).flatMap(f=>f.additionalFootprints??(f.blocksMovement!==false?[f.footprint]:[])),
    ...layout.plannedAreas.flatMap(area=>[area.rect,area.barrier])];
  return interactionBlockers.every(rect => {
    let enter = 0, exit = 1;
    for (const axis of ['x', 'y'] as const) {
      const start = from[axis], delta = to[axis] - start;
      const min = axis === 'x' ? rect.left : rect.top, max = axis === 'x' ? rect.right : rect.bottom;
      if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return true; }
      else { const a = (min - start) / delta, b = (max - start) / delta; enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b)); }
      if (enter > exit) return true;
    }
    return exit < 0 || enter > 1;
  }) && layout.wallSegments.every(wall => segmentDistanceSquared(from, to, wall.from, wall.to) >= wall.radius ** 2 - 1e-7);
}

function segmentDistanceSquared(a: Readonly<Vec>, b: Readonly<Vec>, c: Readonly<Vec>, d: Readonly<Vec>): number {
  const cross = (p: Readonly<Vec>, q: Readonly<Vec>, r: Readonly<Vec>) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x)
    && Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y)
    && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return 0;
  return Math.min(pointSegmentDistanceSquared(a, c, d), pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b), pointSegmentDistanceSquared(d, a, b));
}
