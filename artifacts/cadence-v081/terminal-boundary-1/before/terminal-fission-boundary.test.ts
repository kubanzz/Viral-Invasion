import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameEvent, Target } from '../../src/game/types';

// BEGIN SHARED TERMINAL FIXTURE
/** Explicit same-tick ordering fixture, not a natural-play difficulty claim.
 * Only the initial bodies, frozen melee warning and due fission promise are
 * assigned. GameSession owns the hit, births, later warning and final result.
 * The evidence runner extracts this exact helper for both frozen and candidate
 * bundles, so the comparison cannot silently use two different scenarios.
 */
export function terminalFissionBoundary(Session: typeof GameSession, terminal: 'player' | 'tissue', lethal: boolean, fissionFirst: boolean) {
  const session = new Session(71, { mode: 'endless' }); session.start();
  const s = session.state, events: Array<GameEvent & { observedPlayerHp: number; observedTissueHp: number; observedPhase: string }> = [];
  s.world = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(s.player, { x: 600, y: 700, hp: terminal === 'player' && lethal ? 1 : 100, dashUntil: 0 });
  Object.assign(s.tissue, { x: 1400, y: 700, hp: terminal === 'tissue' && lethal ? 1 : 100 });
  Object.assign(s.endless!, { phase: 'combat', remainingToSpawn: 2, nextSpawnAt: 100 });
  const body = (id: string, x: number, y: number): Target => ({ id, x, y, kind: 'single', role: 'virus', radius: 22,
    hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 0, generation: 0, sourceId: 'endless:wave:1' });
  const victim = terminal === 'player' ? s.player : s.tissue;
  const killer = { ...body('killer', victim.x - 45, victim.y), attackAt: 1 / 60, attackAim: { x: victim.x, y: victim.y }, attackTarget: terminal, attackRadius: 58 };
  const pending: Target = { ...body('pending-fission', 820, 700), kind: 'cluster', hp: 0, deadAt: 0, traits: ['FISSION'], splitAt: 1 / 60,
    splitPositions: [{ x: 793, y: 710 }, { x: 847, y: 710 }] };
  const later = body('later-threat', s.player.x + 45, s.player.y);
  s.targets = fissionFirst ? [pending, killer, later] : [killer, pending, later];
  const before = session.snapshot();
  session.bus.on('event', event => events.push({ ...structuredClone(event), observedPlayerHp: s.player.hp, observedTissueHp: s.tissue.hp, observedPhase: s.phase }));
  session.step({ moveX: 0, moveY: 0, aim: { x: s.player.x + 1, y: s.player.y }, fire: false });
  return { session, s, events, before, pending, later };
}
// END SHARED TERMINAL FIXTURE

describe.each(['player', 'tissue'] as const)('same-tick %s terminal boundary', terminal => {
  it('stops a later due fission and later threat after a lethal strike', () => {
    const f = terminalFissionBoundary(GameSession, terminal, true, false);
    expect(f.s[terminal].hp).toBe(0); expect(f.s.phase).toBe('result');
    expect(f.s.targets.filter(target => target.generation === 1)).toHaveLength(0);
    expect(f.events.some(event => event.type === 'ACTOR_SPAWNED' || event.type === 'FISSION_SPAWNED')).toBe(false);
    expect(f.events.some(event => event.type === 'ATTACK_TELEGRAPHED' && event.data.actorId === f.later.id)).toBe(false);
    expect(f.later.attackAt).toBeUndefined(); expect(f.pending.splitAt).toBe(1 / 60);
    expect(f.s.endless!.remainingToSpawn).toBe(2); expect(f.s.endless!.clearedWaves).toBe(0);
    expect(f.s.endless!.score).toBe(0); expect(f.s.endlessGrowth!.draft).toBeNull(); expect(f.s.growth!.draft).toBeNull();
    expect(f.events.some(event => event.type === 'ENDLESS_WAVE_CLEARED')).toBe(false);
    expect(f.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
  });

  it('allows both promised children and the later warning when the strike is survivable', () => {
    const f = terminalFissionBoundary(GameSession, terminal, false, false);
    expect(f.s[terminal].hp).toBeGreaterThan(0); expect(f.s[terminal].hp).toBeLessThan(100); expect(f.s.phase).toBe('playing');
    expect(f.s.targets.filter(target => target.generation === 1 && target.hp > 0)).toHaveLength(2);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(2);
    expect(f.events.filter(event => event.type === 'FISSION_SPAWNED').map(event => event.data.children)).toEqual([2]);
    expect(f.pending.splitAt).toBeUndefined(); expect(f.later.attackAt).toBeGreaterThan(f.s.elapsed);
    expect(f.events.filter(event => event.type === 'ATTACK_TELEGRAPHED' && event.data.actorId === f.later.id)).toHaveLength(1);
    expect(f.s.endless!.remainingToSpawn).toBe(2); expect(f.s.endless!.clearedWaves).toBe(0);
    expect(f.events.some(event => event.type === 'ENDLESS_WAVE_CLEARED' || event.type === 'RUN_ENDED')).toBe(false);
  });

  it('retains children legally born before the lethal strike and stops only later work', () => {
    const f = terminalFissionBoundary(GameSession, terminal, true, true);
    expect(f.s[terminal].hp).toBe(0); expect(f.s.phase).toBe('result');
    expect(f.s.targets.filter(target => target.generation === 1 && target.hp > 0)).toHaveLength(2);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(2);
    expect(f.events.filter(event => event.type === 'FISSION_SPAWNED').map(event => event.data.children)).toEqual([2]);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED' || event.type === 'FISSION_SPAWNED')
      .every(event => event.observedPlayerHp > 0 && event.observedTissueHp > 0)).toBe(true);
    expect(f.pending.splitAt).toBeUndefined(); expect(f.later.attackAt).toBeUndefined();
    expect(f.events.some(event => event.type === 'ATTACK_TELEGRAPHED' && event.data.actorId === f.later.id)).toBe(false);
    expect(f.s.endless!.remainingToSpawn).toBe(2); expect(f.s.endless!.clearedWaves).toBe(0);
    expect(f.s.endless!.score).toBe(0); expect(f.s.endlessGrowth!.draft).toBeNull(); expect(f.s.growth!.draft).toBeNull();
    expect(f.events.some(event => event.type === 'ENDLESS_WAVE_CLEARED')).toBe(false);
    expect(f.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
  });
});
