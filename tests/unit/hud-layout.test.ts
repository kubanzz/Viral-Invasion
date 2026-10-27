import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readVisibleHudRects } from '../../src/ui/hudLayout';
import { battleCrisisContent, battleHudMarkup } from '../../src/ui/battleHud';
import { arenaSummary } from '../../src/ui/campaignHud';
import { GameSession } from '../../src/game/session';

afterEach(() => vi.unstubAllGlobals());

const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height });
function dom() {
  const calls: string[] = [];
  const panel = (name: string, rect: ReturnType<typeof box>, optional = false) => ({
    name, hidden: false, parentElement: null as unknown, computed: { display: 'block', visibility: 'visible', opacity: '1' },
    getBoundingClientRect: () => { calls.push(`rect:${name}`); return rect; },
    matches: () => optional,
    classList: { toggle: vi.fn((_name: string, _on: boolean) => { calls.push(`write:${name}`); }) },
  });
  const growth = panel('growth', box(70, 100, 120, 100), true), telemetry = panel('critical', box(410, 100, 100, 100));
  const hidden = panel('hidden', box(150, 120, 30, 30)); hidden.parentElement = { hidden: true };
  const transparent = panel('transparent', box(150, 120, 30, 30)); transparent.computed.opacity = '0';
  const outside = panel('outside', box(600, 100, 40, 40));
  const document = {
    defaultView: { getComputedStyle: (node: typeof growth) => { calls.push(`style:${node.name}`); return node.computed; } },
    querySelectorAll: vi.fn(() => [growth, telemetry, hidden, transparent, outside]),
  };
  const canvas = { ownerDocument: document, getBoundingClientRect: () => { calls.push('rect:canvas'); return box(100, 80, 400, 300); } } as unknown as HTMLCanvasElement;
  return { canvas, document, growth, telemetry, calls };
}

describe('visible HUD reservation and critical information', () => {
  it('uses canvas-relative CSS coordinates, clips edges, and omits hidden/transparent/off-canvas panels in one read batch', () => {
    const setup = dom(), result = readVisibleHudRects(setup.canvas);
    expect(result).toEqual([{ left: 0, right: 90, top: 20, bottom: 120 }, { left: 310, right: 400, top: 20, bottom: 120 }]);
    expect(setup.document.querySelectorAll).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result[0])).toBe(true);
    expect(setup.calls.findIndex(call => call.startsWith('write:'))).toBeGreaterThan(setup.calls.map(call => call.startsWith('rect:') || call.startsWith('style:')).lastIndexOf(true));
  });

  it('softens only optional panels intersecting the player, holds for350ms, and restores immediately when paused', () => {
    const setup = dom(), inside = { left: 20, right: 45, top: 40, bottom: 90 }, outside = { left: 170, right: 200, top: 150, bottom: 170 };
    readVisibleHudRects(setup.canvas, { active: true, now: 100, player: inside });
    expect(setup.growth.classList.toggle).toHaveBeenLastCalledWith('hud-obscured', true);
    readVisibleHudRects(setup.canvas, { active: true, now: 300, player: outside });
    expect(setup.growth.classList.toggle).toHaveBeenLastCalledWith('hud-obscured', true);
    readVisibleHudRects(setup.canvas, { active: true, now: 451, player: outside });
    expect(setup.growth.classList.toggle).toHaveBeenLastCalledWith('hud-obscured', false);
    readVisibleHudRects(setup.canvas, { active: true, now: 500, player: inside });
    readVisibleHudRects(setup.canvas, { active: false, now: 510, player: inside });
    expect(setup.growth.classList.toggle).toHaveBeenLastCalledWith('hud-obscured', false);
    expect(setup.telemetry.classList.toggle).not.toHaveBeenCalled();
  });

  it('keeps the actual fatal countdown independent of suppressed encounter help and excludes it from short-height help hiding', () => {
    const session = new GameSession(13, { campaign: true, milestone: 'G3' }); session.start();
    const state = session.state; state.elapsed = 20; state.battle!.pressure.criticalSince = 8;
    const before = JSON.stringify(state);
    expect(battleCrisisContent(state)).toEqual({ text: '⚠ 感染失控：3.0 秒 · 立即净化或抢修', urgency: 'fatal' });
    state.elapsed = 30; expect(battleCrisisContent(state).text).toContain('0.0 秒');
    state.elapsed = 20; expect(JSON.stringify(state)).toBe(before);
    expect(battleHudMarkup).toContain('id="crisis-label" class="crisis-hint"');
    const css = readFileSync('src/style.css', 'utf8');
    // Regression: the old short-height selector hid every readout paragraph, including the only fatal countdown.
    expect(css).not.toMatch(/\.dual-organ\s+\.battle-telemetry\s+\.readout\s+p\s*,[^{}]*\{display:none\}/);
    expect(css).toContain('.dual-organ .pressure #crisis-label{display:block!important;');
    expect(css).toContain('.dual-organ .battle-telemetry .readout-help{display:none}');
    expect(css).not.toMatch(/#crisis-label[^{}]*\{[^}]*display\s*:\s*none/);
    expect(css).not.toMatch(/#crisis-label[^{}]*\{[^}]*max-height\s*:/);
  });

  it('retains both offscreen source presence and actual damage, distinguishes repairing here from returning to rescue', () => {
    const session = new GameSession(13, { campaign: true, milestone: 'G3' }); session.start();
    const state = session.state, lung = state.campaign!.arenas.lung;
    lung.activated = true; lung.tissue.hp = 42; lung.backgroundLoss = 2.5;
    const before = JSON.stringify(state), away = arenaSummary(state, 'lung');
    expect(away).toContain('△ 需回救'); expect(away).toContain('离场损伤 −2.5'); expect(away).toContain('残留 1 个感染源');
    expect(away).toContain('class="organ-risk"'); expect(JSON.stringify(state)).toBe(before);
    state.campaign!.activeOrganId = 'lung'; state.tissue.hp = 42;
    const current = arenaSummary(state, 'lung');
    expect(current).toContain('△ 需抢修'); expect(current).not.toContain('△ 需回救');
  });
});
