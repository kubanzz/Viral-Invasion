import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { BALANCE, type Vec, type WorldGeometry } from './types';
import type { TraitId } from './battleTypes';
import type { HeartBossRuntime, MotherCoreAttack, MotherCoreCommand, MotherCoreContext, MotherCoreDamageOrigin, MotherCoreOptions, MotherCoreState } from './motherCoreTypes';
import { advanceBossWalk, BOSS_LOCOMOTION, bossSegmentPoint, bossStraightEnd, createBossLocomotion, recordBossMovement, stopBossLocomotion } from './bossLocomotion';
export type * from './motherCoreTypes';

export const MOTHER_CORE_BALANCE = {
  hp: 680, radius: 52,
  awakening: 2, returnGrace: 1.2, recovery: 2.4, broodRecovery: 1.4,
  turnSpeed: .75, sweepWindup: 1.2, sweepRange: 330, sweepHalfAngle: .66,
  sweepPlayerDamage: 14, sweepTissueDamage: 6,
  burstWindup: 1.1, burstRadius: 88, burstPlayerDamage: 12, burstTissueDamage: 6,
  corrosionWindup: 1.8, corrosionTissueDamage: 12, corrosionInterruptExposure: 3.5,
  broodThresholds: [.66, .33], broodWindup: .9, broodChildren: 2, childHp: 22, childRadius: 14,
  scanRange: 650, scanReveal: 5, pulseExposure: 4,
  mimicPeriod: 6, mimicDisturbance: 1.2,
  membraneFloor: .5, membraneTransition: .45,
} as const;
const HEART_BOSS_BAR_HP = 5400;
const HEART_BOSS_BARS = 3;
export const HEART_BOSS_BALANCE = {
  hp: HEART_BOSS_BAR_HP * HEART_BOSS_BARS, barHp: HEART_BOSS_BAR_HP, bars: HEART_BOSS_BARS, transition: .6, toughness: 100, stagger: 1.2,
  pulseWindup: 1.2, pulseDamage: 30, finalPulseDamage: 32, pulseSeconds: .9,
  pulseInner: 80, pulseOuter: 650, pulseThickness: 24, pulseGapHalfAngle: .5,
  // A side opening requires a readable move rather than automatically sheltering
  // the player who stays on the same firing line throughout the windup.
  pulseGapOffset: .95,
  sweepWindup: 1.2, sweepRange: 620, sweepHalfAngle: .38, sweepPlayerDamage: 24,
  markWindup: .95, markRadius: 72, markDamage: 20,
  doubleSweepWindups: [1.1, .75], finalSweepDamage: 28,
  guardInterval: 12, guardWindup: 1, guardCount: 4, guardCap: 6, guardHp: 68,
  recovery: 1.2,
} as const;

const point = (position: Vec): Vec => ({ x: position.x, y: position.y });
const LEGAL_TRAITS: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
function turnToward(current: number, desired: number, maximum: number): number {
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  return current + Math.max(-maximum, Math.min(maximum, delta));
}
function lineClear(from: Vec, to: Vec, radius: number, geometry: WorldGeometry): boolean {
  const length = distance(from, to);
  if (length < 1e-8) return true;
  const hit = wallHit(from, normalized(to.x - from.x, to.y - from.y), length, geometry);
  return hit === null || hit >= length - radius;
}
function coneContains(attack: MotherCoreAttack, position: Vec, radius: number, geometry: WorldGeometry): boolean {
  const length = distance(attack.origin, position);
  if (length > attack.range + radius) return false;
  if (length <= radius) return true;
  const direction = normalized(position.x - attack.origin.x, position.y - attack.origin.y);
  return direction.x * Math.cos(attack.angle) + direction.y * Math.sin(attack.angle) >= Math.cos(attack.halfAngle)
    && lineClear(attack.origin, position, radius, geometry);
}

/** The same disturbance rule is available to presentation and deterministic tests. */
export function motherCoreDisturbed(state: MotherCoreState, elapsed: number): boolean {
  return state.activeTrait !== 'MIMIC' || state.revealedUntil > elapsed || elapsed % MOTHER_CORE_BALANCE.mimicPeriod < MOTHER_CORE_BALANCE.mimicDisturbance;
}

/**
 * Boss combat owns only its serialized state. It returns commands through the
 * host's shared damage/spawn paths and never writes player, tissue or target HP.
 */
export class MotherCoreController {
  readonly state: MotherCoreState;
  constructor(options: MotherCoreOptions, existingState?: MotherCoreState) {
    const traits = [...new Set(options.traits.filter(trait => LEGAL_TRAITS.includes(trait)))];
    if (!traits.length || traits.length > 2) throw new RangeError('Mother core requires one or two encountered traits');
    if (existingState) {
      if (existingState.coreId !== options.coreId || existingState.organId !== options.organId) throw new Error('Mother core state belongs to a different actor or organ');
      this.state = existingState;
      return;
    }
    this.state = { schemaVersion: 1, coreId: options.coreId, organId: options.organId, traits,
      activeTrait: traits[0], phase: 'awakening', phaseIndex: 0, phaseStartedAt: options.elapsed,
      facing: options.facing ?? 0, nextActionAt: options.elapsed + MOTHER_CORE_BALANCE.awakening, attack: null,
      exposedUntil: 0, revealedUntil: 0, broodQueued: [], broodReleased: [], attackSerial: 0,
      attacksResolved: 0, scanInterrupts: 0, cleared: false, clearedAt: null, lastTick: options.tick - 1,
      introduced: false, lastScanTick: -1, lastPulseTick: -1,
      seenTraits: [], membrane: { total: traits.length, remaining: traits.length, floorRatio: MOTHER_CORE_BALANCE.membraneFloor, thresholdReached: false },
      ...(options.heartExpedition ? { heartExpedition: true, secondPhase: false, pulseQueued: false, pulseUsed: false,
        heartBoss: this.createHeartRuntime(options.elapsed) } : {}) };
  }
  private createHeartRuntime(elapsed: number): HeartBossRuntime {
    return { stage: 1, stageStartedAt: elapsed, transitionUntil: 0, toughness: HEART_BOSS_BALANCE.toughness,
      toughnessMax: HEART_BOSS_BALANCE.toughness, brokenUntil: 0, pendingBarBreak: false,
      blockedDamageTransactions: [], attackIndex: 0, nextGuardAt: elapsed + HEART_BOSS_BALANCE.guardInterval, guardWaveSerial: 0 };
  }
  private get base() { return { coreId: this.state.coreId, organId: this.state.organId }; }
  private log(type: string, data: Record<string, string | number | boolean>): MotherCoreCommand {
    return { kind: 'log', type, data: { ...this.base, ...data } };
  }
  private valid(context: MotherCoreContext): boolean {
    return context.active && context.core.id === this.state.coreId && !this.state.cleared;
  }
  private pose(): MotherCoreCommand { return { ...this.base, kind: 'pose', traits: [this.state.activeTrait], facing: this.state.facing }; }

  /**
   * Public two-membrane rule. Until every encountered trait has resolved one
   * attack (or had corrosion successfully countered), damage can reach half HP.
   * Reaching that line calls the next unshown trait into a fully telegraphed turn.
   * The host must apply this to every core-damage origin, including protocols.
   */
  damageLimit(context: MotherCoreContext, requestedDamage: number, origin?: MotherCoreDamageOrigin): number {
    const s = this.state;
    if (!this.valid(context) || context.core.hp <= 0 || !Number.isFinite(requestedDamage) || requestedDamage <= 0) return 0;
    if (s.heartExpedition) {
      const heart = s.heartBoss ??= this.createHeartRuntime(context.elapsed);
      const transactions = [origin?.rootId && `root:${origin.rootId}`, origin?.castId && `cast:${origin.castId}`].filter((value): value is string => !!value);
      if (!transactions.length) transactions.push(`tick:${context.tick}`);
      if (transactions.some(transaction => heart.blockedDamageTransactions.includes(transaction)) || heart.pendingBarBreak) return 0;
      const floor = context.core.maxHp * (HEART_BOSS_BALANCE.bars - heart.stage) / HEART_BOSS_BALANCE.bars;
      const amount = Math.min(requestedDamage, Math.max(0, context.core.hp - floor));
      if (heart.stage < 3 && context.core.hp - amount <= floor + 1e-9) {
        heart.pendingBarBreak = true;
        heart.blockedDamageTransactions.push(...transactions.filter(transaction => !heart.blockedDamageTransactions.includes(transaction)));
      }
      return amount;
    }
    const floor = s.membrane.remaining > 0 ? context.core.maxHp * s.membrane.floorRatio : 0;
    const amount = Math.min(requestedDamage, Math.max(0, context.core.hp - floor));
    if (s.membrane.remaining > 0 && context.core.hp - amount <= floor + 1e-9 && !s.membrane.thresholdReached) {
      s.membrane.thresholdReached = true;
      // This shortens an awakening/recovery, never the actual attack windup.
      if (!s.attack) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed);
    }
    return amount;
  }

  /** Consume only on a real positive hit, after the host's shared damage path. */
  damageToughness(context: MotherCoreContext, amount: number, _origin?: MotherCoreDamageOrigin): MotherCoreCommand[] {
    const s = this.state;
    if (!s.heartExpedition || !this.valid(context) || context.core.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return [];
    const heart = s.heartBoss ??= this.createHeartRuntime(context.elapsed);
    if (heart.pendingBarBreak || heart.brokenUntil > context.elapsed) return [];
    heart.toughness = Math.max(0, heart.toughness - amount);
    const commands: MotherCoreCommand[] = [this.log('HEART_BOSS_TOUGHNESS_DAMAGED', { amount, remaining: heart.toughness, stage: heart.stage })];
    if (heart.toughness > 0) return commands;
    heart.brokenUntil = context.elapsed + HEART_BOSS_BALANCE.stagger;
    if (s.locomotion) {
      delete s.locomotion.lunge; stopBossLocomotion(s.locomotion, true); s.locomotion.holdUntil = heart.brokenUntil;
    }
    s.attack = null; delete s.pulse; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed; s.nextActionAt = heart.brokenUntil;
    s.exposedUntil = Math.max(s.exposedUntil, heart.brokenUntil); s.revealedUntil = Math.max(s.revealedUntil, heart.brokenUntil);
    commands.push({ ...this.base, kind: 'cancelTelegraph' },
      { ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'heart-boss-stagger' },
      this.log('HEART_BOSS_STAGGERED', { until: heart.brokenUntil, stage: heart.stage }));
    return commands;
  }

  private demonstrateTrait(trait: TraitId, context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state;
    if (s.seenTraits.includes(trait)) return [];
    s.seenTraits.push(trait);
    s.membrane.remaining = Math.max(0, s.membrane.total - s.seenTraits.length);
    if (s.membrane.remaining === 0) s.membrane.floorRatio = 0;
    return [this.log('CORE_MEMBRANE_BROKEN', { trait, remaining: s.membrane.remaining, total: s.membrane.total,
      floorRatio: s.membrane.floorRatio, seenTraits: s.seenTraits.join('+') }),
      { ...this.base, kind: 'effect', effect: 'evolution', from: point(context.core), to: point(context.core), radius: context.core.radius + 24, duration: .6 },
      ...(s.membrane.remaining === 0 ? [this.log('CORE_MEMBRANES_OPENED', { seenTraits: s.seenTraits.join('+') })] : [])];
  }

  tick(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state;
    if (!this.valid(context)) return [];
    if (context.core.hp <= 0) return this.notifyCleared(context);
    if (context.tick <= s.lastTick) return [];
    const motion = s.locomotion ??= createBossLocomotion(context.core);
    stopBossLocomotion(motion);
    if (s.heartExpedition) return this.tickHeartBoss(context);
    const commands: MotherCoreCommand[] = [];
    if (!s.introduced) {
      s.introduced = true;
      s.phase = 'awakening'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = s.membrane.thresholdReached ? context.elapsed : Math.max(s.nextActionAt, context.elapsed + MOTHER_CORE_BALANCE.awakening);
      commands.push(this.log('CORE_COMBAT_STARTED', { traits: s.traits.join('+'), warningSeconds: s.membrane.thresholdReached ? 0 : MOTHER_CORE_BALANCE.awakening,
        membranes: s.membrane.total, floorRatio: s.membrane.floorRatio }));
    } else if (s.lastTick >= 0 && context.tick - s.lastTick > 1) {
      // Global time continues in the other organ. A returning player receives a
      // fresh telegraph rather than an attack whose old deadline already passed.
      s.attack = null; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + MOTHER_CORE_BALANCE.returnGrace;
      motion.holdUntil = s.nextActionAt; stopBossLocomotion(motion, true);
      commands.push({ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_REENTRY_GRACE', { duration: MOTHER_CORE_BALANCE.returnGrace }));
    }
    s.lastTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.core.exposedUntil ?? 0);
    s.revealedUntil = Math.max(s.revealedUntil, context.core.revealedUntil ?? 0);
    if (s.heartExpedition && !s.secondPhase && context.core.hp <= context.core.maxHp / 2) {
      s.secondPhase = true; s.pulseQueued = true;
      commands.push(this.log('HEART_BOSS_SECOND_PHASE', { hp: context.core.hp, threshold: .5 }));
    }
    if (s.traits.includes('FISSION')) for (const threshold of MOTHER_CORE_BALANCE.broodThresholds) {
      if (context.core.hp / context.core.maxHp <= threshold && !s.broodReleased.includes(threshold) && !s.broodQueued.includes(threshold)) s.broodQueued.push(threshold);
    }
    if (s.phase !== 'windup') {
      const desired = Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x);
      s.facing = turnToward(s.facing, desired, MOTHER_CORE_BALANCE.turnSpeed * BALANCE.step);
    }
    if (s.attack && context.elapsed + 1e-9 >= s.attack.resolveAt) commands.push(...this.resolveAttack(context));
    if (s.pulse) commands.push(...this.advancePulse(context));
    if (!s.attack && !s.pulse && context.elapsed + 1e-9 >= s.nextActionAt) commands.push(...this.beginAttack(context));
    if (!s.attack && !s.pulse && s.phase === 'recovery' && context.elapsed < s.nextActionAt) {
      const delta = advanceBossWalk(context, motion, undefined, s.phaseIndex);
      if (delta) commands.push({ ...this.base, kind: 'move', delta });
    }
    commands.push(this.pose());
    return commands;
  }

  private tickHeartBoss(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state, heart = s.heartBoss ??= this.createHeartRuntime(context.elapsed), commands: MotherCoreCommand[] = [];
    const motion = s.locomotion!;
    if (!s.introduced) {
      s.introduced = true; s.phase = 'awakening'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = Math.max(s.nextActionAt, context.elapsed + MOTHER_CORE_BALANCE.awakening);
      // Trait membranes remain a campaign rule. Heart phases own their bars.
      s.membrane.remaining = 0; s.membrane.floorRatio = 0;
      commands.push(this.log('CORE_COMBAT_STARTED', { traits: s.traits.join('+'), bars: HEART_BOSS_BALANCE.bars, barHp: context.core.maxHp / HEART_BOSS_BALANCE.bars,
        warningSeconds: MOTHER_CORE_BALANCE.awakening }));
    } else if (s.lastTick >= 0 && context.tick - s.lastTick > 1) {
      s.attack = null; delete s.pulse; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + MOTHER_CORE_BALANCE.returnGrace;
      delete motion.lunge; stopBossLocomotion(motion, true); motion.holdUntil = s.nextActionAt;
      commands.push({ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_REENTRY_GRACE', { duration: MOTHER_CORE_BALANCE.returnGrace }));
    }
    s.lastTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.core.exposedUntil ?? 0);
    s.revealedUntil = Math.max(s.revealedUntil, context.core.revealedUntil ?? 0);
    // The damage path stops at one bar. Advancing here cancels an old warning
    // once, without making the next bar immune to a fresh independent attack.
    const floor = context.core.maxHp * (HEART_BOSS_BALANCE.bars - heart.stage) / HEART_BOSS_BALANCE.bars;
    if (heart.stage < 3 && (heart.pendingBarBreak || context.core.hp <= floor + 1e-9)) {
      const previous = heart.stage;
      heart.stage = (heart.stage + 1) as 2 | 3; heart.stageStartedAt = context.elapsed;
      heart.transitionUntil = context.elapsed + HEART_BOSS_BALANCE.transition; heart.pendingBarBreak = false;
      heart.attackIndex = 0; heart.nextGuardAt = context.elapsed + HEART_BOSS_BALANCE.guardInterval;
      heart.toughness = heart.toughnessMax; heart.brokenUntil = 0;
      s.secondPhase = true; s.attack = null; delete s.pulse; s.pulseQueued = false;
      s.phase = 'recovery'; s.phaseStartedAt = context.elapsed; s.nextActionAt = heart.transitionUntil;
      delete motion.lunge; stopBossLocomotion(motion, true); motion.holdUntil = heart.transitionUntil;
      commands.push({ ...this.base, kind: 'cancelTelegraph' }, this.log('HEART_BOSS_BAR_BROKEN', { previous, stage: heart.stage, hp: context.core.hp }),
        { ...this.base, kind: 'effect', effect: 'evolution', from: point(context.core), to: point(context.core), radius: context.core.radius + 36, duration: HEART_BOSS_BALANCE.transition });
    }
    if (heart.brokenUntil > 0 && context.elapsed + 1e-9 >= heart.brokenUntil) {
      heart.brokenUntil = 0; heart.toughness = heart.toughnessMax;
      commands.push(this.log('HEART_BOSS_TOUGHNESS_RESTORED', { stage: heart.stage, toughness: heart.toughness }));
    }
    if (heart.brokenUntil > context.elapsed) return [...commands, this.pose()];
    if (s.attack && context.elapsed + 1e-9 >= s.attack.resolveAt) commands.push(...this.resolveHeartAttack(context));
    if (s.pulse) commands.push(...this.advancePulse(context));
    if (motion.lunge) commands.push(...this.advanceLunge(context));
    if (!s.attack && !s.pulse && !motion.lunge && context.elapsed + 1e-9 >= s.nextActionAt) commands.push(...this.beginHeartAttack(context));
    if (!s.attack && !s.pulse && !motion.lunge && s.phase === 'recovery' && context.elapsed < s.nextActionAt) {
      const delta = advanceBossWalk(context, motion, heart.stage, heart.attackIndex);
      if (delta) {
        s.facing = turnToward(s.facing, Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x), 2.2 * BALANCE.step);
        commands.push({ ...this.base, kind: 'move', delta });
      }
    } else if (s.attack?.kind === 'heart-lunge') motion.mode = 'lunge-windup';
    commands.push(this.pose());
    return commands;
  }

  private beginHeartAttack(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state, heart = s.heartBoss!, B = HEART_BOSS_BALANCE, stage = heart.stage;
    const guardSpace = Math.max(0, B.guardCap - (context.liveGuardCount ?? 0));
    const summon = stage >= 2 && context.elapsed >= heart.nextGuardAt && guardSpace > 0;
    const slot = heart.attackIndex % (stage === 3 ? 4 : 3);
    const kind = summon ? 'heart-guard-call' : stage === 1 && slot === 1 ? 'heart-marked-strike'
      : stage >= 2 && slot === (stage === 3 ? 2 : 1) ? 'heart-pulse'
      : slot === (stage === 3 ? 3 : 2) ? 'heart-lunge' : 'crystal-sweep';
    if (stage >= 2 && context.elapsed >= heart.nextGuardAt && !guardSpace) heart.nextGuardAt = context.elapsed + B.guardInterval;
    const sweepStep = stage === 3 ? (slot === 1 ? 2 : 1) : undefined;
    const windup = kind === 'heart-guard-call' ? B.guardWindup : kind === 'heart-marked-strike' ? B.markWindup
      : kind === 'heart-lunge' ? BOSS_LOCOMOTION.lunge.windup[stage - 1]
      : kind === 'heart-pulse' ? B.pulseWindup : stage === 3 ? B.doubleSweepWindups[sweepStep! - 1] : B.sweepWindup;
    const facing = Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x);
    s.facing = facing; s.phase = 'windup'; s.phaseStartedAt = context.elapsed;
    const attack: MotherCoreAttack = { id: `${s.coreId}:attack:${++s.attackSerial}`, kind, trait: s.activeTrait,
      startedAt: context.elapsed, resolveAt: context.elapsed + windup, origin: point(context.core),
      aim: kind === 'heart-marked-strike' ? point(context.player) : point(context.core),
      angle: facing + (kind === 'heart-pulse' ? B.pulseGapOffset : 0),
      range: kind === 'heart-pulse' ? B.pulseOuter : kind === 'crystal-sweep' ? B.sweepRange : 0,
      radius: kind === 'heart-marked-strike' ? B.markRadius : kind === 'heart-pulse' ? B.pulseThickness : 18,
      halfAngle: kind === 'heart-pulse' ? B.pulseGapHalfAngle : kind === 'crystal-sweep' ? B.sweepHalfAngle : 0,
      damage: kind === 'heart-marked-strike' ? B.markDamage : kind === 'heart-pulse' ? stage === 3 ? B.finalPulseDamage : B.pulseDamage
        : stage === 3 ? B.finalSweepDamage : B.sweepPlayerDamage,
      ...(sweepStep ? { sweepStep } : {}), landings: [] };
    if (kind === 'heart-lunge') {
      const direction = { x: Math.cos(facing), y: Math.sin(facing) };
      const reach = Math.min(BOSS_LOCOMOTION.lunge.range[stage - 1], Math.max(BOSS_LOCOMOTION.lunge.minimumDistance,
        distance(context.core, context.player) + BOSS_LOCOMOTION.lunge.overshoot));
      attack.aim = bossStraightEnd(context.core, direction, reach, context.core.radius, context.geometry);
      attack.range = distance(context.core, attack.aim); attack.radius = context.core.radius;
      attack.damage = BOSS_LOCOMOTION.lunge.damage[stage - 1];
    }
    if (summon) {
      heart.guardWaveSerial++; heart.nextGuardAt = context.elapsed + B.guardInterval;
      attack.landings = Array.from({ length: Math.min(B.guardCount, guardSpace) }, (_, index) => {
        const angle = index / Math.min(B.guardCount, guardSpace) * Math.PI * 2 + Math.PI / 4;
        return moveWithCollision(point(context.core), { x: Math.cos(angle) * 115, y: Math.sin(angle) * 115 }, 17, context.geometry);
      });
    }
    s.attack = attack;
    return [{ ...this.base, kind: 'telegraph', attack: structuredClone(attack) },
      this.log('CORE_ATTACK_TELEGRAPHED', { attackId: attack.id, kind, stage, resolveAt: attack.resolveAt,
        x: attack.aim.x, y: attack.aim.y, angle: attack.angle, range: attack.range, radius: attack.radius, halfAngle: attack.halfAngle,
        sweepStep: sweepStep ?? 0 })];
  }

  private resolveHeartAttack(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state, heart = s.heartBoss!, attack = s.attack!, B = HEART_BOSS_BALANCE, commands: MotherCoreCommand[] = [];
    if (attack.kind === 'heart-lunge') {
      const duration = attack.range / BOSS_LOCOMOTION.lunge.speed[heart.stage - 1];
      s.locomotion!.lunge = { attack: structuredClone(attack), direction: { x: Math.cos(attack.angle), y: Math.sin(attack.angle) },
        aim: point(attack.aim), startedAt: context.elapsed, endsAt: context.elapsed + duration, lastAt: context.elapsed, hitPlayer: false };
      s.locomotion!.mode = 'lunge'; s.attack = null; s.phase = 'lunging'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + duration + BOSS_LOCOMOTION.lunge.recovery;
      return [{ ...this.base, kind: 'cancelTelegraph' }, this.log('HEART_BOSS_LUNGE_RELEASED', {
        attackId: attack.id, x: attack.origin.x, y: attack.origin.y, aimX: attack.aim.x, aimY: attack.aim.y,
        until: s.locomotion!.lunge.endsAt, stage: heart.stage })];
    }
    if (attack.kind === 'heart-pulse') {
      s.pulse = { attack: structuredClone(attack), startedAt: context.elapsed, endsAt: context.elapsed + B.pulseSeconds, hitPlayer: false };
      commands.push(this.log('HEART_BOSS_PULSE_STARTED', { attackId: attack.id, angle: attack.angle, endsAt: s.pulse.endsAt, radius: B.pulseOuter }));
    } else if (attack.kind === 'heart-guard-call') {
      const count = Math.min(attack.landings.length, Math.max(0, B.guardCap - (context.liveGuardCount ?? 0)));
      for (let index = 0; index < count; index++) commands.push({ ...this.base, kind: 'spawn',
        actorId: `${s.coreId}:guard:${heart.guardWaveSerial}:${index}`, sourceId: `${s.coreId}:guard`, position: point(attack.landings[index]),
        role: 'virus', traits: [], generation: 1, hp: B.guardHp, radius: 17 });
      commands.push(this.log('HEART_BOSS_GUARDS_CALLED', { attackId: attack.id, count, cap: B.guardCap }));
    } else if (context.elapsed >= context.player.dashUntil) {
      const hit = attack.kind === 'crystal-sweep' ? coneContains(attack, context.player, context.player.radius, context.geometry)
        : distance(attack.aim, context.player) <= attack.radius + context.player.radius
          && lineClear(attack.aim, context.player, context.player.radius, context.geometry);
      if (hit) commands.push({ ...this.base, kind: 'damagePlayer', amount: attack.damage ?? B.sweepPlayerDamage,
        attackId: attack.id, reason: attack.kind === 'crystal-sweep' ? 'core-crystal-sweep' : 'heart-boss-marked-strike' });
    }
    s.attacksResolved++; s.attack = null; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
    if (attack.kind !== 'heart-guard-call') heart.attackIndex++;
    const recovery = heart.stage === 3 && attack.kind === 'crystal-sweep' ? attack.sweepStep === 1 ? .25 : .5 : B.recovery;
    s.nextActionAt = context.elapsed + recovery;
    s.locomotion!.holdUntil = context.elapsed + Math.min(recovery, BOSS_LOCOMOTION.recoveryHold);
    // The ring remains the sole attack until its travel completes.
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + recovery); s.revealedUntil = Math.max(s.revealedUntil, s.exposedUntil);
    commands.push({ ...this.base, kind: 'cancelTelegraph' },
      { ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'core-recovery' },
      { ...this.base, kind: 'effect', effect: 'burst', from: attack.origin, to: attack.aim, radius: attack.radius || 50, duration: .35 },
      this.log('CORE_ATTACK_RESOLVED', { attackId: attack.id, kind: attack.kind, stage: heart.stage, recovery,
        damageCommands: commands.filter(command => command.kind === 'damagePlayer').length }));
    return commands;
  }

  private advanceLunge(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state, motion = s.locomotion!, lunge = motion.lunge!, heart = s.heartBoss!, commands: MotherCoreCommand[] = [];
    const through = Math.min(context.elapsed, lunge.endsAt), dt = Math.max(0, through - lunge.lastAt);
    lunge.lastAt = through; motion.mode = 'lunge';
    const budget = BOSS_LOCOMOTION.lunge.speed[heart.stage - 1] * dt * Math.max(0, Math.min(1, context.movementFactor ?? 1));
    const next = bossStraightEnd(context.core, lunge.direction, Math.min(distance(context.core, lunge.aim), budget), context.core.radius, context.geometry);
    const delta = recordBossMovement(motion, context.core, next, context.elapsed);
    if (motion.moving) {
      commands.push({ ...this.base, kind: 'move', delta });
      const closest = bossSegmentPoint(context.player, context.core, next);
      if (!lunge.hitPlayer && context.elapsed >= context.player.dashUntil
        && distance(closest, context.player) <= lunge.attack.radius + context.player.radius
        && lineClear(closest, context.player, context.player.radius, context.geometry)) {
        lunge.hitPlayer = true;
        commands.push({ ...this.base, kind: 'damagePlayer', amount: lunge.attack.damage!, attackId: lunge.attack.id, reason: 'heart-boss-lunge' });
      }
    }
    if (context.elapsed + 1e-9 >= lunge.endsAt || budget > 0 && (!motion.moving || distance(next, lunge.aim) < 1e-6)) {
      s.attacksResolved++; heart.attackIndex++; delete motion.lunge;
      stopBossLocomotion(motion, true); s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
      motion.holdUntil = context.elapsed + BOSS_LOCOMOTION.lunge.recovery;
      s.nextActionAt = motion.holdUntil;
      s.exposedUntil = Math.max(s.exposedUntil, motion.holdUntil); s.revealedUntil = Math.max(s.revealedUntil, motion.holdUntil);
      commands.push({ ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'core-recovery' },
        this.log('CORE_ATTACK_RESOLVED', { attackId: lunge.attack.id, kind: 'heart-lunge', stage: heart.stage,
          recovery: BOSS_LOCOMOTION.lunge.recovery, damageCommands: lunge.hitPlayer ? 1 : 0 }));
    }
    return commands;
  }

  private beginAttack(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state; const B = MOTHER_CORE_BALANCE;
    if (s.heartExpedition && s.pulseQueued && !s.pulseUsed) {
      s.pulseQueued = false; s.pulseUsed = true; s.phase = 'windup'; s.phaseStartedAt = context.elapsed;
      const attack: MotherCoreAttack = { id: `${s.coreId}:attack:${++s.attackSerial}`, kind: 'heart-pulse', trait: s.activeTrait,
        startedAt: context.elapsed, resolveAt: context.elapsed + HEART_BOSS_BALANCE.pulseWindup,
        origin: point(context.core), aim: point(context.core),
        angle: Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x) + HEART_BOSS_BALANCE.pulseGapOffset,
        range: HEART_BOSS_BALANCE.pulseOuter, radius: HEART_BOSS_BALANCE.pulseThickness,
        halfAngle: HEART_BOSS_BALANCE.pulseGapHalfAngle, landings: [] };
      s.attack = attack;
      return [{ ...this.base, kind: 'telegraph', attack: structuredClone(attack) },
        this.log('CORE_ATTACK_TELEGRAPHED', { attackId: attack.id, kind: attack.kind, trait: attack.trait,
          resolveAt: attack.resolveAt, x: attack.origin.x, y: attack.origin.y, angle: attack.angle, range: attack.range,
          radius: attack.radius, halfAngle: attack.halfAngle })];
    }
    const priorityTrait = s.membrane.thresholdReached && s.membrane.remaining > 0 ? s.traits.find(trait => !s.seenTraits.includes(trait)) : undefined;
    const threshold = s.broodQueued[0] !== undefined && (!priorityTrait || priorityTrait === 'FISSION') ? s.broodQueued[0] : undefined;
    const trait = priorityTrait ?? (threshold !== undefined ? 'FISSION' : s.traits[s.phaseIndex % s.traits.length]);
    s.activeTrait = trait; s.phase = 'windup'; s.phaseStartedAt = context.elapsed;
    const sweepWindup = s.heartExpedition ? HEART_BOSS_BALANCE.sweepWindup : B.sweepWindup;
    const sweepRange = s.heartExpedition ? HEART_BOSS_BALANCE.sweepRange : B.sweepRange;
    const sweepHalfAngle = s.heartExpedition ? HEART_BOSS_BALANCE.sweepHalfAngle : B.sweepHalfAngle;
    // Expedition sweeps lock the actual current firing lane once, then never
    // track a dodge during their visible windup. Campaign turning is unchanged.
    if (s.heartExpedition && trait === 'CARAPACE') s.facing = Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x);
    const attack: MotherCoreAttack = { id: `${s.coreId}:attack:${++s.attackSerial}`,
      kind: trait === 'CARAPACE' ? 'crystal-sweep' : trait === 'FISSION' ? 'fission-burst' : 'corrosion', trait,
      startedAt: context.elapsed, resolveAt: context.elapsed + (trait === 'CARAPACE' ? sweepWindup : trait === 'FISSION' ? B.burstWindup : B.corrosionWindup),
      origin: point(context.core), aim: trait === 'MIMIC' ? point(context.tissue) : point(context.player),
      angle: s.facing, range: trait === 'CARAPACE' ? sweepRange : 0,
      radius: trait === 'FISSION' ? B.burstRadius : trait === 'MIMIC' ? context.tissue.radius + 12 : 0,
      halfAngle: trait === 'CARAPACE' ? sweepHalfAngle : 0, landings: [] };
    if (threshold !== undefined) {
      attack.kind = 'brood'; attack.threshold = threshold;
      attack.resolveAt = context.elapsed + B.broodWindup;
      attack.radius = B.childRadius + 5; attack.aim = point(context.core);
      attack.landings = [-1, 1].map(side => moveWithCollision(point(context.core), { x: side * 78, y: 48 }, B.childRadius, context.geometry));
    }
    s.attack = attack;
    return [this.log('CORE_PHASE_CHANGED', { trait, phaseIndex: s.phaseIndex }),
      { ...this.base, kind: 'telegraph', attack: structuredClone(attack) },
      this.log('CORE_ATTACK_TELEGRAPHED', { attackId: attack.id, kind: attack.kind, trait, resolveAt: attack.resolveAt,
        x: attack.aim.x, y: attack.aim.y, angle: attack.angle, range: attack.range, radius: attack.radius, halfAngle: attack.halfAngle })];
  }

  private resolveAttack(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state; const B = MOTHER_CORE_BALANCE; const attack = s.attack!;
    const commands: MotherCoreCommand[] = [];
    const canHurtPlayer = context.elapsed >= context.player.dashUntil;
    if (attack.kind === 'heart-pulse') {
      s.pulse = { attack: structuredClone(attack), startedAt: context.elapsed, endsAt: context.elapsed + HEART_BOSS_BALANCE.pulseSeconds, hitPlayer: false };
      commands.push(this.log('HEART_BOSS_PULSE_STARTED', { attackId: attack.id, angle: attack.angle,
        endsAt: s.pulse.endsAt, radius: HEART_BOSS_BALANCE.pulseOuter }));
    } else if (attack.kind === 'brood') {
      for (let index = 0; index < attack.landings.length; index++) commands.push({ ...this.base, kind: 'spawn',
        actorId: `${s.coreId}:brood:${attack.threshold}:${index}`, sourceId: s.coreId, position: point(attack.landings[index]),
        role: 'virus', traits: ['FISSION'], generation: 1, hp: B.childHp, radius: B.childRadius });
      s.broodReleased.push(attack.threshold!); s.broodQueued = s.broodQueued.filter(threshold => threshold !== attack.threshold);
      commands.push(this.log('CORE_BROOD_RELEASED', { attackId: attack.id, threshold: attack.threshold!, children: attack.landings.length, generation: 1 }));
    } else if (attack.kind === 'corrosion') {
      commands.push({ ...this.base, kind: 'damageTissue', amount: B.corrosionTissueDamage, attackId: attack.id, reason: 'core-corrosion' });
    } else if (attack.kind === 'crystal-sweep') {
      if (canHurtPlayer && coneContains(attack, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: 'damagePlayer', amount: s.heartExpedition ? HEART_BOSS_BALANCE.sweepPlayerDamage : B.sweepPlayerDamage, attackId: attack.id, reason: 'core-crystal-sweep' });
      if (coneContains(attack, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: 'damageTissue', amount: B.sweepTissueDamage, attackId: attack.id, reason: 'core-crystal-sweep' });
    } else {
      if (canHurtPlayer && distance(attack.aim, context.player) <= attack.radius + context.player.radius && lineClear(attack.aim, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: 'damagePlayer', amount: B.burstPlayerDamage, attackId: attack.id, reason: 'core-fission-burst' });
      if (distance(attack.aim, context.tissue) <= attack.radius + context.tissue.radius && lineClear(attack.aim, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: 'damageTissue', amount: B.burstTissueDamage, attackId: attack.id, reason: 'core-fission-burst' });
    }
    s.attacksResolved++; s.attack = null; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
    commands.push(...this.demonstrateTrait(attack.trait, context));
    if (attack.kind !== 'brood') s.phaseIndex++;
    const recovery = attack.kind === 'brood' ? B.broodRecovery : s.heartExpedition ? HEART_BOSS_BALANCE.recovery : B.recovery;
    s.nextActionAt = context.elapsed + recovery;
    if (s.locomotion) s.locomotion.holdUntil = context.elapsed + Math.min(recovery, BOSS_LOCOMOTION.recoveryHold);
    if (s.membrane.thresholdReached && s.membrane.remaining > 0) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed + B.membraneTransition);
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + recovery);
    s.revealedUntil = Math.max(s.revealedUntil, context.elapsed + recovery);
    commands.push({ ...this.base, kind: 'cancelTelegraph' },
      { ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'core-recovery' },
      { ...this.base, kind: 'effect', effect: attack.kind === 'corrosion' ? 'hit' : 'burst', from: attack.origin, to: attack.aim, radius: attack.radius || 50, duration: .45 },
      this.log('CORE_ATTACK_RESOLVED', { attackId: attack.id, kind: attack.kind, recovery, damageCommands: commands.filter(command => command.kind === 'damagePlayer' || command.kind === 'damageTissue').length }));
    return commands;
  }

  private advancePulse(context: MotherCoreContext): MotherCoreCommand[] {
    const pulse = this.state.pulse!;
    const fraction = Math.max(0, Math.min(1, (context.elapsed - pulse.startedAt) / HEART_BOSS_BALANCE.pulseSeconds));
    const radius = HEART_BOSS_BALANCE.pulseInner + fraction * (HEART_BOSS_BALANCE.pulseOuter - HEART_BOSS_BALANCE.pulseInner);
    const length = distance(context.player, pulse.attack.origin), angle = Math.atan2(context.player.y - pulse.attack.origin.y, context.player.x - pulse.attack.origin.x);
    const fromGap = Math.abs(Math.atan2(Math.sin(angle - pulse.attack.angle), Math.cos(angle - pulse.attack.angle)));
    const commands: MotherCoreCommand[] = [];
    if (!pulse.hitPlayer && context.elapsed >= context.player.dashUntil && fromGap > pulse.attack.halfAngle
      && Math.abs(length - radius) <= HEART_BOSS_BALANCE.pulseThickness + context.player.radius
      && lineClear(pulse.attack.origin, context.player, context.player.radius, context.geometry)) {
      pulse.hitPlayer = true;
      commands.push({ ...this.base, kind: 'damagePlayer', amount: pulse.attack.damage ?? HEART_BOSS_BALANCE.pulseDamage,
        attackId: pulse.attack.id, reason: 'heart-boss-pulse' });
    }
    if (context.elapsed + 1e-9 >= pulse.endsAt) delete this.state.pulse;
    return commands;
  }

  onScan(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state; const B = MOTHER_CORE_BALANCE;
    if (!this.valid(context) || context.core.hp <= 0 || distance(context.player, context.core) > B.scanRange || s.lastScanTick === context.tick) return [];
    s.lastScanTick = context.tick;
    s.revealedUntil = Math.max(s.revealedUntil, context.elapsed + B.scanReveal);
    const commands: MotherCoreCommand[] = [];
    if (s.attack?.kind === 'corrosion' && context.elapsed <= s.attack.resolveAt + 1e-9) {
      const attackId = s.attack.id;
      s.attack = null; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + B.recovery;
      if (s.locomotion) { stopBossLocomotion(s.locomotion, true); s.locomotion.holdUntil = context.elapsed + BOSS_LOCOMOTION.recoveryHold; }
      s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + B.corrosionInterruptExposure); s.scanInterrupts++;
      // A successful counter completes this trait's turn. Repeating the same
      // channel forever would let Q prevent the second encountered trait from
      // ever appearing on a fused core.
      s.phaseIndex++;
      commands.push(...this.demonstrateTrait('MIMIC', context));
      if (s.membrane.thresholdReached && s.membrane.remaining > 0) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed + B.membraneTransition);
      commands.push({ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_CORROSION_INTERRUPTED', { attackId, by: 'scan', exposure: B.corrosionInterruptExposure }));
    }
    commands.push({ ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'core-scan' },
      this.log('CORE_SCAN_REVEALED', { duration: B.scanReveal, interrupted: commands.length > 0 }));
    return commands;
  }

  /** Called only after the host's real pulse-sector/obstacle hit test succeeds. */
  onPulse(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state; const B = MOTHER_CORE_BALANCE;
    if (!this.valid(context) || context.core.hp <= 0 || s.lastPulseTick === context.tick) return [];
    s.lastPulseTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + B.pulseExposure);
    s.revealedUntil = Math.max(s.revealedUntil, s.exposedUntil);
    return [{ ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'environment-pulse' },
      this.log('CORE_PULSE_EXPOSED', { until: s.exposedUntil })];
  }

  notifyCleared(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state;
    if (s.cleared || context.core.id !== s.coreId || context.core.hp > 0) return [];
    s.cleared = true; s.clearedAt = context.elapsed; s.phase = 'defeated'; s.attack = null;
    s.broodQueued = []; s.exposedUntil = 0; s.revealedUntil = 0; delete s.pulse; s.pulseQueued = false;
    if (s.locomotion) { delete s.locomotion.lunge; stopBossLocomotion(s.locomotion, true); }
    return [{ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_CLEARED', { actorId: s.coreId, traits: s.traits.join('+'), elapsed: context.elapsed, scanInterrupts: s.scanInterrupts, broodWaves: s.broodReleased.length })];
  }
}
