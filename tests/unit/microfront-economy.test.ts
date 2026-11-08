import { describe, expect, it } from 'vitest';
import { CampProfileStore, CAMP_PROFILE_SCHEMA_VERSION, CAMP_PROFILE_STORAGE_KEY, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import { createBossLoot } from '../../src/game/expedition';
import { DRAW_COST, DRAW_PITY_LIMIT, DRAW_RARITY_WEIGHTS, STARTER_COINS, emptyMissionHaul, MODULE_IDS, type DrawReceipt, type MissionHaul } from '../../src/game/microfront';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';

class Storage implements EndlessProfileStorage {
  values = new Map<string, string>(); blocked = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function ready(overrides: Omit<Partial<ReturnType<typeof emptyCampProfile>>, 'weapons'> & { weapons?: Partial<ReturnType<typeof emptyCampProfile>['weapons']> } = {}) {
  const storage = new Storage();
  const initial = emptyCampProfile();
  storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...initial, coins: 0, campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS], legacyMigrationChecked: true, ...overrides, weapons: { ...initial.weapons, ...overrides.weapons } }));
  return { storage, store: new CampProfileStore(storage) };
}

describe('microfront camp economy and saved transactions', () => {
  it('builds camp before the first mission and unlocks missions in sequence', () => {
    const store = new CampProfileStore(new Storage());
    expect(store.data.prologue).toBe('arrival');
    expect(() => store.beginExpedition('too-soon', 1, 'membrane')).toThrow();
    expect(store.establishCamp().accepted).toBe(true); expect(store.data.prologue).toBe('building');
    expect(store.finishCampIntro().accepted).toBe(false);
    for (const id of INTRO_FACILITY_IDS) { expect(store.beginBuild(id).accepted).toBe(true); expect(store.completeBuild(id).accepted).toBe(true); }
    expect(store.data.prologue).toBe('ready');
    expect(store.selectMission('corridor').accepted).toBe(false);
    store.beginExpedition('first', 1, 'membrane');
    const result = store.settleMission('first', 'success', emptyMissionHaul());
    expect(result.receipt?.firstClear).toBe(true); expect(store.data.coins).toBe(STARTER_COINS + 200);
    expect(store.data.fragments.PULSE_BREAK).toBe(5); expect(store.data.materials).toBe(10);
    expect(store.selectMission('corridor').accepted).toBe(true);
    expect(store.selectMission('boundary').accepted).toBe(false);
    expect(store.craft('PULSE_BREAK', 'blue').accepted).toBe(true);
    expect(store.equipModule('PULSE_BREAK').accepted).toBe(true);
    expect(store.data.coins).toBe(STARTER_COINS + 200);
  });
  it('keeps mission rewards separate from Boss victories and refuses duplicate claims', () => {
    const { store, storage } = ready(); store.beginExpedition('one', 2, 'membrane');
    const haul: MissionHaul = { coins: 7, materials: 3, fragments: { steady: 3 }, items: [{ templateId: 'piercing', rarity: 'blue' }] };
    store.saveMissionHaul('one', haul);
    const first = store.settleMission('one', 'success', haul); const snapshot = store.data;
    expect(snapshot.victories).toBe(0); expect(snapshot.claimedRewardIds).toEqual([]);
    expect(first.receipt?.haul.coins).toBe(207); expect(snapshot.inventory.some(item => item.templateId === 'piercing')).toBe(true);
    expect(store.settleMission('one', 'success', haul).code).toBe('duplicate'); expect(store.data).toEqual(snapshot);
    const restored = new CampProfileStore(storage); expect(restored.data).toEqual(snapshot);
    expect(() => restored.beginExpedition('one', 2, 'membrane')).toThrow();
    restored.beginExpedition('two', 3, 'membrane'); restored.settleMission('two', 'success', emptyMissionHaul());
    expect(restored.data.fragments.PULSE_BREAK).toBe(7);
  });
  it.each(['failure', 'withdrawn'] as const)('banks half ordinary resources and no items or completion rewards on %s', outcome => {
    const { store } = ready(); store.beginExpedition(outcome, 1, 'membrane');
    const haul: MissionHaul = { coins: 9, materials: 5, fragments: { steady: 7 }, items: [{ templateId: 'piercing', rarity: 'gold' }] };
    store.saveMissionHaul(outcome, haul); store.settleMission(outcome, outcome, haul);
    expect(store.data).toMatchObject({ coins: 4, materials: 2, fragments: { steady: 3 }, cores: 0, completedMissions: [] });
    expect(store.data.inventory).toHaveLength(1); expect(store.data.missionStats.membrane[outcome === 'failure' ? 'failures' : 'withdrawals']).toBe(1);
  });
  it('recovers a departed mission as withdrawal using only saved pickups', () => {
    const { store, storage } = ready(); store.beginExpedition('reload', 4, 'membrane');
    store.saveMissionHaul('reload', { coins: 21, materials: 9, fragments: { EXPOSE_TRACE: 5 }, items: [{ templateId: 'piercing', rarity: 'gold' }] });
    const restored = new CampProfileStore(storage);
    expect(restored.data).toMatchObject({ coins: 10, materials: 4, fragments: { EXPOSE_TRACE: 2 }, cores: 0 });
    expect(restored.data.activeExpedition).toBeUndefined(); expect(restored.data.inventory).toHaveLength(1);
    expect(new CampProfileStore(storage).data).toEqual(restored.data);
  });
  it('requires completed boundary for core rewards and validates Boss loot', () => {
    const { store } = ready({ completedMissions: ['membrane', 'corridor'] });
    const departure = store.beginExpedition('boss', 18, 'boundary');
    const loot = createBossLoot('boss', 18, departure.firstClear);
    expect(store.settleMission('boss', 'success', emptyMissionHaul(), { ...loot, materials: 900 }).accepted).toBe(false);
    expect(store.settleMission('boss', 'success', emptyMissionHaul(), loot).accepted).toBe(true);
    expect(store.data.cores).toBe(1); expect(store.data.claimedRewardIds).toEqual([loot.id]); expect(store.data.victories).toBe(1);
    expect(parseCampProfile(store.data)).not.toBeNull();
  });
  it('freezes weapons and module quality at departure', () => {
    const { store } = ready({ fragments: { PULSE_BREAK: 30 }, materials: 100 });
    store.craft('PULSE_BREAK', 'blue'); store.equipModule('PULSE_BREAK');
    const departure = store.beginExpedition('snapshot', 1, 'membrane');
    store.craft('PULSE_BREAK', 'purple'); store.upgrade('steady');
    expect(departure.modules).toEqual([{ id: 'PULSE_BREAK', tuning: 'balanced', rank: 1 }]); expect(departure.loadout.upgrade).toBe(0);
    departure.modules![0].rank = 3;
    expect(store.beginExpedition('snapshot', 1, 'membrane').modules![0].rank).toBe(1);
  });
  it('checks recipes atomically and protects equipped instances while allowing duplicates to recycle', () => {
    const { store } = ready({ materials: 200, fragments: { steady: 20, PULSE_BREAK: 20 }, cores: 1 });
    const before = store.data; expect(store.craft('EXPOSE_TRACE', 'gold').accepted).toBe(false); expect(store.data).toEqual(before);
    expect(store.craft('steady', 'gold').accepted).toBe(true); const gun = store.data.inventory.find(item => item.templateId === 'steady' && item.rarity === 'gold')!;
    expect(store.decompose(gun.id).code).toBe('equipped');
    store.craft('PULSE_BREAK', 'blue'); store.craft('PULSE_BREAK', 'blue'); store.equipModule('PULSE_BREAK');
    const modules = store.data.inventory.filter(item => item.templateId === 'PULSE_BREAK');
    expect(store.decompose(modules[0].id).accepted).toBe(true); expect(store.decompose(modules[1].id).accepted).toBe(false);
    store.equipModule('PULSE_BREAK'); expect(store.decompose(modules[1].id).accepted).toBe(true);
  });
  it('limits module slots to three and permits explicit removal', () => {
    const { store } = ready({ materials: 100, fragments: Object.fromEntries(MODULE_IDS.map(id => [id, 5])) });
    for (const id of MODULE_IDS) store.craft(id, 'blue');
    for (const id of MODULE_IDS.slice(0, 3)) expect(store.equipModule(id).accepted).toBe(true);
    expect(store.equipModule(MODULE_IDS[3]).code).toBe('slots-full');
    store.equipModule(MODULE_IDS[0]); expect(store.equipModule(MODULE_IDS[3]).accepted).toBe(true);
  });
  it('charges once for each confirmed batch and never rerolls a request', () => {
    const { store, storage } = ready({ coins: 2000 });
    const result = store.drawAntibodies(10, 'ten');
    expect(result.accepted).toBe(true); expect(result.receipt?.results).toHaveLength(10);
    expect(result.receipt?.pityLimit).toBe(DRAW_PITY_LIMIT); expect(store.data.coins).toBe(1000);
    const snapshot = store.data, restored = new CampProfileStore(storage);
    expect(restored.drawAntibodies(10, 'ten').receipt).toEqual(result.receipt); expect(restored.data).toEqual(snapshot);
    expect(restored.drawAntibodies(10, 'next').accepted).toBe(true); expect(restored.data.coins).toBe(0);
    expect(restored.drawAntibodies(1, 'poor').accepted).toBe(false);
  });
  it('guarantees the fiftieth pull and persists the reset across page reload', () => {
    const { store, storage } = ready({ coins: DRAW_COST, pity: DRAW_PITY_LIMIT - 1, drawSeed: 0 });
    const result = store.drawAntibodies(1, 'pity');
    expect(result.receipt?.results[0].rarity).toBe('gold'); expect(store.data.pity).toBe(0);
    expect(result.receipt).toMatchObject({ pityBefore: 49, pityAfter: 0, pityLimit: 50 });
    expect(new CampProfileStore(storage).data.pity).toBe(0);
  });
  it('does not force gold at ten pulls and preserves the longer counter on reload', () => {
    const { store, storage } = ready({ coins: DRAW_COST, pity: 9, drawSeed: 0 });
    const result = store.drawAntibodies(1, 'tenth');
    expect(result.receipt?.results[0].rarity).toBe('white');
    expect(result.receipt).toMatchObject({ pityBefore: 9, pityAfter: 10, pityLimit: DRAW_PITY_LIMIT });
    expect(new CampProfileStore(storage).data.pity).toBe(10);
    expect(DRAW_RARITY_WEIGHTS).toEqual({ white: 60, blue: 25, purple: 10, gold: 5 });
  });
  it('shares the fifty-pull guarantee between singles and batches and resets on every gold', () => {
    const { store, storage } = ready({ coins: DRAW_PITY_LIMIT * DRAW_COST, drawSeed: 0 });
    const results: DrawReceipt['results'] = []; let previousPity = 0;
    for (const [index, amount] of [1, 10, 10, 10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1].entries()) {
      // Always reopen the latest saved snapshot, so single/batch transitions
      // exercise the shared persisted counter rather than a stale store.
      const active = index === 0 ? store : new CampProfileStore(storage);
      const draw = active.drawAntibodies(amount as 1 | 10, `shared-${index}`);
      expect(draw.accepted).toBe(true); expect(draw.receipt!.pityBefore).toBe(previousPity);
      previousPity = draw.receipt!.pityAfter; results.push(...draw.receipt!.results);
    }
    expect(results).toHaveLength(DRAW_PITY_LIMIT);
    expect(results.some(result => result.rarity === 'gold')).toBe(true);
    const lastGold = results.map(result => result.rarity).lastIndexOf('gold');
    expect(new CampProfileStore(storage).data.pity).toBe(results.length - lastGold - 1);
    expect(new CampProfileStore(storage).data.coins).toBe(0);
  });
  it('retains historical ten-pull receipts and replays them without charges alongside new receipts', () => {
    const legacy: DrawReceipt = { id: 'draw:legacy', count: 1, cost: DRAW_COST,
      pityBefore: 9, pityAfter: 0, results: [{ kind: 'core', rarity: 'gold', quantity: 1 }] };
    const { store, storage } = ready({ coins: 321, pity: 9, drawSeed: 0,
      transactions: [{ kind: 'draw', id: legacy.id, receipt: legacy }] });
    expect(store.status.code).toBe('loaded');
    expect(store.drawAntibodies(1, 'legacy').receipt).toEqual(legacy); expect(store.data.coins).toBe(321);
    const modern = store.drawAntibodies(1, 'modern');
    expect(modern.receipt?.pityLimit).toBe(DRAW_PITY_LIMIT);
    const restored = new CampProfileStore(storage);
    expect(restored.data.coins).toBe(221); expect(restored.data.pity).toBe(10);
    expect(restored.drawAntibodies(1, 'legacy').receipt).toEqual(legacy);
    expect(restored.drawAntibodies(1, 'modern').receipt).toEqual(modern.receipt);
    expect(restored.data.coins).toBe(221);
  });
  it('validates receipt counters against their recorded guarantee', () => {
    const base = emptyCampProfile();
    const single: DrawReceipt = { id: 'draw:validation', count: 1, cost: DRAW_COST, pityBefore: 49, pityAfter: 0,
      pityLimit: DRAW_PITY_LIMIT, results: [{ kind: 'core', rarity: 'gold', quantity: 1 }] };
    const withReceipt = (value: unknown) => ({ ...base, transactions: [{ kind: 'draw', id: single.id, receipt: value }] });
    expect(parseCampProfile(withReceipt(single))).not.toBeNull();
    expect(parseCampProfile(withReceipt({ ...single, pityBefore: 50 }))).toBeNull();
    expect(parseCampProfile(withReceipt({ ...single, pityLimit: 100 }))).toBeNull();
    expect(parseCampProfile(withReceipt({ ...single, pityAfter: 49 }))).toBeNull();
    expect(parseCampProfile(withReceipt({ ...single, pityAfter: 50, results: [{ kind: 'materials', rarity: 'white', quantity: 5 }] }))).toBeNull();
    const { pityLimit: _limit, ...legacy } = single;
    expect(parseCampProfile(withReceipt({ ...legacy, pityBefore: 9 }))).not.toBeNull();
    expect(parseCampProfile(withReceipt({ ...legacy, pityBefore: 9, pityAfter: 10, results: [{ kind: 'materials', rarity: 'white', quantity: 5 }] }))).toBeNull();
  });
  it('keeps a failed-write draw result in memory, without extra charges on retry', () => {
    const { store, storage } = ready({ coins: 1000 }); storage.blocked = true;
    const first = store.drawAntibodies(10, 'offline-write'); expect(first.accepted).toBe(true); expect(first.persisted).toBe(false);
    expect(store.status.code).toBe('write-failed'); expect(store.drawAntibodies(10, 'offline-write').receipt).toEqual(first.receipt);
    storage.blocked = false; store.save();
    const restored = new CampProfileStore(storage); expect(restored.data.coins).toBe(0); expect(restored.drawAntibodies(10, 'offline-write').receipt).toEqual(first.receipt);
  });
  it('migrates legacy ownership without random rewards or re-creating abandoned Boss loot', () => {
    const { prologue: _p, selectedMissionId: _s, completedMissions: _c, coins: _coins, fragments: _f, cores: _core, inventory: _i,
      equippedModules: _e, pity: _pi, drawSeed: _seed, itemSerial: _serial, transactions: _t, missionStats: _stats, ...legacy } = emptyCampProfile();
    const old = { ...legacy, schemaVersion: 1, campUnlocked: true, materials: 57,
      weapons: { steady: { repaired: 'purple', pending: null, upgrade: 2 }, piercing: { repaired: null, pending: 'gold', upgrade: 0 } } };
    const parsed = parseCampProfile(old)!;
    expect(parsed).toMatchObject({ schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, prologue: 'ready', builtFacilities: INTRO_FACILITY_IDS, materials: 57, coins: 0, fragments: {}, cores: 0, transactions: [] });
    expect(parsed.inventory).toHaveLength(2); expect(parsed.weapons.steady.upgrade).toBe(2); expect(parsed.inventory.find(item => item.templateId === 'piercing')?.repaired).toBe(false);
    expect(parseCampProfile({ ...parsed, pity: DRAW_PITY_LIMIT - 1 })).not.toBeNull();
    expect(parseCampProfile({ ...parsed, pity: DRAW_PITY_LIMIT })).toBeNull(); expect(parseCampProfile({ ...parsed, coins: -1 })).toBeNull();
  });
  it('keeps repaired inventory, stronger saved equipment and model upgrades consistent across reloads', () => {
    const initial = emptyCampProfile();
    const { store, storage } = ready({ materials: 100,
      weapons: { steady: { repaired: 'purple', pending: null, upgrade: 2 }, piercing: { repaired: null, pending: 'purple', upgrade: 0 } },
      inventory: [...initial.inventory, { id: 'owned:gold', templateId: 'steady', kind: 'weapon', rarity: 'gold', repaired: true }] });
    expect(store.data.weapons.steady).toEqual({ repaired: 'gold', pending: null, upgrade: 2 });
    expect(store.repair('piercing').accepted).toBe(true); store.upgrade('piercing');
    expect(store.data.inventory.find(item => item.templateId === 'piercing')?.repaired).toBe(true);
    const restored = new CampProfileStore(storage); expect(restored.data.weapons.piercing).toEqual({ repaired: 'purple', pending: null, upgrade: 1 });
    expect(restored.data.inventory.filter(item => item.templateId === 'piercing')).toHaveLength(1);
    restored.equip('piercing');
    expect(restored.decompose('owned:gold').accepted).toBe(true);
    expect(restored.data.weapons.steady).toEqual({ repaired: 'purple', pending: null, upgrade: 2 });
    expect(restored.decompose('starter:steady').code).toBe('protected');
    expect(new CampProfileStore(storage).data.inventory.some(item => item.id === 'owned:gold')).toBe(false);
  });
  it('rejects invalid module states, non-monotonic pickups, unrecorded totals and corrupt finite-run amounts', () => {
    const initial = emptyCampProfile();
    expect(parseCampProfile({ ...initial, inventory: [...initial.inventory, { id: 'bad:module', templateId: 'PULSE_BREAK', rarity: 'gold', kind: 'module', repaired: false }] })).toBeNull();
    const { store } = ready(); store.beginExpedition('validated', 1, 'membrane');
    const haul: MissionHaul = { coins: 2, materials: 1, fragments: { steady: 1 }, items: [] };
    const before = store.data;
    expect(store.settleMission('validated', 'success', haul).accepted).toBe(false);
    expect(store.saveMissionHaul('validated', { ...haul, cores: 1 }).accepted).toBe(false);
    expect(store.saveMissionHaul('validated', { ...haul, coins: Number.MAX_SAFE_INTEGER }).accepted).toBe(false);
    expect(store.saveMissionHaul('validated', { ...haul, materials: .5 }).accepted).toBe(false);
    expect(store.saveMissionHaul('validated', { ...haul, items: [{ templateId: 'PULSE_BREAK', rarity: 'blue', repaired: false }] }).accepted).toBe(false);
    expect(store.data).toEqual(before);
    expect(store.saveMissionHaul('validated', haul).accepted).toBe(true);
    expect(store.saveMissionHaul('validated', emptyMissionHaul()).accepted).toBe(false);
    expect(store.settleMission('validated', 'success', { ...haul, coins: 200 }).accepted).toBe(false);
    expect(store.settleMission('validated', 'success', haul).accepted).toBe(true);
  });
  it('never overflows wallet counters or reuses an exhausted inventory identity', () => {
    const { store, storage } = ready({ coins: Number.MAX_SAFE_INTEGER, materials: Number.MAX_SAFE_INTEGER, fragments: { steady: Number.MAX_SAFE_INTEGER }, itemSerial: Number.MAX_SAFE_INTEGER });
    const before = store.data;
    expect(store.craft('steady', 'blue').code).toBe('capacity'); expect(store.drawAntibodies(1, 'max-id').code).toBe('capacity'); expect(store.data).toEqual(before);
    store.beginExpedition('max-wallet', 2, 'membrane');
    const haul = { coins: 2, materials: 1, fragments: { steady: 1 }, items: [] };
    store.saveMissionHaul('max-wallet', haul); expect(store.settleMission('max-wallet', 'success', haul).accepted).toBe(true);
    expect(store.data.coins).toBe(Number.MAX_SAFE_INTEGER); expect(store.data.materials).toBe(Number.MAX_SAFE_INTEGER); expect(store.data.fragments.steady).toBe(Number.MAX_SAFE_INTEGER);
    expect(new CampProfileStore(storage).status.code).toBe('loaded');
  });
  it('reopens the last atomic snapshot after a failed settlement save without granting success loot twice', () => {
    const { store, storage } = ready(); store.beginExpedition('unsaved-win', 7, 'membrane');
    const haul: MissionHaul = { coins: 8, materials: 4, fragments: { piercing: 2 }, items: [{ templateId: 'piercing', rarity: 'blue', repaired: false }] };
    store.saveMissionHaul('unsaved-win', haul); storage.blocked = true;
    expect(store.settleMission('unsaved-win', 'success', haul).persisted).toBe(false);
    expect(store.data.coins).toBe(208);
    storage.blocked = false; const restored = new CampProfileStore(storage);
    expect(restored.data.coins).toBe(4); expect(restored.data.completedMissions).toEqual([]); expect(restored.data.inventory).toHaveLength(1);
    expect(restored.settleMission('unsaved-win', 'success', haul).code).toBe('duplicate');
  });
});
