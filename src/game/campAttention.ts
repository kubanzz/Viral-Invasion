import type { CampProfileData } from '../meta/campProfile';
import { CAMP_FACILITIES, type CampStationId } from './campLayout';
import { campHasFacility, canBuildCampFacility } from './campProgression';
import { EXPEDITION_ECONOMY, rarityRank, WEAPON_IDS, type WeaponRarity } from './expedition';
import { CRAFT_RECIPES, isMissionUnlocked, MISSIONS, TEMPLATE_IDS, type TemplateId } from './microfront';

export interface CampStationAttention {
  kind: 'build' | 'mission' | 'equipment' | 'repair' | 'craft' | 'upgrade';
  label: string;
  count: number;
}

/** Collection-level quality, independent of duplicate item identities or the current loadout. */
export function campEquipmentBest(profile: Pick<CampProfileData, 'inventory'>): Partial<Record<TemplateId, WeaponRarity>> {
  const best: Partial<Record<TemplateId, WeaponRarity>> = {};
  for (const item of profile.inventory) {
    if (!item.repaired || rarityRank(item.rarity) <= rarityRank(best[item.templateId] ?? null)) continue;
    best[item.templateId] = item.rarity;
  }
  return best;
}

/** Shared by map markers and menu badges; viewing affordable actions never suppresses them. */
export function campStationAttention(profile: CampProfileData): Partial<Record<CampStationId, CampStationAttention>> {
  const attention: Partial<Record<CampStationId, CampStationAttention>> = {};
  if (!profile.campUnlocked || profile.prologue === 'arrival') return attention;

  for (const station of CAMP_FACILITIES) {
    if (canBuildCampFacility(profile, station.id)) attention[station.id] = { kind: 'build', label: '可建造', count: 1 };
  }

  if (campHasFacility(profile, 'departure') && profile.prologue === 'ready') {
    const count = Object.values(MISSIONS).filter(mission => isMissionUnlocked(mission.id, profile.completedMissions)
      && !profile.completedMissions.includes(mission.id) && !profile.seenMissionIds.includes(mission.id)).length;
    if (count) attention.departure = { kind: 'mission', label: '新情报', count };
  }

  if (campHasFacility(profile, 'warehouse')) {
    const best = campEquipmentBest(profile);
    const count = TEMPLATE_IDS.filter(id => rarityRank(best[id] ?? null) > rarityRank(profile.seenEquipmentQuality[id] ?? null)).length;
    if (count) attention.warehouse = { kind: 'equipment', label: '新装备', count };
  }

  if (campHasFacility(profile, 'forge')) {
    const repairs = WEAPON_IDS.filter(id => profile.weapons[id].pending && profile.materials >= EXPEDITION_ECONOMY.repair).length;
    const crafts = TEMPLATE_IDS.filter(id => Object.values(CRAFT_RECIPES).some(recipe =>
      (profile.fragments[id] ?? 0) >= recipe.fragments && profile.materials >= recipe.materials && profile.cores >= recipe.cores)).length;
    const upgrades = WEAPON_IDS.filter(id => {
      const weapon = profile.weapons[id], cost = EXPEDITION_ECONOMY.upgrade[weapon.upgrade];
      return weapon.repaired && weapon.upgrade < 3 && cost !== undefined && profile.materials >= cost;
    }).length;
    if (repairs) attention.forge = { kind: 'repair', label: '可修复', count: repairs };
    else if (crafts) attention.forge = { kind: 'craft', label: '可打造', count: crafts };
    else if (upgrades) attention.forge = { kind: 'upgrade', label: '可强化', count: upgrades };
  }

  return attention;
}
