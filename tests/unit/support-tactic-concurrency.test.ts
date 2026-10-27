import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';

const open: WorldGeometry = { width: 2400, height: 1600,
  bounds: { left: 20, right: 2380, top: 20, bottom: 1580 }, obstacles: [],
  foreground: { x: 0, y: 0, width: 0, height: 0 } };
function actor(id: string, tactic: EnemyTactic, x: number, y: number, hp = 10000): Target {
  return { id, tactic, x, y, hp, maxHp: hp, radius: 22, role: 'virus', kind: 'single', traits: [],
    hitUntil: 0, scanned: false, born: 0, attackReady: 0, generation: 0, sourceId: 'endless:wave:30' };
}
function fixture(targets: Target[]) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
  // Controlled attack-concurrency fixture. It does not claim natural difficulty:
  // extra cohorts/allies are disabled and player durability permits observation.
  s.world = open; Object.assign(s.player, { x: 1100, y: 700, hp: 10000 });
  Object.assign(s.tissue, { x: 1200, y: 1000 }); s.targets = targets;
  s.growth!.cells = []; s.growth!.beacon = null;
  Object.assign(s.endless!, { wave: 30, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (patch: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0,
    aim: { x: s.player.x + 100, y: s.player.y }, fire: false, ...patch });
  return { session, s, events, step };
}
const activeKind = (target: Target) => target.charge ? 'crystal-charge' : target.attackAt !== undefined ? target.attackPlan?.kind : undefined;

describe('known mixed support tactics retain counter windows', () => {
  it('limits each heavy tactic while allowing two ray lanes and the existing total of three commitments', () => {
    const f = fixture([actor('ray-a', 'thin-ray', 680, 700), actor('ray-b', 'thin-ray', 1100, 280),
      actor('rush-a', 'crystal-charge', 1100, 1120), actor('rush-b', 'crystal-charge', 1520, 700),
      actor('burst-a', 'fission-burst', 800, 450), actor('burst-b', 'fission-burst', 1400, 450),
      actor('corrosion-a', 'mimic-corrosion', 1600, 1000), actor('corrosion-b', 'mimic-corrosion', 1200, 1400)]);
    const observed = new Set<string>(); let maximumRays = 0;
    for (let tick = 0; tick < 600; tick++) {
      f.step(); const kinds = f.s.targets.filter(target => target.hp > 0).map(activeKind).filter(Boolean);
      for (const kind of kinds) observed.add(kind!);
      maximumRays = Math.max(maximumRays, kinds.filter(kind => kind === 'thin-ray').length);
      expect(kinds.length).toBeLessThanOrEqual(3);
      for (const kind of ['crystal-charge', 'fission-burst', 'mimic-corrosion']) expect(kinds.filter(value => value === kind).length).toBeLessThanOrEqual(1);
    }
    expect(maximumRays).toBe(2);
    expect(observed).toEqual(new Set(['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion']));
  });

  it('keeps a second charge queued throughout the first windup and actual rush, then admits it during recovery', () => {
    const first = actor('rush-first', 'crystal-charge', 680, 700), next = actor('rush-next', 'crystal-charge', 1520, 700);
    const f = fixture([first, next]); f.step();
    expect(first.attackPlan?.kind).toBe('crystal-charge'); expect(next.attackAt).toBeUndefined();
    for (let ticks = 0; ticks < 200 && !first.charge; ticks++) { f.step(); expect(next.attackAt).toBeUndefined(); }
    expect(first.charge).toBeDefined();
    for (let ticks = 0; ticks < 200 && first.charge; ticks++) {
      f.step(); if (first.charge) expect(next.attackAt).toBeUndefined();
    }
    expect(first.charge).toBeUndefined(); expect(first.recoverUntil).toBeGreaterThan(f.s.elapsed);
    expect(next.attackPlan?.kind).toBe('crystal-charge');
    expect(f.events.filter(event => event.type === 'ENEMY_TACTIC_COMMITTED' && event.data.tactic === 'crystal-charge')).toHaveLength(2);
  });

  it('releases a corrosion channel slot on real Q interruption and never resolves its cancelled deadline', () => {
    const first = actor('corrosion-first', 'mimic-corrosion', 800, 1000), next = actor('corrosion-next', 'mimic-corrosion', 1600, 1000);
    const f = fixture([first, next]); f.step();
    const oldDeadline = first.attackAt!; expect(next.attackAt).toBeUndefined();
    f.step({ scan: true, aim: { x: first.x, y: first.y } });
    expect(first.attackAt).toBeUndefined(); expect(first.recoverUntil).toBeGreaterThan(oldDeadline);
    expect(next.attackPlan?.kind).toBe('mimic-corrosion'); const nextDeadline = next.attackAt!;
    const expectedDamage = next.attackPlan!.tissueDamage, before = f.s.tissue.hp;
    while (f.s.elapsed + 1e-9 < nextDeadline) f.step();
    expect(f.events.filter(event => event.type === 'ENDLESS_CORROSION_INTERRUPTED')).toHaveLength(1);
    const resolutions = f.events.filter(event => event.type === 'ENEMY_TACTIC_RESOLVED');
    expect(resolutions).toHaveLength(1); expect(resolutions[0].data.actorId).toBe(next.id);
    expect(f.s.tissue.hp).toBe(before - expectedDamage);
  });

  it('lets two base shots remove a lightweight support and release its heavy slot without needing a specific upgrade', () => {
    const first = actor('fragile-first', 'fission-burst', 680, 700, 68), next = actor('fragile-next', 'fission-burst', 1520, 700, 68);
    const f = fixture([first, next]); f.step({ fire: true, tool: 1, aim: first });
    expect(first.hp).toBe(34); expect(first.attackPlan?.kind).toBe('fission-burst'); expect(next.attackAt).toBeUndefined();
    for (let ticks = 0; ticks < 11; ticks++) f.step();
    f.step({ fire: true, tool: 1, aim: first });
    expect(first.hp).toBe(0); expect(first.attackAt).toBeUndefined(); expect(first.splitAt).toBeUndefined();
    expect(next.attackPlan?.kind).toBe('fission-burst');
    expect(f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === first.id)).toHaveLength(2);
    expect(first.traits).toEqual([]); expect(next.traits).toEqual([]);
  });
});
