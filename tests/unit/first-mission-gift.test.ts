import { describe, expect, it } from 'vitest';
import { CampProfileStore, CAMP_PROFILE_STORAGE_KEY, emptyCampProfile, FIRST_MISSION_GIFT_COINS, parseCampProfile, PREVIOUS_COMBAT_PROFILE_STORAGE_KEY } from '../../src/meta/campProfile';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { emptyMissionHaul } from '../../src/game/microfront';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { firstMissionGiftOverlay } from '../../src/ui/firstMissionGift';

class Storage implements EndlessProfileStorage {
  values = new Map<string, string>(); blocked = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function fixture(legacy = false) {
  const data = { ...emptyCampProfile(), campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
    prologue: 'ready' as const, builtFacilities: [...INTRO_FACILITY_IDS], coins: 217, materials: 83, pity: 47 };
  const source: Record<string, unknown> = structuredClone(data);
  if (legacy) delete source.firstMissionGift;
  const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(source));
  return { data, storage, store: new CampProfileStore(storage) };
}
describe('one-time first mission experience gift', () => {
  it('keeps new players locked through reload, failure and withdrawal, then unlocks on the first mission success', () => {
    const { storage, store } = fixture();
    expect(new CampProfileStore(storage).data.firstMissionGift).toBe('locked');
    expect(store.claimFirstMissionGift()).toMatchObject({ accepted: false, code: 'locked' });
    for (const outcome of ['failure', 'withdrawn'] as const) {
      store.beginExpedition(outcome, 71, 'membrane'); store.settleMission(outcome, outcome, emptyMissionHaul());
      expect(store.firstMissionGiftAvailable).toBe(false);
    }
    store.beginExpedition('first-win', 71, 'membrane');
    expect(store.settleMission('first-win', 'success', emptyMissionHaul()).accepted).toBe(true);
    expect(store.data.coins).toBe(417); expect(store.firstMissionGiftAvailable).toBe(true);
    const restored = new CampProfileStore(storage);
    expect(restored.firstMissionGiftAvailable).toBe(true);
    expect(restored.claimFirstMissionGift()).toMatchObject({ accepted: true, persisted: true });
    expect(restored.data.coins).toBe(417 + FIRST_MISSION_GIFT_COINS);
    expect(restored.claimFirstMissionGift()).toMatchObject({ accepted: false, code: 'already-claimed' });
    const again = new CampProfileStore(storage);
    expect(again.data.coins).toBe(50_417); expect(again.data.firstMissionGift).toBe('claimed');
    again.beginExpedition('repeat-win', 72, 'membrane'); again.settleMission('repeat-win', 'success', emptyMissionHaul());
    expect(again.firstMissionGiftAvailable).toBe(false); expect(again.data.coins).toBe(50_617);
  });
  it('offers existing profiles a backfill without replacing their balance, collection or draw counters', () => {
    const { data, storage, store } = fixture(true);
    expect(store.data).toEqual({ ...data, firstMissionGift: 'available' });
    expect(new CampProfileStore(storage).firstMissionGiftAvailable).toBe(true);
    store.claimFirstMissionGift();
    expect(store.data).toEqual({ ...data, coins: 50_217, firstMissionGift: 'claimed' });
    expect(new CampProfileStore(storage).claimFirstMissionGift().accepted).toBe(false);
  });
  it.each([1, 2, 3, 4, 5])('preserves one-time eligibility when migrating schema %i', schemaVersion => {
    const source: Record<string, unknown> = { ...fixture().data, schemaVersion };
    delete source.firstMissionGift;
    const parsed = parseCampProfile(source);
    expect(parsed?.firstMissionGift).toBe('available');
    expect(parseCampProfile(parsed)?.firstMissionGift).toBe('available');
  });
  it('keeps credit and its claimed marker together across failed writes and a later save retry', () => {
    const { storage, store } = fixture(true); storage.blocked = true;
    expect(store.claimFirstMissionGift()).toMatchObject({ accepted: true, persisted: false });
    expect(store.data.coins).toBe(50_217); expect(store.data.firstMissionGift).toBe('claimed');
    expect(store.claimFirstMissionGift().accepted).toBe(false); expect(store.data.coins).toBe(50_217);
    storage.blocked = false; store.save();
    const restored = new CampProfileStore(storage);
    expect(restored.data.coins).toBe(50_217); expect(restored.claimFirstMissionGift().accepted).toBe(false);
  });
  it('backfills an older combat-only save and does not reopen an already claimed gift during legacy migration', () => {
    const storage = new Storage();
    storage.setItem(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY, JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 5,
      runs: 2, rescues: 1, bestWave: 8, bestScore: 5000, bestCombo: 30, recentRuns: [], recentRunIds: [] }));
    const store = new CampProfileStore(storage);
    expect(store.firstMissionGiftAvailable).toBe(true); store.claimFirstMissionGift();
    const data = store.data; data.legacyMigrationChecked = false;
    storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
    const restored = new CampProfileStore(storage);
    expect(restored.data.coins).toBe(data.coins); expect(restored.data.firstMissionGift).toBe('claimed');
  });
  it('rejects corrupt markers and cannot consume the gift without crediting the full amount', () => {
    expect(parseCampProfile({ ...emptyCampProfile(), firstMissionGift: 'other' })).toBeNull();
    const { storage, data } = fixture(true);
    storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...data, coins: Number.MAX_SAFE_INTEGER, firstMissionGift: 'available' }));
    const store = new CampProfileStore(storage);
    expect(store.claimFirstMissionGift()).toMatchObject({ accepted: false, code: 'capacity' });
    expect(store.firstMissionGiftAvailable).toBe(true);
  });
  it('shows the exact amount and an explicit claim action', () => {
    expect(FIRST_MISSION_GIFT_COINS).toBe(50_000);
    const markup = firstMissionGiftOverlay();
    expect(markup).toContain('role="dialog"'); expect(markup).toContain('领取50,000金币');
    expect(markup).toContain('data-action="claim-first-mission-gift"');
  });
});
