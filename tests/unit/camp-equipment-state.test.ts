import { describe, expect, it } from 'vitest';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { CAMP_PROFILE_STORAGE_KEY, CampProfileStore, campDecomposeEligibility, emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { campCraftRarity, createCampEquipmentState, normalizeCampEquipmentState, reduceCampEquipmentAction } from '../../src/ui/campEquipmentState';

function camp(): CampProfileSnapshot {
  const data = emptyCampProfile();
  Object.assign(data, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS] });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}

describe('equipment session presentation state', () => {
  it('opens the equipped weapon and prioritizes a repair even when its cost is unavailable', () => {
    const snapshot = camp(); snapshot.data.weapons.piercing.pending = 'purple';
    const before = structuredClone(snapshot);
    expect(createCampEquipmentState(snapshot)).toMatchObject({ warehouseTab: 'weapons', weaponId: 'steady', forgeTab: 'maintenance', forgeWeaponId: 'piercing', maintenanceMode: 'repair' });
    expect(snapshot).toEqual(before);
  });
  it('opens the first affordable recipe at its highest affordable quality when there is no repair', () => {
    const snapshot = camp(); snapshot.data.materials = 40; snapshot.data.cores = 1; snapshot.data.fragments.PURIFY_CHAIN = 20;
    const state = createCampEquipmentState(snapshot);
    expect(state).toMatchObject({ forgeTab: 'craft', craftTemplateId: 'PURIFY_CHAIN' });
    expect(campCraftRarity(state)).toBe('gold');
  });
  it('starts an unaffordable recipe at the lowest legal quality and keeps legendary recipes gold-only', () => {
    const snapshot = camp(), state = createCampEquipmentState(snapshot);
    expect(campCraftRarity(state)).toBe('blue');
    const legendary = reduceCampEquipmentAction(snapshot, state, 'eq-select-recipe', { template: 'thunder' })!;
    expect(campCraftRarity(legendary)).toBe('gold');
    expect(campCraftRarity(reduceCampEquipmentAction(snapshot, legendary, 'eq-rarity', { rarity: 'blue' })!)).toBe('gold');
    snapshot.data.materials = 100; snapshot.data.cores = 1; snapshot.data.fragments.thunder = 100;
    expect(createCampEquipmentState(snapshot).forgeTab).toBe('maintenance');
  });
  it('initializes each recipe on first selection and remembers manual choices after resource changes', () => {
    const snapshot = camp(), start = createCampEquipmentState(snapshot);
    snapshot.data.materials = 40; snapshot.data.cores = 1; snapshot.data.fragments.PULSE_BREAK = 20;
    const selected = reduceCampEquipmentAction(snapshot, start, 'eq-select-recipe', { template: 'PULSE_BREAK' })!;
    expect(campCraftRarity(selected)).toBe('gold');
    const manual = reduceCampEquipmentAction(snapshot, selected, 'eq-rarity', { rarity: 'purple' })!;
    snapshot.data.materials = 0; snapshot.data.fragments.PULSE_BREAK = 0;
    const other = reduceCampEquipmentAction(snapshot, manual, 'eq-select-recipe', { template: 'steady' })!;
    const returned = reduceCampEquipmentAction(snapshot, other, 'eq-select-recipe', { template: 'PULSE_BREAK' })!;
    expect(campCraftRarity(returned)).toBe('purple');
    expect(start.craftRarities.PULSE_BREAK).toBeUndefined();
  });
  it('changes selection without equipping, clears secondary details, and leaves write actions to the store', () => {
    const snapshot = camp(), before = structuredClone(snapshot);
    let state = createCampEquipmentState(snapshot);
    state = reduceCampEquipmentAction(snapshot, state, 'eq-detail', { detail: 'skills' })!;
    state = reduceCampEquipmentAction(snapshot, state, 'eq-select-weapon', { weapon: 'redblade' })!;
    expect(state).toMatchObject({ weaponId: 'redblade', detail: 'summary' });
    state = reduceCampEquipmentAction(snapshot, state, 'eq-tab', { section: 'warehouse', tab: 'inventory' })!;
    expect(state.warehouseTab).toBe('inventory');
    expect(reduceCampEquipmentAction(snapshot, state, 'camp-equip', { weapon: 'redblade' })).toBeNull();
    expect(snapshot).toEqual(before);
  });
  it('falls back to a remaining inventory item and changes repaired maintenance to upgrade', () => {
    const snapshot = camp(); snapshot.data.inventory.push({ id: 'extra', kind: 'weapon', templateId: 'steady', rarity: 'blue', repaired: true });
    const state = { ...createCampEquipmentState(snapshot), inventoryItemId: 'extra', maintenanceMode: 'repair' as const };
    snapshot.data.inventory.pop();
    expect(normalizeCampEquipmentState(snapshot, state)).toMatchObject({ inventoryItemId: 'starter:steady', maintenanceMode: 'upgrade' });
    snapshot.data.inventory = [];
    expect(normalizeCampEquipmentState(snapshot, state).inventoryItemId).toBeNull();
  });
});

describe('shared inventory decomposition eligibility', () => {
  it('protects the last usable starter and ignores broken copies as replacements', () => {
    const { data } = camp();
    expect(campDecomposeEligibility(data, 'starter:steady')).toMatchObject({ allowed: false, code: 'protected' });
    data.inventory.push({ id: 'broken', kind: 'weapon', templateId: 'steady', rarity: 'gold', repaired: false });
    expect(campDecomposeEligibility(data, 'starter:steady').code).toBe('protected');
    data.inventory.push({ id: 'lower', kind: 'weapon', templateId: 'steady', rarity: 'blue', repaired: true });
    expect(campDecomposeEligibility(data, 'starter:steady').code).toBe('equipped');
    expect(campDecomposeEligibility(data, 'lower').allowed).toBe(true);
  });
  it('permits a duplicate with an equivalent replacement while preserving the active module’s strongest copy', () => {
    const { data } = camp(); data.equippedModules = ['PULSE_BREAK'];
    data.inventory.push({ id: 'm-gold', kind: 'module', templateId: 'PULSE_BREAK', rarity: 'gold', repaired: true },
      { id: 'm-purple', kind: 'module', templateId: 'PULSE_BREAK', rarity: 'purple', repaired: true });
    expect(campDecomposeEligibility(data, 'm-gold').code).toBe('equipped');
    expect(campDecomposeEligibility(data, 'm-purple').allowed).toBe(true);
    data.inventory.push({ id: 'm-gold-2', kind: 'module', templateId: 'PULSE_BREAK', rarity: 'gold', repaired: true });
    expect(campDecomposeEligibility(data, 'm-gold').allowed).toBe(true);
  });
  it('returns the same denial code and message as the persisted mutation without changing a save', () => {
    const snapshot = camp(), entries = new Map([[CAMP_PROFILE_STORAGE_KEY, JSON.stringify(snapshot.data)]]);
    let writes = 0;
    const store = new CampProfileStore({ getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => { entries.set(key, value); writes++; }, removeItem: key => { entries.delete(key); } });
    const before = store.data, baselineWrites = writes;
    const eligibility = campDecomposeEligibility(store.data, 'starter:steady');
    expect(store.decompose('starter:steady')).toMatchObject({ accepted: false, code: eligibility.code, message: eligibility.message });
    expect(store.data).toEqual(before); expect(writes).toBe(baselineWrites);
    expect(campDecomposeEligibility(store.data, 'missing').code).toBe('unavailable');
  });
});
