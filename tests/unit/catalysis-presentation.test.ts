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

describe('catalysis choice and preparation presentation', () => {
  it('identifies a deliberate tool conversion and removes the old knockback promise from the active summary', () => {
    const base = createEndlessGrowth(7); expect(catalysisToolCopy(endlessCombatStats(base))).toBeNull();
    base.ranks = { immune: 1, catalysis: 1 };
    const copy = catalysisToolCopy(endlessCombatStats(base))!;
    expect(copy.short).toContain('直伤≤8'); expect(copy.detail).toContain('无击退');
    expect(copy.detail).toContain('整批一次'); expect(copy.detail).toContain('不叠加');
    const state = fixture(); state.phase = 'paused';
    const html = endlessOverlay(state, false, false)!;
    expect(html).toContain('<dt>催化裂解</dt>'); expect(html).toContain('低伤铺标，无击退');
  });

  it('shows preparation, hides dead/expired batches, and keeps the same deadline through pause', () => {
    const state = fixture(), before = JSON.stringify(state), text = catalysisStatus(state);
    expect(text).toContain('催化 3体'); expect(text).toContain('1/细胞引爆'); expect(text).not.toContain('已命中');
    expect(JSON.stringify(state)).toBe(before); state.phase = 'paused'; expect(catalysisStatus(state)).toBe(text);
    state.targets[0].hp = 0; expect(catalysisStatus(state)).toContain('催化 2体');
    state.elapsed = state.endlessGrowth!.pendingCatalysis!.until; expect(catalysisStatus(state)).toBe('');
  });

  it('draws only the three actual marked bodies and never drives gameplay from rendering', () => {
    const state = fixture(), before = JSON.stringify(state), labels: SceneLabel[] = [];
    const ctx = new Proxy({}, { get: () => (..._args: unknown[]) => undefined, set: () => true }) as CanvasRenderingContext2D;
    drawCatalysis(ctx, state, { add: label => labels.push(label) });
    expect(labels).toHaveLength(3); expect(labels.every(l => l.essential && l.lines[0].text.includes('催化'))).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('labels an actually offered first catalyst as a conversion with a cost', () => {
    const state = fixture(); delete state.endlessGrowth!.pendingCatalysis;
    for (let seed = 0; seed < 50; seed++) {
      const growth = createEndlessGrowth(seed); growth.level = 5; growth.ranks.immune = 1; offerEndlessUpgrade(growth, 6);
      if (!growth.draft!.options.some(o => o.id === 'catalysis')) continue;
      state.endlessGrowth = growth; state.phase = 'paused';
      const html = endlessOverlay(state, false, false)!;
      expect(html).toContain('改造工具2 · 有取舍'); expect(html).toContain('data-upgrade="catalysis"'); return;
    }
    throw Error('Expected a legal seed with the gated catalyst offer');
  });
});
