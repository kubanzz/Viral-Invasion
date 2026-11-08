import { wallHit } from '../actors/collision';
import { activeWorld, type GameState, type Vec } from '../game/types';
import { drawCombatReceiptFeedback } from './endlessVisuals';
import { drawWeaponUltimateEffects, type WeaponEffectImage, type WeaponEffectScreenScale } from './weaponUltimateVisuals';
import type { CombatVfxOptions } from './combatVfxOptions';

const TAU = Math.PI * 2;
function ring(ctx: CanvasRenderingContext2D, center: Vec, radius: number): void {
  ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, TAU); ctx.stroke();
}

/** The leading edge crosses quickly; the wide tail catches up and breaks away.
 * Values stay inside the accepted cone even when a wall truncates the blade. */
export function slashSweepWindow(progress: number): { tail: number; head: number; alpha: number; width: number; coreAlpha: number } {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const p = clamp(progress), strike = clamp(p / .43);
  const head = .18 + .82 * (1 - (1 - strike) ** 3);
  const tail = clamp((p - .13) / .82) ** 1.7;
  return { tail: Math.min(head - .015, tail), head, alpha: (1 - p) ** 1.5,
    width: .16 * (1 - p * .7), coreAlpha: (1 - clamp((p - .12) / .51)) ** 2 };
}

/** Only reads simulation geometry. Raster assets and collision remain independent. */
export function drawCombatEffects(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false, image?: WeaponEffectImage, showBladeHint = true, screenScale?: WeaponEffectScreenScale, options: CombatVfxOptions = {}): void {
  const world = activeWorld(state);
  if (!options.nativeVfx) drawCombatReceiptFeedback(ctx, state, lowEffects);
  drawWeaponUltimateEffects(ctx, state, lowEffects, image, showBladeHint, screenScale, options);
  const now = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  for (const effect of state.effects) if (effect.kind === 'slash' && !options.nativeVfx) {
    const age = now - effect.born;
    if (age < 0 || age >= effect.duration) continue;
    const progress = age / effect.duration, half = effect.arcHalfAngle ?? Math.PI * .6;
    const facing = Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
    const sweep = slashSweepWindow(progress);
    const receipt = state.events.find(event => event.type === 'WEAPON_MELEE_SWING' && Math.abs(event.tick / 60 - effect.born) < .009);
    const reverse = receipt?.data.combo === 2;
    const steps = lowEffects ? 18 : 36, edge: Vec[] = [];
    for (let i = 0; i <= steps; i++) {
      const phase = sweep.tail + i / steps * (sweep.head - sweep.tail);
      const angle = facing - half + (reverse ? 1 - phase : phase) * half * 2, direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const range = Math.min(effect.radius, wallHit(effect.from, direction, effect.radius, world) ?? effect.radius);
      edge.push({ x: effect.from.x + direction.x * range, y: effect.from.y + direction.y * range });
    }
    ctx.save(); ctx.globalAlpha = sweep.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // A moving tapered ribbon follows the outer collision boundary. It never
    // becomes a filled cone, and the brightest nose outlives the broad tail differently.
    ctx.beginPath();
    edge.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    for (let i = edge.length - 1; i >= 0; i--) {
      const taper = Math.sin(i / (edge.length - 1) * Math.PI), inset = 1 - sweep.width * taper;
      ctx.lineTo(effect.from.x + (edge[i].x - effect.from.x) * inset, effect.from.y + (edge[i].y - effect.from.y) * inset);
    }
    ctx.closePath(); ctx.fillStyle = state.weaponCombat?.loadout.weaponId === 'redblade' ? '#ffd99c' : '#f7eacb'; ctx.fill();
    ctx.beginPath(); edge.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = state.weaponCombat?.loadout.weaponId === 'redblade' ? '#bc6657' : '#548b78'; ctx.lineWidth = 1.8; ctx.stroke();
    if (!lowEffects && sweep.coreAlpha > .01) {
      ctx.globalAlpha = sweep.coreAlpha * .9; ctx.strokeStyle = '#fff9dc'; ctx.lineWidth = 2;
      ctx.beginPath();
      const start = Math.max(0, edge.length - Math.ceil(edge.length * .35));
      for (let i = start; i < edge.length; i++) { const p = edge[i]; if (i === start) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  const cast = state.traction;
  if (cast) {
    ctx.save(); ctx.strokeStyle = '#537f71'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]); ring(ctx, cast.center, cast.gatherRadius); ctx.setLineDash([]);
    ctx.strokeStyle = cast.catalysisDamageSnapshot > 0 ? '#a77252' : '#547c63'; ctx.lineWidth = 3; ring(ctx, cast.center, cast.radius);
    const time = state.elapsed - cast.startedAt, arms = lowEffects ? 2 : 4;
    for (let i = 0; i < arms; i++) {
      const angle = i / arms * TAU + time * 2;
      const from = { x: cast.center.x + Math.cos(angle) * cast.gatherRadius, y: cast.center.y + Math.sin(angle) * cast.gatherRadius };
      const to = { x: cast.center.x + Math.cos(angle - .35) * cast.radius * .45, y: cast.center.y + Math.sin(angle - .35) * cast.radius * .45 };
      // Short inward leaflets show direction; the two circles alone own the
      // gathering and explosion ranges, including in low quality.
      const x = from.x + (to.x - from.x) * .55, y = from.y + (to.y - from.y) * .55;
      ctx.beginPath(); ctx.ellipse(x, y, 5, 2.5, angle - .3, 0, TAU); ctx.fillStyle = '#88ad8d'; ctx.fill();
    }
    ctx.fillStyle = '#184a4c'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(cast.stage === 'guiding' ? '导流 · 松开引爆' : cast.stage === 'aiming' ? '按住导流 / 轻点快放' : `牵引裂解 ${(Math.max(0, cast.resolveAt - state.elapsed)).toFixed(1)}s`, cast.center.x, cast.center.y - cast.gatherRadius - 10);
    ctx.restore();
  }
  for (const target of state.targets) {
    if (target.hp > 0 && target.viralCapsuleCarrier?.stock === 1) {
      ctx.save(); ctx.fillStyle = '#edb76b'; ctx.strokeStyle = '#732e49'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(target.x + target.radius + 9, target.y - 18, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#69253e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('弹囊', target.x + target.radius + 9, target.y - 31); ctx.restore();
    }
    const projectile = target.viralCapsule;
    if (target.hp <= 0 || !projectile) continue;
    ctx.save();
    const angle = Math.atan2(projectile.direction.y, projectile.direction.x);
    if (projectile.phase === 'warning') {
      ctx.strokeStyle = '#a33c5c'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(target.x, target.y); ctx.lineTo(projectile.aim.x, projectile.aim.y); ctx.stroke(); ctx.setLineDash([]);
      ring(ctx, projectile.aim, projectile.objective === 'tissue' ? state.tissue.radius + 10 : 24);
      if (projectile.secondaryAim) { ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(target.x, target.y); ctx.lineTo(projectile.secondaryAim.x, projectile.secondaryAim.y); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.translate(target.x, target.y); ctx.rotate(angle);
    ctx.beginPath(); ctx.ellipse(0, 0, target.radius * 1.25, target.radius * .85, 0, 0, TAU);
    ctx.fillStyle = projectile.generation === 0 && projectile.secondaryAim ? '#e9b05f' : '#e78da4'; ctx.fill(); ctx.strokeStyle = '#6b2548'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(6, 0); ctx.lineTo(-5, 4); ctx.strokeStyle = '#fff3d1'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.fillStyle = '#69253e'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(projectile.phase === 'warning' ? `弹囊 · 可击落 ${Math.max(0, projectile.warningUntil - state.elapsed).toFixed(1)}s` : '离体弹囊 · 2/挥斩清除', target.x, target.y - target.radius - 12);
    ctx.restore();
  }
}
