import type { WeaponRarity } from './expedition';

export const LEGION_IDS = ['phagocyte', 'ranger', 'seraph'] as const;
export type LegionId = typeof LEGION_IDS[number];
export interface LegionDeployment { legionId: LegionId; slot: 0 | 1; fed: boolean }
export interface CampMissionProgress { combatSeconds: number; kills: number }
export interface FarmPlot {
  planted: boolean; growth: number;
  /** Simulation seconds and optional care receipts; legacy growth remains readable. */
  grownSeconds?: number; watered?: boolean; pestsCleared?: boolean;
}
export const FARM_BALANCE = { plots: 3, maturity: 2, harvest: 2, starterFood: 6, weakFactor: .75 } as const;
export interface LegionDefinition {
  id: LegionId; name: string; rarity: WeaponRarity; description: string; duplicateMaterials: number;
  damageFactor: number; healthFactor: number; speed: number; color: string;
}
export const LEGIONS: Record<LegionId, LegionDefinition> = {
  phagocyte: { id: 'phagocyte', name: '吞噬卫队', rarity: 'blue', description: '坚守前线的免疫卫兵。基础军团免费拥有，最多编入两支。', duplicateMaterials: 10, damageFactor: 1, healthFactor: 1, speed: 190, color: '#9dcda9' },
  ranger: { id: 'ranger', name: '游猎军团', rarity: 'purple', description: '高速游猎，移动更快，攻击提高25%，生命降低10%。', duplicateMaterials: 20, damageFactor: 1.25, healthFactor: .9, speed: 230, color: '#c2a5e5' },
  seraph: { id: 'seraph', name: '曜卫·圣裁军团', rarity: 'gold', description: '一位圣裁统领、两位侧翼枪卫与一位棱光咏卫。蓄力突刺、交错冲锋与三束棱光协同，全军总攻击提高80%；Q围猎由统领近战追加圣裁穿刺。', duplicateMaterials: 50, damageFactor: 1.8, healthFactor: 1, speed: 210, color: '#f2d28e' },
};
export const isLegionId = (value: unknown): value is LegionId => LEGION_IDS.includes(value as LegionId);
export function legionDeployment(loadout: readonly (LegionId | null)[], food: number): LegionDeployment[] {
  let available = food;
  return loadout.flatMap((legionId, slot) => legionId ? [{ legionId, slot: slot as 0 | 1, fed: available-- > 0 }] : []);
}
export function effectiveCampExpedition(outcome: string, progress?: CampMissionProgress): boolean {
  return outcome === 'success' || !!progress && Number.isFinite(progress.combatSeconds) && progress.combatSeconds >= 60
    && Number.isSafeInteger(progress.kills) && progress.kills >= 5;
}
