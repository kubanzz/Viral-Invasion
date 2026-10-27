import { describe, expect, it } from 'vitest';
import { Soundscape } from '../../src/audio';
import type { GameEvent, GameState } from '../../src/game/types';

interface ScheduledTone { start: number; stop: number; from: number; to: number; volume: number }
function audioFixture() {
  const scheduled: ScheduledTone[] = [];
  const clock = { now: 10 };
  let pending: ScheduledTone;
  const fake = {
    state: 'running', destination: {}, get currentTime() { return clock.now; }, resume: () => Promise.resolve(),
    createOscillator() {
      const tone = { start: -1, stop: -1, from: 0, to: 0, volume: 0 }; scheduled.push(tone); pending = tone;
      return { type: '', frequency: { setValueAtTime: (value: number) => { tone.from = value; }, exponentialRampToValueAtTime: (value: number) => { tone.to = value; } },
        connect: (node: unknown) => node, start: (at: number) => { tone.start = at; }, stop: (at: number) => { tone.stop = at; } };
    },
    createGain() {
      const tone = pending;
      return { gain: { setValueAtTime: (value: number) => { tone.volume = value; }, exponentialRampToValueAtTime: () => {} }, connect: () => ({}) };
    },
  } as unknown as AudioContext;
  const sound = new Soundscape(() => fake); sound.unlock();
  return { sound, scheduled, clock };
}
const event = (type: string, tick: number, data: GameEvent['data'] = {}): GameEvent => ({ type, tick, data });
const state = (events: GameEvent[], tick = Math.max(0, ...events.map(item => item.tick)), seed = 91): GameState => ({ seed, tick, events } as GameState);

describe('event-driven sound feedback', () => {
  it('distinguishes actual repair, enemy/infection damage and protocol pressure; full-health repair remains silent', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([
      event('ORGAN_INTEGRITY_CHANGED', 10, { before: 60, after: 85, reason: 'repair' }),
      event('ORGAN_INTEGRITY_CHANGED', 30, { before: 85, after: 69, reason: 'enemy-attack' }),
      event('ORGAN_INTEGRITY_CHANGED', 60, { before: 69, after: 66, reason: 'protocol-pressure' }),
      event('ORGAN_INTEGRITY_CHANGED', 90, { before: 100, after: 100, reason: 'repair' }),
      event('ORGAN_INTEGRITY_CHANGED', 120, { before: 66, after: 65, reason: 'infection' }),
    ]));
    expect(scheduled).toHaveLength(4);
    expect(scheduled[0].to).toBeGreaterThan(scheduled[0].from);
    for (const tone of scheduled.slice(1)) expect(tone.to).toBeLessThan(tone.from);
    expect(scheduled[2].volume).toBeLessThan(scheduled[1].volume);
    expect(scheduled[2].stop - scheduled[2].start).toBeLessThan(scheduled[1].stop - scheduled[1].start);
  });

  it('schedules a short rising equipment cue and rate limits event bursts using simulation time', () => {
    const { sound, scheduled, clock } = audioFixture();
    const first = event('PROTOCOL_EQUIPPED', 100);
    sound.update(state([first]));
    expect(scheduled).toHaveLength(3);
    expect(scheduled.map(tone => tone.from)).toEqual([660, 880, 1100]);
    expect(scheduled[1].start).toBeGreaterThan(scheduled[0].start);
    expect(scheduled[2].start).toBeGreaterThan(scheduled[1].start);
    expect(scheduled[2].stop - scheduled[0].start).toBeLessThan(.3);
    clock.now += 120;
    sound.update(state([first, event('PROTOCOL_EQUIPPED', 100), event('PROTOCOL_EQUIPPED', 110)], 110));
    expect(scheduled).toHaveLength(3);
    const later = event('PROTOCOL_EQUIPPED', 118);
    sound.update(state([first, later], 118)); expect(scheduled).toHaveLength(6);
    sound.update(state([first, later], 118)); expect(scheduled).toHaveLength(6);
  });

  it('bounds simultaneous cell-hit and source-clear sounds while allowing a distinct next-run cue', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([
      ...Array.from({ length: 100 }, () => event('TARGET_HIT', 60)),
      event('TARGET_CLEARED', 60), event('INFECTION_SOURCE_CLEARED', 60), event('ELITE_CLEARED', 60),
    ]));
    expect(scheduled).toHaveLength(3);
    sound.update(state([event('PROTOCOL_EQUIPPED', 0)], 0));
    expect(scheduled).toHaveLength(6);
  });

  it('keeps mute and unavailable or refused audio harmless without replaying muted events', async () => {
    const { sound, scheduled } = audioFixture(); sound.toggle();
    const muted = event('PROTOCOL_EQUIPPED', 30);
    sound.update(state([muted])); expect(scheduled).toEqual([]);
    sound.toggle(); sound.update(state([muted])); expect(scheduled).toEqual([]);
    sound.update(state([muted, event('PROTOCOL_EQUIPPED', 60)])); expect(scheduled).toHaveLength(3);
    for (const factory of [() => undefined, () => { throw new Error('disabled'); }, () => ({ resume: () => Promise.reject(new Error('autoplay denied')) } as AudioContext)]) {
      const unavailable = new Soundscape(factory);
      expect(() => unavailable.unlock()).not.toThrow();
      expect(() => unavailable.update(state([event('PROTOCOL_EQUIPPED', 1)]))).not.toThrow();
    }
    await Promise.resolve();
  });
});
