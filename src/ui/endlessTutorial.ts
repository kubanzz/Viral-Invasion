import type { GameState } from '../game/types';
import type { EndlessUpgradeId } from '../game/endlessGrowthTypes';

const upgradeCopy = (id: EndlessUpgradeId, touch: boolean): string => {
  const shoot = touch ? '按住右下净化盘，拖动调整方向' : '按住左键，移动鼠标扫过敌群';
  const copy: Record<EndlessUpgradeId, string> = {
    multishot: `扇射已进化：${shoot}，一次清除更多病毒。`,
    nova: touch ? '爆破已扩大：按下裂解、拖向敌群，松手聚拢爆破。' : '爆破已扩大：按 2，瞄准敌群点击，聚拢后一起爆破。',
    dash: touch ? '挥斩已解锁：朝敌群移动时点冲刺，落点挥刀清场。' : '挥斩已解锁：朝敌群移动时按 Space，落点挥刀清场。',
    pierce: `贯穿已进化：${shoot}，对准前后成列的病毒。`,
    power: '火力已增强：下一波用同样的攻击，感受清除速度。',
    scan: touch ? '免疫爆发已解锁：敌群靠近时释放免疫，扫描并引爆。' : '扫描爆发已解锁：敌群靠近时按 Q，扫描并引爆。',
    vitality: '耐久上限已提高，继续移动，留意敌人的攻击预警。',
    haste: `射速已提高：${shoot}，持续压制敌群。`,
    immune: touch ? '军团已增强：免疫按钮拖向敌群，松手部署或指挥。' : '军团已增强：准星指向敌群按 Q，部署或指挥细胞。',
    catalysis: touch ? '催化已解锁：先用裂解铺标，再用净化射击引爆。' : '催化已解锁：先用 2 铺标，再切 1 射击引爆。',
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
