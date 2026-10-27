import type { GameState, WorldGeometry } from '../game/types';
import type { LungFlowState } from '../game/campaignTypes';
import { lungFlowDirection } from '../game/organRules';
import { CAMPAIGN_BALANCE } from '../game/organConfig';
import { drawRaisedBodyLayers, traceRaisedObstacle } from './raisedObstacleGeometry';

const TAU = Math.PI * 2;
const hash = (n: number): number => { const value = Math.sin(n * 129.1 + 73.7) * 43158.5453; return value - Math.floor(value); };
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx: CanvasRenderingContext2D, values: number[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(values[0], values[1]);
  for (let i = 2; i < values.length; i += 2) ctx.lineTo(values[i], values[i + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11): void {
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function airway(ctx: CanvasRenderingContext2D, values: number[], width: number): void {
  for (const [color, size] of [['#122b3c', width + 8], ['#487184', width], ['#8ab6b74a', 3]] as const) {
    ctx.beginPath(); ctx.moveTo(values[0], values[1]); ctx.bezierCurveTo(values[2], values[3], values[4], values[5], values[6], values[7]);
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.stroke();
  }
}

/** A separate alveolar chamber, built from sacs, branching airways and membranes. */
export function drawLungEnvironment(ctx: CanvasRenderingContext2D, world: WorldGeometry): void {
  const bg = ctx.createRadialGradient(650, 300, 60, 600, 400, 1000);
  bg.addColorStop(0, '#294d62'); bg.addColorStop(.55, '#1d354c'); bg.addColorStop(1, '#111824');
  ctx.fillStyle = bg; ctx.fillRect(-200, -250, 1650, 1500);
  // Sacs behind the room rise above the floor. Their rounded necks replace the
  // heart's angular muscle leaflets and communicate the alveolar organ at once.
  for (let i = 0; i < 11; i++) {
    const x = -10 + i * 123, y = 5 + Math.sin(i * 2.2) * 24, r = 66 + hash(i + 3) * 28;
    const sac = ctx.createLinearGradient(x - r, y - r * 1.4, x + r, y + r * 1.1);
    sac.addColorStop(0, '#7393a4'); sac.addColorStop(.38, '#41647c'); sac.addColorStop(1, '#233a55');
    ctx.beginPath(); ctx.moveTo(x - r * .5, y + r); ctx.bezierCurveTo(x - r * 1.45, y + r * .2, x - r * 1.05, y - r * 1.65, x, y - r * 1.3);
    ctx.bezierCurveTo(x + r * 1.3, y - r * 1.55, x + r * 1.3, y + r * .4, x + r * .46, y + r); ctx.quadraticCurveTo(x, y + r * .62, x - r * .5, y + r);
    ctx.fillStyle = sac; ctx.fill(); ctx.strokeStyle = '#a4c5cb4f'; ctx.lineWidth = 2; ctx.stroke();
    ellipse(ctx, x - r * .22, y - r * .45, r * .62, r * .8, '#bfdae00a', '#bbd5da20');
    line(ctx, [x - r * .5, y + r * .63, x - r * .2, y + r * .15, x + r * .1, y - r * .5], '#c8d8db20', 1.2);
  }
  const bounds = world.bounds, left = bounds.left, right = bounds.right, top = bounds.top, bottom = bounds.bottom;
  ctx.save(); ctx.shadowColor = '#0b1426'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 16;
  ctx.beginPath(); ctx.roundRect(left - 24, top - 24, right - left + 48, bottom - top + 48, 58); ctx.fillStyle = '#365d70'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.roundRect(left - 9, top - 9, right - left + 18, bottom - top + 18, 39); ctx.fillStyle = '#91bdb530'; ctx.fill();
  const floor = ctx.createLinearGradient(650, top, 650, bottom); floor.addColorStop(0, '#28475b'); floor.addColorStop(.48, '#345967'); floor.addColorStop(1, '#243e55');
  ctx.beginPath(); ctx.roundRect(left, top, right - left, bottom - top, 25); ctx.fillStyle = floor; ctx.fill(); ctx.strokeStyle = '#b0d7cf64'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.roundRect(left + 1, top + 1, right - left - 2, bottom - top - 2, 24); ctx.clip();
  // Floor membranes remain visually flat and never suggest false colliders.
  for (let i = 0; i < 96; i++) {
    const x = left + hash(i * 3 + 1) * (right - left), y = top + hash(i * 3 + 2) * (bottom - top), r = 12 + hash(i * 3) * 22;
    ellipse(ctx, x, y, r * 1.3, r * .62, '#b6d5c412', '#bce0d322');
    ellipse(ctx, x - r * .17, y - r * .09, r * .67, r * .32, '#9cbac30b', '#c8e0df12');
  }
  airway(ctx, [650, top - 25, 650, top + 140, 415, top + 135, 305, top + 285], 29);
  airway(ctx, [650, top - 25, 650, top + 140, 875, top + 155, 960, top + 320], 29);
  airway(ctx, [403, top + 190, 320, top + 200, 235, top + 195, 178, top + 305], 15);
  airway(ctx, [795, top + 175, 900, top + 195, 980, top + 140, 1090, top + 180], 15);
  airway(ctx, [305, top + 285, 375, top + 410, 535, top + 435, 570, bottom + 25], 14);
  airway(ctx, [960, top + 320, 900, top + 435, 790, top + 455, 780, bottom + 25], 14);
  ctx.restore();
  // Thin peripheral bubbles overlap only the retaining rim.
  for (let i = 0; i < 12; i++) {
    const y = top + 23 + i * 49, x = i % 2 ? right + 10 : left - 10;
    ellipse(ctx, x, y, 28 + hash(i) * 5, 30, '#507b8a', '#b0d4d24a');
    ellipse(ctx, x - 5, y - 6, 15, 18, '#c7e1d80b', '#daece622');
  }
  ctx.save(); ctx.globalAlpha = .35;
  label(ctx, 'A L V E O L I   /   0 2', 735, top + 40, '#d0e1d5', 16);
  label(ctx, 'LUNG  ·  AIRWAY CHAMBER', 630, bottom - 19, '#bfdbd1', 11); ctx.restore();
}

export function drawLungObstacle(ctx: CanvasRenderingContext2D, obstacle: { x: number; y: number; radius: number }, opacity = 1): void {
  const r = obstacle.radius;
  ctx.save(); ctx.translate(obstacle.x, obstacle.y); ctx.scale(1, 1 / .72);
  const g = ctx.createLinearGradient(-r, -r * 1.4, r, 8); g.addColorStop(0, '#a6c3c2'); g.addColorStop(.45, '#638c9e'); g.addColorStop(1, '#304b68');
  drawRaisedBodyLayers(ctx, r, opacity, () => {
    traceRaisedObstacle(ctx, r, 'lung');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#c8e0d481'; ctx.lineWidth = 2; ctx.stroke();
    ellipse(ctx, -r * .18, -r * .74, r * .52, r * .46, '#d8ebe411', '#c9e4dd6a');
    ctx.beginPath(); ctx.ellipse(0, -r * .64, r * .77, r * .6, -.2, -.4, 1.8); ctx.strokeStyle = '#e1eee744'; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.restore();
}

export function drawLungForeground(ctx: CanvasRenderingContext2D, state: GameState, world: WorldGeometry, opacity: number): void {
  const area = world.foreground, x = area.x + area.width / 2, y = area.y + area.height / 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / .72);
  const g = ctx.createLinearGradient(0, -110, 0, 70); g.addColorStop(0, '#b1ccca'); g.addColorStop(.45, '#5d8799'); g.addColorStop(1, '#2c465f');
  for (let i = 0; i < 4; i++) {
    const sx = -area.width * .4 + i * area.width * .27, sy = Math.sin(i * 2) * 18;
    const nearFacility = state.battle?.graph.nodes.some(node => node.kind !== 'source' && Math.abs(x + sx - node.x) < 85 && Math.abs(y - node.y) < 110);
    ctx.globalAlpha = nearFacility ? Math.min(opacity, .15) : opacity * .82;
    ctx.beginPath(); ctx.moveTo(sx - 28, sy + 35); ctx.bezierCurveTo(sx - 69, sy - 18, sx - 46, sy - 104, sx, sy - 97);
    ctx.bezierCurveTo(sx + 64, sy - 103, sx + 60, sy - 12, sx + 34, sy + 35); ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#d2e6df88'; ctx.lineWidth = 2; ctx.stroke();
    ellipse(ctx, sx - 8, sy - 44, 26, 34, '#b9d8cd0a', '#c7e2d649');
    line(ctx, [sx - 12, sy + 16, sx - 31, sy - 12, sx - 21, sy - 57, sx, sy - 81], '#d2e8dd55', 1.5);
  }
  ctx.restore();
}

export function drawLungAirflow(ctx: CanvasRenderingContext2D, state: GameState, flow: LungFlowState, low: boolean): void {
  for (let i = 0; i < 10; i++) {
    const x = 330 + (i % 5) * 165, y = 300 + Math.floor(i / 5) * 240;
    const direction = lungFlowDirection(flow, { x, y }), angle = Math.atan2(direction.y, direction.x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = flow.airwayOpen ? .42 : .17;
    if (flow.airwayOpen) {
      line(ctx, [-17, 0, 15, 0], '#c4e9e0', 1.2); line(ctx, [7, -6, 15, 0, 7, 6], '#d4eee5', 1.8);
    } else { ctx.setLineDash([3, 5]); line(ctx, [-15, 0, 15, 0], '#d1dfd7', 1); }
    ctx.restore();
  }
  if (!low && flow.airwayOpen) for (let i = 0; i < 13; i++) {
    const movement = (state.elapsed * 21 + i * 77) % 160;
    const point = { x: 330 + hash(i * 3) * 620, y: 230 + hash(i * 3 + 1) * 360 }, direction = lungFlowDirection(flow, point);
    const x = point.x + direction.x * movement, y = point.y + direction.y * movement;
    ellipse(ctx, x, y, 2 + hash(i + 2) * 2, 2, '#c8eee62b');
  }
  const duration = flow.phase === 'inhale' ? CAMPAIGN_BALANCE.inhaleDuration : CAMPAIGN_BALANCE.exhaleDuration;
  const progress = Math.max(0, Math.min(1, (duration - flow.phaseRemaining) / duration));
  const expansion = flow.phase === 'inhale' ? progress : 1 - progress;
  for (const x of [385, 525, 835]) {
    ctx.save(); ctx.globalAlpha = .2; ctx.lineWidth = 1.5;
    ellipse(ctx, x, 66, 42 + expansion * 5, 58 + expansion * 7, '#b7d9d207', '#d3e8df'); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = .65; ctx.translate(670, 165); ctx.scale(1, 1 / .72);
  label(ctx, `${flow.phase === 'inhale' ? '吸气 · 聚拢' : '呼气 · 扩散'}　${Math.max(0, flow.phaseRemaining).toFixed(1)}s${flow.airwayOpen ? '' : ' · 气道已封闭'}`, 0, 0, '#d0e7dc', 11);
  ctx.restore();
}

/** Called inside a device's local (uncompressed) entity transform. */
export function drawLungAirway(ctx: CanvasRenderingContext2D, state: GameState, flow: LungFlowState, near: boolean): void {
  ellipse(ctx, 0, 2, 38, 12, '#375967', '#b7cfc4');
  for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sign * 34, -3); ctx.bezierCurveTo(sign * 43, -42, sign * 20, -65, 0, -53);
    ctx.lineTo(0, -43); ctx.bezierCurveTo(sign * 18, -49, sign * 28, -25, sign * 24, -3); ctx.closePath();
    ctx.fillStyle = '#719aa7'; ctx.fill(); ctx.strokeStyle = '#c3ded3'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(0, -24, 21, 23, 0, 0, TAU); ctx.fillStyle = flow.airwayOpen ? '#193e56' : '#a6c7c0'; ctx.fill(); ctx.strokeStyle = '#d7e7d9'; ctx.stroke();
  if (flow.airwayOpen) {
    line(ctx, [0, -38, 0, -12], '#c6eee2', 2); line(ctx, [-5, -18, 0, -12, 5, -18], '#d6f3e5', 2);
  } else {
    line(ctx, [-10, -34, 10, -14], '#416779', 2.5); line(ctx, [-10, -14, 10, -34], '#416779', 2.5);
  }
  label(ctx, flow.airwayOpen ? '气道 · 已开启' : '气道 · 已封闭', 0, 28, '#d6e7db', 11);
  label(ctx, flow.airwayOpen ? '聚散气流 / 传播' : '气流与传播均停止', 0, 44, '#b8d4c8', 9);
  if (near) {
    const cost = flow.airwayOpen ? CAMPAIGN_BALANCE.closeAirwayCost : CAMPAIGN_BALANCE.openAirwayCost;
    const cooldown = CAMPAIGN_BALANCE.airwayCooldown - (state.elapsed - flow.changedAt);
    label(ctx, cooldown > 0 ? `气道切换冷却 ${cooldown.toFixed(1)}s` : `[ E ] ${flow.airwayOpen ? '封闭' : '开启'} · 组织 −${cost}`, 0, -72, '#e2efdc', 11);
  }
  if (flow.pressureUntil > state.elapsed) label(ctx, `△ 切换承压 ${(flow.pressureUntil - state.elapsed).toFixed(1)}s`, 0, -89, '#f2d1a5', 10);
}
