import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createOpeningEvolution, freezeOpeningEvolution, openingIntroductionBlocked, openingVariantSlots,
  recordOpeningDamage, OPENING_EVOLUTION_BALANCE } from '../../src/game/openingEvolution';
import type { EndlessSpawnRole } from '../../src/game/endlessTypes';
import type { GameEvent, Target } from '../../src/game/types';

const target = (role: Target['role'] = 'virus'): Target => ({ id: 'target', role, kind: 'single', hp: 0, maxHp: 100,
  x: 100, y: 100, radius: 20, hitUntil: 0, scanned: false });
const event = (data: GameEvent['data'] = {}, tick = 1): GameEvent => ({ type: 'TARGET_HIT', tick,
  data: { id: 'target', cause: 'basic', tool: 1, damage: 20, ...data } });

describe('finite first-two-wave evidence and deterministic opening branch', () => {
  it('counts actual clipped HP loss, every real same-tick bullet, and captured firing tool', () => {
    const opening = createOpeningEvolution(), body = target();
    recordOpeningDamage(opening, event({ damage: 7, rawDamage: 340, basicTool: 1, tool: 3 }), body);
    for (let i = 0; i < 3; i++) recordOpeningDamage(opening, event({ damage: 34 }), body);
    recordOpeningDamage(opening, event({ damage: 80, basicTool: 2, tool: 1 }), body);
    expect(opening).toEqual({ precisionDamage: 109, areaDamage: 80 });
  });

  it.each(['nova', 'scan', 'dash', 'catalysis', 'charged-slash', 'cannon-aftershock'])(
    'counts %s as area damage independently of the currently held tool', ability => {
      const opening = createOpeningEvolution();
      for (const tool of [1, 2, 3]) recordOpeningDamage(opening, event({ cause: 'ability', ability, tool }), target());
      expect(opening).toEqual({ precisionDamage: 0, areaDamage: 60 });
    });

  it.each(['IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE'])(
    'excludes autonomous protocol %s even with misleading held-tool fields', protocolId => {
      const opening = createOpeningEvolution();
      recordOpeningDamage(opening, event({ cause: 'protocol', protocolId, tool: 1, ability: 'scan' }), target());
      expect(opening).toEqual(createOpeningEvolution());
    });

  it.each([0, -1, NaN, Infinity, -Infinity, '20', true])('rejects nonpositive or invalid actual damage %s', damage => {
    const opening = createOpeningEvolution(); recordOpeningDamage(opening, event({ damage }), target());
    expect(opening).toEqual(createOpeningEvolution());
  });

  it('rejects capsule/event/host damage, missing bodies, mismatched receipts and firing logs', () => {
    const opening = createOpeningEvolution();
    for (const role of ['capsule', 'event'] as const) recordOpeningDamage(opening, event(), target(role));
    recordOpeningDamage(opening, event({ ability: 'host-event', cause: 'ability' }), target());
    recordOpeningDamage(opening, event({ eventTarget: true }), target());
    recordOpeningDamage(opening, event());
    recordOpeningDamage(opening, event({ id: 'other' }), target());
    recordOpeningDamage(opening, { ...event(), type: 'TOOL_FIRED' }, target());
    recordOpeningDamage(opening, event({ cause: 'ability', ability: 'unknown' }), target());
    recordOpeningDamage(opening, event({ cause: 'basic', basicTool: 3, tool: 1 }), target());
    expect(opening).toEqual(createOpeningEvolution());
  });

  it('retains early evidence after ninety seconds without keeping a per-tick history', () => {
    const opening = createOpeningEvolution();
    recordOpeningDamage(opening, event({ damage: 300 }, 1), target());
    recordOpeningDamage(opening, event({ cause: 'ability', ability: 'charged-slash', damage: 100 }, 10000), target());
    expect(freezeOpeningEvolution(opening, 71, 12000)).toEqual({ trait: 'CARAPACE', reason: 'precision-dominant', frozenAtTick: 12000 });
    expect(opening).not.toHaveProperty('history');
  });

  it.each([
    [120, 80, 'CARAPACE', 'precision-dominant'],
    [80, 120, 'FISSION', 'area-dominant'],
    [6000, 4000, 'CARAPACE', 'precision-dominant'],
    [4000, 6000, 'FISSION', 'area-dominant'],
  ] as const)('selects at the inclusive minimum and sixty-percent boundary %i/%i', (precisionDamage, areaDamage, trait, reason) => {
    const opening = { precisionDamage, areaDamage };
    expect(freezeOpeningEvolution(opening, 17, 500)).toEqual({ trait, reason, frozenAtTick: 500 });
  });

  it('uses a dedicated stable 50/50 seeded fallback and records the honest cause', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 128; seed++) {
      const mixed = { precisionDamage: 100, areaDamage: 100 };
      const insufficient = { precisionDamage: 119, areaDamage: 80 };
      const selected = freezeOpeningEvolution(mixed, seed, 1);
      seen.add(selected.trait); expect(selected.reason).toBe('mixed');
      expect(freezeOpeningEvolution(insufficient, seed, 2)).toEqual({ ...selected, reason: 'insufficient-data', frozenAtTick: 2 });
      const restored = JSON.parse(JSON.stringify(mixed));
      expect(freezeOpeningEvolution(restored, seed + 1, 999)).toEqual(selected);
    }
    expect([...seen].sort()).toEqual(['CARAPACE', 'FISSION']);
  });

  it('freezes once, ignores new damage, and resets only through a fresh run record', () => {
    const opening = { precisionDamage: 300, areaDamage: 0 };
    const selection = freezeOpeningEvolution(opening, 71, 100);
    recordOpeningDamage(opening, event({ cause: 'ability', ability: 'scan', damage: 10000 }), target());
    expect(freezeOpeningEvolution(opening, 0, 999)).toBe(selection);
    expect(opening).toMatchObject({ precisionDamage: 300, areaDamage: 0 });
    expect(createOpeningEvolution()).toEqual({ precisionDamage: 0, areaDamage: 0 });
  });
});

describe('small special-body quotas within the existing finite wave recipe', () => {
  it.each([[3, 80, 6], [4, 160, 8], [5, 120, 8]])('selects exactly %i-wave slots without replacing other roles', (wave, budget, quota) => {
    const roles: EndlessSpawnRole[] = Array.from({ length: budget }, () => 'ordinary');
    roles[0] = 'elite'; roles[2] = 'support'; roles[5] = 'source';
    const before = [...roles], slots = openingVariantSlots(wave, roles);
    expect(slots).toHaveLength(quota); expect(new Set(slots).size).toBe(quota);
    expect(slots[0]).toBe(1); expect(slots.every(slot => roles[slot] === 'ordinary')).toBe(true);
    expect(slots).toEqual(openingVariantSlots(wave, roles)); expect(roles).toEqual(before);
    const eligible = roles.flatMap((role, index) => role === 'ordinary' ? [index] : []);
    expect(slots.map(slot => eligible.indexOf(slot))).toEqual(Array.from({ length: quota }, (_, i) => Math.floor(i * eligible.length / quota)));
  });
  it('does not leak opening quotas into waves one/two/six/nine/twenty or exceed a short recipe', () => {
    const roles: EndlessSpawnRole[] = ['ordinary', 'support', 'ordinary'];
    for (const wave of [0, 1, 2, 6, 9, 20]) expect(openingVariantSlots(wave, roles)).toEqual([]);
    expect(openingVariantSlots(3, roles)).toEqual([0, 2]);
    expect(openingVariantSlots(4, [])).toEqual([]);
  });
});

describe('first actual special birth gates the separate exercise announcement', () => {
  function fixture() {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
    const opening = s.endless!.evolution!.opening = createOpeningEvolution();
    freezeOpeningEvolution(opening, s.seed, s.tick);
    return { s, e: s.endless!, opening };
  }
  it('blocks the warning, a postponed first birth and its three simulation seconds, then releases', () => {
    const { s, e, opening } = fixture();
    e.wave = 2; expect(openingIntroductionBlocked(s)).toBe(false);
    e.wave = 3; e.phase = 'warning'; expect(openingIntroductionBlocked(s)).toBe(true);
    e.phase = 'combat'; s.elapsed = 40; expect(openingIntroductionBlocked(s)).toBe(true);
    opening.firstBornAt = 40; s.elapsed = 42.99; expect(openingIntroductionBlocked(s)).toBe(true);
    s.elapsed = 43; expect(openingIntroductionBlocked(s)).toBe(false);
    e.wave = 4; e.phase = 'warning'; expect(openingIntroductionBlocked(s)).toBe(false);
    expect(OPENING_EVOLUTION_BALANCE.introductionSeconds).toBe(3);
  });
  it('does not gate hidden modes or old isolated fixtures without a selected opening', () => {
    const { s, e, opening } = fixture(); e.wave = 3; e.phase = 'combat';
    delete opening.selection; expect(openingIntroductionBlocked(s)).toBe(false);
    delete s.endless; expect(openingIntroductionBlocked(s)).toBe(false);
  });
});
