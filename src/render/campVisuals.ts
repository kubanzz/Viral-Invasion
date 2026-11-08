import { CAMP_COURTYARDS, CAMP_FACILITIES, CAMP_PATHS, CAMP_LIFE_PATHS, CAMP_PLANNED_AREAS, CAMP_LIFE_GARDEN_BOUNDS, CAMP_WALL_THICKNESS, campLayout, campCourtyardBoundaryTraces, type CampCourtyard,
  type CampCourtyardId, type CampRect, type CampStationId } from '../game/campLayout';
import type { GameState, Vec } from '../game/types';
import type { SceneLabel } from './sceneLabels';
import {campPlanningLabels,drawCampLifeGardenGround} from './campPlanningVisuals';

const TAU = Math.PI * 2;

export const CAMP_VISUAL_SIZES = {
  heroCanvas: 76, coreCanvas: 230,
  stationWidths: { warehouse: 280, forge: 156, shop: 168, departure: 190, summon: 130, farm: 240, house: 220 } satisfies Record<CampStationId, number>,
  newForgeWidth: 248,
} as const;
export const CAMP_GROUND_ASSET_IDS: Readonly<Record<CampCourtyardId, string>> = {
  workshop: 'fantasy.camp.ground.workshop', supply: 'fantasy.camp.ground.supply', departure: 'fantasy.camp.ground.departure',
};
export const CAMP_SUMMON_NODE = { ringRadius: 36, coreHeight: 48, coreRadius: 17, beamHeight: 132 } as const;

/** Local procedural fallback keeps new life facilities identifiable before optional art loads. */
export function drawCampLifeFacility(ctx: CanvasRenderingContext2D, state: GameState, id: 'farm' | 'house'): void {
  ctx.save();
  if (id === 'farm') {
    ctx.fillStyle = '#9eab7f';ctx.strokeStyle = '#6d8862';ctx.lineWidth = 3;
    ctx.beginPath();ctx.roundRect(-110,-75,220,75,14);ctx.fill();ctx.stroke();
    const plots = (state.camp as typeof state.camp & { farmPlots?: {planted:boolean;growth:number}[] })?.farmPlots;
    for (let index=0; index<3; index++) {
      const x=-72+index*72, plot=plots?.[index];
      ctx.fillStyle='#7e6d4f';ctx.beginPath();ctx.roundRect(x-27,-62,54,50,8);ctx.fill();
      if (!plot || plot.planted) for (const side of [-1,1]) {
        const sx=x+side*12;ctx.strokeStyle='#cee0a2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(sx,-24);ctx.lineTo(sx,-61);ctx.stroke();
        ctx.fillStyle='#9fca85';ctx.beginPath();ctx.ellipse(sx-7,-45,11,5,.55,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(sx+7,-39,11,5,-.55,0,TAU);ctx.fill();
        if ((plot?.growth??2)>=2) {ctx.fillStyle='#f3d087';ctx.beginPath();ctx.ellipse(sx,-62,8,11,0,0,TAU);ctx.fill();}
      }
    }
  } else {
    ctx.fillStyle='#d5d0ac';ctx.strokeStyle='#6a8a74';ctx.lineWidth=3;
    ctx.beginPath();ctx.roundRect(-66,-82,132,82,14);ctx.fill();ctx.stroke();
    ctx.fillStyle='#88a681';ctx.beginPath();ctx.moveTo(-82,-75);ctx.quadraticCurveTo(-67,-121,0,-136);ctx.quadraticCurveTo(67,-121,82,-75);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#487662';ctx.beginPath();ctx.roundRect(-17,-48,34,48,15);ctx.fill();
    for(const x of [-43,43]) {ctx.fillStyle='#edcd89';ctx.beginPath();ctx.ellipse(x,-49,12,16,0,0,TAU);ctx.fill();ctx.stroke();}
    ctx.strokeStyle='#ead7a1';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-98);ctx.lineTo(8,-98);ctx.moveTo(0,-106);ctx.lineTo(0,-90);ctx.stroke();
  }
  ctx.restore();
}

/** Animated guidance stays outside the camp's cached static floor. */
export function drawCampSummonGround(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false): void {
  if (!state.camp || state.camp.prologue === 'arrival') return;
  const node = campLayout(state).facilities.find(site => site.id === 'summon');
  if (!node) return;
  const p = node.position, pulse = lowEffects ? 0 : Math.sin(state.elapsed * 2.2) * .5 + .5;
  ctx.save();
  const glow = ctx.createRadialGradient(p.x, p.y, 3, p.x, p.y, 56 + pulse * 6);
  glow.addColorStop(0, '#ffe8a981'); glow.addColorStop(.55, '#f0c07138'); glow.addColorStop(1, '#f1c26f00');
  ctx.fillStyle = glow;ctx.beginPath();ctx.arc(p.x, p.y, 62, 0, TAU);ctx.fill();
  ctx.lineWidth = 2;ctx.strokeStyle = '#bb8c48';ctx.beginPath();ctx.arc(p.x, p.y, CAMP_SUMMON_NODE.ringRadius, 0, TAU);ctx.stroke();
  ctx.lineWidth = 1.3;ctx.strokeStyle = '#fff5cc';ctx.beginPath();ctx.arc(p.x, p.y, 31 + pulse * 2, 0, TAU);ctx.stroke();
  ctx.restore();
}

/** A soft upright beam and a few rising motes make the unique node visible from the road. */
export function drawCampSummonLight(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false): void {
  if (!state.camp || state.camp.prologue === 'arrival') return;
  const node = campLayout(state).facilities.find(site => site.id === 'summon');
  if (!node) return;
  const pulse = lowEffects ? 0 : Math.sin(state.elapsed * 2.2) * .5 + .5;
  ctx.save();ctx.translate(node.position.x, node.position.y);ctx.scale(1, 1 / .72);
  if (!lowEffects) {
    const beam = ctx.createLinearGradient(0, -CAMP_SUMMON_NODE.beamHeight, 0, 0);
    beam.addColorStop(0, '#fff1b800');beam.addColorStop(.55, '#ffeab329');beam.addColorStop(1, '#f8d07b55');
    ctx.fillStyle = beam;ctx.beginPath();ctx.moveTo(-9, -CAMP_SUMMON_NODE.beamHeight);ctx.lineTo(9, -CAMP_SUMMON_NODE.beamHeight);
    ctx.lineTo(23, 0);ctx.quadraticCurveTo(0, 8, -23, 0);ctx.closePath();ctx.fill();
    for (let i = 0; i < 7; i++) {
      const t = (state.elapsed * .23 + i / 7) % 1, x = Math.sin(i * 2.4 + t * 3) * (13 + i % 3 * 4);
      ctx.globalAlpha = Math.sin(t * Math.PI) * .8;ctx.fillStyle = i % 2 ? '#fff7cf' : '#efc77d';
      ctx.beginPath();ctx.arc(x, -10 - t * 108, 1.4 + i % 2 * .6, 0, TAU);ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const glow = ctx.createRadialGradient(0, -CAMP_SUMMON_NODE.coreHeight, 2, 0, -CAMP_SUMMON_NODE.coreHeight, 31 + pulse * 3);
  glow.addColorStop(0, '#fff4c43b');glow.addColorStop(1, '#ffda9200');
  ctx.fillStyle = glow;ctx.beginPath();ctx.arc(0, -CAMP_SUMMON_NODE.coreHeight, 35, 0, TAU);ctx.fill();ctx.restore();
}
export type CampGroundImages = Partial<Record<CampCourtyardId, CanvasImageSource>>;
export type CampFixtureKind = 'material-bin' | 'supply-shelf' | 'bench' | 'dispatch-rack';
export type CampDecoration = (Vec & { id: string; height: number }) & (
  { kind: 'sprite'; assetId: string } | { kind: 'fixture'; fixture: CampFixtureKind }
);
export interface CampFixtureRaster { canvas: HTMLCanvasElement; width: number; height: number; visibleHeight: number; foot: Vec }

const seed = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const inset = (r: CampRect, n: number): CampRect => ({ left: r.left + n, top: r.top + n, right: r.right - n, bottom: r.bottom - n });
const colors = {
  workshop: { floor: '#cbd0bc', light: '#e4e6d1', grain: '#7b927d', seed: 70 },
  supply: { floor: '#e8ddc2', light: '#f4ead2', grain: '#b7aa88', seed: 170 },
  departure: { floor: '#cad8ce', light: '#e0e8d9', grain: '#7f9d91', seed: 270 },
} as const;

/** Visible corner traces are exactly the short grounded collision boundaries. */
export const campBoundaryTraces = campCourtyardBoundaryTraces;

/** Floor material stays inside each district; open borders remain walkable. */
export function campGroundPatchRect(courtyard: CampCourtyard): CampRect { return inset(courtyard.rect, CAMP_WALL_THICKNESS / 2 + 2); }

type CampDecorationDefinition = CampDecoration & { groundPlanting?: CampCourtyardId };
const decorationDefinitions: readonly CampDecorationDefinition[] = [
  { id: 'tree-west', kind: 'sprite', assetId: 'fantasy.tree.healthy', x: -506, y: -225, height: 86 },
  { id: 'tree-east', kind: 'sprite', assetId: 'fantasy.tree.healthy', x: 486, y: -225, height: 84 },
  { id: 'workshop-leaf-1', groundPlanting: 'workshop', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: -508, y: -143, height: 26 },
  { id: 'workshop-leaf-2', groundPlanting: 'workshop', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: -510, y: 35, height: 28 },
  { id: 'workshop-leaf-3', groundPlanting: 'workshop', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: -496, y: 233, height: 29 },
  { id: 'workshop-leaf-4', groundPlanting: 'workshop', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: -195, y: 234, height: 26 },
  { id: 'workshop-materials', kind: 'fixture', fixture: 'material-bin', x: -480, y: -50, height: 48 },
  { id: 'workshop-parts', kind: 'fixture', fixture: 'material-bin', x: -483, y: 173, height: 43 },
  { id: 'supply-leaf-1', groundPlanting: 'supply', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 205, y: -213, height: 27 },
  { id: 'supply-leaf-2', groundPlanting: 'supply', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 382, y: -214, height: 25 },
  { id: 'supply-leaf-3', groundPlanting: 'supply', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 497, y: -129, height: 28 },
  { id: 'supply-leaf-4', groundPlanting: 'supply', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 494, y: 11, height: 24 },
  { id: 'supply-shelf', kind: 'fixture', fixture: 'supply-shelf', x: 447, y: -123, height: 64 },
  { id: 'supply-bench', kind: 'fixture', fixture: 'bench', x: 444, y: 3, height: 28 },
  { id: 'departure-leaf-1', groundPlanting: 'departure', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 199, y: 174, height: 25 },
  { id: 'departure-leaf-2', groundPlanting: 'departure', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 425, y: 173, height: 27 },
  { id: 'departure-leaf-3', groundPlanting: 'departure', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 493, y: 352, height: 30 },
  { id: 'departure-leaf-4', groundPlanting: 'departure', kind: 'sprite', assetId: 'fantasy.lung.tree.healthy', x: 197, y: 354, height: 28 },
  { id: 'departure-rack', kind: 'fixture', fixture: 'dispatch-rack', x: 467, y: 243, height: 68 },
];

/** Decorative sprites are not inventory pickups, combat actors, or collision obstacles. */
export function campDecorations(state: GameState, paintedGrounds: readonly CampCourtyardId[] = []): CampDecoration[] {
  if (!state.camp || state.camp.prologue === 'arrival') return [];
  const { origin, completedCourtyards } = campLayout(state);
  const finished = new Set(completedCourtyards.map(c => c.id));
  const painted = new Set(paintedGrounds);
  return decorationDefinitions.filter(d => finished.has(d.id === 'tree-west' ? 'workshop' : d.id === 'tree-east' ? 'supply' : d.id.split('-')[0] as CampCourtyardId)
    && (!state.camp?.prologue || d.kind !== 'fixture') && (!d.groundPlanting || !painted.has(d.groundPlanting)))
    .map(({ groundPlanting: _, ...d }) => ({ ...d, id: `camp-decor:${d.id}`, x: origin.x + d.x, y: origin.y + d.y }));
}

export function campAreaLabels(state: GameState): SceneLabel[] {
  if (!state.camp || state.camp.prologue === 'arrival') return [];
  const names: Record<CampCourtyardId, string> = { workshop: '整备区', supply: '补给区', departure: '出击区' };
  return [...campLayout(state).completedCourtyards.map(c => ({
    id: `camp-area:${c.id}`, anchor: { x: (c.rect.left + c.rect.right) / 2, y: c.rect.bottom + 28 },
    priority: 64, essential: true, lines: [{ text: names[c.id], color: '#ecedd2', size: 15 }],
  })),...campPlanningLabels(state)];
}

function trace(ctx: CanvasRenderingContext2D, points: readonly Vec[], yOffset = 0): void {
  ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y + yOffset); else ctx.moveTo(p.x, p.y + yOffset); });
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
}
function rounded(ctx: CanvasRenderingContext2D, r: CampRect, radius = 18): void {
  ctx.roundRect(r.left, r.top, r.right - r.left, r.bottom - r.top, radius);
}
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, fill: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-length * .65, -length * .2, -length * .45, -length * .85, 0, -length);
  ctx.bezierCurveTo(length * .5, -length * .7, length * .4, -length * .15, 0, 0);
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#75977b80'; ctx.lineWidth = .65; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(-1.5, -length * .5, 0, -length * .85); ctx.strokeStyle = '#dce4ba99'; ctx.stroke(); ctx.restore();
}

function drawGroundTexture(ctx: CanvasRenderingContext2D, c: CampCourtyard, image?: CanvasImageSource): void {
  const r = c.rect, palette = colors[c.id], interior = campGroundPatchRect(c);
  ctx.save();ctx.beginPath();rounded(ctx, r, 24);ctx.clip();
  const gradient = ctx.createLinearGradient(r.left, r.top, r.right, r.bottom);
  gradient.addColorStop(0, palette.light);gradient.addColorStop(.45, palette.floor);gradient.addColorStop(1, palette.light);
  ctx.fillStyle = gradient;ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  if (image) {
    // Intake crops only the declared source contentRect. Its XY registration
    // remains the complete yard; clipping the border must not refit the art.
    ctx.save();ctx.beginPath();rounded(ctx, interior, 18);ctx.clip();
    ctx.drawImage(image, r.left, r.top, r.right - r.left, r.bottom - r.top);ctx.restore();
  }
  else {
    // Different materials, subtle enough to stay behind the painterly facilities.
    ctx.strokeStyle = c.id === 'departure' ? '#789b8d24' : '#8c987924';ctx.lineWidth = .8;
    if (c.id === 'workshop') {
      for (let row = 0; row < (r.bottom - r.top) / 49; row++) for (let col = 0; col < (r.right - r.left) / 63 + 1; col++) {
        const x = r.left + col * 63 + (row % 2) * 26, y = r.top + row * 49;
        ctx.beginPath();ctx.moveTo(x + 4, y + 3);ctx.lineTo(x + 58, y + 1);ctx.quadraticCurveTo(x + 63, y + 22, x + 58, y + 45);ctx.lineTo(x + 8, y + 48);ctx.stroke();
      }
    } else if (c.id === 'departure') {
      for (let i = 0; i < 19; i++) {
        const x = r.left + i * 24, y = r.bottom + 14;ctx.beginPath();ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 21, y - 65, x - 24, r.top + 83, x + 14, r.top - 12);ctx.stroke();
      }
    } else {
      for (let i = 0; i < 32; i++) {
        const x = r.left + seed(i + 5) * (r.right - r.left), y = r.top + seed(i + 17) * (r.bottom - r.top);
        ctx.beginPath();ctx.ellipse(x, y, 9 + seed(i + 25) * 13, 4 + seed(i + 35) * 6, seed(i) * .7, 0, TAU);ctx.stroke();
      }
    }
  }
  // Painted floors already own their grain; the fallback must not add a second material layer.
  for (let i = 0; !image && i < 330; i++) {
    const x = r.left + seed(i + palette.seed) * (r.right - r.left), y = r.top + seed(i + palette.seed + 2000) * (r.bottom - r.top);
    ellipse(ctx, x, y, .5 + seed(i + 400) * 1.7, .4 + seed(i + 800), i % 4 ? '#fff9df1c' : palette.grain + '16');
  }
  ctx.restore();
}

function drawPlantingEdges(ctx: CanvasRenderingContext2D, c: CampCourtyard): void {
  // Planting hugs the short corner curbs; open service fronts never look fenced in.
  for (const points of campCourtyardBoundaryTraces(c)) {
    const p = points[3], center = { x: (c.rect.left+c.rect.right)/2, y: (c.rect.top+c.rect.bottom)/2 };
    const x = p.x + Math.sign(center.x-p.x)*17, y = p.y + Math.sign(center.y-p.y)*17;
    ellipse(ctx, x, y+3, 13, 5, '#6f956542');
    leaf(ctx, x, y+4, 15, -.8, '#a9c39a');leaf(ctx, x+3, y+3, 13, .75, '#b9cda4');
  }
}

function drawCurb(ctx: CanvasRenderingContext2D, c: CampCourtyard): void {
  const corners = campCourtyardBoundaryTraces(c);
  ctx.save();ctx.lineCap = 'round';ctx.lineJoin = 'round';
  for (const points of corners) {
    trace(ctx, points, 7);ctx.strokeStyle = '#65765c35';ctx.lineWidth = CAMP_WALL_THICKNESS + 5;ctx.stroke();
    trace(ctx, points, 4);ctx.strokeStyle = '#a8ad91';ctx.lineWidth = CAMP_WALL_THICKNESS;ctx.stroke();
    trace(ctx, points);ctx.strokeStyle = '#e2d6b9';ctx.lineWidth = CAMP_WALL_THICKNESS;ctx.stroke();
    trace(ctx, points, -1.5);ctx.strokeStyle = '#fff2d6';ctx.lineWidth = 2;ctx.stroke();
    // Each short corner follows its collider; the open sides have no invisible fence.
    for (let i = 4; i < points.length - 3; i += 4) {
      const p = points[i], a = points[i - 1], b = points[i + 1], length = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      ctx.beginPath();ctx.moveTo(p.x + nx * 4.3, p.y + ny * 4.3);ctx.lineTo(p.x - nx * 4.3, p.y - ny * 4.3 + 1);ctx.strokeStyle = '#a8aa8a68';ctx.lineWidth = .8;ctx.stroke();
    }
  }
  const g = c.gate, x = g.center.x, y = g.center.y;
  const threshold = ctx.createLinearGradient(x - 16, y, x + 16, y);threshold.addColorStop(0, '#eadbbd');threshold.addColorStop(.5, '#f6e8ca');threshold.addColorStop(1, '#e6d5b7');
  ctx.beginPath();ctx.roundRect(x - 18, y - g.width / 2, 36, g.width, 4);ctx.fillStyle = threshold;ctx.fill();
  for (const dy of [-27, 0, 27]) { ctx.beginPath();ctx.moveTo(x - 15, y + dy);ctx.lineTo(x + 15, y + dy);ctx.strokeStyle = '#aaa98c77';ctx.lineWidth = .8;ctx.stroke(); }
  ctx.restore();
}

function drawPaths(ctx: CanvasRenderingContext2D): void {
  const paths: readonly CampRect[] = [CAMP_PATHS.forecourt, CAMP_PATHS.spine, ...CAMP_PATHS.branches];
  ctx.save();ctx.beginPath();paths.forEach(r => rounded(ctx, r, 17));ctx.fillStyle = '#c6b59769';ctx.fill();
  ctx.beginPath();paths.forEach(r => rounded(ctx, inset(r, 2), 15));ctx.fillStyle = '#f0dfc0';ctx.fill();
  ctx.save();ctx.beginPath();paths.forEach(r => rounded(ctx, inset(r, 3), 14));ctx.clip();
  const interiors=paths.map(r=>inset(r,3)), areas=interiors.map(r=>(r.right-r.left)*(r.bottom-r.top)), totalArea=areas.reduce((sum,area)=>sum+area,0);
  for (let i = 0; i < Math.ceil(totalArea/700); i++) {
    let sample=seed(i+91)*totalArea, index=0;
    while(index<areas.length-1&&sample>=areas[index])sample-=areas[index++];
    const r=interiors[index],x=r.left+seed(i+491)*(r.right-r.left),y=r.top+seed(i+1091)*(r.bottom-r.top);
    ellipse(ctx, x, y, .7 + seed(i + 41) * 2.2, .4 + seed(i + 73) * 1.2, i % 3 ? '#fff6dc51' : '#bdab8b21');
  }
  ctx.strokeStyle = '#c4ad8b22';ctx.lineWidth = 1;
  for (const y of [-365,-290,-215,-140,132,207,281,356]) {ctx.beginPath();ctx.moveTo(-72, y);ctx.bezierCurveTo(-30, y - 3, 34, y + 4, 72, y);ctx.stroke();}
  ctx.restore();ctx.restore();
}

function drawForecourt(ctx: CanvasRenderingContext2D): void {
  ellipse(ctx, 0, 23, 105, 73, '#8e957b42');
  ellipse(ctx, 0, 17, 103, 72, '#b8b69b');
  ellipse(ctx, 0, 10, 101, 71, '#e4d6b8');
  ellipse(ctx, 0, 7, 95, 66, '#f5e6c8');
  ellipse(ctx, 0, 6, 84, 58, '#d5ddbd');
  ctx.strokeStyle = '#f9edd1';ctx.lineWidth = 1.3;ctx.beginPath();ctx.ellipse(0, 6, 85, 59, 0, 0, TAU);ctx.stroke();
  // The heart receives a single quiet plinth, with a few embedded stone joints.
  ctx.strokeStyle = '#b8b49765';ctx.lineWidth = 1;
  for (const a of [.45, 1.3, 2.1, 2.9, 3.7, 4.6, 5.5]) {
    ctx.beginPath();ctx.moveTo(Math.cos(a) * 86, 7 + Math.sin(a) * 59);ctx.lineTo(Math.cos(a) * 100, 9 + Math.sin(a) * 69);ctx.stroke();
  }
}

// A facility expansion must enlarge the raster together with its authored road.
// Upright roofs are drawn separately; only grounded footprints belong here.
const groundRects: readonly CampRect[]=[...CAMP_COURTYARDS.map(c=>c.rect),CAMP_PATHS.forecourt,CAMP_PATHS.spine,...CAMP_PATHS.branches,...Object.values(CAMP_LIFE_PATHS),CAMP_LIFE_GARDEN_BOUNDS,...CAMP_PLANNED_AREAS.map(a=>a.rect),
  ...CAMP_FACILITIES.map(f=>({left:f.position.x+f.footprint.left,top:f.position.y+f.footprint.top,right:f.position.x+f.footprint.right,bottom:f.position.y+f.footprint.bottom}))];
const groundBounds: CampRect = {left:Math.floor(Math.min(...groundRects.map(r=>r.left))-22),top:Math.floor(Math.min(...groundRects.map(r=>r.top))-22),
  right:Math.ceil(Math.max(...groundRects.map(r=>r.right))+22),bottom:Math.ceil(Math.max(...groundRects.map(r=>r.bottom))+22)};
interface GroundCacheEntry { canvas: HTMLCanvasElement; images: readonly (CanvasImageSource | undefined)[]; courtyards: string }
const groundCaches = new WeakMap<Document, GroundCacheEntry>();

function drawStaticGround(ctx: CanvasRenderingContext2D, images: CampGroundImages, completed: readonly CampCourtyardId[],lifeReady=false): void {
  if(lifeReady)drawCampLifeGardenGround(ctx);
  for (const courtyard of CAMP_COURTYARDS) {
    if (!completed.includes(courtyard.id)) continue;
    const image = images[courtyard.id];drawGroundTexture(ctx, courtyard, image);
    if (!image) drawPlantingEdges(ctx, courtyard);
    drawCurb(ctx, courtyard);
  }
  drawPaths(ctx);
  drawForecourt(ctx);
}

/** Draw in world XY before Y-sorted bodies. Supplied images are transparent XY floors, never upright sprites. */
export function drawCampGround(ctx: CanvasRenderingContext2D, state: GameState, images: CampGroundImages = {}): void {
  if (!state.camp) return;
  if (state.camp.prologue === 'arrival') return;
  const { origin, completedCourtyards } = campLayout(state), owner = ctx.canvas.ownerDocument;
  const completed = completedCourtyards.map(c => c.id),lifeReady=state.camp.prologue==='ready', key = `${completed.join(',')}:${lifeReady}`;
  const refs = CAMP_COURTYARDS.map(c => images[c.id]);
  let entry = owner ? groundCaches.get(owner) : undefined;
  if (owner && (!entry || entry.courtyards !== key || refs.some((image, i) => image !== entry!.images[i]))) {
    const canvas = owner.createElement('canvas');canvas.width = groundBounds.right - groundBounds.left;canvas.height = groundBounds.bottom - groundBounds.top;
    const cached = canvas.getContext('2d');
    if (cached) {cached.translate(-groundBounds.left, -groundBounds.top);drawStaticGround(cached, images, completed,lifeReady);entry = { canvas, images: refs, courtyards: key };groundCaches.set(owner, entry);}
  }
  ctx.save();ctx.translate(origin.x, origin.y);
  if (entry) ctx.drawImage(entry.canvas, groundBounds.left, groundBounds.top);else drawStaticGround(ctx, images, completed,lifeReady);
  ctx.restore();
}

const fixtureCache = new WeakMap<Document, Map<CampFixtureKind, CampFixtureRaster>>();
/** Small fixed furniture is cached as a transparent upright raster for normal Y sorting. */
export function campFixtureRaster(kind: CampFixtureKind, owner: Document = document): CampFixtureRaster {
  let cache = fixtureCache.get(owner);if (!cache) {cache = new Map();fixtureCache.set(owner, cache);}
  const previous = cache.get(kind);if (previous) return previous;
  const canvas = owner.createElement('canvas');canvas.width = 144;canvas.height = 132;
  const ctx = canvas.getContext('2d');if (!ctx) throw Error('Canvas 2D unavailable for camp furniture');
  const foot = { x: 72, y: 112 };ctx.translate(foot.x, foot.y);ctx.lineJoin = 'round';ctx.lineCap = 'round';
  ellipse(ctx, 0, 2, kind === 'bench' ? 40 : 34, 8, '#5b735532');
  const ceramic = ctx.createLinearGradient(0, -62, 0, 0);ceramic.addColorStop(0, '#fff4dd');ceramic.addColorStop(.6, '#eadcc0');ceramic.addColorStop(1, '#c7bea3');
  ctx.strokeStyle = '#9a9f81';ctx.lineWidth = 1.3;
  const round = (x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) => {ctx.beginPath();ctx.roundRect(x, y, w, h, r);ctx.fillStyle = fill;ctx.fill();ctx.stroke();};
  if (kind === 'material-bin') {
    round(-27, -39, 54, 40, 6, ceramic);ellipse(ctx, 0, -39, 27, 8, '#b6bda1');
    for (const [x, y] of [[-15, -40], [2, -42], [16, -38], [-8, -26], [9, -24]]) {
      round(x - 6, y - 8, 12, 10, 2, x % 2 ? '#b1c4ab' : '#eee6d1');
      ctx.beginPath();ctx.moveTo(x - 4, y - 6);ctx.lineTo(x + 4, y - 6);ctx.strokeStyle = '#f9f1db';ctx.lineWidth = .8;ctx.stroke();ctx.strokeStyle = '#9a9f81';ctx.lineWidth = 1.3;
    }
    ctx.beginPath();ctx.moveTo(-23, -13);ctx.lineTo(23, -13);ctx.strokeStyle = '#f5ead0';ctx.stroke();
  } else if (kind === 'bench') {
    round(-28, -9, 8, 13, 3, '#a5b899');round(20, -9, 8, 13, 3, '#a5b899');
    ctx.beginPath();ctx.moveTo(-40, -20);ctx.quadraticCurveTo(0, -34, 40, -20);ctx.lineTo(40, -10);ctx.quadraticCurveTo(0, 3, -40, -10);ctx.closePath();ctx.fillStyle = ceramic;ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-36, -20);ctx.quadraticCurveTo(0, -30, 36, -20);ctx.strokeStyle = '#fff6df';ctx.lineWidth = 1.7;ctx.stroke();
  } else if (kind === 'supply-shelf') {
    round(-27, -67, 7, 70, 3, '#b8c6a5');round(20, -67, 7, 70, 3, '#b8c6a5');
    round(-34, -45, 68, 7, 3, ceramic);round(-34, -14, 68, 8, 3, ceramic);
    for (const [x, y] of [[-19, -46], [0, -46], [18, -46], [-14, -15], [10, -15]]) {
      round(x - 6, y - 16, 12, 15, 4, '#bdd1b1');round(x - 4, y - 19, 8, 4, 1.5, '#f5e6c4');
      ctx.beginPath();ctx.moveTo(x - 2, y - 12);ctx.lineTo(x - 2, y - 5);ctx.strokeStyle = '#edf1d7';ctx.lineWidth = 1.6;ctx.stroke();ctx.strokeStyle = '#9a9f81';ctx.lineWidth = 1.3;
    }
    ctx.strokeStyle = '#6b9173';ctx.lineWidth = 2;ctx.beginPath();ctx.moveTo(-30, -67);ctx.quadraticCurveTo(0, -83, 30, -67);ctx.stroke();
    leaf(ctx, -10, -69, 19, .5, '#9ab993');leaf(ctx, 6, -72, 17, .9, '#b1c99e');
  } else {
    round(-36, -4, 9, 9, 3, ceramic);round(27, -4, 9, 9, 3, ceramic);
    ctx.strokeStyle = '#b9c5a5';ctx.lineWidth = 6;ctx.beginPath();ctx.moveTo(-31, 0);ctx.lineTo(-31, -67);ctx.quadraticCurveTo(0, -74, 31, -67);ctx.lineTo(31, 0);ctx.stroke();
    ctx.strokeStyle = '#fff1d6';ctx.lineWidth = 2;ctx.beginPath();ctx.moveTo(-30, -67);ctx.quadraticCurveTo(0, -72, 30, -67);ctx.stroke();
    for (const x of [-21, -7, 8, 22]) {
      ctx.strokeStyle = '#8c9e7e';ctx.lineWidth = 1.3;ctx.beginPath();ctx.moveTo(x, -64);ctx.quadraticCurveTo(x + 4, -57, x, -49);ctx.stroke();
      round(x - 6, -49, 12, 25, 5, x % 2 ? '#e7e8cb' : '#b7cbae');
      ctx.beginPath();ctx.moveTo(x - 3, -44);ctx.lineTo(x - 3, -29);ctx.strokeStyle = '#fff4db';ctx.lineWidth = .9;ctx.stroke();
    }
  }
  // Fine grains live inside the painted furniture rather than becoming scattered world props.
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 110; i++) ellipse(ctx, -39 + seed(i + 18) * 78, -82 + seed(i + 218) * 86, .45 + seed(i + 418) * .6, .4, i % 3 ? '#fff5dd38' : '#76906a18');
  ctx.globalCompositeOperation = 'source-over';
  const visibleHeight = ({ 'material-bin': 52, 'supply-shelf': 87, bench: 32, 'dispatch-rack': 80 })[kind];
  const raster = { canvas, width: canvas.width, height: canvas.height, visibleHeight, foot };cache.set(kind, raster);return raster;
}
