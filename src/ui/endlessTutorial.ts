import type { GameState } from '../game/types';
import type { EndlessUpgradeId } from '../game/endlessGrowthTypes';

const upgradeCopy = (id: EndlessUpgradeId, touch: boolean): string => {
  const shoot = touch ? '按住右下净化盘，拖动调整方向' : '按住左键，移动鼠标扫过敌群';
  const copy: Record<EndlessUpgradeId, string> = {
    multishot: `扇射已进化：${shoot}，一次清除更多病毒。`,
    nova: touch ? '能量炮已强化：按下能量炮、拖向敌群，松手范围爆炸。' : '能量炮已强化：按 2，瞄准敌群按住左键连发爆破。',
    dash: touch ? '挥斩已解锁：点冲刺近身挥刀；长按、拖动定向，松开发射剑气。' : '挥斩已解锁：点 Space 近身挥刀；长按蓄能，松开发射剑气。',
    pierce: `贯穿已进化：${shoot}，对准前后成列的病毒。`,
    power: '火力已增强：下一波用同样的攻击，感受清除速度。',
    scan: touch ? '免疫爆发已解锁：敌群靠近时释放免疫，扫描并引爆。' : '扫描爆发已解锁：敌群靠近时按 Q，扫描并引爆。',
    vitality: '耐久上限已提高，继续移动，留意敌人的攻击预警。',
    haste: `射速已提高：${shoot}，持续压制敌群。`,
    immune: touch ? '军团已增强：免疫按钮拖向敌群，松手部署或指挥。' : '军团已增强：准星指向敌群按 Q，部署或指挥细胞。',
    catalysis: touch ? '净化余震已解锁：能量炮爆炸后，原爆心自动追加一次余震。' : '净化余震已解锁：用 2 发射，主爆后0.35秒自动追加余震。',
  };
  return copy[id];
};

/** One context-sensitive instruction. Presentation never acknowledges an action. */
export function endlessTutorialHint(state: GameState, touch = false): string {
  if (!state.endless || state.phase !== 'playing') return '';
  const guide = state.endless.tutorial;
  if (guide?.tissueHurt && !guide.repaired && state.tissue.hp < state.tissue.maxHp) return touch
    ? '组织受损：靠近十字组织，修复按钮拖向组织后松手。'
    : '组织受损：按 3，瞄准十字组织点击抢修。';
  if (guide?.upgradeHint && state.elapsed < (guide.upgradeHintUntil ?? 0)) return upgradeCopy(guide.upgradeHint, touch);
  if (!guide?.fired) return touch
    ? '左侧移动；按住右下净化盘攻击，拖动调整方向。'
    : 'WASD 移动；鼠标瞄准，按住左键持续射击。';
  if (state.endless.wave >= 2 && state.endless.wave <= 3 && !guide?.deployed) return touch
    ? '可选支援：免疫按钮拖向敌群，松手召来细胞帮忙。'
    : '可选支援：准星指向敌群按 Q，召来细胞帮忙。';
  return '';
}
