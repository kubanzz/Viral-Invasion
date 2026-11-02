import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { healingPoints } from '../../src/game/healingPoints';
import { campaignHudMarkup, campaignOverlay, healingPointInteractionHint } from '../../src/ui/campaignHud';
import { endlessHudMarkup, endlessOverlay, updateEndlessHud } from '../../src/ui/endlessHud';

afterEach(() => vi.unstubAllGlobals());

function session(endless = false) {
  const game = new GameSession(71, endless ? { mode: 'endless' } : { campaign: true, milestone: 'G3' }); game.start();
  const point = healingPoints(game.state)[0];
  Object.assign(game.state.player, { x: point.x - 100, y: point.y });
  return game;
}

describe('Healing point HUD', () => {
  it('uses tool 3 and a click for each honest local treatment state', () => {
    const state = session().state, point = healingPoints(state)[0];
    const before = structuredClone(state);
    expect(healingPointInteractionHint(state)).toContain('3 + 左键');
    expect(healingPointInteractionHint(state)).toContain('免费治疗耐久 +25');
    expect(state).toEqual(before);
    point.infection = 45;
    expect(healingPointInteractionHint(state)).toContain('快速净化（感染 45%）');
    point.infection = 100; state.growth!.research = 1;
    expect(healingPointInteractionHint(state)).toContain('消耗 2 研究样本（已有 1）');
    point.infection = 0; point.healReadyAt = 2;
    expect(healingPointInteractionHint(state)).toContain('恢复中 2.0 秒');
    state.player.x -= 200;
    expect(healingPointInteractionHint(state)).toBeNull();
  });

  it('documents paid reclamation and labelled colored markers in both modes', () => {
    expect(campaignHudMarkup).toContain('两个治疗点'); expect(campaignHudMarkup).toContain('红色加号为已占领');
    expect(endlessHudMarkup()).toContain('红色加号为已占领');
    expect(campaignOverlay(session().state, true, true, false, false)).toContain('消耗2研究样本才能夺回');
    expect(endlessOverlay(session(true).state, true, false)).toContain('需要2研究样本夺回');
  });

  it('paints clean, contested and occupied markers and shows a local paid-treatment hint without state writes', () => {
    const state = session(true).state, nodes = new Map<string, { textContent: string; style: Record<string, string>; dataset: Record<string, string> }>();
    for (const match of endlessHudMarkup().matchAll(/id="([^"]+)"/g)) nodes.set(match[1], { textContent: '', style: {}, dataset: {} });
    const strokes: string[] = [], drawing: Record<string, unknown> = {};
    const ctx = new Proxy(drawing, { get: (target, key) => key === 'stroke' ? () => strokes.push(String(target.strokeStyle)) : target[String(key)] ?? (() => {}), set: (target, key, value) => { target[String(key)] = value; return true; } });
    const canvas = { width: 220, height: 130, getContext: () => ctx };
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'endless-minimap' ? canvas : nodes.get(id) ?? null });
    const points = healingPoints(state); points[0].infection = 100; points[1].infection = 0;
    const before = structuredClone(state); updateEndlessHud(state);
    expect(strokes).toContain('#f47f78'); expect(strokes).toContain('#88ddcc');
    expect(nodes.get('endless-tissue-route')!.textContent).toContain('3 + 左键 · 夺回治疗点');
    expect(state).toEqual(before);
    points[1].infection = 25; updateEndlessHud(state);
    expect(strokes).toContain('#e9bd61');
  });
});
