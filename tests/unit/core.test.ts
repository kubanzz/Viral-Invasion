import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/core/clock';
import { SeedRng } from '../../src/core/rng';
import { EventBus } from '../../src/core/events';

describe('deterministic foundation', () => {
  it('replays random values and supports zero seeds without degenerating', () => {
    const a = new SeedRng(0);
    const b = new SeedRng(0);
    const values = Array.from({ length: 1000 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(new Set(values).size).toBeGreaterThan(990);
    expect(values.every(value => value >= 0 && value < 1)).toBe(true);
    expect(new SeedRng(1).next()).not.toBe(new SeedRng(2).next());
    expect(() => a.int(3, 1)).toThrow(RangeError);
    expect(Array.from({ length: 100 }, () => a.int(-2, 2)).every(value => value >= -2 && value <= 2 && Number.isInteger(value))).toBe(true);
  });

  it('dispatches typed payloads, unsubscribes and clears listeners', () => {
    const bus = new EventBus<{ damage: { amount: number }; pause: boolean }>();
    const amounts: number[] = [];
    const unsubscribe = bus.on('damage', event => amounts.push(event.amount));
    bus.emit('damage', { amount: 7 });
    unsubscribe();
    bus.emit('damage', { amount: 100 });
    bus.on('damage', event => amounts.push(event.amount));
    bus.clear();
    bus.emit('damage', { amount: 200 });
    expect(amounts).toEqual([7]);
  });

  it('runs fixed steps independent of render frequency', () => {
    const steps = (rate: number) => {
      const clock = new FixedClock();
      let ticks = 0;
      for (let frame = 0; frame <= rate * 2; frame++) clock.advance(frame * 1000 / rate, dt => { expect(dt).toBe(1 / 60); ticks++; });
      return ticks;
    };
    expect(steps(30)).toBe(120);
    expect(steps(144)).toBe(120);
  });

  it('discards paused time, background gaps and overloaded frames', () => {
    const clock = new FixedClock();
    let ticks = 0;
    const update = () => ticks++;
    clock.advance(0, update);
    clock.advance(1000 / 60, update);
    expect(ticks).toBe(1);
    clock.advance(30000, update, false);
    clock.advance(30000 + 1000 / 60, update);
    expect(ticks).toBe(2);
    clock.advance(70000, update);
    expect(ticks).toBe(2);
    clock.reset();
    clock.advance(100000, update);
    expect(ticks).toBe(2);
    expect(clock.advance(100200, update)).toBe(8);
    expect(clock.advance(100201, update)).toBe(0);
  });
});
