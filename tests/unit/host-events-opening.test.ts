import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Target } from '../../src/game/types';
import { advanceHostEvents, drainHostEventCommands, endHostEvent, eventModifier, initializeHostEvents } from '../../src/game/hostEvents';

const lightVirus = (): Target => ({ id: 'opening-light', role: 'virus', kind: 'single', radius: 14,
  hp: 100, maxHp: 100, x: 700, y: 500, hitUntil: 0, scanned: false, traits: [] });

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const game = session.state;
  game.player.hp = 100; game.tissue.hp = game.tissue.maxHp;
  game.battle!.pressure.infection = 0; game.battle!.warning = null;
  game.targets = []; initializeHostEvents(game);
  const step = () => { game.tick++; game.elapsed = game.tick * BALANCE.step; return advanceHostEvents(game, BALANCE.step); };
  const advance = (seconds: number) => { for (let tick = 0; tick < Math.round(seconds / BALANCE.step); tick++) step(); };
  const combat = () => { game.endless!.wave = 3; game.endless!.phase = 'combat'; game.targets = [lightVirus()]; };
  return { session, game, step, advance, combat };
}

describe('opening challenge host exercise lesson', () => {
  it('replaces only the challenge 75-second slot and starts once after wave three has a live light virus, without a random draw', () => {
    const f = fixture(), state = f.game.hostEvents!, randomBefore = state.rngState;
    expect(state.slots.map(slot => slot.at)).toEqual([240, 420, 600]);
    const campaign = new GameSession(71, { campaign: true, milestone: 'G3' });
    expect(campaign.state.hostEvents!.slots.map(slot => slot.at)).toEqual([75, 240, 420, 600]);
    f.game.targets = [lightVirus()]; f.step(); expect(state.active).toBeNull();
    f.game.endless!.wave = 2; f.game.endless!.phase = 'combat'; f.step(); expect(state.active).toBeNull();
    f.game.endless!.wave = 3; f.game.endless!.phase = 'warning'; f.step(); expect(state.active).toBeNull();
    f.game.endless!.phase = 'combat'; f.game.targets = []; f.step(); expect(state.active).toBeNull();
    f.game.targets = [{ ...lightVirus(), traits: ['CARAPACE'] }]; f.step(); expect(state.active).toBeNull();
    f.game.targets = [lightVirus()]; const commands = f.step();
    expect(state.active).toMatchObject({ id: 'EXERCISE', phase: 'warning', trigger: 'opening', slotIndex: null });
    expect(state.active!.startsAt - state.active!.warningStartedAt).toBe(8);
    expect(state.active!.endsAt - state.active!.startsAt).toBe(35);
    expect(commands).toContainEqual(expect.objectContaining({ kind: 'log', type: 'HOST_EVENT_WARNING',
      data: expect.objectContaining({ id: 'EXERCISE', debug: false, trigger: 'opening' }) }));
    expect(state.rngState).toBe(randomBefore); expect(state.slots.every(slot => slot.status === 'pending')).toBe(true);
    f.advance(8); expect(state.active?.phase).toBe('active');
    expect(eventModifier(f.game, 'pulseCooldown')).toBe(.7);
    expect(eventModifier(f.game, 'pulseStrength')).toBe(1.25);
    expect(eventModifier(f.game, 'lightVirusMove')).toBe(1.15);
    f.advance(35); expect(state.active).toBeNull();
    expect(state.openingExercise?.status).toBe('completed');
    f.advance(1); expect(state.usedIds.filter(id => id === 'EXERCISE')).toHaveLength(1);
    expect(state.rngState).toBe(randomBefore);
  });

  it('waits through crisis, reward and alarm grace until legal combat, preserving the opening opportunity', () => {
    const f = fixture(), state = f.game.hostEvents!; f.combat();
    f.game.player.hp = 20; f.step(); expect(state.openingExercise?.waitingReason).toBe('crisis');
    f.game.player.hp = 100; f.game.endless!.reward = { wave: 2, step: 'combat' };
    f.step(); expect(state.active).toBeNull(); expect(state.openingExercise?.waitingReason).toBe('wave-reward');
    f.game.endless!.reward.step = 'complete'; f.game.battle!.warning = { trait: 'FISSION', startedAt: 0, applyAt: 8 };
    f.step(); expect(state.active).toBeNull();
    f.game.battle!.warning = null; f.advance(14); expect(state.active).toBeNull();
    f.advance(1.1); expect(state.active?.id).toBe('EXERCISE');
  });

  it('freezes its warning during intermission and crisis; clears may remove all viruses without cancelling the lesson', () => {
    const f = fixture(); f.combat(); f.step(); f.advance(2);
    const state = f.game.hostEvents!, active = state.active!, remaining = active.startsAt - f.game.elapsed;
    f.game.endless!.phase = 'intermission'; f.game.targets = []; f.advance(3);
    expect(active.startsAt - f.game.elapsed).toBeCloseTo(remaining);
    f.game.endless!.phase = 'combat'; f.game.endless!.wave = 4; f.game.player.hp = 20; f.advance(3);
    expect(active.startsAt - f.game.elapsed).toBeCloseTo(remaining);
    f.game.player.hp = 100; f.advance(6);
    expect(state.active?.phase).toBe('active');
    expect(state.openingExercise?.status).toBe('selected');
    expect(eventModifier(f.game, 'lightVirusMove')).toBe(1.15);
    f.game.endless!.phase = 'intermission'; f.advance(1);
    expect(state.active?.phase).toBe('active');
  });

  it('does not mutate or advance a paused warning, and cancelling an untriggered lesson records its actual blocking reason once', () => {
    const f = fixture(); f.combat(); f.step();
    f.game.phase = 'paused'; const snapshot = structuredClone(f.game.hostEvents);
    advanceHostEvents(f.game, BALANCE.step); expect(f.game.hostEvents).toEqual(snapshot);
    const early = fixture(); early.game.player.hp = 0;
    const commands = early.step();
    expect(early.game.hostEvents!.openingExercise).toMatchObject({ status: 'cancelled', reason: 'player-dead' });
    expect(commands).toContainEqual(expect.objectContaining({ type: 'HOST_EVENT_CANCELLED',
      data: expect.objectContaining({ id: 'EXERCISE', triggered: false, reason: 'player-dead', blockedBy: 'wave-3-not-reached' }) }));
    endHostEvent(early.game, 'run-ended'); expect(drainHostEventCommands(early.game)).toEqual([]);
    const exit = fixture(); endHostEvent(exit.game, 'menu');
    expect(exit.game.hostEvents!.openingExercise).toMatchObject({ status: 'cancelled', reason: 'menu' });
  });

  it('keeps later random slots and event uniqueness after the guaranteed lesson', () => {
    const f = fixture(), state = f.game.hostEvents!; f.combat(); f.step(); f.advance(43);
    f.game.tick = 240 * 60 - 1; f.step();
    expect(state.slots[0]).toMatchObject({ at: 240, status: 'selected' });
    expect(state.active?.id).not.toBe('EXERCISE');
    expect(new Set(state.usedIds).size).toBe(state.usedIds.length);
  });
});
