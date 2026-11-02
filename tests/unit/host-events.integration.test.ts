import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { growthContext } from '../../src/game/growth';
import { advanceImmuneCells, summonImmuneCells } from '../../src/game/immuneCells';
import type { BeaconState } from '../../src/game/growthTypes';
import { BattleDirector } from '../../src/game/battle';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { beginDebugHostEvent, endHostEvent } from '../../src/game/hostEvents';
import { advanceHealingPoints, healingPoints, HEALING_POINT_BALANCE } from '../../src/game/healingPoints';
import { BALANCE, type GameEvent, type InputFrame, type Target } from '../../src/game/types';
import type { HostEventId } from '../../src/game/hostEventTypes';

const body = (id: string, x: number, y: number, changes: Partial<Target> = {}): Target => ({ id, x, y,
  role: 'virus', kind: 'single', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false,
  born: 0, attackReady: 1000, traits: [], ...changes });

function fixture(seed = 41) {
  const session = new GameSession(seed, { campaign: true, milestone: 'G3' }); session.start();
  const game = session.state;
  game.tissue.hp = 100; game.battle!.pressure.infection = 0;
  game.battle!.nextEvolutionAt = Infinity;
  game.battle!.traits = ['CARAPACE', 'FISSION'];
  game.battle!.nextSpawnAt = Object.fromEntries(Object.keys(game.battle!.nextSpawnAt).map(key => [key, Infinity]));
  game.campaign!.migration.status = 'resolved'; game.campaign!.migration.choice = 'ignore';
  game.targets = [];
  for (const node of game.battle!.graph.nodes) { node.infected = false; if (node.kind === 'source') node.active = false; }
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (input: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: game.player, fire: false, ...input });
  const advance = (ticks: number, input: Partial<InputFrame> = {}) => { for (let tick = 0; tick < ticks; tick++) step(input); };
  const activate = (id: HostEventId) => {
    expect(session.debugHostEvent(id)).toMatchObject({ ok: true });
    const tick = Math.round(game.hostEvents!.active!.startsAt * 60); advance(tick - game.tick);
    expect(game.hostEvents!.active?.phase).toBe('active');
    return game.hostEvents!.active!;
  };
  return { session, game, events, step, advance, activate };
}

describe('host activity common combat and lifecycle integration', () => {
  it('rest boosts actual tool 3 tissue repair by 25%, with ordinary close-range player recovery unchanged', () => {
    const f = fixture(); f.game.tissue.hp = 40; f.activate('REST');
    Object.assign(f.game.player, { x: f.game.tissue.x - 100, y: f.game.tissue.y, hp: 50 });
    const before = f.game.tissue.hp;
    f.step({ tool: 3, aim: f.game.tissue, fire: true });
    expect(f.game.tissue.hp - before).toBeCloseTo(BALANCE.repair * 1.25, 7);
    expect(f.game.player.hp).toBe(54);
    expect(f.events.find(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'repair')?.data.after).toBeCloseTo(before + 31.25, 7);
  });

  it('sleepless multiplies only real captor progress and never amplifies unoccupied-point recovery', () => {
    const f = fixture(); f.activate('SLEEPLESS');
    const point = healingPoints(f.game)[0]; point.infection = 20;
    f.game.targets = [body('captor', point.x, point.y)];
    advanceHealingPoints(f.game, 1);
    expect(point.infection).toBeCloseTo(20 + 100 / HEALING_POINT_BALANCE.captureSeconds * 1.25, 7);
    const before = point.infection; f.game.targets = [];
    advanceHealingPoints(f.game, 1); expect(point.infection).toBeCloseTo(before - HEALING_POINT_BALANCE.partialRecoveryPerSecond, 7);
    endHostEvent(f.game, 'test'); f.game.targets = [body('later-captor', point.x, point.y)];
    const cleared = point.infection; advanceHealingPoints(f.game, 1);
    expect(point.infection).toBeCloseTo(cleared + 100 / HEALING_POINT_BALANCE.captureSeconds, 7);
  });

  it('sleepless slows actual legion bite frequency by twenty percent while preserving each ordinary bite damage', () => {
    const f = fixture(); f.game.growth!.equipped = [];
    f.game.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(f.game.player, { x: 500, y: 500 }); Object.assign(f.game.tissue, { x: 500, y: 800 });
    f.step({ scan: true, aim: { x: 500, y: 500 } });
    const cell = f.game.growth!.cells![0]; expect(cell).toBeTruthy();
    f.game.targets = [body('legion-contact', cell.x, cell.y, { role: 'source', hp: 10000, maxHp: 10000 })];
    const event = f.activate('SLEEPLESS'); expect(event.affectsLegions).toBe(true);
    f.events.length = 0; f.advance(240);
    const hits = f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === 'legion-contact' && event.data.cause === 'protocol');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const hit of hits) expect(hit.data.damage).toBeCloseTo(cell.damage, 7);
    for (let index = 1; index < hits.length; index++) {
      expect((hits[index].tick - hits[index - 1].tick) / 60).toBeCloseTo(cell.interval / .8, 1);
    }
    expect(f.game.growth!.cells![0].interval).toBe(cell.interval);
    const liveCell = f.game.growth!.cells![0], remaining = liveCell.attackReadyAt - f.game.elapsed;
    expect(liveCell.hostEventAttackFrequency).toBe(.8);
    endHostEvent(f.game, 'test-end');
    expect(liveCell.attackReadyAt - f.game.elapsed).toBeCloseTo(Math.max(0, remaining) * .8, 7);
    expect(liveCell.hostEventAttackFrequency).toBeUndefined();
    const restored = liveCell.attackReadyAt; endHostEvent(f.game, 'repeat-end');
    expect(liveCell.attackReadyAt).toBe(restored);
  });

  it('restores a legion queued bite proportion immediately when it walks out of overlapping smoke circles', () => {
    const f = fixture(); expect(f.session.debugHostEvent('SMOKE', 'lung').ok).toBe(true);
    f.game.targets = []; f.game.battle!.nextSpawnAt = {};
    f.advance(Math.round(f.game.hostEvents!.active!.startsAt * 60) - f.game.tick);
    const event = f.game.hostEvents!.active!, zone = event.zones[0];
    const beacon: BeaconState = { id: 'clock-probe', organId: 'lung', x: zone.x, y: zone.y, born: 0,
      until: Infinity, radius: 300, damage: 20, interval: .8, nextAttackAt: 0, tuning: 'balanced' };
    const context = growthContext(f.game); let cell = summonImmuneCells(beacon, context, 1)[0];
    Object.assign(cell, { x: zone.x, y: zone.y, updatedAt: context.elapsed - 1 / 60, attackReadyAt: context.elapsed + 2 });
    event.zones.push({ ...zone, id: 'overlap-clock-fixture' });
    cell = advanceImmuneCells([cell], beacon, context).cells[0];
    expect(cell.hostEventAttackFrequency).toBe(.8);
    expect(cell.attackReadyAt - context.elapsed).toBeCloseTo(2 / .8, 7);
    const before = cell.attackReadyAt;
    Object.assign(cell, { x: zone.x + zone.radius + 200, y: zone.y });
    beacon.x = cell.x; beacon.y = cell.y; context.elapsed += 1 / 60; context.tick++;
    cell = advanceImmuneCells([cell], beacon, context).cells[0];
    expect(cell.hostEventAttackFrequency).toBeUndefined();
    expect(cell.attackReadyAt - context.elapsed).toBeCloseTo((before - context.elapsed) * .8, 7);
    // An offscreen persistent legion carrying a previous receipt is also cleaned.
    cell.hostEventAttackFrequency = .8; cell.attackReadyAt = f.game.elapsed + 2.5; cell.organId = 'heart';
    f.game.growth!.cells = [cell]; endHostEvent(f.game, 'organ-cleanup');
    expect(cell.attackReadyAt - f.game.elapsed).toBeCloseTo(2, 7);
    expect(cell.hostEventAttackFrequency).toBeUndefined();
  });

  it('lets baseline precision shots remove all smoke sources immediately, without rewards or dead-target residue', () => {
    const f = fixture();
    expect(f.session.debugHostEvent('SMOKE', 'lung')).toMatchObject({ ok: true });
    f.game.targets = f.game.targets.filter(target => target.role === 'event');
    f.game.battle!.nextSpawnAt = Object.fromEntries(Object.keys(f.game.battle!.nextSpawnAt).map(key => [key, Infinity]));
    const begins = Math.round(f.game.hostEvents!.active!.startsAt * 60); f.advance(begins - f.game.tick);
    const event = f.game.hostEvents!.active!; expect(event.phase).toBe('active');
    const ids = [...event.targetIds]; expect(ids).toHaveLength(3);
    const xp = f.game.growth!.xp, samples = f.game.growth!.research;
    for (const id of ids) {
      const target = f.game.targets.find(target => target.id === id)!;
      Object.assign(f.game.player, { x: target.x - 80, y: target.y });
      const before = { x: target.x, y: target.y };
      f.advance(40, { tool: 1, fire: true, aim: target });
      expect(target.hp).toBe(0); expect(distance(before, target)).toBe(0);
      expect(f.game.hostEvents!.active?.zones.some(zone => zone.targetId === id) ?? false).toBe(false);
    }
    expect(f.game.hostEvents!.active).toBeNull(); expect(f.game.hostEvents!.sources).toEqual({});
    expect(f.game.targets.some(target => ids.includes(target.id))).toBe(false);
    expect(f.game.growth!.xp).toBe(xp); expect(f.game.growth!.research).toBe(samples);
    expect(f.events.filter(event => event.type === 'HOST_EVENT_TARGET_CLEARED')).toHaveLength(3);
    expect(f.game.battle!.behaviorHistory?.some(bin => bin.precisionDamage > 0 || bin.areaDamage > 0) ?? false).toBe(false);
  });

  it('medication uses common armor, kills through common world rules, and awards no XP, research or kill chain', () => {
    const f = fixture(); const event = f.activate('MEDICATION');
    const zone = event.zones.find(zone => zone.kind === 'medication')!;
    expect(zone).toBeTruthy(); expect(zone.radius).toBe(6 * f.game.player.radius);
    const armored = body('armored-drug', zone.x, zone.y, { traits: ['CARAPACE'], hp: 1000, maxHp: 1000,
      facing: Math.atan2(f.game.player.y - zone.y, f.game.player.x - zone.x), attackAt: 1000 });
    f.game.targets = [armored];
    f.game.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 1 }];
    const behavior = structuredClone(f.game.battle!.behaviorHistory);
    f.advance(60);
    const hit = f.events.find(event => event.type === 'TARGET_HIT' && event.data.id === armored.id);
    expect(hit?.data.damage).toBeCloseTo(BALANCE.damage[1] * BATTLE_BALANCE.carapaceResistance, 7);
    expect(f.game.battle!.behaviorHistory).toEqual(behavior);
    const sourceNode = f.game.battle!.graph.nodes.find(node => node.kind === 'source')!;
    Object.assign(sourceNode, { x: zone.x, y: zone.y, active: true, infected: true });
    const source = body(sourceNode.id, zone.x, zone.y, { role: 'source', hp: 1, maxHp: 238 });
    const neighbor = body('chain-bystander', zone.x + zone.radius + 40, zone.y, { hp: 1000, maxHp: 1000 });
    f.game.targets = [source, neighbor];
    const xp = f.game.growth!.xp, research = f.game.growth!.research;
    f.advance(60);
    expect(source.hp).toBe(0); expect(sourceNode.active).toBe(false); expect(sourceNode.infected).toBe(false);
    expect(f.game.growth!.xp).toBe(xp); expect(f.game.growth!.research).toBe(research);
    expect(f.events.some(event => event.type === 'INFECTION_SOURCE_CLEARED' && event.data.suppressRewards === true)).toBe(true);
    expect(f.events.filter(event => event.type === 'PROTOCOL_CHAIN_HIT')).toHaveLength(0);
  });

  it('preserves pulse cooldown completion on exercise entry and repeated exit, and applies the configured cooldown to a real pulse', () => {
    const f = fixture(); f.game.targets = [body('light', 1900, 500)];
    expect(beginDebugHostEvent(f.game, 'EXERCISE').ok).toBe(true);
    f.game.battle!.pulse.readyAt = 12;
    f.advance(480);
    expect(f.game.elapsed).toBe(8);
    expect(f.game.battle!.pulse.readyAt - f.game.elapsed).toBeCloseTo(4 * .7, 7);
    endHostEvent(f.game, 'test');
    expect(f.game.battle!.pulse.readyAt - f.game.elapsed).toBeCloseTo(4, 7);
    endHostEvent(f.game, 'again'); expect(f.game.battle!.pulse.readyAt - f.game.elapsed).toBeCloseTo(4, 7);
    const other = fixture(); other.game.targets = [body('light', 1900, 500)]; other.activate('EXERCISE');
    other.game.battle!.pulse.readyAt = other.game.elapsed;
    new BattleDirector(other.session).pulse();
    expect(other.game.battle!.pulse.readyAt - other.game.elapsed).toBeCloseTo(BATTLE_BALANCE.pulseCooldown * .7, 7);
  });

  it('applies exercise movement to a newly born light body without changing HP, attack windup or attack interval', () => {
    const f = fixture(); f.game.targets = [body('dependency', 1900, 500)]; f.activate('EXERCISE');
    Object.assign(f.game.player, { x: 500, y: 500 });
    const fresh = body('new-light', 800, 500, { hp: 68, maxHp: 68 }); f.game.targets = [fresh];
    f.game.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    const before = { x: fresh.x, y: fresh.y };
    f.step(); expect(distance(before, fresh)).toBeCloseTo(BATTLE_BALANCE.enemySpeed * 1.15 / 60, 7);
    expect(fresh.hp).toBe(68); expect(fresh.maxHp).toBe(68); expect(fresh.attackReady).toBe(1000);
    endHostEvent(f.game, 'test'); const after = { x: fresh.x, y: fresh.y }; f.step();
    expect(distance(after, fresh)).toBeCloseTo(BATTLE_BALANCE.enemySpeed / 60, 7);
  });

  it('freezes during actual pause and fully cleans state on result and same-seed restart', () => {
    const f = fixture(); f.activate('REST'); f.game.player.hp = 60; f.advance(60);
    f.session.pause(); const paused = f.session.snapshot(); f.advance(300);
    expect(f.game.tick).toBe(paused.tick); expect(f.game.hostEvents).toEqual(paused.hostEvents);
    f.session.resume(); f.advance(60); expect(f.game.player.hp).toBeGreaterThan(paused.player.hp);
    f.session.finish(false, 'fixture death');
    expect(f.game.hostEvents!.active).toBeNull(); expect(f.game.hostEvents!.sources).toEqual({});
    f.session.restart(); expect(f.session.state.hostEvents!.active).toBeNull();
    expect(f.session.state.hostEvents!.usedIds).toEqual([]); expect(f.session.state.hostEvents!.sources).toEqual({});
  });
});
