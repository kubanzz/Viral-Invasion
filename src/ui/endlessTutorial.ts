import type { GameState } from '../game/types';
import type { EndlessUpgradeId } from '../game/endlessGrowthTypes';
import { weaponSkillViews } from '../game/weaponSkills';
import { territoryContextView } from '../game/territory';
import { hostEventMaxHp } from '../game/hostEvents';

const dismissed = new WeakSet<GameState>();
export function dismissWeaponTutorial(state: GameState): void { dismissed.add(state); }

const upgradeCopy = (id: EndlessUpgradeId, touch: boolean): string => {
  const shoot = touch ? '按住右下射击盘，拖动调整方向' : '按住左键，移动鼠标扫过敌群';
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
  if (state.territory) {
    const context = territoryContextView(state);
    if (context.action === 'purify' || context.action === 'repair' || state.territory.purification
      || (state.playerInfection?.until ?? 0) > state.elapsed || state.player.hp / hostEventMaxHp(state) <= .3
      || state.territory.nodes.some(node => node.infectionProgress > 0)) return '';
    if (state.weaponCombat && !dismissed.has(state)) {
      const skills = weaponSkillViews(state);
      if (!guide?.fired) return touch ? '左杆移动，按住右盘普攻；123是当前武器技能。' : '左键持续普攻；123直接释放武器技能，F单独净化组织。';
      if (state.elapsed >= 5 && state.elapsed < 45) {
        const slot = state.elapsed < 14 ? 1 : state.elapsed < 25 ? 2 : 3;
        const skill = skills[slot - 1];
        const tip = state.weaponCombat.loadout.weaponId === 'steady'
          ? ['扇出蜂针会有限追踪前方目标。', '脚下瞬发震环，适合贴身解围。', '普攻加速并追加两根侧针，适合反攻。'][slot - 1]
          : ['锁定方向后蓄势贯穿，先排成直线。', '落地牵引1秒，接穿心贯穿敌群。', '发出后横移，回刃会向你收束。'][slot - 1];
        if (state.weaponCombat.cooldowns[slot] === 0) return `${touch ? `点技能${slot}` : `按${slot}`}：${skill.name}。${tip}`;
      }
      if (state.elapsed >= 45 && state.elapsed < 52) return touch ? '净化单独操作：靠近感染节点，点左侧净化组织。' : '靠近感染节点按F净化；Q在脚下留下军团。';
    }
    if (!guide?.fired) return touch ? '左杆移动，右盘射击；点“净化组织”夺回节点。' : 'WASD移动，左键射击；Q在脚下部署军团，离开后军团留守。';
    if (guide?.upgradeHint && state.elapsed < (guide.upgradeHintUntil ?? 0)) {
      if (guide.upgradeHint === 'immune') return touch ? '军团已增强：走到健康节点附近，点驻防在脚下留守。' : '军团已增强：走到健康前线附近按Q驻防，帮助守住节点。';
      if (state.weaponCombat && guide.upgradeHint === 'nova') return state.weaponCombat.loadout.weaponId === 'steady'
        ? `震环已增强：${touch ? '点技能2' : '按2'}在脚下解围，不需要瞄准。`
        : `束脉锚已增强：${touch ? '点按沿当前方向释放，也可拖动瞄准' : '按2投到瞄准位置'}，持续聚敌后爆破。`;
      if (state.weaponCombat && guide.upgradeHint === 'dash') return '冲刺挥斩已增强；Space只冲刺，123负责武器技能。';
      if (state.weaponCombat && guide.upgradeHint === 'catalysis') return '技能2主爆后会追加一次余震，不重复牵引或击退。';
      return upgradeCopy(guide.upgradeHint, touch);
    }
    // Territory HUD owns the one nearby action/progress hint and infection
    // status, so a tutorial toast never repeats or contradicts that instruction.
    return '';
  }
  if (guide?.tissueHurt && !guide.repaired && state.tissue.hp < state.tissue.maxHp) return touch
    ? '组织受损：靠近十字组织，修复按钮拖向组织后松手。'
    : '组织受损：按 3，瞄准十字组织点击抢修。';
  if (guide?.upgradeHint && state.elapsed < (guide.upgradeHintUntil ?? 0)) return upgradeCopy(guide.upgradeHint, touch);
  if (!guide?.fired) return touch
    ? '左侧移动；按住右下射击盘攻击，拖动调整方向。'
    : 'WASD 移动；鼠标瞄准，按住左键持续射击。';
  if (state.endless.wave >= 2 && state.endless.wave <= 3 && !guide?.deployed) return touch
    ? '可选支援：免疫按钮拖向敌群，松手召来细胞帮忙。'
    : '可选支援：准星指向敌群按 Q，召来细胞帮忙。';
  return '';
}
