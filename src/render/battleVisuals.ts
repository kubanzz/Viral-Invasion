import type { TraitId } from '../game/battleTypes';
import type { GameState, Target, Vec } from '../game/types';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { activeWorld } from '../game/types';
import { wallHit } from '../actors/collision';
import { ENEMY_TACTIC_INFO } from '../game/enemyTacticInfo';
import { MOTHER_CORE_BALANCE, motherCoreDisturbed } from '../game/motherCore';
import type { MotherCoreState } from '../game/motherCoreTypes';
import type { SceneLabelSink } from './sceneLabels';
import { drawImmuneFocus } from './immuneFocusVisuals';
import { drawCatalysis } from './catalysisVisuals';
import { drawEliteTacticCycles } from './eliteTacticCycleVisuals';
import { presentedMotherCombat } from './artPresentation';
import { enemyRayEnd } from '../game/enemyTactics';

const TAU = Math.PI * 2;

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 10): void {
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, x, y);
}

function groundLabel(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 11): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / .72);
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.textAlign = 'center';
  ctx.strokeStyle = '#5a4352e0'; ctx.lineWidth = 3; ctx.strokeText(value, 0, 0);
  label(ctx, value, 0, 0, color, size); ctx.restore();
}

/** All three branches use genuinely different outer paths, including in monochrome. */
export function traceVirusOutline(ctx: CanvasRenderingContext2D, trait: TraitId | undefined, radius: number): void {
  const r = radius;
  ctx.beginPath();
  if (trait === 'CARAPACE') {
    // A broad shell cap and two short side plates, rather than a radial star.
    ctx.moveTo(-r, .24 * r); ctx.bezierCurveTo(-1.18 * r, -.18 * r, -1.18 * r, -.18 * r, -.83 * r, -.45 * r);
    ctx.lineTo(-.74 * r, -.88 * r); ctx.bezierCurveTo(0, -1.15 * r, 0, -1.15 * r, .74 * r, -.88 * r);
    ctx.lineTo(.83 * r, -.45 * r); ctx.bezierCurveTo(1.18 * r, -.18 * r, 1.18 * r, -.18 * r, r, .24 * r);
    ctx.bezierCurveTo(.72 * r, .94 * r, .72 * r, .94 * r, 0, .91 * r); ctx.bezierCurveTo(-.72 * r, .94 * r, -.72 * r, .94 * r, -r, .24 * r);
  } else if (trait === 'FISSION') {
    ctx.moveTo(0, -.63 * r);
    ctx.bezierCurveTo(-.55 * r, -1.34 * r, -1.3 * r, -.75 * r, -1.12 * r, .06 * r);
    ctx.bezierCurveTo(-1.2 * r, .9 * r, -.4 * r, 1.08 * r, 0, .68 * r);
    ctx.bezierCurveTo(.4 * r, 1.08 * r, 1.2 * r, .9 * r, 1.12 * r, .06 * r);
    ctx.bezierCurveTo(1.3 * r, -.75 * r, .55 * r, -1.34 * r, 0, -.63 * r);
  } else if (trait === 'MIMIC') {
    ctx.moveTo(-1.68 * r, .48 * r);
    ctx.bezierCurveTo(-.88 * r, .07 * r, -1.03 * r, -.7 * r, -.36 * r, -.96 * r);
    ctx.bezierCurveTo(.51 * r, -1.24 * r, 1.24 * r, -.62 * r, 1.02 * r, .09 * r);
    ctx.bezierCurveTo(.85 * r, .83 * r, .28 * r, 1.03 * r, -.22 * r, .74 * r);
    ctx.bezierCurveTo(-.83 * r, .52 * r, -1.03 * r, .88 * r, -1.68 * r, .48 * r);
  } else {
    for (let i = 0; i <= 60; i++) {
      const angle = i / 60 * TAU, length = r * (1 + Math.cos(angle * 6) * .105);
      const x = Math.cos(angle) * length, y = Math.sin(angle) * length * .86;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

const TRAIT_NAME: Record<TraitId, string> = { CARAPACE: '晶壳', FISSION: '裂殖', MIMIC: '潜伏' };

export interface NativeEnemyRuleGeometry {
  actorId: string;
  type: 'carapace' | 'thin-ray';
  angle: number;
  projectedAngle: number;
  origin: Vec;
  end: Vec;
  displayOrigin: Vec;
  displayEnd: Vec;
  sectorHalfAngle?: number;
  displayRadius?: number;
  exposed: boolean;
  committed: boolean;
}
export interface NativeEnemyRuleCue extends NativeEnemyRuleGeometry { visible: true }

export interface NativeMimicCue { actorId: string; reason: 'disturbance' | 'scan' | 'revealed' | 'trace' | 'exposed'; origin: Vec; visible: true }

/** Two short ink waves, not a full-body halo or an extra tissue disguise. */
function drawMimicStateMark(ctx: CanvasRenderingContext2D, x: number, y: number, revealed: boolean): void {
  for (const [width, color] of [[3.6, '#efe3ca'], [1.5, revealed ? '#477565' : '#8e6076']] as const) {
    ctx.beginPath();
    for (const row of [-1, 1]) {
      ctx.moveTo(x - 5, y + row * 3);
      ctx.quadraticCurveTo(x - 2.5, y + row * 3 - 3, x, y + row * 3);
      ctx.quadraticCurveTo(x + 2.5, y + row * 3 + 3, x + 5, y + row * 3);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
}

/** Preserve the ordinary mimic's actual born-relative disturbance period even
 * when a native PNG owns the disguise. This never grants reveal or damage. */
export function drawNativeMimicAccents(ctx: CanvasRenderingContext2D, target: Target, state: GameState): NativeMimicCue | undefined {
  if (!target.traits?.includes('MIMIC') || target.hp <= 0 || target.role === 'core'
    || !['playing', 'paused'].includes(state.phase) || (target.born ?? 0) > state.elapsed) return;
  const time = state.elapsed;
  const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > time);
  const age = (time - (target.born ?? 0)) % BATTLE_BALANCE.mimicPeriod;
  const reason: NativeMimicCue['reason'] | undefined = (target.exposedUntil ?? 0) > time ? 'exposed'
    : state.scanUntil > time ? 'scan' : (target.revealedUntil ?? 0) > time ? 'revealed' : traced ? 'trace'
      : age < BATTLE_BALANCE.mimicDisturbance ? 'disturbance' : undefined;
  if (!reason) return;
  const origin = { x: target.x + target.radius + 9, y: target.y - target.radius * .8 / .72 };
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(1, 1 / .72);
  drawMimicStateMark(ctx, 0, 0, reason !== 'disturbance'); ctx.restore();
  return { actorId: target.id, reason, origin, visible: true };
}

/** Ground-space state markers, not extra collision/damage footprints. Native
 * upright art cannot communicate arbitrary world-facing by rotating its body.
 * The armour half angle is the exact cos(incoming-facing) > .2 damage rule.
 * Mother-core membranes have their own rule owner and never enter this path. */
export function nativeEnemyRuleGeometry(target: Target, state: GameState): NativeEnemyRuleGeometry[] {
  if (target.hp <= 0 || target.role === 'core' || !['playing', 'paused'].includes(state.phase)) return [];
  const result: NativeEnemyRuleGeometry[] = [];
  const facing = Number.isFinite(target.facing) ? target.facing! : 0;
  const exposed = (target.exposedUntil ?? 0) > state.elapsed;
  const projected = (angle: number) => Math.atan2(Math.sin(angle) * .72, Math.cos(angle));
  if (target.traits?.includes('CARAPACE')) {
    const origin = { x: target.x, y: target.y }, radius = target.radius + 8;
    const end = { x: origin.x + Math.cos(facing) * radius, y: origin.y + Math.sin(facing) * radius };
    result.push({ actorId: target.id, type: 'carapace', angle: facing, projectedAngle: projected(facing),
      origin, end, displayOrigin: origin, displayEnd: end, sectorHalfAngle: Math.acos(.2), displayRadius: radius,
      exposed, committed: false });
  }
  if (target.tactic === 'thin-ray' || target.attackPlan?.kind === 'thin-ray') {
    const plan = target.attackPlan?.kind === 'thin-ray' && (target.attackAt ?? 0) > state.elapsed ? target.attackPlan : undefined;
    const origin = plan ? { ...plan.origin } : { x: target.x, y: target.y };
    const end = plan ? enemyRayEnd(plan, activeWorld(state)) : {
      x: origin.x + Math.cos(facing) * (target.radius + 25), y: origin.y + Math.sin(facing) * (target.radius + 25),
    };
    const length = Math.hypot(end.x - origin.x, end.y - origin.y);
    // A completely blocked plan has no forward segment to promise.
    if (length > 1e-7) {
      const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
      const at = (distance: number) => ({ x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance });
      result.push({ actorId: target.id, type: 'thin-ray', angle, projectedAngle: projected(angle), origin, end,
        displayOrigin: at(Math.min(target.radius + 4, length * .35)),
        displayEnd: at(Math.min(target.radius + 25, length)), exposed, committed: !!plan });
    }
  }
  return result;
}

/** A compact, upright state symbol anchored at the real protected front. Its
 * closed / split outline survives overlap with the native shell at phone scale. */
function drawCarapaceFrontMark(ctx: CanvasRenderingContext2D, cue: NativeEnemyRuleGeometry): void {
  ctx.save();
  ctx.translate(cue.displayEnd.x - cue.origin.x, cue.displayEnd.y - cue.origin.y);
  ctx.scale(1, 1 / .72);
  const outline = () => {
    ctx.beginPath();
    if (cue.exposed) {
      // Separated, open halves: never leave an intact shield during exposure.
      ctx.moveTo(-3, -6); ctx.lineTo(-7, -6); ctx.lineTo(-6, 1); ctx.lineTo(-3, 4);
      ctx.moveTo(3, -4); ctx.lineTo(7, -4); ctx.lineTo(6, 3); ctx.lineTo(2, 7);
    } else {
      ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(5, 2); ctx.lineTo(0, 7); ctx.lineTo(-5, 2); ctx.closePath();
    }
  };
  outline(); ctx.strokeStyle = '#f3e7cf'; ctx.lineWidth = 5.5; ctx.stroke();
  outline(); ctx.strokeStyle = cue.exposed ? '#a66d68' : '#664457'; ctx.lineWidth = 2.8; ctx.stroke();
  ctx.restore();
}

/** No actor body, labels, light aura or filled sector is painted. Return the
 * geometry actually consumed by this draw so diagnostics cannot drift from it.
 * Every mark is essential and identical in normal and low-effects rendering. */
export function drawNativeEnemyAccents(ctx: CanvasRenderingContext2D, target: Target, state: GameState): NativeEnemyRuleCue[] {
  drawNativeMimicAccents(ctx, target, state);
  const drawn: NativeEnemyRuleCue[] = [];
  for (const cue of nativeEnemyRuleGeometry(target, state)) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (cue.type === 'carapace') {
      ctx.translate(cue.origin.x, cue.origin.y);
      const radius = cue.displayRadius!, half = cue.sectorHalfAngle!;
      const arc = () => { ctx.beginPath(); ctx.arc(0, 0, radius, cue.angle - half, cue.angle + half); };
      if (cue.exposed) {
        // The front is physically open, independent of colour or dash support.
        const fragments = () => {
          ctx.beginPath(); ctx.arc(0, 0, radius, cue.angle - half, cue.angle - .3);
          ctx.moveTo(Math.cos(cue.angle + .3) * radius, Math.sin(cue.angle + .3) * radius);
          ctx.arc(0, 0, radius, cue.angle + .3, cue.angle + half);
        };
        ctx.setLineDash([3, 6]);
        fragments(); ctx.strokeStyle = '#f3e7cf'; ctx.lineWidth = 4.8; ctx.stroke();
        fragments(); ctx.strokeStyle = '#987b83'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]);
      } else {
        arc(); ctx.strokeStyle = '#f3e7cf'; ctx.lineWidth = 7; ctx.stroke();
        arc(); ctx.strokeStyle = '#664457'; ctx.lineWidth = 3.8; ctx.stroke();
        // Two short end caps distinguish the protected front from the open rear.
        for (const angle of [cue.angle - half, cue.angle + half]) {
          line(ctx, [Math.cos(angle) * (radius - 3), Math.sin(angle) * (radius - 3),
            Math.cos(angle) * (radius + 3), Math.sin(angle) * (radius + 3)], '#664457', 2.8);
        }
      }
      drawCarapaceFrontMark(ctx, cue);
    } else {
      line(ctx, [cue.displayOrigin.x, cue.displayOrigin.y, cue.displayEnd.x, cue.displayEnd.y], '#f0e3c9', 4.5);
      line(ctx, [cue.displayOrigin.x, cue.displayOrigin.y, cue.displayEnd.x, cue.displayEnd.y], cue.committed ? '#9e5f62' : '#826776', 2);
      ctx.translate(cue.displayEnd.x, cue.displayEnd.y); ctx.rotate(cue.angle);
      // A short solid pointer owns direction. It never follows a fixed painted
      // nozzle and never invents a second ray width or attack endpoint.
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -4.5); ctx.lineTo(-6, 0); ctx.lineTo(-8, 4.5); ctx.closePath();
      ctx.fillStyle = cue.committed ? '#9e5f62' : '#826776'; ctx.fill();
    }
    ctx.restore(); drawn.push({ ...cue, visible: true });
  }
  return drawn;
}

/** Drawn in the same Y-sorted world layer as every other actor. */
export function drawBattleTarget(ctx: CanvasRenderingContext2D, target: Target, state: GameState): void {
  const core = presentedMotherCombat(state);
  if (target.role === 'core' && core?.coreId === target.id) { drawMotherCore(ctx, target, state, core); return; }
  const t = state.elapsed, r = target.radius;
  const trait = target.traits?.[0] ?? (!state.battle && target.kind === 'cluster' ? 'FISSION' : undefined);
  const exposed = (target.exposedUntil ?? 0) > t;
  const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > t) ?? false;
  const revealed = (target.revealedUntil ?? 0) > t || exposed || state.scanUntil > t || traced;
  const mimic = target.traits?.includes('MIMIC') && !revealed;
  const source = target.role === 'source';
  const elite = target.role === 'elite' || target.role === 'core';
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);

  if (target.hp <= 0) {
    const progress = Math.min(1, Math.max(0, (t - (target.deadAt ?? t - 1)) / .6));
    ctx.globalAlpha = (1 - progress) * .8;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ellipse(ctx, Math.cos(a) * r * progress, -12 + Math.sin(a) * r * progress, 4 * (1 - progress) + 1, 3, '#e5f5b6');
    }
    ctx.globalAlpha = .32;
    ellipse(ctx, 0, 0, r * .6, 5, '#a2e9ba21', '#a2e9ba44');
    if (source) {
      ctx.globalAlpha = .94;
      ctx.fillStyle = '#fff8e8'; ctx.strokeStyle = '#317e78'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(-49, 11, 98, 21, 5); ctx.fill(); ctx.stroke();
      label(ctx, '✓ 感染源已净化', 0, 25, '#24574f', 10);
    }
    ctx.restore(); return;
  }

  // A hidden mimic remains a hittable, tissue-shaped body; periodic ripples betray it.
  if (mimic) {
    const age = (t - (target.born ?? 0)) % BATTLE_BALANCE.mimicPeriod;
    if (age < BATTLE_BALANCE.mimicDisturbance) {
      const ripple = age / BATTLE_BALANCE.mimicDisturbance;
      ctx.globalAlpha = (1 - ripple) * .8;
      ellipse(ctx, 0, 0, r + ripple * 35, (r + ripple * 35) * .47, '#00000000', '#e9c3a4');
      label(ctx, '≈', 0, -r * 1.5 - 12, '#f4d1ad', 18);
      ctx.globalAlpha = 1;
    }
  }

  if (source) {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU, x = Math.cos(a) * r * 1.1, y = Math.sin(a) * r * .4;
      line(ctx, [0, -5, x * .7, y - 11, x, y + 4], '#d273715c', 5);
      ellipse(ctx, x, y + 3, 8, 4, '#af6870', '#e5aa8b');
    }
    ellipse(ctx, 0, 0, r * 1.23, r * .4, '#6c304c', '#dc9c7e');
  }

  const bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
  const telegraph = (target.attackAt ?? 0) > t;
  ctx.save(); ctx.translate(0, -r * .8 + bob);
  if (elite) {
    const crownY = -r * 1.08;
    ctx.beginPath(); ctx.moveTo(-r * .58, crownY + 4); ctx.lineTo(-r * .7, crownY - 11);
    ctx.lineTo(-r * .18, crownY - 4); ctx.lineTo(0, crownY - 18); ctx.lineTo(r * .2, crownY - 4);
    ctx.lineTo(r * .67, crownY - 10); ctx.lineTo(r * .56, crownY + 5); ctx.closePath();
    ctx.fillStyle = '#f0c993'; ctx.fill(); ctx.strokeStyle = '#542b43'; ctx.lineWidth = 2; ctx.stroke();
  }

  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, target.hitUntil > t ? '#f4dfb3' : mimic ? '#a98c8c' : trait === 'CARAPACE' ? '#ab9cb3' : trait === 'FISSION' ? '#d2a08a' : '#d99186');
  body.addColorStop(.68, mimic ? '#9b7c86' : trait === 'CARAPACE' ? '#9989a7' : trait === 'FISSION' ? '#c58d80' : '#cd827d');
  body.addColorStop(1, mimic ? '#907581' : trait === 'CARAPACE' ? '#8c7b9b' : '#b97274');
  traceVirusOutline(ctx, trait, r); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = revealed && target.traits?.includes('MIMIC') ? '#527a69' : '#785967'; ctx.lineWidth = revealed ? 2.5 : 1.8; ctx.stroke();

  if (trait === 'CARAPACE') {
    const facing = target.facing ?? 0;
    ctx.save(); ctx.rotate(Math.atan2(Math.sin(facing) * .72, Math.cos(facing)));
    if (!exposed) {
      // The thick jagged front and a cut-out at the rear communicate directional armour.
      for (let i = -1; i <= 1; i++) {
        const a = i * .61;
        ctx.beginPath(); ctx.moveTo(r * .28, 0); ctx.lineTo(Math.cos(a - .35) * r * .85, Math.sin(a - .35) * r * .85);
        ctx.lineTo(Math.cos(a) * r * 1.09, Math.sin(a) * r * 1.09);
        ctx.lineTo(Math.cos(a + .35) * r * .85, Math.sin(a + .35) * r * .85); ctx.closePath();
        ctx.fillStyle = '#c4b6c4'; ctx.fill(); ctx.strokeStyle = '#796581'; ctx.lineWidth = 1; ctx.stroke();
      }
    } else {
      line(ctx, [r * .56, -r * .8, r * .84, -r * 1.05], '#fff4bf', 3);
      line(ctx, [r * .72, r * .65, r * 1.04, r * .88], '#fff4bf', 3);
    }
    ctx.restore();
    ellipse(ctx, -.15 * r, .09 * r, r * .39, r * .43, exposed ? '#ead3a0' : '#cfa99c', '#a38389');
    if (exposed) line(ctx, [-r * .4, -r * .2, -r * .14, r * .1, r * .1, -r * .22], '#fff7c9', 3);
  } else if (trait === 'FISSION') {
    // Two broad lobes share one cleft. Small translucent gel bubbles made
    // dense groups read as shine; the cleft now carries the splitting cue.
    line(ctx, [0, -r * .61, -.08 * r, -r * .27, .08 * r, r * .15, 0, .66 * r], '#916b70', 2);
    if ((target.generation ?? 0) === 0) label(ctx, 'Ⅱ', r * .65, r * .68, '#ffedc2', 11);
  } else if (trait === 'MIMIC') {
    ellipse(ctx, -.1 * r, .12 * r, r * .52, r * .28, mimic ? '#b3998933' : '#b4c4a344');
    if (revealed) {
      ctx.setLineDash([4, 5]); ellipse(ctx, 0, 0, r * 1.1, r * 1.08, '#00000000', '#547d6b'); ctx.setLineDash([]);
    }
  } else {
    ellipse(ctx, 0, r * .4, r * .42, r * .18, '#bc77745c');
  }

  if (!mimic) {
    const pupilX = Math.cos(target.facing ?? 0) * 1.3;
    ellipse(ctx, -r * .27, -3, telegraph ? 4 : 3.8, telegraph ? 2.7 : 5, '#e7d3a0');
    ellipse(ctx, r * .25, -3, telegraph ? 4 : 3.8, telegraph ? 2.7 : 5, '#e7d3a0');
    ellipse(ctx, -r * .27 + pupilX, -2, 1.5, 2.4, '#634e56'); ellipse(ctx, r * .25 + pupilX, -2, 1.5, 2.4, '#634e56');
    ellipse(ctx, 0, r * .3, r * .17, telegraph ? r * .19 : r * .1, '#e2bc85');
    if (telegraph) label(ctx, '!', 0, -r * .88, '#ecd9a9', 16);
  }
  ctx.restore();

  // Every actor retains its exact ground anchor, even while its body disguises.
  ctx.lineWidth = 1; ellipse(ctx, 0, 1, 9, 4, '#85687416', mimic ? '#9b80824a' : '#8c6a7955');
  ctx.restore();
}

function drawMotherCore(ctx: CanvasRenderingContext2D, target: Target, state: GameState, combat: MotherCoreState): void {
  const r = target.radius, time = state.elapsed, active = combat.activeTrait;
  const exposed = Math.max(combat.exposedUntil, target.exposedUntil ?? 0) > time;
  const disturbed = motherCoreDisturbed(combat, time);
  const hidden = active === 'MIMIC' && !disturbed && !exposed;
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
  if (target.hp <= 0) {
    ellipse(ctx, 0, 0, r, 12, '#9cddbd14', '#b1e7ca66');
    drawMotherCoreLocalAccents(ctx, target, state, combat, false); ctx.restore(); return;
  }
  // The fallback shares the round, short-bud virus family. Two low roots and
  // one cream heart distinguish a mother without rebuilding a glowing torso.
  for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sign * r * .26, -r * .45);
    ctx.bezierCurveTo(sign * r * .9, -r * .27, sign * r * .9, -2, sign * r * 1.2, 4);
    ctx.strokeStyle = '#b39b9c'; ctx.lineWidth = 9; ctx.stroke();
    ellipse(ctx, sign * r * 1.16, 4, r * .22, 6, '#9a828f', '#796773');
  }
  const lift = motherCoreLift(combat, time);
  ctx.save(); ctx.translate(0, -r * .96 + lift); ctx.globalAlpha = hidden ? .68 : 1;
  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, target.hitUntil > time ? '#ead6ad' : '#b29caa'); body.addColorStop(1, '#937d91');
  traceVirusOutline(ctx, undefined, r); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#766172'; ctx.lineWidth = 2.5; ctx.stroke();
  if (combat.traits.includes('FISSION')) {
    for (const sign of [-1, 1]) {
      const radius = active === 'FISSION' ? r * .3 : r * .24;
      ellipse(ctx, sign * r * .8, r * .2, radius, radius * 1.05, '#c2a09b', active === 'FISSION' ? '#e4cd9e' : '#987c87');
    }
  }
  if (combat.traits.includes('CARAPACE')) {
    const spread = exposed ? 1.3 : 1;
    for (const sign of [-1, 1]) {
      const x = sign * r * .57 * spread;
      ctx.beginPath(); ctx.ellipse(x, -r * .48, r * .3, r * .47, sign * .55, 0, TAU);
      ctx.fillStyle = active === 'CARAPACE' && !exposed ? '#c5b7c3' : '#a08da7'; ctx.fill(); ctx.strokeStyle = '#827084'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  // The visible heart of the lantern is the core's readable weak point.
  const coreY = -r * .14;
  ellipse(ctx, 0, coreY, r * .38, r * .55, exposed ? '#f0deb0' : '#d4b6a0', exposed ? '#795e58' : '#a18386');
  ctx.beginPath(); ctx.moveTo(-r * .22, coreY); ctx.lineTo(0, coreY - r * .32); ctx.lineTo(r * .22, coreY); ctx.lineTo(0, coreY + r * .3); ctx.closePath();
  ctx.fillStyle = exposed ? '#f8efd4' : '#8d707e'; ctx.fill();
  for (const sign of [-1, 1]) ellipse(ctx, sign * r * .48, -r * .22, r * .07, r * .13, '#e4cda0');
  ctx.restore();
  drawMotherCoreLocalAccents(ctx, target, state, combat, false);
  ctx.restore();
}

export function motherCoreLift(combat: MotherCoreState, time: number): number {
  return combat.phase === 'windup' ? -3 : combat.phase === 'recovery' ? 3 : Math.sin(time * 2.8) * 1.4;
}

/** Status cues for a separately rendered mother body; no body, core or trait attachment is painted here. */
export interface MotherCoreAccentGeometry { coreOffset: Vec; bodyBounds: { left: number; right: number; top: number; bottom: number } }
export interface MotherCoreStageCue {
  actorId: string; remaining: number; total: number; floorRatio: number; phaseFloorActive: boolean;
  exposed: boolean; stageOrigin: Vec; filledStages: number; visible: true;
}
export function drawMotherCoreAccents(ctx: CanvasRenderingContext2D, target: Target, state: GameState, combat: MotherCoreState,
  geometry?: MotherCoreAccentGeometry, options: { labels?: boolean } = {}): MotherCoreStageCue | undefined {
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
  const cue = drawMotherCoreLocalAccents(ctx, target, state, combat, true, geometry, options.labels !== false);
  ctx.restore();
  return cue;
}

/** Small pips describe remaining demonstration stages, not invulnerability.
 * The half-HP phase floor and temporary exposure are independent authorities. */
function drawMotherCoreStages(ctx: CanvasRenderingContext2D, target: Target, state: GameState, combat: MotherCoreState,
  geometry?: MotherCoreAccentGeometry): MotherCoreStageCue | undefined {
  if (!combat.membrane || ![combat.membrane.total, combat.membrane.remaining, combat.membrane.floorRatio].every(Number.isFinite)) return;
  const total = Math.max(1, Math.min(2, Math.floor(combat.membrane.total)));
  const remaining = Math.max(0, Math.min(total, Math.floor(combat.membrane.remaining)));
  const exposed = Math.max(combat.exposedUntil, target.exposedUntil ?? 0) > state.elapsed;
  const bodyY = -target.radius * .96 + motherCoreLift(combat, state.elapsed);
  const core = geometry?.coreOffset ?? { x: 0, y: bodyY - target.radius * .14 };
  const y = core.y + target.radius * (geometry ? .32 : .55) + 7;
  const width = total * 10 + 4, x = core.x - width / 2;
  ctx.beginPath(); ctx.roundRect(x, y - 4, width, 9, 3); ctx.fillStyle = '#efe4cce6'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#756d6380'; ctx.stroke();
  for (let index = 0; index < total; index++) {
    ctx.beginPath(); ctx.roundRect(x + 3 + index * 10, y - 1.5, 7, 4, 1.2);
    ctx.strokeStyle = index < remaining ? '#76566d' : '#7b957a'; ctx.lineWidth = 1;
    if (index < remaining) { ctx.fillStyle = '#8f6f87'; ctx.fill(); }
    ctx.stroke();
  }
  if (exposed) {
    // A separate open diamond means temporary exposure. It can coexist with
    // filled stage pips: exposure does not cancel the remaining phase floor.
    const dx = core.x + target.radius * .44, dy = core.y;
    ctx.beginPath(); ctx.moveTo(dx, dy - 5); ctx.lineTo(dx + 4, dy); ctx.lineTo(dx, dy + 5); ctx.lineTo(dx - 4, dy); ctx.closePath();
    ctx.strokeStyle = '#efe3c9'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#985e69'; ctx.lineWidth = 1.8; ctx.stroke();
  }
  return { actorId: target.id, remaining, total, floorRatio: combat.membrane.floorRatio,
    phaseFloorActive: remaining > 0 && combat.membrane.floorRatio > 0, exposed,
    stageOrigin: { x: core.x, y }, filledStages: remaining, visible: true };
}

/** The procedural fallback already conveys hits/exposure in its painted core. */
function motherCoreCaption(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size: number, color: string): void {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x - width / 2, y - size - 4, width, size + 10, 4);
  ctx.fillStyle = '#fff9e9ed'; ctx.fill(); ctx.strokeStyle = '#5e8b7d80'; ctx.lineWidth = 1; ctx.stroke();
  label(ctx, value, x, y, color, size); ctx.restore();
}

function drawMotherCoreLocalAccents(ctx: CanvasRenderingContext2D, target: Target, state: GameState, combat: MotherCoreState, spriteFeedback: boolean,
  geometry?: MotherCoreAccentGeometry, labels = true): MotherCoreStageCue | undefined {
  if (target.hp <= 0) {
    if (!labels) return;
    if (geometry) motherCoreCaption(ctx, '✓ 母巢核心已清除', (geometry.bodyBounds.left + geometry.bodyBounds.right) / 2,
      geometry.bodyBounds.top - 8, 130, 12, '#24574f');
    else label(ctx, '✓ 母巢核心已清除', 0, -15, '#d4efd4', 12);
    return;
  }
  const r = target.radius, time = state.elapsed, active = combat.activeTrait;
  const exposed = Math.max(combat.exposedUntil, target.exposedUntil ?? 0) > time;
  const bodyY = -r * .96 + motherCoreLift(combat, time);
  if (active === 'MIMIC' && (motherCoreDisturbed(combat, time) || (target.revealedUntil ?? 0) > time || exposed)) {
    const core = geometry?.coreOffset ?? { x: 0, y: bodyY - r * .14 };
    drawMimicStateMark(ctx, core.x - r * .54, core.y - r * .25,
      combat.revealedUntil > time || (target.revealedUntil ?? 0) > time || exposed);
  }
  if (active === 'CARAPACE') {
    ctx.save(); ctx.scale(1, .72); ctx.beginPath();
    const half = Math.acos(.2);
    ctx.arc(0, 0, r + 9, combat.facing - half, combat.facing + half);
    ctx.strokeStyle = geometry ? exposed ? '#79645d99' : '#64536a' : exposed ? '#efdac577' : '#e2d0e3'; ctx.lineWidth = exposed ? 1 : 3;
    if (exposed) ctx.setLineDash([5, 10]); ctx.stroke(); ctx.restore();
  }
  if (spriteFeedback) {
    const coreX = geometry?.coreOffset.x ?? 0, coreY = geometry?.coreOffset.y ?? bodyY - r * .14;
    if (target.hitUntil > time) {
      line(ctx, [coreX - 7, coreY, coreX + 7, coreY], geometry ? '#245d65' : '#fff4b7', 2.5);
      line(ctx, [coreX, coreY - 7, coreX, coreY + 7], geometry ? '#245d65' : '#fff4b7', 2.5);
    } else if (exposed && labels) label(ctx, '◇', coreX, coreY + 4, geometry ? '#6d3e4f' : '#fff5ce', 14);
  }
  ctx.lineWidth = 3;
  ellipse(ctx, 0, 2, 14, 5, '#ffd99d18', geometry ? exposed ? '#496f66' : '#8a5b60' : exposed ? '#fff1ba' : '#e7bea4');
  const traitText = combat.traits.map(trait => `${TRAIT_SYMBOL[trait]}${TRAIT_NAME[trait]}`).join(' / ');
  const stage = drawMotherCoreStages(ctx, target, state, combat, geometry);
  if (labels) motherCoreCaption(ctx, traitText, 0, 28, combat.traits.length > 1 ? 106 : 58, 10, '#5e3f4b');
  return stage;
}

/** Every warning is read directly from the serialized attack used for damage. */
export function drawMotherCoreDangers(ctx: CanvasRenderingContext2D, state: GameState, combat: MotherCoreState, labels?: SceneLabelSink): void {
  const attack = combat.attack;
  if (!attack || combat.organId !== state.battle?.organId || attack.resolveAt <= state.elapsed) return;
  const remaining = attack.resolveAt - state.elapsed, duration = attack.resolveAt - attack.startedAt;
  const progress = Math.max(0, Math.min(1, (state.elapsed - attack.startedAt) / duration));
  const caption = (value: string, anchor: Vec, offset: Vec, color: string, size = 11) => {
    if (labels) labels.add({ id: `core-danger:${combat.coreId}:${attack.id}`, anchor, offset: { x: offset.x, y: offset.y * .72 },
      priority: 100, essential: true, lines: [{ text: value, color, size }] });
    else groundLabel(ctx, value, anchor.x + offset.x, anchor.y + offset.y, color, size);
  };
  const protectPoint = (point: Vec, radius = 10) => labels?.reserveWorld?.({ left: point.x - radius, right: point.x + radius, top: point.y - radius, bottom: point.y + radius });
  ctx.save(); ctx.lineWidth = 2;
  if (attack.kind === 'crystal-sweep') {
    protectPoint(attack.origin);
    for (const sign of [-1, 1]) {
      const angle = attack.angle + sign * attack.halfAngle, direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const length = Math.min(attack.range, wallHit(attack.origin, direction, attack.range, activeWorld(state)) ?? attack.range);
      protectPoint({ x: attack.origin.x + direction.x * length, y: attack.origin.y + direction.y * length }, 5);
    }
    ctx.beginPath(); ctx.moveTo(attack.origin.x, attack.origin.y);
    for (let i = 0; i <= 64; i++) {
      const angle = attack.angle - attack.halfAngle + i / 64 * attack.halfAngle * 2, direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const distance = Math.min(attack.range, wallHit(attack.origin, direction, attack.range, activeWorld(state)) ?? attack.range);
      ctx.lineTo(attack.origin.x + direction.x * distance, attack.origin.y + direction.y * distance);
    }
    ctx.closePath(); ctx.fillStyle = '#b7818528'; ctx.fill(); ctx.strokeStyle = '#825365'; ctx.stroke();
    for (let i = 1; i <= 3; i++) {
      const radius = attack.range * i / 4, x = attack.origin.x + Math.cos(attack.angle) * radius, y = attack.origin.y + Math.sin(attack.angle) * radius;
      const block = wallHit(attack.origin, { x: Math.cos(attack.angle), y: Math.sin(attack.angle) }, radius, activeWorld(state));
      if (block !== null && block < radius) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(attack.angle); line(ctx, [-7, -6, 0, 0, -7, 6], '#ffdfaa', 2); ctx.restore();
    }
  } else {
    const centers = attack.kind === 'brood' ? attack.landings : [attack.aim];
    for (const center of centers) {
      protectPoint(center); protectPoint({ x: center.x, y: center.y - attack.radius - 5 }, 5);
      ctx.setLineDash(attack.kind === 'brood' ? [3, 5] : []);
      ellipse(ctx, center.x, center.y, attack.radius, attack.radius, '#b7818528', '#825365'); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(center.x, center.y, attack.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.strokeStyle = '#e3c7a3'; ctx.lineWidth = 3; ctx.stroke();
      line(ctx, [center.x - 6, center.y - 6, center.x + 6, center.y + 6], '#d7bba2', 2); line(ctx, [center.x - 6, center.y + 6, center.x + 6, center.y - 6], '#d7bba2', 2);
    }
    if (attack.kind === 'corrosion') {
      ctx.setLineDash([5, 7]); line(ctx, [attack.origin.x, attack.origin.y, attack.aim.x, attack.aim.y], '#805e6a', 1.5); ctx.setLineDash([]);
      const near = Math.hypot(state.player.x - attack.origin.x, state.player.y - attack.origin.y) <= MOTHER_CORE_BALANCE.scanRange;
      const counter = !near ? '靠近母巢后 Q 中断' : state.scanReady > state.elapsed ? `Q 冷却 ${(state.scanReady - state.elapsed).toFixed(1)}s · 抢修组织` : 'Q 扫描中断侵蚀';
      caption(`${counter} · ${remaining.toFixed(1)}s`, { x: (attack.origin.x + attack.aim.x) / 2, y: (attack.origin.y + attack.aim.y) / 2 }, { x: 0, y: -20 }, '#ffe5b7', 12);
    }
  }
  if (attack.kind !== 'corrosion') {
    const anchor = attack.kind === 'crystal-sweep' ? { x: attack.origin.x + Math.cos(attack.angle) * attack.range * .6, y: attack.origin.y + Math.sin(attack.angle) * attack.range * .6 }
      : attack.kind === 'brood' && attack.landings.length ? { x: attack.landings.reduce((sum, point) => sum + point.x, 0) / attack.landings.length,
        y: attack.landings.reduce((sum, point) => sum + point.y, 0) / attack.landings.length } : attack.aim;
    // Round warnings put their text just outside the actual impact/landing
    // radius, rather than inside the protected player or mother-core body.
    const offset = { x: 0, y: attack.kind === 'crystal-sweep' ? -32 : attack.radius + 24 };
    caption(`${attack.kind === 'brood' ? '⋈ 有限分裂' : attack.kind === 'crystal-sweep' ? '◇ 晶壳横扫' : '⋈ 裂殖爆发'} ${remaining.toFixed(1)}s`, anchor, offset, '#ffe6b4', 11);
  }
  ctx.restore();
}

const TRAIT_SYMBOL: Record<TraitId, string> = { CARAPACE: '◇', FISSION: '⋈', MIMIC: '◌' };
type LabelBox = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: LabelBox, b: LabelBox): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Protect actual small sprite features, not a full empty body bounding box. */
function reserveTargetFeatures(labels: SceneLabelSink, target: Target, state: GameState): void {
  const r = target.radius, time = state.elapsed, core = presentedMotherCombat(state);
  // The sprite is drawn at worldY*.72, then local y is uncompressed. Convert
  // local feature bounds back to ground-world y before reserveWorld projects it.
  const local = (x: number, y: number, rx: number, ry: number) => labels.reserveWorld?.({
    left: target.x + x - rx, right: target.x + x + rx,
    top: target.y + (y - ry) / .72, bottom: target.y + (y + ry) / .72,
  });
  const isMother = target.role === 'core' && core?.coreId === target.id;
  local(0, isMother ? 2 : 1, isMother ? 16 : 11, isMother ? 7 : 6);
  if (isMother) {
    const lift = core.phase === 'windup' ? -3 : core.phase === 'recovery' ? 3 : Math.sin(time * 2.8) * 1.4;
    const bodyY = -r * .96 + lift;
    local(0, bodyY - r * .14, r * .38 + 2, r * .55 + 2); // Real lantern weak point.
    local(0, bodyY - r * 1.21, 10, 8);
  } else {
    const bob = target.role === 'source' ? Math.sin(time * 2) * 1.2 : Math.sin(time * 5 + target.x) * 2;
    const bodyY = -r * .8 + bob;
    if (target.traits?.[0] === 'CARAPACE') local(-.15 * r, bodyY + .09 * r, r * .39 + 2, r * .43 + 2);
    else local(0, bodyY - 3, Math.max(9, r * .45 + 2), 8);
    if (target.role === 'elite' || target.role === 'core') local(0, bodyY - r * 1.08 - 18, 8, 8);
  }
}

/** Information floats above entities; ordinary names cannot drown an elite or weakness. */
export function drawBattleLabels(ctx: CanvasRenderingContext2D, state: GameState, labels?: SceneLabelSink): void {
  drawImmuneFocus(ctx, state, labels);
  drawCatalysis(ctx, state, labels);
  drawEliteTacticCycles(state, labels);
  const time = state.elapsed, aim = state.battle?.lastAim;
  const aimed = (target: Target): boolean => !!aim && Math.hypot(target.x - aim.x, target.y - aim.y) <= target.radius + 12;
  const priority = (target: Target): number => target.role === 'core' ? 0 : target.role === 'elite' ? 1 : target.role === 'source' ? 2 : aimed(target) ? 3 : 4;
  const targets = state.targets.filter(target => target.hp > 0).sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
  if (labels) {
    for (const target of targets) {
      const full = target.role === 'source' || target.role === 'elite' || target.role === 'core' || target.role === 'nest', focused = aimed(target);
      const tacticName = target.profession === 'slime-caster' ? '黏液法师' : target.profession === 'nest-builder' ? '筑巢者'
        : target.profession === 'fastling' && focused ? '高速幼体' : target.tactic && target.tactic !== 'melee' ? ENEMY_TACTIC_INFO[target.tactic].name : '';
      const exposed = (target.exposedUntil ?? 0) > time;
      const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > time) ?? false;
      const mimic = target.traits?.includes('MIMIC') && (target.revealedUntil ?? 0) <= time && state.scanUntil <= time && !exposed && !traced;
      if (mimic) continue;
      if (full || tacticName || focused || exposed) reserveTargetFeatures(labels, target, state);
      const bar = full || !!tacticName || focused || target.hitUntil > time, symbols = target.traits?.map(id => TRAIT_SYMBOL[id]).join('') ?? '';
      if (!full && !bar && (!symbols || !target.scanned)) continue;
      const role = target.role === 'nest' ? '小母巢' : target.role === 'core' ? '母巢' : target.role === 'elite' ? '精英' : '感染源';
      const name = full ? `${role}${tacticName ? ' · ' + tacticName : target.traits?.length ? ' · ' + target.traits.map(id => TRAIT_NAME[id]).join('·') : ''}` : tacticName || symbols;
      const baseY = -target.radius * 1.96 - (target.role === 'elite' || target.role === 'core' ? 17 : 7);
      labels.add({ id: `target:${target.id}`, anchor: { x: target.x, y: target.y }, offset: { x: 0, y: baseY - 7 },
        priority: focused || exposed ? 90 : target.role === 'core' ? 85 : target.role === 'elite' ? 80 : target.role === 'source' || tacticName ? 70 : bar ? 65 : 35,
        essential: bar || exposed, lines: name ? [{ text: name, color: full ? '#f4dcc2' : '#e6d0b9', size: full ? 10 : 11 }] : [],
        ...(bar ? { bar: { ratio: target.hp / target.maxHp, color: exposed ? '#ffe4a1' : '#f2bd9c', width: target.radius * 2 } } : {}) });
    }
    const groups: Target[][] = [];
    for (const target of targets.filter(item => (item.exposedUntil ?? 0) > time)) {
      const group = !aimed(target) && groups.find(items => !aimed(items[0]) && Math.hypot(items[0].x - target.x, items[0].y - target.y) < 65);
      if (group) group.push(target); else groups.push([target]);
    }
    for (const group of groups) {
      const target = group[0], seconds = Math.ceil(Math.min(...group.map(item => item.exposedUntil!)) - time);
      labels.add({ id: `weakness:${target.id}`, anchor: { x: target.x, y: target.y }, offset: { x: 0, y: 23 }, priority: 90, essential: true,
        lines: [{ text: `◇ 破绽 ${seconds}s${group.length > 1 ? ` ×${group.length}` : ''}`, color: '#ffe6b0', size: 11 }] });
    }
    return;
  }
  const occupied: LabelBox[] = [];
  for (const target of targets) {
    const full = target.role === 'source' || target.role === 'elite' || target.role === 'core' || target.role === 'nest';
    const tacticName = target.profession === 'slime-caster' ? '黏液法师' : target.profession === 'nest-builder' ? '筑巢者'
      : target.profession === 'fastling' && aimed(target) ? '高速幼体' : target.tactic && target.tactic !== 'melee' ? ENEMY_TACTIC_INFO[target.tactic].name : '';
    const exposed = (target.exposedUntil ?? 0) > time;
    const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > time) ?? false;
    const mimic = target.traits?.includes('MIMIC') && (target.revealedUntil ?? 0) <= time && state.scanUntil <= time && !exposed && !traced;
    if (mimic) continue;
    const focused = aimed(target), bar = full || !!tacticName || focused || target.hitUntil > time;
    const symbols = target.traits?.map(id => TRAIT_SYMBOL[id]).join('') ?? '';
    if (!full && !bar && (!symbols || !target.scanned)) continue;
    const role = target.role === 'nest' ? '小母巢' : target.role === 'core' ? '母巢' : target.role === 'elite' ? '精英' : '感染源';
    const name = full ? `${role}${tacticName ? ' · ' + tacticName : target.traits?.length ? ' · ' + target.traits.map(id => TRAIT_NAME[id]).join('·') : ''}` : tacticName || symbols;
    const width = Math.max(target.radius * 2, name.length * 10 + 10), baseY = -target.radius * 1.96 - (target.role === 'elite' || target.role === 'core' ? 17 : 7);
    const offsets = full || focused ? [0, -16, -32, -48, -64] : [0, -14];
    let chosen: number | undefined;
    for (const offset of offsets) {
      const box = { left: target.x - width / 2 - 4, right: target.x + width / 2 + 4, top: target.y * .72 + baseY + offset - 18, bottom: target.y * .72 + baseY + offset + 7 };
      if (!occupied.some(other => overlaps(other, box))) { occupied.push(box); chosen = offset; break; }
    }
    // Bodies retain their distinct silhouette, so an obscured ordinary badge can
    // yield its tiny area to the clinically useful labels above it.
    if (chosen === undefined && !full && !focused) continue;
    const offset = chosen ?? -64;
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    if (offset < -5) line(ctx, [0, baseY - 2, 0, baseY + offset + 5], '#d1c3aa59', 1);
    const y = baseY + offset;
    if (bar) {
      ctx.fillStyle = '#21182ce0'; ctx.beginPath(); ctx.roundRect(-target.radius, y, target.radius * 2, full ? 5 : 3, 2); ctx.fill();
      ctx.fillStyle = exposed ? '#ffe4a1' : '#f2bd9c';
      ctx.beginPath(); ctx.roundRect(-target.radius, y, Math.max(1, target.radius * 2 * target.hp / target.maxHp), full ? 5 : 3, 2); ctx.fill();
    }
    if (name) {
      ctx.font = `500 ${full ? 10 : 11}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.textAlign = 'center';
      ctx.strokeStyle = '#241b2ce0'; ctx.lineWidth = 3; ctx.strokeText(name, 0, y - 7);
      ctx.fillStyle = full ? '#f4dcc2' : '#e6d0b9'; ctx.fillText(name, 0, y - 7);
    }
    ctx.restore();
  }

  const groups: Target[][] = [];
  for (const target of targets.filter(target => (target.exposedUntil ?? 0) > time)) {
    const group = groups.find(items => Math.hypot(items[0].x - target.x, items[0].y - target.y) < 65);
    if (group) group.push(target); else groups.push([target]);
  }
  for (const group of groups) {
    const target = group[0], seconds = Math.ceil(Math.min(...group.map(item => item.exposedUntil!)) - time);
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    const value = `◇ 破绽 ${seconds}s${group.length > 1 ? ` ×${group.length}` : ''}`;
    ctx.font = '500 11px "Microsoft YaHei", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#241b2cf0'; ctx.lineWidth = 4; ctx.strokeText(value, 0, 23);
    ctx.fillStyle = '#ffe6b0'; ctx.fillText(value, 0, 23); ctx.restore();
  }
}
