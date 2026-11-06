import type { GameState, Vec, WorldGeometry } from './types';
import { CAMP_FACILITY_PROGRESS } from './campProgression';

export type CampStationId = 'warehouse' | 'forge' | 'shop' | 'departure' | 'summon';
export type CampCourtyardId = 'workshop' | 'supply' | 'departure';
export interface CampRect { left: number; top: number; right: number; bottom: number }
export interface CampGate { side: 'east' | 'west'; center: Vec; width: number }
export interface CampCourtyard { id: CampCourtyardId; name: string; rect: CampRect; gate: CampGate }
export interface CampFacilityDefinition {
  id: CampStationId; name: string; courtyardId: CampCourtyardId;
  position: Vec; interactionOffset: Vec; footprint: CampRect; logicalWidth: number;
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
}

export const CAMP_WALL_THICKNESS = 14;
export const CAMP_WALL_CORNER_RADIUS = 24;
export const CAMP_INTERACTION_RADIUS = 64;
export const CAMP_SPAWN: Readonly<Vec> = { x: 0, y: 270 };
export const CAMP_WORLD_BOUNDS: Readonly<CampRect> = { left: -650, top: -380, right: 650, bottom: 500 };
export const CAMP_CORE_FOOTPRINT: Readonly<CampRect> = { left: -48, top: -45, right: 48, bottom: 10 };
/** Ground coordinates relative to the heart core; shared by physics and painting. */
export const CAMP_COURTYARDS: readonly CampCourtyard[] = [
  { id: 'workshop', name: '整备院', rect: { left: -535, top: -235, right: -150, bottom: 260 },
    gate: { side: 'east', center: { x: -150, y: 100 }, width: 92 } },
  { id: 'supply', name: '补给院', rect: { left: 150, top: -235, right: 520, bottom: 30 },
    gate: { side: 'west', center: { x: 150, y: -40 }, width: 92 } },
  { id: 'departure', name: '出击院', rect: { left: 150, top: 150, right: 520, bottom: 375 },
    gate: { side: 'west', center: { x: 150, y: 250 }, width: 92 } },
];
/** Footprints describe grounded bodies, not the upright roofs or their alpha bounds. */
export const CAMP_FACILITIES: readonly CampFacilityDefinition[] = Object.values(CAMP_FACILITY_PROGRESS)
  .map(({ purpose: _purpose, section: _section, prerequisites: _prerequisites, requiredForIntro: _requiredForIntro, ...facility }) => facility);
export const CAMP_PATHS = {
  spine: { left: -85, top: 80, right: 85, bottom: 410 },
  forecourt: { left: -95, top: -110, right: 95, bottom: 115 },
  branches: [
    { left: -150, top: 54, right: -85, bottom: 146 },
    { left: 85, top: -86, right: 150, bottom: 6 },
    { left: 85, top: 204, right: 150, bottom: 296 },
  ],
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

/** The visible curb and physical wall share this open, round-ended centerline. */
export function campWallTrace(courtyard: CampCourtyard, extraClearance = 0): Vec[] {
  const { rect: r, gate } = courtyard;
  const corner = Math.min(CAMP_WALL_CORNER_RADIUS, (r.right - r.left) / 5, (r.bottom - r.top) / 5);
  const gap = gate.width / 2 + CAMP_WALL_THICKNESS / 2 + extraClearance, points: Vec[] = [];
  const add = (x: number, y: number) => points.push({ x, y });
  const line = (x: number, y: number) => {
    const previous = points[points.length - 1], count = Math.max(1, Math.ceil(Math.hypot(x - previous.x, y - previous.y) / 22));
    for (let i = 1; i <= count; i++) add(previous.x + (x - previous.x) * i / count, previous.y + (y - previous.y) * i / count);
  };
  const arc = (x: number, y: number, start: number, end: number) => {
    for (let i = 1; i <= 6; i++) { const angle = start + (end - start) * i / 6; add(x + Math.cos(angle) * corner, y + Math.sin(angle) * corner); }
  };
  if (gate.side === 'east') {
    add(r.right, gate.center.y + gap); line(r.right, r.bottom - corner);
    arc(r.right - corner, r.bottom - corner, 0, Math.PI / 2); line(r.left + corner, r.bottom);
    arc(r.left + corner, r.bottom - corner, Math.PI / 2, Math.PI); line(r.left, r.top + corner);
    arc(r.left + corner, r.top + corner, Math.PI, Math.PI * 1.5); line(r.right - corner, r.top);
    arc(r.right - corner, r.top + corner, Math.PI * 1.5, Math.PI * 2); line(r.right, gate.center.y - gap);
  } else {
    add(r.left, gate.center.y - gap); line(r.left, r.top + corner);
    arc(r.left + corner, r.top + corner, Math.PI, Math.PI * 1.5); line(r.right - corner, r.top);
    arc(r.right - corner, r.top + corner, Math.PI * 1.5, Math.PI * 2); line(r.right, r.bottom - corner);
    arc(r.right - corner, r.bottom - corner, 0, Math.PI / 2); line(r.left + corner, r.bottom);
    arc(r.left + corner, r.bottom - corner, Math.PI / 2, Math.PI); line(r.left, gate.center.y + gap);
  }
  // A gate close to a corner must not fold back from that corner's tangent
  // into its own mouth (the supply gate has only 70 units below its center).
  // Trim only the adjoining arc tail and join it to the unchanged end cap.
  const trimEnd = (trace: Vec[], lower: boolean): Vec[] => {
    const end = trace[0], safe = (point: Vec) => lower ? point.y >= end.y - 1e-9 : point.y <= end.y + 1e-9;
    if (safe(trace[1])) return trace;
    let index = 1;
    while (index < trace.length - 1 && !safe(trace[index])) index++;
    const from = trace[index - 1], to = trace[index], t = (end.y - from.y) / (to.y - from.y);
    return [end, { x: from.x + (to.x - from.x) * t, y: end.y }, ...trace.slice(index)];
  };
  return trimEnd(trimEnd(points, gate.side === 'east').reverse(), gate.side === 'west').reverse();
}

const relativeWallSegments: readonly CampWallSegment[] = CAMP_COURTYARDS.flatMap(c => {
  const points = campWallTrace(c), radius = CAMP_WALL_THICKNESS / 2;
  return points.slice(1).map((to, i) => {
    const from = points[i];
    return { courtyardId: c.id, from, to, radius,
      bounds: { left: Math.min(from.x, to.x) - radius, right: Math.max(from.x, to.x) + radius,
        top: Math.min(from.y, to.y) - radius, bottom: Math.max(from.y, to.y) + radius } };
  });
});
let wallSegmentCache: { origin: Vec; segments: readonly CampWallSegment[] } | undefined;
function wallSegmentsAt(origin: Vec): readonly CampWallSegment[] {
  if (wallSegmentCache?.origin.x === origin.x && wallSegmentCache.origin.y === origin.y) return wallSegmentCache.segments;
  const segments = relativeWallSegments.map(segment => ({ ...segment, from: translatePoint(segment.from, origin),
    to: translatePoint(segment.to, origin), bounds: translateRect(segment.bounds, origin) }));
  wallSegmentCache = { origin, segments };return segments;
}

function courtyardWalls(courtyard: CampCourtyard): CampWall[] {
  const { rect: r, gate: g, id } = courtyard, half = CAMP_WALL_THICKNESS / 2;
  const strips: [string, CampRect][] = [
    ['north', { left: r.left - half, right: r.right + half, top: r.top - half, bottom: r.top + half }],
    ['south', { left: r.left - half, right: r.right + half, top: r.bottom - half, bottom: r.bottom + half }],
  ];
  for (const side of ['west', 'east'] as const) {
    const x = side === 'west' ? r.left : r.right;
    if (g.side === side) {
      strips.push([`${side}:north`, { left: x - half, right: x + half, top: r.top, bottom: g.center.y - g.width / 2 }],
        [`${side}:south`, { left: x - half, right: x + half, top: g.center.y + g.width / 2, bottom: r.bottom }]);
    } else strips.push([side, { left: x - half, right: x + half, top: r.top, bottom: r.bottom }]);
  }
  return strips.map(([side, rect]) => ({ id: `camp-wall:${id}:${side}`, courtyardId: id, rect }));
}

export function campLayout(state: GameState): CampLayout {
  const origin = campLayoutOrigin(state);
  const arrived = state.camp?.prologue === 'arrival';
  const built = new Set(state.camp?.builtFacilities ?? CAMP_FACILITIES.map(f => f.id));
  const courtyards = CAMP_COURTYARDS.map(c => ({ ...c, rect: translateRect(c.rect, origin),
    gate: { ...c.gate, center: translatePoint(c.gate.center, origin) } }));
  const completedCourtyards = arrived ? [] : courtyards.filter(c => CAMP_FACILITIES.filter(f => f.courtyardId === c.id).every(f => built.has(f.id)));
  const completedCourtyardIds = new Set(completedCourtyards.map(c => c.id));
  const sites = (arrived ? [] : CAMP_FACILITIES).map(f => {
    const position = translatePoint(f.position, origin), { interactionOffset, ...definition } = f;
    return { ...definition, position, interactionPosition: translatePoint(interactionOffset, position), footprint: translateRect(f.footprint, position) };
  });
  return {
    origin, spawn: translatePoint(CAMP_SPAWN, origin), worldBounds: translateRect(CAMP_WORLD_BOUNDS, origin),
    coreFootprint: translateRect(arrived ? { left: -2000, top: -2000, right: -2000, bottom: -2000 } : CAMP_CORE_FOOTPRINT, origin), courtyards, completedCourtyards,
    walls: completedCourtyards.flatMap(courtyardWalls), wallSegments: wallSegmentsAt(origin).filter(wall => completedCourtyardIds.has(wall.courtyardId)),
    sites, facilities: sites.filter(f => built.has(f.id)),
    paths: { spine: translateRect(CAMP_PATHS.spine, origin), forecourt: translateRect(CAMP_PATHS.forecourt, origin),
      branches: CAMP_PATHS.branches.map(rect => translateRect(rect, origin)) },
    residents: CAMP_RESIDENTS.map(resident => ({ ...resident, home: translatePoint(resident.home, origin),
      waypoints: resident.waypoints.map(point => translatePoint(point, origin)) })),
  };
}

export function campWorldGeometry(state: GameState): WorldGeometry {
  const b = campLayout(state).worldBounds;
  return { width: Math.max(state.world?.width ?? 0, b.right + 85), height: Math.max(state.world?.height ?? 0, b.bottom + 85),
    bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, obstacles: [],
    // The former battle foreground must not obscure the central camp paths.
    foreground: { x: b.right + 1000, y: b.bottom + 1000, width: 0, height: 0 } };
}

// Keep legacy rectangular wall bounds available to existing consumers, but use
// the shared rounded centerline as the authoritative wall collision shape.
const blockers = (layout: CampLayout): readonly CampRect[] => [layout.coreFootprint, ...layout.facilities.map(f => f.footprint)];
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
  const interactionBlockers = [layout.coreFootprint, ...layout.facilities.filter(f => f.id !== ignoredStationId).map(f => f.footprint)];
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
