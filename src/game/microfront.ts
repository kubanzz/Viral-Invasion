import type { WeaponId, WeaponRarity } from './expedition';
import type { ProtocolId, ProtocolRank } from './growthTypes';

export type MissionId = 'membrane' | 'corridor' | 'boundary';
export type TemplateId = WeaponId | ProtocolId;
export const MODULE_IDS: readonly ProtocolId[] = ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'];
export const TEMPLATE_IDS: readonly TemplateId[] = ['steady', 'piercing', ...MODULE_IDS];
export interface MissionDefinition {
  id: MissionId; name: string; region: string; description: string; threat: string;
  objectives: readonly string[]; reward: string; completionMaterials: number;
  completionFragments: number; fragmentTemplateId: TemplateId;
}
export const MISSIONS: Record<MissionId, MissionDefinition> = {
  membrane: { id: 'membrane', name: '膜隙初染', region: '膜褶浅滩', description: '侦察小队在膜褶间发现了异常聚集的病毒，清除入侵者并稳定这片微域。', threat: '低危',
    objectives: ['净化一个节点', '击破一个感染源', '清除剩余病毒'], reward: '200金币、10生质、2枚共振碎片；首次额外3碎片', completionMaterials: 10, completionFragments: 2, fragmentTemplateId: 'PULSE_BREAK' },
  corridor: { id: 'corridor', name: '纤维回廊', region: '纤维间隙', description: '穿行细胞外基质，截断沿纤维通道蔓延的感染。', threat: '中危',
    objectives: ['夺回两个节点', '摧毁双感染源', '清除精英'], reward: '200金币、15生质、3枚连锁碎片', completionMaterials: 15, completionFragments: 3, fragmentTemplateId: 'PURIFY_CHAIN' },
  boundary: { id: 'boundary', name: '缓流边界', region: '脉流界面', description: '守住两处微域前线，击破藏在膜障后的病毒母巢。', threat: '高危',
    objectives: ['稳住两线微域', '摧毁双感染源', '击破病毒母巢', '完成最后净化'], reward: '200金币、20生质、4枚武器碎片、1锻造核心与母巢战利品', completionMaterials: 20, completionFragments: 4, fragmentTemplateId: 'piercing' },
};
export function isMissionUnlocked(id: MissionId, completed: readonly MissionId[]): boolean {
  return id === 'membrane' || completed.includes(id === 'corridor' ? 'membrane' : 'corridor');
}
export interface MissionItem { templateId: TemplateId; rarity: WeaponRarity; repaired?: boolean }
export interface InventoryItem extends MissionItem { id: string; kind: 'weapon' | 'module'; repaired: boolean }
export interface MissionHaul { coins: number; materials: number; fragments: Partial<Record<TemplateId, number>>; items: MissionItem[]; cores?: number }
export type MissionOutcome = 'success' | 'failure' | 'withdrawn';
export interface MissionStats { attempts: number; successes: number; failures: number; withdrawals: number }
export const emptyMissionHaul = (): MissionHaul => ({ coins: 0, materials: 0, fragments: {}, items: [] });
export const MODULE_NAMES: Record<ProtocolId, string> = { PULSE_BREAK: '共振破膜模组', PURIFY_CHAIN: '净化连锁模组', IMMUNE_BEACON: '免疫灯塔模组', EXPOSE_TRACE: '显影围猎模组' };
export const CRAFT_RECIPES = { blue: { fragments: 5, materials: 10, cores: 0 }, purple: { fragments: 10, materials: 20, cores: 0 }, gold: { fragments: 20, materials: 40, cores: 1 } } as const;
export const DRAW_COST = 100;
export const DRAW_PITY_LIMIT = 50;
export const STARTER_COINS = 5000;
export const DRAW_RARITY_WEIGHTS = { white: 60, blue: 25, purple: 10, gold: 5 } as const;
/** Generous finite-run corruption limits, independent of individual drop tuning. */
export const MISSION_HAUL_LIMITS: Record<MissionId, { coins: number; materials: number; fragments: number; items: number }> = {
  membrane: { coins: 2048, materials: 1024, fragments: 1024, items: 64 },
  corridor: { coins: 4096, materials: 2048, fragments: 2048, items: 128 },
  boundary: { coins: 8192, materials: 4096, fragments: 4096, items: 256 },
};
export const DECOMPOSE_FRAGMENTS: Record<WeaponRarity, number> = { white: 1, blue: 2, purple: 4, gold: 8 };
export const DECOMPOSE_MATERIALS: Record<WeaponRarity, number> = { white: 2, blue: 5, purple: 10, gold: 20 };
export const moduleRank = (rarity: WeaponRarity): ProtocolRank => rarity === 'gold' ? 3 : rarity === 'purple' ? 2 : 1;
export interface AntibodyDrawResult {
  rarity: WeaponRarity; kind: 'materials' | 'fragments' | 'weapon' | 'module' | 'core';
  quantity: number; templateId?: TemplateId; itemId?: string;
}
export interface DrawReceipt {
  id: string; count: 1 | 10; cost: number; results: AntibodyDrawResult[]; pityBefore: number; pityAfter: number;
  /** Absent on historical receipts, which used the original ten-pull guarantee. */
  pityLimit?: typeof DRAW_PITY_LIMIT;
}
export interface MissionReceipt { id: string; runId: string; missionId: MissionId; outcome: MissionOutcome; haul: MissionHaul; firstClear: boolean }
export type CampTransaction = { kind: 'draw'; id: string; receipt: DrawReceipt } | { kind: 'mission'; id: string; receipt: MissionReceipt };
