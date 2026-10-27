import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEliteTacticCycle } from '../../src/game/eliteTacticCycle';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import { TRAITS } from '../../src/game/battleConfig';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import { eliteCycleCounter, eliteCycleForecast, eliteCycleStatus } from '../../src/ui/eliteTacticCycleHud';
import { endlessEvolutionWarningContent } from '../../src/ui/endlessEvolutionWarning';
import { drawEliteTacticCycles } from '../../src/render/eliteTacticCycleVisuals';
import type { SceneLabel } from '../../src/render/sceneLabels';
import type { Target } from '../../src/game/types';

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
  Object.assign(s.endless!, { wave: 20, eliteWave: true, phase: 'combat', traits: ['CARAPACE', 'FISSION'] });
  s.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(s.player, { x: 500, y: 500 }); s.tick = 120; s.elapsed = 2;
  const t: Target = { id: 'fixture-elite', x: 800, y: 500, radius: 30, hp: 204, maxHp: 204, role: 'elite', kind: 'single',
    sourceId: 'endless:wave:20', generation: 0, hitUntil: 0, scanned: false, traits: ['CARAPACE', 'FISSION'],
    tactic: 'crystal-charge', eliteCycle: createEliteTacticCycle(['CARAPACE', 'FISSION']) };
  s.targets = [t]; return { s, t };
}

describe('announced double-tactic elite presentation', () => {
  it('forecasts only the announced late elite pair and preserves early lessons', () => {
    const { s } = fixture(), before = JSON.stringify(s);
    expect(eliteCycleForecast(s)).toContain('锁向冲锋 → 双点爆发'); expect(JSON.stringify(s)).toBe(before);
    s.endless!.wave = 15; expect(eliteCycleForecast(s)).toBe('');
  });

  it('shows both passive abilities, costs and basic counters before the immutable generation commits', () => {
    const { s } = fixture(); s.endless!.phase = 'warning';
    s.endless!.evolution!.pending = { warnedAt: 2, appliesAt: 10, decision: { kind: 'warn', generation: 4, main: 'CARAPACE',
      traits: ['CARAPACE', 'MIMIC'], warningSeconds: 8, roll: .2, candidates: [], summary: { precisionDamage: 0, areaDamage: 0, precisionRatio: 0, areaRatio: 0, scans: 0, isolations: 0, repaired: 0, sampleCount: 0, fromTick: 0, toTick: 120 } } };
    const before = JSON.stringify(s), html = endlessEvolutionWarningContent(s)!;
    for (const id of ['CARAPACE', 'MIMIC'] as const) {
      expect(html).toContain(TRAITS[id].ability); expect(html).toContain(TRAITS[id].cost); expect(html).toContain(TRAITS[id].counter);
    }
    expect(html).toContain('锁向冲锋 → 组织侵蚀'); expect(JSON.stringify(s)).toBe(before);
    for (const tactic of ['crystal-charge', 'mimic-corrosion'] as const) expect(html).toContain(ENEMY_TACTIC_INFO[tactic].counter);
    s.phase = 'paused'; expect(endlessEvolutionWarningContent(s)).toBe(html);
  });

  it('reports actual windup and current counter, without advancing a prepared pair', () => {
    const { s, t } = fixture(); t.attackPlan = enemyAttackPlan(t, s)!; t.attackAt = s.elapsed + t.attackPlan.windup; t.eliteCycle!.committedTick = s.tick;
    const before = JSON.stringify(s);
    expect(eliteCycleStatus(s, t)).toContain('锁向冲锋前摇 1.2s'); expect(eliteCycleStatus(s, t)).toContain('随后双点爆发');
    expect(eliteCycleCounter(s, t)).toContain('当前反制'); expect(eliteCycleCounter(s, t)).toContain('侧闪');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('keeps recovery and the next counter distinct from the old tactic pose', () => {
    const { s, t } = fixture(); t.eliteCycle!.index = 1; t.recoverUntil = 4;
    expect(t.tactic).toBe('crystal-charge'); expect(eliteCycleStatus(s, t)).toBe('恢复 2.0s · 下招双点爆发');
    expect(eliteCycleCounter(s, t)).toContain('准备反制'); expect(eliteCycleCounter(s, t)).toContain('落点');
  });

  it('draws only actual living cycle labels, hides idle mimic locations, and never mutates state', () => {
    const { s, t } = fixture(), labels: SceneLabel[] = [], before = JSON.stringify(s);
    drawEliteTacticCycles(s, { add: label => labels.push(label) }); expect(labels).toHaveLength(1); expect(JSON.stringify(s)).toBe(before);
    t.traits = ['CARAPACE', 'MIMIC']; t.eliteCycle = createEliteTacticCycle(t.traits); labels.length = 0; drawEliteTacticCycles(s, { add: label => labels.push(label) }); expect(labels).toEqual([]);
    t.revealedUntil = 3; drawEliteTacticCycles(s, { add: label => labels.push(label) }); expect(labels).toHaveLength(1);
    t.hp = 0; labels.length = 0; drawEliteTacticCycles(s, { add: label => labels.push(label) }); expect(labels).toEqual([]);
  });
});
