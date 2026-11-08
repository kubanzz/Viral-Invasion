import { BLADE_TECHNIQUES } from '../game/bladeTechniques';
import { BALANCE, type GameEvent, type GameState, type Vec } from '../game/types';
import type { BladeTraceState } from '../game/weaponSkillsTypes';
import type { WeaponEffectImage, WeaponEffectScreenScale } from './weaponUltimateVisuals';
import type { CombatVfxOptions } from './combatVfxOptions';

const TAU = Math.PI * 2;
/** Fixed work per frame, independent of the enemy count and the event-log length. */
export const BLADE_TRACE_VFX_BUDGET = { eventScan: 512, routePoints: BLADE_TECHNIQUES.trace.maximumRoutePoints,
  connections: 4, impacts: 4, finales: 1, afterimages: 8 } as const;
const LIFE = { BLADE_TRACE_MARK_CONNECTED: .3, BLADE_TRACE_IMPACT: .38, BLADE_TRACE_FINISHED: .55 } as const;
type TraceVfxEvent = GameEvent & { type: keyof typeof LIFE };
const finite = (point: Vec): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const visualTime = (state: GameState): number => state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;

export function bladeTraceReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** `width` is a swept radius in the damage system; the preview paints its full diameter. */
export function bladeTracePreviewWidth(manual: boolean): number {
  return 2 * (manual ? BLADE_TECHNIQUES.trace.manualWidth : BLADE_TECHNIQUES.trace.width);
}
export function bladeTraceVfxEvents(state: GameState): TraceVfxEvent[] {
  const now = visualTime(state), unique = new Map<string, TraceVfxEvent>();
  const start = Math.max(0, state.events.length - BLADE_TRACE_VFX_BUDGET.eventScan);
  for (let n = start; n < state.events.length; n++) {
    const event = state.events[n];
    if (!Object.hasOwn(LIFE, event.type) || event.tick > state.tick) continue;
    const type = event.type as keyof typeof LIFE, age = now - event.tick * BALANCE.step;
    if (age < 0 || age > LIFE[type] || !Number.isFinite(Number(event.data.x)) || !Number.isFinite(Number(event.data.y))) continue;
    const key = `${type}:${String(event.data.castId)}:${type === 'BLADE_TRACE_FINISHED' ? '' : String(event.data.mark)}`;
    if (!unique.has(key)) unique.set(key, event as TraceVfxEvent);
  }
  const caps = { BLADE_TRACE_MARK_CONNECTED: BLADE_TRACE_VFX_BUDGET.connections,
    BLADE_TRACE_IMPACT: BLADE_TRACE_VFX_BUDGET.impacts, BLADE_TRACE_FINISHED: BLADE_TRACE_VFX_BUDGET.finales };
  const accepted: TraceVfxEvent[] = [];
  for (const event of [...unique.values()].reverse()) if (caps[event.type]-- > 0) accepted.push(event);
  return accepted.reverse();
}
function strokePath(ctx: CanvasRenderingContext2D, path: readonly Vec[]): void {
  ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
  for (let n = 1; n < path.length; n++) ctx.lineTo(path[n].x, path[n].y);
  ctx.stroke();
}
/** Samples the actual travelled polyline, including turns around solid folds. */
export function bladeTraceRouteWindow(route: readonly Vec[], start: number, end: number): Vec[] {
  const result: Vec[] = []; let travelled = 0;
  for (let n = 1; n < Math.min(route.length, BLADE_TRACE_VFX_BUDGET.routePoints); n++) {
    const from = route[n - 1], to = route[n];
    if (!finite(from) || !finite(to)) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > 0 && travelled + length >= start && travelled <= end) {
      const a = clamp((start - travelled) / length), b = clamp((end - travelled) / length);
      if (!result.length) result.push({ x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a });
      result.push({ x: from.x + (to.x - from.x) * b, y: from.y + (to.y - from.y) * b });
    }
    travelled += length;
    if (travelled >= end) break;
  }
  return result;
}
function silhouette(ctx: CanvasRenderingContext2D, point: Vec, angle: number, alpha: number): void {
  ctx.save(); ctx.translate(point.x, point.y); ctx.scale(Math.cos(angle) < 0 ? -1 : 1, 1);
  ctx.globalAlpha = alpha; ctx.fillStyle = '#f9e3ac'; ctx.strokeStyle = '#ffeec4'; ctx.lineWidth = 1.2;
  // A leaning head, coat, trailing cape and extended legs read as a swordsman even without a texture.
  ctx.beginPath(); ctx.arc(3, -37, 6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2, -31); ctx.lineTo(13, -22); ctx.lineTo(8, -9); ctx.lineTo(-9, -13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a93841'; ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(-32, -19); ctx.lineTo(-16, -15); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#fff1d0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(-23, 2); ctx.moveTo(6, -12); ctx.lineTo(19, -1); ctx.moveTo(8, -25); ctx.lineTo(24, -23); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, -23); ctx.lineTo(63, -33); ctx.stroke(); ctx.restore();
}
function drawExecution(ctx: CanvasRenderingContext2D, trace: BladeTraceState, image?: WeaponEffectImage): void {
  const distance = trace.elapsedDistance, trail = bladeTraceRouteWindow(trace.route, Math.max(0, distance - 390), distance);
  if (trail.length < 2) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Continuous ribbons come from distance along the authoritative route, never per-tick particle spawning.
  ctx.globalAlpha = .22; ctx.strokeStyle = '#b63643'; ctx.lineWidth = bladeTracePreviewWidth(trace.manual) * .58; strokePath(ctx, trail);
  ctx.globalAlpha = .8; ctx.strokeStyle = '#e49b55'; ctx.lineWidth = 17; strokePath(ctx, trail);
  ctx.globalAlpha = .98; ctx.strokeStyle = '#fff9d9'; ctx.lineWidth = 4; strokePath(ctx, trail);
  const texture = image?.('sanctum.fx.pierce');
  for (let n = BLADE_TRACE_VFX_BUDGET.afterimages; n >= 1; n--) {
    const at = distance - n * 43; if (at <= 0) continue;
    const sample = bladeTraceRouteWindow(trace.route, Math.max(0, at - 1), at);
    if (sample.length < 2) continue;
    const from = sample[0], point = sample.at(-1)!, angle = Math.atan2(point.y - from.y, point.x - from.x);
    const alpha = .48 * (1 - n / (BLADE_TRACE_VFX_BUDGET.afterimages + 1));
    if (texture && n % 2 === 0) {
      ctx.save(); ctx.globalAlpha = alpha * .8; ctx.translate(point.x, point.y - 16); ctx.rotate(angle);
      ctx.drawImage(texture, -82, -28, 130, 56); ctx.restore();
    }
    silhouette(ctx, point, angle, alpha);
  }
  ctx.restore();
}
function cross(ctx: CanvasRenderingContext2D, radius: number, split = 0): void {
  ctx.beginPath(); ctx.moveTo(-radius, radius * .48 - split); ctx.lineTo(radius, -radius * .48 - split);
  ctx.moveTo(-radius * .42, -radius * .6 + split); ctx.lineTo(radius * .42, radius * .6 + split); ctx.stroke();
}
function drawImpact(ctx: CanvasRenderingContext2D, event: TraceVfxEvent, age: number, quiet: boolean): void {
  const progress = clamp(age / LIFE.BLADE_TRACE_IMPACT), radius = Number(event.data.radius)
    || (event.data.manual ? BLADE_TECHNIQUES.trace.manualImpactRadius : BLADE_TECHNIQUES.trace.impactRadius);
  ctx.save(); ctx.translate(Number(event.data.x), Number(event.data.y)); ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = '#edbe75'; ctx.lineWidth = quiet ? 2 : 4;
  ctx.beginPath(); ctx.arc(0, 0, radius * (.24 + .76 * progress), 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#fff7dc'; ctx.lineWidth = quiet ? 2 : 5; cross(ctx, quiet ? 24 : 46 * (1 - progress * .55));
  if (!quiet) {
    ctx.strokeStyle = '#ad3346'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, radius * (.13 + .54 * progress), 0, TAU); ctx.stroke();
    for (let n = 0; n < 4; n++) {
      const a = n / 4 * TAU + Math.PI / 4, inner = 30 + progress * 45, outer = inner + 24 * (1 - progress);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawFinale(ctx: CanvasRenderingContext2D, event: TraceVfxEvent, age: number, quiet: boolean, image?: WeaponEffectImage): void {
  const progress = clamp(age / LIFE.BLADE_TRACE_FINISHED), split = quiet ? 0 : clamp((age - .11) / .22) * 13;
  ctx.save(); ctx.translate(Number(event.data.x), Number(event.data.y)); ctx.rotate(-Math.PI / 4);
  ctx.globalAlpha = (1 - progress) * (quiet ? .65 : .9); ctx.lineCap = 'round';
  const length = quiet ? 160 : 265;
  for (const side of quiet ? [0] : [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(-length, side * split); ctx.lineTo(length, side * split);
    ctx.strokeStyle = '#b63c49'; ctx.lineWidth = quiet ? 5 : 12 * (1 - progress) + 2; ctx.stroke();
    ctx.strokeStyle = '#fff3c3'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.translate(Number(event.data.x), Number(event.data.y)); ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = '#fff5ce'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -12, 10 + progress * 36, 0, TAU); ctx.stroke();
  const texture = !quiet && image?.('sanctum.fx.sheathe');
  if (texture) ctx.drawImage(texture, -82, -94, 164, 164);
  ctx.restore();
}
/** World-only presentation. The screen cut-in, camera and damage are owned elsewhere. */
export function drawBladeTraceEffects(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false,
  showHint = true, image?: WeaponEffectImage, screenScale?: WeaponEffectScreenScale, options: CombatVfxOptions = {}): void {
  const trace = state.weaponCombat?.bladeTrace, now = visualTime(state), quiet = lowEffects || bladeTraceReducedMotion();
  if (trace) {
    const path = (trace.phase === 'drawing' ? trace.path : trace.route).slice(0, BLADE_TRACE_VFX_BUDGET.routePoints).filter(finite);
    const fade = trace.phase === 'recovery' ? clamp((trace.until - now) / BLADE_TECHNIQUES.trace.recovery) : 1;
    if (path.length > 1) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = fade * (quiet ? .11 : .08); ctx.strokeStyle = '#f4bd68';
      ctx.lineWidth = bladeTracePreviewWidth(trace.manual); strokePath(ctx, path);
      ctx.globalAlpha = fade * .8; ctx.strokeStyle = '#a53748'; ctx.lineWidth = quiet ? 5 : 7; strokePath(ctx, path);
      ctx.strokeStyle = '#fff5ce'; ctx.lineWidth = 2; strokePath(ctx, path); ctx.restore();
      if (trace.phase === 'executing' && !quiet) drawExecution(ctx, trace, image);
    }
    if (!screenScale?.deferTraceMarkers) drawBladeTraceMarkers(ctx, state, lowEffects, showHint, screenScale);
  }
  for (const event of bladeTraceVfxEvents(state)) {
    if (options.nativeVfx) break;
    const age = now - event.tick * BALANCE.step;
    if (event.type === 'BLADE_TRACE_IMPACT') drawImpact(ctx, event, age, quiet);
    else if (event.type === 'BLADE_TRACE_FINISHED') drawFinale(ctx, event, age, quiet, image);
    else {
      const progress = clamp(age / LIFE.BLADE_TRACE_MARK_CONNECTED);
      ctx.save(); ctx.translate(Number(event.data.x), Number(event.data.y)); ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = '#fff1bb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13 + progress * (quiet ? 10 : 31), 0, TAU); ctx.stroke();
      if (!quiet) { ctx.lineWidth = 2; cross(ctx, 18 + progress * 14); }
      ctx.restore();
    }
  }
}

/** Input landmarks remain readable above entity labels and health bars in every effects setting. */
export function drawBladeTraceMarkers(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false,
  showHint = true, screenScale?: WeaponEffectScreenScale): void {
  const trace = state.weaponCombat?.bladeTrace; if (!trace) return;
  const now = visualTime(state), quiet = lowEffects || bladeTraceReducedMotion();
  const remaining = clamp((trace.deadline - now) / BLADE_TECHNIQUES.trace.drawSeconds);
  for (const mark of trace.marks.slice(0, 4)) {
    if (mark.resolved || !finite(mark)) continue;
    ctx.save(); ctx.translate(mark.x, mark.y);
    if (screenScale) ctx.scale(1 / Math.max(.01, screenScale.x), 1 / Math.max(.01, screenScale.y));
    const pulse = quiet || trace.phase !== 'drawing' ? 1 : 1 + Math.sin(now * 12 + mark.id) * .1;
    ctx.globalAlpha = mark.connected ? .85 : 1;
    if (!quiet) { ctx.shadowColor = '#ffe7aa'; ctx.shadowBlur = 14; }
    ctx.fillStyle = mark.connected ? '#df9655' : '#fff4cc'; ctx.strokeStyle = '#943e4e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10 * pulse, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = mark.connected ? '#f5bb75' : '#ffe3ac'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (trace.phase === 'drawing' ? remaining : 1)); ctx.stroke();
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#552536';
    ctx.fillText(String(mark.id + 1), 0, 0); ctx.restore();
  }
  if (trace.phase === 'drawing' && showHint) {
    ctx.save(); ctx.translate(state.player.x, state.player.y);
    if (screenScale) ctx.scale(1 / Math.max(.01, screenScale.x), 1 / Math.max(.01, screenScale.y));
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff1c4'; ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#402d3d'; ctx.lineWidth = 4;
    const text = `连接四曜 ${trace.marks.filter(mark => mark.connected).length}/4 · ${Math.max(0, trace.deadline - now).toFixed(1)}秒`;
    ctx.strokeText(text, 0, -64); ctx.fillText(text, 0, -64); ctx.restore();
  }
}
