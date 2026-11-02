import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { createOrganArena } from '../../src/game/organConfig';
import { BALANCE, type GameState, type Target } from '../../src/game/types';
import { advanceHostEvents, beginDebugHostEvent, endHostEvent, eventModifier, hostEventEligibility,
  initializeHostEvents } from '../../src/game/hostEvents';
import type { HostEventCommand, HostEventId } from '../../src/game/hostEventTypes';

/** Isolated deterministic scheduler fixtures; these never inject a browser game. */
function fixture(seed = 41, organ: 'heart' | 'lung' = 'heart') {
  const session = new GameSession(seed, { campaign: true, milestone: 'G3' }); session.start();
  const game = session.state;
  if (organ === 'lung') {
    const arena = createOrganArena('lung', seed); arena.activated = true;
    Object.assign(game, { targets: arena.targets, tissue: arena.tissue, world: arena.geometry, terminal: arena.terminal });
    Object.assign(game.battle!, { organId: 'lung', graph: arena.graph, pulse: arena.pulse });
    game.campaign!.activeOrganId = 'lung'; game.campaign!.arenas.lung = arena;
  }
  game.tissue.hp = game.tissue.maxHp; game.player.hp = 100;
  game.battle!.pressure.infection = 0; game.battle!.warning = null;
  game.campaign!.migration.status = 'resolved';
  initializeHostEvents(game);
  const receipts: HostEventCommand[] = [];
  const at = (seconds: number) => {
    game.tick = Math.round(seconds * 60); game.elapsed = game.tick / 60;
    const commands = advanceHostEvents(game, BALANCE.step); receipts.push(...commands);
    for (const command of commands) if (command.kind === 'healPlayer') game.player.hp = Math.min(100, game.player.hp + command.amount);
    return commands;
  };
  const runTo = (seconds: number) => { while (game.elapsed + 1e-9 < seconds) at((game.tick + 1) / 60); };
  return { session, game, at, runTo, receipts };
}

function activate(f: ReturnType<typeof fixture>, id: HostEventId) {
  expect(beginDebugHostEvent(f.game, id)).toMatchObject({ ok: true });
  const starts = f.game.hostEvents!.active!.startsAt;
  f.runTo(starts);
  expect(f.game.hostEvents!.active?.phase).toBe('active');
  return f.game.hostEvents!.active!;
}

describe('host activity scheduler and dependencies', () => {
  it('replays the same independent seeded sequence and enforces one selection per slot, unique cards, first green and red limits', () => {
    const replay = (seed: number) => {
      const f = fixture(seed); f.runTo(700);
      const state = f.game.hostEvents!;
      expect(state.slots.map(slot => slot.at)).toEqual([75, 240, 420, 600]);
      expect(state.slots.every(slot => ['completed', 'skipped'].includes(slot.status))).toBe(true);
      expect(new Set(state.usedIds).size).toBe(state.usedIds.length);
      expect(state.redCount).toBeLessThanOrEqual(2);
      const starts = f.receipts.filter((command): command is Extract<HostEventCommand, { kind: 'log' }> => command.kind === 'log' && command.type === 'HOST_EVENT_STARTED');
      expect(starts.length).toBeGreaterThan(0);
      return { state, starts };
    };
    for (const seed of [1, 7, 41, 90210]) {
      const a = replay(seed), b = replay(seed);
      expect(a).toEqual(b);
      const selected = a.state.slots.find(slot => slot.id)?.id;
      expect(['MEDICATION', 'REST']).toContain(selected);
      for (let index = 1; index < a.starts.length; index++) {
        expect(a.starts[index].data.category === 'red' && a.starts[index - 1].data.category === 'red').toBe(false);
      }
    }
  });

  it('reports missing dependencies instead of constructing organs, legions or a second repairable tissue', () => {
    const f = fixture();
    expect(hostEventEligibility(f.game, 'SMOKE').ok).toBe(false);
    expect(hostEventEligibility(f.game, 'ALCOHOL')).toMatchObject({ ok: false });
    expect(hostEventEligibility(f.game, 'ALCOHOL').reason).toBeTruthy();
    f.game.targets = [];
    expect(hostEventEligibility(f.game, 'EXERCISE').ok).toBe(false);
    f.game.battle!.graph.nodes = f.game.battle!.graph.nodes.filter(node => node.kind !== 'healing');
    expect(hostEventEligibility(f.game, 'SLEEPLESS').ok).toBe(false);
    expect(beginDebugHostEvent(f.game, 'SLEEPLESS').ok).toBe(false);
    expect(f.game.hostEvents!.active).toBeNull();
  });

  it('only enables sleepless capture when treatment facilities exist, and never multiplies recovery without captors', () => {
    const f = fixture(); const eligibility = hostEventEligibility(f.game, 'SLEEPLESS');
    expect(eligibility).toMatchObject({ ok: true, affectsLegions: false, affectsHealingPoints: true });
    const event = activate(f, 'SLEEPLESS');
    expect(event.affectsLegions).toBe(false); expect(event.affectsHealingPoints).toBe(true);
    expect(eventModifier(f.game, 'captureProgress')).toBe(1.25);
    expect(eventModifier(f.game, 'immuneAttackFrequency')).toBe(1);
    expect(event.description).toContain('治疗');
  });

  it('defers a blocked slot for at most sixty simulation seconds and does not issue it later', () => {
    const f = fixture(); const host = f.game.hostEvents!;
    host.successCount = 2; host.usedIds = ['MEDICATION', 'REST'];
    host.slots[0].status = 'completed'; f.game.player.hp = 24;
    f.at(240); expect(host.active).toBeNull(); expect(host.slots[1].status).toBe('pending');
    f.runTo(300.02); expect(host.slots[1].status).toBe('skipped');
    f.game.player.hp = 100; f.runTo(400);
    expect(host.slots[1].status).toBe('skipped'); expect(host.active).toBeNull();
  });

  it('keeps sixty seconds after the preceding end, never overlaps events, and consumes a cancelled warning slot', () => {
    const f = fixture(), host = f.game.hostEvents!;
    host.slots[0].status = 'completed'; host.successCount = 1; host.usedIds = ['REST']; host.lastEndedAt = 200;
    f.at(240); expect(host.active).toBeNull();
    f.runTo(259.98); expect(host.active).toBeNull();
    f.runTo(260); expect(host.active).not.toBeNull(); expect(host.active!.warningStartedAt).toBe(260);
    expect(host.slots[1].status).toBe('selected');
    expect(beginDebugHostEvent(f.game, 'REST').ok).toBe(false);
    const other = fixture(); other.runTo(75);
    expect(other.game.hostEvents!.slots[0].status).toBe('selected');
    other.game.battle!.warning = { trait: 'FISSION', startedAt: 76, applyAt: 84 }; other.at(76);
    expect(other.game.hostEvents!.slots[0].status).toBe('cancelled');
    other.game.battle!.warning = null; other.runTo(240);
    expect(other.game.hostEvents!.slots[0].status).toBe('cancelled');
    expect(other.game.hostEvents!.active?.category).toBe('green');
  });

  it.each([
    ['player health', (game: GameState) => { game.player.hp = 24; }],
    ['infection', (game: GameState) => { game.battle!.pressure.infection = 80.01; }],
    ['organ integrity', (game: GameState) => { game.tissue.hp = 24; }],
  ])('rejects adverse debug starts during low %s and still permits green help', (_name, crisis) => {
    const f = fixture(); crisis(f.game);
    expect(beginDebugHostEvent(f.game, 'SLEEPLESS').ok).toBe(false);
    expect(beginDebugHostEvent(f.game, 'REST').ok).toBe(true);
  });

  it('cancels warnings on evolution, terminates active red effects and leaves a fifteen-second buffer', () => {
    const f = fixture(); expect(beginDebugHostEvent(f.game, 'SLEEPLESS').ok).toBe(true);
    f.game.battle!.warning = { trait: 'FISSION', startedAt: 0, applyAt: 8 };
    f.at(1); expect(f.game.hostEvents!.active).toBeNull();
    expect(Object.keys(f.game.hostEvents!.sources)).toEqual([]);
    f.game.battle!.warning = null; f.at(2);
    expect(beginDebugHostEvent(f.game, 'REST').ok).toBe(false);
    f.runTo(17.02); expect(beginDebugHostEvent(f.game, 'REST').ok).toBe(true);
    endHostEvent(f.game, 'test');
    const other = fixture(); activate(other, 'SLEEPLESS');
    other.game.campaign!.migration.status = 'warning'; other.at(8.02);
    expect(other.game.hostEvents!.active).toBeNull();
    expect(eventModifier(other.game, 'captureProgress')).toBe(1);
  });
});

describe('host activity effect ownership', () => {
  it('previews each medication zone for a second and sends exactly six ordinary-D ticks at 0/8/16-second appearances', () => {
    const f = fixture(), event = activate(f, 'MEDICATION');
    expect(event.endsAt - event.startsAt).toBe(24);
    expect(event.zones.map(zone => zone.startsAt - event.startsAt)).toEqual([0, 8, 16]);
    for (const zone of event.zones) {
      expect(zone.startsAt - zone.previewAt).toBe(1); expect(zone.endsAt - zone.startsAt).toBe(6);
      expect(zone.radius).toBe(6 * f.game.player.radius);
      f.game.targets = [{ id: 'drug-tick-fixture', role: 'virus', kind: 'single', hp: 10000, maxHp: 10000,
        x: zone.x, y: zone.y, radius: 22, hitUntil: 0, scanned: false }];
      const before = f.receipts.filter(command => command.kind === 'damage').length;
      f.runTo(zone.endsAt);
      const ticks = f.receipts.filter((command): command is Extract<HostEventCommand, { kind: 'damage' }> => command.kind === 'damage').slice(before);
      expect(ticks).toHaveLength(6); expect(ticks.every(command => command.amount === BALANCE.damage[1])).toBe(true);
    }
    f.runTo(event.endsAt); expect(f.game.hostEvents!.active).toBeNull(); expect(f.game.hostEvents!.sources).toEqual({});
  });

  it('freezes all event state while paused and removes event ownership idempotently without undoing accepted healing', () => {
    const f = fixture(); f.game.player.hp = 50; activate(f, 'REST'); f.runTo(7);
    const healed = f.game.player.hp; expect(healed).toBeGreaterThan(50);
    f.game.phase = 'paused'; const before = structuredClone(f.game.hostEvents);
    f.at(20); expect(f.game.hostEvents).toEqual(before); expect(f.game.player.hp).toBe(healed);
    f.game.phase = 'playing'; endHostEvent(f.game, 'test'); endHostEvent(f.game, 'test');
    expect(f.game.hostEvents!.active).toBeNull(); expect(f.game.hostEvents!.sources).toEqual({});
    expect(f.game.player.hp).toBe(healed); expect(eventModifier(f.game, 'playerActiveRepair')).toBe(1);
  });

  it('rest restores at most twenty percent and does not bank full-health ticks or amplify player healing', () => {
    const f = fixture(); const event = activate(f, 'REST');
    expect(event.endsAt - event.startsAt).toBe(30);
    f.runTo(12); f.game.player.hp = 40; f.runTo(17);
    expect(f.game.player.hp).toBe(45);
    expect(eventModifier(f.game, 'playerActiveRepair')).toBe(1.25);
    expect(eventModifier(f.game, 'tissueRepair', f.game.tissue)).toBe(1);
    f.runTo(32.1); expect(f.game.player.hp).toBeLessThanOrEqual(60);
    expect(f.game.hostEvents!.active).toBeNull();
  });

  it('places three reachable lung sources away from the player and key interactions and clears each corresponding smoke circle', () => {
    const f = fixture(41, 'lung'), event = activate(f, 'SMOKE');
    expect(event.targetIds).toHaveLength(3); expect(event.zones).toHaveLength(3);
    const targets = f.game.targets.filter(target => event.targetIds.includes(target.id));
    expect(targets).toHaveLength(3);
    for (const target of targets) {
      expect(target.hp).toBe(BALANCE.damage[1] * 3);
      expect(isLegalPosition(target, target.radius, f.game.world)).toBe(true);
      expect(distance(target, f.game.player)).toBeGreaterThanOrEqual(f.game.player.radius * 8);
      for (const node of f.game.battle!.graph.nodes.filter(node => ['exit', 'research', 'retest', 'valve', 'gate', 'healing'].includes(node.kind))) {
        expect(distance(target, node)).toBeGreaterThan(target.radius + f.game.player.radius);
      }
    }
    expect(eventModifier(f.game, 'playerMove', targets[0])).toBe(.8);
    expect(eventModifier(f.game, 'immuneMove', targets[0])).toBe(.8);
    expect(eventModifier(f.game, 'immuneAttackFrequency', targets[0])).toBe(.8);
    const zone = event.zones[0]; event.zones.push({ ...zone, id: 'overlap-fixture' });
    expect(eventModifier(f.game, 'playerMove', targets[0])).toBe(.8);
    targets[0].hp = 0; f.at(8.02);
    expect(eventModifier(f.game, 'playerMove', targets[0])).toBe(1);
    for (const target of targets) target.hp = 0;
    f.at(8.04); expect(f.game.hostEvents!.active).toBeNull();
    expect(f.game.targets.some(target => event.targetIds.includes(target.id))).toBe(false);
    expect(f.game.hostEvents!.sources).toEqual({});
  });

  it('removes all event targets on organ change and does not affect the destination organ', () => {
    const f = fixture(41, 'lung'), event = activate(f, 'SMOKE');
    f.game.battle!.organId = 'heart'; f.at(8.02);
    expect(f.game.hostEvents!.active).toBeNull();
    expect(f.game.targets.some(target => event.targetIds.includes(target.id))).toBe(false);
    expect(eventModifier(f.game, 'playerMove', f.game.player)).toBe(1);
  });

  it('exercise scales only current light-virus movement and pulse parameters and never stores multipliers in new bodies', () => {
    const f = fixture(), event = activate(f, 'EXERCISE');
    expect(event.endsAt - event.startsAt).toBe(30);
    expect(eventModifier(f.game, 'pulseCooldown')).toBe(.7);
    expect(eventModifier(f.game, 'pulseStrength')).toBe(1.25);
    expect(eventModifier(f.game, 'lightVirusMove')).toBe(1.15);
    const fresh: Target = { id: 'fresh', role: 'virus', kind: 'single', radius: 14, hp: 22, maxHp: 22,
      x: 600, y: 500, hitUntil: 0, scanned: false, generation: 1 };
    f.game.targets.push(fresh);
    expect(eventModifier(f.game, 'lightVirusMove', fresh)).toBe(1.15);
    endHostEvent(f.game, 'test'); expect(eventModifier(f.game, 'lightVirusMove', fresh)).toBe(1);
    expect(fresh).toMatchObject({ hp: 22, maxHp: 22 });
  });
});
