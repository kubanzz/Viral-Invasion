import { describe, expect, it } from 'vitest';
import { createEndlessGrowth, chooseEndlessUpgrade, endlessCombatStats, ENDLESS_UPGRADES, offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import { GameSession } from '../../src/game/session';
import { BALANCE } from '../../src/game/types';

function trace(rank: number, ticks: number) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  // Only the acquired rank is a fixture. The fixed clock, held fire input,
  // cooldown acceptance, wave admission and enemy behavior run unmodified.
  session.state.endlessGrowth!.ranks.haste = rank;
  const fired: number[] = [], rays: number[] = [];
  session.bus.on('event', event => {
    if (event.type === 'TOOL_FIRED' && event.data.tool === 1) { fired.push(event.tick); rays.push(Number(event.data.rays)); }
  });
  for (let tick = 0; tick < ticks; tick++) session.step({ moveX: 0, moveY: 0,
    aim: { x: session.state.player.x + 300, y: session.state.player.y }, fire: true, tool: 1 });
  expect(session.state.tick).toBe(ticks);
  expect(session.state.phase).toBe('playing');
  return { session, fired, rays };
}

function hasteOffer(rank: number) {
  for (let seed = 1; seed <= 128; seed++) {
    const growth = createEndlessGrowth(seed); growth.ranks.haste = rank;
    offerEndlessUpgrade(growth, 12);
    const option = growth.draft?.options.find(option => option.id === 'haste');
    if (option) return { growth, option };
  }
  throw new Error(`No haste offer for rank ${rank}`);
}

describe('effective 60Hz endless haste progression', () => {
  it.each([120, 600])('fires strictly faster at every acquired rank over %i real fixed steps', ticks => {
    let previousCount = 0;
    for (let rank = 0; rank <= 5; rank++) {
      const { fired, session, rays } = trace(rank, ticks), period = 11 - rank;
      const expected = Array.from({ length: Math.floor((ticks - 1) / period) + 1 }, (_, index) => 1 + index * period);
      expect(fired, `rank ${rank}: every ${period} ticks`).toEqual(expected);
      expect(fired.length).toBeGreaterThan(previousCount);
      expect(new Set(fired).size).toBe(fired.length);
      expect(session.state.shots).toBe(fired.length);
      expect(rays.every(count => count === 1)).toBe(true);
      previousCount = fired.length;
    }
  });

  it('offers five consecutive effective ranks with actual interval and rate copy instead of simulation details', () => {
    expect(ENDLESS_UPGRADES.haste.maxRank).toBe(5);
    const descriptions = [
      ['0.183 → 0.167', '5.455 → 6'],
      ['0.167 → 0.15', '6 → 6.667'],
      ['0.15 → 0.133', '6.667 → 7.5'],
      ['0.133 → 0.117', '7.5 → 8.571'],
      ['0.117 → 0.1', '8.571 → 10'],
    ];
    for (let rank = 0; rank < 5; rank++) {
      const { growth, option } = hasteOffer(rank), draft = growth.draft!;
      expect(option.currentRank).toBe(rank); expect(option.nextRank).toBe(rank + 1);
      expect(option.description).toContain(`精准净化间隔约 ${descriptions[rank][0]} 秒`);
      expect(option.description).toContain(`射速约 ${descriptions[rank][1]} 发/秒`);
      expect(option.description).toContain('整组扇射共用一次间隔');
      expect(option.description).not.toMatch(/60Hz|帧/);
      expect(chooseEndlessUpgrade(growth, draft.id, 'haste')).toBe(true);
      expect(growth.ranks.haste).toBe(rank + 1);
      expect(endlessCombatStats(growth).primaryCooldown).toBeCloseTo((10 - rank) * BALANCE.step);
      expect(chooseEndlessUpgrade(growth, draft.id, 'haste')).toBe(false);
    }
  });

  it('removes the real six-tick floor from future drafts and preserves older over-cap ranks without rewriting them', () => {
    const floorTrace = trace(5, 120).fired;
    for (const rank of [5, 6, 7, Number.MAX_SAFE_INTEGER]) {
      const growth = createEndlessGrowth(71); growth.ranks.haste = rank;
      const before = structuredClone(growth);
      expect(endlessCombatStats(growth).primaryCooldown).toBe(.1);
      expect(growth).toEqual(before);
      for (let wave = 1; wave <= 100; wave++) {
        const candidate = structuredClone(growth); offerEndlessUpgrade(candidate, wave);
        expect(candidate.draft?.options.some(option => option.id === 'haste')).toBe(false);
      }
      if (rank > 5 && rank < 8) expect(trace(rank, 120).fired).toEqual(floorTrace);
    }
  });

  it('replays the same rank, seed and input to the same shot ticks and complete session state', () => {
    const a = trace(4, 600), b = trace(4, 600);
    expect(a.fired).toEqual(b.fired);
    expect(a.session.snapshot()).toEqual(b.session.snapshot());
  });
});
