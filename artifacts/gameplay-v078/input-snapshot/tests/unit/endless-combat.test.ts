import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { endlessCombatStats, offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import type { EndlessGrowthState } from '../../src/game/endlessGrowthTypes';
import { IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';
import { BEACON_CONFIG } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import { BALANCE, type InputFrame, type Target, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = {
  width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 },
};

// Stationary, living source fixtures isolate hit geometry from enemy pursuit.
// Every attack, cooldown, cell update and collision still runs through step().
function target(id: string, x: number, y: number, changes: Partial<Target> = {}): Target {
  return { id, x, y, kind: 'single', role: 'source', radius: 10, hp: 1000, maxHp: 1000,
    hitUntil: 0, scanned: false, traits: [], born: 0, ...changes };
}

function fixture(ranks: EndlessGrowthState['ranks'] = {}, targets: Target[] = [], obstacles: WorldGeometry['obstacles'] = []): GameSession {
  const session = new GameSession(72106, { mode: 'endless' });
  session.start();
  session.state.world = { ...world, obstacles };
  Object.assign(session.state.player, { x: 500, y: 500 });
  Object.assign(session.state.tissue, { x: 500, y: 750, hp: 100 });
  session.state.targets = targets;
  session.state.endlessGrowth!.ranks = { ...ranks };
  return session;
}

function step(session: GameSession, input: Partial<InputFrame> = {}): void {
  session.step({ moveX: 0, moveY: 0, aim: { x: 1000, y: 500 }, fire: false, ...input });
}

function throughTick(session: GameSession, tick: number, input: Partial<InputFrame> = {}): void {
  while (session.state.tick < tick && session.state.phase === 'playing') step(session, input);
  expect(session.state.tick).toBe(tick);
  expect(session.state.phase).toBe('playing');
}

const hits = (session: GameSession, id: string) => session.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === id);

describe('endless upgrades through real session input', () => {
  it('fires three physical rays into separate bodies, applies power once and shares one shot cooldown', () => {
    const actors = [0, -.14, .14].map((angle, index) => target(`ray-${index}`, 500 + Math.cos(angle) * 400, 500 + Math.sin(angle) * 400));
    const session = fixture({ multishot: 1, power: 2 }, actors);
    step(session, { fire: true });
    for (const actor of actors) {
      expect(actor.hp).toBeCloseTo(1000 - 34 * 1.36);
      expect(hits(session, actor.id)).toHaveLength(1);
    }
    expect(session.state.effects.filter(effect => effect.kind === 'beam')).toHaveLength(3);
    expect(session.state.shots).toBe(1);
    throughTick(session, 11, { fire: true });
    expect(session.state.shots).toBe(1);
    step(session, { fire: true });
    expect(session.state.shots).toBe(2);
    for (const actor of actors) expect(actor.hp).toBeCloseTo(1000 - 2 * 34 * 1.36);
  });

  it('pierces multiple bodies in order but never pierces a tissue fold', () => {
    const first = target('first', 650, 500), second = target('second', 750, 500), blocked = target('blocked', 860, 500);
    const session = fixture({ pierce: 3 }, [blocked, second, first], [{ id: 'fold', x: 805, y: 500, radius: 20 }]);
    step(session, { fire: true });
    expect(first.hp).toBe(966);
    expect(second.hp).toBe(966);
    expect(blocked.hp).toBe(1000);
    expect(session.state.events.filter(event => event.type === 'TARGET_HIT').map(event => event.data.id)).toEqual(['first', 'second']);
    const beam = session.state.effects.find(effect => effect.kind === 'beam')!;
    expect(beam.to.x).toBeCloseTo(785);
    expect(beam.to.y).toBe(500);
  });

  it('respects the extra-body limit even when another body is on an unobstructed ray', () => {
    const actors = [650, 750, 850].map((x, index) => target(`pierce-${index}`, x, 500));
    const session = fixture({ pierce: 1 }, actors);
    step(session, { fire: true });
    expect(actors.map(actor => actor.hp)).toEqual([966, 966, 1000]);
  });

  it('expands the actual nova hit radius and damage, keeps local cover and enforces its upgraded cooldown', () => {
    const aim = { x: 800, y: 500 };
    const edge = target('edge', 800, 632), outside = target('outside', 667, 500), covered = target('covered', 900, 500);
    const session = fixture({ nova: 2, power: 1 }, [edge, outside, covered], [{ id: 'cover', x: 850, y: 500, radius: 15 }]);
    step(session, { fire: true, tool: 2, aim });
    const damage = 65 * 1.18 * 1.3;
    expect(edge.hp).toBeCloseTo(1000 - damage);
    expect(outside.hp).toBe(1000);
    expect(covered.hp).toBe(1000);
    expect(session.state.effects.find(effect => effect.kind === 'burst')?.radius).toBe(122);
    expect(session.state.cooldowns[2] - session.state.elapsed).toBeCloseTo(1);
    throughTick(session, 60, { fire: true, tool: 2, aim });
    expect(session.state.shots).toBe(1);
    step(session, { fire: true, tool: 2, aim });
    expect(session.state.shots).toBe(2);
    expect(edge.hp).toBeCloseTo(1000 - 2 * damage);
  });

  it('hits late along actual dash travel and damages each body once during the same dash', () => {
    const near = target('near', 620, 500), late = target('late', 703, 500), flank = target('flank', 600, 585);
    const session = fixture({ dash: 1, power: 1 }, [near, late, flank]);
    step(session, { dash: true, moveX: 1 });
    expect(near.hp).toBe(1000);
    expect(late.hp).toBe(1000);
    throughTick(session, 12);
    expect(session.state.player.x).toBeCloseTo(630);
    expect(near.hp).toBeCloseTo(1000 - 40 * 1.18);
    expect(late.hp).toBeCloseTo(1000 - 40 * 1.18);
    expect(flank.hp).toBe(1000);
    expect(hits(session, near.id)).toHaveLength(1);
    expect(hits(session, late.id)).toHaveLength(1);
    expect(hits(session, late.id)[0].tick).toBeGreaterThan(1);
    expect(hits(session, late.id)[0].data.cause).toBe('ability');
  });

  it('stops dash movement at cover and does not slash the body on its other side', () => {
    const open = target('open', 515, 555), blocked = target('blocked', 600, 500);
    const fold = { id: 'dash-cover', x: 570, y: 500, radius: 20 };
    const session = fixture({ dash: 1 }, [open, blocked], [fold]);
    step(session, { dash: true, moveX: 1 });
    throughTick(session, 12);
    expect(session.state.player.x).toBeCloseTo(fold.x - fold.radius - session.state.player.radius);
    expect(open.hp).toBe(960);
    expect(blocked.hp).toBe(1000);
    expect(distance(session.state.player, blocked)).toBeLessThan(64 + blocked.radius);
    expect(hits(session, open.id)).toHaveLength(1);
    expect(hits(session, blocked.id)).toHaveLength(0);
  });

  it('centers scan damage on the player at radius 260 while preserving diagnosis outside the damage radius', () => {
    const edge = target('edge', 770, 500, { traits: ['MIMIC'] });
    const outside = target('outside', 500, 771, { traits: ['MIMIC'] });
    const covered = target('covered', 500, 680, { traits: ['MIMIC'] });
    const distant = target('distant', 1200, 500, { traits: ['MIMIC'] });
    const session = fixture({ scan: 2, power: 1 }, [edge, outside, covered, distant], [{ id: 'scan-cover', x: 500, y: 620, radius: 20 }]);
    step(session, { scan: true, aim: distant });
    expect(edge.hp).toBeCloseTo(1000 - 60 * 1.18);
    expect(outside.hp).toBe(1000);
    expect(covered.hp).toBe(1000);
    expect(distant.hp).toBe(1000);
    for (const actor of [edge, outside, covered]) {
      expect(actor.scanned).toBe(true);
      expect(actor.revealedUntil).toBeGreaterThan(session.state.elapsed);
    }
    expect(distant.scanned).toBe(false);
    expect(distant.revealedUntil).toBeUndefined();
    const burst = session.state.effects.find(effect => effect.kind === 'burst' && effect.radius === 260)!;
    expect(burst.from).toEqual({ x: 500, y: 500 });
    expect(hits(session, edge.id)[0].data.cause).toBe('ability');
  });

  it('moves summoned immune cells before contact, scales actual bite damage and keeps cell attack clocks independent', () => {
    const victim = target('immune-target', 850, 500, { radius: 22 });
    const session = fixture({ immune: 2, power: 1 }, [victim]);
    step(session, { scan: true, aim: { x: 720, y: 500 } });
    const initial = structuredClone(session.state.growth!.cells!);
    expect(initial).toHaveLength(3);
    expect(victim.hp).toBe(1000);
    throughTick(session, 12);
    expect(victim.hp).toBe(1000);
    expect(session.state.growth!.cells!.some((cell, index) => distance(cell, initial[index]) > 20)).toBe(true);
    const biteTimes = new Map<string, number[]>();
    for (let tick = session.state.tick + 1; tick <= 120; tick++) {
      const before = structuredClone(session.state.growth!.cells!);
      step(session);
      for (const cell of session.state.growth!.cells!) {
        expect(distance(cell, before.find(other => other.id === cell.id)!)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed * BALANCE.step + 1e-7);
      }
      for (const event of session.state.events.filter(event => event.tick === session.state.tick && event.type === 'PROTOCOL_BEACON_HIT')) {
        const cell = session.state.growth!.cells!.find(cell => cell.id === event.data.cellId)!;
        expect(distance(cell, victim)).toBeLessThanOrEqual(cell.radius + victim.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
        const times = biteTimes.get(cell.id) ?? [];
        times.push(session.state.elapsed); biteTimes.set(cell.id, times);
      }
    }
    const actualHits = hits(session, victim.id);
    expect(actualHits.length).toBeGreaterThanOrEqual(3);
    const biteDamage = BEACON_CONFIG.balanced.damage / 3 * 1.18 * 1.4;
    for (const event of actualHits) {
      expect(event.data.damage).toBeCloseTo(biteDamage);
      expect(event.data.cause).toBe('protocol');
      expect(event.data.protocolId).toBe('IMMUNE_BEACON');
    }
    expect(victim.hp).toBeCloseTo(1000 - biteDamage * actualHits.length);
    expect(biteTimes.size).toBe(3);
    for (const times of biteTimes.values()) for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(BEACON_CONFIG.balanced.interval - 1e-7);
    }
    expect(new Set([...biteTimes.values()].map(times => times[0])).size).toBeGreaterThan(1);
  });

  it('extends real cell lifetime and applies the squad cooldown independently from the faster Q cooldown', () => {
    const victim = target('immune-target', 850, 500, { radius: 22 });
    const session = fixture({ immune: 2 }, [victim]);
    const stats = endlessCombatStats(session.state.endlessGrowth!);
    step(session, { scan: true, aim: { x: 720, y: 500 } });
    const growth = session.state.growth!, beacon = growth.beacon!;
    const createdAt = session.state.elapsed, until = beacon.until, squadReadyAt = growth.beaconReadyAt;
    const originalId = beacon.id;
    expect(until - createdAt).toBeCloseTo(BEACON_CONFIG.balanced.duration + stats.cellDurationBonus);
    expect(growth.cells!.every(cell => cell.until === until)).toBe(true);
    expect(squadReadyAt - createdAt).toBeCloseTo(BEACON_CONFIG.balanced.cooldown * stats.cellCooldownMultiplier);
    expect(session.state.scanReady - createdAt).toBeCloseTo(stats.scanCooldown);
    throughTick(session, Math.ceil(session.state.scanReady / BALANCE.step));
    step(session, { scan: true, aim: { x: 720, y: 500 } });
    expect(session.state.scans).toBe(2);
    expect(growth.beacon!.id).toBe(originalId);
    expect(growth.beaconReadyAt).toBe(squadReadyAt);
    throughTick(session, Math.ceil((createdAt + BEACON_CONFIG.balanced.duration + .1) / BALANCE.step));
    expect(growth.cells).toHaveLength(3);
    throughTick(session, Math.ceil(until / BALANCE.step));
    expect(growth.cells).toEqual([]);
    throughTick(session, Math.ceil(squadReadyAt / BALANCE.step));
    step(session, { scan: true, aim: { x: 720, y: 500 } });
    expect(session.state.scans).toBe(3);
    expect(growth.beacon!.id).not.toBe(originalId);
    expect(growth.cells).toHaveLength(3);
  });

  it.each([[134, 138], [158, 160]])('repairs nearby player HP %i to %i using the upgraded maximum', (before, after) => {
    const session = fixture({ vitality: 3 });
    session.state.player.hp = before;
    Object.assign(session.state.tissue, { x: 550, y: 500, hp: 50 });
    step(session, { tool: 3, fire: true, aim: session.state.tissue });
    expect(session.state.tissue.hp).toBe(75);
    expect(session.state.player.hp).toBe(after);
  });

  it('rejects a combat draft submitted by a previous run even when its seed and draft ID repeat', () => {
    const session = fixture();
    offerEndlessUpgrade(session.state.endlessGrowth!, 1);
    const oldRun = session.state.growth!.runId, oldDraft = session.state.endlessGrowth!.draft!.id;
    session.restart();
    offerEndlessUpgrade(session.state.endlessGrowth!, 1);
    session.pause();
    expect(session.state.endlessGrowth!.draft!.id).toBe(oldDraft);
    expect(session.state.growth!.runId).not.toBe(oldRun);
    expect(session.chooseCombatUpgrade(oldDraft, 'multishot', oldRun)).toBe(false);
    expect(session.state.endlessGrowth!.ranks.multishot).toBeUndefined();
    expect(session.chooseCombatUpgrade(oldDraft, 'multishot', session.state.growth!.runId)).toBe(true);
    expect(session.state.endlessGrowth!.ranks.multishot).toBe(1);
    expect(session.state.phase).toBe('playing');
    expect(session.chooseCombatUpgrade(oldDraft, 'multishot', session.state.growth!.runId)).toBe(false);
  });
});
