import { describe, expect, it } from 'vitest';
import { Soundscape } from '../../src/audio';
import type { GameEvent, GameState } from '../../src/game/types';

interface ScheduledTone { start: number; stop: number; from: number; to: number; volume: number }
interface NodeLifecycle { connected: boolean; disconnectCalls: number }
interface OscillatorLifecycle extends NodeLifecycle { onended: (() => void) | null }
function audioFixture() {
  const scheduled: ScheduledTone[] = [];
  const oscillators: OscillatorLifecycle[] = [], gains: NodeLifecycle[] = [];
  const clock = { now: 10 };
  let pending: ScheduledTone;
  const fake = {
    state: 'running', destination: {}, get currentTime() { return clock.now; }, resume: () => Promise.resolve(),
    createOscillator() {
      const tone = { start: -1, stop: -1, from: 0, to: 0, volume: 0 }; scheduled.push(tone); pending = tone;
      const oscillator = { type: '', onended: null as (() => void) | null, connected: false, disconnectCalls: 0,
        frequency: { setValueAtTime: (value: number) => { tone.from = value; }, exponentialRampToValueAtTime: (value: number) => { tone.to = value; } },
        connect: (node: unknown) => { oscillator.connected = true; return node; },
        disconnect: () => { oscillator.connected = false; oscillator.disconnectCalls++; },
        start: (at: number) => { tone.start = at; }, stop: (at: number) => { tone.stop = at; } };
      oscillators.push(oscillator); return oscillator;
    },
    createGain() {
      const tone = pending;
      const gain = { connected: false, disconnectCalls: 0,
        gain: { setValueAtTime: (value: number) => { tone.volume = value; }, exponentialRampToValueAtTime: () => {} },
        connect: () => { gain.connected = true; return {}; }, disconnect: () => { gain.connected = false; gain.disconnectCalls++; } };
      gains.push(gain); return gain;
    },
  } as unknown as AudioContext;
  const sound = new Soundscape(() => fake); sound.unlock();
  const finishDue = (at: number) => {
    clock.now = at;
    scheduled.forEach((tone, index) => { if (tone.stop <= at) oscillators[index].onended?.(); });
  };
  return { sound, scheduled, clock, oscillators, gains, finishDue };
}
const event = (type: string, tick: number, data: GameEvent['data'] = {}): GameEvent => ({ type, tick, data });
const state = (events: GameEvent[], tick = Math.max(0, ...events.map(item => item.tick)), seed = 91): GameState => ({ seed, tick, events } as GameState);

describe('event-driven sound feedback', () => {
  it('plays distinct accepted tool launch cues, bounds bursts and keeps impact independent', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('TOOL_FIRED', 10, { tool: 1 }), event('TOOL_FIRED', 10, { tool: 1 }),
      event('TARGET_HIT', 10), event('TARGET_HIT', 10), event('TOOL_FIRED', 30, { tool: 2 }),
      event('TOOL_FIRED', 50, { tool: 3 })];
    sound.update(state(events));
    expect(scheduled.map(tone => tone.from)).toEqual([820, 520, 230, 560]);
    sound.update(state(events)); expect(scheduled).toHaveLength(4);
    sound.update(state([...events, event('TOOL_REJECTED', 70, { tool: 3 })]));
    expect(scheduled).toHaveLength(4);
  });
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

  it('disconnects started and delayed tones only when each ends and releases their ended handlers', () => {
    const { sound, scheduled, oscillators, gains, finishDue } = audioFixture();
    sound.update(state([event('PROTOCOL_EQUIPPED', 100)]));
    const schedule = structuredClone(scheduled);
    expect(oscillators).toHaveLength(3);
    expect(oscillators.every(node => node.connected && node.onended !== null)).toBe(true);
    expect(gains.every(node => node.connected)).toBe(true);

    finishDue(scheduled[0].stop - .001);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([0, 0, 0]);
    finishDue(scheduled[0].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 0, 0]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 0, 0]);
    expect(oscillators[0].onended).toBeNull();
    expect(oscillators.slice(1).every(node => node.connected && node.onended !== null)).toBe(true);
    expect(gains.slice(1).every(node => node.connected)).toBe(true);

    finishDue(scheduled[1].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 1, 0]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 1, 0]);
    expect(oscillators[1].onended).toBeNull();
    expect(oscillators[2].connected && gains[2].connected).toBe(true);
    finishDue(scheduled[2].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 1, 1]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 1, 1]);
    expect(oscillators.every(node => !node.connected && node.onended === null)).toBe(true);
    expect(gains.every(node => !node.connected)).toBe(true);
    expect(scheduled).toEqual(schedule);
  });

  it('handles duplicate ended delivery without disconnecting other tones or resetting event rate limits', () => {
    const { sound, scheduled, oscillators, gains, clock } = audioFixture();
    const first = event('TARGET_HIT', 60), hurt = event('PLAYER_HURT', 60);
    sound.update(state([first, hurt]));
    expect(scheduled).toHaveLength(2);
    const ended = oscillators[0].onended!;
    clock.now = scheduled[0].stop;
    expect(() => { ended(); ended(); }).not.toThrow();
    expect(oscillators[0].disconnectCalls).toBe(1); expect(gains[0].disconnectCalls).toBe(1);
    expect(oscillators[0].onended).toBeNull();
    expect(oscillators[1].disconnectCalls).toBe(0); expect(gains[1].disconnectCalls).toBe(0);
    expect(oscillators[1].connected && gains[1].connected).toBe(true);
    expect(oscillators[1].onended).not.toBeNull();
    sound.update(state([first, hurt, event('TARGET_HIT', 61)], 61));
    expect(scheduled).toHaveLength(2);
    sound.update(state([first, hurt, event('TARGET_HIT', 64)], 64));
    expect(scheduled).toHaveLength(3);
    expect(oscillators[2].connected && gains[2].connected).toBe(true);
    expect(oscillators[2].disconnectCalls).toBe(0); expect(gains[2].disconnectCalls).toBe(0);
  });
});
