import { SeedRng } from '../core/rng';

export type BlueprintId = 'launch-pod' | 'rapid-launch-pod';
export type WeaponId = 'steady' | 'piercing';
export type WeaponRarity = 'white' | 'blue' | 'purple' | 'gold';
export const BLUEPRINT_IDS: readonly BlueprintId[] = ['launch-pod', 'rapid-launch-pod'];
export const WEAPON_IDS: readonly WeaponId[] = ['steady', 'piercing'];
export const RARITIES: readonly WeaponRarity[] = ['white', 'blue', 'purple', 'gold'];
export const RARITY_NAMES: Record<WeaponRarity, string> = { white: '普通', blue: '精良', purple: '史诗', gold: '传说' };
export const RARITY_BONUS: Record<WeaponRarity, number> = { white: 0, blue: .03, purple: .06, gold: .09 };
export const DUPLICATE_MATERIALS: Record<WeaponRarity, number> = { white: 2, blue: 8, purple: 12, gold: 20 };
export const WEAPONS: Record<WeaponId, { name: string; damage: number; extraPierce: number; description: string }> = {
  steady: { name: '稳流·蜂巢针枪', damage: 34, extraPierce: 0, description: '快速针弹，蜂群追击；超载时追加两根侧针。' },
  piercing: { name: '贯脉·回旋刃弓', damage: 28, extraPierce: 1, description: '慢速宽月牙去回各贯穿两体，横移改变回收路线。' },
};
export const EXPEDITION_ECONOMY = { repair: 10, upgrade: [8, 12, 16] as readonly number[], antibody: 5, maximumExtraAntibodies: 2, bossMaterials: 40 } as const;

/** A departure snapshot; camp mutations never change an already running battle. */
export interface ExpeditionLoadout { weaponId: WeaponId; rarity: WeaponRarity; upgrade: number }
export const DEFAULT_EXPEDITION_LOADOUT: Readonly<ExpeditionLoadout> = Object.freeze({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
export interface BossLoot {
  id: string; runId: string; bossId: 'heart-mother'; weaponId: WeaponId; rarity: WeaponRarity;
  blueprintId: 'rapid-launch-pod'; materials: number;
}
export interface ExpeditionRuntime {
  runId: string; loadout: ExpeditionLoadout; firstClear: boolean; pendingLoot?: BossLoot; lootCollected?: boolean;
}
export interface ExpeditionDeparture {
  runId: string; seed: number; loadout: ExpeditionLoadout; blueprints: BlueprintId[]; extraAntibodies: number; firstClear: boolean;
}
export function rarityRank(value: WeaponRarity | null): number { return value === null ? -1 : RARITIES.indexOf(value); }
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
/** Stable for one expedition; reopening the loot panel can never reroll it. */
export function createBossLoot(runId: string, seed: number, firstClear: boolean): BossLoot {
  const rng = new SeedRng((seed ^ hash(runId) ^ 0x150b055) >>> 0), roll = rng.next();
  const rarity: WeaponRarity = roll >= .9 ? 'gold' : firstClear || roll >= .6 ? 'purple' : 'blue';
  return { id: `boss-loot:${runId}:heart`, runId, bossId: 'heart-mother', weaponId: firstClear || rng.next() >= .5 ? 'piercing' : 'steady',
    rarity, blueprintId: 'rapid-launch-pod', materials: EXPEDITION_ECONOMY.bossMaterials };
}
export function weaponCombatProfile(loadout: ExpeditionLoadout, localMultiplier = 1) {
  const definition = WEAPONS[loadout.weaponId];
  const bonus = Math.min(.18, RARITY_BONUS[loadout.rarity] + Math.max(0, Math.min(3, loadout.upgrade)) * .03);
  return { baseDamage: definition.damage, primaryDamage: definition.damage * (1 + bonus) * localMultiplier,
    permanentMultiplier: 1 + bonus, extraPierce: definition.extraPierce, weaponId: loadout.weaponId };
}

