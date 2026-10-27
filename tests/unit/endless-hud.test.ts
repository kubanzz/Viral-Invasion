import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import { emptyEndlessProfile, EndlessProfileStore } from '../../src/meta/endlessProfile';
import { endlessHudMarkup, endlessMenuEntry, endlessOverlay, endlessRemaining, updateEndlessHud } from '../../src/ui/endlessHud';

const session = () => { const value = new GameSession(919, { mode: 'endless' }); value.start(); return value; };
afterEach(() => vi.unstubAllGlobals());

describe('continuous challenge UI contracts', () => {
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
    expect(help).toContain('250'); expect(help).toContain('1.1 秒'); expect(help).toContain('细胞会实际移动并吞噬');
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
    const nodes = new Map<string, { textContent: string; style: { width: string }; title: string; dataset: Record<string, string> }>();
    for (const match of endlessHudMarkup().matchAll(/id="([^"]+)"/g)) {
      if (match[1] !== 'endless-minimap') nodes.set(match[1], { textContent: '', style: { width: '' }, title: '', dataset: {} });
    }
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'endless-minimap' ? { getContext: () => null } : nodes.get(id) ?? null });
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
  });
});
