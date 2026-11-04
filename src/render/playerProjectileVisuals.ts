import { CHARGED_SLASH_BALANCE, chargedSlashProgress } from '../game/chargedSlash';
import { BALANCE, type GameState, type Vec } from '../game/types';
import type { PlayerProjectile } from '../game/playerProjectiles';

const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const point = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string) => {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fillStyle = fill; ctx.fill();
};
/** The drawing path begins at the actual painted muzzle; collision remains on the ground. */
export function projectileDrawPosition(shot: PlayerProjectile, muzzle?: Vec): Vec {
  if (!muzzle || shot.kind === 'sword' || shot.kind === 'aftershock') return shot;
  const travelled = Math.hypot(shot.x - shot.from.x, shot.y - shot.from.y);
  const weight = 1 - clamp(travelled / 110);
  return { x: shot.x + (muzzle.x - shot.from.x) * weight, y: shot.y + (muzzle.y - shot.from.y) * weight };
}

/** Compact medicine capsules follow real collision bodies. Muzzle flashes and
 * local impacts stay readable without turning volleys into bars or rays. */
export function drawPlayerProjectiles(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false,
  muzzleFor?: (castId: string) => Vec | undefined): void {
  if (!state.endless) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const shot of state.playerProjectiles ?? []) {
    if (shot.kind === 'aftershock') continue;
    const alpha = clamp(((state.visualTime ?? state.elapsed) - state.elapsed + BALANCE.step) / BALANCE.step);
    const presented = { ...shot, x: shot.previous.x + (shot.x - shot.previous.x) * alpha,
      y: shot.previous.y + (shot.y - shot.previous.y) * alpha };
    const p = projectileDrawPosition(presented, muzzleFor?.(shot.castId));
    const angle = Math.atan2(shot.direction.y, shot.direction.x);
    if (shot.kind === 'sword') {
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
      if (shot.kind === 'cannon') {
        // Round medicine glob, distinct from the primary capsule. All accents
        // remain inside its real body; there is no trailing line or fake beam.
        point(ctx, 0, 0, r, '#f3e8c5');
        ctx.strokeStyle = '#426f61'; ctx.lineWidth = 1.8; ctx.stroke();
        point(ctx, 1, 1, r * .72, '#a8d7b8');
        point(ctx, -r * .27, -r * .32, r * .30, '#fffbe4');
        if (!lowEffects) point(ctx, r * .39, r * .21, r * .15, '#e1f2d9');
      } else {
        ctx.beginPath(); ctx.roundRect(-r * 1.2, -r * .65, r * 2.4, r * 1.3, r * .65);
        ctx.fillStyle = '#fff7d9'; ctx.fill(); ctx.strokeStyle = '#3e7365'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.roundRect(0, -r * .47, r * .98, r * .94, r * .46); ctx.fillStyle = '#a5d7b6'; ctx.fill();
        if (!lowEffects) point(ctx, -r * .38, -r * .24, r * .15, '#ffffff');
      }
      ctx.restore();
    }
  }
  const impacts = new Map<string, { x: number; y: number; age: number; killed: boolean }>();
  for (const event of state.events) {
    const age = state.elapsed - event.tick * BALANCE.step;
    if (age < -1e-7 || age > .5) continue;
    const d = event.data;
    if (event.type === 'PLAYER_PROJECTILE_LAUNCHED' && age < .08 && d.kind !== 'sword') {
      const p = muzzleFor?.(String(d.castId)) ?? { x: Number(d.x), y: Number(d.y) };
      const angle = Math.atan2(Number(d.aimY) - Number(d.y), Number(d.aimX) - Number(d.x));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.globalAlpha = 1 - age / .08;
      ctx.beginPath(); ctx.ellipse(7, 0, d.kind === 'cannon' ? 9 : 6, d.kind === 'cannon' ? 5 : 3.5, 0, 0, TAU);
      ctx.fillStyle='#fff9d5';ctx.fill();ctx.strokeStyle='#54846a';ctx.lineWidth=1.2;ctx.stroke();
      if (!lowEffects) { point(ctx, 10, -4, 1.5, '#b0d6ac'); point(ctx, 10, 4, 1.3, '#dce8c0'); }
      ctx.restore();
    }
    if (event.type === 'PLAYER_PROJECTILE_HIT' && age < .12) {
      const key = `${event.tick}:${d.targetId}`, previous = impacts.get(key);
      impacts.set(key, { x: Number(d.x), y: Number(d.y), age, killed: !!d.killed || !!previous?.killed });
    }
    if (event.type === 'PLAYER_CANNON_EXPLODED' || event.type === 'PLAYER_CANNON_AFTERSHOCK') {
      const progress = clamp(age / .42), radius = Number(d.radius), x = Number(d.x), y = Number(d.y);
      if (progress >= 1) continue;
      ctx.save(); ctx.globalAlpha = 1 - progress;
      // The faint footprint always matches the radius used for damage.
      point(ctx, x, y, radius, '#85b79b18');
      point(ctx, x, y, radius * Math.max(.04, .30 * (1 - progress * 3)), '#fff0d5');
      ctx.beginPath(); ctx.arc(x, y, radius * Math.min(1, .15 + progress * 3.5), 0, TAU);
      ctx.strokeStyle = '#548e79'; ctx.lineWidth = 4 * (1 - progress) + 1.5; ctx.stroke();
      if (!lowEffects) {
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * TAU + .2, distance = radius * Math.min(.94, progress * (1.4 + (i % 3) * .2));
          point(ctx, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 3 * (1 - progress) + 1, i % 2 ? '#f7e9cc' : '#8fb59a');
        }
      }
      ctx.restore();
    }
    if (event.type === 'PLAYER_CHARGE_RELEASED' && age < .22) {
      ctx.save(); ctx.globalAlpha = 1 - age / .22;
      point(ctx, Number(d.x ?? state.player.x), Number(d.y ?? state.player.y), 22 + age * 80, '#bfd4ad30'); ctx.restore();
    }
  }
  for (const impact of impacts.values()) {
    const progress = impact.age / .12;
    ctx.save(); ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle='#264d46';ctx.lineWidth=3;ctx.beginPath();ctx.arc(impact.x,impact.y,7+progress*9,0,TAU);ctx.stroke();
    ctx.strokeStyle='#fff8d6';ctx.lineWidth=1.5;ctx.stroke();
    point(ctx, impact.x, impact.y, 5 + progress * 3, '#fff8d6');
    if (!lowEffects) {
      const count = impact.killed ? 6 : 3, radius = (impact.killed ? 28 : 16) * progress;
      for (let i = 0; i < count; i++) {
        const angle = i / count * TAU + .4;
        point(ctx, impact.x + Math.cos(angle) * radius, impact.y + Math.sin(angle) * radius,
          (impact.killed ? 3 : 2) * (1 - progress) + 1, i % 2 ? '#88b697' : '#eee2bf');
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
