import type { TraitId, TraitInfo } from './battleTypes';

export const TRAITS: Record<TraitId, TraitInfo> = {
  CARAPACE: { id: 'CARAPACE', name: '晶壳', symbol: '◇', ability: '正面射击伤害降低 70%', cost: '移动速度降低 38%，转身慢', counter: '近身侧绕至背面射击；阀门 E 冲流使晶壳暴露 4 秒' },
  FISSION: { id: 'FISSION', name: '裂殖', symbol: '⋈', ability: '母体死亡后分出 2 个小体', cost: '小体仅 22 耐久且不能继续分裂', counter: '2 牵引裂解；群体保持聚集时一并清除' },
  MIMIC: { id: 'MIMIC', name: '潜伏', symbol: '◌', ability: '拟态组织，优先侵蚀组织', cost: '移动速度降低 50%；每 6 秒扰动 1.2 秒', counter: 'Q 扫描显形 5 秒；基础射击仍有效；3 修复组织，同时伤害并显露附近潜伏体' },
};

/** All combat timings use simulation seconds. Presentation reads the same values. */
export const BATTLE_BALANCE = {
  maxActors: 24, spreadInterval: 6, spawnInterval: 8,
  warningDuration: 8, firstWarningAt: 14, secondWarningDelay: 10,
  enemySpeed: 64, attackWindup: .72, attackInterval: 2.2, attackRadius: 58,
  playerDamage: 7, tissueDamage: 4,
  ordinaryHp: 68, sourceHp: 238, eliteHp: 238, childHp: 22,
  fissionDelay: .8,
  pulseRange: 470, pulseHalfAngle: .64, pulsePush: 145, pulseCooldown: 8,
  pulseCost: 4, pulseExpose: 4, pulseCycle: 6, chargeDuration: 2, surgeDuration: 1,
  carapaceSpeed: .62, carapaceResistance: .3,
  mimicSpeed: .5, mimicPeriod: 6, mimicDisturbance: 1.2, scanReveal: 5,
  crisisDuration: 15, organAlarmAt: 30, organCollapseDelay: 8,
  sourceRelief: 14, killRelief: 1.25, repairRelief: 1.5,
  tissueInfectionDamage: .12,
} as const;
