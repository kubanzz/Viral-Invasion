import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession } from '../../src/game/session';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1600,
  bounds: { left: 20, right: 2380, top: 20, bottom: 1580 }, obstacles: [],
  foreground: { x: 0, y: 0, width: 0, height: 0 } };
const evidence: object[] = [];
function actor(id: string, tactic: EnemyTactic, x: number, y: number, hp = 68): Target {
  return { id, tactic, x, y, hp, maxHp: hp, radius: 22, role: 'virus', kind: 'single', traits: [],
    hitUntil: 0, scanned: false, born: 0, attackReady: 0, generation: 0, sourceId: 'endless:wave:30' };
}
function fixture(targets: Target[]) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
  // Independent finite combat fixture: no director reinforcements or allies.
  // Durability is raised solely to observe possible stale attack events.
  s.world = world; Object.assign(s.player, { x: 1100, y: 700, hp: 10000 });
  Object.assign(s.tissue, { x: 1200, y: 1000 }); s.targets = targets;
  s.growth!.cells = []; s.growth!.beacon = null;
  Object.assign(s.endless!, { wave: 30, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (patch: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0,
    aim: { x: s.player.x + 100, y: s.player.y }, fire: false, ...patch });
  return { s, events, step };
}
function startCharge(f: ReturnType<typeof fixture>, target: Target) {
  for (let tick = 0; tick < 100 && !target.charge; tick++) f.step();
  expect(target.charge).toBeDefined();
}
afterAll(() => {
  const output = process.env.VI_SUPPORT_COUNTER_REPORT; if (!output) return;
  const paths = ['src/game/battle.ts', 'src/game/session.ts', 'src/game/enemyTactics.ts', 'tests/unit/support-counter-review.test.ts'];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(),
    scope: 'Independent small GameSession fixtures. Not natural survival, difficulty, human readability or universal danger-union escape evidence.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), cases: evidence }, null, 2), { flag: 'wx' });
});

describe('independent support counter review', () => {
  it('a delayed area cast preserves the moving charge and its heavy slot until actual completion', () => {
    const first = actor('pushed-charge', 'crystal-charge', 680, 700), next = actor('waiting-charge', 'crystal-charge', 1520, 700);
    const f = fixture([first, next]); startCharge(f, first);
    expect(next.attackAt).toBeUndefined(); const oldEndsAt = first.charge!.endsAt;
    f.step({ tool: 2, fire: true, aim: { x: first.x, y: first.y } });
    expect(first.hp).toBe(68); expect(first.charge).toBeDefined();
    expect(next.attackPlan).toBeUndefined();
    const displaced = f.events.filter(event => event.type === 'TRACTION_DISPLACED' && event.data.targetId === first.id);
    expect(displaced).toHaveLength(0);
    while (f.s.elapsed <= oldEndsAt + .05) f.step();
    expect(f.events.filter(event => event.type === 'ENEMY_CHARGE_ENDED' && event.data.actorId === first.id)).toHaveLength(1);
    expect(next.attackPlan?.kind).toBe('crystal-charge');
    evidence.push({ name: 'traction-preserves-committed-charge', oldEndsAt, remainingHp: first.hp, displacement: displaced,
      limitation: 'Delayed tool2 uses the actual later blast position and never relocates/cancels a frozen charge. A moving body may escape the blast.' });
  });

  it('two real shots kill an active charge and release its heavy slot without stale completion', () => {
    const first = actor('killed-charge', 'crystal-charge', 680, 700), next = actor('queued-charge', 'crystal-charge', 1520, 700);
    const f = fixture([first, next]); startCharge(f, first); const oldEndsAt = first.charge!.endsAt;
    f.step({ tool: 1, fire: true, aim: { x: first.x, y: first.y } });
    expect(first.hp).toBe(34);
    for (let tick = 0; tick < 11; tick++) f.step();
    f.step({ tool: 1, fire: true, aim: { x: first.x, y: first.y } });
    expect(first.hp).toBe(0); expect(first.charge).toBeUndefined(); expect(first.attackPlan).toBeUndefined();
    expect(first.attackAt).toBeUndefined(); expect(first.recoverUntil).toBeUndefined();
    expect(next.attackPlan?.kind).toBe('crystal-charge');
    while (f.s.elapsed <= oldEndsAt + .05) f.step();
    expect(f.events.some(event => event.type === 'ENEMY_CHARGE_ENDED' && event.data.actorId === first.id)).toBe(false);
    const hits = f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === first.id);
    expect(hits).toHaveLength(2); evidence.push({ name: 'real-kill-during-charge', oldEndsAt, hits });
  });

  it('one explicit three-threat layout retains frozen aims and admits an ordinary movement escape', () => {
    const ray = actor('frozen-ray', 'thin-ray', 680, 700, 10000),
      rush = actor('frozen-rush', 'crystal-charge', 1100, 1120, 10000),
      burst = actor('frozen-burst', 'fission-burst', 1400, 450, 10000);
    const f = fixture([ray, rush, burst]); f.step();
    const snapshots = [ray, rush, burst].map(target => structuredClone(target.attackPlan!));
    expect(snapshots.every(plan => !!plan)).toBe(true); const beforeHp = f.s.player.hp;
    for (let tick = 0; tick < 150; tick++) {
      for (const [index, target] of [ray, rush, burst].entries()) if (target.attackPlan) expect(target.attackPlan).toEqual(snapshots[index]);
      f.step({ moveY: -1 });
    }
    expect(f.s.player.hp).toBe(beforeHp);
    const resolved = f.events.filter(event => event.type === 'ENEMY_TACTIC_RESOLVED');
    expect(resolved).toHaveLength(2); expect(resolved.every(event => event.data.hitPlayer === false)).toBe(true);
    const ended = f.events.filter(event => event.type === 'ENEMY_CHARGE_ENDED');
    expect(ended).toHaveLength(1); expect(ended[0].data.hitPlayer).toBe(false);
    evidence.push({ name: 'single-open-world-three-threat-movement-escape', movement: 'upward normal movement, 150 fixed ticks, no dash/fire/Q',
      start: { x: 1100, y: 700 }, end: { x: f.s.player.x, y: f.s.player.y }, snapshots, playerDamage: beforeHp - f.s.player.hp,
      limitation: 'One explicit open-world layout only. This does not prove all overlaps, boundary cases, layouts or danger unions escapable.' });
  });
});
