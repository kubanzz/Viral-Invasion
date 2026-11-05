import { territoryMarkerView } from '../game/territoryPresentation';
import { territoryMarkerLayouts, queueTerritoryMarkerLabels } from './territoryMarkers';
import { boundedRegionPolygon, TERRITORY_BALANCE, TERRITORY_LANES, territoryInvaderGoal, territoryLaneViews, territoryNodeAt, territoryNodeView } from '../game/territory';
import { activeWorld, type GameState, type Vec, type WorldGeometry } from '../game/types';
import type { TerritoryLaneView, TerritoryNode, TerritoryNodeView, TerritoryState } from '../game/territoryTypes';
import type { LabelRect, SceneLabelSink } from './sceneLabels';

export const FANTASY_ART = {
  healthyFloor: 'fantasy.floor.healthy', infectedFloor: 'fantasy.floor.infected',
  tree: { healthy: 'fantasy.tree.healthy', infected: 'fantasy.tree.infected' },
  rock: { healthy: 'fantasy.rock.healthy', infected: 'fantasy.rock.infected' },
  healing: { healthy: 'fantasy.healing.healthy', infected: 'fantasy.healing.infected' },
  front: { healthy: 'fantasy.rock.healthy', infected: 'fantasy.rock.infected' },
  core: { healthy: 'fantasy.core.healthy', infected: 'fantasy.core.infected' },
  source: 'fantasy.source.active',
  patches: ['fantasy.infection.patch.a', 'fantasy.infection.patch.b'],
  edges: ['fantasy.infection.edge.a', 'fantasy.infection.edge.b'],
} as const;
const TAU = Math.PI * 2;
const PADDING = 180;
const MAX_GROUND_TEXTURE = 2048;
export const FANTASY_SOURCE_CANVAS = { width: 1024, height: 1024 } as const;
export const FANTASY_SOURCE_ANCHOR = { x: 512, y: 1024 * .85 } as const;
/** The single authored source uses a deliberately sparse canvas (226px body).
 * One semantic scale restores its ~75-unit body; HP/state never renormalize it. */
export const FANTASY_SOURCE_CANVAS_FACTOR = 10;

export function fantasySceneryId(state: GameState, kind: 'tree' | 'rock', owner: TerritoryNode['owner']): string {
  return state.battle?.organId === 'lung' ? `fantasy.lung.${kind}.${owner}` : FANTASY_ART[kind][owner];
}

/** Heart territory never leaks into a different arena or a training fixture. */
export function visibleTerritory(state: GameState): TerritoryState | undefined {
  return state.battle?.organId === 'heart' && state.endless ? state.territory : undefined;
}

export interface FantasyRegion extends Vec { id: string; kind: string; owner: TerritoryNode['owner'] }

/** Legacy organs keep their actual graph sites after source deactivation. This
 * is a disposable read-only paint view, never a second gameplay territory. */
export function fantasyRegions(state: GameState): readonly FantasyRegion[] {
  if (state.phase === 'menu') return [];
  const territory = visibleTerritory(state); if (territory) return territory.nodes;
  return (state.battle?.graph?.nodes ?? []).map(node => ({ id: node.id, kind: node.kind, x: node.x, y: node.y,
    owner: node.kind === 'healing' ? (node.infection ?? 0) >= 100 ? 'infected' : 'healthy'
      : node.kind === 'source' ? node.active && node.infected ? 'infected' : 'healthy'
        : node.infected ? 'infected' : 'healthy' }));
}

function nearestRegion(regions: readonly FantasyRegion[], position: Vec): FantasyRegion | undefined {
  let best: FantasyRegion | undefined, bestDistance = Infinity;
  for (const region of regions) {
    const distance = Math.hypot(region.x - position.x, region.y - position.y);
    if (distance < bestDistance || distance === bestDistance && best && region.id.localeCompare(best.id) < 0) { best = region; bestDistance = distance; }
  }
  return best;
}

export function fantasyOwnerAt(state: GameState, position: Vec): TerritoryNode['owner'] {
  const territory = visibleTerritory(state);
  return territory ? territoryNodeAt(territory, position)?.owner ?? 'healthy' : nearestRegion(fantasyRegions(state), position)?.owner ?? 'healthy';
}

/** Only terrain geometry and committed ownership invalidate this raster. */
export function fantasyGroundKey(state: GameState, artSignature = ''): string {
  const world = activeWorld(state), b = world.bounds;
  return [artSignature, state.battle?.organId ?? 'training', world.width, world.height,
    b.left, b.top, b.right, b.bottom,
    ...fantasyRegions(state).flatMap(node => [node.id, node.x, node.y, node.owner])].join(':');
}

export function fantasyObstacleKind(id: string): 'tree' | 'rock' {
  let value = 0;
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value % 2 ? 'tree' : 'rock';
}

export function traceTerritoryPolygon(ctx: CanvasRenderingContext2D, polygon: readonly Vec[]): void {
  ctx.beginPath();
  for (const [index, point] of polygon.entries()) {
    if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

export interface FantasyRegionGeometry {
  readonly id: string; readonly polygon: readonly Vec[];
  readonly bounds: { left: number; top: number; right: number; bottom: number };
  readonly radius: number;
}

/** Progress and ownership do not change the shared Voronoi geometry. One
 * bounded snapshot serves live fronts and committed terrain without per-frame clipping work. */
export class FantasyTerritoryGeometryCache {
  private key = '';
  private revisions = 0;
  private readonly regions = new Map<string, FantasyRegionGeometry>();
  prepare(regions: readonly FantasyRegion[], bounds: WorldGeometry['bounds']): ReadonlyMap<string, FantasyRegionGeometry> {
    const key = [bounds.left, bounds.top, bounds.right, bounds.bottom,
      ...regions.map(node => `${node.id}:${node.x}:${node.y}`).sort()].join('|');
    if (key !== this.key) {
      this.regions.clear();
      for (const node of regions) {
        const polygon = boundedRegionPolygon(regions, node.id, bounds);
        if (!polygon.length) continue;
        this.regions.set(node.id, { id: node.id, polygon,
          bounds: { left: Math.min(...polygon.map(p => p.x)), top: Math.min(...polygon.map(p => p.y)),
            right: Math.max(...polygon.map(p => p.x)), bottom: Math.max(...polygon.map(p => p.y)) },
          radius: Math.max(...polygon.map(p => Math.hypot(p.x - node.x, p.y - node.y))) });
      }
      this.key = key; this.revisions++;
    }
    return this.regions;
  }
  diagnostics() { return { key: this.key, revisions: this.revisions, regionCount: this.regions.size }; }
}

function tile(ctx: CanvasRenderingContext2D, image: CanvasImageSource | undefined,
  world: WorldGeometry, owner: TerritoryNode['owner']): void {
  const left = -PADDING, top = -PADDING, width = world.width + PADDING * 2, height = world.height + PADDING * 2;
  ctx.fillStyle = owner === 'healthy' ? '#c5b2a0' : '#82788d';
  ctx.fillRect(left, top, width, height);
  if (image) {
    // Author-painted flat tiles remain world-anchored; camera motion never
    // resamples/rebuilds the ownership mask or grades the approved colours.
    const size = 640;
    for (let y = top; y < top + height; y += size) for (let x = left; x < left + width; x += size)
      ctx.drawImage(image, x, y, size, size);
    return;
  }
  // A quiet geometry-only fallback while an authored image is unavailable.
  // It never impersonates a wall, actor, tree or generated painted asset.
  ctx.strokeStyle = owner === 'healthy' ? '#9ab6a62b' : '#62596f33'; ctx.lineWidth = 2;
  for (let y = top + 70; y < top + height; y += 180) {
    ctx.beginPath(); ctx.moveTo(left, y);
    ctx.bezierCurveTo(width * .25, y + 45, width * .65, y - 45, width, y + 12); ctx.stroke();
  }
}

/** One shared world-space ground producer for native, menu and 2D fallback. */
export class FantasyGroundCache {
  private readonly canvas = document.createElement('canvas');
  private key = '';
  private revisions = 0;
  private readonly imageIds = new Set<string>();
  private readonly geometry = new FantasyTerritoryGeometryCache();
  prepare(state: GameState, artSignature = '', image?: (id: string) => CanvasImageSource | undefined) {
    const key = fantasyGroundKey(state, artSignature), world = activeWorld(state), regions = fantasyRegions(state);
    const geometry = this.geometry.prepare(regions, world.bounds);
    const width = world.width + PADDING * 2, height = world.height + PADDING * 2;
    const pixelScale = Math.min(1, MAX_GROUND_TEXTURE / Math.max(width, height));
    const dirty = key !== this.key;
    if (dirty) {
      this.imageIds.clear();
      const getImage = (id: string) => { const result = image?.(id); if (result) this.imageIds.add(id); return result; };
      this.canvas.width = Math.ceil(width * pixelScale);
      this.canvas.height = Math.ceil(height * pixelScale);
      const ctx = this.canvas.getContext('2d')!;
      ctx.scale(pixelScale, pixelScale);
      ctx.translate(PADDING, PADDING);
      const lung = state.battle?.organId === 'lung';
      tile(ctx, lung ? getImage('fantasy.lung.floor.healthy') ?? getImage(FANTASY_ART.healthyFloor) : getImage(FANTASY_ART.healthyFloor), world, 'healthy');
      for (const node of regions) {
        if (node.owner !== 'infected') continue;
        const polygon = geometry.get(node.id)?.polygon ?? [];
        ctx.save(); traceTerritoryPolygon(ctx, polygon); ctx.clip();
        tile(ctx, lung ? getImage('fantasy.lung.floor.infected') ?? getImage(FANTASY_ART.infectedFloor) : getImage(FANTASY_ART.infectedFloor), world, 'infected');
        if (visibleTerritory(state)) { ctx.fillStyle = '#cf4e6020'; ctx.fillRect(0, 0, world.width, world.height); }
        ctx.restore();
        if (visibleTerritory(state)) { ctx.save(); traceTerritoryPolygon(ctx, polygon); ctx.strokeStyle = '#a8485c99'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore(); }
        const patch = getImage(FANTASY_ART.patches[node.kind === 'source' ? 1 : 0]);
        if (patch) {
          ctx.save(); traceTerritoryPolygon(ctx, polygon); ctx.clip();
          ctx.drawImage(patch, node.x - 150, node.y - 150, 300, 300); ctx.restore();
        }
      }
      if (visibleTerritory(state)) for (const node of regions) {
        const polygon = geometry.get(node.id)?.polygon;
        if (!polygon?.length || node.kind === 'source') continue;
        ctx.save(); traceTerritoryPolygon(ctx, polygon); ctx.clip();
        tissueVeins(ctx, node, node.owner === 'healthy' ? '#a4c9ad88' : '#5c466c99', 235, node.owner === 'infected');
        ctx.restore();
      }
      this.boundaries(ctx, regions, world.bounds, geometry, getImage);
      const b = world.bounds;
      ctx.strokeStyle = '#697b7050'; ctx.lineWidth = 2;
      ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
      this.key = key; this.revisions++;
    }
    return { canvas: this.canvas, x: -PADDING, y: -PADDING, width, height, dirty, key, revisions: this.revisions };
  }
  diagnostics() { return { key: this.key, revisions: this.revisions, width: this.canvas.width, height: this.canvas.height, imageIds: [...this.imageIds], geometry: this.geometry.diagnostics() }; }

  private boundaries(ctx: CanvasRenderingContext2D, regions: readonly FantasyRegion[], bounds: WorldGeometry['bounds'], geometry: ReadonlyMap<string, FantasyRegionGeometry>, image?: (id: string) => CanvasImageSource | undefined): void {
    for (const node of regions) {
      if (node.owner !== 'infected') continue;
      const polygon = geometry.get(node.id)?.polygon ?? [];
      for (let i = 0; i < polygon.length; i++) {
        const from = polygon[i], to = polygon[(i + 1) % polygon.length];
        const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
        if (length < 1) continue;
        const normal = { x: -dy / length, y: dx / length }, mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const inside = (p: Vec) => p.x > bounds.left && p.x < bounds.right && p.y > bounds.top && p.y < bounds.bottom;
        const a = { x: mid.x + normal.x * 2, y: mid.y + normal.y * 2 }, b = { x: mid.x - normal.x * 2, y: mid.y - normal.y * 2 };
        if (!inside(a) || !inside(b) || nearestRegion(regions, a)?.owner === nearestRegion(regions, b)?.owner) continue;
        const edge = image?.(FANTASY_ART.edges[i % 2]);
        if (edge) {
          ctx.save(); traceTerritoryPolygon(ctx, polygon); ctx.clip();
          const sections = Math.max(1, Math.ceil(length / 120));
          for (let n = 0; n < sections; n++) {
            ctx.save(); ctx.translate(from.x + dx * (n + .5) / sections, from.y + dy * (n + .5) / sections);
            ctx.rotate(Math.atan2(dy, dx)); ctx.drawImage(edge, -length / sections / 2, -64, length / sections + 1, 128); ctx.restore();
          }
          ctx.restore();
        }
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = '#b4cfad88'; ctx.lineWidth = 3; ctx.stroke();
        // A shallow irregular fringe hugs the real ownership edge. It remains
        // below actors and cannot be confused with a collision barrier.
        ctx.beginPath(); ctx.moveTo(from.x, from.y);
        const steps = Math.ceil(length / 20);
        for (let n = 1; n <= steps; n++) {
          const fraction = n / steps, offset = n === steps ? 0 : (n % 2 ? 4 : -3);
          ctx.lineTo(from.x + dx * fraction + normal.x * offset, from.y + dy * fraction + normal.y * offset);
        }
        ctx.strokeStyle = '#66537499'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
}

function tissueVeins(ctx: CanvasRenderingContext2D, node: Vec, color: string, radius: number, broken = false): void {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let index = 0; index < 7; index++) {
    const angle = .19 + index * TAU / 7, x = Math.cos(angle), y = Math.sin(angle), reach = radius * (.7 + (index % 3) * .13);
    const start = broken ? .35 : .08, end = broken ? .8 : 1;
    ctx.beginPath(); ctx.moveTo(node.x + x * reach * start, node.y + y * reach * start);
    ctx.bezierCurveTo(node.x + x * reach * .35 - y * 15, node.y + y * reach * .35 + x * 15,
      node.x + x * reach * .7 + y * 12, node.y + y * reach * .7 - x * 12, node.x + x * reach * end, node.y + y * reach * end); ctx.stroke();
    for (const side of [-1, 1]) {
      const branch = angle + side * .42;
      ctx.beginPath(); ctx.moveTo(node.x + x * reach * .54, node.y + y * reach * .54);
      ctx.quadraticCurveTo(node.x + x * reach * .65 + Math.cos(branch) * 22, node.y + y * reach * .65 + Math.sin(branch) * 22,
        node.x + x * reach * .54 + Math.cos(branch) * reach * .3, node.y + y * reach * .54 + Math.sin(branch) * reach * .3); ctx.stroke();
    }
  }
  ctx.restore();
}

export interface TerritoryViewport {
  width: number; height: number; scale: number; project: (point: Vec) => Vec; blocked?: readonly LabelRect[];
}
export interface TerritoryRenderFrame {
  nodes: readonly TerritoryNodeView[]; lanes: readonly TerritoryLaneView[];
  geometry: ReadonlyMap<string, FantasyRegionGeometry>;
}
const defaultGeometry = new FantasyTerritoryGeometryCache();
export function territoryRenderFrame(state: GameState, cache = defaultGeometry): TerritoryRenderFrame | undefined {
  const territory = visibleTerritory(state); if (!territory || state.phase === 'menu') return;
  return { nodes: territory.nodes.flatMap(node => { const view = territoryNodeView(state, node); return view ? [view] : []; }),
    lanes: territoryLaneViews(state), geometry: cache.prepare(territory.nodes, activeWorld(state).bounds) };
}
const ratio = (progress: number) => Math.max(0, Math.min(1, Number.isFinite(progress) ? progress / 100 : 0));
const onScreen = (point: Vec, viewport?: TerritoryViewport) => !viewport || (() => { const p = viewport.project(point); return p.x >= 0 && p.x <= viewport.width && p.y >= 0 && p.y <= viewport.height; })();

/** The leading plane travels from the real attacker's side of the cached
 * region to its node. No simulation clock manufactures capture progress. */
export function territoryCaptureFront(node: Vec, geometry: FantasyRegionGeometry, incoming: Vec, progress: number) {
  const dx = node.x - incoming.x, dy = node.y - incoming.y, length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const axis = { x: dx / length, y: dy / length }, entry = Math.min(...geometry.polygon.map(p => (p.x - node.x) * axis.x + (p.y - node.y) * axis.y));
  const cut = entry * (1 - ratio(progress));
  return { angle: Math.atan2(axis.y, axis.x), entry, cut, axis, tip: { x: node.x + axis.x * cut, y: node.y + axis.y * cut } };
}

function drawLiveRegion(ctx: CanvasRenderingContext2D, view: TerritoryNodeView, geometry: FantasyRegionGeometry, low: boolean): void {
  const node = view.node, purifying = node.owner === 'infected' && view.purificationProgress > 0;
  if (node.owner === 'healthy' && view.infectionProgress <= 0 || node.owner === 'infected' && !purifying) return;
  ctx.save(); traceTerritoryPolygon(ctx, geometry.polygon); ctx.clip();
  if (purifying) {
    const radius = geometry.radius * Math.sqrt(ratio(view.purificationProgress));
    ctx.beginPath(); ctx.ellipse(node.x, node.y, radius, radius, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = '#b5d9b65c'; ctx.fillRect(geometry.bounds.left, geometry.bounds.top, geometry.bounds.right - geometry.bounds.left, geometry.bounds.bottom - geometry.bounds.top);
    tissueVeins(ctx, node, '#d4edc8c9', Math.max(45, radius), false);
    ctx.beginPath(); ctx.ellipse(node.x, node.y, Math.max(1, radius - 2), Math.max(1, radius - 2), 0, 0, TAU);
    ctx.strokeStyle = view.pausedReason ? '#c7d0b9' : '#d5edc5'; ctx.lineWidth = 4; ctx.setLineDash(view.pausedReason ? [5, 7] : []); ctx.stroke();
  } else {
    const front = view.incomingFrom && territoryCaptureFront(node, geometry, view.incomingFrom, view.infectionProgress);
    if (front) {
      ctx.translate(node.x, node.y); ctx.rotate(front.angle); const extent = geometry.radius + 5;
      ctx.fillStyle = '#cf4f6250'; ctx.fillRect(front.entry - 4, -extent, front.cut - front.entry + 4, extent * 2);
      const count = low ? 4 : 7;
      for (let index = 0; index < count; index++) {
        const y = (index / Math.max(1, count - 1) - .5) * extent * 1.6;
        ctx.beginPath(); ctx.moveTo(front.entry, y); ctx.bezierCurveTo(front.entry + (front.cut - front.entry) * .35, y + 15,
          front.entry + (front.cut - front.entry) * .7, y - 14, front.cut, y);
        ctx.strokeStyle = '#b44d66b3'; ctx.lineWidth = 4; ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(front.cut, -extent);
      for (let y = -extent + 16, index = 0; y <= extent + 16; y += 16, index++) ctx.lineTo(front.cut + (index % 2 ? -4 : 5), y);
      ctx.strokeStyle = '#f0a0a9'; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#765380'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      // After attackers are gone, show retained infection receding locally;
      // an unwitnessed attack direction is never invented from a static owner.
      tissueVeins(ctx, node, '#8b6c9caa', 60 + ratio(view.infectionProgress) * 150, true);
    }
  }
  ctx.restore();
}

function drawLane(ctx: CanvasRenderingContext2D, lane: TerritoryLaneView, frame: TerritoryRenderFrame, low: boolean, state: GameState): void {
  const path = TERRITORY_LANES.find(item => item.id === lane.laneId)?.path ?? [];
  const nodes = path.flatMap(id => { const node = frame.nodes.find(view => view.node.id === id)?.node; return node ? [node] : []; });
  if (nodes.length !== 4) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let index = 0; index < nodes.length - 1; index++) {
    const a = nodes[index], b = nodes[index + 1], infected = a.owner === 'infected' && b.owner === 'infected';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = '#6b776b45'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = infected ? '#92709caa' : '#bad4b6a6'; ctx.lineWidth = 2.5; ctx.setLineDash(infected ? [] : [9, 8]); ctx.stroke(); ctx.setLineDash([]);
    const angle = Math.atan2(b.y - a.y, b.x - a.x), length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let distance = 55; distance < length - 35; distance += 100) {
      const x = a.x + Math.cos(angle) * distance, y = a.y + Math.sin(angle) * distance;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, 0); ctx.lineTo(-5, 4);
      ctx.strokeStyle = infected ? '#bda0c5bb' : '#b6ccaea3'; ctx.lineWidth = 1.7; ctx.stroke(); ctx.restore();
    }
  }
  const source = lane.source.node, suppliers = lane.shielded ? [lane.front.node, lane.healing.node].filter(node => node.owner === 'infected') : [];
  for (const supplier of suppliers.length ? suppliers : [lane.front.node]) {
    ctx.beginPath(); ctx.moveTo(supplier.x, supplier.y); ctx.quadraticCurveTo((source.x + supplier.x) / 2, (source.y + supplier.y) / 2 - 28, source.x, source.y);
    ctx.strokeStyle = lane.shielded ? '#8d5f9ccf' : '#c8d8bca3'; ctx.lineWidth = lane.shielded ? 6 : 2; ctx.setLineDash(lane.shielded ? [] : [5, 18]); ctx.stroke(); ctx.setLineDash([]);
    if (lane.shielded && !low) {
      const p = (state.visualTime ?? state.elapsed) % 1;
      ctx.beginPath(); ctx.ellipse(supplier.x + (source.x - supplier.x) * p, supplier.y + (source.y - supplier.y) * p, 3, 3, 0, 0, TAU);
      ctx.fillStyle = '#d4b1dc'; ctx.fill();
    }
  }
  ctx.restore();
}

/** Live progress/health signals are separate from the cached ownership mask. */
export function drawTerritorySignals(ctx: CanvasRenderingContext2D, state: GameState, low = false, frame = territoryRenderFrame(state)): void {
  const territory = visibleTerritory(state); if (!territory) return;
  if (frame) {
    for (const lane of frame.lanes) drawLane(ctx, lane, frame, low, state);
    for (const view of frame.nodes) { const geometry = frame.geometry.get(view.node.id); if (geometry) drawLiveRegion(ctx, view, geometry, low); }
  }
  for (const node of territory.nodes) {
    const signal = territoryMarkerView(state, node);
    if (signal.alert) {
      const pulse = low ? 0 : signal.alertAge % 1;
      ctx.save(); ctx.strokeStyle = '#dc586b'; ctx.lineWidth = low ? 3 : 4 * (1 - pulse * .45);
      ctx.globalAlpha = low ? .8 : 1 - pulse * .65;
      ctx.beginPath(); ctx.ellipse(node.x, node.y, 58 + pulse * 38, 58 + pulse * 38, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    if (node.kind === 'healing' && node.owner === 'healthy') {
      const treating = territory.healingContact.nodeId === node.id;
      ctx.save(); ctx.setLineDash(treating ? [9, 5] : [4, 10]); ctx.lineWidth = treating ? 3 : 1.5;
      ctx.strokeStyle = treating ? '#c0eac3dd' : '#5c917099'; ctx.beginPath();
      ctx.ellipse(node.x, node.y, TERRITORY_BALANCE.healingRange, TERRITORY_BALANCE.healingRange, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    const progress = node.owner === 'infected' ? node.purificationProgress : node.infectionProgress;
    if (progress <= 0) continue;
    ctx.save(); ctx.lineWidth = 3;
    ctx.strokeStyle = node.owner === 'infected' ? '#bde5b4' : '#a77bb7';
    ctx.beginPath(); ctx.ellipse(node.x, node.y, 55, 55, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, progress / 100)); ctx.stroke(); ctx.restore();
  }
  const contact = territory.healingContact;
  if (!contact.nodeId) return;
  const node = territory.nodes.find(item => item.id === contact.nodeId);
  if (!node || node.owner !== 'healthy') return;
  const time = state.visualTime ?? state.elapsed;
  ctx.save(); ctx.strokeStyle = (contact.healed ?? 0) > 0 ? '#d1f8c9' : '#bdebc7aa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(state.player.x, state.player.y, 27, 27, 0, 0, TAU); ctx.stroke();
  const healed = (state.events ?? []).some(event => event.type === 'TERRITORY_PLAYER_HEALED' && event.data.nodeId === node.id
    && Number(event.data.amount) > 0 && state.tick >= event.tick && state.tick - event.tick <= 20);
  if (healed) {
    const phase = time % 1;
    const particles = low ? 1 : 3;
    for (let i=0;i<particles;i++) {
      const t=(phase+i/particles)%1;
      ctx.fillStyle='#d7f4c9aa';ctx.beginPath();
      ctx.ellipse(node.x+(state.player.x-node.x)*t,node.y+(state.player.y-node.y)*t,2.2,2.2,0,0,TAU);ctx.fill();
    }
    ctx.globalAlpha = 1 - phase; ctx.fillStyle = '#d8f4d1';
    ctx.fillRect(state.player.x - 6, state.player.y - 30 - phase * 25, 12, 3);
    ctx.fillRect(state.player.x - 1.5, state.player.y - 34.5 - phase * 25, 3, 12);
  }
  ctx.restore();
}

/** World captions contain state only. The single HUD context owns action
 * instructions and the complete purification pause reason. */
export function drawTerritoryNodeAccents(ctx: CanvasRenderingContext2D, state: GameState, frame: TerritoryRenderFrame | undefined,
  viewport: TerritoryViewport, labels: SceneLabelSink, touch = false): string[] {
  if (!frame) return [];
  for (const lane of frame.lanes) {
    const source = state.targets.find(target => target.hp > 0 && target.role === 'source' && target.territorySourceId === lane.sourceId);
    if (!source || !lane.shielded) continue;
    ctx.save(); ctx.translate(source.x, source.y); ctx.scale(1, 1 / .72);
    ctx.beginPath(); ctx.ellipse(0, -33, 48, 53, 0, 0, TAU); ctx.strokeStyle = '#e0cadb'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#80548c'; ctx.lineWidth = 2.5; ctx.stroke();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 36, -70); ctx.lineTo(side * 43, -53); ctx.lineTo(side * 36, -37); ctx.stroke(); }
    ctx.restore();
  }
  return queueTerritoryMarkerLabels(state, territoryMarkerLayouts(state, frame, viewport, touch), viewport, labels);
}

export interface TerritoryAttackIndicator { nodeId: string; screen: Vec; angle: number; labelY: number | null; rect: LabelRect }
/** Screen-space arrows are exclusively for real attacks outside the viewport.
 * Static infected sites and scheduled future squads never enter this list. */
export function territoryAttackIndicators(frame: TerritoryRenderFrame | undefined, viewport: TerritoryViewport): TerritoryAttackIndicator[] {
  if (!frame) return [];
  const blocked = viewport.blocked ?? [], safe = { left: 22, right: viewport.width - 22, top: 22, bottom: viewport.height - 22 };
  for (const rect of blocked) {
    if (rect.right - rect.left < viewport.width * .5) continue;
    if (rect.top <= 8) safe.top = Math.max(safe.top, rect.bottom + 18);
    if (rect.bottom >= viewport.height - 8) safe.bottom = Math.min(safe.bottom, rect.top - 18);
  }
  if (safe.bottom < safe.top + 30) { safe.top = 40; safe.bottom = viewport.height - 40; }
  const center = { x: (safe.left + safe.right) / 2, y: (safe.top + safe.bottom) / 2 }, result: TerritoryAttackIndicator[] = [];
  const overlaps = (a: LabelRect, b: LabelRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const view of frame.nodes) {
    const attacked = view.infecting || view.node.kind === 'core' && view.attackerIds.length > 0 || view.purificationActive && view.pausedReason === 'invader';
    if (!attacked || onScreen(view.node, viewport)) continue;
    const p = viewport.project(view.node), dx = p.x - center.x, dy = p.y - center.y;
    const fraction = Math.min(Math.abs(dx) < 1e-6 ? Infinity : (safe.right - safe.left) / 2 / Math.abs(dx),
      Math.abs(dy) < 1e-6 ? Infinity : (safe.bottom - safe.top) / 2 / Math.abs(dy));
    const base = { x: center.x + dx * fraction, y: center.y + dy * fraction };
    const vertical = Math.abs(base.x - safe.left) < 1 || Math.abs(base.x - safe.right) < 1;
    const candidates: Vec[] = [], candidateKeys = new Set<string>();
    const addCandidate = (point: Vec) => {
      const key = `${point.x.toFixed(2)}:${point.y.toFixed(2)}`;
      if (!candidateKeys.has(key)) { candidateKeys.add(key); candidates.push(point); }
    };
    for (const shift of [0, 40, -40, 80, -80, 120, -120]) addCandidate({
      x: Math.max(safe.left, Math.min(safe.right, base.x + (vertical ? 0 : shift))),
      y: Math.max(safe.top, Math.min(safe.bottom, base.y + (vertical ? shift : 0))) });
    // The nearest edge can be fully covered by a compact HUD. Search all four
    // edges before dropping a real attack; the arrow still points at its node.
    const perimeter: Vec[] = [];
    for (let y = safe.top; y <= safe.bottom; y += 24) perimeter.push({ x: safe.left, y }, { x: safe.right, y });
    for (let x = safe.left; x <= safe.right; x += 24) perimeter.push({ x, y: safe.top }, { x, y: safe.bottom });
    perimeter.push({ x: safe.left, y: safe.bottom }, { x: safe.right, y: safe.bottom });
    perimeter.sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y)).forEach(addCandidate);
    let chosen: { screen: Vec; labelY: number | null; rect: LabelRect } | undefined;
    for (const screen of candidates) {
      const above = screen.y > viewport.height - 50, labelY = screen.y + (above ? -17 : 23);
      const rect = { left: Math.max(2, screen.x - (screen.x > viewport.width - 60 ? 76 : screen.x < 60 ? 12 : 36)),
        right: Math.min(viewport.width - 2, screen.x + (screen.x < 60 ? 76 : screen.x > viewport.width - 60 ? 12 : 36)),
        top: screen.y - (above ? 29 : 12), bottom: screen.y + (above ? 12 : 27) };
      if (blocked.some(block => overlaps(rect, block)) || result.some(item => overlaps(rect, item.rect))) continue;
      chosen = { screen, labelY, rect }; break;
    }
    // A crowded compact HUD may leave room for direction but not a caption.
    if (!chosen) for (const screen of candidates) {
      const rect = { left: screen.x - 11, right: screen.x + 11, top: screen.y - 11, bottom: screen.y + 11 };
      if (blocked.some(block => overlaps(rect, block)) || result.some(item => overlaps(rect, item.rect))) continue;
      chosen = { screen, labelY: null, rect }; break;
    }
    if (chosen) result.push({ nodeId: view.node.id, ...chosen, angle: Math.atan2(p.y - chosen.screen.y, p.x - chosen.screen.x) });
  }
  return result;
}
export function drawTerritoryAttackIndicators(ctx: CanvasRenderingContext2D, frame: TerritoryRenderFrame | undefined, viewport: TerritoryViewport): TerritoryAttackIndicator[] {
  const indicators = territoryAttackIndicators(frame, viewport);
  for (const indicator of indicators) {
    const view = frame!.nodes.find(item => item.node.id === indicator.nodeId)!;
    ctx.save(); ctx.translate(indicator.screen.x, indicator.screen.y); ctx.rotate(indicator.angle);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = view.node.kind === 'core' ? '#b8676c' : '#9864a5'; ctx.fill(); ctx.strokeStyle = '#f1e5cf'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    if (indicator.labelY === null) continue;
    const name = view.node.name.replace('侧生命泉', '泉').replace('前庭组织', '前庭');
    ctx.save(); ctx.font = '600 10px "Microsoft YaHei",sans-serif'; ctx.textAlign = indicator.screen.x < 60 ? 'left' : indicator.screen.x > viewport.width - 60 ? 'right' : 'center';
    ctx.strokeStyle = '#f1e5cf'; ctx.lineWidth = 3; ctx.strokeText(`${name}受袭`, indicator.screen.x, indicator.labelY);
    ctx.fillStyle = '#69456f'; ctx.fillText(`${name}受袭`, indicator.screen.x, indicator.labelY); ctx.restore();
  }
  return indicators;
}

/** At most two real specialists, using the same current destination as rules. */
export function territoryInvaderMarkers(state: GameState) {
  if (!visibleTerritory(state)) return [];
  return state.targets.filter(target => target.hp > 0 && (target.role === 'virus' || target.role === 'elite') && target.territoryTask?.kind === 'invade')
    .map(target => ({ target, goal: territoryInvaderGoal(state, target) })).filter(item => !!item.goal)
    .sort((a, b) => Math.hypot(a.target.x - state.player.x, a.target.y - state.player.y)
      - Math.hypot(b.target.x - state.player.x, b.target.y - state.player.y) || a.target.id.localeCompare(b.target.id)).slice(0, 2);
}

/** Intent marks precede danger contours. They promise a destination, not a
 * collision-free straight-line route, and remain essential in low effects. */
export function drawTerritoryInvaders(ctx: CanvasRenderingContext2D, state: GameState, labels?: SceneLabelSink, viewport?: TerritoryViewport): void {
  for (const { target, goal } of territoryInvaderMarkers(state)) {
    if (!goal) continue;
    const angle = Math.atan2(goal.y - target.y, goal.x - target.x), length = Math.min(64, Math.hypot(goal.x - target.x, goal.y - target.y));
    ctx.save(); ctx.strokeStyle = '#e9ddbe'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(target.x, target.y, target.radius + 6, target.radius + 6, 0, .2, Math.PI - .2); ctx.stroke();
    ctx.strokeStyle = '#856795'; ctx.lineWidth = 2; ctx.stroke();
    ctx.translate(target.x, target.y); ctx.rotate(angle);
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(target.radius + 9, 0); ctx.lineTo(length + target.radius + 9, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(length + target.radius + 2, -5); ctx.lineTo(length + target.radius + 9, 0); ctx.lineTo(length + target.radius + 2, 5); ctx.stroke(); ctx.restore();
    const y = target.y - (target.radius * 2 + 14) / .72;
    ctx.save(); ctx.translate(target.x, y); ctx.scale(1, 1 / .72);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath();
    ctx.fillStyle = '#83658e'; ctx.fill(); ctx.strokeStyle = '#f4ead1'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    if (onScreen(target, viewport)) labels?.add({ id: `territory-invader:${target.id}`, anchor: target, offset: { x: 0, y: -target.radius * 2 - 30 },
      priority: 84, essential: true, lines: [{ text: `侵染 → ${goal.name}`, color: '#ead1ee', size: 10 }] });
  }
}

export function drawPlayerInfection(ctx: CanvasRenderingContext2D, state: GameState, low = false): void {
  if (!visibleTerritory(state) || !state.playerInfection || state.playerInfection.until <= state.elapsed || state.player.hp <= 0) return;
  const p = state.player, time = state.visualTime ?? state.elapsed;
  ctx.save(); ctx.strokeStyle = '#b28aca'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.ellipse(p.x, p.y, p.radius + 8, p.radius + 8, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  if (!low) for (let i = 0; i < 3; i++) {
    const angle = time * 1.5 + i * TAU / 3;
    ctx.beginPath(); ctx.ellipse(p.x + Math.cos(angle) * (p.radius + 6), p.y - 19 + Math.sin(angle) * 12, 2, 2, 0, 0, TAU);
    ctx.fillStyle = '#b79bca99'; ctx.fill();
  }
  ctx.restore();
}
