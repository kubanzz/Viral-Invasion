import { describe, expect, it } from 'vitest';
import { DURATION, shotAt } from '../../src/render/worldPrologueTimeline';

describe('opening film timing', () => {
  it('keeps the final arrival visible at completion instead of wrapping to the opening', () => {
    expect(shotAt(0).id).toBe('body');
    expect(shotAt(6).id).toBe('lung');
    expect(shotAt(11).id).toBe('heart');
    expect(shotAt(16).id).toBe('orders');
    expect(shotAt(21).id).toBe('transit');
    expect(shotAt(29).id).toBe('arrival');
    expect(shotAt(DURATION)).toMatchObject({ id: 'arrival', progress: 1, local: 4 });
    expect(shotAt(DURATION + 100)).toMatchObject({ id: 'arrival', progress: 1 });
  });

  it('recovers safely from missing or invalid elapsed samples', () => {
    for (const elapsed of [NaN, Infinity, -Infinity, -50]) {
      const shot = shotAt(elapsed);
      expect(shot).toMatchObject({ id: 'body', local: 0, progress: 0 });
    }
  });
});
