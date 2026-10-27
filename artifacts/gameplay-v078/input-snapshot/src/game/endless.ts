import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { BATTLE_BALANCE, TRAITS } from './battleConfig';
import type { TraitId } from './battleTypes';
import type { EndlessBatch, EndlessFormation, EndlessGameState, EndlessHost, EndlessSpawnRole, EndlessState } from './endlessTypes';
import type { EnemyTactic } from './enemyTacticsTypes';
import { activeWorld, type GameEvent, type GameState, type Target, type Vec } from './types';
export type { EndlessHost, EndlessState } from './endlessTypes';

export const ENDLESS_BALANCE = {
  warningSeconds: 2, traitWarningSeconds: 8, intermissionSeconds: 1,
  batchSize: 3, batchInterval: 2, minimumBatchInterval: 1.2,
  minimumSpawnDistance: 340, spawnRingInner: 420, spawnRingOuter: 600,
  spawnGrace: 1.5, maximumActors: BATTLE_BALANCE.maxActors,
  maximumWaveBudget: 28, maximumFissionParents: 4,
  comboSeconds: 3, maximumComboMultiplier: 4,
} as const;

const TRAIT_ORDER: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const DIRECTIONS = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
const APPROACH_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
const FORMATIONS: readonly EndlessFormation[] = ['front', 'cross', 'fission-pack', 'mixed'];
const FORMATION_LABELS: Record<EndlessFormation, string> = { front: '正面双潮', cross: '交叉夹击', 'fission-pack': '聚群猎场', mixed: '侧翼点射' };
const sourceId = (wave: number) => `endless:wave:${wave}`;
const safeAdd = (value: number, amount: number) => Math.min(Number.MAX_SAFE_INTEGER, value + amount);

function wavePlan(seed: number, wave: number): Pick<EndlessState, 'traits' | 'title' | 'eliteWave' | 'eliteRemaining' | 'warningSeconds' | 'totalToSpawn' | 'formation' | 'formationLabel' | 'batchSchedule' | 'supportRemaining'> {
  const eliteWave = wave % 5 === 0;
  const generation = Math.floor(wave / 5);
  const offset = new SeedRng((seed ^ 0x454e444c) >>> 0).int(0, 2);
  const traits: TraitId[] = generation === 0 ? [] : [TRAIT_ORDER[(offset + generation - 1) % 3]];
  if (generation >= 3) traits.push(TRAIT_ORDER[(offset + generation - 2) % 3]);
  const formation = traits[0] === 'FISSION' && wave % 2 === 1 ? 'fission-pack' : FORMATIONS[(wave - 1) % FORMATIONS.length];
  const formationLabel = FORMATION_LABELS[formation];
  const title = eliteWave ? `精英围猎 · ${TRAITS[traits[0]].name}` : traits.length ? `${TRAITS[traits[0]].name} · ${formationLabel}` : formationLabel;
  const eliteRemaining = eliteWave ? Math.min(2, 1 + Math.floor((wave - 5) / 25)) : 0;
  const totalToSpawn = Math.min(ENDLESS_BALANCE.maximumWaveBudget, 6 + wave * 2);
  const supportRemaining = wave < 3 ? 0 : wave < 6 ? 1 : 2;
  const roles: EndlessSpawnRole[] = Array.from({ length: totalToSpawn }, () => 'ordinary');
  for (let elite = 0; elite < eliteRemaining; elite++) roles[elite * 3] = 'elite';
  for (let support = 0; support < supportRemaining; support++) roles[support * 3 + 2] = 'support';
  const rotation = new SeedRng((seed ^ Math.imul(wave, 0x45d9f3b)) >>> 0).int(0, 7);
  const pairInterval = Math.max(2.6, 4.2 - (wave - 1) * .035);
  const batchSchedule: EndlessBatch[] = [];
  for (let batch = 0; batch * 3 < totalToSpawn; batch++) {
    const pair = Math.floor(batch / 2), second = batch % 2;
    const gap = formation === 'front' ? .45 : formation === 'cross' ? .7 : formation === 'fission-pack' ? .55 : .6;
    const sector = (rotation + (formation === 'cross' ? second * 4 + pair * 2 : formation === 'mixed' ? APPROACH_ORDER[batch % 8] : formation === 'fission-pack' ? pair % 2 : 0)) % 8;
    batchSchedule.push({ at: pair * pairInterval + second * gap, sector, spread: formation === 'fission-pack' ? .13 : .18,
      roles: roles.slice(batch * 3, batch * 3 + 3) });
  }
  return { traits, title, eliteWave, eliteRemaining, formation, formationLabel, batchSchedule, supportRemaining,
    warningSeconds: eliteWave || wave === 3 ? ENDLESS_BALANCE.traitWarningSeconds : ENDLESS_BALANCE.warningSeconds, totalToSpawn };
}

/** Called after initializeBattle; retains its large world and existing tool rules. */
export function initializeEndless(state: GameState): void {
  if (!state.battle) throw new Error('Endless mode requires an initialized battle');
  const battle = state.battle;
  state.targets = [];
  state.effects = [];
  delete state.campaign;
  battle.graph.nodes = battle.graph.nodes.filter(node => node.kind === 'tissue' || node.kind === 'valve');
  battle.graph.edges = [];
  for (const node of battle.graph.nodes) { node.active = true; node.infected = false; }
  battle.nextSpawnAt = {};
  battle.warning = null; battle.traits = []; battle.defeatedTraits = [];
  battle.encounter = undefined; battle.behaviorHistory = []; battle.evolutionDecisions = [];
  battle.readyToRetest = false; battle.nextEvolutionAt = 0; battle.organLowSince = null;
  battle.pressure = { infection: 0, vitality: 100, criticalSince: null, organAlarm: false, crisisReason: '' };
  // Keep the same chamber, but put the challenge's usable facilities in its broad center.
  const geometry = activeWorld(state), centerX = (geometry.bounds.left + geometry.bounds.right) / 2;
  const centerY = (geometry.bounds.top + geometry.bounds.bottom) / 2;
  Object.assign(state.tissue, moveWithCollision({ x: centerX, y: centerY + 120 }, { x: 0, y: 0 }, state.tissue.radius, geometry), { hp: state.tissue.maxHp });
  Object.assign(state.player, moveWithCollision({ x: centerX - 100, y: centerY + 20 }, { x: 0, y: 0 }, state.player.radius, geometry), { hp: 100 });
  for (const node of battle.graph.nodes) {
    if (node.kind === 'tissue') { node.x = state.tissue.x; node.y = state.tissue.y; }
    else if (node.kind === 'valve') {
      Object.assign(node, moveWithCollision({ x: centerX, y: centerY - 180 }, { x: 0, y: 0 }, 40, geometry));
      battle.pulse.origin = { x: node.x, y: node.y };
    }
  }
  const plan = wavePlan(state.seed, 1);
  (state as EndlessGameState).endless = {
    schemaVersion: 1, wave: 1, clearedWaves: 0, phase: 'warning', phaseUntil: state.elapsed + plan.warningSeconds,
    phaseStartedAt: state.elapsed, ...plan, remainingToSpawn: plan.totalToSpawn,
    spawnedIds: [], creditedKillIds: [], kills: 0, score: 0, combo: 0, bestCombo: 0, lastKillAt: -1000,
    nextSpawnAt: state.elapsed + plan.warningSeconds, batchSerial: 0, spawnSerial: 0, pendingChildren: 0, directions: [], batchIndex: 0, batchMemberIndex: 0,
  };
  battle.stage = 0; battle.stageLabel = `第 1 波 · ${plan.title}`;
  battle.objective = '连续清场成长；普通感染体追击你，潜伏体侵蚀中央组织。每 5 波迎战精英。';
  state.message = 'WASD 移动 · 按住左键连射 · Q 朝敌群部署免疫小队；清波后选择进化，3 可抢修十字组织。';
  state.messageUntil = 8; state.messagePriority = 1;
}

export class EndlessDirector {
  constructor(private host: EndlessHost) {}
  private get state() { return this.host.state; }
  private get e(): EndlessState { return (this.state as EndlessGameState).endless!; }
  private active(): boolean { return !!this.e && this.state.phase === 'playing' && this.state.player.hp > 0 && this.state.tissue.hp > 0; }
  private current(target: Target): boolean { return target.sourceId === sourceId(this.e.wave); }

  /** Reserve the future children too, so simultaneous fission deaths cannot exceed 24. */
  private population(): { reserved: number; parents: number; pending: number } {
    let reserved = 0, parents = 0, pending = 0;
    for (const target of this.state.targets) {
      if (target.hp > 0) {
        const parent = target.role !== 'source' && target.role !== 'core' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0;
        reserved += parent ? 2 : 1;
        if (parent) parents++;
      } else if (target.splitAt !== undefined) {
        const count = target.splitPositions?.length ?? 2;
        reserved += count;
        if (this.current(target)) pending += count;
      }
    }
    this.e.pendingChildren = pending;
    return { reserved, parents, pending };
  }

  beforeInput(): void {
    if (!this.active()) return;
    const e = this.e, now = this.state.elapsed;
    this.population();
    if (e.combo > 0 && now - e.lastKillAt > ENDLESS_BALANCE.comboSeconds) e.combo = 0;
    if (now + 1e-9 < e.phaseUntil || e.phase === 'combat') return;
    if (e.phase === 'intermission') {
      const wave = e.wave + 1, plan = wavePlan(this.state.seed, wave);
      Object.assign(e, plan, { wave, phase: 'warning', phaseUntil: now + plan.warningSeconds, phaseStartedAt: now,
        remainingToSpawn: plan.totalToSpawn, spawnedIds: [], creditedKillIds: [], nextSpawnAt: now + plan.warningSeconds,
        spawnSerial: 0, batchSerial: 0, pendingChildren: 0, directions: [], batchIndex: 0, batchMemberIndex: 0 });
      this.state.battle!.traits = [...e.traits];
      this.state.battle!.stage = wave - 1;
      this.state.battle!.stageLabel = `第 ${wave} 波 · ${e.title}`;
      this.host.emit('ENDLESS_WAVE_WARNING', { wave, title: e.title, duration: e.warningSeconds, traits: e.traits.join('+'), elite: e.eliteWave, formation: e.formation, supports: e.supportRemaining });
      const counter = e.traits.map(trait => `${TRAITS[trait].name}：${TRAITS[trait].counter}`).join('；');
      this.host.message(`第 ${wave} 波 · ${e.title}，${e.warningSeconds} 秒后到达。${wave === 3 ? '新敌：点射体锁定细线后攻击，侧移避开；可直接净化。' : counter || '移动拉线，2 范围裂解，Q 召集免疫援助。'}`, e.warningSeconds, 2);
      return;
    }
    e.phase = 'combat'; e.phaseStartedAt = now; e.phaseUntil = 0; e.nextSpawnAt = now;
    this.host.emit('ENDLESS_WAVE_STARTED', { wave: e.wave, title: e.title, budget: e.totalToSpawn, traits: e.traits.join('+') });
    this.host.message(`第 ${e.wave} 波 · ${e.title}。清场获得成长；注意多方向来袭。`, 3, 1);
  }

  afterInput(): void {
    if (!this.active() || this.e.phase !== 'combat') return;
    const e = this.e, now = this.state.elapsed;
    this.population();
    if (e.remainingToSpawn > 0 && now + 1e-9 >= e.nextSpawnAt) this.spawnBatch();
    this.population();
    // Pending fission is a real unresolved enemy promise, even after every parent died.
    if (e.remainingToSpawn > 0 || e.pendingChildren > 0 || this.state.targets.some(target => target.hp > 0)) return;
    if (e.clearedWaves >= e.wave) return;
    e.clearedWaves = e.wave;
    e.score = safeAdd(e.score, 50 + Math.min(100000, e.wave * 10));
    e.phase = 'intermission'; e.phaseStartedAt = now; e.phaseUntil = now + ENDLESS_BALANCE.intermissionSeconds;
    this.host.emit('ENDLESS_WAVE_CLEARED', { wave: e.wave, score: e.score, kills: e.kills, bestCombo: e.bestCombo });
    this.host.message(`第 ${e.wave} 波清场！获得一次成长，${ENDLESS_BALANCE.intermissionSeconds} 秒休整后迎接下一波。`, 3, 2);
    this.host.completeWave(e.wave);
  }

  recordEvent(event: GameEvent): void {
    if (!this.active() || event.tick !== this.state.tick) return;
    const id = String(event.data.id ?? ''), target = this.state.targets.find(item => item.id === id);
    if (!target || !this.current(target)) return;
    if (event.type === 'ACTOR_SPAWNED') {
      if (!this.e.spawnedIds.includes(id)) this.e.spawnedIds.push(id);
      return;
    }
    if (event.type !== 'TARGET_CLEARED' || target.hp > 0 || this.e.creditedKillIds.includes(id)) return;
    const e = this.e;
    e.creditedKillIds.push(id);
    e.kills = safeAdd(e.kills, 1);
    e.combo = this.state.elapsed - e.lastKillAt <= ENDLESS_BALANCE.comboSeconds ? safeAdd(e.combo, 1) : 1;
    e.bestCombo = Math.max(e.bestCombo, e.combo); e.lastKillAt = this.state.elapsed;
    const multiplier = Math.min(ENDLESS_BALANCE.maximumComboMultiplier, 1 + Math.floor(e.combo / 5));
    e.score = safeAdd(e.score, (target.role === 'elite' ? 80 : (target.generation ?? 0) > 0 ? 6 : 10) * multiplier);
  }

  private spawnBatch(): void {
    const e = this.e, now = this.state.elapsed;
    const batch = e.batchSchedule[e.batchIndex];
    if (!batch) return;
    // A blocked finite batch retries; it does not create an unbounded backlog or skip promised roles.
    e.nextSpawnAt = now + .25;
    const directions = new Set<string>();
    let spawned = 0;
    while (e.batchMemberIndex < batch.roles.length && e.remainingToSpawn > 0) {
      const population = this.population();
      const role = batch.roles[e.batchMemberIndex], elite = role === 'elite', support = role === 'support';
      const ordinal = e.totalToSpawn - e.remainingToSpawn;
      let traits: TraitId[] = [];
      // Mixed cohorts retain a fast baseline: never stack every discovered trait on every body.
      if (!support && e.traits.length && (elite || ordinal % 3 !== 2)) traits = [e.traits[ordinal % e.traits.length]];
      if (traits.includes('FISSION') && population.parents >= ENDLESS_BALANCE.maximumFissionParents) traits = [];
      const cost = traits.includes('FISSION') ? 2 : 1;
      if (population.reserved + cost > ENDLESS_BALANCE.maximumActors) break;
      const tactic: EnemyTactic = support ? 'thin-ray' : !elite ? 'melee'
        : traits[0] === 'CARAPACE' ? 'crystal-charge' : traits[0] === 'FISSION' ? 'fission-burst' : 'mimic-corrosion';
      const radius = elite ? 30 : 22, position = this.spawnPosition(e.spawnSerial, radius, role, tactic, batch, e.batchMemberIndex);
      if (!position) break;
      const hp = elite ? Math.min(204, 136 + Math.floor(e.wave / 10) * 34) : 68;
      const id = `${elite ? 'elite' : 'virus'}-${++this.state.battle!.nextActorId}`;
      const target: Target & { tactic: EnemyTactic } = { ...position, id, kind: traits.includes('FISSION') ? 'cluster' : 'single', role: elite ? 'elite' : 'virus', radius,
        hp, maxHp: hp, hitUntil: 0, scanned: false, traits, generation: 0, sourceId: sourceId(e.wave), born: now,
        facing: Math.atan2(this.state.player.y - position.y, this.state.player.x - position.x), tactic,
        attackReady: now + (support ? .2 : elite ? .35 : ENDLESS_BALANCE.spawnGrace) };
      this.state.targets.push(target);
      e.spawnedIds.push(id); e.spawnSerial++; e.remainingToSpawn--; e.batchMemberIndex++;
      if (elite) e.eliteRemaining--; if (support) e.supportRemaining--;
      const angle = Math.atan2(position.y - this.state.player.y, position.x - this.state.player.x);
      directions.add(DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8]);
      this.host.effect('evolution', position, position, radius + 16, .7);
      this.host.emit('ACTOR_SPAWNED', { id, role: target.role!, generation: 0, sourceId: target.sourceId!, traits: traits.join('+'), wave: e.wave, tactic, formation: e.formation });
      spawned++;
    }
    if (e.batchMemberIndex >= batch.roles.length) {
      e.batchIndex++; e.batchMemberIndex = 0;
      const next = e.batchSchedule[e.batchIndex];
      // Relative gap from this completed batch: no catch-up burst after a long pause or population block.
      e.nextSpawnAt = next ? now + Math.max(.05, next.at - batch.at) : now + 3600;
    }
    if (spawned > 0) {
      e.batchSerial++; e.directions = [...directions];
      this.host.emit('ENDLESS_REINFORCEMENTS', { wave: e.wave, batch: e.batchSerial, count: spawned, directions: e.directions.join('／'), remaining: e.remainingToSpawn, formation: e.formation });
    }
  }

  private spawnPosition(serial: number, radius: number, role: EndlessSpawnRole, tactic: EnemyTactic, batch: EndlessBatch, member: number): Vec | undefined {
    const e = this.e, state = this.state, geometry = activeWorld(state);
    const rng = new SeedRng((state.seed ^ Math.imul(e.wave, 0x9e3779b1) ^ Math.imul(serial + 1, 0x85ebca6b)) >>> 0);
    const sector = batch.sector + (role === 'support' ? 2 : 0);
    const inner = role === 'elite' || role === 'support' ? 380 : ENDLESS_BALANCE.spawnRingInner;
    const outer = role === 'elite' ? 480 : role === 'support' ? 500 : ENDLESS_BALANCE.spawnRingOuter;
    for (let attempt = 0; attempt < 48; attempt++) {
      // Start inside the planned cohort; only fan farther when geometry or existing bodies reject it.
      const offset = (member - 1) * batch.spread + (attempt < 12 ? 0 : Math.floor((attempt - 12) / 6 + 1) * Math.PI / 4);
      const angle = sector * Math.PI / 4 + offset + (rng.next() - .5) * .08;
      const range = e.formation === 'fission-pack' && role === 'ordinary' && attempt < 12
        ? 470 + (e.batchIndex % 2) * 65 + (rng.next() - .5) * 35 : inner + rng.next() * (outer - inner);
      const candidate = moveWithCollision({ x: state.player.x + Math.cos(angle) * range, y: state.player.y + Math.sin(angle) * range }, { x: 0, y: 0 }, radius, geometry);
      const playerDistance = distance(candidate, state.player);
      const minimum = role === 'ordinary' ? ENDLESS_BALANCE.minimumSpawnDistance : inner;
      if (playerDistance < minimum || playerDistance > outer + 1e-7) continue;
      if (geometry.obstacles.some(obstacle => distance(candidate, obstacle) < radius + obstacle.radius + 2)) continue;
      if (distance(candidate, state.tissue) < radius + state.tissue.radius + 40) continue;
      if (state.targets.some(target => target.hp > 0 && distance(candidate, target) < target.radius + radius + 12)) continue;
      if (role !== 'ordinary') {
        // Supports and elites must not begin their ranged attack from behind an unshootable fold.
        const aim = tactic === 'mimic-corrosion' ? state.tissue : state.player;
        const aimLength = distance(candidate, aim), block = wallHit(candidate, normalized(aim.x - candidate.x, aim.y - candidate.y), aimLength, geometry);
        const playerBlock = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), playerDistance, geometry);
        if (block !== null && block < aimLength - aim.radius || playerBlock !== null && playerBlock < playerDistance - radius) continue;
      }
      return candidate;
    }
    return undefined;
  }
}
