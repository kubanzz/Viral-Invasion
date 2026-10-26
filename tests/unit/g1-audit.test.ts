import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE as B } from '../../src/game/battleConfig';
import { BALANCE, WORLD, type InputFrame, type Target, type Vec } from '../../src/game/types';
import { distance } from '../../src/actors/collision';

const idle = (aim: Vec = { x: 730, y: 600 }): InputFrame => ({ moveX: 0, moveY: 0, aim, fire: false });
function advance(session: GameSession, seconds: number): void {
  for (let tick = 0; tick < Math.ceil(seconds / BALANCE.step); tick++) session.step(idle());
}
function campaign(): GameSession {
  const session = new GameSession(793, { campaign: true, firstTrait: 'CARAPACE' });
  session.start();
  return session;
}
function actor(id: string, position: Vec): Target {
  return { ...position, id, kind: 'single', role: 'virus', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 10, generation: 0 };
}

describe('G1 independent interaction audit', () => {
  it('a reopened gate observes a full propagation cooldown instead of replaying closed intervals', () => {
    const session = campaign();
    const battle = session.state.battle!;
    const gate = battle.graph.nodes.find(node => node.id === 'gate')!;
    const edge = battle.graph.edges.find(link => link.from === 'source-a')!;
    // A unit fixture starts the player at the visible gate; all changes below use E.
    Object.assign(session.state.player, { x: gate.x, y: gate.y });
    session.step({ ...idle(), interact: true });
    expect(edge.open).toBe(false);
    advance(session, B.spreadInterval + 1);
    expect(gate.infected).toBe(false);
    expect(session.state.events.some(event => event.type === 'INFECTION_SPREAD' && event.data.edgeId === edge.id)).toBe(false);

    session.step({ ...idle(), interact: true });
    expect(edge.open).toBe(true);
    const reopenedAt = session.state.elapsed;
    expect(edge.nextSpread - reopenedAt).toBeCloseTo(B.spreadInterval);
    while (session.state.elapsed + BALANCE.step + 1e-9 < edge.nextSpread) session.step(idle());
    expect(gate.infected).toBe(false);
    session.step(idle());
    expect(gate.infected).toBe(true);
    const propagation = session.state.events.filter(event => event.type === 'INFECTION_SPREAD' && event.data.edgeId === edge.id);
    expect(propagation).toHaveLength(1);
    expect(propagation[0].tick * BALANCE.step - reopenedAt).toBeGreaterThanOrEqual(B.spreadInterval - 1e-8);
  });

  it('E uses the aimed sector once, retains outside actors, and resolves all pushes to reachable ground', () => {
    const session = campaign();
    const battle = session.state.battle!;
    Object.assign(session.state.player, battle.pulse.origin);
    const inside = actor('audit-inside', { x: 730, y: 370 });
    inside.traits = ['CARAPACE'];
    const outside = actor('audit-outside', { x: 900, y: 230 });
    outside.traits = ['CARAPACE'];
    // This radial push crosses the visible fold-b footprint unless collision resolves it.
    const foldApproach = actor('audit-fold-approach', { x: 885, y: 455 });
    foldApproach.traits = ['CARAPACE'];
    session.state.targets = [inside, outside, foldApproach];
    const tissueBefore = session.state.tissue.hp;
    session.step({ ...idle({ x: 730, y: 650 }), interact: true });
    expect(battle.stats.pulses).toBe(1);
    expect(session.state.tissue.hp).toBe(tissueBefore - B.pulseCost);
    expect(inside.y).toBeGreaterThan(500);
    expect(inside.exposedUntil).toBeGreaterThan(session.state.elapsed);
    expect(outside.exposedUntil ?? 0).toBe(0);
    expect(distance(outside, { x: 900, y: 230 })).toBeLessThan(2);
    expect(foldApproach.exposedUntil).toBeGreaterThan(session.state.elapsed);
    expect(distance(foldApproach, { x: 885, y: 455 })).toBeGreaterThan(50);
    expect(session.state.events.find(event => event.type === 'PULSE_TRIGGERED')?.data).toMatchObject({ pushed: 2, exposed: 2 });
    for (let tick = 0; tick < 20; tick++) session.step({ ...idle(), interact: true });
    expect(battle.stats.pulses).toBe(1);
    expect(session.state.tissue.hp).toBe(tissueBefore - B.pulseCost);
    for (const target of session.state.targets) {
      expect(target.x).toBeGreaterThanOrEqual(WORLD.bounds.left + target.radius);
      expect(target.x).toBeLessThanOrEqual(WORLD.bounds.right - target.radius);
      expect(target.y).toBeGreaterThanOrEqual(WORLD.bounds.top + target.radius);
      expect(target.y).toBeLessThanOrEqual(WORLD.bounds.bottom - target.radius);
      for (const obstacle of WORLD.obstacles) expect(distance(target, obstacle)).toBeGreaterThanOrEqual(target.radius + obstacle.radius - 1e-6);
    }
  });

  it('killing an actor during its attack windup cancels the delayed damage and clears its corpse', () => {
    const session = campaign();
    const target = actor('audit-telegraphed', { x: 390, y: 440 });
    target.hp = BALANCE.damage[1];
    target.attackAt = .5;
    target.attackAim = { x: session.state.player.x, y: session.state.player.y };
    session.state.targets = [target];
    const beforeHp = session.state.player.hp;
    session.step({ ...idle(target), tool: 1, fire: true });
    expect(target.hp).toBe(0);
    expect(target.attackAt).toBeUndefined();
    advance(session, 2);
    expect(session.state.player.hp).toBe(beforeHp);
    expect(session.state.events.some(event => event.type === 'PLAYER_HURT')).toBe(false);
    expect(session.state.targets.some(enemy => enemy.id === target.id)).toBe(false);
    expect(session.state.events.filter(event => event.type === 'TARGET_CLEARED' && event.data.id === target.id)).toHaveLength(1);
  });

  it('30 paused seconds freeze an active mutation warning and fatal infection clock, and retry clears both', () => {
    const session = campaign();
    const battle = session.state.battle!;
    // This falling-behind fixture exercises recovery timing, not a browser victory.
    battle.pressure.infection = 100;
    battle.nextEvolutionAt = 0;
    session.step(idle());
    expect(battle.pressure.criticalSince).not.toBeNull();
    expect(battle.warning).not.toBeNull();
    expect(battle.warning!.applyAt - battle.warning!.startedAt).toBeGreaterThanOrEqual(8);
    session.pause();
    const paused = session.snapshot();
    for (let tick = 0; tick < 1800; tick++) session.step({ ...idle(), fire: true, interact: true, scan: true });
    expect(session.snapshot()).toEqual(paused);
    session.resume();
    session.step(idle());
    expect(session.state.elapsed).toBeCloseTo(paused.elapsed + BALANCE.step);
    expect(battle.warning!.applyAt).toBe(paused.battle!.warning!.applyAt);
    expect(battle.pressure.criticalSince).toBe(paused.battle!.pressure.criticalSince);
    session.restart();
    expect(session.state.battle!.warning).toBeNull();
    expect(session.state.battle!.traits).toEqual([]);
    expect(session.state.battle!.pressure.criticalSince).toBeNull();
    expect(session.state.battle!.pulse.uses).toBe(0);
    expect(session.state.events.map(event => event.type)).toEqual(['RUN_STARTED']);
  });

  it('actual repair exits a lethal infection countdown and cannot farm relief from a fully repaired organ', () => {
    const session = campaign();
    const battle = session.state.battle!;
    session.state.targets = [];
    session.state.tissue.hp = 50;
    Object.assign(session.state.player, { x: 650, y: 600 });
    battle.pressure.infection = 100;
    session.step(idle());
    expect(battle.pressure.criticalSince).not.toBeNull();
    session.step({ ...idle(session.state.tissue), tool: 3, fire: true });
    expect(session.state.tissue.hp).toBe(75);
    expect(battle.pressure.infection).toBeLessThan(100);
    expect(battle.pressure.criticalSince).toBeNull();
    expect(session.state.events.some(event => event.type === 'INFECTION_CRISIS_RECOVERED')).toBe(true);
    advance(session, BALANCE.cooldowns[3]);
    session.step({ ...idle(session.state.tissue), tool: 3, fire: true });
    expect(session.state.tissue.hp).toBe(100);
    const repairCount = battle.stats.repairs;
    const reliefCount = session.state.events.filter(event => event.type === 'PRESSURE_RELIEVED').length;
    advance(session, BALANCE.cooldowns[3]);
    session.step({ ...idle(session.state.tissue), tool: 3, fire: true });
    expect(session.state.tissue.hp).toBe(100);
    expect(battle.stats.repairs).toBe(repairCount);
    expect(session.state.events.filter(event => event.type === 'PRESSURE_RELIEVED')).toHaveLength(reliefCount);
  });
});
