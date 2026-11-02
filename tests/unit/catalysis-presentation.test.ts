import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, endlessCombatStats, offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import { catalysisStatus, catalysisToolCopy } from '../../src/ui/catalysisHud';
import { endlessOverlay } from '../../src/ui/endlessHud';
import { drawCatalysis } from '../../src/render/catalysisVisuals';
import type { Target } from '../../src/game/types';
import type { SceneLabel } from '../../src/render/sceneLabels';

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state; state.endlessGrowth!.ranks.catalysis = 1;
  const actors: Target[] = Array.from({ length: 4 }, (_, i) => ({ id: `marked-${i}`, x: 800 + i * 40, y: 800, hp: 60, maxHp: 68,
    role: 'virus', kind: 'single', radius: 22, hitUntil: 0, scanned: false }));
  state.targets = actors;
  state.endlessGrowth!.pendingCatalysis = { id: 'fixture-batch', organId: 'heart', createdAt: state.elapsed,
    until: state.elapsed + 4, targetIds: actors.slice(0, 3).map(a => a.id), damage: 93.4375 };
  return state;
}

describe('purification aftershock presentation with legacy upgrade IDs', () => {
  it('explains a full-damage main explosion followed by one smaller aftershock', () => {
    const base = createEndlessGrowth(7); expect(catalysisToolCopy(endlessCombatStats(base))).toBeNull();
    base.ranks = { immune: 1, catalysis: 1 };
    const copy = catalysisToolCopy(endlessCombatStats(base))!;
    expect(copy.title).toBe('净化余震'); expect(copy.short).toContain('主爆不减伤');
    expect(copy.detail).toContain('0.35秒'); expect(copy.detail).toContain('75%半径、40%伤害');
    expect(copy.detail).toContain('不会递归'); expect(copy.detail).not.toContain('铺标');
    const state = fixture(); state.phase = 'paused';
    const html = endlessOverlay(state, false, false)!;
    expect(html).toContain('<dt>净化能量炮</dt>'); expect(html).toContain('净化余震');
  });

  it('does not advertise stale catalyst batches in the challenge or mutate their historical data', () => {
    const state = fixture(), before = JSON.stringify(state), text = catalysisStatus(state);
    expect(text).toBe('');
    expect(JSON.stringify(state)).toBe(before); state.phase = 'paused'; expect(catalysisStatus(state)).toBe(text);
    state.targets[0].hp = 0; expect(catalysisStatus(state)).toBe('');
    state.elapsed = state.endlessGrowth!.pendingCatalysis!.until; expect(catalysisStatus(state)).toBe('');
  });

  it('does not draw old conversion markers in challenge or drive gameplay from rendering', () => {
    const state = fixture(), before = JSON.stringify(state), labels: SceneLabel[] = [];
    const ctx = new Proxy({}, { get: () => (..._args: unknown[]) => undefined, set: () => true }) as CanvasRenderingContext2D;
    drawCatalysis(ctx, state, { add: label => labels.push(label) });
    expect(labels).toHaveLength(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('labels the actual nova-gated legacy upgrade ID as an additional aftershock', () => {
    const state = fixture(); delete state.endlessGrowth!.pendingCatalysis;
    for (let seed = 0; seed < 50; seed++) {
      const growth = createEndlessGrowth(seed); growth.level = 5; growth.ranks.nova = 1; offerEndlessUpgrade(growth, 6);
      if (!growth.draft!.options.some(o => o.id === 'catalysis')) continue;
      state.endlessGrowth = growth; state.phase = 'paused';
      const html = endlessOverlay(state, false, false)!;
      expect(html).toContain('工具2 · 追加余震'); expect(html).toContain('data-upgrade="catalysis"'); return;
    }
    throw Error('Expected a legal seed with the gated catalyst offer');
  });
});
