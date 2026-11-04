import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState } from '../../src/game/types';
import { createTerritoryState } from '../../src/game/territory';
import { ENDLESS_PROFILE_STORAGE_KEY, LEGACY_TERRITORY_PROFILE_STORAGE_KEY, TERRITORY_PROFILE_STORAGE_KEY, TerritoryProfileStore,
  DUAL_FRONT_PROFILE_STORAGE_KEY, GARRISON_PROFILE_STORAGE_KEY, emptyTerritoryProfile, parseTerritoryProfile, type EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { territoryLegacyMarkup } from '../../src/ui/territoryHud';

class Storage implements EndlessProfileStorage {
  items = new Map<string, string>(); writes: string[] = []; blocked = false; discard = false;
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); if (this.blocked) throw Error('quota'); if (!this.discard) this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}

/** Serialization fixture; no combat result is inferred from these supplied values. */
function fixture(success = true): GameState {
  const game = new GameSession(71, { mode: 'endless' }); game.start();
  const state = game.state;
  Object.assign(state.endless!, { wave: 8, clearedWaves: 7, score: 2200, kills: 60, bestCombo: 20 });
  state.elapsed = 200; state.tick = 12000; state.phase = success ? 'paused' : 'result';
  state.endlessGrowth!.level = 7;
  state.territory = createTerritoryState();
  state.territory.stage = success ? 'victory' : 'rescue';
  state.territory.campBuilt = success;
  if (success) state.territory.rescueSnapshot = { runId: state.growth!.runId, seed: state.seed, atTick: state.tick,
    elapsed: 200, wave: 8, clearedWaves: 7, score: 2200, kills: 60, bestCombo: 20, level: 7, playerHp: 73, coreHp: 88,
    fullyPurifiedSeconds: 20, longestFullyPurifiedSeconds: 12 };
  else state.result = { success: false, reason: '心核失守。' };
  Object.assign(state.territory.stability, { totalSeconds: 20, bestSeconds: 12, currentSeconds: 8 });
  return state;
}

describe('territory v3 dual-front rescue checkpoints', () => {
  it('shows valid v4 scores read-only and saves v5 runs without rewriting or mixing old scores', () => {
    const prior = new TerritoryProfileStore(null); prior.checkpoint(fixture());
    const old = { ...prior.data, schemaVersion: 4 }, bytes = JSON.stringify(old), storage = new Storage();
    storage.items.set(GARRISON_PROFILE_STORAGE_KEY, bytes);
    const store = new TerritoryProfileStore(storage), snapshot = store.load();
    expect(snapshot.previousGarrison).toEqual(old);
    expect(snapshot.data).toMatchObject({ schemaVersion: 5, runs: 0, bestScore: 0 });
    expect(territoryLegacyMarkup(snapshot)).toContain('旧规则v4');
    expect(territoryLegacyMarkup(snapshot)).toContain('2200分');
    store.checkpoint(fixture());
    expect(store.data.runs).toBe(1);
    expect(storage.items.get(GARRISON_PROFILE_STORAGE_KEY)).toBe(bytes);
    expect(storage.writes.every(key => key.startsWith(TERRITORY_PROFILE_STORAGE_KEY))).toBe(true);
    expect(parseTerritoryProfile(old)).toBeNull();
  });
  it('preserves the prior v3 profile bytes and starts v4 garrison results independently', () => {
    const storage = new Storage(), old = '{"schemaVersion":3,"runs":9,"bestScore":90000}';
    storage.items.set(DUAL_FRONT_PROFILE_STORAGE_KEY, old);
    const store = new TerritoryProfileStore(storage);
    expect(store.load().legacyAvailable).toBe(true); expect(store.data.runs).toBe(0);
    store.checkpoint(fixture());
    expect(storage.items.get(DUAL_FRONT_PROFILE_STORAGE_KEY)).toBe(old);
    expect(store.data.schemaVersion).toBe(5);
  });

  it('updates cumulative health time on the same run without changing the victory receipt', () => {
    const storage = new Storage(), store = new TerritoryProfileStore(storage), state = fixture();
    store.checkpoint(state); const receipt = structuredClone(state.territory!.rescueSnapshot);
    state.territory!.stage = 'guard'; state.elapsed = 300;
    Object.assign(state.territory!.stability, { totalSeconds: 45, bestSeconds: 25 });
    store.checkpoint(state); store.checkpoint(state);
    const loaded = new TerritoryProfileStore(storage);
    expect(loaded.data).toMatchObject({ runs: 1, rescues: 1 });
    expect(loaded.data.recentRuns[0]).toMatchObject({ fullyPurifiedSeconds: 45, longestFullyPurifiedSeconds: 25, rescue: { snapshot: receipt } });
  });
  it('keeps the previous five-region profile intact and starts a separate dual-front ranking', () => {
    const storage = new Storage();
    const legacy = JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 2, bestScore: 900000, runs: 40 });
    storage.items.set(LEGACY_TERRITORY_PROFILE_STORAGE_KEY, legacy);
    const store = new TerritoryProfileStore(storage);
    expect(store.load().legacyAvailable).toBe(true);
    expect(store.data).toMatchObject({ schemaVersion: 5, runs: 0, bestScore: 0 });
    expect(parseTerritoryProfile(JSON.parse(legacy))).toBeNull();
    expect(store.checkpoint(fixture())).toMatchObject({ kind: 'recorded', persisted: true });
    expect(storage.items.get(LEGACY_TERRITORY_PROFILE_STORAGE_KEY)).toBe(legacy);
    expect(storage.writes.every(key => key.startsWith(TERRITORY_PROFILE_STORAGE_KEY))).toBe(true);
    expect(new TerritoryProfileStore(storage).data).toMatchObject({ schemaVersion: 5, runs: 1, bestScore: 2200 });
  });
  it('starts independently and preserves the v1 file byte for byte', () => {
    const storage = new Storage(), legacy = '{"schemaVersion":1,"bestScore":999999}';
    storage.items.set(ENDLESS_PROFILE_STORAGE_KEY, legacy);
    const store = new TerritoryProfileStore(storage);
    expect(store.data).toEqual(emptyTerritoryProfile()); expect(store.load().legacyAvailable).toBe(true);
    expect(storage.items.get(ENDLESS_PROFILE_STORAGE_KEY)).toBe(legacy);
    expect(store.checkpoint(fixture())).toMatchObject({ kind: 'recorded', persisted: true });
    expect(storage.writes.every(key => key.startsWith(TERRITORY_PROFILE_STORAGE_KEY))).toBe(true);
    expect(storage.items.get(ENDLESS_PROFILE_STORAGE_KEY)).toBe(legacy);
    expect(store.data.bestScore).toBe(2200);
  });

  it('saves victory while still paused, round trips it and ignores repeated checkpoints', () => {
    const storage = new Storage(), store = new TerritoryProfileStore(storage), state = fixture();
    expect(store.recordRun(state)).toMatchObject({ kind: 'recorded', persisted: true });
    expect(state.phase).toBe('paused'); expect(state.result).toBeNull();
    expect(store.data).toMatchObject({ runs: 1, rescues: 1 });
    const writes = storage.writes.length, before = structuredClone(state);
    expect(store.checkpoint(state).kind).toBe('duplicate'); expect(storage.writes).toHaveLength(writes);
    const loaded = new TerritoryProfileStore(storage);
    expect(loaded.data).toEqual(store.data); expect(loaded.checkpoint(state).kind).toBe('duplicate');
    expect(state).toEqual(before);
  });

  it('keeps the rescue receipt unchanged when the same run continues then loses guard play', () => {
    const storage = new Storage(), store = new TerritoryProfileStore(storage), state = fixture();
    store.checkpoint(state); const saved = structuredClone(state.territory!.rescueSnapshot!);
    state.territory!.stage = 'guard'; state.phase = 'playing';
    expect(store.checkpoint(state)).toMatchObject({ kind: 'updated' });
    state.elapsed = 320; state.endless!.wave = 12; state.endless!.clearedWaves = 11;
    state.endless!.score = 5200; state.phase = 'result'; state.result = { success: false, reason: '守卫结束，已救援。' };
    expect(store.recordRun(state)).toMatchObject({ kind: 'updated', persisted: true });
    const data = store.data, record = data.recentRuns[0];
    expect(data).toMatchObject({ runs: 1, rescues: 1, bestWave: 11, bestScore: 5200 });
    expect(record.rescue).toEqual({ success: true, snapshot: saved });
    expect(record.guard).toMatchObject({ started: true, ended: true, durationSeconds: 120 });
    expect(record.extracted).toBe(true);
    expect(store.recordRun(state).kind).toBe('duplicate');
    expect(new TerritoryProfileStore(storage).data).toEqual(data);
  });

  it('retains the in-memory success on write failure and retries without counting a second run', () => {
    const storage = new Storage(), store = new TerritoryProfileStore(storage), state = fixture();
    storage.blocked = true;
    expect(store.checkpoint(state)).toMatchObject({ kind: 'recorded', persisted: false });
    expect(store.status.code).toBe('write-failed'); expect(store.data.rescues).toBe(1);
    storage.blocked = false;
    expect(store.checkpoint(state)).toMatchObject({ kind: 'duplicate', persisted: true });
    store.save(); expect(new TerritoryProfileStore(storage).data).toMatchObject({ runs: 1, rescues: 1 });
  });

  it('records an unsuccessful rescue separately and rejects unfinished or mismatched identities', () => {
    const store = new TerritoryProfileStore(null), state = fixture(false);
    state.phase = 'playing'; expect(store.checkpoint(state)).toMatchObject({ kind: 'rejected', reason: 'run-not-ended' });
    state.phase = 'result'; expect(store.recordRun(state)).toMatchObject({ kind: 'recorded', persisted: false });
    expect(store.data).toMatchObject({ runs: 1, rescues: 0 }); expect(store.data.recentRuns[0].rescue.success).toBe(false);
    expect(store.checkpoint(fixture(), 'another-run')).toMatchObject({ kind: 'rejected', reason: 'invalid-run-id' });
  });

  it('validates the immutable snapshot and rejects corrupted or cross-version profiles safely', () => {
    const storage = new Storage(), store = new TerritoryProfileStore(storage); store.checkpoint(fixture());
    const data = store.data, record = data.recentRuns[0];
    expect(parseTerritoryProfile(data)).toEqual(data);
    if (!record.rescue.success) throw Error('fixture missing receipt');
    record.rescue.snapshot.score = Infinity;
    expect(parseTerritoryProfile(data)).toBeNull();
    expect(store.data.recentRuns[0]).not.toEqual(record);
    for (const raw of ['{broken', JSON.stringify({ ...emptyTerritoryProfile(), schemaVersion: 1 })]) {
      storage.items.set(TERRITORY_PROFILE_STORAGE_KEY, raw);
      const recovered = new TerritoryProfileStore(storage);
      expect(recovered.data).toEqual(emptyTerritoryProfile()); expect(storage.items.get(TERRITORY_PROFILE_STORAGE_KEY)).toBe(raw);
    }
  });

  it('does not roll a finished guard record back when the original victory checkpoint is replayed', () => {
    const store = new TerritoryProfileStore(null), state = fixture(), original = structuredClone(state);
    store.checkpoint(state); state.territory!.stage = 'guard'; state.phase = 'result';
    state.result = { success: false, reason: '守卫失守，救援已保存。' }; state.elapsed = 300;
    state.endless!.score = 3300; store.checkpoint(state);
    store.checkpoint(original);
    expect(store.data).toMatchObject({ runs: 1, rescues: 1, bestScore: 3300 });
    expect(store.data.recentRuns[0]).toMatchObject({ ended: true, score: 3300, guard: { started: true, ended: true } });
  });
});
