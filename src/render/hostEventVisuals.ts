import type { GameState, Target } from '../game/types';
import type { HostEventZone } from '../game/hostEventTypes';
import type { SceneLabelSink } from './sceneLabels';

const TAU = Math.PI * 2;

/** Pending rounds are previews only; skipped rounds never leave visual geometry. */
function medicationVisible(zone: HostEventZone, elapsed: number): boolean {
  if (zone.medicationState === 'skipped') return false;
  const stage = zone.medicationState ?? (elapsed < zone.startsAt ? 'pending' : 'spawned');
  return elapsed >= zone.previewAt && elapsed < zone.endsAt
    && (stage === 'pending' ? elapsed < zone.startsAt : elapsed >= zone.startsAt);
}

/** Range fills stay beneath bodies and danger geometry, with a deliberately low alpha. */
export function drawHostEventGround(ctx: CanvasRenderingContext2D, state: GameState): void {
  const active = state.hostEvents?.active;
  if (!active || active.organId !== state.battle?.organId) return;
  for (const zone of active.zones) {
    if (zone.kind === 'medication' && !medicationVisible(zone, state.elapsed)) continue;
    if (state.elapsed < zone.previewAt || state.elapsed >= zone.endsAt) continue;
    if (zone.targetId && !state.targets.some(target => target.id === zone.targetId && target.hp > 0)) continue;
    const preview = state.elapsed < zone.startsAt;
    const ink = zone.kind === 'medication' ? '#408d73' : zone.kind === 'smoke' ? '#81718b' : '#aa7d40';
    ctx.save();
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.radius, 0, TAU);
    ctx.fillStyle = zone.kind === 'medication' ? '#72c59818' : zone.kind === 'smoke' ? '#92869d19' : '#b88a4b15';
    ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = preview ? 2 : 1.5;
    ctx.setLineDash(preview ? [8, 7] : [3, 6]); ctx.stroke(); ctx.setLineDash([]);
    // Sparse symbols communicate the zone even with colour vision differences.
    ctx.font = '600 16px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = ink; ctx.globalAlpha = .6;
    for (const angle of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
      ctx.fillText(zone.kind === 'medication' ? '+' : zone.kind === 'smoke' ? '≈' : '◇', zone.x + Math.cos(angle) * (zone.radius - 14), zone.y + Math.sin(angle) * (zone.radius - 14) + 5);
    }
    ctx.restore();
  }
}

/** Event objects use the ordinary target hit geometry and the existing Y-sorted layer. */
export function drawHostEventTarget(ctx: CanvasRenderingContext2D, target: Target, state: GameState): boolean {
  if (target.role !== 'event') return false;
  if (target.hp <= 0) return true;
  const smoke = state.hostEvents?.active?.id === 'SMOKE', r = target.radius;
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
  ctx.beginPath(); ctx.ellipse(0, 2, r * 1.15, r * .35, 0, 0, TAU);
  ctx.fillStyle = '#493b3a1c'; ctx.fill();
  const gradient = ctx.createLinearGradient(-r, -r * 2, r, 0);
  gradient.addColorStop(0, target.hitUntil > state.elapsed ? '#fff3cf' : smoke ? '#c7bdcc' : '#e6c995');
  gradient.addColorStop(1, smoke ? '#86778c' : '#b28b55');
  ctx.beginPath();
  if (smoke) {
    ctx.moveTo(-r * .68, -3); ctx.quadraticCurveTo(-r * 1.03, -r * .95, -r * .45, -r * 1.15);
    ctx.bezierCurveTo(-r * .72, -r * 1.95, r * .32, -r * 1.9, r * .35, -r * 1.2);
    ctx.bezierCurveTo(r * 1.02, -r * 1.25, r * .96, -r * .1, r * .65, -2);
  } else {
    ctx.moveTo(-r * .9, -2); ctx.lineTo(-r * .62, -r * 1.08); ctx.lineTo(-r * .18, -r * .85);
    ctx.lineTo(r * .25, -r * 1.55); ctx.lineTo(r * .8, -r * .72); ctx.lineTo(r * .96, -2);
  }
  ctx.closePath(); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = smoke ? '#685c70' : '#8d6d3e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff9e3'; ctx.font = `600 ${Math.max(16, r)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(smoke ? '≈' : '◇', 0, -r * .42);
  ctx.beginPath(); ctx.ellipse(0, 2, r, r * .35, 0, 0, TAU); ctx.strokeStyle = '#ad5148'; ctx.lineWidth = 1.5; ctx.stroke();
  if (target.hitUntil > state.elapsed) {
    ctx.strokeStyle = '#fff8ce'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-8, -r); ctx.lineTo(8, -r); ctx.moveTo(0, -r - 8); ctx.lineTo(0, -r + 8); ctx.stroke();
  }
  ctx.restore(); return true;
}

export function drawHostEventLabels(state: GameState, labels: SceneLabelSink): void {
  const active = state.hostEvents?.active;
  if (!active || active.organId !== state.battle?.organId) return;
  for (const zone of active.zones) {
    if (zone.kind !== 'medication' || !medicationVisible(zone, state.elapsed)) continue;
    const preview = state.elapsed < zone.startsAt;
    labels.add({ id: `host-zone:${zone.id}`, anchor: zone, offset: { x: 0, y: -zone.radius * .72 - 10 }, priority: 55,
      lines: [{ text: preview ? `+ 净化药区 ${(zone.startsAt - state.elapsed).toFixed(1)}s` : '+ 净化药区 · 引怪进入', color: '#286d52', size: 10 }] });
  }
  for (const id of active.targetIds) {
    const target = state.targets.find(item => item.id === id && item.hp > 0);
    if (!target) continue;
    const smoke = active.id === 'SMOKE';
    labels.add({ id: `host-target:${id}`, anchor: target, offset: { x: 0, y: -target.radius * 1.8 - 8 }, priority: 65,
      lines: [{ text: smoke ? '≈ 污染源 · 1 净化' : '◇ 沉积 · 1 净化', color: smoke ? '#685272' : '#80602c', size: 10 }],
      bar: { ratio: target.hp / target.maxHp, color: smoke ? '#8b7596' : '#b68d4d', width: target.radius * 2.2 } });
  }
}
