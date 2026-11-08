import type { GameState, Vec } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';
import type { MotherCoreAttack } from '../game/motherCoreTypes';

const TAU = Math.PI * 2;
function warningCircle(ctx: CanvasRenderingContext2D, point: Vec, radius: number, progress: number, summon: boolean): void {
  ctx.fillStyle = summon ? '#99799f25' : '#be67743b'; ctx.strokeStyle = summon ? '#9b6b9f' : '#ad4662'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(point.x, point.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
  ctx.strokeStyle = '#f3d6aa'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(point.x - 9, point.y - 9); ctx.lineTo(point.x + 9, point.y + 9);
  ctx.moveTo(point.x + 9, point.y - 9); ctx.lineTo(point.x - 9, point.y + 9); ctx.stroke();
}
/** Closed capsule follows the exact collision radius and clipped endpoint. */
function lungeLane(ctx: CanvasRenderingContext2D, attack: MotherCoreAttack, active: boolean): void {
  const angle = attack.angle, normal = { x: -Math.sin(angle) * attack.radius, y: Math.cos(angle) * attack.radius };
  ctx.fillStyle = active ? '#d7627045' : '#bf52643b'; ctx.strokeStyle = active ? '#ffe7b4' : '#ad4662'; ctx.lineWidth = active ? 4 : 2.5;
  ctx.beginPath(); ctx.moveTo(attack.origin.x + normal.x, attack.origin.y + normal.y);
  ctx.lineTo(attack.aim.x + normal.x, attack.aim.y + normal.y);
  ctx.arc(attack.aim.x, attack.aim.y, attack.radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
  ctx.lineTo(attack.origin.x - normal.x, attack.origin.y - normal.y);
  ctx.arc(attack.origin.x, attack.origin.y, attack.radius, angle - Math.PI / 2, angle + Math.PI / 2, true); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(attack.origin.x, attack.origin.y); ctx.lineTo(attack.aim.x, attack.aim.y);
  ctx.setLineDash([12, 9]); ctx.stroke(); ctx.setLineDash([]);
  const ahead = { x: attack.aim.x - Math.cos(angle) * 23, y: attack.aim.y - Math.sin(angle) * 23 };
  ctx.beginPath(); ctx.moveTo(ahead.x + normal.x * .32, ahead.y + normal.y * .32);
  ctx.lineTo(attack.aim.x, attack.aim.y); ctx.lineTo(ahead.x - normal.x * .32, ahead.y - normal.y * .32); ctx.stroke();
}

/** Same world-ground transform as expedition signals. No state mutation or damage. */
export function drawHeartBossOverlay(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false, labels?: SceneLabelSink): void {
  const combat = state.territory?.bossCombat, heart = combat?.heartBoss;
  const boss = state.targets.find(target => target.id === combat?.coreId && target.hp > 0);
  if (!combat?.heartExpedition || !heart || !boss || state.camp || state.battle?.organId !== 'heart') return;
  const attack = combat.attack;
  ctx.save();
  // Distinct silhouette accents survive low-effects mode and missing new art.
  const color = heart.stage === 3 ? '#c76077' : heart.stage === 2 ? '#a57bae' : '#bf9a76';
  const r = boss.radius + 11;
  ctx.strokeStyle = color; ctx.lineWidth = heart.stage === 3 ? 4 : 3;
  ctx.beginPath(); ctx.arc(boss.x, boss.y, r, 0, TAU); ctx.stroke();
  for (let index = 0; index < heart.stage + 2; index++) {
    const a = index / (heart.stage + 2) * TAU, tip = r + (heart.stage === 3 ? 18 : 10);
    ctx.beginPath(); ctx.moveTo(boss.x + Math.cos(a - .1) * r, boss.y + Math.sin(a - .1) * r);
    ctx.lineTo(boss.x + Math.cos(a) * tip, boss.y + Math.sin(a) * tip);
    ctx.lineTo(boss.x + Math.cos(a + .1) * r, boss.y + Math.sin(a + .1) * r); ctx.stroke();
  }
  if (heart.brokenUntil > state.elapsed) {
    ctx.strokeStyle = '#f0d59b'; ctx.lineWidth = 4; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.arc(boss.x, boss.y, r + 12, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  } else if (!lowEffects && heart.transitionUntil > state.elapsed) {
    const t = 1 - (heart.transitionUntil - state.elapsed) / .6;
    ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#f1d6b4'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(boss.x, boss.y, r + t * 85, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const motion = combat.locomotion;
  if (motion?.trail && state.elapsed - motion.trail.at < .16 && (!lowEffects || motion.mode === 'lunge')) {
    const direction = Math.atan2(motion.velocity.y, motion.velocity.x), tail = motion.mode === 'lunge' ? 70 : 24;
    ctx.strokeStyle = motion.mode === 'lunge' ? '#f3cf9cbb' : '#93747766'; ctx.lineWidth = motion.mode === 'lunge' ? 7 : 3;
    ctx.beginPath(); ctx.moveTo(boss.x - Math.cos(direction) * tail, boss.y - Math.sin(direction) * tail); ctx.lineTo(boss.x, boss.y); ctx.stroke();
  }
  const lunge = attack?.kind === 'heart-lunge' ? attack : motion?.lunge?.attack;
  if (lunge) {
    lungeLane(ctx, lunge, !!motion?.lunge);
    if (attack) labels?.add({ id: `${attack.id}:heart-lunge`, anchor: attack.aim, offset: { x: 0, y: attack.radius + 28 },
      priority: 100, essential: true, lines: [{ text: `锁向扑击 · 向侧面闪避 ${Math.max(0, attack.resolveAt - state.elapsed).toFixed(1)}s`, color: '#ffe4b7', size: 12 }] });
  }
  if (attack && attack.resolveAt > state.elapsed && (attack.kind === 'heart-marked-strike' || attack.kind === 'heart-guard-call')) {
    const progress = Math.max(0, Math.min(1, (state.elapsed - attack.startedAt) / (attack.resolveAt - attack.startedAt)));
    const summon = attack.kind === 'heart-guard-call';
    for (const point of summon ? attack.landings : [attack.aim]) warningCircle(ctx, point, summon ? 24 : attack.radius, progress, summon);
    const anchor = summon ? boss : attack.aim;
    labels?.add({ id: `${attack.id}:heart-warning`, anchor, offset: { x: 0, y: summon ? -100 : attack.radius + 26 },
      priority: 100, essential: true, lines: [{ text: `${summon ? '护卫降临 · 清理援军' : '锁定落击 · 离开标记'} ${(attack.resolveAt - state.elapsed).toFixed(1)}s`, color: '#ffe4b7', size: 12 }] });
  }
  ctx.restore();
}
