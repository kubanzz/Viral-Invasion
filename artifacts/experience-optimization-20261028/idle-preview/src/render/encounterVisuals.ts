import type { GameState, Vec } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';

const TAU = Math.PI * 2;
function line(ctx: CanvasRenderingContext2D, from: Vec, to: Vec): void { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); }
function ring(ctx: CanvasRenderingContext2D, point: Vec, radius: number): void { ctx.beginPath(); ctx.ellipse(point.x, point.y, radius, radius, 0, 0, TAU); ctx.stroke(); }
function label(ctx: CanvasRenderingContext2D, at: Vec, value: string, color: string): void {
  ctx.save(); ctx.translate(at.x, at.y); ctx.scale(1, 1 / .72); ctx.font = '500 10px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#17252dd9'; ctx.fillStyle = color; ctx.strokeText(value, 0, 0); ctx.fillText(value, 0, 0); ctx.restore();
}
function corners(ctx: CanvasRenderingContext2D, at: Vec, radius: number): void {
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(at.x + x * (radius - 7), at.y + y * radius); ctx.lineTo(at.x + x * radius, at.y + y * radius); ctx.lineTo(at.x + x * radius, at.y + y * (radius - 7)); ctx.stroke();
  }
}

function caption(ctx: CanvasRenderingContext2D, labels: SceneLabelSink | undefined, id: string, anchor: Vec, offset: Vec, value: string, color: string, priority: number): void {
  // These offsets were applied before the old text's local uncompression: they
  // are world distances, while the shared sink expects uncompressed offsets.
  if (labels) labels.add({ id, anchor, offset: { x: offset.x, y: offset.y * .72 }, priority, essential: priority >= 100, lines: [{ text: value, color, size: 10 }] });
  else label(ctx, { x: anchor.x + offset.x, y: anchor.y + offset.y }, value, color);
}

/** Protect thin contours, rather than reserving the entire source-to-tissue area. */
function protectLine(labels: SceneLabelSink | undefined, from: Vec, to: Vec, margin = 4): void {
  if (!labels?.reserveWorld) return;
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 36));
  for (let i = 0; i < count; i++) {
    const x1 = from.x + (to.x - from.x) * i / count, y1 = from.y + (to.y - from.y) * i / count;
    const x2 = from.x + (to.x - from.x) * (i + 1) / count, y2 = from.y + (to.y - from.y) * (i + 1) / count;
    labels.reserveWorld({ left: Math.min(x1, x2) - margin, right: Math.max(x1, x2) + margin, top: Math.min(y1, y2) - margin, bottom: Math.max(y1, y2) + margin });
  }
}
function protectRing(labels: SceneLabelSink | undefined, at: Vec, radius: number): void {
  if (!labels?.reserveWorld) return;
  for (let i = 0; i < 16; i++) protectLine(labels,
    { x: at.x + Math.cos(i / 16 * TAU) * radius, y: at.y + Math.sin(i / 16 * TAU) * radius },
    { x: at.x + Math.cos((i + 1) / 16 * TAU) * radius, y: at.y + Math.sin((i + 1) / 16 * TAU) * radius });
}

/** Essential crisis cues are composited after bodies, foreground and effects. */
export function drawEncounterDangers(ctx: CanvasRenderingContext2D, state: GameState, lowEffects: boolean, labels?: SceneLabelSink): void {
  const battle = state.battle;
  if (!battle || !['playing', 'paused'].includes(state.phase)) return;
  const crisis = state.campaign?.encounters?.crisis;
  if (crisis && crisis.organId === battle.organId && ['arming', 'charging', 'exhausted'].includes(crisis.status)) {
    const source = state.targets.find(target => target.id === crisis.sourceId && target.hp > 0);
    if (source) {
      const tissue = state.tissue, dx = tissue.x - source.x, dy = tissue.y - source.y, length = Math.hypot(dx, dy);
      const charging = crisis.status === 'charging' && !crisis.blockedByAirway && crisis.nextImpactAt !== null;
      const color = charging ? '#ecc193' : '#b5d6be';
      ctx.save(); const originalAlpha = ctx.globalAlpha; ctx.strokeStyle = color; ctx.lineWidth = lowEffects ? 1.5 : 1.7;
      ctx.setLineDash(crisis.status === 'exhausted' ? [2, 8] : [7, 10]);
      ring(ctx, source, source.radius + 12); ctx.setLineDash([]); corners(ctx, source, source.radius + 17);
      protectRing(labels, source, source.radius + 12);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        const corner = { x: source.x + x * (source.radius + 17), y: source.y + y * (source.radius + 17) };
        protectLine(labels, { x: corner.x - x * 7, y: corner.y }, corner);
        protectLine(labels, corner, { x: corner.x, y: corner.y - y * 7 });
      }
      if (length > source.radius + tissue.radius + 28 && crisis.status !== 'exhausted') {
        const ux = dx / length, uy = dy / length;
        ctx.globalAlpha = originalAlpha * (charging ? .58 : .32); ctx.setLineDash([6, 15]);
        const from = { x: source.x + ux * (source.radius + 15), y: source.y + uy * (source.radius + 15) }, to = { x: tissue.x - ux * (tissue.radius + 20), y: tissue.y - uy * (tissue.radius + 20) };
        line(ctx, from, to); protectLine(labels, from, to);
        ctx.setLineDash([]);
        for (const fraction of [.38, .68]) {
          const x = source.x + dx * fraction, y = source.y + dy * fraction;
          ctx.beginPath(); ctx.moveTo(x - ux * 8 - uy * 5, y - uy * 8 + ux * 5); ctx.lineTo(x, y); ctx.lineTo(x - ux * 8 + uy * 5, y - uy * 8 - ux * 5); ctx.stroke();
          protectLine(labels, { x: x - ux * 8 - uy * 5, y: y - uy * 8 + ux * 5 }, { x, y });
          protectLine(labels, { x, y }, { x: x - ux * 8 + uy * 5, y: y - uy * 8 - ux * 5 });
        }
        ctx.globalAlpha = originalAlpha; ctx.setLineDash(charging ? [5, 6] : [2, 9]); ring(ctx, tissue, tissue.radius + 22); ctx.setLineDash([]);
        protectRing(labels, tissue, tissue.radius + 22);
        const text = crisis.blockedByAirway ? '截流暂停' : !charging || state.phase === 'paused' ? '冲击暂停' : `冲击 ${Math.max(0, crisis.chargeRemaining).toFixed(1)}s`;
        caption(ctx, labels, `crisis:${crisis.sourceId}:countdown`, tissue, { x: 0, y: tissue.radius + 40 }, text, color, 100);
      }
      caption(ctx, labels, `crisis:${crisis.sourceId}:source`, source, { x: 0, y: source.radius + 30 }, crisis.status === 'exhausted' ? '冲击停止 · 净化危机源' : '危机源 · 净化可根治', color, 100);
      ctx.restore();
    }
    return;
  }
}

/** Introductory ground hints yield to actual crisis, overload and migration. */
export function drawEncounterGround(ctx: CanvasRenderingContext2D, state: GameState, _lowEffects: boolean, labels?: SceneLabelSink): void {
  const battle = state.battle;
  if (!battle || !['playing', 'paused'].includes(state.phase)) return;
  const crisis = state.campaign?.encounters?.crisis;
  if (crisis && ['arming', 'charging', 'exhausted'].includes(crisis.status)) return;
  const first = battle.encounter?.firstCounter, migration = state.campaign?.migration;
  if (!first || battle.encounter?.configId !== 'campaign-1' || battle.pressure.criticalSince !== null || battle.pressure.organAlarm || migration && ['warning', 'blocking', 'pursuing'].includes(migration.status)) return;
  if (first.status !== 'active' && first.status !== 'warning') return;
  ctx.save(); ctx.strokeStyle = '#b7e7c9aa'; ctx.lineWidth = 1.4;
  const guardian = first.targetId ? state.targets.find(target => target.id === first.targetId && target.hp > 0) : undefined;
  if (guardian) { ctx.setLineDash([4, 7]); ring(ctx, guardian, guardian.radius + 10); ctx.setLineDash([]); corners(ctx, guardian, guardian.radius + 15); }
  const valve = battle.graph.nodes.find(node => node.kind === 'valve');
  if (valve && battle.encounter.guideVariant === 'guided' && first.guideStatus === 'active') {
    const dx = valve.x - state.player.x, dy = valve.y - state.player.y, distance = Math.hypot(dx, dy);
    ring(ctx, valve, 43);
    if (distance > 110) {
      const ux = dx / distance, uy = dy / distance, x = state.player.x + ux * 50, y = state.player.y + uy * 50;
      ctx.beginPath(); ctx.moveTo(x - ux * 11 - uy * 6, y - uy * 11 + ux * 6); ctx.lineTo(x, y); ctx.lineTo(x - ux * 11 + uy * 6, y - uy * 11 - ux * 6); ctx.stroke();
      caption(ctx, labels, 'first-counter:valve', { x, y }, { x: ux * 24, y: uy * 24 + 20 }, `阀门 · ${Math.round(distance)}`, '#c7ead4', 50);
    } else caption(ctx, labels, 'first-counter:valve', valve, { x: 0, y: 65 }, 'E · 朝威胁方向冲流', '#c7ead4', 50);
  }
  ctx.restore();
}

/** Compatibility for isolated consumers; the production renderer calls the two passes separately. */
export function drawEncounterSignals(ctx: CanvasRenderingContext2D, state: GameState, lowEffects: boolean, labels?: SceneLabelSink): void {
  drawEncounterGround(ctx, state, lowEffects, labels);
  drawEncounterDangers(ctx, state, lowEffects, labels);
}
