import type { ProtocolId, ResearchDirectionId } from './growthTypes';

export interface ResearchDirectionInfo { id: ResearchDirectionId; title: string; description: string; primary: ProtocolId | null; partner: ProtocolId | null }
export const RESEARCH_DIRECTIONS: Record<ResearchDirectionId, ResearchDirectionInfo> = {
  general: { id: 'general', title: '通用研究', description: '研究三条不同路线，保留泛用候选与当前协议进阶机会。', primary: null, partner: null },
  CARAPACE: { id: 'CARAPACE', title: '晶壳反制', description: '保证共振裂解与连锁净化候选，研究冲流破绽和邻体净化的组合。', primary: 'PULSE_BREAK', partner: 'PURIFY_CHAIN' },
  FISSION: { id: 'FISSION', title: '裂殖反制', description: '保证连锁净化与共振裂解候选，研究收尾跳跃与破绽联动。', primary: 'PURIFY_CHAIN', partner: 'PULSE_BREAK' },
  MIMIC: { id: 'MIMIC', title: '潜伏反制', description: '保证异常显影与免疫灯塔候选，研究显形减速与免疫细胞围猎。', primary: 'EXPOSE_TRACE', partner: 'IMMUNE_BEACON' },
};

/** Only accepted current-run diagnoses unlock directed research choices. */
export function availableResearchDirections(rewardedKeys: readonly string[]): ResearchDirectionId[] {
  return ['general', ...(['CARAPACE', 'FISSION', 'MIMIC'] as const).filter(trait => rewardedKeys.includes(`diagnose:${trait}`))];
}
