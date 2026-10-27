import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeedRng } from '../../src/core/rng';
import { TRAITS } from '../../src/game/battleConfig';
import type { TraitId } from '../../src/game/battleTypes';
import type { EndlessEvolutionWarning } from '../../src/game/endlessTypes';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import { GameSession } from '../../src/game/session';
import { endlessHudMarkup, updateEndlessHud } from '../../src/ui/endlessHud';
import { endlessEvolutionWarningContent, endlessEvolutionWarningMarkup, endlessTraitCopy,
  endlessUpcomingTraits, updateEndlessEvolutionWarning } from '../../src/ui/endlessEvolutionWarning';

function decision(main: TraitId = 'CARAPACE', companion: TraitId = 'MIMIC', generation = 4): EndlessEvolutionWarning {
  return { kind: 'warn', main, traits: [main, companion], generation, warningSeconds: 8, roll: .2, candidates: [],
    summary: { precisionDamage: 340, areaDamage: 65, precisionRatio: 340 / 405, areaRatio: 65 / 405,
      scans: 3, isolations: 0, repaired: 25, sampleCount: 10, fromTick: 600, toTick: 6000 } };
}
function fixture() {
  const session = new GameSession(919, { mode: 'endless' }); session.start();
  const state = session.state; state.tick = 6000; state.elapsed = 100;
  Object.assign(state.endless!, { wave: 20, eliteWave: true, phase: 'warning', phaseUntil: 108,
    traits: ['FISSION', 'MIMIC'], evolution: { history: [], recentPrimaries: ['FISSION'], current: decision('FISSION', 'MIMIC', 3),
      pending: { decision: decision(), warnedAt: 100, appliesAt: 108 } } });
  return { session, state, e: state.endless! };
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') { for (const nested of Object.values(value)) freezeDeep(nested); Object.freeze(value); }
  return value;
}
function mount() {
  const nodes = new Map<string, { textContent: string; innerHTML: string; hidden: boolean; style: { width: string }; title: string; dataset: Record<string, string> }>();
  for (const match of endlessHudMarkup().matchAll(/id="([^"]+)"/g)) nodes.set(match[1], {
    textContent: '', innerHTML: '', hidden: true, style: { width: '' }, title: '', dataset: {} });
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'endless-minimap' ? { getContext: () => null } : nodes.get(id) ?? null });
  return nodes;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('a saved, readable endless generation warning', () => {
  it('mounts one independently named card in the HUD and reuses its protected evolution footprint', () => {
    const markup = endlessHudMarkup(), card = endlessEvolutionWarningMarkup();
    expect(markup).toContain(card); expect(markup.match(/id="endless-evolution-warning"/g)).toHaveLength(1);
    expect(card).toContain('class="evolution-card endless-evolution-warning"');
    expect(card).toContain('role="status"'); expect(card).toContain('连续挑战进化预警'); expect(card).toContain('hidden');
    expect(card).not.toContain('id="evolution-card"');
  });

  it.each<TraitId>(['CARAPACE', 'FISSION', 'MIMIC'])('shows the real ability, cost and base counter for %s', main => {
    const f = fixture(), companion = main === 'MIMIC' ? 'CARAPACE' : 'MIMIC';
    f.e.evolution!.pending!.decision = decision(main, companion);
    const content = endlessEvolutionWarningContent(f.state)!;
    for (const copy of [TRAITS[main].name, TRAITS[main].ability, TRAITS[main].cost, TRAITS[main].counter,
      TRAITS[companion].name, '第 4 代', '伴随变异', '获得', '代价', '基础反制', '8.0s']) expect(content).toContain(copy);
    for (const implementation of ['probability', 'candidates', 'responseBias', '55%', 'RNG', '权重']) expect(content).not.toContain(implementation);
  });

  it('reads the locked next traits and elite ahead of the old current generation and mixed support copy', () => {
    const f = fixture(), nodes = mount();
    // A living old threat is intentionally inconsistent with the pending plan:
    // it must not replace the actual next elite's announced counter.
    f.state.targets = [{ id: 'old-threat', x: 900, y: 600, hp: 68, maxHp: 68, radius: 22, kind: 'single',
      role: 'virus', hitUntil: 0, scanned: false, tactic: 'fission-burst' }];
    const before = structuredClone(f.state); updateEndlessHud(f.state);
    expect(endlessUpcomingTraits(f.state)).toEqual(['CARAPACE', 'MIMIC']);
    const row = nodes.get('endless-traits')!.textContent;
    expect(row).toContain('将出现：◇晶壳 / ◌潜伏'); expect(row).toContain('当前：⋈裂殖 / ◌潜伏'); expect(row).toContain('混编');
    const objective = nodes.get('endless-objective')!.textContent;
    expect(objective).toContain(`精英 · ${ENEMY_TACTIC_INFO['crystal-charge'].name}`);
    expect(objective).toContain(ENEMY_TACTIC_INFO['crystal-charge'].counter); expect(objective).toContain('混编');
    expect(nodes.get('endless-evolution-warning')!.hidden).toBe(false);
    expect(f.state).toEqual(before);
  });

  it('renders frozen state without choosing or rerolling, using simulation seconds rather than tick or wall time', () => {
    const f = fixture(); f.state.elapsed = 102.25; f.state.tick = 99999;
    const state = freezeDeep(f.state), before = structuredClone(state);
    vi.spyOn(SeedRng.prototype, 'next').mockImplementation(() => { throw new Error('UI attempted to choose a trait'); });
    vi.spyOn(Date, 'now').mockReturnValue(1000000000);
    const content = endlessEvolutionWarningContent(state);
    expect(content).toContain('5.8s');
    vi.mocked(Date.now).mockReturnValue(2000000000);
    expect(endlessEvolutionWarningContent(state)).toBe(content);
    expect(state).toEqual(before);
  });

  it('keeps a pending warning and its countdown frozen throughout real paused session steps', () => {
    const f = fixture(); f.session.pause(); const frozen = f.session.snapshot();
    const warning = endlessEvolutionWarningContent(f.state);
    for (let tick = 0; tick < 120; tick++) f.session.step({ moveX: 1, moveY: 0, aim: f.state.player, fire: true, scan: true });
    expect(f.session.snapshot()).toEqual(frozen); expect(endlessEvolutionWarningContent(f.state)).toBe(warning);
    expect(warning).toContain('8.0s');
  });

  it('clamps an expired displayed countdown, then clears the card and changes the trait row when the host applies the plan', () => {
    const f = fixture(), nodes = mount(), card = nodes.get('endless-evolution-warning')!;
    f.state.elapsed = 109; updateEndlessEvolutionWarning(f.state);
    expect(card.innerHTML).toContain('0.0s'); expect(card.innerHTML).not.toContain('-1.0');
    f.e.evolution!.current = f.e.evolution!.pending!.decision;
    f.e.traits = [...f.e.evolution!.current.traits]; f.e.evolution!.pending = undefined; f.e.phase = 'combat';
    updateEndlessEvolutionWarning(f.state);
    expect(card.hidden).toBe(true); expect(card.innerHTML).toBe('');
    expect(endlessTraitCopy(f.state)).toBe('当前变异：◇晶壳 / ◌潜伏');
    expect(endlessEvolutionWarningContent(f.state)).toBeNull();
  });

  it('hides stale pending state outside a live or paused wave warning and never invents a warning for teaching waves', () => {
    const f = fixture();
    for (const phase of ['menu', 'result'] as const) { f.state.phase = phase; expect(endlessEvolutionWarningContent(f.state)).toBeNull(); }
    f.state.phase = 'playing';
    for (const phase of ['combat', 'intermission'] as const) { f.e.phase = phase; expect(endlessEvolutionWarningContent(f.state)).toBeNull(); }
    f.e.phase = 'warning'; f.e.evolution!.pending = undefined; f.e.wave = 15;
    expect(endlessEvolutionWarningContent(f.state)).toBeNull();
    expect(endlessTraitCopy(f.state)).toContain('将出现');
    delete f.state.endless; expect(endlessEvolutionWarningContent(f.state)).toBeNull(); expect(endlessTraitCopy(f.state)).toBe('');
  });
});
