import { CAMP_DORMITORY_OFFSETS, campLayout, type CampFacility } from '../game/campLayout';
import type { GameState, Vec } from '../game/types';
import { campFarmPlots } from '../game/campFarm';
import { FARM_BALANCE } from '../game/legionCatalog';
import { sourceRegisteredSpriteLayout, registeredSpriteBodyBounds, type SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { CombatFrame } from './smartVirusVisuals';
import type { VisualBounds } from './raisedObstacleGeometry';

export interface CampLifeBody extends Vec {
  id: string; kind: 'house' | 'crop' | 'farm-supply'; plotIndex?: number;
  stage?: 'seed' | 'grow' | 'ripe'; logicalWidth: number;
}
export function campLifeBodies(state: GameState): CampLifeBody[] {
  if (!state.camp || state.camp.prologue === 'arrival') return [];
  const layout = campLayout(state), house = layout.facilities.find(site => site.id === 'house');
  const farm = layout.facilities.find(site => site.id === 'farm'), bodies: CampLifeBody[] = [];
  if (house) for (const building of CAMP_DORMITORY_OFFSETS) bodies.push({ id: `camp-life:house:${building.id}`, kind: 'house',
    x: house.position.x + building.offset.x, y: house.position.y + building.offset.y, logicalWidth: building.logicalWidth });
  if (farm) {
    bodies.push({ id: 'camp-life:farm-supply', kind: 'farm-supply', x: farm.position.x + 90, y: farm.position.y + 80, logicalWidth: 90 });
    for (const plot of campFarmPlots(state)) {
      if (plot.status === 'empty') continue;
      const stage = plot.growth >= FARM_BALANCE.maturity ? 'ripe' : plot.status;
      for (const [plant, offset] of [{ x: -34, y: 8 }, { x: 32, y: 12 }, { x: 0, y: 30 }].entries()) bodies.push({
        id: `camp-life:crop:${plot.index}:${plant}`, kind: 'crop', plotIndex: plot.index, stage,
        x: plot.position.x + offset.x, y: plot.position.y + offset.y, logicalWidth: 112 });
    }
  }
  return bodies;
}
/** Compatibility drawing shares each body's ground anchor and depth entry. */
export function drawCampLifeFallback(ctx: CanvasRenderingContext2D, body: CampLifeBody): void {
  ctx.save(); ctx.translate(body.x, body.y); ctx.scale(1, 1 / .72);
  if (body.kind === 'crop') {
    ctx.strokeStyle = '#7fa46b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const height = body.stage === 'ripe' ? 46 : body.stage === 'grow' ? 39 : 26;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -height); ctx.stroke(); ctx.fillStyle = '#afd295';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 10, -height * .65, 14, 7, side * -.5, 0, Math.PI * 2); ctx.fill(); }
    if (body.stage === 'ripe') { ctx.fillStyle = '#eacb75'; ctx.beginPath(); ctx.ellipse(0, -height, 10, 14, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (body.kind === 'farm-supply') {
    ctx.fillStyle = '#cbdcc6'; ctx.strokeStyle = '#779789'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-28, -26, 56, 25, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9cc4b5'; ctx.beginPath(); ctx.ellipse(0, -25, 23, 8, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    const size = body.logicalWidth * .6;
    ctx.fillStyle = '#e4e4cc'; ctx.strokeStyle = '#6d947e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-size / 2, -65, size, 65, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a3bea6'; ctx.beginPath(); ctx.moveTo(-size / 2 - 8, -54); ctx.quadraticCurveTo(0, -115, size / 2 + 8, -54); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#527a68'; ctx.beginPath(); ctx.roundRect(-12, -38, 24, 38, 8); ctx.fill();
  }
  ctx.restore();
}
export function campLifeBodyFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, body: CampLifeBody): CombatFrame | undefined {
  const id = body.kind === 'house' ? 'microfront.camp.house' : body.kind === 'farm-supply' ? 'microfront.camp.farm' : `sanctum.crop.${body.stage}`;
  const asset = assets[id]; if (!asset) return;
  const canvas = asset.sourceSize ?? { width: 1024, height: 1024 };
  const layout = sourceRegisteredSpriteLayout(asset, canvas, { x: canvas.width * .5, y: canvas.height * 870 / 1024 }, body.logicalWidth / canvas.width);
  return layout ? { id, layout, flipX: false } : undefined;
}
export function campLifeFacilityBounds(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, state: GameState, station: CampFacility): VisualBounds | undefined {
  if (station.id !== 'house' && station.id !== 'farm') return;
  const bodies = campLifeBodies(state).filter(body => station.id === 'house' ? body.kind === 'house' : body.kind !== 'house');
  const bounds = bodies.flatMap(body => { const frame = campLifeBodyFrame(assets, body); return frame ? [registeredSpriteBodyBounds(frame.layout, body)] : []; });
  if (station.id === 'farm') for (const plot of campFarmPlots(state)) bounds.push({ left: plot.rect.left, right: plot.rect.right, top: plot.rect.top * .72, bottom: plot.rect.bottom * .72 });
  if (!bounds.length) return;
  return { left: Math.min(...bounds.map(b => b.left)), right: Math.max(...bounds.map(b => b.right)),
    top: Math.min(...bounds.map(b => b.top)), bottom: Math.max(...bounds.map(b => b.bottom)) };
}
