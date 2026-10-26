import { clamp, distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type InputFrame, type MessagePriority, type Target, type Vec } from './types';
import type { BattleState, CampaignOptions, TraitId } from './battleTypes';
import { BATTLE_BALANCE as B, TRAITS } from './battleConfig';
import { recordBehavior, chooseEvolution } from './evolution';

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
  const firstTrait = options.firstTrait ?? BRANCHES[rng.int(0, 2)];
  state.tissue.hp = 62;
  state.targets = [];
  const nodes: BattleState['graph']['nodes'] = [
    { id: 'source-a', kind: 'source', x: 610, y: 330, active: true, infected: true },
    { id: 'source-b', kind: 'source', x: 920, y: 435, active: true, infected: true },
    { id: 'gate', kind: 'gate', x: 335, y: 230, active: true, infected: false },
    { id: 'valve', kind: 'valve', x: 730, y: 230, active: true, infected: false },
    { id: 'tissue', kind: 'tissue', x: state.tissue.x, y: state.tissue.y, active: true, infected: false },
    { id: 'retest', kind: 'retest', ...state.terminal, active: true, infected: false },
  ];
  if (options.milestone && options.milestone !== 'G1') nodes.push({ id: 'research', kind: 'research', x: 475, y: 610, active: true, infected: false });
  const edges = [['source-a', 'gate'], ['gate', 'tissue'], ['source-b', 'valve'], ['valve', 'tissue']].map(([from, to]) => {
    const a = nodes.find(node => node.id === from)!;
    const b = nodes.find(node => node.id === to)!;
    return { id: `${from}:${to}`, from, to, open: true, nextSpread: B.spreadInterval, flowDirection: normalized(b.x - a.x, b.y - a.y) };
  });
  state.battle = {
    milestone: options.milestone ?? 'G1', organId: 'heart', graph: { nodes, edges },
    pressure: { infection: 26, vitality: 100, criticalSince: null, organAlarm: false, crisisReason: '' },
    pulse: { phase: 'charge', phaseRemaining: 2, readyAt: 0, activeUntil: 0, origin: { x: 730, y: 230 }, direction: Math.PI / 2, uses: 0 },
    warning: null, traits: [], defeatedTraits: [], nextEvolutionAt: B.firstWarningAt,
    stage: 0, stageLabel: 'Ⅰ · 初始感染', objective: 'Q 诊断感染源；清除两处感染源并保护十字组织。', readyToRetest: false,
    lastAim: { x: 610, y: 330 }, stats: { kills: 0, sourceClears: 0, eliteClears: 0, repairs: 0, pulses: 0, playerDamage: 0, tissueDamage: 0, scans: 0 },
    nextSpawnAt: { 'source-a': B.spawnInterval, 'source-b': B.spawnInterval + 2 }, nextActorId: 0,
    firstTrait, recentNotice: '', gateChangedAt: -10, organLowSince: null, eliteSpawned: 0, history: [],
    ...(options.milestone && options.milestone !== 'G1' ? { forcedFirstTrait: options.firstTrait, behaviorHistory: [], evolutionDecisions: [] } : {}),
  };
  for (const node of nodes.filter(n => n.kind === 'source')) {
    state.targets.push({ ...node, id: node.id, kind: 'single', role: 'source', hp: B.sourceHp, maxHp: B.sourceHp, radius: 34, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0 });
  }
  for (let i = 0; i < 4; i++) {
    const source = i < 2 ? nodes[0] : nodes[1];
    const position = moveWithCollision(source, { x: rng.int(-80, 80), y: rng.int(-65, 65) }, 22);
    state.targets.push({ ...position, id: `virus-${++state.battle.nextActorId}`, kind: 'single', role: 'virus', radius: 22, hp: B.ordinaryHp, maxHp: B.ordinaryHp, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 1 + i * .3, generation: 0, sourceId: source.id });
  }
  state.message = '感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。';
  state.messageUntil = 10;
}

/** G1 rules attach to the shared session; tools/movement/time stay in GameSession. */
export class BattleDirector {
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
    let count = 0;
    for (const target of this.s.targets) if (target.hp > 0 && distance(this.s.player, target) <= BALANCE.scanRadius) {
      target.revealedUntil = this.s.elapsed + B.scanReveal;
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
    target.revealedUntil = 0;
    target.exposedUntil = 0;
    if (target.role === 'source') {
      const node = b.graph.nodes.find(n => n.id === target.id)!;
      node.active = false; node.infected = false;
      b.stats.sourceClears++;
      b.pressure.infection = Math.max(0, b.pressure.infection - B.sourceRelief);
      this.host.emit('INFECTION_SOURCE_CLEARED', { organId: b.organId, nodeId: target.id, actor: 'player' });
      this.notice(`感染源已净化${s.campaign ? `（本局累计 ${b.stats.sourceClears}）` : `（${b.stats.sourceClears}/2）`}，停止增殖，感染负荷 -${B.sourceRelief}。`);
    } else {
      b.stats.kills++;
      b.pressure.infection = Math.max(0, b.pressure.infection - B.killRelief);
      if (target.role === 'elite') {
        b.stats.eliteClears++;
        for (const trait of target.traits ?? []) if (!b.defeatedTraits.includes(trait)) b.defeatedTraits.push(trait);
        this.host.emit('ELITE_CLEARED', { id: target.id, organId: b.organId, trait: target.traits?.join('+') ?? '' });
        this.notice(`变异精英已清除（${b.stats.eliteClears}/2）。保持组织，继续诊断。`);
      }
      if (target.role !== 'core' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0) {
        target.splitAt = s.elapsed + B.fissionDelay;
        target.splitPositions = [-1, 1].map(offset => moveWithCollision({ x: target.x, y: target.y }, { x: offset * 27, y: 10 }, 14, activeWorld(s)));
        this.host.emit('FISSION_WARNING', { parentId: target.id, children: 2, applyAt: target.splitAt });
      }
    }
  }

  repaired(amount: number): void {
    if (amount <= 0) return;
    this.b.stats.repairs++;
    this.b.pressure.infection = Math.max(0, this.b.pressure.infection - B.repairRelief);
    if (distance(this.s.player, this.s.tissue) < 200) this.s.player.hp = Math.min(100, this.s.player.hp + 4);
    this.host.emit('PRESSURE_RELIEVED', { reason: 'repair', amount: B.repairRelief });
    this.host.message(`组织修复 +${Math.round(amount)}；感染负荷 -${B.repairRelief}。近距离修复可恢复耐久。`, 3);
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
    for (const target of s.targets) if (target.hp > 0 && target.role !== 'source') {
      const length = distance(p.origin, target);
      const direction = normalized(target.x - p.origin.x, target.y - p.origin.y);
      if (length > B.pulseRange + target.radius || (length > target.radius && direction.x * Math.cos(p.direction) + direction.y * Math.sin(p.direction) < Math.cos(B.pulseHalfAngle))) continue;
      const block = wallHit(p.origin, direction, length, activeWorld(s));
      if (block !== null && block < length - target.radius) continue;
      const push = target.role === 'core' ? 0 : B.pulsePush;
      const pos = moveWithCollision(target, { x: direction.x * push, y: direction.y * push }, target.radius, activeWorld(s));
      if (target.role === 'core') coreHit = true;
      target.x = pos.x; target.y = pos.y;
      target.attackAt = undefined; target.attackAim = undefined;
      target.attackTarget = undefined;
      target.attackReady = s.elapsed + 1.3;
      if (target.traits?.includes('CARAPACE')) { target.exposedUntil = s.elapsed + B.pulseExpose; exposed++; }
      target.revealedUntil = s.elapsed + B.scanReveal;
      if (target.role !== 'core') pushed++;
    }
    this.host.emit('PULSE_TRIGGERED', { organId: b.organId, direction: p.direction, range: B.pulseRange, halfAngle: B.pulseHalfAngle, pushed, exposed, coreHit, tissueCost: B.pulseCost });
    this.notice(`定向冲流：推开 ${pushed} 体，破壳 ${exposed} 体；组织承压 -${B.pulseCost}，冷却 ${B.pulseCooldown} 秒。`, 4);
  }

  afterInput(): void {
    this.evolution();
    this.spread();
    this.enemies();
    this.pressure();
    this.objectives();
    // Dead sources remain as inert landmarks. Other corpses have a short bounded lifetime.
    this.s.targets = this.s.targets.filter(t => t.hp > 0 || t.role === 'source' || this.s.elapsed - (t.deadAt ?? this.s.elapsed) < 1.5);
  }

  private aliveCount(): number { return this.s.targets.filter(t => t.hp > 0).length; }
  private spawn(position: Vec, role: 'virus' | 'elite', traits = this.b.traits, generation = 0, sourceId?: string): Target | undefined {
    if (this.aliveCount() >= B.maxActors) return;
    const child = generation > 0;
    const hp = child ? B.childHp : role === 'elite' ? B.eliteHp : B.ordinaryHp;
    const radius = child ? 14 : role === 'elite' ? 30 : 22;
    const pos = moveWithCollision({ x: position.x, y: position.y }, { x: 0, y: 0 }, radius, activeWorld(this.s));
    const target: Target = { ...pos, id: `${role}-${++this.b.nextActorId}`, role, kind: traits.includes('FISSION') ? 'cluster' : 'single', radius, hp, maxHp: hp, hitUntil: 0, scanned: false, traits: [...traits], facing: 0, born: this.s.elapsed, attackReady: this.s.elapsed + 1.5, generation, sourceId };
    this.s.targets.push(target);
    this.host.emit('ACTOR_SPAWNED', { id: target.id, role, generation, sourceId: sourceId ?? '', traits: traits.join('+') });
    return target;
  }

  private evolution(): void {
    const { s, b } = this;
    if (!b.warning && b.traits.length < 2 && s.elapsed >= b.nextEvolutionAt && (b.traits.length === 0 || b.stats.eliteClears >= 1)) {
      let trait = b.traits.length === 0 ? b.firstTrait : BRANCHES[(BRANCHES.indexOf(b.firstTrait) + 1 + (s.seed % 2)) % 3];
      if (b.milestone !== 'G1' && !(b.traits.length === 0 && b.forcedFirstTrait)) {
        const decision = chooseEvolution({ seed: s.seed, evolutionIndex: b.traits.length, tick: s.tick, organId: b.organId, integrity: s.tissue.hp, seen: b.traits, history: b.behaviorHistory ?? [], counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: true } });
        if (decision.kind !== 'warn') return;
        trait = decision.trait;
        b.evolutionDecisions?.push(decision);
        this.host.emit('EVOLUTION_ROLLED', { trait, roll: decision.roll, candidates: JSON.stringify(decision.candidates), summary: JSON.stringify(decision.summary) });
      } else if (b.forcedFirstTrait && b.traits.length === 0) trait = b.forcedFirstTrait;
      b.warning = { trait, startedAt: s.elapsed, applyAt: s.elapsed + B.warningDuration };
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
      if (this.aliveCount() >= B.maxActors) {
        const ordinary = s.targets.find(t => t.hp > 0 && t.role === 'virus');
        if (ordinary) { ordinary.hp = 0; ordinary.deadAt = s.elapsed; ordinary.attackAt = undefined; }
      }
      this.spawn({ x: 785, y: 390 }, 'elite', [trait]);
      b.eliteSpawned++;
      this.host.effect('evolution', { x: 785, y: 390 }, { x: 785, y: 390 }, 110, 1.4);
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

  private enemies(): void {
    const { s, b } = this;
    for (const target of s.targets) {
      if (target.hp <= 0) {
        if (target.splitAt !== undefined && s.elapsed + 1e-9 >= target.splitAt) {
          let children = 0;
          for (const pos of target.splitPositions ?? []) if (this.spawn(pos, 'virus', target.traits, 1, target.sourceId)) children++;
          this.host.emit('FISSION_SPAWNED', { parentId: target.id, children, generation: 1 });
          target.splitAt = undefined; target.splitPositions = undefined;
        }
        continue;
      }
      if (target.role === 'source' || target.role === 'core' || this.host.isMigratingActor?.(target.id)) continue;
      const mimic = target.traits?.includes('MIMIC');
      const goal = mimic || distance(target, s.player) > 270 ? s.tissue : s.player;
      const dir = normalized(goal.x - target.x, goal.y - target.y);
      if (target.attackAt !== undefined) {
        if (s.elapsed + 1e-9 < target.attackAt) continue;
        const aim = target.attackAim!;
        const attackingTissue = target.attackTarget === 'tissue';
        if (attackingTissue) {
          if (distance(target, s.tissue) <= B.attackRadius + s.tissue.radius) {
            const before = s.tissue.hp;
            s.tissue.hp = Math.max(0, before - B.tissueDamage);
            b.stats.tissueDamage += before - s.tissue.hp;
            this.host.emit('ORGAN_INTEGRITY_CHANGED', { organId: b.organId, before, after: s.tissue.hp, reason: 'enemy-attack', actorId: target.id });
            this.host.effect('hit', s.tissue, s.tissue, 45, .3);
          }
        } else if (distance(s.player, aim) <= B.attackRadius + s.player.radius && s.elapsed >= s.player.dashUntil) {
          const before = s.player.hp;
          s.player.hp = Math.max(0, before - B.playerDamage);
          b.stats.playerDamage += before - s.player.hp;
          s.player.hurtUntil = s.elapsed + .5;
          this.host.emit('PLAYER_HURT', { damage: before - s.player.hp, remainingHp: s.player.hp, reason: 'enemy-attack', actorId: target.id });
          this.host.effect('hit', s.player, s.player, 22, .3);
        }
        target.attackAt = undefined; target.attackAim = undefined; target.attackTarget = undefined; target.attackReady = s.elapsed + B.attackInterval;
      }
      target.facing = Math.atan2(dir.y, dir.x);
      const reach = B.attackRadius + (goal === s.tissue ? s.tissue.radius : s.player.radius) - 8;
      if (distance(target, goal) > reach) {
        let speed: number = B.enemySpeed;
        if (target.traits?.includes('CARAPACE')) speed *= B.carapaceSpeed;
        if (mimic) speed *= B.mimicSpeed;
        speed *= this.host.slowFactor?.(target.id) ?? 1;
        const step = { x: dir.x * speed * BALANCE.step, y: dir.y * speed * BALANCE.step };
        let pos = moveWithCollision(target, step, target.radius, activeWorld(s));
        // If a fold blocks the direct route, follow its tangent until the goal is clear.
        if (distance(target, pos) < speed * BALANCE.step * .4) {
          const side = target.id.length % 2 ? 1 : -1;
          pos = moveWithCollision(target, { x: -dir.y * speed * BALANCE.step * side, y: dir.x * speed * BALANCE.step * side }, target.radius, activeWorld(s));
        }
        target.x = pos.x; target.y = pos.y;
      } else if (s.elapsed >= (target.attackReady ?? 0)) {
        const line = normalized(goal.x - target.x, goal.y - target.y);
        const block = wallHit(target, line, distance(target, goal), activeWorld(s));
        if (block !== null && block < distance(target, goal) - 20) continue;
        target.attackAt = s.elapsed + B.attackWindup;
        target.attackAim = { x: goal.x, y: goal.y };
        target.attackTarget = goal === s.tissue ? 'tissue' : 'player';
        this.host.effect('danger', target, target.attackAim, B.attackRadius, B.attackWindup);
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
        this.notice('组织抢修成功：器官警报解除，全身稳定缓慢恢复。', 5, 3);
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
