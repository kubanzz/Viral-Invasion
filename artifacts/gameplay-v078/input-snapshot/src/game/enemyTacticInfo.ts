import type { EnemyTactic } from './enemyTacticsTypes';

export const ENEMY_TACTIC_INFO: Record<EnemyTactic, { name: string; counter: string }> = {
  melee: { name: '追击体', counter: '拉开距离，用范围裂解或免疫小队处理群体。' },
  'thin-ray': { name: '点射支援', counter: '窄线锁定后侧移；可优先射杀或用范围裂解打断。' },
  'crystal-charge': { name: '晶壳冲锋', counter: '冲锋方向锁定后侧闪，落空后有 2 秒破绽。' },
  'fission-burst': { name: '裂殖双爆', counter: '避开两个固定落点，向没有危险圈的一侧移动。' },
  'mimic-corrosion': { name: '潜伏侵蚀', counter: '朝侵蚀者 Q 扫描可打断并制造破绽，3 可抢修组织。' },
};
