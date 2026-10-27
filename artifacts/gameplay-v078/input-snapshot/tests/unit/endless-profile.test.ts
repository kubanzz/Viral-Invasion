import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState } from '../../src/game/types';
import { PROFILE_STORAGE_KEY } from '../../src/meta/profile';
import { ENDLESS_DEDUP_LIMIT, ENDLESS_PROFILE_STORAGE_KEY, ENDLESS_RECENT_RUN_LIMIT, emptyEndlessProfile, EndlessProfileStore, parseEndlessProfile, type EndlessProfileStorage } from '../../src/meta/endlessProfile';

class MemoryStorage implements EndlessProfileStorage {
  readonly items = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  rejectRead = false;
  rejectWrite = false;
  ignoreWrite = false;
  getItem(key: string): string | null { this.reads.push(key); if (this.rejectRead) throw Error('SecurityError'); return this.items.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes.push(key); if (this.rejectWrite) throw Error('QuotaExceededError'); if (!this.ignoreWrite) this.items.set(key, value); }
  removeItem(key: string): void { this.items.delete(key); }
}

/** Serialization fixture only; live combat is covered by the integration suite. */
function ended(extracted = false): GameState {
  const session = new GameSession(919, { mode: 'endless' }); session.start();
  Object.assign(session.state.endless!, { wave: 7, clearedWaves: 6, score: 440, kills: 34, bestCombo: 11 });
  session.state.endlessGrowth!.level = 6; session.state.elapsed = 122.75;
  session.finish(extracted, extracted ? '主动撤离。' : '耐久耗尽。');
  return session.state;
}

describe('independent endless records', () => {
  it('probes storage without creating a profile or touching campaign data', () => {
    const storage = new MemoryStorage(); storage.items.set(PROFILE_STORAGE_KEY, '{campaign unchanged}');
    const store = new EndlessProfileStore(storage);
    expect(store.data).toEqual(emptyEndlessProfile()); expect(store.status.code).toBe('empty');
    expect(storage.items.size).toBe(1); expect(storage.items.get(PROFILE_STORAGE_KEY)).toBe('{campaign unchanged}');
    expect(storage.reads.every(key => key.startsWith(ENDLESS_PROFILE_STORAGE_KEY))).toBe(true);
    expect(storage.writes).toEqual([`${ENDLESS_PROFILE_STORAGE_KEY}:probe`]);
  });

  it('saves completed-wave records and round trips independently from the campaign', () => {
    const storage = new MemoryStorage(), store = new EndlessProfileStore(storage), state = ended(true);
    storage.items.set(PROFILE_STORAGE_KEY, '{campaign unchanged}');
    expect(store.recordRun(state, 'run-a')).toMatchObject({ kind: 'recorded', persisted: true });
    expect(store.data).toMatchObject({ runs: 1, bestWave: 6, bestScore: 440, bestCombo: 11 });
    expect(store.data.recentRuns[0]).toMatchObject({ waveReached: 7, clearedWaves: 6, extracted: true, durationSeconds: 122.75, level: 6 });
    const loaded = new EndlessProfileStore(storage);
    expect(loaded.status.code).toBe('loaded'); expect(loaded.data).toEqual(store.data);
    expect(storage.items.get(PROFILE_STORAGE_KEY)).toBe('{campaign unchanged}');
    const json = storage.items.get(ENDLESS_PROFILE_STORAGE_KEY)!;
    expect(json).not.toContain('player'); expect(json).not.toContain('targets'); expect(json).not.toContain('cooldowns');
  });

  it('rejects active or campaign runs and malformed result values without writes', () => {
    const storage = new MemoryStorage(), store = new EndlessProfileStore(storage), state = ended();
    const writes = storage.writes.length;
    state.phase = 'playing'; expect(store.recordRun(state, 'active')).toMatchObject({ reason: 'run-not-ended' });
    state.phase = 'result';
    expect(store.recordRun(state, ' bad')).toMatchObject({ reason: 'invalid-run-id' });
    state.endless!.score = Infinity; expect(store.recordRun(state, 'nonfinite')).toMatchObject({ reason: 'invalid-result' });
    state.endless!.score = 440; delete state.endless;
    expect(store.recordRun(state, 'campaign')).toMatchObject({ reason: 'not-endless' });
    expect(store.data.runs).toBe(0); expect(storage.writes.length).toBe(writes);
  });

  it('deduplicates current and restored settlements without mutating the original result', () => {
    const storage = new MemoryStorage(), store = new EndlessProfileStore(storage), state = ended();
    const before = structuredClone(state);
    const first = store.recordRun(state, 'once');
    if (first.kind !== 'recorded') throw Error('Expected a recorded fixture');
    first.record.score = 999999;
    const loaded = new EndlessProfileStore(storage), writes = storage.writes.length;
    expect(loaded.recordRun(state, 'once').kind).toBe('duplicate');
    expect(loaded.data.runs).toBe(1); expect(loaded.data.bestScore).toBe(440);
    expect(storage.writes.length).toBe(writes); expect(state).toEqual(before);
  });

  it('retains earned session records during storage failure and retries saving later', () => {
    const storage = new MemoryStorage(), store = new EndlessProfileStore(storage);
    storage.rejectWrite = true;
    expect(store.recordRun(ended(), 'quota')).toMatchObject({ kind: 'recorded', persisted: false });
    expect(store.status).toMatchObject({ mode: 'session', code: 'write-failed' });
    expect(store.data.runs).toBe(1);
    storage.rejectWrite = false; store.save();
    expect(store.status).toMatchObject({ mode: 'persistent', code: 'saved' });
    expect(new EndlessProfileStore(storage).data.runs).toBe(1);
  });

  it('detects silently discarded writes and unavailable localStorage', () => {
    const storage = new MemoryStorage(); storage.ignoreWrite = true;
    const store = new EndlessProfileStore(storage);
    expect(store.status).toMatchObject({ mode: 'session', code: 'unavailable' });
    expect(store.recordRun(ended(), 'discarded')).toMatchObject({ kind: 'recorded', persisted: false });
    expect(store.status.code).toBe('write-failed');
    const sessionOnly = new EndlessProfileStore(null);
    expect(sessionOnly.recordRun(ended(), 'session')).toMatchObject({ kind: 'recorded', persisted: false });
    expect(sessionOnly.data.runs).toBe(1); expect(sessionOnly.status.mode).toBe('session');
  });

  it.each(['{broken', 'null', '[]', '{}', JSON.stringify({ ...emptyEndlessProfile(), mode: 'campaign' }), JSON.stringify({ ...emptyEndlessProfile(), bestScore: -1 })])('recovers malformed records in memory without overwriting their source: %s', raw => {
    const storage = new MemoryStorage(); storage.items.set(ENDLESS_PROFILE_STORAGE_KEY, raw);
    const store = new EndlessProfileStore(storage);
    expect(store.status.code).toBe('corrupt'); expect(store.data).toEqual(emptyEndlessProfile());
    expect(storage.items.get(ENDLESS_PROFILE_STORAGE_KEY)).toBe(raw);
    expect(store.recordRun(ended(), 'recovered').kind).toBe('recorded');
    expect(new EndlessProfileStore(storage).data.runs).toBe(1);
  });

  it('does not import incompatible versions or unrelated live-state fields', () => {
    const storage = new MemoryStorage(), incompatible = JSON.stringify({ ...emptyEndlessProfile(), schemaVersion: 2 });
    storage.items.set(ENDLESS_PROFILE_STORAGE_KEY, incompatible);
    expect(new EndlessProfileStore(storage).status.code).toBe('incompatible');
    expect(storage.items.get(ENDLESS_PROFILE_STORAGE_KEY)).toBe(incompatible);
    const parsed = parseEndlessProfile({ ...emptyEndlessProfile(), player: { hp: 999 }, settings: { sound: false } });
    expect(parsed).toEqual(emptyEndlessProfile());
  });

  it('bounds recent results and duplicate IDs while preserving lifetime highs and run count', () => {
    const storage = new MemoryStorage(), store = new EndlessProfileStore(storage), state = ended();
    for (let i = 0; i < ENDLESS_DEDUP_LIMIT + 3; i++) store.recordRun(state, `bounded-${i}`);
    const data = store.data;
    expect(data.runs).toBe(ENDLESS_DEDUP_LIMIT + 3); expect(data.bestWave).toBe(6);
    expect(data.recentRuns).toHaveLength(ENDLESS_RECENT_RUN_LIMIT); expect(data.recentRunIds).toHaveLength(ENDLESS_DEDUP_LIMIT);
    expect(data.recentRunIds).not.toContain('bounded-0');
    expect(new EndlessProfileStore(storage).data).toEqual(data);
    expect(new EndlessProfileStore(storage).recordRun(state, `bounded-${ENDLESS_DEDUP_LIMIT + 2}`).kind).toBe('duplicate');
  });

  it('validates nested records, their highs and identity membership, and returns isolated snapshots', () => {
    const store = new EndlessProfileStore(null); store.recordRun(ended(), 'safe');
    const data = store.data;
    for (const bad of [
      { ...data, recentRunIds: ['safe', 'safe'] },
      { ...data, recentRunIds: [] },
      { ...data, recentRuns: [{ ...data.recentRuns[0], durationSeconds: NaN }] },
      { ...data, recentRuns: [{ ...data.recentRuns[0], seed: 0x100000000 }] },
      { ...data, bestWave: 5 },
      { ...data, bestScore: 1 },
    ]) expect(parseEndlessProfile(bad)).toBeNull();
    data.recentRuns[0].score = 123456; data.recentRunIds.push('injected');
    const snapshot = store.load(); snapshot.status.message = 'changed'; snapshot.data.runs = 888;
    expect(store.data.runs).toBe(1); expect(store.data.recentRuns[0].score).toBe(440);
    expect(store.status.message).not.toBe('changed');
  });
});
