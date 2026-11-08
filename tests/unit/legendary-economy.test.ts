import { describe, expect, it } from 'vitest';
import { SeedRng } from '../../src/core/rng';
import { BASE_WEAPON_IDS, createBossLoot, DEFAULT_EXPEDITION_LOADOUT, isLegendaryWeaponId, isWeaponId, LEGENDARY_WEAPON_IDS, WEAPONS } from '../../src/game/expedition';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { CAMP_PROFILE_SCHEMA_VERSION, CAMP_PROFILE_STORAGE_KEY, CampProfileStore, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import { emptyTerritoryProfile, TERRITORY_PROFILE_SCHEMA_VERSION, TERRITORY_PROFILE_STORAGE_KEY, TerritoryProfileStore, WEAPON_IDENTITY_PROFILE_STORAGE_KEY, type EndlessProfileStorage } from '../../src/meta/endlessProfile';

class Storage implements EndlessProfileStorage {
  items = new Map<string, string>();
  writes: string[] = [];
  blocked = false;
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw Error('quota'); this.items.set(key, value); this.writes.push(key); }
  removeItem(key: string) { this.items.delete(key); }
}
function oldProfile() {
  const data = JSON.parse(JSON.stringify(emptyCampProfile()));
  data.schemaVersion = 3; delete data.weapons.thunder; delete data.weapons.redblade;
  delete data.starterWeaponGrantVersion; delete data.unlockedLegendaryWeapons;
  data.weapons.steady.repaired = 'white'; data.inventory[0].rarity = 'white'; data.seenEquipmentQuality.steady = 'white';
  return data;
}
function load(data: unknown) {
  const storage = new Storage(); storage.items.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
  return { storage, store: new CampProfileStore(storage) };
}
function ready(overrides: Record<string, unknown> = {}) {
  return load({ ...emptyCampProfile(), campUnlocked: true, campIntroSeen: true, prologue: 'ready', legacyMigrationChecked: true,
    builtFacilities: [...INTRO_FACILITY_IDS], coins: 5000, materials: 100, cores: 3, fragments: { thunder: 60, redblade: 60 }, ...overrides });
}
function weaponSeed(index: number) {
  for (let seed = 0; seed < 10000; seed++) {
    const rng = new SeedRng(seed); rng.next();
    if (rng.next() < .4 && rng.int(0, 1) === index) return seed;
  }
  throw Error('No deterministic weapon seed');
}

describe('legendary weapon economy and compatible camp migration', () => {
  it('registers four distinct weapons and gives the repaired starter at purple', () => {
    expect(BASE_WEAPON_IDS).toEqual(['steady', 'piercing']); expect(LEGENDARY_WEAPON_IDS).toEqual(['thunder', 'redblade']);
    expect(isWeaponId('thunder')).toBe(true); expect(isWeaponId('PULSE_BREAK')).toBe(false);
    expect(isLegendaryWeaponId('redblade')).toBe(true); expect(isLegendaryWeaponId('steady')).toBe(false);
    expect(WEAPONS.thunder).toMatchObject({ name: '霆链·裁决铳', damage: 43 });
    expect(WEAPONS.redblade).toMatchObject({ name: '赤曜·斩疫刃', damage: 42 });
    expect(DEFAULT_EXPEDITION_LOADOUT.rarity).toBe('purple');
    expect(new CampProfileStore(null).data.inventory).toContainEqual({ id: 'starter:steady', templateId: 'steady', kind: 'weapon', rarity: 'purple', repaired: true });
  });
  it('makes the current first-clear gift purple without restricting later reward rarity', () => {
    const repeatRarities = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      expect(createBossLoot(`first-${seed}`, seed, true)).toMatchObject({ weaponId: 'piercing', rarity: 'purple' });
      repeatRarities.add(createBossLoot(`repeat-${seed}`, seed, false).rarity);
    }
    expect(repeatRarities).toEqual(new Set(['blue', 'purple', 'gold']));
  });
  it('migrates a real two-weapon schema3 save once without changing its economy or higher inventory', () => {
    const old = oldProfile(); old.coins = 71; old.pity = 29; old.weapons.steady.upgrade = 2;
    old.inventory.push({ id: 'owned:gold', templateId: 'steady', kind: 'weapon', rarity: 'gold', repaired: true });
    old.transactions.push({ kind: 'draw', id: 'draw:old-gold', receipt: { id: 'draw:old-gold', count: 1, cost: 100, pityBefore: 49, pityAfter: 0,
      pityLimit: 50, results: [{ kind: 'weapon', rarity: 'gold', quantity: 1, templateId: 'steady', itemId: 'owned:gold' }] } });
    const { store, storage } = load(old), data = store.data;
    expect(data).toMatchObject({ schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, coins: 71, pity: 29, unlockedLegendaryWeapons: [], starterWeaponGrantVersion: 1 });
    expect(data.inventory.find(item => item.id === 'starter:steady')?.rarity).toBe('purple');
    expect(data.inventory.find(item => item.id === 'owned:gold')?.rarity).toBe('gold');
    expect(data.weapons.steady).toMatchObject({ repaired: 'gold', upgrade: 2 });
    expect(data.weapons.thunder).toEqual({ repaired: null, pending: null, upgrade: 0 });
    expect(data.transactions).toEqual(old.transactions);
    expect(store.drawAntibodies(1, 'old-gold').receipt).toEqual(old.transactions[0].receipt);
    expect(new CampProfileStore(storage).data).toEqual(data);
  });
  it.each(['white', 'blue', 'purple', 'gold'])('handles a decomposed starter with an existing %s replacement', quality => {
    const old = oldProfile(); old.inventory[0] = { id: 'replacement', templateId: 'steady', kind: 'weapon', rarity: quality, repaired: true };
    old.weapons.steady.repaired = quality;
    const { store, storage } = load(old);
    expect(store.data.inventory.some(item => item.id === 'starter:steady')).toBe(quality === 'white' || quality === 'blue');
    expect(store.data.weapons.steady.repaired).toBe(quality === 'gold' ? 'gold' : 'purple');
    expect(new CampProfileStore(storage).data).toEqual(store.data);
  });
  it('preserves a previously earned gold first-clear blade without creating another clear reward', () => {
    const old = oldProfile(); Object.assign(old, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS], victories: 1, claimedRewardIds: ['boss-loot:old:heart'] });
    old.weapons.piercing = { repaired: 'gold', pending: null, upgrade: 3 };
    old.inventory.push({ id: 'mission:old-blade', templateId: 'piercing', kind: 'weapon', rarity: 'gold', repaired: true });
    const { store } = load(old);
    expect(store.data.weapons.piercing).toEqual({ repaired: 'gold', pending: null, upgrade: 3 });
    expect(store.data.inventory.filter(item => item.templateId === 'piercing')).toHaveLength(1);
    expect(store.data.claimedRewardIds).toEqual(old.claimedRewardIds);
  });
  it('does not recreate a consumed purple starter after the one-time migration', () => {
    const old = oldProfile(); Object.assign(old, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS] });
    old.inventory.push({ id: 'spare:purple', templateId: 'steady', kind: 'weapon', rarity: 'purple', repaired: true });
    const { store, storage } = load(old);
    expect(store.decompose('starter:steady').accepted).toBe(true);
    const after = store.data;
    expect(new CampProfileStore(storage).data).toEqual(after);
    expect(after.inventory.some(item => item.id === 'starter:steady')).toBe(false);
  });
  it('retains the one-time starter migration in memory through failed writes and retries atomically', () => {
    const storage = new Storage(), bytes = JSON.stringify(oldProfile()); storage.items.set(CAMP_PROFILE_STORAGE_KEY, bytes); storage.blocked = true;
    const store = new CampProfileStore(storage);
    expect(store.status.code).toBe('write-failed'); expect(store.data.inventory[0].rarity).toBe('purple');
    expect(store.data.starterWeaponGrantVersion).toBe(1); expect(storage.items.get(CAMP_PROFILE_STORAGE_KEY)).toBe(bytes);
    storage.blocked = false; store.save(); expect(new CampProfileStore(storage).data).toEqual(store.data);
    expect(store.data.inventory.filter(item => item.id === 'starter:steady')).toHaveLength(1);
  });
  it.each(LEGENDARY_WEAPON_IDS)('draws %s from the gold weapon pool and retains reforge unlock after decomposition', id => {
    const { store, storage } = ready({ pity: 49, drawSeed: weaponSeed(LEGENDARY_WEAPON_IDS.indexOf(id)) });
    expect(store.craft(id, 'gold').code).toBe('legendary-locked');
    const drawn = store.drawAntibodies(1, `unlock-${id}`);
    expect(drawn.receipt?.results[0]).toMatchObject({ kind: 'weapon', rarity: 'gold', templateId: id });
    expect(store.data.unlockedLegendaryWeapons).toEqual([id]); expect(store.data.pity).toBe(0);
    expect(store.decompose(drawn.receipt!.results[0].itemId!).accepted).toBe(true);
    const restored = new CampProfileStore(storage);
    expect(restored.data.weapons[id].repaired).toBeNull(); expect(restored.data.unlockedLegendaryWeapons).toEqual([id]);
    expect(restored.craft(id, 'purple').code).toBe('legendary-locked');
    expect(restored.craft(id, 'gold').accepted).toBe(true); expect(restored.data.weapons[id].repaired).toBe('gold');
    const before = restored.data;
    expect(restored.drawAntibodies(1, `unlock-${id}`).receipt).toEqual(drawn.receipt); expect(restored.data).toEqual(before);
  });
  it('keeps ordinary weapon gold crafting available and rejects malformed new metadata', () => {
    const { store } = ready({ fragments: { steady: 20 } }); expect(store.craft('steady', 'gold').accepted).toBe(true);
    const initial = emptyCampProfile();
    expect(parseCampProfile({ ...initial, unlockedLegendaryWeapons: ['steady'] })).toBeNull();
    expect(parseCampProfile({ ...initial, unlockedLegendaryWeapons: ['thunder', 'thunder'] })).toBeNull();
    expect(parseCampProfile({ ...initial, starterWeaponGrantVersion: 2 })).toBeNull();
    const missing = JSON.parse(JSON.stringify(initial)); delete missing.weapons.thunder;
    expect(parseCampProfile(missing)).toBeNull();
  });
  it('rejects nongold legendary equipment across collection, inventory, departure, reward and draw receipt data', () => {
    const { store } = ready(), initial = store.data;
    expect(parseCampProfile({ ...initial, weapons: { ...initial.weapons, thunder: { repaired: 'purple', pending: null, upgrade: 0 } } })).toBeNull();
    expect(parseCampProfile({ ...initial, inventory: [...initial.inventory, { id: 'bad:legend', templateId: 'thunder', kind: 'weapon', rarity: 'blue', repaired: true }] })).toBeNull();
    expect(parseCampProfile({ ...initial, activeExpedition: { runId: 'invalid', seed: 1, extraAntibodies: 0, firstClear: true, blueprints: [], loadout: { weaponId: 'redblade', rarity: 'purple', upgrade: 0 } } })).toBeNull();
    expect(parseCampProfile({ ...initial, transactions: [{ kind: 'mission', id: 'mission:bad', receipt: { id: 'mission:bad', runId: 'bad', missionId: 'membrane', outcome: 'success', firstClear: false,
      haul: { coins: 0, materials: 0, fragments: {}, items: [{ templateId: 'redblade', rarity: 'purple', repaired: true }] } } }] })).toBeNull();
    expect(parseCampProfile({ ...initial, transactions: [{ kind: 'draw', id: 'draw:bad', receipt: { id: 'draw:bad', count: 1, cost: 100, pityBefore: 0, pityAfter: 1, pityLimit: 50,
      results: [{ kind: 'weapon', templateId: 'thunder', rarity: 'purple', quantity: 1, itemId: 'draw:1' }] } }] })).toBeNull();
    expect(parseCampProfile({ ...initial, seenEquipmentQuality: { ...initial.seenEquipmentQuality, redblade: 'blue' } })).toBeNull();
  });
});

describe('ultimate rules score isolation', () => {
  it('preserves schema8 scores read-only and starts the schema9 ranking separately', () => {
    const storage = new Storage(), old = { ...emptyTerritoryProfile(), schemaVersion: 8, runs: 1, rescues: 1, bestScore: 3210 };
    const bytes = JSON.stringify(old); storage.items.set(WEAPON_IDENTITY_PROFILE_STORAGE_KEY, bytes);
    const store = new TerritoryProfileStore(storage), snapshot = store.load();
    expect(TERRITORY_PROFILE_SCHEMA_VERSION).toBe(9); expect(snapshot.data.runs).toBe(0);
    expect(snapshot.previousWeaponIdentity).toEqual(old); expect(snapshot.legacyAvailable).toBe(true);
    store.save(); expect(storage.items.get(WEAPON_IDENTITY_PROFILE_STORAGE_KEY)).toBe(bytes);
    expect(storage.writes.every(key => key.startsWith(TERRITORY_PROFILE_STORAGE_KEY))).toBe(true);
    snapshot.previousWeaponIdentity!.bestScore = 0; expect(store.load().previousWeaponIdentity?.bestScore).toBe(3210);
  });
  it('recovers earned camp access from v8 without inventing a weapon reward or changing score bytes', () => {
    const storage = new Storage(), old = { ...emptyTerritoryProfile(), schemaVersion: 8, runs: 1, rescues: 1 };
    const bytes = JSON.stringify(old); storage.items.set(WEAPON_IDENTITY_PROFILE_STORAGE_KEY, bytes);
    const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ campUnlocked: true, prologue: 'ready', victories: 0, claimedRewardIds: [] });
    expect(store.data.weapons.piercing).toEqual({ repaired: null, pending: null, upgrade: 0 });
    expect(storage.items.get(WEAPON_IDENTITY_PROFILE_STORAGE_KEY)).toBe(bytes);
  });
});
