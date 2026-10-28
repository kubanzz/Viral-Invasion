import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import { endlessSupportTactics } from '../../src/game/endless';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import { emptyEndlessProfile, EndlessProfileStore } from '../../src/meta/endlessProfile';
import { endlessHudMarkup, endlessMenuEntry, endlessOverlay, endlessRemaining, updateEndlessHud } from '../../src/ui/endlessHud';

const session = () => { const value = new GameSession(919, { mode: 'endless' }); value.start(); return value; };
function mountHud() {
  const nodes = new Map<string, { textContent: string; style: { width: string }; title: string; dataset: Record<string, string> }>();
  for (const match of endlessHudMarkup().matchAll(/id="([^"]+)"/g)) {
    if (match[1] !== 'endless-minimap') nodes.set(match[1], { textContent: '', style: { width: '' }, title: '', dataset: {} });
  }
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'endless-minimap' ? { getContext: () => null } : nodes.get(id) ?? null });
  return nodes;
}
afterEach(() => vi.unstubAllGlobals());

describe('continuous challenge UI contracts', () => {
  it('distinguishes announced, living and resolved tissue assault from other enemies', () => {
    const state = session().state, nodes = mountHud(), e = state.endless!;
    Object.assign(e, { wave: 6, phase: 'warning', batchIndex: 0, batchMemberIndex: 0,
      batchSchedule: [{ at: 0, sector: 0, spread: .18, roles: ['ordinary', 'ordinary', 'support'] },
        { at: .5, sector: 4, spread: .18, roles: ['ordinary', 'ordinary', 'ordinary'] }] });
    updateEndlessHud(state);
    expect(nodes.get('endless-traits')!.textContent).toContain('▲ 2体将袭击＋组织');
    const raider = { id: 'marked-raider', x: 900, y: 900, radius: 22, hp: 50, maxHp: 50,
      kind: 'single' as const, role: 'virus' as const, hitUntil: 0, scanned: false, assaultObjective: 'tissue' as const };
    state.targets = [raider, { ...raider, id: 'ordinary', assaultObjective: undefined }];
    Object.assign(e, { phase: 'combat', batchIndex: 2, batchMemberIndex: 0 });
    updateEndlessHud(state);
    expect(nodes.get('endless-traits')!.textContent).toContain('袭击组织 1体');
    expect(nodes.get('endless-traits')!.textContent).not.toContain('待生');
    raider.hp = 0; updateEndlessHud(state);
    expect(nodes.get('endless-traits')!.textContent).not.toContain('袭击组织');
  });

  it('shows an actual guard order and its remaining original lifetime without mutating it', () => {
    const game = session(), state = game.state, nodes = mountHud();
    state.endlessGrowth!.ranks.immune = 3;
    game.step({ moveX: 0, moveY: 0, fire: false, scan: true, aim: state.tissue });
    expect(state.growth!.beacon!.guard?.kind).toBe('tissue');
    const before = structuredClone(state); updateEndlessHud(state);
    expect(nodes.get('endless-ability-3')!.textContent).toContain('正在驻防组织');
    expect(nodes.get('endless-tissue-route')!.textContent).toContain('细胞驻防 3只');
    expect(state).toEqual(before);
    state.elapsed = state.growth!.beacon!.until; updateEndlessHud(state);
    expect(nodes.get('endless-ability-3')!.textContent).not.toContain('正在驻防');
    expect(nodes.get('endless-tissue-route')!.textContent).not.toContain('细胞驻防');
  });

  it('shows the real finite source quota and stops advertising an exhausted source as a required target', () => {
    const state = session().state, nodes = mountHud();
    state.endless!.wave = 6;
    state.endless!.source = { id: 'wave-six-source', slot: 0, position: { x: 1900, y: 420 }, status: 'active', bornAt: null,
      quotaSlots: [12, 13, 14, 15, 16, 17], bornQuotaSlots: [], canceledSlots: [], fallbackBirths: 0 };
    const original = structuredClone(state);
    updateEndlessHud(state);
    expect(nodes.get('endless-objective')!.textContent).toContain('远侧源待开启');
    expect(nodes.get('endless-traits')!.textContent).toContain('6体待生');
    expect(state).toEqual(original);
    state.endless!.source.bornAt = state.elapsed;
    state.endless!.source.bornQuotaSlots = [12, 13];
    updateEndlessHud(state);
    expect(nodes.get('endless-objective')!.textContent).toContain('可截断4体待生增援');
    state.endless!.source.status = 'exhausted';
    state.endless!.source.bornQuotaSlots = [...state.endless!.source.quotaSlots];
    updateEndlessHud(state);
    expect(nodes.get('endless-objective')!.textContent).toContain('无需再拆');
    expect(nodes.get('endless-objective')!.textContent).not.toContain('可截断');
  });

  it('distinguishes canceled source births from actual kills and pending bodies', () => {
    const state = session().state, nodes = mountHud();
    state.endless!.source = { id: 'cut-source', slot: 0, position: { x: 1900, y: 420 }, status: 'destroyed', bornAt: 2,
      quotaSlots: [12, 13, 14, 15, 16, 17], bornQuotaSlots: [12, 13], canceledSlots: [14, 15, 16, 17], fallbackBirths: 0 };
    state.endless!.canceledToSpawn = 4; state.endless!.remainingToSpawn = 3; state.endless!.kills = 2;
    updateEndlessHud(state);
    expect(nodes.get('endless-traits')!.textContent).toContain('源已截断4体');
    expect(nodes.get('endless-spawn-plan')!.textContent).toContain('待入场 3');
    expect(nodes.get('endless-spawn-plan')!.textContent).toContain('已截断 4');
    expect(state.endless!.kills).toBe(2);
  });

  it('mounts one independent, labelled HUD and accessible minimap', () => {
    const markup = endlessHudMarkup();
    expect(markup).toContain('id="endless-hud"'); expect(markup).toContain('id="endless-minimap"');
    expect(markup).toContain('aria-label="连续挑战状态"'); expect(markup).toContain('role="img"');
    const ids = [...markup.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length); expect(ids.every(id => id.startsWith('endless-'))).toBe(true);
  });

  it('counts pending fission children and queued spawns without double counting dead bodies', () => {
    const state = session().state;
    state.targets = [
      { id: 'living', kind: 'single', x: 10, y: 10, hp: 20, maxHp: 68, radius: 21, hitUntil: 0, scanned: false },
      { id: 'dead-parent', kind: 'single', x: 20, y: 20, hp: 0, maxHp: 68, radius: 21, hitUntil: 0, scanned: false },
    ];
    state.endless!.remainingToSpawn = 4; state.endless!.pendingChildren = 2;
    expect(endlessRemaining(state)).toBe(7);
    delete state.endless; expect(endlessRemaining(state)).toBe(0);
  });

  it('binds each of three choices to the exact run and draft and escapes their visible copy', () => {
    const state = session().state;
    offerEndlessUpgrade(state.endlessGrowth!, 1);
    const draft = state.endlessGrowth!.draft!;
    state.growth!.runId = 'run"<unsafe>';
    draft.options[0].title = '<img onerror="bad">'; draft.options[0].description = '<script>bad()</script>';
    const markup = endlessOverlay(state, false, false)!;
    expect(markup.match(/data-action="endless-upgrade"/g)).toHaveLength(3);
    expect(markup.match(/data-run="run&quot;&lt;unsafe&gt;"/g)).toHaveLength(3);
    for (const option of draft.options) expect(markup).toContain(`data-upgrade="${option.id}"`);
    expect(markup).toContain(`data-draft="${draft.id}"`);
    expect(markup).toContain('&lt;script&gt;bad()&lt;/script&gt;'); expect(markup).not.toContain('<img');
  });

  it('opens help above a pending choice and restores the unchanged choice afterward', () => {
    const state = session().state; offerEndlessUpgrade(state.endlessGrowth!, 1);
    const before = structuredClone(state);
    const help = endlessOverlay(state, true, false)!;
    expect(help).toContain('连续挑战操作指南'); expect(help).toContain('data-action="close-help"');
    expect(help).toContain('细胞会实际移动并吞噬');
    for (const obsolete of ['250 距离', '1.1 秒', '范围 105', '注意定点爆破']) expect(help).not.toContain(obsolete);
    for (const info of Object.entries(ENEMY_TACTIC_INFO).filter(([id]) => id !== 'melee').map(([, info]) => info)) {
      expect(help).toContain(info.name); expect(help).toContain(info.counter);
    }
    for (const copy of ['让开路线后反打', '两个固定落点', '每5波协议联动重配', '免样本、可放弃', '不会抵消本波战斗成长', '不续命、不重置咬击冷却、不额外耗组织']) expect(help).toContain(copy);
    expect(help).not.toContain('data-action="endless-upgrade"');
    expect(endlessOverlay(state, false, false)).toContain('data-action="endless-upgrade"');
    expect(state).toEqual(before);
  });

  it('shows an ended run before a stale draft with cleared waves, records and actual growth', () => {
    const game = session(), state = game.state; offerEndlessUpgrade(state.endlessGrowth!, 1);
    const staleDraft = structuredClone(state.endlessGrowth!.draft);
    Object.assign(state.endless!, { wave: 7, clearedWaves: 6, score: 440, kills: 34, bestCombo: 11 });
    Object.assign(state.endlessGrowth!, { level: 3, ranks: { multishot: 1, vitality: 2 } });
    game.finish(true, '<safe reason>');
    // Defensively verify rendering if a host restores an old pending choice.
    state.endlessGrowth!.draft = staleDraft;
    const profile = new EndlessProfileStore(null); profile.recordRun(state, 'ended');
    const markup = endlessOverlay(state, false, false, profile.load())!;
    expect(markup).toContain('完全清除波次'); expect(markup).toContain('到达第 7 波');
    expect(markup).toContain('通关 6 波 / 440 分'); expect(markup).toContain('最大耐久140');
    expect(markup).toContain('3束'); expect(markup).toContain('&lt;safe reason&gt;');
    expect(markup).toContain('主动撤离'); expect(markup).not.toContain('data-action="endless-upgrade"');
    expect(markup).toContain('记录仅保留');
  });

  it('offers extraction only on pause and leaves ordinary gameplay overlay-free', () => {
    const state = session().state;
    expect(endlessOverlay(state, false, false)).toBeNull();
    state.phase = 'paused';
    const markup = endlessOverlay(state, false, true)!;
    expect(markup).toContain('data-action="continue"'); expect(markup).toContain('data-action="endless-extract"');
    expect(markup).toContain('特效：低');
    delete state.endless; expect(endlessOverlay(state, true, false)).toBeNull();
  });

  it('updates real max HP and ability parameters without mutating simulation state', () => {
    const state = session().state;
    Object.assign(state.endlessGrowth!, { level: 7, ranks: { multishot: 1, vitality: 2, power: 1, dash: 1, scan: 1, immune: 1 } });
    state.player.hp = 112;
    Object.assign(state.endless!, { remainingToSpawn: 4, pendingChildren: 2 });
    state.battle!.pressure.criticalSince = 10; state.elapsed = 13;
    const before = structuredClone(state);
    const nodes = mountHud();
    updateEndlessHud(state);
    expect(nodes.get('endless-hp')!.textContent).toBe('112 / 140');
    expect(nodes.get('endless-hp-meter')!.style.width).toBe('80%');
    expect(nodes.get('endless-ability-0')!.textContent).toContain('3 束 × 40.1伤害');
    expect(nodes.get('endless-ability-2')!.textContent).toContain('冲刺斩 47.2伤害');
    expect(nodes.get('endless-remaining')!.textContent).toBe('6');
    expect(nodes.get('endless-spawn-plan')!.textContent).toContain('待分裂 2');
    expect(nodes.get('endless-critical')!.textContent).toContain('12s');
    expect(state).toEqual(before);
  });

  it('advertises local challenge highs independently and escapes storage status', () => {
    const data = { ...emptyEndlessProfile(), bestWave: 6, bestScore: 440, bestCombo: 11, runs: 1 };
    const markup = endlessMenuEntry({ data, status: { mode: 'session', code: 'unavailable', message: '<unsafe status>' } });
    expect(markup).toContain('data-action="endless-start"'); expect(markup).toContain('最高通关 6 波');
    expect(markup).toContain('&lt;unsafe status&gt;'); expect(markup).toContain('is-temporary');
    expect(markup).toContain('每5波精英与协议联动重配');
  });

  it.each<EnemyTactic>(['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion'])('shows the actual %s counter in the existing formation panel', tactic => {
    const state = session().state, nodes = mountHud();
    Object.assign(state.endless!, { phase: 'combat', formationLabel: '交叉夹击' });
    state.targets = [{ id: 'active-tactic', x: 900, y: 600, role: 'elite', kind: 'single', radius: 30, hp: 136, maxHp: 136, scanned: false, hitUntil: 0, tactic }];
    const before = structuredClone(state);
    updateEndlessHud(state);
    expect(nodes.get('endless-phase')!.textContent).toContain('交叉夹击');
    expect(nodes.get('endless-objective')!.textContent).toContain(ENEMY_TACTIC_INFO[tactic].counter);
    expect(nodes.get('endless-objective')!.textContent.length).toBeLessThan(80);
    expect(state).toEqual(before);
  });

  it('prioritizes a pending free milestone over the simultaneous combat card without consuming either', () => {
    const game = session(), state = game.state, nodes = mountHud();
    game.completeWave(5);
    Object.assign(state.endless!, { phase: 'intermission', clearedWaves: 5 });
    expect(state.growth!.draft!.source).toBe('endless');
    expect(state.endlessGrowth!.draft).not.toBeNull();
    const before = structuredClone(state);
    updateEndlessHud(state);
    expect(nodes.get('endless-objective')!.textContent).toContain('精英波联动重配');
    expect(nodes.get('endless-objective')!.textContent).toContain('免样本、可放弃');
    expect(nodes.get('endless-objective')!.textContent).toContain('战斗进化照常获得');
    expect(state).toEqual(before);
  });

  it.each([16, 30])('warns about the real mixed support roster at wave %s even in the compact-visible row', wave => {
    const state = session().state, nodes = mountHud();
    Object.assign(state.endless!, { wave, phase: 'warning', formationLabel: '交叉夹击 · 混编支援' });
    const before = structuredClone(state);
    updateEndlessHud(state);
    const roster = endlessSupportTactics(state.seed, wave);
    expect(new Set(roster).size).toBe(3);
    for (const tactic of roster) {
      expect(nodes.get('endless-objective')!.textContent).toContain(ENEMY_TACTIC_INFO[tactic].name);
      expect(nodes.get('endless-traits')!.textContent).toContain(ENEMY_TACTIC_INFO[tactic].name);
    }
    expect(nodes.get('endless-objective')!.textContent).toContain('侵蚀 Q 打断');
    if (wave === 30) expect(nodes.get('endless-traits')!.textContent).toContain('点射支援×2');
    state.endless!.phase = 'combat'; updateEndlessHud(state);
    expect(nodes.get('endless-traits')!.textContent).not.toContain('混编');
    state.endless!.phase = 'warning';
    expect(state).toEqual(before);
  });
});
