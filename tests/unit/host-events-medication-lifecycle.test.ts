import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { hostEventPresentation, medicationAnchors } from '../../src/game/hostEvents';
import { BALANCE, type GameEvent, type InputFrame, type Target } from '../../src/game/types';
import type { HostEventZone } from '../../src/game/hostEventTypes';

/** The fixture only chooses initial positions; every gate change is a real E input. */
function fixture(organId: 'heart' | 'lung' = 'heart') {
  const session = new GameSession(4, { campaign: true, milestone: 'G3' }); session.start();
  const game = session.state, battle = game.battle!;
  game.tissue.hp = 100; battle.pressure.infection = 0;
  battle.traits = ['CARAPACE', 'FISSION']; battle.nextEvolutionAt = Infinity;
  battle.nextSpawnAt = Object.fromEntries(Object.keys(battle.nextSpawnAt).map(id => [id, Infinity]));
  game.campaign!.migration.status = 'resolved'; game.campaign!.migration.choice = 'ignore';
  expect(session.debugHostEvent('MEDICATION', organId)).toEqual({ ok: true });
  const gate = battle.graph.nodes.find(node => node.id === (organId === 'lung' ? 'airway' : 'gate'))!;
  Object.assign(game.player, { x: gate.x, y: gate.y });
  game.targets = [];
  battle.nextSpawnAt = Object.fromEntries(Object.keys(battle.nextSpawnAt).map(id => [id, Infinity]));
  const active = game.hostEvents!.active!;
  const events: GameEvent[] = [];
  session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (input: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: game.player, fire: false, ...input });
  const runTo = (seconds: number) => { while (game.tick < Math.round(seconds * 60)) step(); };
  const victimAt = (zone: HostEventZone): Target => {
    const target: Target = { id: `victim:${zone.id}`, x: zone.x, y: zone.y, role: 'virus', kind: 'single',
      radius: game.player.radius, hp: 10000, maxHp: 10000, hitUntil: 0, scanned: false,
      attackAt: 1000, attackReady: 1000, attackAim: { x: -2000, y: -2000 }, traits: [] };
    game.targets.push(target); return target;
  };
  const drugHits = (target: Target) => events.filter(event => event.type === 'TARGET_HIT'
    && event.data.id === target.id && event.data.ability === 'host-event');
  const skipped = (zone: HostEventZone) => events.filter(event => event.type === 'HOST_EVENT_ZONE_SKIPPED' && event.data.zoneId === zone.id);
  return { session, game, gate, active, events, step, runTo, victimAt, drugHits, skipped };
}

describe('medication round placement lifecycle', () => {
  it('skips a future round when its blood-flow anchor was closed before the preview, without extra RNG or cancelling the card', () => {
    const f = fixture(), zone = f.active.zones[1], victim = f.victimAt(zone);
    const placement = { x: zone.x, y: zone.y }, rng = f.game.hostEvents!.rngState;
    f.runTo(3); f.step({ interact: true });
    expect(f.gate.active).toBe(false);
    expect(medicationAnchors(f.game).some(point => Math.hypot(point.x - zone.x, point.y - zone.y) < 1e-6)).toBe(false);
    f.runTo(zone.previewAt - BALANCE.step); expect(zone.medicationState).toBe('pending');
    f.runTo(zone.previewAt); expect(zone.medicationState).toBe('skipped');
    expect(zone.skipReason).toBe('blood-flow-anchor-lost');
    expect(f.skipped(zone)).toHaveLength(1);
    expect(f.skipped(zone)[0].data).toMatchObject({ id: 'MEDICATION', zoneId: zone.id, reason: 'blood-flow-anchor-lost', at: zone.previewAt, organId: 'heart' });
    f.runTo(zone.endsAt);
    expect(f.drugHits(victim).filter(event => event.tick / 60 >= zone.startsAt)).toHaveLength(0);
    expect(f.game.hostEvents!.active).toBe(f.active); expect(f.active.endsAt - f.active.startsAt).toBe(24);
    expect(f.game.hostEvents!.rngState).toBe(rng); expect({ x: zone.x, y: zone.y }).toEqual(placement);
    expect(hostEventPresentation(f.game)).toMatchObject({ skippedCount: 1, skipReason: 'blood-flow-anchor-lost', targetCount: 1, targetTotal: 3 });
  });

  it('permanently skips a round closed during its one-second preview and never reissues it after a real reopening', () => {
    const f = fixture(), zone = f.active.zones[1], victim = f.victimAt(zone);
    const third = f.active.zones[2], laterVictim = f.victimAt(third);
    f.runTo(zone.previewAt + .5); expect(zone.medicationState).toBe('pending');
    f.step({ interact: true });
    expect(f.gate.active).toBe(false); expect(zone.medicationState).toBe('skipped');
    f.runTo(zone.startsAt + .6); f.step({ interact: true });
    expect(f.gate.active).toBe(true);
    expect(medicationAnchors(f.game).some(point => Math.hypot(point.x - zone.x, point.y - zone.y) < 1e-6)).toBe(true);
    f.runTo(zone.endsAt);
    expect(zone.medicationState).toBe('skipped'); expect(f.skipped(zone)).toHaveLength(1);
    expect(f.drugHits(victim).filter(event => event.tick / 60 >= zone.startsAt)).toHaveLength(0);
    expect(f.game.hostEvents!.active).toBe(f.active);
    f.runTo(third.startsAt); expect(third.startsAt).toBe(18); expect(third.medicationState).toBe('spawned');
    f.runTo(third.endsAt);
    const laterHits = f.drugHits(laterVictim).filter(event => event.tick / 60 > third.startsAt && event.tick / 60 <= third.endsAt);
    expect(laterHits.map(event => event.tick / 60 - third.startsAt)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(laterHits.every(event => event.data.damage === BALANCE.damage[1])).toBe(true);
    expect(zone.medicationState).toBe('skipped'); expect(f.skipped(zone)).toHaveLength(1);
    expect(f.skipped(third)).toHaveLength(0);
  });

  it('keeps an already spawned round for all six D ticks when E closes its route after generation', () => {
    const f = fixture(), zone = f.active.zones[1], victim = f.victimAt(zone);
    f.runTo(zone.startsAt); expect(zone.medicationState).toBe('spawned');
    f.step({ interact: true }); expect(f.gate.active).toBe(false);
    expect(zone.medicationState).toBe('spawned');
    f.runTo(zone.endsAt);
    const hits = f.drugHits(victim).filter(event => event.tick / 60 > zone.startsAt && event.tick / 60 <= zone.endsAt);
    expect(hits.map(event => event.tick / 60 - zone.startsAt)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hits.every(event => event.data.damage === BALANCE.damage[1])).toBe(true);
    expect(f.skipped(zone)).toHaveLength(0);
  });

  it('keeps the green card when its first round loses its anchor during the initial card warning', () => {
    const f = fixture(), zone = f.active.zones[0];
    f.runTo(.5); f.step({ interact: true });
    expect(f.gate.active).toBe(false);
    f.runTo(zone.previewAt);
    expect(zone.medicationState).toBe('skipped'); expect(f.active.phase).toBe('warning');
    expect(hostEventPresentation(f.game)).toMatchObject({ targetCount: 2, targetTotal: 3, skippedCount: 1 });
    f.runTo(f.active.startsAt);
    expect(f.game.hostEvents!.active).toBe(f.active); expect(f.active.phase).toBe('active');
    expect(f.game.hostEvents!.successCount).toBe(1); expect(f.skipped(zone)).toHaveLength(1);
    f.runTo(f.active.endsAt); expect(f.game.hostEvents!.active).toBeNull();
  });

  it('keeps all twenty-four seconds when closing the lung airway invalidates every planned round, with no replacement on reopening', () => {
    const f = fixture('lung'), victim = f.victimAt(f.active.zones[0]);
    f.runTo(.5); f.step({ interact: true });
    expect(f.gate.active).toBe(false); expect(medicationAnchors(f.game)).toEqual([]);
    f.runTo(f.active.startsAt); expect(f.active.phase).toBe('active');
    expect(f.game.hostEvents!.active).toBe(f.active);
    f.runTo(f.active.zones[2].previewAt);
    expect(f.active.zones.every(zone => zone.medicationState === 'skipped')).toBe(true);
    expect(hostEventPresentation(f.game)).toMatchObject({ targetCount: 0, targetTotal: 3, skippedCount: 3 });
    f.runTo(f.active.zones[2].previewAt + .5); f.step({ interact: true });
    expect(f.gate.active).toBe(true); expect(medicationAnchors(f.game).length).toBeGreaterThan(0);
    f.runTo(f.active.endsAt - BALANCE.step); expect(f.game.hostEvents!.active).toBe(f.active);
    expect(f.drugHits(victim)).toHaveLength(0);
    f.runTo(f.active.endsAt); expect(f.game.hostEvents!.active).toBeNull();
    expect(f.events.filter(event => event.type === 'HOST_EVENT_ZONE_SKIPPED')).toHaveLength(3);
  });

  it('skips the later source-linked round after an ordinary precision shot clears that infection source', () => {
    const f = fixture(), zone = f.active.zones[1], victim = f.victimAt(zone);
    const node = f.game.battle!.graph.nodes.find(node => node.id === 'source-a')!;
    const source: Target = { id: node.id, role: 'source', kind: 'single', x: node.x, y: node.y,
      radius: 34, hp: BALANCE.damage[1], maxHp: BALANCE.damage[1], hitUntil: 0, scanned: false, traits: [] };
    f.game.targets.push(source);
    Object.assign(f.game.player, { x: source.x - 100, y: source.y });
    // Repay the first public reward, keeping this fixture focused on world placement.
    f.game.growth!.starterDebt = 1;
    f.runTo(2.5); f.step({ tool: 1, aim: source, fire: true });
    expect(source.hp).toBe(0); expect(node.active).toBe(false); expect(f.game.phase).toBe('playing');
    expect(f.events.some(event => event.type === 'INFECTION_SOURCE_CLEARED' && event.data.nodeId === source.id)).toBe(true);
    expect(medicationAnchors(f.game).some(point => Math.hypot(point.x - zone.x, point.y - zone.y) < 1e-6)).toBe(false);
    f.runTo(zone.endsAt);
    expect(zone.medicationState).toBe('skipped'); expect(f.skipped(zone)).toHaveLength(1);
    expect(f.drugHits(victim).filter(event => event.tick / 60 >= zone.startsAt)).toHaveLength(0);
    expect(f.game.hostEvents!.active).toBe(f.active);
  });
});
