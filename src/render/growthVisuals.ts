import type { GrowthState } from '../game/growthTypes';
import type { GameState, Vec } from '../game/types';

const TAU = Math.PI * 2;
function ellipse(ctx: CanvasRenderingContext2D, p: Vec, radius: number, fill: string, stroke: string): void {
  ctx.beginPath(); ctx.ellipse(p.x, p.y, radius, radius, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.stroke();
}
function line(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 10): void {
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, x, y);
}

type Trail = { at: number; points: Vec[] };

/** Small bounded presentation histories contain only positions actually rendered. */
export class GrowthVisuals {
  private run = '';
  private lastElapsed = -1;
  private trails = new Map<string, Trail>();

  private prepare(state: GameState, growth: GrowthState): void {
    const run = `${growth.runId}:${state.battle?.organId}`;
    if (this.run !== run || state.elapsed < this.lastElapsed) { this.trails.clear(); this.run = run; }
    this.lastElapsed = state.elapsed;
    const ids = new Set(growth.marks.filter(mark => mark.organId === state.battle?.organId && mark.until > state.elapsed).map(mark => mark.targetId));
    for (const id of this.trails.keys()) if (!ids.has(id)) this.trails.delete(id);
    for (const target of state.targets) {
      if (target.hp <= 0 || !ids.has(target.id)) continue;
      const trail = this.trails.get(target.id) ?? { at: -Infinity, points: [] };
      if (state.elapsed - trail.at >= .15) {
        const last = trail.points.at(-1);
        if (!last || Math.hypot(target.x - last.x, target.y - last.y) > 2) {
          trail.points.push({ x: target.x, y: target.y });
          if (trail.points.length > 4) trail.points.shift();
        }
        trail.at = state.elapsed;
      }
      this.trails.set(target.id, trail);
    }
  }

  drawGround(ctx: CanvasRenderingContext2D, state: GameState, growth: GrowthState | undefined, low: boolean): void {
    if (!growth || !state.battle) { this.trails.clear(); return; }
    this.prepare(state, growth);
    for (const [id, trail] of this.trails) {
      const target = state.targets.find(item => item.id === id);
      if (!target || target.hp <= 0) continue;
      const points = low ? trail.points.slice(-2) : trail.points;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        ctx.save(); ctx.globalAlpha = .18 + (i + 1) / points.length * .38;
        line(ctx, { x: point.x - 3, y: point.y - 3 }, { x: point.x + 3, y: point.y + 3 }, '#adefdf', 2);
        line(ctx, { x: point.x - 3, y: point.y + 3 }, { x: point.x + 3, y: point.y - 3 }, '#adefdf', 1);
        ctx.restore();
      }
    }
    const beacon = growth.beacon;
    if (!beacon || beacon.organId !== state.battle.organId || beacon.until <= state.elapsed) return;
    ctx.save(); ctx.lineWidth = 1.5; ctx.setLineDash([5, 9]);
    ellipse(ctx, beacon, beacon.radius, '#9df4dc04', '#a6e9ce66'); ctx.setLineDash([]);
    const remaining = Math.max(0, Math.min(1, (beacon.until - state.elapsed) / (beacon.until - beacon.born)));
    ellipse(ctx, beacon, 28, '#a4f3d412', '#a8e9cf77');
    ctx.beginPath(); ctx.arc(beacon.x, beacon.y, 33, -Math.PI / 2, -Math.PI / 2 + TAU * remaining);
    ctx.strokeStyle = '#b7f4d8'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  drawBeacon(ctx: CanvasRenderingContext2D, state: GameState, growth: GrowthState | undefined): void {
    const beacon = growth?.beacon;
    if (!beacon || beacon.organId !== state.battle?.organId || beacon.until <= state.elapsed) return;
    ctx.save(); ctx.translate(beacon.x, beacon.y); ctx.scale(1, 1 / .72);
    ctx.beginPath(); ctx.ellipse(0, 2, 22, 8, 0, 0, TAU); ctx.fillStyle = '#284f4e'; ctx.fill(); ctx.strokeStyle = '#9bd8bc'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-13, -23, 26, 24, 8); ctx.fillStyle = '#c3e3cf'; ctx.fill(); ctx.strokeStyle = '#3c7069'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -22, 13, 5, 0, 0, TAU); ctx.fillStyle = '#edebd6'; ctx.fill(); ctx.strokeStyle = '#b0d3bf'; ctx.stroke();
    const y = -38 + Math.sin(state.elapsed * 3) * 1.5;
    ctx.beginPath(); ctx.roundRect(-10, y - 10, 20, 20, 6); ctx.fillStyle = '#e3f3d6'; ctx.fill(); ctx.strokeStyle = '#4f9a89'; ctx.stroke();
    line(ctx, { x: -5, y }, { x: 5, y }, '#428e7d', 3); line(ctx, { x: 0, y: y - 5 }, { x: 0, y: y + 5 }, '#428e7d', 3);
    label(ctx, `✚ 灯塔 ${(beacon.until - state.elapsed).toFixed(1)}s`, 0, 24, '#c3efd5', 10);
    ctx.restore();
  }

  drawMarks(ctx: CanvasRenderingContext2D, state: GameState, growth: GrowthState | undefined): void {
    if (!growth || !state.battle) return;
    for (const mark of growth.marks) {
      if (mark.organId !== state.battle.organId || mark.until <= state.elapsed) continue;
      const target = state.targets.find(item => item.id === mark.targetId && item.hp > 0);
      if (!target) continue;
      ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, -target.radius * .7, target.radius * 1.4, target.radius * 1.2, 0, 0, TAU); ctx.strokeStyle = '#b8f2e1'; ctx.stroke(); ctx.setLineDash([]);
      const y = -target.radius * .7;
      for (const sign of [-1, 1]) line(ctx, { x: sign * (target.radius + 7), y: y - 5 }, { x: sign * (target.radius + 7), y: y + 5 }, '#cdf8e8', 2);
      ctx.restore();
    }
  }

  drawProtocolHits(ctx: CanvasRenderingContext2D, state: GameState, growth: GrowthState | undefined): void {
    if (!growth || !state.battle) return;
    const visible = state.events.filter(event => state.tick >= event.tick && state.tick - event.tick <= 30);
    for (const event of visible) {
      if (!['PROTOCOL_RESONANCE_HIT', 'PROTOCOL_CHAIN_HIT', 'PROTOCOL_BEACON_HIT'].includes(event.type)) continue;
      const target = state.targets.find(item => item.id === event.data.targetId);
      if (!target) continue;
      const progress = (state.tick - event.tick) / 30;
      ctx.save(); ctx.globalAlpha = 1 - progress;
      if (event.type === 'PROTOCOL_RESONANCE_HIT') {
        ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
        for (let i = 0; i < 3; i++) {
          const angle = -Math.PI + i * Math.PI * .5, distance = target.radius * (1 + progress * .8);
          const x = Math.cos(angle) * distance, y = -target.radius * .8 + Math.sin(angle) * distance;
          ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 2, y - 6); ctx.lineTo(x + 6, y + 3); ctx.closePath();
          ctx.fillStyle = '#ddd0e4'; ctx.fill(); ctx.strokeStyle = '#fff0bf'; ctx.lineWidth = 1; ctx.stroke();
        }
      } else if (event.type === 'PROTOCOL_CHAIN_HIT') {
        const hop = Number(event.data.hop);
        if (Number.isInteger(hop) && hop >= 1 && hop <= 3) {
          ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
          ctx.beginPath(); ctx.ellipse(target.radius + 7, -target.radius * .7, 8, 8, 0, 0, TAU); ctx.fillStyle = '#254b49'; ctx.fill(); ctx.strokeStyle = '#bcf8d9'; ctx.lineWidth = 1; ctx.stroke();
          label(ctx, String(hop), target.radius + 7, -target.radius * .7 + 3, '#ddffe7', 10);
        }
      } else {
        const beacon = growth.beacon;
        if (event.data.prioritizedTrace === true && beacon && beacon.organId === state.battle.organId && String(event.data.rootId).startsWith(`${beacon.id}:attack:`)) {
          ctx.setLineDash([3, 7]); line(ctx, beacon, target, '#c0f4df', 1.5); ctx.setLineDash([]);
          const r = target.radius + 10;
          line(ctx, { x: target.x - r, y: target.y - r }, { x: target.x - r + 8, y: target.y - r }, '#dbffeb', 2);
          line(ctx, { x: target.x - r, y: target.y - r }, { x: target.x - r, y: target.y - r + 8 }, '#dbffeb', 2);
          line(ctx, { x: target.x + r, y: target.y + r }, { x: target.x + r - 8, y: target.y + r }, '#dbffeb', 2);
          line(ctx, { x: target.x + r, y: target.y + r }, { x: target.x + r, y: target.y + r - 8 }, '#dbffeb', 2);
        }
      }
      ctx.restore();
    }
  }
}
