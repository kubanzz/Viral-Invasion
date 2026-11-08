import { wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type Vec } from '../game/types';
import type { ThunderCombatState } from '../game/weaponSkillsTypes';
import type { WeaponEffectImage } from './weaponUltimateVisuals';
import type { CombatVfxOptions } from './combatVfxOptions';

const TAU = Math.PI * 2;
const INK = '#70629b', BLUE = '#a5cee7', WHITE = '#ecfff6';
export const THUNDER_ART = {
  rod: 'fantasy.weapon.fx.thunder-rod', mark: 'fantasy.weapon.fx.thunder-mark',
  trail: 'fantasy.weapon.fx.thunder-trail', crown: 'fantasy.weapon.fx.thunder-crown',
  pillar: 'fantasy.weapon.fx.thunder-pillar',
} as const;
const clock = (state: GameState) => state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
const hash = (id: string) => { let n = 0; for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return n % 997; };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - (1 - clamp(n)) ** 3;
const noise = (seed: number): number => {
  let n = seed | 0; n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};

/** Electric discharge holds its jagged silhouette briefly, then restrikes.
 * Endpoints remain on the authoritative live connection; randomness is seeded. */
export function thunderArcPoints(from: Vec, to: Vec, time: number, seed: number, main = false, low = false, previous = false): Vec[] {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length < 1 || ![from.x, from.y, to.x, to.y, time].every(Number.isFinite)) return [];
  const count = low ? 5 : 9, pulse = Math.floor(time * (low ? 14 : 22) + seed * .071) - Number(previous);
  const nx = -dy / length, ny = dx / length, amplitude = Math.min(length * .1, main ? 13 : 7);
  const points: Vec[] = [{ ...from }];
  for (let i = 1; i < count; i++) {
    const t = i / count, jitter = (noise(seed * 811 + pulse * 1637 + i * 1051) * 2 - 1) * Math.sin(t * Math.PI) * amplitude;
    points.push({ x: from.x + dx * t + nx * jitter, y: from.y + dy * t + ny * jitter });
  }
  points.push({ ...to }); return points;
}

function strokeArc(ctx: CanvasRenderingContext2D, points: readonly Vec[], color: string, width: number): void {
  if (points.length < 2) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

/** Continuous drawing, with a fixed geometry budget and no damage callbacks. */
function arc(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, time: number, seed: number, main = false, low = false): void {
  const points = thunderArcPoints(from, to, time, seed, main, low);
  if (!points.length) return;
  const pulse = Math.floor(time * (low ? 14 : 22) + seed * .071), flash = noise(pulse * 711 + seed) > .28;
  ctx.save(); const opacity = ctx.globalAlpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!low) {
    ctx.globalAlpha = opacity * .18;
    strokeArc(ctx, thunderArcPoints(from, to, time, seed, main, low, true), BLUE, main ? 3.5 : 1.6);
  }
  ctx.globalAlpha = opacity * (main ? .8 : .5); strokeArc(ctx, points, INK, main ? 4.1 : 1.8);
  ctx.globalAlpha = opacity * (flash ? .94 : .6); strokeArc(ctx, points, BLUE, main ? 2.1 : 1);
  if (main || flash) { ctx.globalAlpha = opacity * (flash ? 1 : .5); strokeArc(ctx, points, WHITE, main ? .95 : .45); }
  if (!low && main) {
    ctx.globalAlpha = opacity * .5;
    const count = flash ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const at = 2 + Math.floor(noise(pulse * 631 + seed + i * 317) * (points.length - 4));
      const p = points[at], next = points[at + 1], side = noise(seed + pulse + i) > .5 ? 1 : -1;
      const dx = next.x - p.x, dy = next.y - p.y, length = Math.max(1, Math.hypot(dx, dy));
      strokeArc(ctx, [p, { x: p.x + dx * .65 - dy / length * side * 8, y: p.y + dy * .65 + dx / length * side * 8 },
        { x: p.x + dx * .9 - dy / length * side * 17, y: p.y + dy * .9 + dx / length * side * 17 }], BLUE, .8);
    }
  }
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, state: GameState, center: Vec, radius: number, low: boolean): void {
  const count = low ? 24 : 40;
  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const a = i / count * TAU, direction = { x: Math.cos(a), y: Math.sin(a) };
    const r = Math.min(radius, wallHit(center, direction, radius, activeWorld(state)) ?? radius);
    const x = center.x + direction.x * r, y = center.y + direction.y * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Only the terminal impact shakes the view; the projection remains invertible. */
export function thunderScreenImpulse(state: GameState, low = false): Vec {
  if (low || state.phase !== 'playing' || typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return { x: 0, y: 0 };
  const hit = [...state.events].reverse().find(e => e.type === 'WEAPON_ULTIMATE_PULSE' && e.data.weaponId === 'thunder' && e.data.final === true && e.tick <= state.tick);
  const age = hit ? clock(state) - hit.tick * BALANCE.step : Infinity;
  if (age < 0 || age >= .22) return { x: 0, y: 0 };
  const strength = 4.5 * (1 - age / .22);
  return { x: Math.cos(age * 137) * strength, y: Math.sin(age * 113) * strength * .6 };
}

/** Aggregate accepted electric damage into completed quarter-second windows. */
export function thunderDamageNumbers(state: GameState, low = false): { targetId: string; x: number; y: number; damage: number }[] {
  if (state.weaponCombat?.loadout.weaponId !== 'thunder') return [];
  const bucket = Math.floor(state.tick / 15) - 1;
  const totals = new Map<string, number>();
  for (const e of state.events) {
    if (e.type !== 'TARGET_HIT' || e.data.weaponId !== 'thunder' || e.data.cause !== 'basic'
      || Math.floor((e.tick - 1) / 15) !== bucket || e.tick > state.tick) continue;
    const damage = Number(e.data.damage), id = String(e.data.id);
    if (Number.isFinite(damage) && damage > 0) totals.set(id, (totals.get(id) ?? 0) + damage);
  }
  const selected: { targetId: string; x: number; y: number; damage: number }[] = [];
  for (const [targetId, damage] of [...totals].sort((a, b) => b[1] - a[1])) {
    const target = state.targets.find(t => t.id === targetId);
    if (!target || selected.some(other => Math.hypot(other.x - target.x, other.y - (target.y - target.radius - 13)) < 34)) continue;
    selected.push({ targetId, x: target.x, y: target.y - target.radius - 13, damage });
    if (selected.length >= (low ? 3 : 6)) break;
  }
  return selected;
}

function visible(state: GameState): boolean {
  return state.weaponCombat?.loadout.weaponId === 'thunder' && !state.camp && state.player.hp > 0 && state.tissue.hp > 0 && ['playing', 'paused'].includes(state.phase);
}

/** Actual damage fields and terminal afterglow belong below actors. Legacy
 * standalone callers receive this pass through drawThunderEffects by default. */
export function drawThunderGroundEffects(ctx: CanvasRenderingContext2D, state: GameState, low = false, image?: WeaponEffectImage, options: CombatVfxOptions = {}): void {
  if (!visible(state)) return;
  const thunder = state.weaponCombat?.thunder, now = clock(state);
  ctx.save();
  for (const trail of thunder?.trails.slice(-24) ?? []) {
    if (state.elapsed >= trail.until) continue;
    const dx = trail.to.x - trail.from.x, dy = trail.to.y - trail.from.y, length = Math.hypot(dx, dy);
    const fade = clamp((trail.until - now) / .4), age = Math.max(0, now - trail.startedAt);
    ctx.save(); ctx.translate(trail.from.x, trail.from.y); ctx.rotate(Math.atan2(dy, dx));
    const texture = !low && image?.(THUNDER_ART.trail);
    ctx.globalAlpha = fade * .4;
    if (texture) ctx.drawImage(texture, -8, -40, length + 16, 80);
    ctx.strokeStyle = '#8075ae'; ctx.lineWidth = 80; ctx.globalAlpha = fade * .075;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
    ctx.globalAlpha = fade * (.28 + .12 * Math.exp(-age * 4));
    arc(ctx, { x: 0, y: 0 }, { x: length, y: 0 }, now, hash(trail.castId), false, low);
    ctx.restore();
  }
  const rod = thunder?.rod;
  if (rod && state.elapsed < rod.until) {
    ctx.strokeStyle = rod.powered ? BLUE : INK; ctx.lineWidth = 1.2; ctx.globalAlpha = rod.powered ? .23 : .13;
    ring(ctx, state, rod, rod.radius, low); ctx.stroke();
  }
  const storm = thunder?.storm;
  if (storm) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.globalAlpha = storm.phase === 'collapse' ? .38 : .18;
    ring(ctx, state, state.player, 360, low); ctx.stroke();
  }
  // The native compositor owns its own transient ground shockwave. These
  // compatibility visuals remain useful without the native particle renderer.
  if (!options.nativeVfx) for (const event of state.events.slice(-160)) {
    if (event.type !== 'WEAPON_ULTIMATE_PULSE' || event.data.weaponId !== 'thunder' || event.data.final !== true || event.tick > state.tick) continue;
    const age = now - event.tick * BALANCE.step, x = Number(event.data.x), y = Number(event.data.y);
    if (age < 0 || age >= .8 || ![x, y].every(Number.isFinite)) continue;
    const t = clamp(age / .8);
    ctx.save(); ctx.globalAlpha = (1 - t) ** 2 * .32; ring(ctx, state, { x, y }, 360, low); ctx.clip();
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3 * (1 - t) + .6;
    ctx.beginPath(); ctx.arc(x, y, 24 + 336 * easeOut(age / .4), 0, TAU); ctx.stroke();
    ctx.globalAlpha *= .5; ctx.fillStyle = '#b5cdeb'; ctx.beginPath(); ctx.arc(x, y, 18 + 110 * easeOut(age / .12), 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawThunderEffects(ctx: CanvasRenderingContext2D, state: GameState, low = false, image?: WeaponEffectImage, muzzle?: Vec, options: CombatVfxOptions = {}): void {
  // Wave settlement clears damage fields before the last impact is painted.
  // Accepted receipts still own that visual; they can never recreate damage.
  const thunder: ThunderCombatState = state.weaponCombat?.thunder ?? { marks: [], trails: [] };
  if (!visible(state)) return;
  const now = clock(state), p = state.player;
  const gun = muzzle ?? { x: p.x + Math.cos(p.facing) * 27, y: p.y - 30 + Math.sin(p.facing) * 17 };
  if (!options.groundEffectsDrawn) drawThunderGroundEffects(ctx, state, low, image, options);
  ctx.save();
  const rod = thunder.rod;
  if (rod && state.elapsed < rod.until) {
    ctx.save(); ctx.globalAlpha = Math.min(1, Math.max(0, (rod.until - now) / .25));
    const texture = image?.(THUNDER_ART.rod);
    if (texture) ctx.drawImage(texture, rod.x - 44, rod.y - 96, 88, 108);
    else {
      ctx.fillStyle = '#edeadf'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(rod.x, rod.y - 76); ctx.lineTo(rod.x + 15, rod.y - 40);
      ctx.lineTo(rod.x, rod.y + 3); ctx.lineTo(rod.x - 15, rod.y - 40); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rod.powered ? WHITE : BLUE; ctx.beginPath(); ctx.arc(rod.x, rod.y - 36, 7, 0, TAU); ctx.fill();
    }
    if (rod.powered) arc(ctx, gun, { x: rod.x, y: rod.y - 35 }, now, 17, true, low);
    ctx.restore();
  }
  const targets = new Map(state.targets.map(t => [t.id, t]));
  for (const mark of thunder.marks) {
    const target = targets.get(mark.targetId);
    if (!target || target.hp <= 0 || mark.until <= state.elapsed) continue;
    const radius = Math.max(13, Math.min(54, target.radius)), y = target.y - radius * 1.6;
    ctx.save(); ctx.globalAlpha = Math.min(.65, (mark.until - now) / .35);
    const texture = !low && image?.(THUNDER_ART.mark);
    // A small status bolt sits beside the silhouette rather than painting an
    // entire electric sigil over every face in a crowd.
    if (texture) ctx.drawImage(texture, target.x + radius * .45, y - 8, 16, 16);
    else { ctx.strokeStyle = BLUE; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(target.x + radius * .7 + 3, y - 6);
      ctx.lineTo(target.x + radius * .7 - 2, y); ctx.lineTo(target.x + radius * .7 + 2, y); ctx.lineTo(target.x + radius * .7 - 3, y + 6); ctx.stroke(); }
    ctx.restore();
  }
  for (const link of thunder.channel?.links ?? []) {
    const target = targets.get(link.targetId);
    if (!target || target.hp <= 0) continue;
    const fromRod = rod && Math.hypot(link.from.x - rod.x, link.from.y - rod.y) < 2;
    const fromTarget = !fromRod && state.targets.find(t => t.id !== target.id && Math.hypot(t.x - link.from.x, t.y - link.from.y) < 2);
    const from = fromRod ? { x: rod.x, y: rod.y - 35 } : fromTarget ? { x: fromTarget.x, y: fromTarget.y - fromTarget.radius * .5 } : gun;
    const to = { x: target.x, y: target.y - Math.min(60, target.radius * 1.3) };
    arc(ctx, from, to, now, hash(target.id), link.main, low);
    ctx.globalAlpha = link.main ? .85 : .5; ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(to.x, to.y, link.main ? 2.6 : 1.3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  const storm = thunder.storm;
  if (storm) {
    const collapse = storm.phase === 'collapse';
    const progress = collapse ? Math.min(1, Math.max(0, 1 - ((storm.collapseAt ?? now) - now) / .25)) : 0;
    ctx.save();
    const crown = image?.(THUNDER_ART.crown);
    const breathe = low ? 0 : Math.sin(now * 2.4) * 2.2;
    ctx.globalAlpha = collapse ? .6 + progress * .3 : .68;
    if (crown) ctx.drawImage(crown, p.x - 62 * (1 - progress * .12), p.y - 190 + breathe + progress * 20, 124 * (1 - progress * .12), 98 * (1 - progress * .2));
    else {
      ctx.strokeStyle = BLUE; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y - 143, 42, 16, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + now * .6;
        arc(ctx, { x: p.x + Math.cos(a) * 42, y: p.y - 143 + Math.sin(a) * 16 }, { x: p.x + Math.cos(a) * 52, y: p.y - 173 + Math.sin(a) * 16 }, now, i, false, low);
      }
    }
    if (collapse) for (let i = 0; i < (low ? 3 : 7); i++) {
      const delay = low ? 0 : i % 3 * .035, local = clamp((progress * .25 - delay) / (.25 - delay));
      if (local <= 0) continue;
      const a = i / (low ? 3 : 7) * TAU + local * .7, r = 350 * (1 - easeOut(local)) + 20;
      ctx.globalAlpha = .35 + local * .6;
      arc(ctx, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, { x: p.x, y: p.y - 45 }, now, i * 13, i % 3 === 0, low);
    }
    ctx.restore();
  }
  for (const event of state.events.slice(-160)) {
    if (options.nativeVfx) break;
    const data = event.data, age = now - event.tick * BALANCE.step;
    if (event.tick > state.tick || age < 0 || age > .65) continue;
    const x = Number(data.x), y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (event.type === 'THUNDER_DETONATE_HIT') {
      const seed = hash(String(data.targetId)), t = age / .28;
      if (t < 0 || t >= 1) continue;
      ctx.save(); ctx.globalAlpha = (1 - t) ** 2;
      for (let i = 0; i < (low ? 2 : 4); i++) {
        const a = i / (low ? 2 : 4) * TAU + seed;
        arc(ctx, { x, y: y - 8 }, { x: x + Math.cos(a) * (7 + easeOut(t) * 31), y: y - 8 + Math.sin(a) * (7 + easeOut(t) * 31) }, now, i, false, low);
      }
      ctx.restore();
    }
    if (event.type === 'THUNDER_STORM_HIT' && age < .22) {
      ctx.save(); ctx.globalAlpha = 1 - age / .22;
      arc(ctx, { x: x - 10, y: y - 128 }, { x, y }, now, hash(String(data.targetId)), true, low); ctx.restore();
    }
    if (event.type === 'WEAPON_ULTIMATE_PULSE' && data.weaponId === 'thunder' && data.final === true) {
      const strike = clamp(age / .14), residual = clamp((age - .1) / .4);
      // Upright art uses its measured 85% contact anchor, independently of the ground mask.
      ctx.save(); ctx.globalAlpha = (1 - strike) ** .7; ctx.translate(x, y); ctx.scale(1, 1 / .72);
      const pillar = image?.(THUNDER_ART.pillar);
      const width = 180 * (1 - strike * .35);
      if (pillar && strike < 1) ctx.drawImage(pillar, -width / 2, -450 * .85, width, 450);
      if (age < .13) arc(ctx, { x: -24, y: -385 }, { x: 0, y: 0 }, now, 49, true, low);
      else if (!low && residual < 1) {
        ctx.globalAlpha = (1 - residual) ** 2 * .45;
        for (let i = 0; i < 3; i++) arc(ctx, { x: (i - 1) * 12, y: -100 - i * 45 }, { x: (i - 1) * (28 + residual * 25), y: -8 }, now, 49 + i, false, true);
      }
      ctx.restore();
    }
  }
  const rise = state.tick % 15 / 15 * 7;
  for (const hit of thunderDamageNumbers(state, low)) {
    ctx.save(); ctx.translate(hit.x, hit.y - rise); ctx.scale(1, 1 / .72);
    ctx.textAlign = 'center'; ctx.font = '700 12px "Microsoft YaHei",sans-serif'; ctx.lineWidth = 3;
    ctx.strokeStyle = '#453952'; ctx.fillStyle = WHITE;
    const label = String(Math.max(1, Math.round(hit.damage)));
    ctx.strokeText(label, 0, 0); ctx.fillText(label, 0, 0); ctx.restore();
  }
  ctx.restore();
}
