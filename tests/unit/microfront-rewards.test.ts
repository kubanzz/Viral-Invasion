import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { MissionHaul, MissionReceipt } from '../../src/game/microfront';
import type { EndlessProfileStatus } from '../../src/meta/endlessProfile';
import { missionPauseOverlay, missionResultOverlay } from '../../src/ui/microfrontHud';

function missionState() {
  const game = new GameSession(20261106, { mode: 'endless', territory: true }); game.start();
  game.configureExpedition({ runId: 'reward-ui-run', seed: game.state.seed,
    loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 }, blueprints: [], extraAntibodies: 0,
    firstClear: true, missionId: 'membrane', modules: [] });
  game.state.phase = 'result';
  game.state.result = { success: true, reason: '微区已清剿' };
  return game.state;
}

function receipt(haul: Partial<MissionHaul> = {}, outcome: MissionReceipt['outcome'] = 'success'): MissionReceipt {
  return { id: 'reward-ui-receipt', runId: 'reward-ui-run', missionId: 'membrane', outcome,
    firstClear: outcome === 'success', haul: { coins: 0, materials: 0, fragments: {}, items: [], ...haul } };
}

function attributes(markup: string): Record<string, string> {
  return Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}
function cards(html: string): (Record<string, string> & { html: string })[] {
  return [...html.matchAll(/<li\b[^>]*class="[^"]*\bmission-loot-card\b[^"]*"[^>]*>[\s\S]*?<\/li>/g)]
    .map(match => ({ ...attributes(match[0].slice(0, match[0].indexOf('>') + 1)), html: match[0] }));
}
function resource(html: string, kind: 'coins' | 'materials') {
  return [...html.matchAll(/<[^>]+\bdata-kind="(?:coins|materials)"[^>]*>/g)]
    .map(match => attributes(match[0])).filter(entry => entry['data-kind'] === kind);
}
const saved: EndlessProfileStatus = { mode: 'persistent', code: 'saved', message: '营地、装备与奖励已保存。' };

describe('microfront reward presentation', () => {
  it('renders both new legendary models as actual weapon cards and names their selected weapon artwork', () => {
    const html = missionResultOverlay(missionState(), receipt({ items: [
      { templateId: 'thunder', rarity: 'gold', repaired: true },
      { templateId: 'redblade', rarity: 'gold', repaired: true },
    ] }));
    const loot = cards(html);
    expect(loot.every(card => card['data-kind'] === 'weapon')).toBe(true);
    for (const id of ['thunder', 'redblade']) expect(html).toContain(`data-camp-art="weapon-${id}"`);
    expect(html).toContain('传说 · 霆链·裁决铳'); expect(html).toContain('传说 · 赤曜·斩疫刃');
    expect(html).not.toContain('神级'); expect(html).not.toContain('module-thunder');
  });
  it('explains the independent ultimate and draw-unlocked legendary reforge in both help layouts', () => {
    for (const touch of [false, true]) {
      const html = missionPauseOverlay(missionState(), true, touch);
      expect(html).toContain('4'); expect(html).toContain('满100后可释放');
      expect(html).toContain('母巢总耐久每降低1%＋2'); expect(html).toContain('大招伤害不回充');
      expect(html).toContain('首次通过血流接引抽取解锁');
      expect(html).toContain('对应碎片定向重铸'); expect(html).not.toContain('神级装备也能靠碎片');
    }
  });
  it('shows the settled receipt amounts without reapplying completion rewards or reading the raw haul', () => {
    const state = missionState();
    state.expedition!.haul = { coins: 999, materials: 888, fragments: { steady: 100 }, items: [] };
    const actual = receipt({ coins: 270, materials: 45, cores: 0,
      fragments: { piercing: 7, steady: 6, PULSE_BREAK: 7, PURIFY_CHAIN: 0 },
      items: [{ templateId: 'PULSE_BREAK', rarity: 'blue', repaired: true }] });
    const before = structuredClone({ state, actual });
    const html = missionResultOverlay(state, actual, saved);
    expect(resource(html, 'coins').map(entry => entry['data-quantity'])).toEqual(['270']);
    expect(resource(html, 'materials').map(entry => entry['data-quantity'])).toEqual(['45']);
    const loot = cards(html), fragments = loot.filter(card => card['data-kind'] === 'fragment');
    expect(fragments.map(card => [card['data-template'], card['data-quantity']]).sort())
      .toEqual([['PULSE_BREAK', '7'], ['piercing', '7'], ['steady', '6']].sort());
    expect(fragments.every(card => card['data-rarity'] === 'white')).toBe(true);
    expect(loot.filter(card => card['data-kind'] === 'module')).toHaveLength(1);
    expect(loot.some(card => card['data-kind'] === 'core')).toBe(false);
    expect({ state, actual }).toEqual(before);
    expect(missionResultOverlay(state, actual, saved)).toBe(html);
  });

  it('prioritizes actual equipment rarity and preserves every duplicate and repair state', () => {
    const actual = receipt({ cores: 1, fragments: { EXPOSE_TRACE: 2 }, items: [
      { templateId: 'steady', rarity: 'white', repaired: true },
      { templateId: 'PULSE_BREAK', rarity: 'blue', repaired: true },
      { templateId: 'piercing', rarity: 'gold', repaired: false },
      { templateId: 'PURIFY_CHAIN', rarity: 'purple', repaired: true },
      { templateId: 'piercing', rarity: 'gold', repaired: false },
      { templateId: 'piercing', rarity: 'gold', repaired: true },
    ] });
    const loot = cards(missionResultOverlay(missionState(), actual));
    const ranks = { gold: 3, purple: 2, blue: 1, white: 0 };
    const order = loot.map(card => ranks[card['data-rarity'] as keyof typeof ranks]);
    expect(order).toEqual([...order].sort((a, b) => b - a));
    const weapons = loot.filter(card => card['data-kind'] === 'weapon');
    expect(weapons.reduce((total, card) => total + Number(card['data-quantity']), 0)).toBe(4);
    const goldWeapons = weapons.filter(card => card['data-rarity'] === 'gold');
    expect(goldWeapons.reduce((total, card) => total + Number(card['data-quantity']), 0)).toBe(3);
    expect(goldWeapons.filter(card => card.html.includes('待修复'))
      .reduce((total, card) => total + Number(card['data-quantity']), 0)).toBe(2);
    expect(goldWeapons.some(card => !card.html.includes('待修复'))).toBe(true);
    expect(loot.find(card => card['data-kind'] === 'core')).toMatchObject({ 'data-rarity': 'gold', 'data-quantity': '1' });
    expect(loot.filter(card => card['data-kind'] === 'module')).toHaveLength(2);
  });

  it('hides zero resources and shows a concise empty state with no fabricated loot', () => {
    const html = missionResultOverlay(missionState(), receipt({ fragments: { steady: 0 }, cores: 0 }), saved);
    expect(html).toContain('暂无战利品');
    expect(resource(html, 'coins')).toEqual([]);
    expect(resource(html, 'materials')).toEqual([]);
    expect(cards(html)).toEqual([]);
  });

  it('waits for a settlement receipt instead of presenting unconfirmed pickups', () => {
    const state = missionState();
    state.expedition!.haul = { coins: 999, materials: 999, fragments: { steady: 99 },
      items: [{ templateId: 'piercing', rarity: 'gold', repaired: true }] };
    const html = missionResultOverlay(state);
    expect(html).toContain('正在确认收获');
    expect(resource(html, 'coins')).toEqual([]);
    expect(resource(html, 'materials')).toEqual([]);
    expect(cards(html)).toEqual([]);
  });

  it.each(['withdrawn', 'failure'] as const)('trusts the %s receipt over a stale success flag', outcome => {
    const state = missionState();
    const actual = receipt({ coins: 13, materials: 2, fragments: { steady: 1 } }, outcome);
    const html = missionResultOverlay(state, actual, saved);
    expect(html).not.toContain('清剿完成');
    expect(html).toContain(outcome === 'failure' ? '清剿失败' : '已撤回前哨');
    expect(resource(html, 'coins')[0]['data-quantity']).toBe('13');
    expect(cards(html).filter(card => ['weapon', 'module'].includes(card['data-kind']))).toEqual([]);
  });

  it('states the actual failure briefly, prioritizes player death, and keeps voluntary withdrawal distinct', () => {
    const s = missionState(); s.result = { success: false, reason: '救援体耐久耗尽：观察前摇并冲刺。' };
    s.player.hp = 0; s.tissue.hp = 0;
    let html = missionResultOverlay(s, receipt({}, 'failure'));
    expect(html).toContain('清剿失败'); expect(html).toContain('玩家血量耗尽'); expect(html).not.toContain('观察前摇');
    s.player.hp = 100; html = missionResultOverlay(s, receipt({}, 'failure'));
    expect(html).toContain('稳态锚被摧毁'); expect(html).not.toContain('小队撤回前哨');
    html = missionResultOverlay(s, receipt({}, 'withdrawn')); expect(html).toContain('已撤回前哨'); expect(html).not.toContain('mission-result-cause');
    s.tissue.hp = 100; s.result.reason = '<img onerror=alert(1)>：后续建议';
    expect(missionResultOverlay(s, receipt({}, 'failure'))).toContain('&lt;img onerror=alert(1)&gt;');
    s.result = null; expect(missionResultOverlay(s)).toContain('任务目标未完成');
  });

  it('removes successful-save boilerplate and only offers retry when storage needs attention', () => {
    const state = missionState(), actual = receipt({ coins: 200 });
    for (const status of [undefined, saved, { ...saved, code: 'loaded' as const }]) {
      const html = missionResultOverlay(state, actual, status);
      expect(html).not.toContain('营地、装备与奖励已保存');
      expect(html).not.toContain('data-action="territory-save"');
      expect(html).toContain('data-action="camp-open"');
      expect(html).toContain('data-action="camp-open-forge"');
    }
    const unsafe = '保存失败 <img src=x onerror=alert(1)> & 请重试';
    for (const status of [
      { mode: 'session', code: 'write-failed', message: unsafe },
      { mode: 'persistent', code: 'corrupt', message: unsafe },
    ] as EndlessProfileStatus[]) {
      const html = missionResultOverlay(state, actual, status);
      expect(html).toContain('data-action="territory-save"');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; 请重试');
      expect(html).not.toContain('<img src=x');
    }
  });

  it('supports the player low-effects setting and ignores sessions without a microfront mission', () => {
    const state = missionState(), actual = receipt({ coins: 10 });
    expect(missionResultOverlay(state, actual, saved, true)).toContain('is-low-effects');
    expect(missionResultOverlay(state, actual, saved, false)).not.toContain('is-low-effects');
    delete state.expedition!.missionId;
    expect(missionResultOverlay(state, actual, saved)).toBe('');
  });
});
