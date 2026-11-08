import { wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type Vec } from '../game/types';
import { WEAPON_IDS } from '../game/expedition';
import { BLADE_TECHNIQUES } from '../game/bladeTechniques';
import { drawBladeTraceEffects } from './bladeUltimateVfx';
import { drawThunderEffects } from './thunderVfx';
import type { CombatVfxOptions } from './combatVfxOptions';
export { drawBladeTraceMarkers } from './bladeUltimateVfx';

const TAU = Math.PI * 2;
const COLORS = { steady: ['#328d7b', '#d9f5d4'], piercing: ['#a66d30', '#ffe5a9'], thunder: ['#7061a5', '#b6f5df'], redblade: ['#b15d4b', '#ffe3a7'] };
export type WeaponEffectImage = (id: string) => CanvasImageSource | undefined;
export interface WeaponEffectScreenScale { x: number; y: number; deferTraceMarkers?: boolean; primaryMuzzle?: Vec }
function clippedRing(ctx: CanvasRenderingContext2D, state: GameState, center: Vec, radius: number, segments: number): void {
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * TAU, direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const range = Math.min(radius, wallHit(center, direction, radius, activeWorld(state)) ?? radius);
    const x = center.x + direction.x * range, y = center.y + direction.y * range;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
/** Accepted casts and pulses own these effects; render frames cannot deal damage. */
export function drawWeaponUltimateEffects(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false, image?: WeaponEffectImage, showBladeHint = true, screenScale?: WeaponEffectScreenScale, options: CombatVfxOptions = {}): void {
  drawBladeTechniqueEffects(ctx, state, lowEffects, showBladeHint, image, screenScale, options);
  drawThunderEffects(ctx, state, lowEffects, image, screenScale?.primaryMuzzle, options);
  const runtime = state.weaponCombat, action = runtime?.ultimate;
  const now = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  const id = runtime?.loadout.weaponId;
  if (action && id && id !== 'thunder' && !(id === 'redblade' && runtime?.bladeTrace)) {
    const center = state.player;
    const age = Math.max(0, now - action.startedAt), radius = id === 'redblade' ? 280 : id === 'steady' ? 52 : 0;
    if (radius > 0) {
      ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = COLORS[id][0]; ctx.globalAlpha = .7;
      clippedRing(ctx, state, center, radius, lowEffects ? 32 : 64); ctx.stroke();
      if (id === 'steady') {
        for (let i = 0; i < 4; i++) {
          const angle = i * TAU / 4 + age * 1.8, x = center.x + Math.cos(angle) * 52, y = center.y + Math.sin(angle) * 52;
          const texture = image?.('fantasy.weapon.fx.steady-ultimate');
          if (texture) ctx.drawImage(texture, x - 18, y - 18, 36, 36);
          else { ctx.beginPath(); for (let n = 0; n < 6; n++) { const a = n / 6 * TAU; const px = x + Math.cos(a) * 12, py = y + Math.sin(a) * 12; if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = '#d9f5d4'; ctx.fill(); ctx.stroke(); }
        }
      } else {
        const spokes = lowEffects ? 4 : 8;
        for (let i = 0; i < spokes; i++) {
          const a = i * TAU / spokes + (id === 'redblade' ? age * 1.8 : 0);
          const r = radius * .84, p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  for (const event of state.events) {
    if (options.nativeVfx) break;
    if (event.tick > state.tick) continue;
    const age = now - event.tick * BALANCE.step, data = event.data;
    if (age < 0 || age > .45) continue;
    const weaponId = WEAPON_IDS.find(id => id === data.weaponId); if (!weaponId) continue;
    if (weaponId === 'thunder') continue;
    if (event.type === 'WEAPON_CHAIN_HIT') {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / .2); ctx.lineWidth = lowEffects ? 2 : 3; ctx.strokeStyle = '#8576c8';
      const x = Number(data.fromX), y = Number(data.fromY), dx = Number(data.x) - x, dy = Number(data.y) - y;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let n = 1; n <= 5; n++) { const t = n / 5, offset = n === 5 ? 0 : (n % 2 ? 5 : -5); ctx.lineTo(x + dx * t - dy / Math.max(1, Math.hypot(dx, dy)) * offset, y + dy * t + dx / Math.max(1, Math.hypot(dx, dy)) * offset); }
      ctx.stroke(); ctx.strokeStyle = '#e3fff2'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    if (event.type !== 'WEAPON_ULTIMATE_PULSE' && event.type !== 'WEAPON_AREA_RESOLVED') continue;
    const center = { x: Number(data.x), y: Number(data.y) }, radius = Number(data.radius);
    if (![center.x, center.y, radius].every(Number.isFinite)) continue;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / .45) * .8;
    clippedRing(ctx, state, center, radius, lowEffects ? 32 : 64); ctx.clip();
    ctx.strokeStyle = COLORS[weaponId][0]; ctx.lineWidth = data.final ? 5 : 2;
    ctx.beginPath(); ctx.arc(center.x, center.y, radius * (.55 + age / .45 * .45), 0, TAU); ctx.stroke();
    const texture = image?.(`fantasy.weapon.fx.${weaponId}-ultimate`);
    if (texture && !lowEffects && weaponId === 'redblade') {
      ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(Number(data.index ?? 0) * Math.PI * .65 + age * 3);
      ctx.drawImage(texture, -radius, -radius, radius * 2, radius * 2); ctx.restore();
    }
    ctx.restore();
  }
}

/** Technique markers are authoritative world anchors; the painter never connects or damages them. */
export function drawBladeTechniqueEffects(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false, showHint = true, image?: WeaponEffectImage, screenScale?: WeaponEffectScreenScale, options: CombatVfxOptions = {}): void {
  const runtime = state.weaponCombat; if (runtime?.loadout.weaponId !== 'redblade') return;
  const now = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  if (runtime.bladeParry && !runtime.bladeParry.resolved) {
    const guard = runtime.bladeParry, angle = Math.atan2(guard.direction.y, guard.direction.x);
    ctx.save(); ctx.strokeStyle = now - guard.startedAt <= BLADE_TECHNIQUES.parry.perfect ? '#fff5b8' : '#ce9475'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 74, angle - Math.PI / 2, angle + Math.PI / 2); ctx.stroke(); ctx.restore();
  }
  if (runtime.bladeDomain) {
    ctx.save(); ctx.strokeStyle = '#c96544'; ctx.lineWidth = 2; ctx.globalAlpha = .55;
    clippedRing(ctx, state, state.player, BLADE_TECHNIQUES.domain.radius, lowEffects ? 32 : 64); ctx.stroke(); ctx.restore();
  }
  drawBladeTraceEffects(ctx, state, lowEffects, showHint, image, screenScale, options);
  for (const event of state.events) {
    if (options.nativeVfx) break;
    const age = now - event.tick * BALANCE.step, data = event.data;
    if (age < 0 || age > .35) continue;
    if (event.type === 'BLADE_PARRY_COUNTER') {
      const from = { x: Number(data.x), y: Number(data.y) }, to = { x: Number(data.aimX), y: Number(data.aimY) };
      ctx.save(); ctx.globalAlpha = 1 - age / .35; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.strokeStyle = '#b84741'; ctx.lineWidth = lowEffects ? 8 : 15; ctx.stroke();
      ctx.strokeStyle = '#fff5d8'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    } else if (event.type === 'BLADE_DOMAIN_PULSE') {
      ctx.save(); ctx.globalAlpha = 1 - age / .35; ctx.strokeStyle = data.final ? '#fff1be' : '#bc6250'; ctx.lineWidth = data.final ? 6 : 3;
      ctx.beginPath(); ctx.arc(Number(data.x), Number(data.y), BLADE_TECHNIQUES.domain.radius * (.65 + age), 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
}

