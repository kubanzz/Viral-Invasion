import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { territorySourceAccessView } from '../../src/ui/territorySourceAccessView';
import { growthDetailsOverlay } from '../../src/ui/growthHud';
import { endlessOverlay } from '../../src/ui/endlessHud';
import { touchCopy } from '../../src/ui/touchCopy';
import { createEndlessGrowth, endlessUpgradeDescription, offerEndlessUpgrade } from '../../src/game/endlessGrowth';

function deployed() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state, front = state.territory!.nodes.find(node => node.id === 'front-north')!;
  state.territory!.defense.north.repelled = state.territory!.defense.south.repelled = true;
  front.owner = 'healthy'; front.infectionProgress = 0;
  Object.assign(state.player, { x: front.x, y: front.y });
  game.step({ moveX: 0, moveY: 0, aim: { x: 2300, y: 1400 }, fire: false, scan: true });
  return state;
}

describe('truthful source supply progress and territory control copy', () => {
  it('tracks the two actual suppliers and source awakening without touching combat', () => {
    const state = deployed(), territory = state.territory!, spring = territory.nodes.find(node => node.id === 'heart-healing-1')!;
    const initial = structuredClone(state);
    expect(territorySourceAccessView(state, 'north')).toMatchObject({ ready:true, step:2, status:'节点已净化 · 第3波感染源苏醒' });
    expect(state).toEqual(initial);
    territory.sources['source-west'].spawned=true;
    expect(territorySourceAccessView(state,'north')!.status).toBe('源膜已解除');
    spring.owner='infected';
    expect(territorySourceAccessView(state,'north')).toMatchObject({ ready:false, step:0, status:'先净化北侧生命泉' });
    spring.owner='healthy'; territory.nodes.find(node=>node.id==='front-north')!.owner='infected';
    expect(territorySourceAccessView(state,'north')).toMatchObject({ ready:false, step:1, status:'净化北线前沿，切断源膜供能' });
    territory.sources['source-west'].destroyed=true;
    expect(territorySourceAccessView(state,'north')).toMatchObject({ active:false, status:'感染源已净化' });
  });

  it('does not turn army losses or missing upgrades into source access requirements', () => {
    const state = deployed(); state.territory!.sources['source-west'].spawned=true;
    for(const cell of state.growth!.cells!)cell.hp=0;
    state.growth!.equipped.find(slot=>slot.id==='IMMUNE_BEACON')!.rank=1;
    state.territory!.defense.north={repelled:false,handoff:false};
    expect(territorySourceAccessView(state,'north')).toMatchObject({ ready:true, status:'源膜已解除' });
  });

  it('keeps old campaign command adaptation while territory F and Q describe context actions', () => {
    const original = 'WASD移动，按Q；按F净化北前线，按F修复心核，按B建设';
    const territory = touchCopy(original, true);
    expect(territory).toContain('驻防'); expect(territory).toContain('点净化组织北前线');
    expect(territory).toContain('点修复心核'); expect(territory).toContain('战术建造');
    expect(territory).not.toContain('扫描'); expect(territory).not.toContain('选择工具 3');
    expect(touchCopy('WASD移动，按Q，按3')).toContain('扫描'); expect(touchCopy('按3')).toContain('选择工具 3');
  });

  it('shows current foot deployment in details and immune cards while preserving historical campaign text', () => {
    const state = deployed(), markup = growthDetailsOverlay(state, '返回战场');
    expect(markup).toContain('脚下驻军'); expect(markup).toContain('满两团');
    expect(markup).not.toContain('准星对准敌体'); expect(markup).not.toContain('Q 指敌围猎');
    delete state.territory;
    expect(growthDetailsOverlay(state, '返回战场')).toContain('准星对准敌体');
    for (let seed = 0; seed < 30; seed++) {
      const growth = createEndlessGrowth(seed); offerEndlessUpgrade(growth, 2);
      const option = growth.draft?.options.find(option => option.id === 'immune');
      if (!option) continue;
      const current = endlessUpgradeDescription(option.description, option.id, true);
      expect(current).toContain('基础驻防开局可用'); expect(current).toContain('Q在脚下部署');
      expect(current).not.toContain('Q 瞄准'); expect(current).not.toContain('驻防已解锁');
      expect(endlessUpgradeDescription(option.description, option.id)).toBe(option.description);
      return;
    }
    throw Error('Expected a real offered immune option in bounded seeds');
  });

  it('keeps hidden battlefield statistics and the frozen equipped weapon truthful in paused details', () => {
    const state = deployed(); state.phase = 'paused';
    state.expedition = { runId: 'equipped-purple', firstClear: false, loadout: { weaponId: 'piercing', rarity: 'purple', upgrade: 1 } };
    state.weaponCombat!.loadout = { ...state.expedition.loadout };
    state.endless!.score = 1234; state.endless!.combo = 7;
    const before = structuredClone(state), markup = endlessOverlay(state, false, false)!;
    expect(markup).toContain('贯脉·回旋刃弓'); expect(markup).toContain('30.5伤害');
    expect(markup).toContain('蓄势穿心'); expect(markup).toContain('回缝风暴'); expect(markup).not.toContain('蜂群追针');
    expect(markup).toContain('每程最多2体'); expect(markup).toContain('间隔0.3s'); expect(markup).toContain('得分1234');
    expect(markup).toContain('连击7'); expect(markup).toContain('净化生命泉'); expect(markup).not.toContain('等待下一队反扑');
    expect(state).toEqual(before);
  });
});
