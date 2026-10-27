import { TRAITS } from '../game/battleConfig';
import type { TraitId } from '../game/battleTypes';
import type { MigrationChoice } from '../game/campaignTypes';
import type { ProtocolId } from '../game/growthTypes';
import { PROTOCOL_IDS, PROTOCOLS } from '../game/protocols';
import type { GameState } from '../game/types';
import type { CounterGuideVariant } from '../game/encounterTypes';
import { availableStartingPlans, parsePreparation, preparationForPlan, type RunPreparation, type StartingPlanId } from '../game/preparation';
import { parseRunMetricsSummary, summarizeRunMetrics, type RunMetricsSummary } from '../game/runMetrics';

export const PROFILE_SCHEMA_VERSION = 1 as const;
export const PROFILE_STORAGE_KEY = 'viral-invasion:1:profile';
export const COUNTER_GUIDE_VERSION = 1;
export interface RunEncounterRecord {
  configId: 'campaign-1' | 'fixture-1'; guideVariant: CounterGuideVariant;
  firstTraitOverride?: TraitId; guideCompleted: boolean; guideSkipped: boolean;
  counterMethod?: 'rear' | 'pulse';
  preparation?: RunPreparation;
}
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface ProfileSettings { sound: boolean; lowEffects: boolean }
export type AchievementId = 'FIRST_SOURCE' | 'FIRST_VICTORY' | 'CORE_PURIFIED' | 'TRAIT_RESEARCHER' | 'TWO_ORGANS' | 'INTERCEPTOR' | 'THREE_PROTOCOLS';
export const ACHIEVEMENTS: Record<AchievementId, { name: string; description: string }> = {
  FIRST_SOURCE: { name: '止住源头', description: '在一次病例中净化至少一个感染源。' },
  FIRST_VICTORY: { name: '生命复苏', description: '完成一次成功复测。' },
  CORE_PURIFIED: { name: '击穿母巢', description: '清除一次双特性母巢。' },
  TRAIT_RESEARCHER: { name: '变异观察者', description: '在不同病例中发现全部三种变异。' },
  TWO_ORGANS: { name: '心肺之间', description: '在同一病例中完成跨器官旅行。' },
  INTERCEPTOR: { name: '及时截流', description: '选择追击并成功阻止迁移群建立新源。' },
  THREE_PROTOCOLS: { name: '三重应答', description: '在同一病例中装备三个抗体协议。' },
};
export interface RunStats {
  kills: number; sourceClears: number; eliteClears: number; repairs: number;
  pulses: number; scans: number; dashes: number; travels: number;
}
export interface RunTimelineEntry { at: number; side: 'virus' | 'antibody' | 'campaign'; text: string }
export interface RunSummary {
  seed: number; success: boolean; reason: string; durationSeconds: number;
  traits: TraitId[]; protocols: ProtocolId[]; migrationChoice: MigrationChoice | null;
  coreCleared: boolean; stats: RunStats; timeline: RunTimelineEntry[];
  suggestion: string; suggestionEvidence: string;
  encounter?: RunEncounterRecord;
  review?: RunMetricsSummary;
}
export interface RunRecord extends RunSummary { runId: string }
export interface ProfileData {
  game: 'viral-invasion'; schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  discoveredTraits: TraitId[]; discoveredWeaknesses: TraitId[]; unlockedProtocols: ProtocolId[];
  achievements: AchievementId[]; settings: ProfileSettings;
  startingPlan: StartingPlanId;
  onboarding: { migrationGuideAcknowledged: boolean; counterGuideVersion: number; counterGuideCompleted: boolean; counterGuideSkipped: boolean };
  stats: { runs: number; wins: number; losses: number; kills: number; sourceClears: number; coreClears: number };
  best: { fastestVictory: { runId: string; seed: number; durationSeconds: number; encounter?: RunEncounterRecord } | null; mostKills: number; mostSources: number; longestRunSeconds: number };
  recentRuns: RunRecord[];
  /** Kept separately from the ten visible records so an old result cannot be rewarded again. */
  recordedRunIds: string[];
}
export interface ProfileStatus {
  mode: 'persistent' | 'session';
  code: 'empty' | 'loaded' | 'saved' | 'corrupt' | 'incompatible' | 'unavailable' | 'write-failed';
  message: string;
}
export interface ProfileSnapshot { data: ProfileData; status: ProfileStatus }
export type RecordRunResult =
  | { kind: 'recorded'; record: RunRecord; newAchievements: AchievementId[]; persisted: boolean }
  | { kind: 'duplicate'; record?: RunRecord }
  | { kind: 'rejected'; reason: 'run-not-ended' | 'invalid-run-id' };

const TRAIT_IDS: TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];
const ORGAN_CHOICES: MigrationChoice[] = ['pursue', 'block', 'ignore'];
const RUN_STAT_KEYS: Array<keyof RunStats> = ['kills', 'sourceClears', 'eliteClears', 'repairs', 'pulses', 'scans', 'dashes', 'travels'];
const PROFILE_STAT_KEYS: Array<keyof ProfileData['stats']> = ['runs', 'wins', 'losses', 'kills', 'sourceClears', 'coreClears'];
const ownObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const uint32 = (value: unknown): value is number => count(value) && value <= 0xffffffff;
const runIdValid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f]/.test(value);
const textValid = (value: unknown): value is string => typeof value === 'string' && value.length <= 2000;
const safeCount = (value: number | undefined): number => count(value) ? value : 0;
const safeDuration = (value: number): number => duration(value) ? value : 0;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const addCount = (a: number, b: number): number => Math.min(Number.MAX_SAFE_INTEGER, a + b);
function enumArray<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.length <= allowed.length && value.every(item => allowed.includes(item)) && unique(value).length === value.length;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(runIdValid) && unique(value).length === value.length;
}
export function emptyProfile(): ProfileData {
  return {
    game: 'viral-invasion', schemaVersion: PROFILE_SCHEMA_VERSION,
    discoveredTraits: [], discoveredWeaknesses: [], unlockedProtocols: [], achievements: [],
    settings: { sound: true, lowEffects: false }, startingPlan: 'field',
    onboarding: { migrationGuideAcknowledged: false, counterGuideVersion: COUNTER_GUIDE_VERSION, counterGuideCompleted: false, counterGuideSkipped: false },
    stats: { runs: 0, wins: 0, losses: 0, kills: 0, sourceClears: 0, coreClears: 0 },
    best: { fastestVictory: null, mostKills: 0, mostSources: 0, longestRunSeconds: 0 },
    recentRuns: [], recordedRunIds: [],
  };
}

function parseEncounter(value: unknown): RunEncounterRecord | null {
  if (!ownObject(value) || !['campaign-1', 'fixture-1'].includes(String(value.configId))
    || !['guided', 'adaptive'].includes(String(value.guideVariant))
    || typeof value.guideCompleted !== 'boolean' || typeof value.guideSkipped !== 'boolean'
    || value.firstTraitOverride !== undefined && !TRAIT_IDS.includes(value.firstTraitOverride as TraitId)
    || value.counterMethod !== undefined && !['rear', 'pulse'].includes(String(value.counterMethod))) return null;
  const preparation = value.preparation === undefined ? undefined : parsePreparation(value.preparation);
  if (preparation === null) return null;
  return { configId: value.configId as RunEncounterRecord['configId'], guideVariant: value.guideVariant as CounterGuideVariant,
    guideCompleted: value.guideCompleted, guideSkipped: value.guideSkipped,
    ...(value.firstTraitOverride !== undefined ? { firstTraitOverride: value.firstTraitOverride as TraitId } : {}),
    ...(value.counterMethod !== undefined ? { counterMethod: value.counterMethod as 'rear' | 'pulse' } : {}),
    ...(preparation ? { preparation } : {}) };
}
function parseRecord(value: unknown): RunRecord | null {
  if (!ownObject(value) || !runIdValid(value.runId) || !uint32(value.seed) || typeof value.success !== 'boolean'
    || !textValid(value.reason) || !duration(value.durationSeconds) || !enumArray(value.traits, TRAIT_IDS)
    || !enumArray(value.protocols, PROTOCOL_IDS) || value.migrationChoice !== null && !ORGAN_CHOICES.includes(value.migrationChoice as MigrationChoice)
    || typeof value.coreCleared !== 'boolean' || !ownObject(value.stats)
    || !RUN_STAT_KEYS.every(key => count((value.stats as Record<string, unknown>)[key]))
    || !Array.isArray(value.timeline) || value.timeline.length > 30 || !textValid(value.suggestion) || !textValid(value.suggestionEvidence)) return null;
  const encounter = value.encounter === undefined ? undefined : parseEncounter(value.encounter);
  if (encounter === null) return null;
  const review = value.review === undefined ? undefined : parseRunMetricsSummary(value.review);
  if (value.review !== undefined && !review) return null;
  const timeline: RunTimelineEntry[] = [];
  for (const entry of value.timeline) {
    if (!ownObject(entry) || !duration(entry.at) || !['virus', 'antibody', 'campaign'].includes(String(entry.side)) || !textValid(entry.text)) return null;
    timeline.push({ at: entry.at, side: entry.side as RunTimelineEntry['side'], text: entry.text });
  }
  return {
    runId: value.runId, seed: value.seed, success: value.success, reason: value.reason, durationSeconds: value.durationSeconds,
    traits: [...value.traits], protocols: [...value.protocols], migrationChoice: value.migrationChoice as MigrationChoice | null,
    coreCleared: value.coreCleared, stats: Object.fromEntries(RUN_STAT_KEYS.map(key => [key, (value.stats as Record<string, number>)[key]])) as unknown as RunStats,
    timeline, suggestion: value.suggestion, suggestionEvidence: value.suggestionEvidence,
    ...(encounter ? { encounter } : {}), ...(review ? { review } : {}),
  };
}
function parseProfile(value: unknown): ProfileData | null {
  if (!ownObject(value) || value.game !== 'viral-invasion' || value.schemaVersion !== PROFILE_SCHEMA_VERSION
    || !enumArray(value.discoveredTraits, TRAIT_IDS) || !enumArray(value.discoveredWeaknesses, TRAIT_IDS)
    || !value.discoveredWeaknesses.every(trait => (value.discoveredTraits as TraitId[]).includes(trait))
    || !enumArray(value.unlockedProtocols, PROTOCOL_IDS) || !enumArray(value.achievements, ACHIEVEMENT_IDS)
    || !ownObject(value.settings) || typeof value.settings.sound !== 'boolean' || typeof value.settings.lowEffects !== 'boolean'
    || value.onboarding !== undefined && (!ownObject(value.onboarding)
      || value.onboarding.migrationGuideAcknowledged !== undefined && typeof value.onboarding.migrationGuideAcknowledged !== 'boolean'
      || value.onboarding.counterGuideVersion !== undefined && !count(value.onboarding.counterGuideVersion)
      || value.onboarding.counterGuideCompleted !== undefined && typeof value.onboarding.counterGuideCompleted !== 'boolean'
      || value.onboarding.counterGuideSkipped !== undefined && typeof value.onboarding.counterGuideSkipped !== 'boolean')
    || !ownObject(value.stats) || !PROFILE_STAT_KEYS.every(key => count((value.stats as Record<string, unknown>)[key]))
    || !ownObject(value.best) || !count(value.best.mostKills) || !count(value.best.mostSources) || !duration(value.best.longestRunSeconds)
    || !strings(value.recordedRunIds) || !Array.isArray(value.recentRuns) || value.recentRuns.length > 10) return null;
  const stats = value.stats as unknown as ProfileData['stats'];
  if (stats.runs !== value.recordedRunIds.length || stats.wins + stats.losses !== stats.runs) return null;
  const recentRuns: RunRecord[] = [];
  for (const raw of value.recentRuns) {
    const record = parseRecord(raw);
    if (!record || !value.recordedRunIds.includes(record.runId) || recentRuns.some(previous => previous.runId === record.runId)) return null;
    recentRuns.push(record);
  }
  let fastestVictory: ProfileData['best']['fastestVictory'] = null;
  if (value.best.fastestVictory !== null) {
    const best = value.best.fastestVictory;
    if (!ownObject(best) || !runIdValid(best.runId) || !value.recordedRunIds.includes(best.runId) || !uint32(best.seed) || !duration(best.durationSeconds) || stats.wins === 0) return null;
    const encounter = best.encounter === undefined ? undefined : parseEncounter(best.encounter);
    if (encounter === null) return null;
    fastestVictory = { runId: best.runId, seed: best.seed, durationSeconds: best.durationSeconds, ...(encounter ? { encounter } : {}) };
  }
  // Reconstruct only the profile schema. Unknown JSON keys never become run state or settings.
  return {
    game: 'viral-invasion', schemaVersion: PROFILE_SCHEMA_VERSION,
    discoveredTraits: [...value.discoveredTraits], discoveredWeaknesses: [...value.discoveredWeaknesses], unlockedProtocols: [...value.unlockedProtocols], achievements: [...value.achievements],
    settings: { sound: value.settings.sound, lowEffects: value.settings.lowEffects },
    startingPlan: availableStartingPlans(value.unlockedProtocols as ProtocolId[]).includes(value.startingPlan as StartingPlanId) ? value.startingPlan as StartingPlanId : 'field',
    // Additive schema-1 field: old discoveries never imply that a guide was acknowledged.
    onboarding: { migrationGuideAcknowledged: ownObject(value.onboarding) && value.onboarding.migrationGuideAcknowledged === true,
      counterGuideVersion: ownObject(value.onboarding) && count(value.onboarding.counterGuideVersion) ? value.onboarding.counterGuideVersion : 0,
      counterGuideCompleted: ownObject(value.onboarding) && value.onboarding.counterGuideCompleted === true,
      counterGuideSkipped: ownObject(value.onboarding) && value.onboarding.counterGuideSkipped === true },
    stats: Object.fromEntries(PROFILE_STAT_KEYS.map(key => [key, stats[key]])) as unknown as ProfileData['stats'],
    best: { fastestVictory, mostKills: value.best.mostKills, mostSources: value.best.mostSources, longestRunSeconds: value.best.longestRunSeconds },
    recentRuns, recordedRunIds: [...value.recordedRunIds],
  };
}

function runProtocols(state: GameState): ProtocolId[] {
  const chosen = [...state.growth?.carriedProtocols ?? [], ...state.growth?.equipped.map(slot => slot.id) ?? []];
  for (const event of state.events) if (event.type === 'PROTOCOL_EQUIPPED' && PROTOCOL_IDS.includes(event.data.protocolId as ProtocolId)) chosen.push(event.data.protocolId as ProtocolId);
  // Compatibility fallback for older fixtures. Current runs retain a fixed
  // four-protocol set independently of both bounded diagnostic histories.
  for (const entry of state.growth?.protocolHistory ?? []) if (entry.type === 'PROTOCOL_EQUIPPED') {
    for (const id of PROTOCOL_IDS) if (entry.text.startsWith(`${PROTOCOLS[id].name}：`)) chosen.push(id);
  }
  return unique(chosen).filter(id => PROTOCOL_IDS.includes(id));
}
function advice(state: GameState): Pick<RunSummary, 'suggestion' | 'suggestionEvidence'> {
  const battle = state.battle, campaign = state.campaign;
  const answer = (suggestionEvidence: string, suggestion: string) => ({ suggestion, suggestionEvidence });
  if (!state.result?.success && state.player.hp <= 0) return answer(`本局救援体耐久耗尽，使用冲刺 ${state.dashes} 次。`, '下局先读带齿轮廓的攻击前摇，横向走出危险区；需要脱离包围时用 Space 冲刺，靠近组织修复还能恢复少量耐久。');
  if (!state.result?.success && battle && battle.pressure.vitality <= 0) return answer(`本局全身稳定耗尽，完成有效修复 ${battle.stats.repairs} 次。`, '下局看到器官濒危警报时，先用 3 瞄准十字组织抢修；进入另一器官前净化源头或关闭传播路线，减轻离场压力。');
  if (!state.result?.success && battle && battle.pressure.infection >= 95) return answer(`本局结束时感染负荷 ${Math.round(battle.pressure.infection)}%，净化感染源 ${battle.stats.sourceClears} 个。`, '下局优先摧毁有增殖环的感染源，再处理追兵；感染满载后的倒数仍能通过清源和修复挽回。');
  if (campaign?.migration.choice === 'ignore') return answer('本局选择放任迁移，肺部承担了新增感染源的风险。', '同种子重试时试试另一条路线：去出口 E 追击，或在心脏隔离闸 E 保持两秒封锁，比较不同压力代价。');
  if (campaign?.migration.choice === 'pursue' && campaign.migration.interceptSucceeded === false) return answer('本局选择追击，但未在拦截窗口内截住迁移。', '下局追击后先找肺部气道：在拦截倒数结束前清除迁移小体，或用 E 关闭气道截流；新源已建立时仍可净化挽回。');
  if (campaign?.core.combat?.traits.includes('MIMIC') && campaign.core.combat.scanInterrupts === 0) return answer('本局遇到潜伏母巢，尚未用扫描打断组织侵蚀。', '下局为母巢的组织侵蚀前摇保留 Q：扫描能取消这次侵蚀并打开破绽，比只追着核心射击更从容。');
  if (battle?.traits.includes('CARAPACE') && battle.stats.pulses === 0) return answer('本局出现晶壳，定向冲流使用次数为 0。', '下局遇到晶壳先绕后；靠近心脏阀门时朝目标按 E，用少量组织完整度换取击退与破壳窗口。');
  if (battle?.traits.includes('FISSION') && !(battle.behaviorHistory ?? []).some(bin => bin.areaDamage > 0)) return answer('本局出现裂殖，近期没有有效范围裂解伤害。', '下局让母体和小体保持聚集，再用 2 范围裂解；肺部吸气阶段也能帮助聚拢敌群。');
  if (campaign?.arenas.lung.activated && campaign.stats.travels > 0 && campaign.stats.airwayUses === 0) return answer('本局曾跨器官行动，肺部气道操作次数为 0。', '下局在肺部先观察吸气聚拢、呼气分散，再决定是否关闭气道；截流会停止气流和传播，也会消耗组织完整度。');
  if (battle?.traits.length && state.scans === 0) return answer(`本局出现 ${battle.traits.length} 种变异，没有使用 Q 扫描。`, '下局在第一次变异后用 Q 扫描，先确认轮廓与反制，再决定净化顺序；扫描也能显露组织附近的潜伏体。');
  if (state.growth?.equipped.length) {
    const names = state.growth.equipped.map(slot => PROTOCOLS[slot.id].name).join('、');
    return answer(`本局最终携带：${names}。`, '同种子重试时更换一个抗体槽位或校准方式，比较共振＋连锁、显影＋灯塔的触发条件与组织代价。');
  }
  return answer(`本局净化行动 ${state.shots} 次，扫描 ${state.scans} 次。`, state.shots === 0 ? '下一局先用 1 净化近处感染体，再用 3 修复十字组织；完成一次清源后选择抗体，体验从基础工具到协议联动的变化。' : '下一局把首个感染源作为短期目标：清源停止增殖并提供成长选择，再尝试把一个抗体协议融入基础工具的节奏。');
}

/** Pure, deterministic result presentation; reads accepted actions and the actual final state. */
export function buildRunSummary(state: GameState): RunSummary {
  const battle = state.battle, campaign = state.campaign;
  const timeline: RunTimelineEntry[] = [
    ...(battle?.history ?? []).filter(entry => /变异预警|已出现|弱点/.test(entry.text)).map(entry => ({ ...entry, side: 'virus' as const })),
    ...(state.growth?.protocolHistory ?? []).filter(entry => entry.type === 'PROTOCOL_EQUIPPED').map(entry => ({ at: entry.at, text: entry.text, side: 'antibody' as const })),
    ...(campaign?.history ?? []).map(entry => ({ ...entry, side: 'campaign' as const })),
  ].filter(entry => duration(entry.at)).map(entry => ({ ...entry, text: entry.text.slice(0, 2000) })).sort((a, b) => a.at - b.at);
  return {
    seed: state.seed >>> 0, success: state.result?.success ?? false, reason: (state.result?.reason ?? '病例尚未结束').slice(0, 2000), durationSeconds: safeDuration(state.elapsed),
    traits: unique(battle?.traits ?? []), protocols: runProtocols(state), migrationChoice: campaign?.migration.choice ?? null,
    coreCleared: campaign?.core.status === 'cleared',
    ...(state.runMetrics ? { review: summarizeRunMetrics(state.runMetrics) } : {}),
    stats: { kills: safeCount(battle?.stats.kills), sourceClears: safeCount(battle?.stats.sourceClears), eliteClears: safeCount(battle?.stats.eliteClears), repairs: safeCount(battle?.stats.repairs), pulses: safeCount(battle?.stats.pulses), scans: safeCount(state.scans), dashes: safeCount(state.dashes), travels: safeCount(campaign?.stats.travels) },
    timeline: timeline.filter((entry, index) => timeline.findIndex(other => other.at === entry.at && other.side === entry.side && other.text === entry.text) === index).slice(-30),
    ...(battle?.encounter ? { encounter: { configId: battle.encounter.configId, guideVariant: battle.encounter.guideVariant,
      guideCompleted: battle.encounter.firstCounter.completedAt !== null, guideSkipped: battle.encounter.firstCounter.skippedAt !== null,
      preparation: state.growth?.preparation ?? preparationForPlan('field'),
      ...(battle.forcedFirstTrait ? { firstTraitOverride: battle.forcedFirstTrait } : {}),
      ...(battle.encounter.firstCounter.counterHit ? { counterMethod: battle.encounter.firstCounter.counterHit.method } : {}) } } : {}),
    ...advice(state),
  };
}

/** All fields are metagame records. This module never restores a GameSession. */
export class ProfileStore {
  private value = emptyProfile();
  private currentStatus: ProfileStatus = { mode: 'session', code: 'unavailable', message: '本地存储不可用，记录仅保留到本次页面关闭。' };
  private storage: ProfileStorage | null;

  constructor(storage?: ProfileStorage | null) {
    try { this.storage = storage === undefined ? globalThis.localStorage ?? null : storage; }
    catch { this.storage = null; }
    this.initialize();
  }
  get data(): ProfileData { return structuredClone(this.value); }
  get status(): ProfileStatus { return { ...this.currentStatus }; }
  /** Idempotent snapshot: it does not replace live session fallback records with stale disk data. */
  load(): ProfileSnapshot { return { data: this.data, status: this.status }; }

  private initialize(): void {
    if (!this.storage) return;
    let raw: string | null;
    try { raw = this.storage.getItem(PROFILE_STORAGE_KEY); }
    catch { this.storage = null; return; }
    this.currentStatus = { mode: 'persistent', code: 'empty', message: '本地记录已就绪；清理浏览器数据可能丢失发现与战绩。' };
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (ownObject(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== PROFILE_SCHEMA_VERSION) {
          this.currentStatus = { mode: 'persistent', code: 'incompatible', message: '存档版本不兼容，已安全启用新档；局内状态不会从旧档恢复。' };
        } else {
          const data = parseProfile(parsed);
          if (!data) throw new Error('Invalid profile');
          this.value = data;
          this.currentStatus = { mode: 'persistent', code: 'loaded', message: '本地发现与战绩已载入；清理浏览器数据可能丢失记录。' };
        }
      } catch {
        this.currentStatus = { mode: 'persistent', code: 'corrupt', message: '本地存档损坏，已安全启用新档；本局仍可正常游玩。' };
      }
    }
    const probeKey = `${PROFILE_STORAGE_KEY}:probe:${Math.random().toString(36).slice(2)}`;
    try {
      this.storage.setItem(probeKey, 'viral-invasion');
      if (this.storage.getItem(probeKey) !== 'viral-invasion') throw new Error('Storage probe not retained');
      this.storage.removeItem(probeKey);
    } catch {
      try { this.storage.removeItem(probeKey); } catch { /* Storage may also reject cleanup. */ }
      const recovered = ['corrupt', 'incompatible'].includes(this.currentStatus.code) ? `${this.currentStatus.message} ` : '';
      this.storage = null;
      this.currentStatus = { mode: 'session', code: 'unavailable', message: `${recovered}本地存储不可写，记录仅保留到本次页面关闭。` };
    }
  }
  private persist(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.value));
      if (this.currentStatus.code === 'empty' || this.currentStatus.code === 'loaded') this.currentStatus = { mode: 'persistent', code: 'saved', message: '发现与战绩已保存到本地浏览器；清理浏览器数据可能丢失记录。' };
      return true;
    } catch {
      this.storage = null;
      this.currentStatus = { mode: 'session', code: 'write-failed', message: '本地保存失败，已切换为本次会话记录；关闭页面后本次新增记录可能丢失。' };
      return false;
    }
  }
  updateSettings(patch: Partial<ProfileSettings>): ProfileSnapshot {
    let changed = false;
    for (const key of ['sound', 'lowEffects'] as const) if (typeof patch[key] === 'boolean' && patch[key] !== this.value.settings[key]) {
      this.value.settings[key] = patch[key]; changed = true;
    }
    if (changed) this.persist();
    return this.load();
  }
  /** Permanent records expand starting choices; all equipment is freshly I-rank. */
  selectStartingPlan(plan: StartingPlanId): boolean {
    if (!availableStartingPlans(this.value.unlockedProtocols).includes(plan)) return false;
    if (this.value.startingPlan !== plan) { this.value.startingPlan = plan; this.persist(); }
    return true;
  }
  /** Only an explicit button/Escape dismissal acknowledges the guide, not discovering traits or showing it. */
  acknowledgeMigrationGuide(): ProfileSnapshot {
    if (!this.value.onboarding.migrationGuideAcknowledged) {
      this.value.onboarding.migrationGuideAcknowledged = true;
      this.persist();
    }
    return this.load();
  }
  /** Only an accepted gameplay counter or an explicit skip acknowledges this version. */
  acknowledgeCounterGuide(outcome: 'completed' | 'skipped'): ProfileSnapshot {
    const guide = this.value.onboarding;
    const key = outcome === 'completed' ? 'counterGuideCompleted' : 'counterGuideSkipped';
    if (guide.counterGuideVersion !== COUNTER_GUIDE_VERSION) {
      guide.counterGuideVersion = COUNTER_GUIDE_VERSION;
      guide.counterGuideCompleted = false; guide.counterGuideSkipped = false;
    }
    if (!guide[key]) { guide[key] = true; this.persist(); }
    return this.load();
  }
  /** The host supplies a globally unique run ID; seed and local run serial alone are not unique across reloads. */
  recordRun(state: GameState, runId: string): RecordRunResult {
    if (!runIdValid(runId)) return { kind: 'rejected', reason: 'invalid-run-id' };
    if (state.phase !== 'result' || !state.result) return { kind: 'rejected', reason: 'run-not-ended' };
    if (this.value.recordedRunIds.includes(runId)) return { kind: 'duplicate', record: structuredClone(this.value.recentRuns.find(run => run.runId === runId)) };
    const record: RunRecord = { runId, ...buildRunSummary(state) };
    const data = this.value;
    const diagnosed = (state.growth?.rewardedKeys ?? []).filter(key => key.startsWith('diagnose:')).map(key => key.slice(9)).filter((trait): trait is TraitId => TRAIT_IDS.includes(trait as TraitId));
    data.discoveredTraits = unique([...data.discoveredTraits, ...record.traits, ...diagnosed, ...state.battle?.defeatedTraits ?? []]);
    data.discoveredWeaknesses = unique([...data.discoveredWeaknesses, ...diagnosed, ...state.battle?.defeatedTraits ?? []]);
    data.unlockedProtocols = unique([...data.unlockedProtocols, ...record.protocols]);
    data.recordedRunIds.push(runId);
    data.recentRuns.unshift(record); data.recentRuns = data.recentRuns.slice(0, 10);
    data.stats.runs++; data.stats[record.success ? 'wins' : 'losses']++;
    data.stats.kills = addCount(data.stats.kills, record.stats.kills);
    data.stats.sourceClears = addCount(data.stats.sourceClears, record.stats.sourceClears);
    if (record.coreCleared) data.stats.coreClears++;
    data.best.mostKills = Math.max(data.best.mostKills, record.stats.kills);
    data.best.mostSources = Math.max(data.best.mostSources, record.stats.sourceClears);
    data.best.longestRunSeconds = Math.max(data.best.longestRunSeconds, record.durationSeconds);
    if (record.success && (!data.best.fastestVictory || record.durationSeconds < data.best.fastestVictory.durationSeconds)) data.best.fastestVictory = { runId, seed: record.seed, durationSeconds: record.durationSeconds, ...(record.encounter ? { encounter: structuredClone(record.encounter) } : {}) };
    const earned: AchievementId[] = [];
    if (record.stats.sourceClears > 0) earned.push('FIRST_SOURCE');
    if (record.success) earned.push('FIRST_VICTORY');
    if (record.coreCleared) earned.push('CORE_PURIFIED');
    if (data.discoveredTraits.length === TRAIT_IDS.length) earned.push('TRAIT_RESEARCHER');
    if (record.stats.travels > 0) earned.push('TWO_ORGANS');
    if (state.campaign?.migration.choice === 'pursue' && state.campaign.migration.interceptSucceeded === true) earned.push('INTERCEPTOR');
    if ((state.growth?.equipped.length ?? 0) >= 3) earned.push('THREE_PROTOCOLS');
    const newAchievements = earned.filter(id => !data.achievements.includes(id));
    data.achievements = unique([...data.achievements, ...newAchievements]);
    const persisted = this.persist();
    return { kind: 'recorded', record: structuredClone(record), newAchievements, persisted };
  }
}
