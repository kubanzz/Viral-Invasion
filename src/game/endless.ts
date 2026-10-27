import { distance, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { BATTLE_BALANCE, TRAITS } from './battleConfig';
import type { TraitId } from './battleTypes';
import type { EndlessGameState, EndlessHost, EndlessState } from './endlessTypes';
import { activeWorld, type GameEvent, type GameState, type Target, type Vec } from './types';
export type { EndlessHost, EndlessState } from './endlessTypes';

export const ENDLESS_BALANCE = {
  warningSeconds: 3, traitWarningSeconds: 8, intermissionSeconds: 3,
  batchSize: 3, batchInterval: 2, minimumBatchInterval: 1.2,
  minimumSpawnDistance: 340, spawnRingInner: 420, spawnRingOuter: 600,
  spawnGrace: 1.5, maximumActors: BATTLE_BALANCE.maxActors,
  maximumWaveBudget: 28, maximumFissionParents: 4,
  comboSeconds: 3, maximumComboMultiplier: 4,
} as const;

const TRAIT_ORDER: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const DIRECTIONS = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
const APPROACH_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
const sourceId = (wave: number) => `endless:wave:${wave}`;
const safeAdd = (value: number, amount: number) => Math.min(Number.MAX_SAFE_INTEGER, value + amount);

function wavePlan(seed: number, wave: number): Pick<EndlessState, 'traits' | 'title' | 'eliteWave' | 'eliteRemaining' | 'warningSeconds' | 'totalToSpawn'> {
  const eliteWave = wave % 5 === 0;
  const generation = Math.floor(wave / 5);
  const offset = new SeedRng((seed ^ 0x454e444c) >>> 0).int(0, 2);
  const traits: TraitId[] = generation === 0 ? [] : [TRAIT_ORDER[(offset + generation - 1) % 3]];
  if (generation >= 3) traits.push(TRAIT_ORDER[(offset + generation - 2) % 3]);
  const formation = ['追击潮', '交叉来袭', '分路包围', '连锁猎场'][(wave - 1) % 4];
  const title = eliteWave ? `精英围猎 · ${TRAITS[traits[0]].name}` : traits.length ? `${TRAITS[traits[0]].name} · ${formation}` : formation;
  return { traits, title, eliteWave, eliteRemaining: eliteWave ? Math.min(2, 1 + Math.floor((wave - 5) / 25)) : 0,
    warningSeconds: eliteWave ? ENDLESS_BALANCE.traitWarningSeconds : ENDLESS_BALANCE.warningSeconds,
    totalToSpawn: Math.min(ENDLESS_BALANCE.maximumWaveBudget, 6 + wave * 2) };
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
    nextSpawnAt: state.elapsed + plan.warningSeconds, batchSerial: 0, spawnSerial: 0, pendingChildren: 0, directions: [],
  };
  battle.stage = 0; battle.stageLabel = '第 1 波 · 追击潮';
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
        spawnSerial: 0, batchSerial: 0, pendingChildren: 0, directions: [] });
      this.state.battle!.traits = [...e.traits];
      this.state.battle!.stage = wave - 1;
      this.state.battle!.stageLabel = `第 ${wave} 波 · ${e.title}`;
      this.host.emit('ENDLESS_WAVE_WARNING', { wave, title: e.title, duration: e.warningSeconds, traits: e.traits.join('+'), elite: e.eliteWave });
      const counter = e.traits.map(trait => `${TRAITS[trait].name}：${TRAITS[trait].counter}`).join('；');
      this.host.message(`第 ${wave} 波 · ${e.title}，${e.warningSeconds} 秒后到达。${counter || '移动拉线，2 范围裂解，Q 召集免疫援助。'}`, e.warningSeconds, 2);
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
    // Schedule from now, not an overdue deadline. Returning from a pause never catches up batches.
    e.nextSpawnAt = now + Math.max(ENDLESS_BALANCE.minimumBatchInterval, ENDLESS_BALANCE.batchInterval - (e.wave - 1) * .025);
    const directions = new Set<string>();
    let spawned = 0;
    for (let index = 0; index < ENDLESS_BALANCE.batchSize && e.remainingToSpawn > 0; index++) {
      const population = this.population();
      const elite = e.eliteRemaining > 0;
      const ordinal = e.totalToSpawn - e.remainingToSpawn;
      let traits: TraitId[] = [];
      // Mixed cohorts retain a fast baseline: never stack every discovered trait on every body.
      if (e.traits.length && (elite || ordinal % 3 !== 2)) traits = [e.traits[ordinal % e.traits.length]];
      if (traits.includes('FISSION') && population.parents >= ENDLESS_BALANCE.maximumFissionParents) traits = [];
      const cost = traits.includes('FISSION') ? 2 : 1;
      if (population.reserved + cost > ENDLESS_BALANCE.maximumActors) break;
      const radius = elite ? 30 : 22, position = this.spawnPosition(e.spawnSerial, radius);
      if (!position) break;
      const hp = elite ? Math.min(204, 136 + Math.floor(e.wave / 10) * 34) : 68;
      const id = `${elite ? 'elite' : 'virus'}-${++this.state.battle!.nextActorId}`;
      const target: Target = { ...position, id, kind: traits.includes('FISSION') ? 'cluster' : 'single', role: elite ? 'elite' : 'virus', radius,
        hp, maxHp: hp, hitUntil: 0, scanned: false, traits, generation: 0, sourceId: sourceId(e.wave), born: now,
        facing: Math.atan2(this.state.player.y - position.y, this.state.player.x - position.x), attackReady: now + ENDLESS_BALANCE.spawnGrace };
      this.state.targets.push(target);
      e.spawnedIds.push(id); e.spawnSerial++; e.remainingToSpawn--; if (elite) e.eliteRemaining--;
      const angle = Math.atan2(position.y - this.state.player.y, position.x - this.state.player.x);
      directions.add(DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8]);
      this.host.effect('evolution', position, position, radius + 16, .7);
      this.host.emit('ACTOR_SPAWNED', { id, role: target.role!, generation: 0, sourceId: target.sourceId!, traits: traits.join('+'), wave: e.wave });
      spawned++;
    }
    if (spawned > 0) {
      e.batchSerial++; e.directions = [...directions];
      this.host.emit('ENDLESS_REINFORCEMENTS', { wave: e.wave, batch: e.batchSerial, count: spawned, directions: e.directions.join('／'), remaining: e.remainingToSpawn });
    }
  }

  private spawnPosition(serial: number, radius: number): Vec | undefined {
    const e = this.e, state = this.state, geometry = activeWorld(state);
    const rng = new SeedRng((state.seed ^ Math.imul(e.wave, 0x9e3779b1) ^ Math.imul(serial + 1, 0x85ebca6b)) >>> 0);
    const rotation = new SeedRng((state.seed ^ Math.imul(e.wave, 0x45d9f3b)) >>> 0).int(0, 7);
    const sector = (APPROACH_ORDER[serial % APPROACH_ORDER.length] + rotation) % 8;
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = (sector + Math.floor(attempt / 4)) * Math.PI / 4 + (rng.next() - .5) * .25;
      const range = ENDLESS_BALANCE.spawnRingInner + rng.next() * (ENDLESS_BALANCE.spawnRingOuter - ENDLESS_BALANCE.spawnRingInner);
      const candidate = moveWithCollision({ x: state.player.x + Math.cos(angle) * range, y: state.player.y + Math.sin(angle) * range }, { x: 0, y: 0 }, radius, geometry);
      const playerDistance = distance(candidate, state.player);
      if (playerDistance < ENDLESS_BALANCE.minimumSpawnDistance || playerDistance > ENDLESS_BALANCE.spawnRingOuter + 1e-7) continue;
      if (geometry.obstacles.some(obstacle => distance(candidate, obstacle) < radius + obstacle.radius + 2)) continue;
      if (distance(candidate, state.tissue) < radius + state.tissue.radius + 40) continue;
      if (state.targets.some(target => target.hp > 0 && distance(candidate, target) < target.radius + radius + 12)) continue;
      return candidate;
    }
    return undefined;
  }
}
