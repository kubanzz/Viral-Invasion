import { BALANCE, type GameEvent, type GameState, type Vec } from '../game/types';
import type { SeraphRole } from '../game/seraphCombat';
import type { CombatVfxOptions } from './combatVfxOptions';

const TAU = Math.PI * 2;
export const SERAPH_VFX_BUDGET = { eventScan: 64, pending: 64, active: 32, lowActive: 12,
  remembered: 128, echoBodies: 20, echoSamples: 4, particles: 6 } as const;
export type { SeraphRole } from '../game/seraphCombat';
export type SeraphCueKind = 'windup' | 'release' | 'hit' | 'focus' | 'echo';
type ClearReason = 'reset' | 'scope' | 'camp' | 'death' | 'left-scene';
export interface SeraphCue {
  key: string; kind: SeraphCueKind; tick: number; cellId: string; role: SeraphRole;
  attack: string; actionId: string; focusId: string; from: Vec; to: Vec;
  duration: number; damage: number; targetId: string; part: number; sequence: number; strong: boolean;
}
interface EchoSample extends Vec { at: number }
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const names: Readonly<Record<string, SeraphCueKind>> = {
  LEGION_SERAPH_WINDUP: 'windup', LEGION_SERAPH_RELEASED: 'release', LEGION_SERAPH_HIT: 'hit',
  LEGION_SERAPH_FOCUS: 'focus', LEGION_SERAPH_ECHO: 'echo',
};
/** Only simulation receipts may create an effect. Missing geometry never becomes an invented hit. */
export function seraphCue(event: GameEvent): SeraphCue | undefined {
  const kind = names[event.type];
  if (!kind || !Number.isInteger(event.tick) || event.tick < 0) return undefined;
  const d = event.data, x = number(d.x), y = number(d.y), fromX = number(d.fromX), fromY = number(d.fromY);
  if (x === undefined || y === undefined || fromX === undefined || fromY === undefined) return undefined;
  const damage = number(d.damage) ?? 0;
  if (kind === 'hit' && damage <= 0) return undefined;
  const role = d.role === 'commander' || d.role === 'leader' ? 'commander' : d.role === 'prism' || d.role === 'chanter' ? 'prism' : 'lancer';
  const cellId = typeof d.cellId === 'string' ? d.cellId : '', actionId = String(d.actionId ?? d.orderId ?? d.focusId ?? event.tick);
  const targetId = typeof d.targetId === 'string' ? d.targetId : '';
  const life = kind === 'windup' ? Math.min(.5, Math.max(.08, number(d.duration) ?? .28))
    : kind === 'release' ? .24 : kind === 'hit' ? .2 : kind === 'focus' ? .65 : .38;
  const part = number(d.part) ?? 0, sequence = number(d.sequence) ?? 0;
  return { key: `${event.type}:${actionId}:${cellId}:${part}:${sequence}:${targetId}`, kind, tick: event.tick,
    role, cellId, actionId, targetId, part, sequence, strong: d.strong === true, attack: String(d.attack ?? ''), focusId: String(d.orderId ?? d.focusId ?? ''),
    from: { x: fromX, y: fromY }, to: { x, y }, damage, duration: life };
}
function priority(cue: SeraphCue): number { return cue.kind === 'hit' ? 3 : cue.kind === 'focus' ? 2 : cue.kind === 'release' ? 1 : 0; }

/** Bounded renderer state. `accept` can subscribe directly to the event bus so a
 * busy ordinary event log cannot evict a new accepted hit before rendering it.
 * `draw` also reads at most 64 recent events for independent fixture/render use. */
export class SeraphVfx {
  private run = ''; private organ = ''; private tick = -1; private clock = 0;
  private active: SeraphCue[] = [];
  private readonly pending = new Map<string, SeraphCue>();
  private readonly seen = new Set<string>();
  private readonly echoes = new Map<string, EchoSample[]>();
  private scanned = 0;
  private accepted = 0; private dropped = 0; private drawn = 0;
  private phase: GameState['phase'] = 'menu'; private clearReason: ClearReason | null = 'reset';
  private lastResetReason: ClearReason = 'reset';
  private particleSegments = 0; private triangles = 0; private echoTrails = 0;
  private suppressedThroughTick = -1;
  private drawnByKind: Partial<Record<SeraphCueKind, number>> = {};

  accept(event: GameEvent): void {
    if (event.type === 'RUN_STARTED' || event.type === 'MISSION_STARTED') { this.reset('scope'); return; }
    const cue = seraphCue(event);
    if (!cue || this.seen.has(cue.key) || this.pending.has(cue.key)) return;
    this.pending.set(cue.key, cue);
    this.accepted++;
    if (this.pending.size > SERAPH_VFX_BUDGET.pending) {
      const victim = [...this.pending.values()].sort((a, b) => priority(a) - priority(b) || a.tick - b.tick)[0];
      this.pending.delete(victim.key);
      this.dropped++;
    }
  }
  reset(reason: ClearReason = 'reset'): void {
    this.active = []; this.pending.clear(); this.seen.clear(); this.echoes.clear(); this.tick = -1; this.scanned = 0;
    this.accepted = 0; this.dropped = 0; this.drawn = 0; this.drawnByKind = {}; this.clock = 0;
    this.run = ''; this.organ = ''; this.clearReason = reason;
    this.lastResetReason = reason; this.particleSegments = 0; this.triangles = 0; this.echoTrails = 0;
    this.suppressedThroughTick = -1;
  }
  diagnostics() {
    const byKind: Partial<Record<SeraphCueKind, number>> = {};
    for (const cue of this.active) byKind[cue.kind] = (byKind[cue.kind] ?? 0) + 1;
    return { active: this.active.length, queued: this.pending.size, accepted: this.accepted, dropped: this.dropped,
      scanned: this.scanned, drawn: this.drawn, byKind, drawnByKind: { ...this.drawnByKind },
      echoBodies: this.echoes.size, echoSamples: [...this.echoes.values()].reduce((sum, samples) => sum + samples.length, 0),
      particleSegments: this.particleSegments, triangles: this.triangles, echoTrails: this.echoTrails,
      clock: this.clock, scope: { run: this.run, organ: this.organ, phase: this.phase,
        cleared: this.active.length === 0 && this.pending.size === 0 && this.echoes.size === 0, reason: this.clearReason, lastResetReason: this.lastResetReason },
      budget: { ...SERAPH_VFX_BUDGET } };
  }
  /** Snapshot is for diagnostics and tests; drawing cannot change combat state. */
  snapshot(): { active: readonly SeraphCue[]; pending: number; scanned: number; echoSamples: number; clock: number } {
    return { active: this.active.map(cue => ({ ...cue, from: { ...cue.from }, to: { ...cue.to } })), pending: this.pending.size,
      scanned: this.scanned, echoSamples: [...this.echoes.values()].reduce((sum, samples) => sum + samples.length, 0), clock: this.clock };
  }
  update(state: GameState): void {
    const run = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? 'training'}`, organ = state.battle?.organId ?? '';
    let changedScope = false;
    if (this.run !== run || state.tick < this.tick || this.organ !== organ) {
      // Keep freshly delivered bus receipts on the first frame, but never leak an old run/organ.
      if (this.run) { this.reset('scope'); this.suppressedThroughTick = state.tick; changedScope = true; }
      this.run = run; this.organ = organ;
    }
    this.phase = state.phase;
    const dead = (state.player?.hp ?? 1) <= 0;
    const leaving = !!state.camp || state.phase === 'menu' || state.phase === 'result' || dead || !!state.growth?.ended;
    if (leaving) { this.reset(state.camp ? 'camp' : dead ? 'death' : 'left-scene'); this.tick = state.tick; this.phase = state.phase; this.suppressedThroughTick = state.tick; return; }
    if (state.phase === 'paused') { this.tick = state.tick; return; }
    this.clock = state.visualTime ?? state.elapsed;
    this.clearReason = null;
    const cells = (state.growth?.cells ?? []).filter(cell => cell.legionId === 'seraph' && cell.organId === organ
      && cell.until > state.elapsed && (cell.hp ?? 1) > 0).slice(0, SERAPH_VFX_BUDGET.echoBodies);
    const liveIds = new Set(cells.map(cell => cell.id));
    if (state.tick !== this.tick) {
      this.scanned = 0;
      for (let i = changedScope ? state.events.length : Math.max(0, state.events.length - SERAPH_VFX_BUDGET.eventScan); i < state.events.length; i++) {
        if (names[state.events[i].type]) this.accept(state.events[i]); this.scanned++;
      }
      for (const cell of cells) if (cell.echo) {
        const samples = this.echoes.get(cell.id) ?? [];
        if (!samples.length || state.elapsed - samples.at(-1)!.at >= .08) {
          samples.push({ x: cell.x, y: cell.y, at: state.elapsed });
          if (samples.length > SERAPH_VFX_BUDGET.echoSamples) samples.shift();
          this.echoes.set(cell.id, samples);
        }
      }
    }
    // Production interpolation displays the previous fixed tick first. Keep a
    // new receipt queued until its simulation timestamp is actually visible;
    // subsequent draws in the same tick may reach that time without a new step.
    // The paused return above preserves both the frame and these future cues.
    for (const cue of this.pending.values()) {
      if (cue.tick > state.tick) continue;
      const age = this.clock - cue.tick * BALANCE.step;
      if (age < -1e-7) continue;
      this.pending.delete(cue.key); this.seen.add(cue.key);
      if (cue.tick > this.suppressedThroughTick && age < cue.duration && (cue.cellId ? liveIds.has(cue.cellId) : cells.length > 0)) this.active.push(cue);
    }
    while (this.seen.size > SERAPH_VFX_BUDGET.remembered) this.seen.delete(this.seen.values().next().value!);
    const alive = this.active.filter(cue => this.clock - cue.tick * BALANCE.step < cue.duration
      && (cue.cellId ? liveIds.has(cue.cellId) : cells.length > 0))
      .sort((a, b) => priority(b) - priority(a) || b.tick - a.tick);
    this.dropped += Math.max(0, alive.length - SERAPH_VFX_BUDGET.active);
    this.active = alive.slice(0, SERAPH_VFX_BUDGET.active);
    for (const id of this.echoes.keys()) if (!cells.some(cell => cell.id === id && cell.echo)) this.echoes.delete(id);
    this.tick = state.tick;
  }
  draw(ctx: CanvasRenderingContext2D, state: GameState, low = false, options: CombatVfxOptions = {}): void {
    this.update(state);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const selected = options.nativeVfx ? [] : this.active.slice(0, low ? SERAPH_VFX_BUDGET.lowActive : SERAPH_VFX_BUDGET.active);
    this.drawn = selected.length; this.drawnByKind = {};
    this.particleSegments = 0; this.triangles = 0; this.echoTrails = 0;
    for (const cue of selected) {
      this.drawnByKind[cue.kind] = (this.drawnByKind[cue.kind] ?? 0) + 1;
      if (!low && cue.kind === 'hit') this.particleSegments += SERAPH_VFX_BUDGET.particles;
      drawCue(ctx, cue, clamp((this.clock - cue.tick * BALANCE.step) / cue.duration), low);
    }
    if (!low) {
      const orders = new Map<string, SeraphCue[]>();
      for (const cue of selected) if (cue.kind === 'release' && cue.strong && cue.focusId) {
        const group = orders.get(cue.focusId) ?? [];
        if (!group.some(other => other.cellId === cue.cellId)) group.push(cue);
        orders.set(cue.focusId, group);
      }
      for (const group of [...orders.values()].slice(0, 2)) if (group.length >= 3) {
        this.triangles++;
        const points = group.slice(0, 3), age = Math.max(...points.map(cue => this.clock - cue.tick * BALANCE.step));
        ctx.globalAlpha = Math.max(0, 1 - age / .24) * .25; ctx.strokeStyle = '#f7d58b'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(points[0].from.x, points[0].from.y);
        for (const cue of points.slice(1)) ctx.lineTo(cue.from.x, cue.from.y);
        ctx.closePath(); ctx.stroke();
      }
    }
    if (!low && !options.nativeVfx) for (const samples of this.echoes.values()) {
      if (samples.length < 2) continue;
      const last = samples.at(-1)!;
      if (Math.hypot(last.x - samples[0].x, last.y - samples[0].y) < 3) continue;
      this.echoTrails++;
      ctx.globalAlpha = .28; ctx.strokeStyle = '#a6f3e2'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(samples[0].x, samples[0].y - 15);
      for (const sample of samples.slice(1)) ctx.lineTo(sample.x, sample.y - 15);
      ctx.stroke();
      ctx.globalAlpha = .16; ctx.strokeStyle = '#fff3be'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.restore();
  }
}
function line(ctx: CanvasRenderingContext2D, from: Vec, to: Vec): void {
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
}
function drawCue(ctx: CanvasRenderingContext2D, cue: SeraphCue, p: number, low: boolean): void {
  const direction = Math.atan2(cue.to.y - cue.from.y, cue.to.x - cue.from.x), fade = 1 - p;
  const uprightDirection = Math.atan2(Math.sin(direction) * .72, Math.cos(direction));
  ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = '#f7d58b';
  if (cue.kind === 'windup') {
    ctx.translate(cue.from.x, cue.from.y); ctx.scale(1, 1 / .72); ctx.translate(0, -14); ctx.rotate(uprightDirection);
    ctx.lineWidth = low ? 1.5 : 2;
    ctx.beginPath(); ctx.arc(0, 0, 23 - p * 10, -.9, .9); ctx.stroke();
    line(ctx, { x: 10, y: 0 }, { x: 23 + p * 8, y: 0 });
    if (!low) { ctx.globalAlpha = fade * .45; ctx.beginPath(); ctx.arc(0, 0, 29 - p * 12, Math.PI - .7, Math.PI + .7); ctx.stroke(); }
  } else if (cue.kind === 'release') {
    if (cue.attack === 'cleave') {
      ctx.translate(cue.from.x, cue.from.y); ctx.scale(1, 1 / .72); ctx.translate(0, -14);
      const radius = 32 + p * 10, turn = -.9 + p * 2.8;
      for (const side of low ? [0] : [0, Math.PI]) {
        ctx.beginPath(); ctx.arc(0, 0, side ? radius * .78 : radius, turn + side, turn + side + 2.1);
        ctx.strokeStyle = '#eac97c'; ctx.lineWidth = low ? 3 : 6 * fade + 1; ctx.stroke();
        ctx.strokeStyle = '#fff9df'; ctx.lineWidth = low ? 1 : 1.8; ctx.stroke();
      }
      ctx.restore(); return;
    }
    const from = { x: cue.from.x, y: cue.from.y - 14 / .72 }, to = { x: cue.to.x, y: cue.to.y - 14 / .72 };
    // A prism volley supplies three real release receipts. Each paints exactly its own ray.
    ctx.globalAlpha = fade * .8; ctx.strokeStyle = cue.role === 'prism' ? '#a9e6dc' : '#eac97c';
    ctx.lineWidth = low ? 2 : cue.role === 'commander' ? 6 : 4; line(ctx, from, to);
    ctx.strokeStyle = '#fff9df'; ctx.lineWidth = low ? 1 : 1.8; ctx.stroke();
    if (!low && cue.role === 'prism') {
      ctx.save(); ctx.translate(from.x, from.y); ctx.scale(1, 1 / .72); ctx.rotate(uprightDirection);
      ctx.strokeStyle = '#e5fff2'; ctx.lineWidth = 1.4;
      line(ctx, { x: -4, y: 0 }, { x: 8, y: 0 }); line(ctx, { x: 0, y: -4 }, { x: 0, y: 4 }); ctx.restore();
    }
    if (!low && cue.role !== 'prism') {
      const span = Math.min(48, Math.hypot(to.x - from.x, to.y - from.y) * .3);
      ctx.translate(to.x, to.y); ctx.scale(1, 1 / .72); ctx.rotate(uprightDirection); ctx.strokeStyle = '#fff0bb'; ctx.lineWidth = 1.7;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-span, sign * 9); ctx.quadraticCurveTo(-span * .4, sign * 14, 7, 0); ctx.stroke(); }
      if (cue.role === 'lancer') {
        ctx.strokeStyle = '#fffae4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(4, 0); ctx.lineTo(-7, 4); ctx.stroke();
      }
    }
  } else if (cue.kind === 'hit') {
    ctx.translate(cue.to.x, cue.to.y); ctx.scale(1, 1 / .72); ctx.translate(0, -13); ctx.rotate(uprightDirection - Math.PI / 4);
    const r = (low ? 12 : cue.role === 'commander' ? 27 : 20) * (1 - p * .55);
    ctx.strokeStyle = '#f3c779'; ctx.lineWidth = low ? 2 : 4;
    line(ctx, { x: -r, y: 0 }, { x: r, y: 0 }); line(ctx, { x: 0, y: -r * .65 }, { x: 0, y: r * .65 });
    ctx.strokeStyle = '#fffbed'; ctx.lineWidth = 1.4;
    line(ctx, { x: -r, y: 0 }, { x: r, y: 0 }); line(ctx, { x: 0, y: -r * .65 }, { x: 0, y: r * .65 });
    ctx.strokeStyle = '#b8f4df'; ctx.lineWidth = 1.5; ctx.globalAlpha = fade * .7;
    ctx.beginPath(); ctx.arc(0, 0, 13 + p * 20, .3, 2.4); ctx.stroke();
    if (!low) for (let n = 0; n < SERAPH_VFX_BUDGET.particles; n++) {
      const a = n * TAU / SERAPH_VFX_BUDGET.particles, start = 8 + p * 24;
      line(ctx, { x: Math.cos(a) * start, y: Math.sin(a) * start }, { x: Math.cos(a) * (start + 6 * fade), y: Math.sin(a) * (start + 6 * fade) });
    }
  } else if (cue.kind === 'focus') {
    ctx.translate(cue.to.x, cue.to.y); ctx.rotate(-Math.PI / 2);
    ctx.globalAlpha = fade * .7; ctx.lineWidth = low ? 1.5 : 2;
    const r = 30 - p * 9;
    ctx.beginPath(); for (let n = 0; n < 3; n++) { const a = n * TAU / 3; if (!n) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#edffec'; ctx.beginPath(); ctx.arc(0, 0, 10 + p * 5, 0, TAU); ctx.stroke();
  } else {
    ctx.translate(cue.to.x, cue.to.y); ctx.scale(1, 1 / .72); ctx.translate(0, -12); ctx.strokeStyle = '#b3f7e7'; ctx.globalAlpha = fade * .6; ctx.lineWidth = 2;
    for (const sign of [-1, 1]) { ctx.beginPath(); ctx.arc(0, 0, 15 + p * 12, sign < 0 ? .2 : Math.PI + .2, sign < 0 ? 1.2 : Math.PI + 1.2); ctx.stroke(); }
  }
  ctx.restore();
}
