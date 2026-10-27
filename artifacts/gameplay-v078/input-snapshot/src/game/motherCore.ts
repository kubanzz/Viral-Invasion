import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { BALANCE, type Vec, type WorldGeometry } from './types';
import type { TraitId } from './battleTypes';
import type { MotherCoreAttack, MotherCoreCommand, MotherCoreContext, MotherCoreOptions, MotherCoreState } from './motherCoreTypes';
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
      seenTraits: [], membrane: { total: traits.length, remaining: traits.length, floorRatio: MOTHER_CORE_BALANCE.membraneFloor, thresholdReached: false } };
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
  damageLimit(context: MotherCoreContext, requestedDamage: number): number {
    const s = this.state;
    if (!this.valid(context) || context.core.hp <= 0 || !Number.isFinite(requestedDamage) || requestedDamage <= 0) return 0;
    const floor = s.membrane.remaining > 0 ? context.core.maxHp * s.membrane.floorRatio : 0;
    const amount = Math.min(requestedDamage, Math.max(0, context.core.hp - floor));
    if (s.membrane.remaining > 0 && context.core.hp - amount <= floor + 1e-9 && !s.membrane.thresholdReached) {
      s.membrane.thresholdReached = true;
      // This shortens an awakening/recovery, never the actual attack windup.
      if (!s.attack) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed);
    }
    return amount;
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
      commands.push({ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_REENTRY_GRACE', { duration: MOTHER_CORE_BALANCE.returnGrace }));
    }
    s.lastTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.core.exposedUntil ?? 0);
    s.revealedUntil = Math.max(s.revealedUntil, context.core.revealedUntil ?? 0);
    if (s.traits.includes('FISSION')) for (const threshold of MOTHER_CORE_BALANCE.broodThresholds) {
      if (context.core.hp / context.core.maxHp <= threshold && !s.broodReleased.includes(threshold) && !s.broodQueued.includes(threshold)) s.broodQueued.push(threshold);
    }
    if (s.phase !== 'windup') {
      const desired = Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x);
      s.facing = turnToward(s.facing, desired, MOTHER_CORE_BALANCE.turnSpeed * BALANCE.step);
    }
    if (s.attack && context.elapsed + 1e-9 >= s.attack.resolveAt) commands.push(...this.resolveAttack(context));
    if (!s.attack && context.elapsed + 1e-9 >= s.nextActionAt) commands.push(...this.beginAttack(context));
    commands.push(this.pose());
    return commands;
  }

  private beginAttack(context: MotherCoreContext): MotherCoreCommand[] {
    const s = this.state; const B = MOTHER_CORE_BALANCE;
    const priorityTrait = s.membrane.thresholdReached && s.membrane.remaining > 0 ? s.traits.find(trait => !s.seenTraits.includes(trait)) : undefined;
    const threshold = s.broodQueued[0] !== undefined && (!priorityTrait || priorityTrait === 'FISSION') ? s.broodQueued[0] : undefined;
    const trait = priorityTrait ?? (threshold !== undefined ? 'FISSION' : s.traits[s.phaseIndex % s.traits.length]);
    s.activeTrait = trait; s.phase = 'windup'; s.phaseStartedAt = context.elapsed;
    const attack: MotherCoreAttack = { id: `${s.coreId}:attack:${++s.attackSerial}`,
      kind: trait === 'CARAPACE' ? 'crystal-sweep' : trait === 'FISSION' ? 'fission-burst' : 'corrosion', trait,
      startedAt: context.elapsed, resolveAt: context.elapsed + (trait === 'CARAPACE' ? B.sweepWindup : trait === 'FISSION' ? B.burstWindup : B.corrosionWindup),
      origin: point(context.core), aim: trait === 'MIMIC' ? point(context.tissue) : point(context.player),
      angle: s.facing, range: trait === 'CARAPACE' ? B.sweepRange : 0,
      radius: trait === 'FISSION' ? B.burstRadius : trait === 'MIMIC' ? context.tissue.radius + 12 : 0,
      halfAngle: trait === 'CARAPACE' ? B.sweepHalfAngle : 0, landings: [] };
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
    if (attack.kind === 'brood') {
      for (let index = 0; index < attack.landings.length; index++) commands.push({ ...this.base, kind: 'spawn',
        actorId: `${s.coreId}:brood:${attack.threshold}:${index}`, sourceId: s.coreId, position: point(attack.landings[index]),
        role: 'virus', traits: ['FISSION'], generation: 1, hp: B.childHp, radius: B.childRadius });
      s.broodReleased.push(attack.threshold!); s.broodQueued = s.broodQueued.filter(threshold => threshold !== attack.threshold);
      commands.push(this.log('CORE_BROOD_RELEASED', { attackId: attack.id, threshold: attack.threshold!, children: attack.landings.length, generation: 1 }));
    } else if (attack.kind === 'corrosion') {
      commands.push({ ...this.base, kind: 'damageTissue', amount: B.corrosionTissueDamage, attackId: attack.id, reason: 'core-corrosion' });
    } else if (attack.kind === 'crystal-sweep') {
      if (canHurtPlayer && coneContains(attack, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: 'damagePlayer', amount: B.sweepPlayerDamage, attackId: attack.id, reason: 'core-crystal-sweep' });
      if (coneContains(attack, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: 'damageTissue', amount: B.sweepTissueDamage, attackId: attack.id, reason: 'core-crystal-sweep' });
    } else {
      if (canHurtPlayer && distance(attack.aim, context.player) <= attack.radius + context.player.radius && lineClear(attack.aim, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: 'damagePlayer', amount: B.burstPlayerDamage, attackId: attack.id, reason: 'core-fission-burst' });
      if (distance(attack.aim, context.tissue) <= attack.radius + context.tissue.radius && lineClear(attack.aim, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: 'damageTissue', amount: B.burstTissueDamage, attackId: attack.id, reason: 'core-fission-burst' });
    }
    s.attacksResolved++; s.attack = null; s.phase = 'recovery'; s.phaseStartedAt = context.elapsed;
    commands.push(...this.demonstrateTrait(attack.trait, context));
    if (attack.kind !== 'brood') s.phaseIndex++;
    const recovery = attack.kind === 'brood' ? B.broodRecovery : B.recovery;
    s.nextActionAt = context.elapsed + recovery;
    if (s.membrane.thresholdReached && s.membrane.remaining > 0) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed + B.membraneTransition);
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + recovery);
    s.revealedUntil = Math.max(s.revealedUntil, context.elapsed + recovery);
    commands.push({ ...this.base, kind: 'cancelTelegraph' },
      { ...this.base, kind: 'expose', until: s.exposedUntil, revealUntil: s.revealedUntil, reason: 'core-recovery' },
      { ...this.base, kind: 'effect', effect: attack.kind === 'corrosion' ? 'hit' : 'burst', from: attack.origin, to: attack.aim, radius: attack.radius || 50, duration: .45 },
      this.log('CORE_ATTACK_RESOLVED', { attackId: attack.id, kind: attack.kind, recovery, damageCommands: commands.filter(command => command.kind === 'damagePlayer' || command.kind === 'damageTissue').length }));
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
    s.broodQueued = []; s.exposedUntil = 0; s.revealedUntil = 0;
    return [{ ...this.base, kind: 'cancelTelegraph' }, this.log('CORE_CLEARED', { actorId: s.coreId, traits: s.traits.join('+'), elapsed: context.elapsed, scanInterrupts: s.scanInterrupts, broodWaves: s.broodReleased.length })];
  }
}
