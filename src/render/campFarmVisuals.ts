import { CAMP_FARM_RULES, campCropAction, campFarmPlots, formatFarmCountdown, type CampGardenPlot } from '../game/campFarm';
import type { GameState, Vec } from '../game/types';
import type { Camera } from './camera';
import type { LabelRect, SceneLabelSink } from './sceneLabels';
import artRuntime from '../../.art-generated/art-runtime.json';
import { campLifeBodies, campLifeBodyFrame } from './campLifePresentation';
import { registeredSpriteBodyBounds } from './spriteGeometry';

export interface CampGardenScreenPlot extends CampGardenPlot { body: LabelRect; hitAreas: LabelRect[]; labels: { id: string; rect: LabelRect }[] }
export function campGardenScreenPlots(state: GameState, camera: Camera, placements: readonly { id: string; rect: LabelRect }[] = []): CampGardenScreenPlot[] {
  const bodies = campLifeBodies(state);
  return campFarmPlots(state).map(plot => {
    const a = camera.worldToScreen({ x: plot.rect.left, y: plot.rect.top }), b = camera.worldToScreen({ x: plot.rect.right, y: plot.rect.bottom });
    const hitAreas = [{ left: a.x, top: a.y, right: b.x, bottom: b.y }];
    for (const plant of bodies.filter(body => body.kind === 'crop' && body.plotIndex === plot.index)) {
      const frame = campLifeBodyFrame(artRuntime.assets, plant); if (!frame) continue;
      const bounds = registeredSpriteBodyBounds(frame.layout, plant);
      const top = camera.worldToScreen({ x: bounds.left, y: bounds.top / camera.yScale }), bottom = camera.worldToScreen({ x: bounds.right, y: bounds.bottom / camera.yScale });
      hitAreas.push({ left: top.x, top: top.y, right: bottom.x, bottom: bottom.y });
    }
    const body = { left: Math.min(...hitAreas.map(r => r.left)), top: Math.min(...hitAreas.map(r => r.top)), right: Math.max(...hitAreas.map(r => r.right)), bottom: Math.max(...hitAreas.map(r => r.bottom)) };
    return { ...plot, body, hitAreas,
      labels: placements.filter(label => label.id === `camp-crop:${plot.index}`).map(label => ({ id: label.id, rect: { ...label.rect } })) };
  });
}
export function hitCampGardenPlot(plots: readonly CampGardenScreenPlot[], point: Vec): CampGardenScreenPlot | undefined {
  const contains = (r: LabelRect) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
  return plots.filter(plot => plot.labels.some(label => contains(label.rect)) || plot.hitAreas.some(contains))
    .sort((a, b) => Number(b.labels.some(label => contains(label.rect))) - Number(a.labels.some(label => contains(label.rect))) || b.position.y - a.position.y)[0];
}
function drawCropClock(ctx: CanvasRenderingContext2D, plot: CampGardenPlot): void {
  if (plot.status === 'empty' && plot.sowProgress === null) return;
  const sowing = plot.sowProgress !== null, progress = sowing ? plot.sowProgress! : plot.growthProgress;
  const ripe = plot.status === 'ripe';
  // The clock sits in the narrow aisle beside the bed, clear of its crop body
  // and the plot-action caption underneath it.
  ctx.save(); ctx.translate(plot.rect.right + 29, plot.rect.bottom - 15); ctx.scale(1, 1 / .72);
  ctx.fillStyle = '#f8f3dce8'; ctx.strokeStyle = '#6b88684d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = sowing ? '#74bcb2' : ripe ? '#d1ac54' : '#7ea56b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.003, progress)); ctx.stroke();
  ctx.fillStyle = '#365d4c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(sowing ? `${(CAMP_FARM_RULES.sowSeconds * (1 - progress)).toFixed(1)}s` : ripe ? '可摘' : formatFarmCountdown(plot.remainingSeconds), 0, 0);
  if (!sowing && !ripe && (plot.waterAvailable || plot.pestsAvailable)) {
    const water = plot.waterAvailable;
    ctx.fillStyle = water ? '#e1f1e8' : '#f5e7b8'; ctx.strokeStyle = water ? '#79aaa6' : '#bd9b58'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-27, -20, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = water ? '#4f9eaa' : '#9b7347';
    if (water) { ctx.beginPath(); ctx.moveTo(-27, -28); ctx.bezierCurveTo(-37, -16, -29, -10, -24, -17); ctx.bezierCurveTo(-21, -21, -25, -25, -27, -28); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.ellipse(-27, -20, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      for (const side of [-1, 1]) for (const y of [-24, -20, -16]) { ctx.beginPath(); ctx.moveTo(-27 + side * 3, y); ctx.lineTo(-27 + side * 7, y + side); ctx.stroke(); }
    }
  }
  ctx.restore();
}
function drawCareFeedback(ctx: CanvasRenderingContext2D, state: GameState, plot: CampGardenPlot): void {
  const feedback = state.camp?.cropFeedback;
  if (!feedback || feedback.index !== plot.index || feedback.until <= state.elapsed || !['water', 'pests', 'plant'].includes(feedback.kind)) return;
  const remaining = feedback.until - state.elapsed, age = Math.max(0, 1.5 - remaining);
  ctx.save(); ctx.globalAlpha = Math.min(1, remaining * 2);
  ctx.strokeStyle = feedback.kind === 'water' ? '#84d2de' : '#f5d880'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const x = plot.position.x + Math.sin(i * 2.4) * 46, y = plot.position.y + Math.cos(i * 1.7) * 22 - age * 18;
    ctx.beginPath();
    if (feedback.kind === 'water') { ctx.moveTo(x - 2, y - 15); ctx.lineTo(x + 2, y - 6); ctx.stroke(); }
    else { ctx.arc(x, y - 8, feedback.kind === 'pests' ? 2.8 : 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
/** Soil, furrows and borders belong to the ground; crop sprites sort with actors. */
export function drawCampGardenGround(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const plot of campFarmPlots(state)) {
    const r = plot.rect, ripe = plot.status === 'ripe';
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = '#5c704529'; ctx.beginPath(); ctx.roundRect(r.left - 7, r.top - 5, 140, 104, 17); ctx.fill();
    ctx.fillStyle = '#d0c399'; ctx.strokeStyle = ripe ? '#c29f51' : '#a2ad81'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(r.left - 4, r.top - 4, 134, 98, 13); ctx.fill(); ctx.stroke();
    const soil = ctx.createLinearGradient(r.left, r.top, r.right, r.bottom);
    soil.addColorStop(0, '#a28b64'); soil.addColorStop(.6, '#8b7855'); soil.addColorStop(1, '#b39b70');
    ctx.fillStyle = soil; ctx.beginPath(); ctx.roundRect(r.left + 3, r.top + 3, 120, 84, 9); ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 5; i++) {
      const y = r.top + 12 + i * 16;
      ctx.strokeStyle = '#66563e62'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(r.left + 10, y + 2); ctx.quadraticCurveTo(plot.position.x, y - 4, r.right - 10, y); ctx.stroke();
      ctx.strokeStyle = '#d2bd8a66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.left + 10, y + 5); ctx.lineTo(r.right - 10, y + 3); ctx.stroke();
    }
    ctx.restore();
    if (plot.eligible) { ctx.strokeStyle = ripe ? '#fff0a1' : '#f3e7b8'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.roundRect(r.left - 8, r.top - 8, 142, 106, 16); ctx.stroke(); }
    // Each bed has its own small, readable wooden number marker.
    ctx.setLineDash([]); ctx.fillStyle = '#927753'; ctx.fillRect(r.right - 7, r.bottom - 1, 3, 18);
    ctx.fillStyle = '#f1e2bb'; ctx.strokeStyle = '#927753'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(r.right - 16, r.bottom - 9, 23, 16, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#655339'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(plot.index + 1), r.right - 4, r.bottom + 3);
    drawCropClock(ctx, plot); drawCareFeedback(ctx, state, plot);
    ctx.restore();
  }
}
export function addCampGardenLabels(state: GameState, labels: SceneLabelSink): void {
  for (const plot of campFarmPlots(state)) {
    if (!plot.eligible && plot.status !== 'ripe') continue;
    labels.add({ id: `camp-crop:${plot.index}`, anchor: { x: plot.position.x, y: plot.rect.bottom + 10 }, offset: { x: 0, y: 22 },
      theme: 'camp', campTone: plot.status === 'ripe' ? 'gold' : undefined, priority: plot.eligible ? 99 : 80, essential: plot.eligible,
      lines: [{ text: plot.eligible ? `${campCropAction(plot)}${plot.sowProgress !== null || plot.action === 'wait' ? '' : ` · 点击${state.camp?.overview ? '' : ' / E'}`}` : '蜜露营养荚成熟', size: 12 }] });
  }
  const feedback = state.camp?.cropFeedback;
  if (feedback && feedback.until > state.elapsed) {
    const plot = campFarmPlots(state)[feedback.index]; if (!plot) return;
    labels.add({ id: 'camp-harvest-feedback', anchor: plot.position, offset: { x: 0, y: -70 - (1.5 - (feedback.until - state.elapsed)) * 16 },
      theme: 'camp', campTone: 'gold', priority: 110, essential: true,
      lines: [{ text: feedback.message ?? (feedback.kind === 'harvest' ? '+2口粮 · 已采摘' : feedback.kind === 'water' ? '浇水完成 · 加速25秒'
        : feedback.kind === 'pests' ? '除虫完成 · 加速25秒' : feedback.kind === 'ripe' ? '蜜露营养荚成熟 · 可以采摘'
        : feedback.kind === 'cancel' ? '播种已取消' : '播种完成'), size: 17 }] });
  }
}
