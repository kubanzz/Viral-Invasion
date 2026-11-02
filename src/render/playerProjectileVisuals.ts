import { wallHit } from '../actors/collision';
import { CHARGED_SLASH_BALANCE, chargedSlashProgress } from '../game/chargedSlash';
import { activeWorld, BALANCE, type GameState, type Vec } from '../game/types';
import type { PlayerProjectile } from '../game/playerProjectiles';

const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const point = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string) => {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fillStyle = fill; ctx.fill();
};
const stroke = (ctx: CanvasRenderingContext2D, a: Vec, b: Vec, color: string, width: number) => {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};

/** The drawing path begins at the actual painted muzzle; collision remains on the ground. */
export function projectileDrawPosition(shot: PlayerProjectile, muzzle?: Vec): Vec {
  if (!muzzle || shot.kind === 'sword' || shot.kind === 'aftershock') return shot;
  const travelled = Math.hypot(shot.x - shot.from.x, shot.y - shot.from.y);
  const weight = 1 - clamp(travelled / 110);
  return { x: shot.x + (muzzle.x - shot.from.x) * weight, y: shot.y + (muzzle.y - shot.from.y) * weight };
}

/** Programmatic cyan/white effects use accepted events and real projectile bodies only. */
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
    const tailLength = shot.kind === 'primary' ? 25 : shot.kind === 'cannon' ? 40 : 48;
    const tail = { x: p.x - shot.direction.x * tailLength, y: p.y - shot.direction.y * tailLength };
    if (!lowEffects) stroke(ctx, tail, p, '#55dbc737', shot.kind === 'primary' ? 12 : 25);
    stroke(ctx, tail, p, '#73edd4a8', shot.kind === 'primary' ? 5 : 10);
    if (shot.kind === 'sword') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(-14, -24); ctx.quadraticCurveTo(32, 0, -14, 24);
      ctx.strokeStyle = '#68ddc9'; ctx.lineWidth = 12; ctx.stroke();
      ctx.strokeStyle = '#c4fff0'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    } else {
      if (!lowEffects) point(ctx, p.x, p.y, shot.radius * 1.9, '#6aead02b');
      point(ctx, p.x, p.y, shot.radius, '#86f7df');
      point(ctx, p.x, p.y, shot.radius * .62, '#f3ffff');
      if (shot.kind === 'cannon') {
        ctx.beginPath(); ctx.arc(p.x, p.y, shot.radius + 4, angle + state.elapsed * 8, angle + state.elapsed * 8 + Math.PI * 1.4);
        ctx.strokeStyle = '#c7fff1'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
  const impacts = new Map<string, { x: number; y: number; age: number; killed: boolean }>();
  for (const event of state.events) {
    const age = state.elapsed - event.tick * BALANCE.step;
    if (age < -1e-7 || age > .5) continue;
    const d = event.data;
    if (event.type === 'PLAYER_PROJECTILE_LAUNCHED' && age < .12 && d.kind !== 'sword') {
      const p = muzzleFor?.(String(d.castId)) ?? { x: Number(d.x), y: Number(d.y) };
      const angle = Math.atan2(Number(d.aimY) - Number(d.y), Number(d.aimX) - Number(d.x));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.globalAlpha = 1 - age / .12;
      ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(23, 0); ctx.lineTo(-2, 7); ctx.closePath();
      ctx.fillStyle = '#d9fff1'; ctx.fill();
      if (!lowEffects) { point(ctx, 0, 0, d.kind === 'cannon' ? 18 : 10, '#a2fbe948'); }
      ctx.restore();
    }
    if (event.type === 'PLAYER_PROJECTILE_HIT' && age < .24) {
      const key = `${event.tick}:${d.targetId}`, previous = impacts.get(key);
      impacts.set(key, { x: Number(d.x), y: Number(d.y), age, killed: !!d.killed || !!previous?.killed });
    }
    if (event.type === 'PLAYER_CANNON_EXPLODED' || event.type === 'PLAYER_CANNON_AFTERSHOCK') {
      const progress = clamp(age / .42), radius = Number(d.radius), x = Number(d.x), y = Number(d.y);
      if (progress >= 1) continue;
      ctx.save(); ctx.globalAlpha = 1 - progress;
      // The faint footprint always matches the radius used for damage.
      point(ctx, x, y, radius, '#71f3d416');
      point(ctx, x, y, radius * Math.max(.04, .38 * (1 - progress * 3)), '#ffffff');
      ctx.beginPath(); ctx.arc(x, y, radius * Math.min(1, .15 + progress * 3.5), 0, TAU);
      ctx.strokeStyle = '#91ffe5'; ctx.lineWidth = 6 * (1 - progress) + 1; ctx.stroke();
      if (!lowEffects) {
        for (let i = 0; i < 12; i++) {
          const angle = i / 12 * TAU + .2, distance = radius * Math.min(.94, progress * (1.4 + (i % 3) * .2));
          point(ctx, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 3 * (1 - progress) + 1, i % 2 ? '#cffff5' : '#63d8c0');
        }
      }
      ctx.restore();
    }
    if (event.type === 'PLAYER_CHARGE_RELEASED' && age < .22) {
      ctx.save(); ctx.globalAlpha = 1 - age / .22;
      point(ctx, Number(d.x ?? state.player.x), Number(d.y ?? state.player.y), 22 + age * 80, '#d1fff32b'); ctx.restore();
    }
  }
  for (const impact of impacts.values()) {
    const progress = impact.age / .24;
    ctx.save(); ctx.globalAlpha = 1 - progress;
    point(ctx, impact.x, impact.y, 4 + progress * 9, '#e5fff0');
    if (!lowEffects) {
      const count = impact.killed ? 9 : 4, radius = (impact.killed ? 48 : 23) * progress;
      for (let i = 0; i < count; i++) {
        const angle = i / count * TAU + .4;
        point(ctx, impact.x + Math.cos(angle) * radius, impact.y + Math.sin(angle) * radius,
          (impact.killed ? 3 : 2) * (1 - progress) + 1, '#a2fce2');
      }
    }
    ctx.restore();
  }
  const charge = state.chargedSlash;
  if (charge && state.elapsed - charge.startedAt >= CHARGED_SLASH_BALANCE.threshold) {
    const progress = chargedSlashProgress(charge.startedAt, state.elapsed), p = state.player;
    const facing = Math.atan2(charge.aim.y - p.y, charge.aim.x - p.x);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, 37, 0, TAU); ctx.strokeStyle = '#347f79a8'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 37, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.02, progress));
    ctx.strokeStyle = progress >= 1 ? '#f4fff0' : '#8bffe0'; ctx.lineWidth = 5; ctx.stroke();
    const count = progress >= 1 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const angle = facing + (i - (count - 1) / 2) * .16, direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const length = Math.min(140, wallHit(p, direction, 140, activeWorld(state)) ?? 140);
      stroke(ctx, { x: p.x + direction.x * 43, y: p.y + direction.y * 43 },
        { x: p.x + direction.x * length, y: p.y + direction.y * length }, '#a9ffe177', 2);
    }
    if (!lowEffects) point(ctx, p.x, p.y, 22 + progress * 10, '#a1f8dc18');
    ctx.restore();
  }
  ctx.restore();
}
