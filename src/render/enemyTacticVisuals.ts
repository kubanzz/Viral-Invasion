import { clamp, normalized } from '../actors/collision';
import { enemyRayEnd } from '../game/enemyTactics';
import { activeWorld, type GameState, type Vec } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';

/** Ground-space geometry is the same frozen plan used by the damage host. */
function lane(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, radius: number, progress: number): void {
  const direction = normalized(to.x - from.x, to.y - from.y), angle = Math.atan2(direction.y, direction.x);
  const normal = { x: -direction.y * radius, y: direction.x * radius };
  ctx.beginPath(); ctx.moveTo(from.x + normal.x, from.y + normal.y); ctx.lineTo(to.x + normal.x, to.y + normal.y);
  ctx.arc(to.x, to.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
  ctx.lineTo(from.x - normal.x, from.y - normal.y);
  ctx.arc(from.x, from.y, radius, angle - Math.PI / 2, angle + Math.PI / 2, true); ctx.closePath();
  ctx.fillStyle = '#ea93691b'; ctx.fill(); ctx.strokeStyle = '#ffd1a0'; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = '#ffe0a7a0'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
  ctx.strokeStyle = '#fff2ce'; ctx.lineWidth = 3; ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, center: Vec, radius: number, progress: number): void {
  ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ea93691b'; ctx.fill(); ctx.strokeStyle = '#ffd1a0'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(center.x, center.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = '#fff2ce'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(center.x - 5, center.y); ctx.lineTo(center.x + 5, center.y);
  ctx.moveTo(center.x, center.y - 5); ctx.lineTo(center.x, center.y + 5); ctx.lineWidth = 1.5; ctx.stroke();
}

export function drawEnemyTacticDangers(ctx: CanvasRenderingContext2D, state: GameState, labels?: SceneLabelSink): void {
  for (const target of state.targets) {
    if (target.hp <= 0) continue;
    const plan = target.attackPlan;
    if (plan && target.attackAt !== undefined && target.attackAt > state.elapsed) {
      const remaining = target.attackAt - state.elapsed, progress = clamp(1 - remaining / plan.windup, 0, 1);
      ctx.save();
      if (plan.kind === 'thin-ray' || plan.kind === 'crystal-charge') {
        const end = plan.kind === 'thin-ray' ? enemyRayEnd(plan, activeWorld(state)) : plan.chargeEnd!;
        lane(ctx, plan.origin, end, plan.radius, progress);
        // Keep the counter cue beside the promised lane. The origin can be
        // crowded by the enemy, squad and edge HUD while its route stays clear.
        labels?.add({ id: `enemy-tactic:${target.id}`, anchor: { x: (plan.origin.x + end.x) / 2, y: (plan.origin.y + end.y) / 2 },
          offset: { x: 0, y: -30 }, priority: 99, essential: true,
          lines: [{ text: `${plan.kind === 'thin-ray' ? '直线点射 · 侧移' : '锁向冲锋 · 侧闪'} ${remaining.toFixed(1)}s`, color: '#ffe1b1', size: 11 }] });
      } else {
        const centers = plan.kind === 'fission-burst' ? plan.landings : [plan.aim];
        for (const [index, center] of centers.entries()) {
          circle(ctx, center, plan.radius, progress);
          labels?.reserveWorld?.({ left: center.x - 7, right: center.x + 7, top: center.y - 7, bottom: center.y + 7 });
          labels?.add({ id: `enemy-tactic:${target.id}:${index}`, anchor: center, offset: { x: 0, y: -(plan.radius * .72 + 17) }, priority: 100, essential: true,
            lines: [{ text: `${plan.kind === 'fission-burst' ? `裂殖落点 ${index + 1}` : '侵蚀 · Q 可打断'} ${remaining.toFixed(1)}s`, color: '#ffe1b1', size: 11 }] });
        }
      }
      ctx.restore();
    }
    if (target.charge) {
      ctx.save(); lane(ctx, target, target.charge.to, target.charge.radius, 1); ctx.restore();
    }
  }
}
