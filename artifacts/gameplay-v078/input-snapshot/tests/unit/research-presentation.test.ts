import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState } from '../../src/game/types';
import type { DraftOption, ProtocolId, ResearchDirectionId } from '../../src/game/growthTypes';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from '../../src/game/research';
import { GROWTH_BALANCE, makeDraftOption, PROTOCOLS } from '../../src/game/protocols';
import { draftOverlay, growthDetailsOverlay, growthHelpMarkup, growthHistoryMarkup, growthHudMarkup, researchDirectionOverlay, updateGrowthHud } from '../../src/ui/growthHud';

function fixture(directions: ResearchDirectionId[] = ['general', 'CARAPACE']): GameState {
  const session = new GameSession(13, { campaign: true, milestone: 'G3' }); session.start();
  const state = session.snapshot(), growth = state.growth!;
  state.phase = 'paused'; growth.research = 8;
  growth.rewardedKeys = directions.filter(direction => direction !== 'general').map(direction => `diagnose:${direction}`);
  growth.pendingResearch = { id: 'offer:13:1', runId: growth.runId, nodeId: 'research', organId: 'heart', directions };
  return state;
}
function draft(state: GameState, direction: ResearchDirectionId, replacing = false) {
  const info = RESEARCH_DIRECTIONS[direction], ids: ProtocolId[] = info.primary && info.partner ? [info.primary, info.partner] : ['PURIFY_CHAIN', 'EXPOSE_TRACE'];
  const third = (['PULSE_BREAK', 'PURIFY_CHAIN', 'EXPOSE_TRACE', 'IMMUNE_BEACON'] as const).find(id => !ids.includes(id))!;
  const options = [...ids, third].map(id => makeDraftOption(id, 'balanced', 'equip')) as [DraftOption, DraftOption, DraftOption];
  state.growth!.pendingResearch = null; state.growth!.research -= GROWTH_BALANCE.researchCost;
  state.growth!.draft = { id: 'draft:research:1', source: 'research', researchDirection: direction, serial: 1, options, status: replacing ? 'replacing' : 'choosing', ...(replacing ? { selectedOptionId: options[0].id } : {}) };
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
afterEach(() => vi.unstubAllGlobals());

describe('directed research presentation', () => {
  it.each([
    ['general', 'CARAPACE'],
    ['general', 'CARAPACE', 'FISSION'],
    ['general', 'CARAPACE', 'FISSION', 'MIMIC'],
  ] as ResearchDirectionId[][])('renders the exact accepted %j choices in one scrollable growth modal', (...directions) => {
    const state = fixture(directions), before = JSON.stringify(state); freeze(state);
    const html = researchDirectionOverlay(state)!;
    expect(html.match(/role="dialog"/g)).toHaveLength(1);
    expect(html).toContain('class="modal growth-draft research-directions"');
    expect(html).toContain(`data-directions="${directions.length}"`);
    expect(html.match(/data-action="research-confirm"/g)).toHaveLength(directions.length);
    expect(html).toContain('class="research-direction-scroll" role="region"');
    expect(html).toContain('tabindex="0"');
    for (const direction of directions) expect(html).toContain(`data-direction="${direction}"`);
    expect(html).toContain('data-action="research-cancel" data-request="offer:13:1"');
    expect(html).toContain('取消研究 · 不消耗样本'); expect(html).toContain('尚未扣除样本');
    expect(html).toContain(`确认研究消耗 <strong>${GROWTH_BALANCE.researchCost} 样本</strong>`);
    expect(html).toContain('data-action="growth-details"'); expect(html).toContain('data-action="help"'); expect(html).toContain('模拟已暂停');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('shows guaranteed main/partner names from the shared mapping without forcing their selection', () => {
    for (const direction of ['CARAPACE', 'FISSION', 'MIMIC'] as const) {
      const html = researchDirectionOverlay(fixture(['general', direction]))!, info = RESEARCH_DIRECTIONS[direction];
      expect(html).toContain(info.title); expect(html).toContain(info.description);
      expect(html).toContain(PROTOCOLS[info.primary!].name); expect(html).toContain(PROTOCOLS[info.partner!].name);
      expect(html).toContain('保证主协议候选'); expect(html).toContain('保证联动伙伴候选');
      expect(html).toContain('不要求选取指定协议'); expect(html).toContain('基础工具始终可反制');
    }
    const general = researchDirectionOverlay(fixture(['general']))!;
    expect(general).toContain(RESEARCH_DIRECTIONS.general.description); expect(general).toContain('随机生成候选');
    expect(general).not.toContain('保证主协议候选');
  });

  it('does not infer unlocks from an evolved enemy or display unaccepted diagnosed directions', () => {
    const state = fixture(['general', 'CARAPACE', 'FISSION', 'MIMIC']);
    state.growth!.rewardedKeys = ['diagnose:baseline', 'diagnose:MIMIC']; state.battle!.traits = ['CARAPACE', 'FISSION'];
    const html = researchDirectionOverlay(state)!;
    expect(html).toContain('data-direction="general"'); expect(html).toContain('data-direction="MIMIC"');
    expect(html).not.toContain('data-direction="CARAPACE"'); expect(html).not.toContain('data-direction="FISSION"');
    expect(availableResearchDirections(state.growth!.rewardedKeys)).toEqual(['general', 'MIMIC']);
  });

  it('suppresses stale/other-organ/ended offers and never stacks a direction dialog above a draft', () => {
    const state = fixture(), offer = state.growth!.pendingResearch!;
    offer.runId = 'previous-run'; expect(researchDirectionOverlay(state)).toBeNull();
    offer.runId = state.growth!.runId; offer.organId = 'lung'; expect(researchDirectionOverlay(state)).toBeNull();
    offer.organId = 'heart'; state.growth!.ended = true; expect(researchDirectionOverlay(state)).toBeNull();
    state.growth!.ended = false; draft(state, 'CARAPACE'); state.growth!.pendingResearch = offer;
    expect(researchDirectionOverlay(state)).toBeNull();
  });

  it('escapes the accepted request token in both confirm and free cancellation attributes', () => {
    const state = fixture(); state.growth!.pendingResearch!.id = 'request"<&';
    const html = researchDirectionOverlay(state)!;
    expect(html).toContain('data-request="request&quot;&lt;&amp;"'); expect(html).not.toContain('data-request="request"<&');
  });

  it.each(['general', 'CARAPACE', 'FISSION', 'MIMIC'] as const)('keeps the actual %s research direction and spent cost through draft and replacement', direction => {
    const state = fixture(['general', direction]); draft(state, direction);
    const choosing = draftOverlay(state)!;
    expect(choosing).toContain(`样本研究 · ${RESEARCH_DIRECTIONS[direction].title}`);
    expect(choosing).toContain(`data-research-direction="${direction}"`); expect(choosing).toContain(`已消耗 ${GROWTH_BALANCE.researchCost} 样本`);
    expect(choosing).toContain('放弃草案不会退还'); expect(choosing).toContain('自由选择本次任意候选');
    expect(choosing).toContain('data-action="growth-details"');
    state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'balanced' }, { id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    state.growth!.draft!.status = 'replacing'; state.growth!.draft!.selectedOptionId = state.growth!.draft!.options[0].id;
    const replacing = draftOverlay(state)!;
    expect(replacing).toContain(`data-research-direction="${direction}"`); expect(replacing).toContain('data-action="draft-back"');
    expect(replacing.match(/data-action="draft-replace"/g)).toHaveLength(3); expect(replacing).toContain('data-action="growth-details"');
    expect(state.growth!.research).toBe(8 - GROWTH_BALANCE.researchCost);
  });

  it('leaves XP drafts unlabelled by research and keeps current equipment details accessible', () => {
    const state = fixture(); draft(state, 'MIMIC'); state.growth!.draft!.source = 'xp'; delete state.growth!.draft!.researchDirection;
    const html = draftOverlay(state)!; expect(html).toContain('战斗经验'); expect(html).not.toContain('research-draft-context');
    expect(html).toContain('data-action="growth-details"'); expect(growthDetailsOverlay(state, '返回研究方向')).toContain('返回研究方向');
    expect(growthHelpMarkup).toContain('诊断 → 定向研究'); expect(growthHelpMarkup).toContain('确认时才消耗');
    expect(growthHelpMarkup).toContain('通用研究保持随机'); expect(growthHudMarkup).toContain('Q 诊断 → 研究台 E 选方向');
  });

  it('refreshes diagnosis/sample hints without rebuilding the equipped HUD slots', () => {
    const state = fixture(); state.growth!.pendingResearch = null; state.growth!.rewardedKeys = [];
    state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    let rebuilds = 0;
    const counter = { textContent: '' }, slots = { children: [] as { querySelector: () => typeof counter }[],
      set innerHTML(_value: string) { rebuilds++; this.children = Array.from({ length: 3 }, () => ({ querySelector: () => counter })); } };
    const nodes: Record<string, unknown> = { 'protocol-slots': slots };
    for (const id of ['growth-research', 'growth-xp', 'xp-meter', 'research-hint', 'evolution-feedback']) nodes[id] = { textContent: '', style: {}, hidden: false };
    vi.stubGlobal('document', { getElementById: (id: string) => nodes[id] });
    updateGrowthHud(state); const originalChildren = slots.children;
    expect((nodes['research-hint'] as { textContent: string }).textContent).toContain('诊断后可定向');
    for (let index = 0; index < 24; index++) {
      state.growth!.research = index; state.growth!.activations = { IMMUNE_BEACON: index + 999 };
      state.runMetrics!.summary.control.beaconBites = index;
      state.growth!.rewardedKeys = ['diagnose:CARAPACE', 'diagnose:MIMIC']; updateGrowthHud(state);
    }
    expect(rebuilds).toBe(1); expect(slots.children).toBe(originalChildren);
    expect(counter.textContent).toBe('咬击 23');
    expect((nodes['research-hint'] as { textContent: string }).textContent).toContain('可定向 2 类');
  });

  it('uses accepted zero-damage exclusions in details and history even when planned activations are high', () => {
    const state = fixture();
    state.growth!.equipped = ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON'].map(id => ({ id: id as ProtocolId, tuning: 'balanced' }));
    state.growth!.activations = { PULSE_BREAK: 999, PURIFY_CHAIN: 999, IMMUNE_BEACON: 999 };
    for (const html of [growthDetailsOverlay(state, '返回'), growthHistoryMarkup(state)]) {
      expect(html).toContain('实际共振命中 0 次'); expect(html).toContain('实际咬击 0 次');
      expect(html).toContain('连锁 0 次 / 0 跳；折射 0 次');
      expect(html).not.toContain('999'); expect(html).not.toContain('本局实际触发');
    }
    const details = growthDetailsOverlay(state, '返回');
    expect(details).toContain('每条净化链至少一次真实邻体正伤害计一次');
    expect(details).toContain('不按整队轮次计');
    delete state.runMetrics;
    for (const html of [growthDetailsOverlay(state, '返回'), growthHistoryMarkup(state)]) {
      expect(html.match(/未记录真实命中/g)).toHaveLength(3);
      expect(html).not.toContain('实际共振命中 0 次'); expect(html).not.toContain('实际咬击 0 次');
    }
    state.growth!.equipped = [{ id: 'EXPOSE_TRACE', tuning: 'balanced' }]; state.growth!.activations = { EXPOSE_TRACE: 17 };
    expect(growthDetailsOverlay(state, '返回')).toContain('显影施加次数 17 次');
    expect(growthHistoryMarkup(state)).toContain('显影施加次数 17 次');
    delete state.growth!.activations;
    expect(growthDetailsOverlay(state, '返回')).toContain('显影施加次数未记录');
  });

  it('updates accepted resonance, chain and ricochet counts without rebuilding protocol slots', () => {
    const state = fixture();
    state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'balanced' }];
    state.growth!.activations = { PULSE_BREAK: 999, PURIFY_CHAIN: 999 };
    let rebuilds = 0;
    const counters = [{ textContent: '' }, { textContent: '' }, { textContent: '' }];
    const slots = { children: [] as { querySelector: () => typeof counters[number] }[],
      set innerHTML(_value: string) { rebuilds++; this.children = counters.map(counter => ({ querySelector: () => counter })); } };
    const nodes: Record<string, unknown> = { 'protocol-slots': slots };
    for (const id of ['growth-research', 'growth-xp', 'xp-meter', 'research-hint', 'evolution-feedback']) nodes[id] = { textContent: '', style: {}, hidden: false };
    vi.stubGlobal('document', { getElementById: (id: string) => nodes[id] });
    updateGrowthHud(state); const originalChildren = slots.children;
    expect(counters[0].textContent).toBe('共振 0'); expect(counters[1].textContent).toBe('链 0 · 折 0');
    const control = state.runMetrics!.summary.control;
    control.resonanceHits = 3; control.chainTriggers = 4; control.chainHops = 7; control.ricochetHits = 2;
    updateGrowthHud(state);
    expect(counters[0].textContent).toBe('共振 3'); expect(counters[1].textContent).toBe('链 4 · 折 2');
    expect(growthDetailsOverlay(state, '返回')).toContain('连锁 4 次 / 7 跳；折射 2 次');
    expect(growthHistoryMarkup(state)).toContain('实际共振命中 3 次');
    expect(rebuilds).toBe(1); expect(slots.children).toBe(originalChildren);
    delete state.runMetrics; updateGrowthHud(state);
    expect(counters[0].textContent).toBe('命中未记录'); expect(counters[1].textContent).toBe('命中未记录');
    expect(rebuilds).toBe(1);
  });
});
