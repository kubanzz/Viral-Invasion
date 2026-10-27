import type { GameState } from '../game/types';

export const ENDLESS_PROFILE_STORAGE_KEY = 'viral-invasion:1:endless-profile';
export const ENDLESS_PROFILE_SCHEMA_VERSION = 1 as const;
export const ENDLESS_RECENT_RUN_LIMIT = 10;
/** A bounded recent settlement window; this is not lifetime UUID membership. */
export const ENDLESS_DEDUP_LIMIT = 128;

export interface EndlessProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface EndlessRunRecord {
  runId: string;
  seed: number;
  waveReached: number;
  clearedWaves: number;
  score: number;
  kills: number;
  bestCombo: number;
  level: number;
  durationSeconds: number;
  extracted: boolean;
  reason: string;
}
export interface EndlessProfileData {
  game: 'viral-invasion';
  mode: 'endless';
  schemaVersion: typeof ENDLESS_PROFILE_SCHEMA_VERSION;
  /** Best number of completely cleared waves, rather than a wave merely entered. */
  bestWave: number;
  bestScore: number;
  bestCombo: number;
  runs: number;
  recentRuns: EndlessRunRecord[];
  /** At most 128 IDs; protects repeated current/recent result confirmations and reloads. */
  recentRunIds: string[];
}
export interface EndlessProfileStatus {
  mode: 'persistent' | 'session';
  code: 'empty' | 'loaded' | 'saved' | 'corrupt' | 'incompatible' | 'unavailable' | 'write-failed';
  message: string;
}
export interface EndlessProfileSnapshot { data: EndlessProfileData; status: EndlessProfileStatus }
export type EndlessRecordRunResult =
  | { kind: 'recorded'; record: EndlessRunRecord; persisted: boolean }
  | { kind: 'duplicate'; record?: EndlessRunRecord }
  | { kind: 'rejected'; reason: 'invalid-run-id' | 'run-not-ended' | 'not-endless' | 'invalid-result' };

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const runIdValid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f]/.test(value);
const reasonValid = (value: unknown): value is string => typeof value === 'string' && value.length <= 1000;
const safeAdd = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

export function emptyEndlessProfile(): EndlessProfileData {
  return { game: 'viral-invasion', mode: 'endless', schemaVersion: ENDLESS_PROFILE_SCHEMA_VERSION,
    bestWave: 0, bestScore: 0, bestCombo: 0, runs: 0, recentRuns: [], recentRunIds: [] };
}
function parseRecord(value: unknown): EndlessRunRecord | null {
  if (!object(value) || !runIdValid(value.runId) || !count(value.seed) || value.seed > 0xffffffff
    || !count(value.waveReached) || value.waveReached < 1 || !count(value.clearedWaves) || value.clearedWaves > value.waveReached
    || !count(value.score) || !count(value.kills) || !count(value.bestCombo) || !count(value.level)
    || !duration(value.durationSeconds) || typeof value.extracted !== 'boolean' || !reasonValid(value.reason)) return null;
  return { runId: value.runId, seed: value.seed, waveReached: value.waveReached, clearedWaves: value.clearedWaves,
    score: value.score, kills: value.kills, bestCombo: value.bestCombo, level: value.level,
    durationSeconds: value.durationSeconds, extracted: value.extracted, reason: value.reason };
}
export function parseEndlessProfile(value: unknown): EndlessProfileData | null {
  if (!object(value) || value.game !== 'viral-invasion' || value.mode !== 'endless' || value.schemaVersion !== ENDLESS_PROFILE_SCHEMA_VERSION
    || !count(value.bestWave) || !count(value.bestScore) || !count(value.bestCombo) || !count(value.runs)
    || !Array.isArray(value.recentRuns) || value.recentRuns.length > ENDLESS_RECENT_RUN_LIMIT
    || !Array.isArray(value.recentRunIds) || value.recentRunIds.length > ENDLESS_DEDUP_LIMIT
    || !value.recentRunIds.every(runIdValid) || new Set(value.recentRunIds).size !== value.recentRunIds.length
    || value.runs < value.recentRunIds.length || value.runs < value.recentRuns.length) return null;
  const recentRuns: EndlessRunRecord[] = [];
  for (const raw of value.recentRuns) {
    const record = parseRecord(raw);
    if (!record || !value.recentRunIds.includes(record.runId) || recentRuns.some(item => item.runId === record.runId)
      || record.clearedWaves > value.bestWave || record.score > value.bestScore || record.bestCombo > value.bestCombo) return null;
    recentRuns.push(record);
  }
  // Recover only this schema, never an old live GameState or campaign profile.
  return { game: 'viral-invasion', mode: 'endless', schemaVersion: ENDLESS_PROFILE_SCHEMA_VERSION,
    bestWave: value.bestWave, bestScore: value.bestScore, bestCombo: value.bestCombo, runs: value.runs,
    recentRuns, recentRunIds: [...value.recentRunIds] as string[] };
}

function defaultStorage(): EndlessProfileStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; } catch { return null; }
}

/** Independent, bounded challenge records. It never reads/writes the campaign profile key. */
export class EndlessProfileStore {
  private value = emptyEndlessProfile();
  private currentStatus: EndlessProfileStatus = { mode: 'session', code: 'unavailable', message: '连续挑战记录仅保留到本次页面关闭。' };
  private readonly storage: EndlessProfileStorage | null;
  constructor(storage?: EndlessProfileStorage | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(ENDLESS_PROFILE_STORAGE_KEY);
      this.currentStatus = { mode: 'persistent', code: 'empty', message: '连续挑战战绩将独立保存在此浏览器。' };
      if (raw !== null) {
        if (raw.length > 256_000) throw Error('Oversized challenge profile');
        const parsed: unknown = JSON.parse(raw);
        if (object(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== ENDLESS_PROFILE_SCHEMA_VERSION) {
          this.currentStatus = { mode: 'persistent', code: 'incompatible', message: '连续挑战旧战绩版本不兼容，已启用新记录。' };
        } else {
          const data = parseEndlessProfile(parsed);
          if (!data) throw Error('Malformed challenge profile');
          this.value = data;
          this.currentStatus = { mode: 'persistent', code: 'loaded', message: '连续挑战最高纪录和近期战绩已载入。' };
        }
      }
    } catch {
      this.currentStatus = { mode: 'persistent', code: 'corrupt', message: '连续挑战战绩无法读取，已安全启用新记录；本局仍可游玩。' };
    }
    const probe = `${ENDLESS_PROFILE_STORAGE_KEY}:probe`;
    try {
      this.storage.setItem(probe, 'endless');
      if (this.storage.getItem(probe) !== 'endless') throw Error('Storage discarded write');
      this.storage.removeItem(probe);
    } catch {
      try { this.storage.removeItem(probe); } catch { /* Unavailable storage may reject cleanup. */ }
      this.currentStatus = { mode: 'session', code: 'unavailable', message: '本地存储暂不可用，连续挑战记录仅保留到本次页面关闭。' };
    }
  }
  get data(): EndlessProfileData { return structuredClone(this.value); }
  get status(): EndlessProfileStatus { return { ...this.currentStatus }; }
  load(): EndlessProfileSnapshot { return { data: this.data, status: this.status }; }
  /** Retry after a quota/security failure without dropping in-memory earned records. */
  save(): EndlessProfileSnapshot { this.persist(); return this.load(); }
  private persist(): boolean {
    if (!this.storage) return false;
    try {
      const serialized = JSON.stringify(this.value);
      this.storage.setItem(ENDLESS_PROFILE_STORAGE_KEY, serialized);
      if (this.storage.getItem(ENDLESS_PROFILE_STORAGE_KEY) !== serialized) throw Error('Storage did not retain challenge record');
      this.currentStatus = { mode: 'persistent', code: 'saved', message: '连续挑战战绩已独立保存到此浏览器；清理浏览器数据可能丢失记录。' };
      return true;
    } catch {
      this.currentStatus = { mode: 'session', code: 'write-failed', message: '连续挑战保存失败，新增战绩暂存于本次页面；可恢复存储后重试保存。' };
      return false;
    }
  }
  recordRun(state: GameState, runId: string): EndlessRecordRunResult {
    if (!runIdValid(runId)) return { kind: 'rejected', reason: 'invalid-run-id' };
    if (!state.endless) return { kind: 'rejected', reason: 'not-endless' };
    if (state.phase !== 'result' || !state.result) return { kind: 'rejected', reason: 'run-not-ended' };
    if (this.value.recentRunIds.includes(runId)) {
      const record = this.value.recentRuns.find(item => item.runId === runId);
      return { kind: 'duplicate', ...(record ? { record: structuredClone(record) } : {}) };
    }
    const endless = state.endless;
    const record = parseRecord({ runId, seed: state.seed, waveReached: endless.wave, clearedWaves: endless.clearedWaves,
      score: endless.score, kills: endless.kills, bestCombo: endless.bestCombo, level: state.endlessGrowth?.level ?? 0,
      durationSeconds: state.elapsed, extracted: state.result.success, reason: state.result.reason });
    if (!record) return { kind: 'rejected', reason: 'invalid-result' };
    this.value.runs = safeAdd(this.value.runs, 1);
    this.value.bestWave = Math.max(this.value.bestWave, record.clearedWaves);
    this.value.bestScore = Math.max(this.value.bestScore, record.score);
    this.value.bestCombo = Math.max(this.value.bestCombo, record.bestCombo);
    this.value.recentRuns.unshift(record);
    this.value.recentRuns.length = Math.min(this.value.recentRuns.length, ENDLESS_RECENT_RUN_LIMIT);
    this.value.recentRunIds.push(runId);
    if (this.value.recentRunIds.length > ENDLESS_DEDUP_LIMIT) this.value.recentRunIds.splice(0, this.value.recentRunIds.length - ENDLESS_DEDUP_LIMIT);
    return { kind: 'recorded', record: structuredClone(record), persisted: this.persist() };
  }
}
