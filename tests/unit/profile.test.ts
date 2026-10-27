import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState } from '../../src/game/types';
import { buildRunSummary, emptyProfile, ProfileStore, PROFILE_STORAGE_KEY, type ProfileStorage } from '../../src/meta/profile';
import { newRunOptions, replayRunOptions } from '../../src/meta/runOptions';

class MemoryStorage implements ProfileStorage {
  readonly items = new Map<string, string>();
  writes = 0;
  rejectRead = false;
  rejectWrite = false;
  ignoreWrite = false;
  getItem(key: string): string | null { if (this.rejectRead) throw new Error('SecurityError'); return this.items.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.rejectWrite) throw new Error('QuotaExceededError'); if (!this.ignoreWrite) this.items.set(key, value); this.writes++; }
  removeItem(key: string): void { this.items.delete(key); }
}
/** Result fixtures exercise serialization only; they are not complete gameplay evidence. */
function result(success = false, seed = 9102, elapsed = 90): GameState {
  const session = new GameSession(seed, { campaign: true, milestone: 'G3' }); session.start();
  session.state.elapsed = elapsed; session.state.tick = Math.round(elapsed * 60);
  session.finish(success, success ? '完整复测通过。' : '救援行动结束。');
  return session.state;
}

describe('G4 local profile repository', () => {
  it('probes actual read/write availability without writing an empty profile or leaving probe keys', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    expect(store.data).toEqual(emptyProfile()); expect(store.status.code).toBe('empty');
    expect(store.status.mode).toBe('persistent'); expect(storage.items.size).toBe(0); expect(storage.writes).toBe(1);
    expect(store.load()).toEqual({ data: store.data, status: store.status });
  });

  it('loads a schema-1 archive with two discovered traits without assuming its migration guide was read', () => {
    const storage = new MemoryStorage(), previous = new ProfileStore(storage), state = result(true, 0);
    state.battle!.traits = ['CARAPACE', 'FISSION'];
    previous.updateSettings({ sound: false }); previous.recordRun(state, 'legacy-run');
    const { onboarding: omitted, ...legacy } = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!);
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify(legacy));
    const loaded = new ProfileStore(storage);
    expect(loaded.status.code).toBe('loaded');
    expect(loaded.data.discoveredTraits).toEqual(['CARAPACE', 'FISSION']);
    expect(loaded.data.stats.runs).toBe(1); expect(loaded.data.recentRuns[0].seed).toBe(0);
    expect(loaded.data.settings.sound).toBe(false);
    expect(loaded.data.onboarding.migrationGuideAcknowledged).toBe(false);
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!).onboarding).toBeUndefined();
    loaded.updateSettings({ lowEffects: true });
    expect(new ProfileStore(storage).data.onboarding.migrationGuideAcknowledged).toBe(false);
  });

  it('persists only an explicit migration-guide acknowledgement, once, independently of run discoveries', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage), state = result();
    state.battle!.traits = ['CARAPACE', 'FISSION'];
    store.recordRun(state, 'unacknowledged-guide');
    expect(new ProfileStore(storage).data.onboarding.migrationGuideAcknowledged).toBe(false);
    const before = store.data, writes = storage.writes;
    store.acknowledgeMigrationGuide();
    expect(storage.writes).toBe(writes + 1);
    const loaded = new ProfileStore(storage);
    expect(loaded.data).toEqual({ ...before, onboarding: { ...before.onboarding, migrationGuideAcknowledged: true } });
    const afterProbe = storage.writes;
    loaded.acknowledgeMigrationGuide();
    expect(storage.writes).toBe(afterProbe);
    expect(loaded.data.stats.runs).toBe(1);
  });

  it('defaults an older empty onboarding object to unread while ignoring unknown presentation fields', () => {
    const storage = new MemoryStorage();
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), onboarding: { unrelatedHint: true } }));
    const store = new ProfileStore(storage);
    expect(store.status.code).toBe('loaded');
    expect(store.data.onboarding).toEqual({ migrationGuideAcknowledged: false, counterGuideVersion: 0, counterGuideCompleted: false, counterGuideSkipped: false });
  });

  it.each([null, [], true, { migrationGuideAcknowledged: 'true' }])('does not infer acknowledgement from malformed onboarding data: %s', onboarding => {
    const storage = new MemoryStorage(); storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), onboarding }));
    const store = new ProfileStore(storage);
    expect(store.status.code).toBe('corrupt');
    expect(store.data.onboarding.migrationGuideAcknowledged).toBe(false);
  });

  it('keeps an acknowledgement only for the current session if its storage write fails', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    store.recordRun(result(), 'before-storage-failure');
    storage.rejectWrite = true;
    store.acknowledgeMigrationGuide();
    expect(store.status.code).toBe('write-failed'); expect(store.status.mode).toBe('session');
    expect(store.data.onboarding.migrationGuideAcknowledged).toBe(true);
    expect(store.data.stats.runs).toBe(1);
    storage.rejectWrite = false;
    const reloaded = new ProfileStore(storage);
    expect(reloaded.data.onboarding.migrationGuideAcknowledged).toBe(false);
    expect(reloaded.data.stats.runs).toBe(1);
  });

  it('round-trips discovered traits, observed weaknesses, protocols, settings and compact results', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage), state = result(true, 0, 122);
    state.battle!.traits = ['CARAPACE', 'FISSION']; state.battle!.defeatedTraits = ['CARAPACE'];
    state.growth!.rewardedKeys.push('diagnose:FISSION');
    state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'focused' }];
    state.growth!.protocolHistory.push({ at: 35, type: 'PROTOCOL_EQUIPPED', text: '异常显影：异常显影 · 均衡。' });
    state.events.push({ type: 'PROTOCOL_EQUIPPED', tick: 42, data: { protocolId: 'IMMUNE_BEACON' } });
    state.battle!.stats.sourceClears = 2;
    store.updateSettings({ sound: false, lowEffects: true });
    expect(store.recordRun(state, 'browser-run-a').kind).toBe('recorded');
    const reloaded = new ProfileStore(storage);
    expect(reloaded.status.code).toBe('loaded'); expect(reloaded.data).toEqual(store.data);
    expect(reloaded.data.discoveredTraits).toEqual(['CARAPACE', 'FISSION']);
    expect(reloaded.data.discoveredWeaknesses).toEqual(['FISSION', 'CARAPACE']);
    expect(reloaded.data.unlockedProtocols).toEqual(['PULSE_BREAK', 'IMMUNE_BEACON', 'EXPOSE_TRACE']);
    expect(reloaded.data.settings).toEqual({ sound: false, lowEffects: true });
    expect(reloaded.data.recentRuns[0].seed).toBe(0);
    const serialized = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!);
    expect(serialized.game).toBe('viral-invasion'); expect(serialized.schemaVersion).toBe(1);
    expect(serialized.player).toBeUndefined(); expect(serialized.tissue).toBeUndefined(); expect(serialized.growth).toBeUndefined();
    expect(serialized.recentRuns[0].hp).toBeUndefined(); expect(serialized.recentRuns[0].xp).toBeUndefined();
  });

  it.each(['{broken', 'null', '[]', '{}', '{"game":"other-game","schemaVersion":1}', JSON.stringify({ ...emptyProfile(), stats: { runs: -2 } })])('safely replaces malformed JSON/schema in memory and explains the fallback: %s', raw => {
    const storage = new MemoryStorage(); storage.items.set(PROFILE_STORAGE_KEY, raw);
    const store = new ProfileStore(storage);
    expect(store.status.code).toBe('corrupt'); expect(store.status.message).toContain('损坏'); expect(store.data).toEqual(emptyProfile());
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(raw);
    expect(store.recordRun(result(), 'recovered').kind).toBe('recorded');
    expect(new ProfileStore(storage).data.stats.runs).toBe(1);
  });

  it.each([0, 2, 99])('does not import incompatible schema version %i or prevent a new run', schemaVersion => {
    const storage = new MemoryStorage(), raw = JSON.stringify({ ...emptyProfile(), schemaVersion }); storage.items.set(PROFILE_STORAGE_KEY, raw);
    const store = new ProfileStore(storage);
    expect(store.status.code).toBe('incompatible'); expect(store.data.stats.runs).toBe(0); expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(raw);
    expect(store.recordRun(result(), `schema-${schemaVersion}`).kind).toBe('recorded');
  });

  it('validates nested records and rejects inconsistent duplicate ledgers', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    store.recordRun(result(), 'valid');
    const original = store.data;
    for (const damaged of [
      { ...original, recentRuns: [{ ...original.recentRuns[0], seed: -1 }] },
      { ...original, recentRuns: [{ ...original.recentRuns[0], stats: { ...original.recentRuns[0].stats, kills: 'many' } }] },
      { ...original, recordedRunIds: ['valid', 'valid'] },
      { ...original, discoveredWeaknesses: ['MIMIC'] },
      { ...original, recentRuns: [{ ...original.recentRuns[0], timeline: [{ at: 4, side: 'invalid', text: 'bad' }] }] },
    ]) {
      storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify(damaged));
      expect(new ProfileStore(storage).status.code).toBe('corrupt');
    }
  });

  it('constructs a whitelist from valid JSON and never imports arbitrary current-run fields', () => {
    const storage = new MemoryStorage();
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), player: { hp: 999 }, growth: { xp: 999 }, settings: { sound: true, lowEffects: false, damage: 999 } }));
    const store = new ProfileStore(storage);
    expect(store.status.code).toBe('loaded'); expect(Object.keys(store.data)).toEqual(Object.keys(emptyProfile()));
    expect(store.data.settings).toEqual({ sound: true, lowEffects: false });
    store.updateSettings({ lowEffects: true });
    expect(storage.getItem(PROFILE_STORAGE_KEY)).not.toContain('999');
  });

  it('keeps session records when storage is missing, unreadable, read-only or silently discards writes', () => {
    const readBlocked = new MemoryStorage(); readBlocked.rejectRead = true;
    const writeBlocked = new MemoryStorage(); writeBlocked.rejectWrite = true;
    const silent = new MemoryStorage(); silent.ignoreWrite = true;
    for (const storage of [null, readBlocked, writeBlocked, silent]) {
      const store = new ProfileStore(storage);
      expect(store.status.mode).toBe('session'); expect(store.status.code).toBe('unavailable'); expect(store.status.message).toContain('关闭');
      const recorded = store.recordRun(result(), 'memory-only');
      expect(recorded.kind).toBe('recorded'); if (recorded.kind === 'recorded') expect(recorded.persisted).toBe(false);
      expect(store.load().data.stats.runs).toBe(1); expect(store.recordRun(result(), 'memory-only').kind).toBe('duplicate');
    }
  });

  it('retains readable history in session mode when only writing is blocked', () => {
    const storage = new MemoryStorage(), first = new ProfileStore(storage); first.recordRun(result(true), 'existing');
    storage.rejectWrite = true;
    const store = new ProfileStore(storage);
    expect(store.status.mode).toBe('session'); expect(store.data.stats.wins).toBe(1);
    store.recordRun(result(), 'new-memory'); expect(store.data.stats.runs).toBe(2);
  });

  it('falls back after a later quota error without losing the just-earned result or duplicating it', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    storage.rejectWrite = true;
    const recorded = store.recordRun(result(true), 'quota-run');
    expect(recorded.kind).toBe('recorded'); if (recorded.kind === 'recorded') expect(recorded.persisted).toBe(false);
    expect(store.status.code).toBe('write-failed'); expect(store.data.stats.wins).toBe(1);
    expect(store.recordRun(result(true), 'quota-run').kind).toBe('duplicate');
    store.updateSettings({ sound: false }); expect(store.load().data.settings.sound).toBe(false);
    expect(store.load().data.stats.runs).toBe(1);
  });

  it('records a success and failure once each across repeated result confirmation and reload', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    expect(store.recordRun(result(true), 'win').kind).toBe('recorded');
    const afterWinWrites = storage.writes;
    expect(store.recordRun(result(true), 'win').kind).toBe('duplicate'); expect(storage.writes).toBe(afterWinWrites);
    expect(store.recordRun(result(false), 'loss').kind).toBe('recorded');
    const refreshed = new ProfileStore(storage);
    expect(refreshed.recordRun(result(true), 'win').kind).toBe('duplicate'); expect(refreshed.recordRun(result(false), 'loss').kind).toBe('duplicate');
    expect(refreshed.data.stats).toMatchObject({ runs: 2, wins: 1, losses: 1 });
  });

  it('retains only ten visible records while older IDs remain protected from duplicate rewards', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    for (let index = 0; index < 14; index++) store.recordRun(result(index % 2 === 0, index, 100 + index), `run-${index}`);
    expect(store.data.recentRuns).toHaveLength(10); expect(store.data.recentRuns.map(run => run.runId)).toEqual(Array.from({ length: 10 }, (_, index) => `run-${13 - index}`));
    const restored = new ProfileStore(storage);
    expect(restored.recordRun(result(true, 0), 'run-0').kind).toBe('duplicate'); expect(restored.data.stats.runs).toBe(14);
    expect(restored.data.best.fastestVictory).toMatchObject({ runId: 'run-0', durationSeconds: 100, seed: 0 });
  });

  it('rejects unfinished/invalid identities and protects internal data from snapshot mutation', () => {
    const store = new ProfileStore(null), session = new GameSession(42); session.start();
    expect(store.recordRun(session.state, 'active')).toEqual({ kind: 'rejected', reason: 'run-not-ended' });
    expect(store.recordRun(result(), '')).toEqual({ kind: 'rejected', reason: 'invalid-run-id' });
    expect(store.recordRun(result(), '  ')).toEqual({ kind: 'rejected', reason: 'invalid-run-id' });
    const snapshot = store.load(); snapshot.data.settings.sound = false; snapshot.data.recordedRunIds.push('fake'); snapshot.status.code = 'saved';
    expect(store.data).toEqual(emptyProfile()); expect(store.status.code).toBe('unavailable');
  });

  it('unlocks achievements only from observed outcomes and never twice', () => {
    const store = new ProfileStore(null), first = result();
    first.battle!.traits = ['CARAPACE', 'FISSION']; first.battle!.stats.sourceClears = 3;
    first.campaign!.core.status = 'cleared'; first.campaign!.stats.travels = 1;
    first.campaign!.migration.choice = 'pursue'; first.campaign!.migration.interceptSucceeded = true;
    first.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'focused' }, { id: 'EXPOSE_TRACE', tuning: 'extended' }];
    const firstAward = store.recordRun(first, 'achieve-1');
    expect(firstAward.kind).toBe('recorded'); if (firstAward.kind === 'recorded') expect(firstAward.newAchievements).toEqual(['FIRST_SOURCE', 'CORE_PURIFIED', 'TWO_ORGANS', 'INTERCEPTOR', 'THREE_PROTOCOLS']);
    expect(store.data.achievements).not.toContain('FIRST_VICTORY'); expect(store.data.discoveredWeaknesses).toEqual([]);
    const second = result(true); second.battle!.traits = ['MIMIC'];
    const nextAward = store.recordRun(second, 'achieve-2');
    if (nextAward.kind === 'recorded') expect(nextAward.newAchievements).toEqual(['FIRST_VICTORY', 'TRAIT_RESEARCHER']);
    const repeated = store.recordRun(second, 'achieve-3'); if (repeated.kind === 'recorded') expect(repeated.newAchievements).toEqual([]);
  });

  it('keeps fastest success independently of a longer failure and does not mutate gameplay', () => {
    const store = new ProfileStore(null), state = result(true, 444, 140), before = structuredClone(state);
    state.battle!.stats.kills = 20; const changed = structuredClone(state);
    store.recordRun(state, 'first'); expect(state).toEqual(changed);
    store.recordRun(result(false, 222, 2000), 'long-failure'); store.recordRun(result(true, 333, 120), 'fast-win');
    expect(store.data.best).toEqual({ fastestVictory: { runId: 'fast-win', seed: 333, durationSeconds: 120, encounter: buildRunSummary(result(true, 333, 120)).encounter }, mostKills: 20, mostSources: 0, longestRunSeconds: 2000 });
    const newRun = new GameSession(444, { campaign: true, milestone: 'G3' }); newRun.start();
    expect(newRun.state.player.hp).toBe(before.player.hp); expect(newRun.state.growth!.xp).toBe(0); expect(newRun.state.growth!.equipped).toEqual([]);
  });
});

describe('versioned counter onboarding and run replay', () => {
  it('does not infer first-counter mastery from old discoveries or the migration acknowledgement', () => {
    const storage = new MemoryStorage();
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), discoveredTraits: ['CARAPACE'], onboarding: { migrationGuideAcknowledged: true } }));
    const store = new ProfileStore(storage);
    expect(store.data.onboarding).toEqual({ migrationGuideAcknowledged: true, counterGuideVersion: 0, counterGuideCompleted: false, counterGuideSkipped: false });
    expect(newRunOptions(store.data)).toEqual({ counterGuide: 'guided', encounterMode: 'formal', firstTrait: undefined });
  });

  it('persists skipped and subsequently completed independently and idempotently', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    const before = storage.writes;
    store.acknowledgeCounterGuide('skipped'); store.acknowledgeCounterGuide('skipped');
    expect(storage.writes).toBe(before + 1);
    expect(store.data.onboarding).toMatchObject({ counterGuideVersion: 1, counterGuideCompleted: false, counterGuideSkipped: true, migrationGuideAcknowledged: false });
    store.acknowledgeCounterGuide('completed'); store.acknowledgeCounterGuide('completed');
    expect(storage.writes).toBe(before + 2);
    const loaded = new ProfileStore(storage);
    expect(loaded.data.onboarding).toMatchObject({ counterGuideCompleted: true, counterGuideSkipped: true });
    expect(newRunOptions(loaded.data).counterGuide).toBe('adaptive');
    expect(loaded.data.stats.runs).toBe(0); expect(loaded.data.achievements).toEqual([]);
  });

  it('requires a new acknowledgement for a different counter-guide version without resetting migration', () => {
    const storage = new MemoryStorage();
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), onboarding: { migrationGuideAcknowledged: true, counterGuideVersion: 0, counterGuideCompleted: true, counterGuideSkipped: true } }));
    const store = new ProfileStore(storage);
    expect(newRunOptions(store.data).counterGuide).toBe('guided');
    store.acknowledgeCounterGuide('skipped');
    expect(store.data.onboarding).toEqual({ migrationGuideAcknowledged: true, counterGuideVersion: 1, counterGuideCompleted: false, counterGuideSkipped: true });
  });

  it('keeps the acknowledgement in session memory when saving fails', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    storage.rejectWrite = true; store.acknowledgeCounterGuide('completed');
    expect(store.status.code).toBe('write-failed'); expect(newRunOptions(store.data).counterGuide).toBe('adaptive');
    storage.rejectWrite = false;
    expect(newRunOptions(new ProfileStore(storage).data).counterGuide).toBe('guided');
  });

  it('skips only hints, preserves a paused run, and retries the same variant after a profile acknowledgement', () => {
    const store = new ProfileStore(null), session = new GameSession(27, { campaign: true, milestone: 'G3', ...newRunOptions(store.data) });
    session.start(); session.pause();
    const before = session.snapshot();
    session.bus.on('event', event => { if (event.type === 'COUNTER_GUIDE_SKIPPED') store.acknowledgeCounterGuide('skipped'); });
    expect(session.skipCounterGuide()).toBe(true); expect(session.skipCounterGuide()).toBe(false);
    const after = session.snapshot();
    expect(after.phase).toBe('paused'); expect(after.tick).toBe(before.tick); expect(after.elapsed).toBe(before.elapsed);
    for (const key of ['player', 'targets', 'tissue', 'growth', 'campaign'] as const) expect(after[key]).toEqual(before[key]);
    session.restart(); expect(session.state.battle!.encounter!.guideVariant).toBe('guided');
    expect(session.state.battle!.encounter!.firstCounter.guideStatus).toBe('active');
    session.start(28, newRunOptions(store.data)); expect(session.state.battle!.encounter!.guideVariant).toBe('adaptive');
    expect(session.state.events[0].data).toMatchObject({ encounterConfig: 'campaign-1', counterGuide: 'adaptive', firstTraitOverride: '' });
  });

  it('round-trips real configuration separately from HP, build and onboarding outcomes', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage);
    const session = new GameSession(27, { campaign: true, milestone: 'G3', firstTrait: 'MIMIC' }); session.start();
    session.finish(false, 'serialization fixture'); store.recordRun(session.state, 'override-run');
    const record = new ProfileStore(storage).data.recentRuns[0];
    expect(record.encounter).toEqual({ configId: 'campaign-1', guideVariant: 'adaptive', firstTraitOverride: 'MIMIC', guideCompleted: false, guideSkipped: false });
    const replay = new GameSession(record.seed, { campaign: true, milestone: 'G3', ...replayRunOptions(record.encounter!) }); replay.start();
    expect(replay.state.battle!.forcedFirstTrait).toBe('MIMIC'); expect(replay.state.battle!.encounter!.guideVariant).toBe('adaptive');
    expect(replay.state.growth!.equipped).toEqual([]); expect(replay.state.player.hp).toBe(100);
    // Starting a normal case explicitly clears the preceding archive override.
    replay.start(28, newRunOptions(emptyProfile())); expect(replay.state.battle!.forcedFirstTrait).toBeUndefined();
    expect(replay.state.battle!.firstTrait).toBe('CARAPACE');
    expect(replayRunOptions(record.encounter!, 'FISSION').firstTrait).toBe('FISSION');
  });

  it('preserves the best case configuration after it leaves the ten recent cases', () => {
    const storage = new MemoryStorage(), store = new ProfileStore(storage), best = result(true, 77, 40);
    best.battle!.forcedFirstTrait = 'CARAPACE';
    store.recordRun(best, 'best-guided');
    for (let index = 0; index < 12; index++) store.recordRun(result(false, index, 80), `later-${index}`);
    const loaded = new ProfileStore(storage), record = loaded.data.best.fastestVictory!;
    expect(loaded.data.recentRuns.some(run => run.runId === 'best-guided')).toBe(false);
    expect(record.encounter).toEqual(buildRunSummary(best).encounter);
    expect(replayRunOptions(record.encounter!)).toEqual({ counterGuide: 'guided', encounterMode: 'formal', firstTrait: 'CARAPACE' });
  });

  it.each([{ counterGuideVersion: -1 }, { counterGuideCompleted: 'true' }, { counterGuideSkipped: 1 }])('rejects malformed counter onboarding: %s', patch => {
    const storage = new MemoryStorage();
    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyProfile(), onboarding: { ...emptyProfile().onboarding, ...patch } }));
    expect(new ProfileStore(storage).status.code).toBe('corrupt');
  });
});

describe('G4 deterministic result explanation', () => {
  it('builds a sorted two-sided evolution route and preserves the real seed', () => {
    const state = result(true, 123456);
    state.battle!.history = [{ at: 22, text: '◇ 晶壳已出现。弱点：绕后射击。' }, { at: 14, text: '变异预警 · 晶壳。' }];
    state.growth!.protocolHistory = [{ at: 31, type: 'PROTOCOL_EQUIPPED', text: '连锁净化：连锁净化 · 均衡。' }];
    state.campaign!.history = [{ at: 40, text: '追击迁移群。' }];
    const summary = buildRunSummary(state);
    expect(summary.seed).toBe(123456); expect(summary.timeline.map(entry => entry.at)).toEqual([14, 22, 31, 40]);
    expect(summary.timeline.map(entry => entry.side)).toEqual(['virus', 'virus', 'antibody', 'campaign']);
    expect(buildRunSummary(structuredClone(state))).toEqual(summary);
  });

  it('changes advice with actual death cause, migration decisions and environmental actions', () => {
    const state = result(); state.player.hp = 0; state.dashes = 4;
    expect(buildRunSummary(state)).toMatchObject({ suggestionEvidence: '本局救援体耐久耗尽，使用冲刺 4 次。' });
    state.player.hp = 50; state.campaign!.migration.choice = 'ignore';
    expect(buildRunSummary(state).suggestionEvidence).toContain('放任迁移');
    state.campaign!.migration.choice = 'pursue'; state.campaign!.migration.interceptSucceeded = false;
    expect(buildRunSummary(state).suggestion).toContain('拦截倒数');
    state.campaign!.migration.interceptSucceeded = true; state.battle!.traits = ['CARAPACE'];
    expect(buildRunSummary(state).suggestionEvidence).toContain('冲流使用次数为 0');
    state.battle!.stats.pulses = 1; state.scans = 0;
    expect(buildRunSummary(state).suggestionEvidence).toContain('没有使用 Q');
  });
});
