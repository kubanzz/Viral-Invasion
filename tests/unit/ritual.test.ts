import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceSmartViruses, cancelSmartSupports } from '../../src/game/smartViruses';
import { combatPopulation } from '../../src/game/combatPopulation';
import { advanceRituals, clearRitualProjectiles, damageRitualProjectile, ritualArrangementValid,
  ritualMotherShielded, ritualProjectileTargets, RITUAL_BALANCE } from '../../src/game/ritual';
import type { GameEvent, Target } from '../../src/game/types';
import type { SmartSupportPlan } from '../../src/game/smartVirusesTypes';
import type { RitualProjectile } from '../../src/game/ritualTypes';

function fixture() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, events: GameEvent[] = [];
  state.world = { ...state.world!, obstacles: [] }; state.targets = [];
  Object.assign(state.player, { x: 1200, y: 1000 });
  Object.assign(e, { wave: 3, phase: 'combat', phaseStartedAt: 0, remainingToSpawn: 4, canceledToSpawn: 0, spawnedIds: [], spawnSerial: 0 });
  const plan: SmartSupportPlan = { id: 'ritual-test', wave: 3, kind: 'ritual', laneId: 'north', sourceId: 'source-west',
    slots: [0, 1, 2, 3], bornSlots: [], canceledSlots: [], status: 'pending', departureOffset: 6, memberIds: [] };
  e.smartSupport = { wave: 3, reservedSlots: plan.slots, plans: [plan] };
  const host = { state, emit(type: string, data: GameEvent['data']) { events.push({ type, data, tick: state.tick }); },
    damagePlayer(_source: Target, amount: number) { state.player.hp = Math.max(0, state.player.hp - amount); return true; } };
  const at = (n: number) => { state.elapsed = n; state.tick = Math.round(n * 60); advanceSmartViruses(host); };
  const spawn = () => { at(2); expect(plan.status).toBe('warning'); at(6); expect(plan.status).toBe('active'); };
  return { game, state, e, plan, host, events, at, spawn };
}
function body(id: string): Target {
  return { id, x: 2200, y: 1400, hp: 100, maxHp: 100, radius: 15, kind: 'single', role: 'virus', hitUntil: 0, scanned: false };
}
function orb(extra: Partial<RitualProjectile> = {}): RitualProjectile {
  return { id: 'ritual:orb:test', actorId: 'test-caster', encounterId: 'test', wave: 3, x: 900, y: 1000,
    hp: 68, radius: 17, angle: 0, phase: 'flight', born: 0, firesAt: 0, expiresAt: 10,
    aim: { x: 1200, y: 1000 }, tracking: true, ...extra };
}

describe('finite four-body ritual encounter', () => {
  it.each([45, 46, 48])('does not partially birth or reserve while %i bodies occupy the cap', count => {
    const f = fixture(); f.state.targets = Array.from({ length: count }, (_, i) => body(`b${i}`));
    f.at(2); f.at(6); expect(f.plan.status).toBe('pending'); expect(f.plan.bornSlots).toEqual([]);
    expect(combatPopulation(f.state).reserved).toBe(count);
    f.state.targets = f.state.targets.slice(0, 44); f.at(7);
    expect(f.plan.status).toBe('warning'); expect(combatPopulation(f.state).reserved).toBe(48);
    expect(combatPopulation(f.state).ritualReserved).toBe(4);
    f.at(11); expect(f.plan.bornSlots).toHaveLength(4); expect(combatPopulation(f.state).reserved).toBe(48);
  });
  it('freezes a real reachable arrangement and converts four reservations into four live bodies', () => {
    const f = fixture(); f.at(2); const arrangement = structuredClone(f.plan.ritualPositions);
    expect(ritualArrangementValid(f.state, arrangement!)).toBe(true);
    expect(combatPopulation(f.state)).toMatchObject({ reserved: 4, ritualReserved: 4 });
    f.at(6); expect(f.plan.ritualPositions).toEqual(arrangement); expect(f.e.remainingToSpawn).toBe(0);
    expect(f.state.targets.map(t => t.hp)).toEqual([408, 204, 204, 204]);
    expect(combatPopulation(f.state)).toMatchObject({ reserved: 4, ritualReserved: 0 });
    expect(f.state.targets.every(t => t.blocksWaveClear && t.waveId === 3 && !t.territoryTask)).toBe(true);
  });
  it('cancels a warning if its ground is purified without silently moving the ritual', () => {
    const f = fixture(); f.at(2);
    f.state.territory!.nodes.forEach(n => n.owner = 'healthy'); f.at(6); f.at(7);
    expect(f.plan.status).toBe('canceled'); expect(f.state.targets).toEqual([]);
    expect(f.e.canceledToSpawn).toBe(4); expect(f.e.remainingToSpawn).toBe(0);
    expect(combatPopulation(f.state).reserved).toBe(0);
  });
  it('source destruction cancels unborn slots once but retains all already born ritual bodies', () => {
    const pending = fixture(); pending.at(2); cancelSmartSupports(pending.host, 'source-west'); cancelSmartSupports(pending.host, 'source-west');
    expect(pending.e.canceledToSpawn).toBe(4); expect(combatPopulation(pending.state).reserved).toBe(0);
    const active = fixture(); active.spawn(); cancelSmartSupports(active.host, 'source-west');
    active.state.territory!.sources['source-west'].destroyed = true; active.at(7);
    expect(active.state.targets.filter(t => t.hp > 0)).toHaveLength(4); expect(active.e.canceledToSpawn).toBe(0);
    expect(active.state.smartViruses?.ritual?.projectiles).toHaveLength(1);
  });
  it('only opens the mother membrane when every actual priest is dead and never adds replacement priests', () => {
    const f = fixture(); f.spawn(); const mother = f.state.targets[0];
    expect(ritualMotherShielded(f.state, mother)).toBe(true);
    f.state.targets[1].hp = 0; f.state.targets[2].hp = 0; f.at(7);
    expect(ritualMotherShielded(f.state, mother)).toBe(true);
    f.state.targets[3].hp = 0; f.at(8); f.at(20);
    expect(ritualMotherShielded(f.state, mother)).toBe(false); expect(f.state.targets).toHaveLength(4);
    expect(f.events.filter(e => e.type === 'RITUAL_SHIELD_BROKEN')).toHaveLength(1);
  });
});

describe('high-damage homing projectiles have explicit finite counterplay', () => {
  it('includes charging reservations in the cap, spaces releases, and cancels killed caster windups', () => {
    const f = fixture(); f.spawn(); f.at(7); f.at(8); f.at(9);
    const ritual = f.state.smartViruses!.ritual!;
    expect(ritual.projectiles).toHaveLength(2); expect(ritual.projectiles[1].firesAt - ritual.projectiles[0].firesAt).toBeGreaterThanOrEqual(1);
    const charging = ritual.projectiles.find(p => p.phase === 'charging');
    if (charging) { f.state.targets.find(t => t.id === charging.actorId)!.hp = 0; f.at(9.1); expect(ritual.projectiles.some(p => p.id === charging.id)).toBe(false); }
    expect(ritual.projectiles.length).toBeLessThanOrEqual(RITUAL_BALANCE.projectileCap);
  });
  it('exposes shootable candidates, applies exactly real HP, and awards no biological kill or wave slot', () => {
    const f = fixture(); f.state.smartViruses = { serial: 0, slime: [], ritual: { serial: 1, encounters: [], projectiles: [orb()] } };
    expect(ritualProjectileTargets(f.state)).toHaveLength(1); expect(combatPopulation(f.state).reserved).toBe(0);
    expect(damageRitualProjectile(f.state, 'ritual:orb:test', 34, f.host.emit)).toBe(34);
    expect(damageRitualProjectile(f.state, 'ritual:orb:test', 100, f.host.emit)).toBe(34);
    expect(damageRitualProjectile(f.state, 'ritual:orb:test', 34, f.host.emit)).toBe(0);
    expect(ritualProjectileTargets(f.state)).toHaveLength(0); expect(f.e.remainingToSpawn).toBe(4);
    expect(f.events.some(e => /KILLED|XP|SCORE/.test(e.type))).toBe(false);
  });
  it('uses turn-rate limits and pauses position, lifetime and charging together', () => {
    const f = fixture(), projectile = orb();
    f.state.smartViruses = { serial: 0, slime: [], ritual: { serial: 1, encounters: [], projectiles: [projectile] } };
    Object.assign(f.state.player, { x: 900, y: 1200 }); advanceRituals(f.host);
    expect(projectile.angle).toBeCloseTo(RITUAL_BALANCE.turnRadians / 60);
    const before = structuredClone(projectile); f.state.phase = 'paused'; f.state.elapsed = 100; advanceRituals(f.host);
    expect(projectile).toEqual(before);
  });
  it('loses its lock on launch, collides with walls, and clears orphaned projectiles on wave transition', () => {
    const f = fixture(), projectile = orb();
    f.state.smartViruses = { serial: 0, slime: [], ritual: { serial: 1, encounters: [], projectiles: [projectile] } };
    f.state.playerFlight = { id: 'launch', from: { x: 1200, y: 1000 }, to: { x: 1800, y: 500 }, born: 0, landsAt: .75 };
    advanceRituals(f.host); expect(projectile.tracking).toBe(false); const aim = { ...projectile.aim };
    f.state.player.x += 100; advanceRituals(f.host); expect(projectile.aim).toEqual(aim); expect(f.state.player.hp).toBe(100);
    delete f.state.playerFlight; f.state.world = { ...f.state.world!, obstacles: [{ id: 'wall', x: projectile.x + 18, y: projectile.y, radius: 10 }] };
    advanceRituals(f.host); expect(f.state.smartViruses.ritual!.projectiles).toEqual([]);
    f.state.smartViruses.ritual!.projectiles = [orb()]; f.e.phase = 'intermission'; advanceRituals(f.host);
    expect(f.state.smartViruses.ritual!.projectiles).toEqual([]);
    clearRitualProjectiles(f.state, 'exit', f.host.emit); expect(f.state.player.hp).toBe(100);
  });
  it('sweeps actual player contact and consumes a hit once', () => {
    const f = fixture(), projectile = orb({ x: 1160 });
    f.state.smartViruses = { serial: 0, slime: [], ritual: { serial: 1, encounters: [], projectiles: [projectile] } };
    advanceRituals(f.host, .1); advanceRituals(f.host, .1);
    expect(f.state.player.hp).toBe(65); expect(f.state.smartViruses.ritual!.projectiles).toEqual([]);
  });
});
