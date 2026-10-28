import { clamp, distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type InputFrame, type MessagePriority, type Target, type Vec } from './types';
import type { BattleState, CampaignOptions, TraitId } from './battleTypes';
import { BATTLE_BALANCE as B, TRAITS } from './battleConfig';
import { recordBehavior, chooseEvolution } from './evolution';
import { getOrganDefinition } from './organConfig';
import { ENCOUNTER_CONFIGS } from './encounterConfig';
import { acceptedFirstCounter } from './counterLesson';
import { ENEMY_CROWD, moveEnemyThroughCrowd, planEnemySpacing } from '../actors/enemyCrowd';
import { endlessCombatStats } from './endlessGrowth';
import { endlessPacing } from './endlessPacing';
import { EnemyNavigator } from '../actors/enemyNavigation';
import { enemyAttackPlan, enemyAttackHits, enemyRayEnd, segmentDistance } from './enemyTactics';
import { standoffMotion } from './enemyPositioning';
import { updateEnemyFacing } from './enemyFacing';
import { activeEliteTacticCycle, commitEliteTactic, finishEliteTactic, prepareEliteTactic } from './eliteTacticCycle';

export interface BattleHost {
  state: GameState;
  emit(type: string, data: GameEvent['data']): void;
  message(text: string, seconds?: number, priority?: MessagePriority): void;
  effect(kind: Effect['kind'], from: Vec, to: Vec, radius: number, duration: number): void;
  finish(success: boolean, reason: string): void;
  slowFactor?(targetId: string): number;
  isMigratingActor?(targetId: string): boolean;
}

const BRANCHES: TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
export function initializeBattle(state: GameState, options: CampaignOptions): void {
  const rng = new SeedRng(state.seed);
  const formal = options.milestone === 'G3' && options.encounterMode !== 'fixture';
  const guideVariant = formal && options.counterGuide !== 'adaptive' && (!options.firstTrait || options.firstTrait === 'CARAPACE') ? 'guided' : 'adaptive';
  const sampledTrait = options.firstTrait ?? BRANCHES[rng.int(0, 2)];
  const firstTrait = guideVariant === 'guided' ? 'CARAPACE' : sampledTrait;
  const layout = options.milestone === 'G3' ? getOrganDefinition('heart') : undefined;
  if (layout) {
    state.world = layout.geometry;
    Object.assign(state.player, layout.playerStart);
    Object.assign(state.tissue, layout.tissue);
    state.terminal = { ...layout.terminal };
  }
  state.tissue.hp = 62;
  state.targets = [];
  const nodes: BattleState['graph']['nodes'] = [
    { id: 'source-a', kind: 'source', ...(layout?.sourcePositions[0] ?? { x: 610, y: 330 }), active: true, infected: true },
    { id: 'source-b', kind: 'source', ...(layout?.sourcePositions[1] ?? { x: 920, y: 435 }), active: true, infected: true },
    { id: 'gate', kind: 'gate', ...(layout?.gate ?? { x: 335, y: 230 }), active: true, infected: false },
    { id: 'valve', kind: 'valve', ...(layout?.device ?? { x: 730, y: 230 }), active: true, infected: false },
    { id: 'tissue', kind: 'tissue', x: state.tissue.x, y: state.tissue.y, active: true, infected: false },
    { id: 'retest', kind: 'retest', ...state.terminal, active: true, infected: false },
  ];
  if (options.milestone && options.milestone !== 'G1') nodes.push({ id: 'research', kind: 'research', ...(layout?.research ?? { x: 475, y: 610 }), active: true, infected: false });
  const edges = [['source-a', 'gate'], ['gate', 'tissue'], ['source-b', 'valve'], ['valve', 'tissue']].map(([from, to]) => {
    const a = nodes.find(node => node.id === from)!;
    const b = nodes.find(node => node.id === to)!;
    return { id: `${from}:${to}`, from, to, open: true, nextSpread: B.spreadInterval, flowDirection: normalized(b.x - a.x, b.y - a.y) };
  });
  state.battle = {
    milestone: options.milestone ?? 'G1', organId: 'heart', graph: { nodes, edges },
    pressure: { infection: 26, vitality: 100, criticalSince: null, organAlarm: false, crisisReason: '' },
    pulse: { phase: 'charge', phaseRemaining: 2, readyAt: 0, activeUntil: 0, origin: { ...(layout?.device ?? { x: 730, y: 230 }) }, direction: Math.PI / 2, uses: 0 },
    warning: null, traits: [], defeatedTraits: [], nextEvolutionAt: B.firstWarningAt,
    stage: 0, stageLabel: 'Ⅰ · 初始感染', objective: 'Q 诊断感染源；清除两处感染源并保护十字组织。', readyToRetest: false,
    lastAim: { ...(layout?.sourcePositions[0] ?? { x: 610, y: 330 }) }, stats: { kills: 0, sourceClears: 0, eliteClears: 0, repairs: 0, pulses: 0, playerDamage: 0, tissueDamage: 0, scans: 0 },
    nextSpawnAt: { 'source-a': B.spawnInterval, 'source-b': B.spawnInterval + 2 }, nextActorId: 0,
    firstTrait, recentNotice: '', gateChangedAt: -10, organLowSince: null, eliteSpawned: 0, history: [],
    ...(options.milestone && options.milestone !== 'G1' ? { forcedFirstTrait: options.firstTrait, behaviorHistory: [], evolutionDecisions: [] } : {}),
    encounter: { configId: formal ? 'campaign-1' : 'fixture-1', guideVariant, openingSpawned: 0, firstCounter: { status: 'opening', guideStatus: guideVariant === 'guided' ? 'active' : 'inactive', targetId: null, warnedAt: null, appliedAt: null, resolvedAt: null, skippedAt: null, completedAt: null, counterHit: null } },
  };
  for (const node of nodes.filter(n => n.kind === 'source')) {
    state.targets.push({ ...node, id: node.id, kind: 'single', role: 'source', hp: B.sourceHp, maxHp: B.sourceHp, radius: 34, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0 });
  }
  const initialOrdinary = formal ? ENCOUNTER_CONFIGS['campaign-1'].initialOrdinary : ENCOUNTER_CONFIGS['fixture-1'].initialOrdinary;
  for (let i = 0; i < initialOrdinary; i++) {
    const source = formal ? nodes[i % 2] : i < 2 ? nodes[0] : nodes[1];
    const position = moveWithCollision(source, { x: rng.int(-80, 80), y: rng.int(-65, 65) }, 22, activeWorld(state));
    state.targets.push({ ...position, id: `virus-${++state.battle.nextActorId}`, kind: 'single', role: 'virus', radius: 22, hp: B.ordinaryHp, maxHp: B.ordinaryHp, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 1 + i * .3, generation: 0, sourceId: source.id });
  }
  state.message = '感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。';
  state.messageUntil = 10;
}

/** G1 rules attach to the shared session; tools/movement/time stay in GameSession. */
export class BattleDirector {
  private readonly navigator = new EnemyNavigator();
  private readonly fissionBirths = new WeakMap<Target, number>();
  constructor(private host: BattleHost) {}
  private get s() { return this.host.state; }
  private get b() { return this.s.battle!; }
  notice(text: string, seconds = 5, priority: MessagePriority = 1): void {
    this.b.recentNotice = text;
    this.b.history.push({ at: this.s.elapsed, text });
    if (this.b.history.length > 128) this.b.history.shift();
    this.host.message(text, seconds, priority);
  }

  recordEvent(event: GameEvent): void {
    const encounter = this.b.encounter, lesson = encounter?.firstCounter;
    if (encounter?.configId === 'campaign-1' && lesson?.targetId && !lesson.counterHit) {
      const target = this.s.targets.find(item => item.id === lesson.targetId);
      const method = target && acceptedFirstCounter(this.s, event, target);
      if (method) {
        lesson.counterHit = { tick: event.tick, at: this.s.elapsed, targetId: target!.id, method, damage: Number(event.data.damage) };
        if (encounter.guideVariant === 'guided' && lesson.guideStatus !== 'completed') {
          lesson.guideStatus = 'completed'; lesson.completedAt = this.s.elapsed;
          this.host.emit('COUNTER_GUIDE_COMPLETED', { id: target!.id, method, damage: Number(event.data.damage), tick: event.tick });
        }
      }
    }
    if (this.b.milestone === 'G1') return;
    const data = event.data;
    const kind = event.type === 'TARGET_HIT' && data.cause !== 'protocol' ? data.tool === 1 ? 'precisionDamage' : data.tool === 2 ? 'areaDamage' : undefined
      : event.type === 'SCAN_COMPLETED' ? 'scan'
      : event.type === 'ROUTE_CHANGED' && data.open === false ? 'isolate'
      : event.type === 'ORGAN_INTEGRITY_CHANGED' && data.reason === 'repair' && Number(data.after) > Number(data.before) ? 'repair' : undefined;
    if (!kind) return;
    const amount = kind === 'precisionDamage' || kind === 'areaDamage' ? Number(data.damage) : kind === 'repair' ? Number(data.after) - Number(data.before) : 1;
    this.b.behaviorHistory = recordBehavior(this.b.behaviorHistory ?? [], { tick: event.tick, kind, amount });
  }

  skipCounterGuide(): boolean {
    const encounter = this.b.encounter, lesson = encounter?.firstCounter;
    if (encounter?.guideVariant !== 'guided' || lesson?.guideStatus !== 'active') return false;
    lesson.guideStatus = 'skipped'; lesson.skippedAt = this.s.elapsed;
    this.host.emit('COUNTER_GUIDE_SKIPPED', { id: lesson.targetId ?? '', at: this.s.elapsed });
    return true;
  }

  beforeInput(input: InputFrame): void {
    this.b.lastAim = { ...input.aim };
    const pulse = this.b.pulse;
    pulse.cycleIndex = Math.floor(this.s.elapsed / B.pulseCycle);
    pulse.direction = Math.atan2(input.aim.y - pulse.origin.y, input.aim.x - pulse.origin.x);
    const beat = this.s.elapsed % B.pulseCycle;
    pulse.phase = beat < B.chargeDuration ? 'charge' : beat < B.chargeDuration + B.surgeDuration ? 'surge' : 'rest';
    pulse.phaseRemaining = (pulse.phase === 'charge' ? B.chargeDuration : pulse.phase === 'surge' ? B.chargeDuration + B.surgeDuration : B.pulseCycle) - beat;
  }

  scan(): void {
    const state = this.s;
    let count = 0;
    for (const target of state.targets) if (target.hp > 0 && distance(state.player, target) <= BALANCE.scanRadius) {
      target.revealedUntil = state.elapsed + B.scanReveal;
      if (target.attackPlan?.kind === 'mimic-corrosion' && target.attackAt !== undefined) {
        this.recoverEnemy(target, 2);
        target.attackReady = state.elapsed + 2;
        const completed = finishEliteTactic(state, target, 'mimic-corrosion', 'scan-interrupted');
        this.host.emit('ENDLESS_CORROSION_INTERRUPTED', { actorId: target.id, method: 'scan', exposedSeconds: 2 });
        if (this.s !== state || state.phase !== 'playing') return;
        if (completed) {
          this.host.emit('ELITE_TACTIC_ADVANCED', completed);
          if (this.s !== state || state.phase !== 'playing') return;
        }
        this.host.effect('burst', target, target, 65, .4);
      }
      count++;
    }
    this.b.stats.scans++;
    this.host.emit('BATTLE_DIAGNOSED', { count, revealSeconds: B.scanReveal });
    this.host.message(`诊断 ${count} 个感染体。◇ 晶壳绕后/冲流；⋈ 裂殖用 2；◌ 潜伏用 Q/组织修复。`, 6);
  }

  modifiedDamage(target: Target, damage: number): number {
    if (target.traits?.includes('CARAPACE') && (target.exposedUntil ?? 0) <= this.s.elapsed) {
      const incoming = Math.atan2(this.s.player.y - target.y, this.s.player.x - target.x);
      const frontal = Math.cos(incoming - (target.facing ?? 0)) > .2;
      if (frontal && this.s.tool === 1) {
        this.host.emit('CARAPACE_RESISTED', { id: target.id, raw: damage, actual: damage * B.carapaceResistance });
        return damage * B.carapaceResistance;
      }
    }
    return damage;
  }

  cleared(target: Target): void {
    const { s, b } = this;
    target.deadAt = s.elapsed;
    target.attackAt = undefined;
    target.attackAim = undefined;
    target.attackTarget = undefined;
    target.attackPlan = undefined; target.attackWindup = undefined;
    target.charge = undefined; target.recoverUntil = undefined;
    if (target.eliteCycle) delete target.eliteCycle.committedTick;
    target.revealedUntil = 0;
    target.exposedUntil = 0;
    const fission = target.role !== 'source' && target.role !== 'core' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0;
    // Reserve the promised children before any synchronous death callback.
    if (fission) {
      target.splitAt = s.elapsed + B.fissionDelay;
      target.splitPositions = [-1, 1].map(offset => moveWithCollision({ x: target.x, y: target.y }, { x: offset * 27, y: 10 }, 14, activeWorld(s)));
    }
    if (target.role === 'source') {
      const node = b.graph.nodes.find(n => n.id === target.id)!;
      node.active = false; node.infected = false;
      b.stats.sourceClears++;
      b.pressure.infection = Math.max(0, b.pressure.infection - B.sourceRelief);
      this.host.emit('INFECTION_SOURCE_CLEARED', { organId: b.organId, nodeId: target.id, actor: 'player' });
      if (this.s !== s || s.phase !== 'playing') return;
      this.notice(`感染源已净化${s.campaign ? `（本局累计 ${b.stats.sourceClears}）` : `（${b.stats.sourceClears}/2）`}，停止增殖，感染负荷 -${B.sourceRelief}。`);
    } else {
      b.stats.kills++;
      b.pressure.infection = Math.max(0, b.pressure.infection - B.killRelief);
      if (target.role === 'elite') {
        b.stats.eliteClears++;
        const first = b.encounter?.firstCounter;
        if (first?.targetId === target.id && first.status !== 'resolved') {
          first.status = 'resolved'; first.resolvedAt = s.elapsed;
          this.host.emit('FIRST_COUNTER_RESOLVED', { id: target.id, organId: b.organId, countered: first.counterHit !== null });
          if (this.s !== s || s.phase !== 'playing') return;
        }
        for (const trait of target.traits ?? []) if (!b.defeatedTraits.includes(trait)) b.defeatedTraits.push(trait);
        this.host.emit('ELITE_CLEARED', { id: target.id, organId: b.organId, trait: target.traits?.join('+') ?? '' });
        if (this.s !== s || s.phase !== 'playing') return;
        this.notice(s.endless ? '变异精英已清除！继续清场领取本波进化。' : `变异精英已清除（${b.stats.eliteClears}/2）。保持组织，继续诊断。`);
      }
      if (fission) {
        this.host.emit('FISSION_WARNING', { parentId: target.id, children: 2, applyAt: target.splitAt! });
      }
    }
  }

  repaired(amount: number): void {
    if (amount <= 0) return;
    this.b.stats.repairs++;
    this.b.pressure.infection = Math.max(0, this.b.pressure.infection - B.repairRelief);
    if (distance(this.s.player, this.s.tissue) < 200) this.s.player.hp = Math.min(this.s.endlessGrowth ? endlessCombatStats(this.s.endlessGrowth).maxHp : 100, this.s.player.hp + 4);
    this.host.emit('PRESSURE_RELIEVED', { reason: 'repair', amount: B.repairRelief });
    this.host.message(this.s.endless ? `组织修复 +${Math.round(amount)}。近距离修复可恢复耐久。`
      : `组织修复 +${Math.round(amount)}；感染负荷 -${B.repairRelief}。近距离修复可恢复耐久。`, 3);
  }

  /** Repair can also reveal and damage tissue mimics; it never damages normal tissue. */
  repairMimics(aim: Vec, damage: (target: Target, amount: number) => void): void {
    if (distance(aim, this.s.tissue) > this.s.tissue.radius + 12) return;
    for (const target of [...this.s.targets]) if (target.hp > 0 && target.traits?.includes('MIMIC') && distance(target, this.s.tissue) < 110) {
      target.revealedUntil = this.s.elapsed + B.scanReveal;
      damage(target, 35);
      this.host.emit('MIMIC_PURGED', { id: target.id, damage: 35 });
    }
  }

  interact(): void {
    const { s, b } = this;
    const interactables = b.graph.nodes.filter(n => ['valve', 'gate', 'retest'].includes(n.kind));
    const node = interactables.sort((a, c) => distance(s.player, a) - distance(s.player, c))[0];
    if (!node || distance(s.player, node) > BALANCE.interactionRange) {
      this.host.message('靠近阀门 E 冲流、隔离闸 E 截断传播，或左下复测台 E 检查目标。');
      this.host.emit('INTERACTION_REJECTED', { reason: 'distance' }); return;
    }
    if (node.kind === 'gate') {
      if (s.elapsed - b.gateChangedAt < 1) { this.host.message('隔离闸正在切换。', 1); return; }
      node.active = !node.active;
      node.infected = false;
      for (const edge of b.graph.edges.filter(e => e.from === node.id || e.to === node.id)) {
        edge.open = node.active; edge.nextSpread = s.elapsed + B.spreadInterval;
      }
      b.gateChangedAt = s.elapsed;
      this.host.emit('ROUTE_CHANGED', { nodeId: node.id, open: node.active, nextSpread: s.elapsed + B.spreadInterval });
      this.notice(node.active ? '隔离闸开启：传播路径恢复，6 秒后可再次传播。' : '隔离闸关闭：左侧血管停止传播；右侧仍需净化感染源。');
      return;
    }
    if (node.kind === 'valve') { this.pulse(); return; }
    if (!b.readyToRetest) {
      this.host.emit('INTERACTION_REJECTED', { reason: 'objectives' });
      this.host.message(`复测条件：源 ${b.stats.sourceClears}/2、精英 ${b.stats.eliteClears}/2、组织 ≥50%、感染 <35。${b.objective}`, 6); return;
    }
    this.host.effect('success', s.terminal, s.terminal, 180, 1.5);
    this.host.emit('RETEST_COMPLETED', { integrity: s.tissue.hp, infection: b.pressure.infection });
    this.host.finish(true, '心脏切片复测通过：感染源及两种变异精英清除，组织恢复稳定。');
  }

  pulse(): void {
    const { s, b } = this;
    if (s.elapsed < b.pulse.readyAt) { this.host.message(`冲流充能还需 ${Math.ceil(b.pulse.readyAt - s.elapsed)} 秒。`); return; }
    b.pulse.readyAt = s.elapsed + B.pulseCooldown;
    b.pulse.activeUntil = s.elapsed + .6;
    b.pulse.uses++; b.stats.pulses++;
    const before = s.tissue.hp;
    s.tissue.hp = Math.max(0, s.tissue.hp - B.pulseCost);
    this.host.emit('ORGAN_INTEGRITY_CHANGED', { organId: b.organId, before, after: s.tissue.hp, reason: 'pulse-pressure' });
    const p = b.pulse;
    const end = { x: p.origin.x + Math.cos(p.direction) * B.pulseRange, y: p.origin.y + Math.sin(p.direction) * B.pulseRange };
    this.host.effect('pulse', p.origin, end, B.pulseRange, .65);
    let pushed = 0; let exposed = 0; let coreHit = false;
    const advanced: GameEvent['data'][] = [];
    const exposedTargetIds: string[] = [];
    for (const target of s.targets) if (target.hp > 0 && target.role !== 'source') {
      const length = distance(p.origin, target);
      const direction = normalized(target.x - p.origin.x, target.y - p.origin.y);
      if (length > B.pulseRange + target.radius || (length > target.radius && direction.x * Math.cos(p.direction) + direction.y * Math.sin(p.direction) < Math.cos(B.pulseHalfAngle))) continue;
      const block = wallHit(p.origin, direction, length, activeWorld(s));
      if (block !== null && block < length - target.radius) continue;
      const push = target.role === 'core' ? 0 : B.pulsePush;
      const pos = moveWithCollision(target, { x: direction.x * push, y: direction.y * push }, target.radius, activeWorld(s));
      if (target.role === 'core') coreHit = true;
      if (target.role !== 'core' && distance(target, pos) > 1e-6) pushed++;
      target.x = pos.x; target.y = pos.y;
      const cycle = activeEliteTacticCycle(s, target);
      const interruptedTactic = target.attackPlan?.kind ?? (target.charge ? 'crystal-charge' : undefined);
      const recovery = target.attackPlan?.recoveryExposure ?? target.charge?.recoveryExposure ?? 0;
      const retainedRecovery = cycle ? target.recoverUntil : undefined;
      target.attackAt = undefined; target.attackAim = undefined;
      target.attackTarget = undefined;
      target.attackPlan = undefined; target.attackWindup = undefined; target.charge = undefined; target.recoverUntil = undefined;
      target.attackReady = s.elapsed + 1.3;
      if (cycle) {
        target.recoverUntil = Math.max(retainedRecovery ?? 0, interruptedTactic ? s.elapsed + Math.max(1.3, recovery) : 0) || undefined;
        if (target.recoverUntil) target.exposedUntil = Math.max(target.exposedUntil ?? 0, target.recoverUntil);
        target.attackReady = Math.max(target.attackReady, target.recoverUntil ?? 0);
        const completed = interruptedTactic && finishEliteTactic(s, target, interruptedTactic, 'pulse-interrupted');
        if (completed) advanced.push(completed);
      }
      if (target.traits?.includes('CARAPACE')) { target.exposedUntil = s.elapsed + B.pulseExpose; exposed++; exposedTargetIds.push(target.id); }
      target.revealedUntil = s.elapsed + B.scanReveal;
    }
    this.host.emit('PULSE_TRIGGERED', { organId: b.organId, direction: p.direction, range: B.pulseRange, halfAngle: B.pulseHalfAngle, pushed, exposed, exposedTargetIds: exposedTargetIds.join(','), coreHit, tissueCost: B.pulseCost });
    if (this.s !== s || s.phase !== 'playing') return;
    this.notice(`定向冲流：推开 ${pushed} 体，破壳 ${exposed} 体；组织承压 -${B.pulseCost}，冷却 ${B.pulseCooldown} 秒。`, 4);
    for (const completed of advanced) {
      this.host.emit('ELITE_TACTIC_ADVANCED', completed);
      if (this.s !== s || s.phase !== 'playing') return;
    }
  }

  afterInput(): void {
    const state = this.s;
    if (!this.s.endless) { this.evolution(); this.spread(); }
    this.enemies();
    if (this.s !== state || state.phase !== 'playing') return;
    if (!this.s.endless) { this.pressure(); this.objectives(); }
    // Dead sources remain as inert landmarks. Other corpses have a short bounded lifetime.
    this.s.targets = this.s.targets.filter(t => t.hp > 0 || t.role === 'source' || !!state.endless && t.splitAt !== undefined || this.s.elapsed - (t.deadAt ?? this.s.elapsed) < 1.5);
  }

  private aliveCount(): number { return this.s.targets.filter(t => t.hp > 0).length; }
  private spawn(position: Vec, role: 'virus' | 'elite', traits = this.b.traits, generation = 0, sourceId?: string, accepted?: () => void): Target | undefined {
    if (this.aliveCount() >= B.maxActors) return;
    const encounter = this.b.encounter, opening = role === 'virus' && encounter?.configId === 'campaign-1' && encounter.firstCounter.status !== 'resolved';
    if (opening && (this.s.targets.filter(target => target.hp > 0 && target.role === 'virus').length >= ENCOUNTER_CONFIGS['campaign-1'].openingOrdinaryCap
      || encounter.guideVariant === 'guided' && encounter.openingSpawned >= ENCOUNTER_CONFIGS['campaign-1'].openingSpawnBudget)) return;
    const child = generation > 0;
    const hp = child ? B.childHp : role === 'elite' ? B.eliteHp : B.ordinaryHp;
    const radius = child ? 14 : role === 'elite' ? 30 : 22;
    const pos = moveWithCollision({ x: position.x, y: position.y }, { x: 0, y: 0 }, radius, activeWorld(this.s));
    const target: Target = { ...pos, id: `${role}-${++this.b.nextActorId}`, role, kind: traits.includes('FISSION') ? 'cluster' : 'single', radius, hp, maxHp: hp, hitUntil: 0, scanned: false, traits: [...traits], facing: 0, born: this.s.elapsed, attackReady: this.s.elapsed + 1.5, generation, sourceId };
    this.s.targets.push(target);
    if (opening) encounter.openingSpawned++;
    accepted?.();
    this.host.emit('ACTOR_SPAWNED', { id: target.id, role, generation, sourceId: sourceId ?? '', traits: traits.join('+') });
    return target;
  }

  private evolution(): void {
    const { s, b } = this;
    const formal = b.encounter?.configId === 'campaign-1', first = b.encounter?.firstCounter;
    const firstReady = formal ? s.elapsed >= ENCOUNTER_CONFIGS['campaign-1'].firstWarningFallback || b.stats.sourceClears > 0 && b.stats.scans > 0 : s.elapsed >= b.nextEvolutionAt;
    const secondReady = formal ? first?.status === 'resolved' : s.elapsed >= b.nextEvolutionAt && b.stats.eliteClears >= 1;
    if (!b.warning && b.traits.length < 2 && (b.traits.length === 0 ? firstReady : secondReady)) {
      let trait = b.traits.length === 0 ? b.firstTrait : BRANCHES[(BRANCHES.indexOf(b.firstTrait) + 1 + (s.seed % 2)) % 3];
      if (b.milestone !== 'G1' && !(b.traits.length === 0 && (b.forcedFirstTrait || b.encounter?.guideVariant === 'guided'))) {
        const decision = chooseEvolution({ seed: s.seed, evolutionIndex: b.traits.length, tick: s.tick, organId: b.organId, integrity: s.tissue.hp, seen: b.traits, history: b.behaviorHistory ?? [], counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: true } });
        if (decision.kind !== 'warn') return;
        trait = decision.trait;
        b.evolutionDecisions?.push(decision);
        this.host.emit('EVOLUTION_ROLLED', { trait, roll: decision.roll, candidates: JSON.stringify(decision.candidates), summary: JSON.stringify(decision.summary) });
      } else if (b.forcedFirstTrait && b.traits.length === 0) trait = b.forcedFirstTrait;
      const warningDuration = formal ? ENCOUNTER_CONFIGS['campaign-1'].warningDuration : B.warningDuration;
      b.warning = { trait, startedAt: s.elapsed, applyAt: s.elapsed + warningDuration };
      if (b.traits.length === 0 && first) { first.status = 'warning'; first.warnedAt = s.elapsed; }
      this.host.emit('EVOLUTION_WARNING', { trait, duration: B.warningDuration, applyAt: b.warning.applyAt });
      this.notice(`变异预警 · ${TRAITS[trait].name}：${TRAITS[trait].ability}。代价：${TRAITS[trait].cost}。反制：${TRAITS[trait].counter}`, B.warningDuration, 2);
    }
    if (!b.warning || s.elapsed + 1e-9 < b.warning.applyAt) return;
    const trait = b.warning.trait;
    if (!b.traits.includes(trait)) {
      b.traits.push(trait);
      for (const target of s.targets) if (target.hp > 0 && target.role !== 'source') {
        target.traits = [trait];
        target.kind = trait === 'FISSION' ? 'cluster' : 'single';
      }
      // Reserve an elite slot by retiring one ordinary body if the population is full.
      if (!formal && this.aliveCount() >= B.maxActors) {
        const ordinary = s.targets.find(t => t.hp > 0 && t.role === 'virus');
        if (ordinary) { ordinary.hp = 0; ordinary.deadAt = s.elapsed; ordinary.attackAt = undefined; }
      }
      const elitePosition = formal && b.traits.length === 1 && b.encounter?.guideVariant === 'guided' ? ENCOUNTER_CONFIGS['campaign-1'].introGuardian : s.campaign ? getOrganDefinition(b.organId).elitePosition : { x: 785, y: 390 };
      const elite = this.spawn(elitePosition, 'elite', [trait]);
      if (b.traits.length === 1 && first && elite) { first.status = 'active'; first.appliedAt = s.elapsed; first.targetId = elite.id; }
      b.eliteSpawned++;
      this.host.effect('evolution', elitePosition, elitePosition, 110, 1.4);
      this.host.emit('EVOLUTION_APPLIED', { trait, warningDuration: s.elapsed - b.warning.startedAt, traits: b.traits.join('+') });
      this.notice(`${TRAITS[trait].symbol} ${TRAITS[trait].name}已出现。弱点：${TRAITS[trait].counter}`, 7, 2);
    }
    b.warning = null; b.nextEvolutionAt = s.elapsed + B.secondWarningDelay;
  }

  private spread(): void {
    const { s, b } = this;
    const infectedBefore = new Set(b.graph.nodes.filter(n => n.active && n.infected).map(n => n.id));
    for (const edge of b.graph.edges) {
      if (s.elapsed + 1e-9 < edge.nextSpread) continue;
      edge.nextSpread = s.elapsed + B.spreadInterval;
      if (!edge.open || !infectedBefore.has(edge.from)) continue;
      const node = b.graph.nodes.find(n => n.id === edge.to)!;
      if (!node.active || node.infected) continue;
      node.infected = true;
      this.host.emit('INFECTION_SPREAD', { organId: b.organId, edgeId: edge.id, from: edge.from, to: edge.to });
      const from = b.graph.nodes.find(n => n.id === edge.from)!;
      this.host.effect('flow', from, node, 12, 1.4);
    }
    for (const source of b.graph.nodes.filter(n => n.kind === 'source' && n.active)) {
      if (s.elapsed + 1e-9 < (b.nextSpawnAt[source.id] ?? Infinity)) continue;
      b.nextSpawnAt[source.id] = s.elapsed + B.spawnInterval;
      const edge = b.graph.edges.find(e => e.from === source.id);
      if (!edge?.open) continue;
      this.spawn(moveWithCollision(source, { x: -45, y: 45 }, 22, activeWorld(s)), 'virus', b.traits.length ? [b.traits.at(-1)!] : [], 0, source.id);
    }
    // Clearing both origins allows the remaining local tissue infection to recover.
    if (!b.graph.nodes.some(n => n.kind === 'source' && n.active) && !s.targets.some(t => t.hp > 0 && distance(t, s.tissue) < 120)) {
      for (const node of b.graph.nodes) if (node.kind !== 'source') node.infected = false;
    }
  }

  private canStrikeBody(origin: Vec, body: Vec & { radius: number }): boolean {
    const length = distance(origin, body);
    const block = wallHit(origin, normalized(body.x - origin.x, body.y - origin.y), length, activeWorld(this.s));
    return block === null || block >= length - body.radius;
  }

  private damagePlayer(target: Target, amount: number, reason: string, accepted?: () => void): boolean {
    const { s, b } = this;
    if (s.player.hp <= 0 || s.elapsed < s.player.dashUntil || amount <= 0) return false;
    const before = s.player.hp;
    s.player.hp = Math.max(0, before - amount); b.stats.playerDamage += before - s.player.hp;
    s.player.hurtUntil = s.elapsed + .5;
    accepted?.();
    this.host.effect('hit', s.player, s.player, 22, .3);
    this.host.emit('PLAYER_HURT', { damage: before - s.player.hp, remainingHp: s.player.hp, reason, actorId: target.id });
    return true;
  }

  private damageTissue(target: Target, amount: number, accepted?: () => void): boolean {
    const { s, b } = this;
    if (s.tissue.hp <= 0 || amount <= 0) return false;
    const before = s.tissue.hp;
    s.tissue.hp = Math.max(0, before - amount); b.stats.tissueDamage += before - s.tissue.hp;
    accepted?.();
    this.host.effect('hit', s.tissue, s.tissue, 45, .3);
    this.host.emit('ORGAN_INTEGRITY_CHANGED', { organId: b.organId, before, after: s.tissue.hp, reason: 'enemy-attack', actorId: target.id });
    return true;
  }

  private recoverEnemy(target: Target, exposure: number): void {
    target.attackAt = undefined; target.attackAim = undefined; target.attackTarget = undefined;
    target.attackPlan = undefined; target.attackWindup = undefined; target.charge = undefined;
    if (exposure > 0) {
      target.recoverUntil = this.s.elapsed + exposure;
      target.exposedUntil = Math.max(target.exposedUntil ?? 0, target.recoverUntil);
    } else target.recoverUntil = undefined;
  }

  private advanceCharge(target: Target): void {
    const { s } = this, charge = target.charge!;
    const from = { x: target.x, y: target.y }, remaining = distance(from, charge.to);
    const direction = normalized(charge.to.x - from.x, charge.to.y - from.y);
    const travel = Math.min(remaining, charge.speed * BALANCE.step);
    const to = moveWithCollision(from, { x: direction.x * travel, y: direction.y * travel }, target.radius, activeWorld(s));
    target.x = to.x; target.y = to.y;
    // Only the real travelled segment can hurt. The drawn promised lane never
    // deals damage ahead of the moving body, through a fold, or twice per rush.
    if (!charge.hitPlayer && segmentDistance(s.player, from, to) <= charge.radius + s.player.radius) {
      const gap = distance(to, s.player), block = wallHit(to, normalized(s.player.x - to.x, s.player.y - to.y), gap, activeWorld(s));
      if (block === null || block >= gap - s.player.radius) this.damagePlayer(target, charge.playerDamage, 'crystal-charge', () => { charge.hitPlayer = true; });
      if (this.s !== s || s.phase !== 'playing') return;
    }
    if (!charge.hitTissue && charge.tissueDamage > 0 && segmentDistance(s.tissue, from, to) <= charge.radius + s.tissue.radius) {
      const gap = distance(to, s.tissue), block = wallHit(to, normalized(s.tissue.x - to.x, s.tissue.y - to.y), gap, activeWorld(s));
      if (block === null || block >= gap - s.tissue.radius) this.damageTissue(target, charge.tissueDamage, () => { charge.hitTissue = true; });
      if (this.s !== s || s.phase !== 'playing') return;
    }
    if (remaining <= travel + .1 || s.elapsed + 1e-9 >= charge.endsAt || distance(from, to) < travel * .5) {
      const hitPlayer = charge.hitPlayer;
      this.recoverEnemy(target, charge.recoveryExposure); target.attackReady = s.elapsed + Math.max(charge.interval, charge.recoveryExposure);
      const completed = finishEliteTactic(s, target, 'crystal-charge', 'charge-ended');
      this.host.emit('ENEMY_CHARGE_ENDED', { actorId: target.id, hitPlayer, x: to.x, y: to.y, exposedSeconds: charge.recoveryExposure });
      if (this.s !== s || s.phase !== 'playing') return;
      if (completed) this.host.emit('ELITE_TACTIC_ADVANCED', completed);
    }
  }

  private resolveTactic(target: Target): void {
    const { s } = this, plan = target.attackPlan!;
    if (plan.kind === 'crystal-charge' && plan.chargeEnd && plan.chargeSpeed) {
      const length = distance(target, plan.chargeEnd);
      target.charge = { from: { x: target.x, y: target.y }, to: { ...plan.chargeEnd }, startedAt: s.elapsed,
        endsAt: s.elapsed + length / plan.chargeSpeed, speed: plan.chargeSpeed, radius: plan.radius, hitPlayer: false, hitTissue: false,
        playerDamage: plan.playerDamage, tissueDamage: plan.tissueDamage, recoveryExposure: plan.recoveryExposure, interval: plan.interval };
      target.attackAt = undefined; target.attackAim = undefined; target.attackTarget = undefined;
      target.attackPlan = undefined; target.attackWindup = undefined;
      this.host.emit('ENEMY_CHARGE_STARTED', { actorId: target.id, x: target.x, y: target.y, endX: plan.chargeEnd.x, endY: plan.chargeEnd.y, duration: length / plan.chargeSpeed });
      return;
    }
    const cycling = !!activeEliteTacticCycle(s, target);
    // Complete the accepted commitment before an HP receipt can synchronously pause/restart.
    this.recoverEnemy(target, plan.recoveryExposure);
    target.attackReady = s.elapsed + Math.max(plan.interval, plan.recoveryExposure);
    const completed = cycling ? finishEliteTactic(s, target, plan.kind, 'resolved') : undefined;
    const hitPlayer = plan.playerDamage > 0 && enemyAttackHits(plan, s.player, s.player.radius, activeWorld(s))
      && this.damagePlayer(target, plan.playerDamage, plan.kind);
    if (this.s !== s || s.phase !== 'playing') return;
    const hitTissue = plan.tissueDamage > 0 && enemyAttackHits(plan, s.tissue, s.tissue.radius, activeWorld(s))
      && this.damageTissue(target, plan.tissueDamage);
    if (this.s !== s || s.phase !== 'playing') return;
    for (const center of plan.landings) this.host.effect('burst', center, center, plan.radius, .32);
    if (plan.kind === 'thin-ray') this.host.effect('beam', plan.origin, enemyRayEnd(plan, activeWorld(s)), 0, .2);
    this.host.emit('ENEMY_TACTIC_RESOLVED', { actorId: target.id, tactic: plan.kind, hitPlayer, hitTissue });
    if (this.s !== s || s.phase !== 'playing') return;
    if (completed) {
      this.host.emit('ELITE_TACTIC_ADVANCED', completed);
      return;
    }
  }

  private enemies(): void {
    const { s } = this;
    this.navigator.prune(s.targets);
    for (const target of s.targets) if (target.recoverUntil !== undefined && target.recoverUntil <= s.elapsed) target.recoverUntil = undefined;
    const wave = s.endless?.wave ?? 1;
    const pace = s.endless ? endlessPacing(wave) : undefined;
    const speed = (target: Target) => B.enemySpeed * (pace?.speedMultiplier ?? 1) * (target.traits?.includes('CARAPACE') ? B.carapaceSpeed : 1)
      * (target.traits?.includes('MIMIC') ? B.mimicSpeed : 1) * (this.host.slowFactor?.(target.id) ?? 1);
    const spacing = planEnemySpacing(s.targets, activeWorld(s), {
      maxStep: target => speed(target) * BALANCE.step * ENEMY_CROWD.separationSpeedFactor,
      isMigrating: target => !!this.host.isMigratingActor?.(target.id),
    });
    for (const target of s.targets) {
      const point = spacing.get(target.id);
      if (point) { target.x = point.x; target.y = point.y; }
    }
    for (const target of s.targets) {
      if (this.s !== s || s.phase !== 'playing') return;
      if (s.endless && (s.player.hp <= 0 || s.tissue.hp <= 0)) break;
      if (target.hp <= 0) {
        if (target.splitAt !== undefined && s.elapsed + 1e-9 >= target.splitAt) {
          while (target.splitPositions?.length) {
            const pos = target.splitPositions[0];
            const child = this.spawn(pos, 'virus', target.traits, 1, target.sourceId, () => {
              target.splitPositions!.shift();
              this.fissionBirths.set(target, (this.fissionBirths.get(target) ?? 0) + 1);
            });
            if (!child) break;
            if (this.s !== s || s.phase !== 'playing') return;
          }
          if (target.splitPositions?.length) continue;
          const children = this.fissionBirths.get(target) ?? 0;
          this.fissionBirths.delete(target);
          target.splitAt = undefined; target.splitPositions = undefined;
          this.host.emit('FISSION_SPAWNED', { parentId: target.id, children, generation: 1 });
        }
        continue;
      }
      if (target.role === 'source' || target.role === 'core' || this.host.isMigratingActor?.(target.id)) continue;
      if (target.charge) { this.advanceCharge(target); continue; }
      if (target.recoverUntil !== undefined) continue;
      prepareEliteTactic(s, target);
      const mimic = target.tactic === 'mimic-corrosion' || (!target.tactic || target.tactic === 'melee') && target.traits?.includes('MIMIC');
      const goal = mimic || !s.endless && distance(target, s.player) > 270 ? s.tissue : s.player;
      const dir = normalized(goal.x - target.x, goal.y - target.y);
      if (target.attackPlan && target.attackAt !== undefined) {
        if (s.elapsed + 1e-9 >= target.attackAt) this.resolveTactic(target);
        continue;
      }
      // A posture spends the same one-tick movement budget as pursuit. Compute
      // the warning after movement, then leave its real origin frozen.
      const postureMotion = standoffMotion(target, s.player, activeWorld(s));
      let postureMoved = false;
      if (postureMotion && !spacing.has(target.id) && (postureMotion.x || postureMotion.y)) {
        const slow = this.host.slowFactor?.(target.id) ?? 1;
        const next = moveEnemyThroughCrowd(target, { x: postureMotion.x * slow, y: postureMotion.y * slow }, s.targets, activeWorld(s));
        target.x = next.x; target.y = next.y; postureMoved = true;
      }
      updateEnemyFacing(target, Math.atan2(goal.y - target.y, goal.x - target.x), BALANCE.step);
      const special = !!s.endless && !!target.tactic && target.tactic !== 'melee';
      const plan = special ? enemyAttackPlan(target, s) : undefined;
      if (special && plan) {
        const sameHeavyTactic = plan.kind !== 'thin-ray' && s.targets.some(actor => actor.hp > 0 && actor.id !== target.id
          && (actor.attackPlan?.kind === plan.kind && actor.attackAt !== undefined || plan.kind === 'crystal-charge' && !!actor.charge));
        // A mixed cohort may combine known threats, but it must not stack two
        // copies of the same heavy footprint/channel before one has resolved.
        if (s.elapsed >= (target.attackReady ?? 0) && !sameHeavyTactic
          && s.targets.filter(actor => actor.hp > 0 && (actor.attackAt !== undefined || actor.charge !== undefined)).length < 3) {
          target.attackPlan = plan; target.attackAt = s.elapsed + plan.windup;
          target.attackWindup = plan.windup; target.attackAim = { ...plan.aim }; target.attackRadius = plan.radius;
          target.attackTarget = plan.kind === 'mimic-corrosion' ? 'tissue' : 'player';
          const committed = commitEliteTactic(s, target);
          this.host.emit('ATTACK_TELEGRAPHED', { actorId: target.id, target: target.attackTarget, tactic: plan.kind, resolveAt: target.attackAt });
          if (this.s !== s || s.phase !== 'playing') return;
          this.host.emit('ENEMY_TACTIC_COMMITTED', { actorId: target.id, tactic: plan.kind, windup: plan.windup, x: plan.origin.x, y: plan.origin.y, aimX: plan.aim.x, aimY: plan.aim.y });
          if (this.s !== s || s.phase !== 'playing') return;
          if (committed) {
            this.host.emit('ELITE_TACTIC_COMMITTED', committed);
            if (this.s !== s || s.phase !== 'playing') return;
          }
        }
        continue;
      }
      if (target.attackAt !== undefined) {
        if (s.elapsed + 1e-9 < target.attackAt) continue;
        const aim = target.attackAim!;
        const radius = target.attackRadius ?? B.attackRadius;
        const attackingTissue = target.attackTarget === 'tissue';
        if (attackingTissue) {
          if (distance(target, s.tissue) <= B.attackRadius + s.tissue.radius && this.canStrikeBody(target, s.tissue)) {
            this.damageTissue(target, B.tissueDamage + (s.endless ? Math.floor((wave - 1) / 8) : 0));
          }
        } else if (distance(s.player, aim) <= radius + s.player.radius && this.canStrikeBody(target, s.player)) {
          // The frozen warning remains valid, but a legal move behind a fold
          // must block the strike at resolution just as it blocks ranged tools.
          this.damagePlayer(target, B.playerDamage + (s.endless ? Math.floor((wave - 1) / 4) + (target.role === 'elite' ? 5 : 0) : 0), 'enemy-attack');
        }
        target.attackAt = undefined; target.attackAim = undefined; target.attackTarget = undefined;
        target.attackReady = s.elapsed + (s.endless ? Math.max(1.1, B.attackInterval - (wave - 1) * .025) : B.attackInterval);
      }
      const eliteBlast = !!s.endless && target.role === 'elite' && goal === s.player;
      const reach = eliteBlast ? 250 : B.attackRadius + (goal === s.tissue ? s.tissue.radius : s.player.radius) - 8;
      const block = wallHit(target, dir, distance(target, goal), activeWorld(s));
      const lineClear = block === null || block >= distance(target, goal) - 20;
      if (special || distance(target, goal) > reach || !lineClear) {
        // Relaxation already used this body's movement budget. Do not cancel
        // it with an immediate pursuit step back into the same exact stack.
        if (spacing.has(target.id) || postureMoved) continue;
        const movementSpeed = speed(target);
        const next = this.navigator.waypoint(target, goal, activeWorld(s), s.elapsed);
        const motion = normalized(next.x - target.x, next.y - target.y);
        const step = { x: motion.x * movementSpeed * BALANCE.step, y: motion.y * movementSpeed * BALANCE.step };
        let pos = moveEnemyThroughCrowd(target, step, s.targets, activeWorld(s));
        // If a fold blocks the direct route, follow its tangent until the goal is clear.
        if (distance(target, pos) < movementSpeed * BALANCE.step * .4) {
          const side = target.id.length % 2 ? 1 : -1;
          pos = moveEnemyThroughCrowd(target, { x: -motion.y * movementSpeed * BALANCE.step * side, y: motion.x * movementSpeed * BALANCE.step * side }, s.targets, activeWorld(s));
        }
        target.x = pos.x; target.y = pos.y;
      } else if (s.elapsed >= (target.attackReady ?? 0)) {
        // Reserve a slot before committing a new aim. Accepted telegraphs are
        // never retargeted or cancelled to make room for another attacker.
        if (s.endless && s.targets.filter(actor => actor.hp > 0 && (actor.attackAt !== undefined || actor.charge !== undefined)).length >= 3) continue;
        const line = normalized(goal.x - target.x, goal.y - target.y);
        const block = wallHit(target, line, distance(target, goal), activeWorld(s));
        if (block !== null && block < distance(target, goal) - 20) continue;
        target.attackAt = s.elapsed + (eliteBlast ? 1.1 : B.attackWindup);
        target.attackWindup = eliteBlast ? 1.1 : B.attackWindup;
        if (s.endless) target.attackRadius = eliteBlast ? 105 : B.attackRadius;
        target.attackAim = { x: goal.x, y: goal.y };
        target.attackTarget = goal === s.tissue ? 'tissue' : 'player';
        this.host.effect('danger', target, target.attackAim, target.attackRadius ?? B.attackRadius, eliteBlast ? 1.1 : B.attackWindup);
        this.host.emit('ATTACK_TELEGRAPHED', { actorId: target.id, target: goal === s.tissue ? 'tissue' : 'player', resolveAt: target.attackAt });
      }
    }
  }

  private pressure(): void {
    const { s, b } = this;
    const p = b.pressure;
    // Zero is terminal. Never let a subsequent regeneration tick resurrect a
    // depleted vitality value before its independent failure check is observed.
    if (s.player.hp <= 0) { this.host.finish(false, '救援体耐久耗尽：避开带齿轮廓的攻击预警，利用冲刺脱离。'); return; }
    if (p.vitality <= 0) { this.host.finish(false, '身体崩溃：器官低完整度持续损伤全身稳定。'); return; }
    const sources = b.graph.nodes.filter(n => n.kind === 'source' && n.active).length;
    const openSources = b.graph.nodes.filter(n => n.kind === 'source' && n.active && b.graph.edges.some(e => e.from === n.id && e.open)).length;
    const tissueInfected = b.graph.nodes.find(n => n.id === 'tissue')!.infected;
    const growth = sources ? openSources * .14 + this.aliveCount() * .014 + (tissueInfected ? .12 : 0) : -.65;
    p.infection = clamp(p.infection + growth * BALANCE.step, 0, 100);
    // Batch the slow tissue erosion once per simulation second, so the same
    // actual loss drives HUD, protection rewards and bounded diagnostic logs.
    if (tissueInfected && s.tick % 60 === 0) {
      const before = s.tissue.hp;
      s.tissue.hp = Math.max(0, before - B.tissueInfectionDamage);
      if (s.tissue.hp < before) this.host.emit('ORGAN_INTEGRITY_CHANGED', { organId: b.organId, before, after: s.tissue.hp, reason: 'infection' });
    }
    if (!s.campaign) {
    p.organAlarm = s.tissue.hp < B.organAlarmAt;
    if (p.organAlarm) {
      if (b.organLowSince === null) {
        b.organLowSince = s.elapsed;
        this.notice('器官警报：完整度低于 30%。8 秒后开始影响全身稳定，请用 3 抢修！', 8, 3);
        this.host.emit('ORGAN_ALARM', { organId: b.organId, integrity: s.tissue.hp, graceSeconds: B.organCollapseDelay });
      }
      if (s.elapsed - b.organLowSince >= B.organCollapseDelay) p.vitality = Math.max(0, p.vitality - (s.tissue.hp <= 0 ? 1.5 : .5) * BALANCE.step);
    } else {
      if (b.organLowSince !== null) {
        this.host.emit('ORGAN_ALARM_CLEARED', { organId: b.organId });
        this.notice('器官警报解除；完整度达到 50% 后，全身稳定才会缓慢恢复。', 5, 3);
      }
      b.organLowSince = null;
      if (s.tissue.hp >= 50) p.vitality = Math.min(100, p.vitality + .25 * BALANCE.step);
    }
    }
    if (p.infection >= 100) {
      if (p.criticalSince === null) {
        p.criticalSince = s.elapsed; p.crisisReason = '感染失控';
        this.host.emit('INFECTION_CRISIS_STARTED', { deadline: s.elapsed + B.crisisDuration });
        this.notice('感染负荷 100！15 秒内净化感染源/感染体或抢修，降低感染即可解除危机。', B.crisisDuration, 3);
      }
      if (s.elapsed - p.criticalSince + 1e-9 >= B.crisisDuration) this.host.finish(false, '感染失控：负荷 100 持续 15 秒。');
    } else if (p.criticalSince !== null) {
      p.criticalSince = null; p.crisisReason = '';
      this.host.emit('INFECTION_CRISIS_RECOVERED', { infection: p.infection });
      this.notice('感染负荷下降，致命倒计时解除。继续净化并修复组织。', 5, 3);
    }
    if (s.player.hp <= 0) this.host.finish(false, '救援体耐久耗尽：避开带齿轮廓的攻击预警，利用冲刺脱离。');
    else if (p.vitality <= 0) this.host.finish(false, '身体崩溃：器官低完整度持续损伤全身稳定。');
  }

  private objectives(): void {
    const { s, b } = this;
    if (s.campaign) return;
    b.readyToRetest = b.stats.sourceClears >= 2 && b.stats.eliteClears >= 2 && s.tissue.hp >= 50 && b.pressure.infection < 35;
    b.stage = b.readyToRetest ? 3 : b.traits.length ? b.traits.length : 0;
    b.stageLabel = b.readyToRetest ? 'Ⅳ · 心脏复测' : b.traits.length === 2 ? 'Ⅲ · 二次变异' : b.traits.length === 1 ? 'Ⅱ · 变异应对' : 'Ⅰ · 初始感染';
    b.objective = b.readyToRetest ? '返回左下复测台，按 E 完成心脏切片。' : b.stats.sourceClears < 2 ? `净化感染源 ${b.stats.sourceClears}/2；变异精英 ${b.stats.eliteClears}/2；保护组织 ≥50%。` : b.stats.eliteClears < 2 ? `变异精英 ${b.stats.eliteClears}/2；预警时先读弱点，靠近阀门 E 冲流。` : s.tissue.hp < 50 ? '3 修复十字组织至 ≥50%，再返回复测台。' : '净化剩余感染体，使负荷降至 <35，再返回复测台。';
  }
}

export function mimicDisturbed(target: Target, elapsed: number): boolean {
  return (target.revealedUntil ?? 0) > elapsed || (elapsed - (target.born ?? 0)) % B.mimicPeriod < B.mimicDisturbance;
}
