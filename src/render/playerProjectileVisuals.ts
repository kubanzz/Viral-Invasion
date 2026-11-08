import { CHARGED_SLASH_BALANCE, chargedSlashProgress } from '../game/chargedSlash';
import { BALANCE, type GameState, type Vec } from '../game/types';
import type { PlayerProjectile } from '../game/playerProjectiles';
import { WEAPON_SKILL_BALANCE } from '../game/weaponSkills';
import { HELD_WEAPON_ART } from './weaponPresentation';
import type { WeaponEffectImage } from './weaponUltimateVisuals';
import { isWeaponId } from '../game/expedition';
import type { CombatVfxOptions } from './combatVfxOptions';

const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const point = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string) => {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fillStyle = fill; ctx.fill();
};
/** The drawing path begins at the actual painted muzzle; collision remains on the ground. */
export function projectileDrawPosition(shot: PlayerProjectile, muzzle?: Vec): Vec {
  if (!muzzle || shot.kind === 'sword' && !shot.origin.weaponId || shot.kind === 'aftershock'
    || shot.flightPhase === 'returning' || shot.detonateAt !== undefined || shot.visual === 'pulse-ring') return shot;
  const travelled = Math.hypot(shot.x - shot.from.x, shot.y - shot.from.y);
  const weight = 1 - clamp(travelled / 110);
  return { x: shot.x + (muzzle.x - shot.from.x) * weight, y: shot.y + (muzzle.y - shot.from.y) * weight };
}

function crescent(ctx: CanvasRenderingContext2D, radius: number, returning: boolean, lowEffects: boolean): void {
  const r = radius;
  ctx.beginPath(); ctx.moveTo(-r * .57, -r * .94); ctx.quadraticCurveTo(r * 1.23, 0, -r * .57, r * .94);
  ctx.quadraticCurveTo(r * .18, 0, -r * .57, -r * .94); ctx.closePath();
  ctx.fillStyle = returning ? '#f8cf85' : '#fff1cb'; ctx.fill(); ctx.strokeStyle = '#80552c'; ctx.lineWidth = 1.8; ctx.stroke();
  // The inner return stripe remains visible in the low-effects setting.
  ctx.beginPath(); ctx.moveTo(-r * .35, -r * .67); ctx.quadraticCurveTo(r * .73, 0, -r * .35, r * .67);
  ctx.strokeStyle = returning ? '#a96425' : '#e5a64b'; ctx.lineWidth = returning ? 3 : 2; ctx.stroke();
  if (!lowEffects) point(ctx, r * .43, 0, Math.max(1.4, r * .10), '#fffbed');
}

function drawAnchor(ctx: CanvasRenderingContext2D, shot: PlayerProjectile, now: number, lowEffects: boolean): void {
  const radius = shot.explosionRadius ?? WEAPON_SKILL_BALANCE.gather.radius;
  const progress = clamp(1 - ((shot.detonateAt ?? now) - now) / WEAPON_SKILL_BALANCE.gather.delay);
  ctx.save();
  point(ctx, shot.x, shot.y, radius, '#dca55712');
  ctx.strokeStyle = '#a9773e'; ctx.lineWidth = 2; ctx.setLineDash([6, 9]);
  ctx.beginPath(); ctx.arc(shot.x, shot.y, radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < (lowEffects ? 4 : 8); i++) {
    const a = i * TAU / (lowEffects ? 4 : 8), outer = radius * (.84 - progress * .2), inner = Math.max(18, outer - 25);
    ctx.beginPath(); ctx.moveTo(shot.x + Math.cos(a) * outer, shot.y + Math.sin(a) * outer);
    ctx.lineTo(shot.x + Math.cos(a) * inner, shot.y + Math.sin(a) * inner);
    ctx.lineTo(shot.x + Math.cos(a + .07) * (inner + 9), shot.y + Math.sin(a + .07) * (inner + 9));
    ctx.strokeStyle = '#cc914a'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.translate(shot.x, shot.y); ctx.rotate(now * 1.4);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const x = Math.cos(a) * 13, y = Math.sin(a) * 13; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fillStyle = '#f7e8c6'; ctx.fill(); ctx.strokeStyle = '#87562e'; ctx.lineWidth = 2; ctx.stroke();
  point(ctx, 0, 0, 4, '#d79237'); ctx.restore();
}

/** Compact medicine capsules follow real collision bodies. Muzzle flashes and
 * local impacts stay readable without turning volleys into bars or rays. */
export function drawPlayerProjectiles(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false,
  muzzleFor?: (castId: string) => Vec | undefined, image?: WeaponEffectImage, options: CombatVfxOptions = {}): void {
  if (!state.endless && !state.weaponCombat) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (state.weaponCombat && state.weaponCombat.overdriveUntil > state.elapsed && !state.playerFlight) {
    const p = state.player, phase = (state.visualTime ?? state.elapsed) * 5;
    ctx.save(); ctx.globalAlpha = .65;
    ctx.strokeStyle = '#63c8b5'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 29, 18, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const angle = phase + i * TAU / 3;
      const x = p.x + Math.cos(angle) * 25, y = p.y + Math.sin(angle) * 15;
      ctx.beginPath();
      for (let n = 0; n < 6; n++) { const a = n * TAU / 6; if (n) ctx.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); else ctx.moveTo(x + 4, y); }
      ctx.closePath(); ctx.fillStyle = '#e9fff4'; ctx.fill(); ctx.strokeStyle = '#3c9a89'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  if (state.weaponCombat?.preparation && !state.playerFlight) {
    const p = state.player, prep = state.weaponCombat.preparation;
    const progress = clamp(1 - (prep.firesAt - state.elapsed) / WEAPON_SKILL_BALANCE.heavy.prepare);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(prep.direction.y, prep.direction.x));
    ctx.strokeStyle = '#d59a48'; ctx.lineWidth = 3;
    for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(21, sign * (20 - progress * 7)); ctx.lineTo(39 + progress * 11, sign * 3); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(42 + progress * 12, 0); ctx.strokeStyle = '#fff0c6'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
  }
  for (const shot of state.playerProjectiles ?? []) {
    if (shot.kind === 'aftershock') continue;
    if ((shot.origin.skillId === 'piercing-gather' || shot.origin.skillId === 'thunder-cage') && shot.detonateAt !== undefined) {
      drawAnchor(ctx, shot, state.visualTime ?? state.elapsed, lowEffects);
      continue;
    }
    const alpha = clamp(((state.visualTime ?? state.elapsed) - state.elapsed + BALANCE.step) / BALANCE.step);
    const presented = { ...shot, x: shot.previous.x + (shot.x - shot.previous.x) * alpha,
      y: shot.previous.y + (shot.y - shot.previous.y) * alpha };
    const p = projectileDrawPosition(presented, muzzleFor?.(shot.castId));
    const angle = Math.atan2(shot.direction.y, shot.direction.x);
    if (shot.visual === 'thunder-needle' || shot.visual === 'thunder-beam' || shot.visual === 'thunder-spear') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
      const length = shot.visual === 'thunder-beam' ? 45 : shot.visual === 'thunder-spear' ? 34 : 16;
      ctx.strokeStyle = '#7264a4'; ctx.lineWidth = shot.radius * 1.4;
      ctx.beginPath(); ctx.moveTo(-length, 0); ctx.lineTo(length * .5, 0); ctx.stroke();
      ctx.strokeStyle = '#d7ffef'; ctx.lineWidth = Math.max(2, shot.radius * .5); ctx.stroke();
      if (!lowEffects) { ctx.strokeStyle = '#b4a1d9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-length, -5); ctx.lineTo(-length * .5, 4); ctx.lineTo(-4, -4); ctx.lineTo(length * .5, 0); ctx.stroke(); }
      ctx.restore();
    } else if (shot.visual === 'crescent' || shot.visual === 'storm-crescent' || shot.visual === 'ultimate-wheel') {
      const returning = shot.flightPhase === 'returning';
      if (returning) {
        // A small chevron uses the real velocity. It does not predict a future path.
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.beginPath();
        ctx.moveTo(-shot.radius - 8, -4); ctx.lineTo(-shot.radius - 3, 0); ctx.lineTo(-shot.radius - 8, 4);
        ctx.strokeStyle = '#a66e2c'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(angle + ((state.visualTime ?? state.elapsed) - shot.born) * (returning ? -13 : 13));
      const texture = shot.visual === 'ultimate-wheel' ? image?.('fantasy.weapon.fx.piercing-ultimate') : undefined;
      if (texture && !lowEffects) ctx.drawImage(texture, -shot.radius, -shot.radius, shot.radius * 2, shot.radius * 2);
      else crescent(ctx, shot.radius, returning, lowEffects);
      ctx.restore();
    } else if (shot.kind === 'sword') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
      // A filled crescent has a clear nose and two tips, separate from a round
      // cannon glob. It has no luminous tail competing with the actor faces.
      const r = shot.radius;
      ctx.beginPath(); ctx.moveTo(-r * .62, -r); ctx.quadraticCurveTo(r * 1.42, 0, -r * .62, r);
      ctx.quadraticCurveTo(r * .37, 0, -r * .62, -r); ctx.closePath();
      ctx.fillStyle = '#fff4d9'; ctx.fill(); ctx.strokeStyle = '#4c9380'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * .38, -r * .76); ctx.quadraticCurveTo(r * .9, 0, -r * .38, r * .76);
      ctx.strokeStyle = '#a6cdb0'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
      const r = shot.radius;
      if (shot.origin.skillId === 'piercing-heavy' || shot.visual === 'heavy-blade') {
        ctx.beginPath(); ctx.moveTo(r * 1.16, 0); ctx.lineTo(-r * .84, -r * .61); ctx.lineTo(-r * .43, 0); ctx.lineTo(-r * .84, r * .61); ctx.closePath();
        ctx.fillStyle = '#fff0c8'; ctx.fill(); ctx.strokeStyle = '#7b4f2b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * .37, 0); ctx.lineTo(r * .78, 0); ctx.strokeStyle = '#d7953b'; ctx.lineWidth = 4; ctx.stroke();
      } else if (shot.kind === 'cannon') {
        // Round medicine glob, distinct from the primary capsule. All accents
        // remain inside its real body; there is no trailing line or fake beam.
        if (shot.origin.skillId === 'piercing-gather') {
          ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(0, -r); ctx.lineTo(-r, 0); ctx.lineTo(0, r); ctx.closePath();
          ctx.fillStyle = '#f6e2b8'; ctx.fill(); ctx.strokeStyle = '#885b31'; ctx.lineWidth = 2; ctx.stroke(); point(ctx, 0, 0, r * .4, '#d9943d');
        } else { point(ctx, 0, 0, r, '#f3e8c5'); ctx.strokeStyle = '#426f61'; ctx.lineWidth = 1.8; ctx.stroke();
          point(ctx, 1, 1, r * .72, '#a8d7b8'); point(ctx, -r * .27, -r * .32, r * .30, '#fffbe4');
          if (!lowEffects) point(ctx, r * .39, r * .21, r * .15, '#e1f2d9'); }
      } else {
        if (shot.visual === 'swarm-needle') {
          ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r, -r * .58); ctx.lineTo(-r * .55, 0); ctx.lineTo(-r, r * .58); ctx.closePath();
          ctx.fillStyle = '#f2fff3'; ctx.fill(); ctx.strokeStyle = '#329b89'; ctx.lineWidth = 1.5; ctx.stroke();
          point(ctx, -r * .2, 0, r * .25, '#79d7bf'); ctx.restore(); continue;
        }
        ctx.beginPath(); ctx.roundRect(-r * 1.2, -r * .65, r * 2.4, r * 1.3, r * .65);
        ctx.fillStyle = '#fff7d9'; ctx.fill(); ctx.strokeStyle = '#3e7365'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.roundRect(0, -r * .47, r * .98, r * .94, r * .46); ctx.fillStyle = '#a5d7b6'; ctx.fill();
        if (!lowEffects) point(ctx, -r * .38, -r * .24, r * .15, '#ffffff');
      }
      ctx.restore();
    }
  }
  const impacts = new Map<string, { x: number; y: number; age: number; killed: boolean; blade: boolean }>();
  for (const event of state.events) {
    const age = state.elapsed - event.tick * BALANCE.step;
    if (age < -1e-7 || age > .5) continue;
    const d = event.data;
    if (!options.nativeVfx && event.type === 'PLAYER_PROJECTILE_LAUNCHED' && d.weaponId !== 'redblade' && age < .08 && (d.kind !== 'sword' || d.weaponId)) {
      const p = muzzleFor?.(String(d.castId)) ?? { x: Number(d.x), y: Number(d.y) };
      const angle = Math.atan2(Number(d.aimY) - Number(d.y), Number(d.aimX) - Number(d.x));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.globalAlpha = 1 - age / .08;
      const blade = d.weaponId === 'piercing' || !d.weaponId && state.weaponCombat?.loadout.weaponId === 'piercing';
      const palette = HELD_WEAPON_ART[isWeaponId(d.weaponId) ? d.weaponId : blade ? 'piercing' : 'steady'];
      if (blade) { ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(17, 0, 0, 9); ctx.strokeStyle = palette.accent; ctx.lineWidth = 3; ctx.stroke(); }
      else { ctx.beginPath(); ctx.ellipse(7, 0, d.kind === 'cannon' ? 9 : 6, d.kind === 'cannon' ? 5 : 3.5, 0, 0, TAU);
        ctx.fillStyle = state.weaponCombat && state.weaponCombat.overdriveUntil > state.elapsed ? '#d4ffed' : palette.light;
        ctx.fill(); ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (!lowEffects) { point(ctx, 10, -4, 1.5, palette.accent); point(ctx, 10, 4, 1.3, palette.light); }
      ctx.restore();
    }
    if (!options.nativeVfx && event.type === 'PLAYER_PROJECTILE_HIT' && age < .12) {
      const key = `${event.tick}:${d.targetId}`, previous = impacts.get(key);
      impacts.set(key, { x: Number(d.x), y: Number(d.y), age, killed: !!d.killed || !!previous?.killed,
        blade: d.weaponId === 'piercing' || !!previous?.blade });
    }
    if (event.type === 'PLAYER_CANNON_EXPLODED' || event.type === 'PLAYER_CANNON_AFTERSHOCK') {
      const progress = clamp(age / .42), radius = Number(d.radius), x = Number(d.x), y = Number(d.y);
      if (progress >= 1) continue;
      ctx.save(); ctx.globalAlpha = 1 - progress;
      // The faint footprint always matches the radius used for damage.
      const blade = d.weaponId === 'piercing' || d.skillId === 'piercing-gather';
      const redblade = d.weaponId === 'redblade';
      const selfPulse = d.skillId === 'steady-repulse';
      point(ctx, x, y, radius, redblade ? '#d47e5818' : d.weaponId === 'thunder' ? '#9d88d418' : blade ? '#d49b4f18' : selfPulse ? '#75c5ad18' : '#85b79b18');
      if (options.nativeVfx) { ctx.restore(); continue; }
      point(ctx, x, y, radius * Math.max(.04, .30 * (1 - progress * 3)), blade ? '#fff0c5' : '#effff1');
      ctx.beginPath(); ctx.arc(x, y, radius * Math.min(1, .15 + progress * 3.5), 0, TAU);
      ctx.strokeStyle = redblade ? '#bb6651' : d.weaponId === 'thunder' ? '#8a72b9' : blade ? '#b67e37' : '#439a86'; ctx.lineWidth = 4 * (1 - progress) + 1.5; ctx.stroke();
      if (selfPulse) {
        const r = radius * Math.min(1, .2 + progress * 2.8);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + r, y); }
        ctx.closePath(); ctx.strokeStyle = '#9debd0'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (!lowEffects) {
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * TAU + .2, distance = radius * Math.min(.94, progress * (1.4 + (i % 3) * .2));
          point(ctx, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 3 * (1 - progress) + 1,
            blade ? i % 2 ? '#fff0cb' : '#cc9349' : i % 2 ? '#edfff2' : '#83cbb3');
        }
      }
      ctx.restore();
    }
    if (!options.nativeVfx && event.type === 'PLAYER_PROJECTILE_RETURNED' && age < .14) {
      ctx.save(); ctx.globalAlpha = (1 - age / .14) * .8;
      ctx.beginPath(); ctx.arc(Number(d.x), Number(d.y), 8 + age * 40, -Math.PI * .7, Math.PI * .7);
      ctx.strokeStyle = '#d39a46'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    if (event.type === 'PLAYER_CHARGE_RELEASED' && age < .22) {
      ctx.save(); ctx.globalAlpha = 1 - age / .22;
      point(ctx, Number(d.x ?? state.player.x), Number(d.y ?? state.player.y), 22 + age * 80, '#bfd4ad30'); ctx.restore();
    }
  }
  for (const impact of impacts.values()) {
    const progress = impact.age / .12;
    ctx.save(); ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle=impact.blade?'#79502b':'#264d46';ctx.lineWidth=3;ctx.beginPath();ctx.arc(impact.x,impact.y,7+progress*9,0,TAU);ctx.stroke();
    ctx.strokeStyle='#fff8d6';ctx.lineWidth=1.5;ctx.stroke();
    point(ctx, impact.x, impact.y, 5 + progress * 3, '#fff8d6');
    if (!lowEffects) {
      const count = impact.killed ? 6 : 3, radius = (impact.killed ? 28 : 16) * progress;
      for (let i = 0; i < count; i++) {
        const angle = i / count * TAU + .4;
        point(ctx, impact.x + Math.cos(angle) * radius, impact.y + Math.sin(angle) * radius,
          (impact.killed ? 3 : 2) * (1 - progress) + 1, i % 2 ? impact.blade ? '#d79d4d' : '#88b697' : '#eee2bf');
      }
    }
    ctx.restore();
  }
  const charge = state.chargedSlash;
  if (charge && state.elapsed - charge.startedAt >= CHARGED_SLASH_BALANCE.threshold) {
    const progress = chargedSlashProgress(charge.startedAt, state.elapsed), p = state.player;
    const facing = Math.atan2(charge.aim.y - p.y, charge.aim.x - p.x);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, 37, 0, TAU); ctx.strokeStyle = '#446f65'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 37, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.02, progress));
    ctx.strokeStyle = progress >= 1 ? '#fff0c9' : '#b6ceaa'; ctx.lineWidth = 5; ctx.stroke();
    const count = progress >= 1 ? 5 : 3;
    // Compact 3/5 ready petals communicate the real volley count and aim.
    // They are not a filled damage fan: the discrete released sword bodies
    // own their real travel distance, footprint and wall collisions.
    for (let i = 0; i < count; i++) {
      const angle = facing + (i - (count - 1) / 2) * .16;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(45, -2.5); ctx.quadraticCurveTo(55, 0, 45, 2.5); ctx.quadraticCurveTo(49, 0, 45, -2.5); ctx.closePath();
      ctx.fillStyle = progress >= 1 ? '#f1e5bf' : '#b5c8a1'; ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}
