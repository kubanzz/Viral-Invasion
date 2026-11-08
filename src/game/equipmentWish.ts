import { LEGENDARY_WEAPON_IDS, WEAPONS, type LegendaryWeaponId } from './expedition';
import { MODULE_IDS, MODULE_NAMES, type AntibodyDrawResult } from './microfront';
import type { ProtocolId } from './growthTypes';

export type EquipmentWishId = LegendaryWeaponId | ProtocolId | 'forge-core';
export const EQUIPMENT_WISH_IDS: readonly EquipmentWishId[] = [...LEGENDARY_WEAPON_IDS, ...MODULE_IDS, 'forge-core'];
export const EQUIPMENT_WISH_LIMIT = 100 as const;
export const isEquipmentWishId = (value: unknown): value is EquipmentWishId => EQUIPMENT_WISH_IDS.includes(value as EquipmentWishId);
export const equipmentWishName = (id: EquipmentWishId): string => id === 'forge-core' ? '锻造核心' : id === 'thunder' || id === 'redblade' ? WEAPONS[id].name : MODULE_NAMES[id];
export const matchesEquipmentWish = (result: AntibodyDrawResult, target: EquipmentWishId): boolean => result.rarity === 'gold'
  && (target === 'forge-core' ? result.kind === 'core' : (result.kind === 'weapon' || result.kind === 'module') && result.templateId === target);
