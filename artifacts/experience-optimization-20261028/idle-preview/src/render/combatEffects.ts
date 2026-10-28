import { wallHit } from '../actors/collision';
import { activeWorld, type GameState, type Vec } from '../game/types';

const TAU = Math.PI * 2;
function ring(ctx: CanvasRenderingContext2D, center: Vec, radius: number): void {
  ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, TAU); ctx.stroke();
}

/** Only reads simulation geometry. Raster assets and collision remain independent. */
export function drawCombatEffects(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false): void {
  const world = activeWorld(state);
  for (const effect of state.effects) if (effect.kind === 'slash') {
    const age = state.elapsed - effect.born;
    if (age < 0 || age >= effect.duration) continue;
    const progress = age / effect.duration, half = effect.arcHalfAngle ?? Math.PI * .6;
    const facing = Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
    const steps = lowEffects ? 24 : 48, edge: Vec[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = facing - half + i / steps * half * 2, direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const range = Math.min(effect.radius, wallHit(effect.from, direction, effect.radius, world) ?? effect.radius);
      edge.push({ x: effect.from.x + direction.x * range, y: effect.from.y + direction.y * range });
    }
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - progress); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(effect.from.x, effect.from.y);
    for (const p of edge) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fillStyle = '#9df9e82e'; ctx.fill();
    for (const [inset, color, width] of [[.85, '#51c9bc99', 12], [.94, '#a4fff2', 5], [1, '#ffffe4', 2]] as const) {
      ctx.beginPath();
      edge.forEach((p, i) => {
        const x = effect.from.x + (p.x - effect.from.x) * inset, y = effect.from.y + (p.y - effect.from.y) * inset;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    ctx.restore();
  }
  const cast = state.traction;
  if (cast) {
    ctx.save(); ctx.strokeStyle = '#4caaa8'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]); ring(ctx, cast.center, cast.gatherRadius); ctx.setLineDash([]);
    ctx.strokeStyle = cast.catalysisDamageSnapshot > 0 ? '#e8a74d' : '#b7fff1'; ctx.lineWidth = 3; ring(ctx, cast.center, cast.radius);
    const time = state.elapsed - cast.startedAt, arms = lowEffects ? 4 : 7;
    for (let i = 0; i < arms; i++) {
      const angle = i / arms * TAU + time * 2;
      const from = { x: cast.center.x + Math.cos(angle) * cast.gatherRadius, y: cast.center.y + Math.sin(angle) * cast.gatherRadius };
      const to = { x: cast.center.x + Math.cos(angle - .35) * cast.radius * .45, y: cast.center.y + Math.sin(angle - .35) * cast.radius * .45 };
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(cast.center.x, from.y, to.x, to.y); ctx.strokeStyle = '#8ae4d78c'; ctx.lineWidth = 2; ctx.stroke();
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
