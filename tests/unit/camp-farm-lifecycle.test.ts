import { describe, expect, it } from 'vitest';
import { CampProfileStore, CAMP_PROFILE_SCHEMA_VERSION, CAMP_PROFILE_STORAGE_KEY, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import { CAMP_FARM_RULES, farmGrownSeconds } from '../../src/game/campFarm';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { emptyMissionHaul } from '../../src/game/microfront';

class Storage {
  values = new Map<string, string>(); writes = 0; blocked = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; if (this.blocked) throw Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function ready() {
  const storage = new Storage(), data = { ...emptyCampProfile(), campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
    prologue: 'ready' as const, builtFacilities: [...INTRO_FACILITY_IDS, 'farm', 'house'] as ReturnType<typeof emptyCampProfile>['builtFacilities'] };
  storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
  return { storage, store: new CampProfileStore(storage) };
}
function advance(store: CampProfileStore, seconds: number) { for (let i = 0; i < seconds; i++) store.advanceFarm(1); }

describe('simulated-time camp farming', () => {
  it('migrates all schema-five stages without losing an already mature harvest or existing wallet', () => {
    const { store, storage } = ready(), legacy = { ...store.data, schemaVersion: 5, food: 0, coins: 137,
      farmPlots: [{ planted: true, growth: 0 }, { planted: true, growth: 1 }, { planted: true, growth: 2 }] };
    storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(legacy));
    const restored = new CampProfileStore(storage);
    expect(restored.data.schemaVersion).toBe(CAMP_PROFILE_SCHEMA_VERSION);
    expect(restored.data.farmPlots.map(farmGrownSeconds)).toEqual([0, 75, 150]);
    expect(restored.data).toMatchObject({ food: 0, coins: 137 });
    expect(restored.harvestCrop(2).accepted).toBe(true);
    expect(restored.data.food).toBe(2);
    expect(new CampProfileStore(storage).data.farmPlots.map(farmGrownSeconds)).toEqual([0, 75, 0]);
  });
  it('accepts only bounded simulated deltas, saves once per supplied second and never awards offline growth', () => {
    const { store, storage } = ready(); store.plantCrop(0); const writes = storage.writes;
    for (const invalid of [0, -1, 1.01, 150, NaN, Infinity]) expect(store.advanceFarm(invalid).changed).toBe(false);
    expect(storage.writes).toBe(writes);
    expect(store.advanceFarm(.4).changed).toBe(true);
    expect(store.advanceFarm(.6).changed).toBe(true);
    expect(farmGrownSeconds(store.data.farmPlots[0])).toBe(1);
    expect(new CampProfileStore(storage).data.farmPlots[0]).toEqual(store.data.farmPlots[0]);
    store.beginExpedition('away', 7, 'membrane');
    expect(store.advanceFarm(1).changed).toBe(false);
    expect(farmGrownSeconds(store.data.farmPlots[0])).toBe(1);
  });
  it('matures unattended after 150 active seconds, never withers and harvests exactly once', () => {
    const { store } = ready(); store.plantCrop(0); advance(store, 149);
    expect(store.harvestCrop(0).accepted).toBe(false);
    expect(store.advanceFarm(1)).toMatchObject({ changed: true, matured: [0] });
    expect(store.advanceFarm(1).changed).toBe(false);
    expect(store.data.farmPlots[0]).toMatchObject({ growth: 2, grownSeconds: 150, watered: false, pestsCleared: false });
    expect(store.harvestCrop(0).accepted).toBe(true); const food = store.data.food;
    expect(store.harvestCrop(0).accepted).toBe(false); expect(store.data.food).toBe(food);
    expect(store.data.farmPlots[0]).toEqual({ planted: false, growth: 0, grownSeconds: 0, watered: false, pestsCleared: false });
  });
  it('offers optional one-use care, feedback receipts and a 100-second path to harvest without costs', () => {
    const { store, storage } = ready(); store.plantCrop(0);
    const wallet = { food: store.data.food, coins: store.data.coins, materials: store.data.materials };
    expect(store.careCrop(0, 'pests').code).toBe('no-pests');
    expect(store.careCrop(0, 'water')).toMatchObject({ accepted: true, code: 'watered' });
    expect(store.careCrop(0, 'water').code).toBe('already-watered');
    advance(store, 35); expect(farmGrownSeconds(store.data.farmPlots[0])).toBe(60);
    expect(store.careCrop(0, 'pests')).toMatchObject({ accepted: true, code: 'pests-cleared' });
    expect(store.careCrop(0, 'pests').code).toBe('already-cleared');
    advance(store, 65); expect(farmGrownSeconds(store.data.farmPlots[0])).toBe(CAMP_FARM_RULES.matureSeconds);
    expect(new CampProfileStore(storage).data.farmPlots[0]).toMatchObject({ watered: true, pestsCleared: true, grownSeconds: 150 });
    expect({ food: store.data.food, coins: store.data.coins, materials: store.data.materials }).toEqual(wallet);
  });
  it('combines existing effective-expedition growth with live time while hungry troops can still depart', () => {
    const { store, storage } = ready(); const data = store.data; data.food = 0;
    storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data)); const hungry = new CampProfileStore(storage);
    hungry.plantCrop(0); advance(hungry, 20);
    const departure = hungry.beginExpedition('hungry', 7, 'membrane');
    expect(departure.legions?.every(unit => !unit.fed)).toBe(true);
    hungry.settleMission('hungry', 'success', emptyMissionHaul());
    expect(farmGrownSeconds(hungry.data.farmPlots[0])).toBe(95);
    advance(hungry, 55); expect(hungry.harvestCrop(0).accepted).toBe(true); expect(hungry.data.food).toBe(2);
  });
  it('keeps failed-persistence growth in memory and rejects inconsistent schema-six crop state', () => {
    const { store, storage } = ready(); store.plantCrop(0); storage.blocked = true;
    expect(store.advanceFarm(1)).toMatchObject({ changed: true, persisted: false });
    expect(farmGrownSeconds(store.data.farmPlots[0])).toBe(1);
    const data = store.data;
    for (const bad of [{ grownSeconds: -1 }, { grownSeconds: 151 }, { grownSeconds: NaN }, { growth: 2 }, { watered: 'yes' }, { pestsCleared: 1 }]) {
      expect(parseCampProfile({ ...data, farmPlots: [{ ...data.farmPlots[0], ...bad }, ...data.farmPlots.slice(1)] })).toBeNull();
    }
    storage.blocked = false; store.save(); expect(new CampProfileStore(storage).data.farmPlots[0].grownSeconds).toBe(1);
  });
});
