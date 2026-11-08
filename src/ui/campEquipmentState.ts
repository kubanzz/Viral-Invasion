import { isLegendaryWeaponId, isWeaponId, WEAPON_IDS, type WeaponId, type WeaponRarity } from '../game/expedition';
import { CRAFT_RECIPES, MODULE_IDS, TEMPLATE_IDS, type TemplateId } from '../game/microfront';
import type { ProtocolId } from '../game/growthTypes';
import { canCraftTemplate, type CampProfileSnapshot } from '../meta/campProfile';

export type CampCraftRarity = Exclude<WeaponRarity, 'white'>;
export type CampEquipmentDetail = 'summary' | 'skills' | 'info' | 'ledger' | 'sources';
/** Session-only presentation state. Selecting or inspecting equipment never edits a save. */
export interface CampEquipmentState {
  warehouseTab: 'weapons' | 'modules' | 'inventory';
  forgeTab: 'maintenance' | 'craft';
  weaponId: WeaponId;
  moduleId: ProtocolId;
  inventoryItemId: string | null;
  forgeWeaponId: WeaponId;
  craftTemplateId: TemplateId;
  craftRarities: Partial<Record<TemplateId, CampCraftRarity>>;
  maintenanceMode: 'repair' | 'upgrade';
  detail: CampEquipmentDetail;
}

function canAfford(snapshot: CampProfileSnapshot, id: TemplateId, rarity: CampCraftRarity): boolean {
  const { data } = snapshot, recipe = CRAFT_RECIPES[rarity];
  return canCraftTemplate(data, id, rarity) && (data.fragments[id] ?? 0) >= recipe.fragments
    && data.materials >= recipe.materials && data.cores >= recipe.cores;
}
export function initialCampCraftRarity(snapshot: CampProfileSnapshot, id: TemplateId): CampCraftRarity {
  if (isLegendaryWeaponId(id)) return 'gold';
  return (['gold', 'purple', 'blue'] as const).find(rarity => canAfford(snapshot, id, rarity)) ?? 'blue';
}

export function createCampEquipmentState(snapshot: CampProfileSnapshot): CampEquipmentState {
  const { data } = snapshot;
  const pending = WEAPON_IDS.find(id => data.weapons[id].pending);
  const forgeWeaponId = pending ?? data.equipped;
  const affordable = TEMPLATE_IDS.find(id => canAfford(snapshot, id, initialCampCraftRarity(snapshot, id)));
  const craftTemplateId = affordable ?? forgeWeaponId;
  return {
    warehouseTab: 'weapons', forgeTab: !pending && affordable ? 'craft' : 'maintenance', weaponId: data.equipped,
    moduleId: data.equippedModules.find(id => MODULE_IDS.includes(id))
      ?? MODULE_IDS.find(id => data.inventory.some(item => item.templateId === id && item.repaired)) ?? MODULE_IDS[0],
    inventoryItemId: data.inventory[0]?.id ?? null, forgeWeaponId,
    craftTemplateId, craftRarities: { [craftTemplateId]: initialCampCraftRarity(snapshot, craftTemplateId) },
    maintenanceMode: pending ? 'repair' : 'upgrade', detail: 'summary',
  };
}

export function campCraftRarity(state: CampEquipmentState): CampCraftRarity {
  return isLegendaryWeaponId(state.craftTemplateId) ? 'gold' : state.craftRarities[state.craftTemplateId] ?? 'blue';
}

export function normalizeCampEquipmentState(snapshot: CampProfileSnapshot, value: CampEquipmentState): CampEquipmentState {
  const defaults = createCampEquipmentState(snapshot), state = { ...value, craftRarities: { ...value.craftRarities } };
  if (!['weapons', 'modules', 'inventory'].includes(state.warehouseTab)) state.warehouseTab = defaults.warehouseTab;
  if (!['maintenance', 'craft'].includes(state.forgeTab)) state.forgeTab = defaults.forgeTab;
  if (!isWeaponId(state.weaponId)) state.weaponId = defaults.weaponId;
  if (!isWeaponId(state.forgeWeaponId)) state.forgeWeaponId = defaults.forgeWeaponId;
  if (!MODULE_IDS.includes(state.moduleId)) state.moduleId = defaults.moduleId;
  if (!TEMPLATE_IDS.includes(state.craftTemplateId)) state.craftTemplateId = defaults.craftTemplateId;
  if (!snapshot.data.inventory.some(item => item.id === state.inventoryItemId)) state.inventoryItemId = defaults.inventoryItemId;
  if (!['repair', 'upgrade'].includes(state.maintenanceMode)) state.maintenanceMode = defaults.maintenanceMode;
  if (state.maintenanceMode === 'repair' && !snapshot.data.weapons[state.forgeWeaponId].pending) state.maintenanceMode = 'upgrade';
  if (!['summary', 'skills', 'info', 'ledger', 'sources'].includes(state.detail)) state.detail = 'summary';
  for (const id of TEMPLATE_IDS) {
    const rarity = state.craftRarities[id];
    if (rarity && !['blue', 'purple', 'gold'].includes(rarity)) delete state.craftRarities[id];
    if (isLegendaryWeaponId(id)) state.craftRarities[id] = 'gold';
  }
  state.craftRarities[state.craftTemplateId] ??= initialCampCraftRarity(snapshot, state.craftTemplateId);
  return state;
}

export function reduceCampEquipmentAction(snapshot: CampProfileSnapshot, value: CampEquipmentState, action: string,
  dataset: Readonly<Record<string, string | undefined>>): CampEquipmentState | null {
  if (!action.startsWith('eq-')) return null;
  const state = normalizeCampEquipmentState(snapshot, value);
  if (action === 'eq-tab') {
    if (dataset.section === 'warehouse' && ['weapons', 'modules', 'inventory'].includes(dataset.tab ?? ''))
      state.warehouseTab = dataset.tab as CampEquipmentState['warehouseTab'];
    if (dataset.section === 'forge' && ['maintenance', 'craft'].includes(dataset.tab ?? ''))
      state.forgeTab = dataset.tab as CampEquipmentState['forgeTab'];
    state.detail = 'summary';
  } else if (action === 'eq-select-weapon' && isWeaponId(dataset.weapon)) {
    state.weaponId = dataset.weapon; state.detail = 'summary';
  } else if (action === 'eq-select-module' && MODULE_IDS.includes(dataset.module as ProtocolId)) {
    state.moduleId = dataset.module as ProtocolId; state.detail = 'summary';
  } else if (action === 'eq-select-inventory' && snapshot.data.inventory.some(item => item.id === dataset.item)) {
    state.inventoryItemId = dataset.item!; state.detail = 'summary';
  } else if (action === 'eq-select-maintenance' && isWeaponId(dataset.weapon)) {
    state.forgeWeaponId = dataset.weapon; state.detail = 'summary';
    state.maintenanceMode = snapshot.data.weapons[dataset.weapon].pending ? 'repair' : 'upgrade';
  } else if (action === 'eq-maintenance-mode' && ['repair', 'upgrade'].includes(dataset.mode ?? '')) {
    state.maintenanceMode = dataset.mode as CampEquipmentState['maintenanceMode']; state.detail = 'summary';
  } else if (action === 'eq-select-recipe' && TEMPLATE_IDS.includes(dataset.template as TemplateId)) {
    state.craftTemplateId = dataset.template as TemplateId; state.detail = 'summary';
  } else if (action === 'eq-rarity' && ['blue', 'purple', 'gold'].includes(dataset.rarity ?? '')) {
    state.craftRarities[state.craftTemplateId] = isLegendaryWeaponId(state.craftTemplateId) ? 'gold' : dataset.rarity as CampCraftRarity;
  } else if (action === 'eq-detail' && ['summary', 'skills', 'info', 'ledger', 'sources'].includes(dataset.detail ?? '')) {
    state.detail = dataset.detail as CampEquipmentDetail;
  }
  return normalizeCampEquipmentState(snapshot, state);
}
