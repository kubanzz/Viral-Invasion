import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { preparationForPlan } from '../../src/game/preparation';
import { describeProtocol, GROWTH_BALANCE, PROTOCOL_IDS, PROTOCOLS } from '../../src/game/protocols';
import { emptyProfile, ProfileStore } from '../../src/meta/profile';
import { growthDetailsOverlay, updateGrowthHud } from '../../src/ui/growthHud';
import { profileMenuMarkup, profileOverlay, profileResultMarkup } from '../../src/ui/profileHud';
import { startingPlanEntryMarkup, startingPlanOverlay } from '../../src/ui/startingPlanHud';

afterEach(() => vi.unstubAllGlobals());
const status = { mode: 'persistent', code: 'saved', message: '已保存' } as const;

describe('optional starting plan presentation', () => {
  it('defaults to a direct-play field plan and exposes only carried options as selectable', () => {
    const data = emptyProfile(), before = JSON.stringify(data), html = startingPlanOverlay(data);
    expect(html.match(/data-action="plan-select"/g)).toHaveLength(1);
    expect(html).toContain('data-plan="field" aria-pressed="true"');
    expect(html.match(/在一份已结束病例中携带后开放/g)).toHaveLength(PROTOCOL_IDS.length);
    expect(html).toContain('20 XP 时只结清预支，不生成草案，55 XP 起正常选择');
    expect(html).toContain('同种子重试保留该病例的原始方案');
    expect(html).toContain('class="starting-plan-scroll" tabindex="0" role="region"');
    expect(html.match(/data-action="close-starting-plan"/g)).toHaveLength(2);
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each(PROTOCOL_IDS)('shows the actual I balanced effect and cost for %s without reviving old upgrades', id => {
    const data = emptyProfile(); data.unlockedProtocols = [id]; data.startingPlan = id;
    const html = startingPlanOverlay(data), description = describeProtocol(id, 'balanced', 1);
    expect(html).toContain(`data-plan="${id}" aria-pressed="true"`);
    expect(html.match(/data-action="plan-select"/g)).toHaveLength(2);
    expect(html).toContain(description.effect); expect(html).toContain(description.cost);
    expect(html).toContain(`预装Ⅰ阶 · 均衡 · 占 1/${GROWTH_BALANCE.slots} 槽`);
    expect(startingPlanEntryMarkup(data)).toContain(PROTOCOLS[id].name);
    expect(html).toContain('局内经验、协议等级和临时状态每局重置');
  });

  it('falls back visually to field if a selected route is no longer available', () => {
    const data = emptyProfile(); data.startingPlan = 'IMMUNE_BEACON';
    expect(startingPlanEntryMarkup(data)).toContain('初始方案 · 现场应答');
    expect(startingPlanOverlay(data)).toContain('data-plan="field" aria-pressed="true"');
  });

  it('keeps preparation and archive in one menu row without taking over the start action', () => {
    const html = profileMenuMarkup(emptyProfile(), status);
    expect(html).toContain('class="profile-menu-entries"');
    expect(html.match(/data-action="starting-plan"/g)).toHaveLength(1);
    expect(html.match(/data-action="profile"/g)).toHaveLength(1);
    expect(html).not.toContain('data-action="start"');
  });

  it('distinguishes pending repayment from a new evolution and refreshes the true next threshold', () => {
    const session = new GameSession(330, { campaign: true, milestone: 'G3', preparation: preparationForPlan('IMMUNE_BEACON') }); session.start();
    const state = session.state, growth = state.growth!;
    growth.xp = 18; growth.starterDebt = 1;
    const counter = { textContent: '' }, slots = { children: [] as { querySelector: () => typeof counter }[], set innerHTML(_value: string) { this.children = Array.from({ length: 3 }, () => ({ querySelector: () => counter })); } };
    const nodes: Record<string, unknown> = { 'protocol-slots': slots };
    for (const id of ['growth-research', 'growth-xp', 'xp-meter', 'research-hint', 'evolution-feedback']) nodes[id] = { textContent: '', style: {}, hidden: false };
    vi.stubGlobal('document', { getElementById: (id: string) => nodes[id] });
    updateGrowthHud(state);
    expect((nodes['growth-xp'] as { textContent: string }).textContent).toBe('预装待结清 · 18/20 XP · 下份草案 55');
    expect(growthDetailsOverlay(state, '返回')).toContain('20 XP 只结清预支，不生成草案');
    growth.xp = 20; growth.level = 1; growth.nextXp = 55; growth.starterDebt = 0;
    updateGrowthHud(state);
    expect((nodes['growth-xp'] as { textContent: string }).textContent).toBe('预支已结清 · 经验 20 / 55');
    expect(growthDetailsOverlay(state, '返回')).toContain('首份经验成长已结清');
  });
});

describe('fact based result presentation', () => {
  it('uses accumulated facts instead of protocol activation or the retained event tail', () => {
    const session = new GameSession(334, { campaign: true, milestone: 'G3' }); session.start(); session.finish(false, '病例结束');
    const state = session.state, control = state.runMetrics!.summary.control;
    control.chainTriggers = 7; control.chainHops = 13; control.ricochetHits = 5;
    control.synergyPulseChain = 2; control.synergyTraceBeacon = 4;
    state.growth!.activations = { PURIFY_CHAIN: 999 };
    state.events = [{ type: 'PROTOCOL_CHAIN_HIT', tick: 1, data: { rootId: 'tail', hop: 1 } }];
    const html = profileResultMarkup(state, emptyProfile(), status);
    expect(html).toContain('治疗质量'); expect(html).toContain('系统掌控');
    expect(html).toContain('连锁 7 次 / 13 跳；折射 5 次');
    expect(html).toContain('共振×连锁 2 次；显影×小队 4 次标记咬击');
    expect(html).toContain('连锁次数：每条净化链至少一次真实邻体正伤害计一次');
    expect(html).not.toContain('连锁 999 次');
    expect(html).toContain('data-action="starting-plan">准备下一病例');
    expect(html).toContain('<details class="profile-result profile-recap"');
    expect(html).not.toContain('<details open');
  });

  it('shows missing historical measurements as unrecorded rather than zero', () => {
    const session = new GameSession(335, { campaign: true, milestone: 'G3' }); session.start(); session.finish(false, '旧病例');
    delete session.state.runMetrics;
    const profile = new ProfileStore(null); profile.recordRun(session.state, 'old-no-metrics');
    const html = profileOverlay(profile.data, profile.status);
    expect(html).toContain('本局未记录有效修复与受击统计');
    expect(html).toContain('本局未记录连锁与联动统计');
    expect(html).toContain('未将缺失记录填为零');
    expect(html).not.toContain('连锁 0 次 / 0 跳');
  });

  it('keeps the limited-data notice alongside expanded result facts', () => {
    const session = new GameSession(336, { campaign: true, milestone: 'G3' }); session.start(); session.finish(false, '有限记录');
    session.state.runMetrics!.summary.limited = true;
    const html = profileResultMarkup(session.state, emptyProfile(), status);
    expect(html).toContain('本局统计不完整，以下仅显示已记录事实');
  });
});
