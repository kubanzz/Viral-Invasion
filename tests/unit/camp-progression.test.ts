import { describe, expect, it } from 'vitest';
import { CAMP_CONSTRUCTION_SECONDS, CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS, campHasFacility, campIntroBuilt, canBuildCampFacility, nextCampFacility } from '../../src/game/campProgression';
import { CAMP_FACILITIES, type CampStationId } from '../../src/game/campLayout';
import { CAMP_PROFILE_SCHEMA_VERSION, CAMP_PROFILE_STORAGE_KEY, CampProfileStore, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { STARTER_COINS } from '../../src/game/microfront';

class Storage implements EndlessProfileStorage {
  values = new Map<string, string>(); writes = 0; blocked = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; if (this.blocked) throw Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function build(store: CampProfileStore, id: CampStationId) {
  expect(store.beginBuild(id).accepted).toBe(true); expect(store.completeBuild(id).accepted).toBe(true);
}
function stored(data: ReturnType<typeof emptyCampProfile>) {
  const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
  return { storage, store: new CampProfileStore(storage) };
}

describe('player-built introductory camp', () => {
  it('keeps the five introductory requirements explicit while sharing facility metadata with geometry', () => {
    expect(INTRO_FACILITY_IDS).toEqual(['warehouse', 'forge', 'shop', 'summon', 'departure']);
    expect(CAMP_FACILITIES.map(facility => facility.id)).toEqual([...INTRO_FACILITY_IDS, 'farm', 'house']);
    const arrival = emptyCampProfile(), established = { ...arrival, campUnlocked: true, prologue: 'building' as const };
    for (const id of INTRO_FACILITY_IDS) {
      const definition = CAMP_FACILITY_PROGRESS[id], geometry = CAMP_FACILITIES.find(facility => facility.id === id)!;
      expect(definition.requiredForIntro).toBe(true); expect(definition.prerequisites).toEqual([]);
      expect(definition.purpose.length).toBeGreaterThan(0); expect(definition.section.length).toBeGreaterThan(0);
      expect(geometry).toMatchObject({ id, position: definition.position, footprint: definition.footprint, interactionOffset: definition.interactionOffset, logicalWidth: definition.logicalWidth });
      expect(geometry).not.toHaveProperty('purpose');
      expect(canBuildCampFacility(arrival, id)).toBe(false); expect(canBuildCampFacility(established, id)).toBe(true);
      expect(canBuildCampFacility({ ...established, activeConstruction: 'warehouse' }, id)).toBe(false);
      expect(canBuildCampFacility({ ...established, builtFacilities: [id] }, id)).toBe(false);
    }
  });
  it('requires five individual confirmations in any order, without charging the starting economy', () => {
    const store = new CampProfileStore(new Storage());
    expect(CAMP_CONSTRUCTION_SECONDS).toBe(2); expect(nextCampFacility(store.data)).toBe('warehouse');
    expect(store.beginBuild('warehouse').code).toBe('locked');
    expect(store.establishCamp().accepted).toBe(true);
    expect(store.finishCampIntro().code).toBe('incomplete');
    for (const [index, id] of [...INTRO_FACILITY_IDS].reverse().entries()) {
      build(store, id);
      expect(campHasFacility(store.data, id)).toBe(true);
      expect(store.data.prologue).toBe(index === 4 ? 'ready' : 'building');
      expect(store.data.materials).toBe(0); expect(store.data.coins).toBe(STARTER_COINS);
      if (index < 4) expect(() => store.beginExpedition(`early-${index}`, 1, 'membrane')).toThrow();
    }
    expect(campIntroBuilt(store.data)).toBe(true); expect(nextCampFacility(store.data)).toBeUndefined();
    expect(store.data.campIntroSeen).toBe(true);
    expect(store.beginExpedition('ready', 1, 'membrane').missionId).toBe('membrane');
  });

  it('persists only construction start and completion, resumes a single plot and rejects duplicate completion', () => {
    const storage = new Storage(), store = new CampProfileStore(storage); store.establishCamp(); build(store, 'warehouse');
    const before = storage.writes;
    expect(store.beginBuild('forge').accepted).toBe(true); expect(storage.writes).toBe(before + 1);
    expect(store.beginBuild('forge').code).toBe('already-building');
    expect(store.beginBuild('shop').code).toBe('busy'); expect(store.completeBuild('shop').code).toBe('inactive');
    expect(storage.writes).toBe(before + 1);
    const restored = new CampProfileStore(storage);
    expect(restored.data.activeConstruction).toBe('forge'); expect(restored.data.builtFacilities).toEqual(['warehouse']);
    expect(restored.completeBuild('forge').accepted).toBe(true); expect(storage.writes).toBe(before + 2);
    const completed = restored.data;
    expect(restored.completeBuild('forge').code).toBe('already-built'); expect(restored.data).toEqual(completed);
    expect(storage.writes).toBe(before + 2); expect(new CampProfileStore(storage).data).toEqual(completed);
  });

  it('keeps a failed save in memory and retries without duplicating a completed building', () => {
    const storage = new Storage(), store = new CampProfileStore(storage); store.establishCamp(); store.beginBuild('warehouse');
    storage.blocked = true;
    expect(store.completeBuild('warehouse')).toMatchObject({ accepted: true, persisted: false });
    expect(store.status.code).toBe('write-failed'); expect(store.completeBuild('warehouse').accepted).toBe(false);
    storage.blocked = false; store.save();
    expect(new CampProfileStore(storage).data.builtFacilities).toEqual(['warehouse']);
  });

  it('enforces the service building in the store while allowing completed services during construction of the camp', () => {
    const data = emptyCampProfile();
    Object.assign(data, { legacyMigrationChecked: true, prologue: 'building', campUnlocked: true, materials: 100, coins: 100,
      fragments: { PULSE_BREAK: 5 }, weapons: { ...data.weapons, piercing: { repaired: null, pending: 'blue', upgrade: 0 } } });
    const { store } = stored(data), before = store.data;
    expect(store.craft('PULSE_BREAK', 'blue').accepted).toBe(false); expect(store.repair('piercing').accepted).toBe(false);
    expect(store.upgrade('steady').accepted).toBe(false); expect(store.equip('piercing').accepted).toBe(false);
    expect(store.equipModule('PULSE_BREAK').accepted).toBe(false); expect(store.decompose('starter:steady').accepted).toBe(false);
    expect(store.drawAntibodies(1, 'early').accepted).toBe(false); expect(store.buyAntibody().accepted).toBe(false);
    expect(store.selectMission('membrane').accepted).toBe(false); expect(store.data).toEqual(before);
    build(store, 'forge');
    expect(store.craft('PULSE_BREAK', 'blue').accepted).toBe(true); expect(store.repair('piercing').accepted).toBe(true);
    expect(store.upgrade('steady').accepted).toBe(true); expect(store.equip('piercing').accepted).toBe(false);
    build(store, 'warehouse');
    expect(store.equip('piercing').accepted).toBe(true); expect(store.equipModule('PULSE_BREAK').accepted).toBe(true);
    build(store, 'shop'); expect(store.buyAntibody().accepted).toBe(true);
    build(store, 'summon'); expect(store.data.prologue).toBe('building'); expect(store.drawAntibodies(1, 'open').accepted).toBe(true);
    expect(() => store.beginExpedition('still-building', 1, 'membrane')).toThrow();
    build(store, 'departure'); expect(store.selectMission('membrane').accepted).toBe(true);
  });
});

describe('camp schema and content read state', () => {
  it('migrates completed schema 1/2 camps with all buildings and current content already read', () => {
    const data = emptyCampProfile();
    Object.assign(data, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', completedMissions: ['membrane'],
      inventory: [...data.inventory, { id: 'old:module', templateId: 'PULSE_BREAK', kind: 'module', rarity: 'purple', repaired: true }] });
    const parsed = parseCampProfile({ ...data, schemaVersion: 2 })!;
    expect(parsed.schemaVersion).toBe(CAMP_PROFILE_SCHEMA_VERSION); expect(parsed.builtFacilities).toEqual(INTRO_FACILITY_IDS);
    expect(parsed.seenMissionIds).toEqual(['membrane', 'corridor']); expect(parsed.seenEquipmentQuality).toEqual({ steady: 'purple', PULSE_BREAK: 'purple' });
    expect(parseCampProfile({ ...data, schemaVersion: 1 })?.builtFacilities).toEqual(INTRO_FACILITY_IDS);
  });

  it('migrates the old automatic construction into unbuilt plots without completing the camp', () => {
    const data = { ...emptyCampProfile(), schemaVersion: 2, campUnlocked: true, prologue: 'building' };
    const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
    const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, prologue: 'building', campIntroSeen: false, builtFacilities: [] });
    expect(store.finishCampIntro().code).toBe('incomplete'); expect(store.beginBuild('warehouse').accepted).toBe(true);
    expect(JSON.parse(storage.getItem(CAMP_PROFILE_STORAGE_KEY)!).schemaVersion).toBe(CAMP_PROFILE_SCHEMA_VERSION);
    expect(parseCampProfile({ ...emptyCampProfile(), schemaVersion: 2 })?.builtFacilities).toEqual([]);
  });

  it('preserves an old earned camp whose prologue was still arrival and saves a reloadable schema 3', () => {
    const data = { ...emptyCampProfile(), schemaVersion: 2, campUnlocked: true, prologue: 'arrival', legacyMigrationChecked: true };
    const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
    const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, prologue: 'ready', campIntroSeen: true, builtFacilities: INTRO_FACILITY_IDS });
    expect(new CampProfileStore(storage).data).toEqual(store.data);
    expect(parseCampProfile({ ...emptyCampProfile(), schemaVersion: 2, prologue: 'ready' })).toBeNull();
    expect(parseCampProfile({ ...emptyCampProfile(), schemaVersion: 2, prologue: 'building' })).toBeNull();
  });

  it('marks only currently available information and usable equipment, preserving a higher read quality', () => {
    const data = emptyCampProfile();
    Object.assign(data, { legacyMigrationChecked: true, campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS],
      completedMissions: ['membrane'], seenEquipmentQuality: { steady: 'purple' },
      inventory: [...data.inventory, { id: 'new:module', templateId: 'PULSE_BREAK', kind: 'module', rarity: 'blue', repaired: true },
        { id: 'broken:weapon', templateId: 'piercing', kind: 'weapon', rarity: 'gold', repaired: false }] });
    const { store, storage } = stored(data);
    expect(store.markCampSectionSeen('missions').accepted).toBe(true); expect(store.data.seenMissionIds).toEqual(['membrane', 'corridor']);
    expect(store.markCampSectionSeen('warehouse').accepted).toBe(true);
    expect(store.data.seenEquipmentQuality).toEqual({ steady: 'purple', PULSE_BREAK: 'blue' });
    const writes = storage.writes;
    expect(store.markCampSectionSeen('missions').accepted).toBe(false); expect(store.markCampSectionSeen('warehouse').accepted).toBe(false);
    expect(storage.writes).toBe(writes); expect(new CampProfileStore(storage).data.seenEquipmentQuality).toEqual(store.data.seenEquipmentQuality);
    expect(store.markCampSectionSeen('forge' as 'warehouse').code).toBe('invalid-section');
  });

  it('rejects impossible schema 3 construction and unsupported read identifiers', () => {
    const data = emptyCampProfile();
    const building = { ...data, campUnlocked: true, prologue: 'building', builtFacilities: ['warehouse'] };
    expect(parseCampProfile({ ...building, activeConstruction: 'warehouse' })).toBeNull();
    expect(parseCampProfile({ ...building, activeConstruction: 'unknown' })).toBeNull();
    expect(parseCampProfile({ ...building, builtFacilities: ['warehouse', 'warehouse'] })).toBeNull();
    expect(parseCampProfile({ ...building, builtFacilities: [...INTRO_FACILITY_IDS] })).toBeNull();
    expect(parseCampProfile({ ...data, prologue: 'ready', campUnlocked: true, campIntroSeen: true })).toBeNull();
    expect(parseCampProfile({ ...data, builtFacilities: ['forge'] })).toBeNull();
    expect(parseCampProfile({ ...data, seenMissionIds: ['unknown'] })).toBeNull();
    expect(parseCampProfile({ ...data, seenMissionIds: ['boundary'] })).toBeNull();
    expect(parseCampProfile({ ...data, seenMissionIds: ['membrane', 'membrane'] })).toBeNull();
    expect(parseCampProfile({ ...data, seenEquipmentQuality: { unknown: 'gold' } })).toBeNull();
    expect(parseCampProfile({ ...data, seenEquipmentQuality: { steady: 'unknown' } })).toBeNull();
    const activeExpedition = { runId: 'forged', seed: 1, loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 }, extraAntibodies: 0, firstClear: true, blueprints: [], missionId: 'membrane' };
    expect(parseCampProfile({ ...data, activeExpedition })).toBeNull();
  });
});
