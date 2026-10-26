import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { MotherCoreController, MOTHER_CORE_BALANCE } from '../../src/game/motherCore';
import type { MotherCoreAttack } from '../../src/game/motherCoreTypes';
import { drawMotherCoreDangers } from '../../src/render/battleVisuals';

type Call = { method: string; args: unknown[] };
function context(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({}, {
    get: (_target, method) => (...args: unknown[]) => calls.push({ method: String(method), args }),
    set: () => true,
  }) as CanvasRenderingContext2D;
  return { ctx, calls };
}

function fixture(kind: MotherCoreAttack['kind']) {
  const state = new GameSession(130026, { campaign: true, milestone: 'G3' }).snapshot();
  state.elapsed = 5; state.tick = 300;
  const combat = new MotherCoreController({ coreId: 'core', organId: 'heart', traits: ['CARAPACE', 'FISSION'], tick: 0, elapsed: 0 }).state;
  combat.phase = 'windup';
  combat.attack = { id: 'attack', kind, trait: 'CARAPACE', startedAt: 4.5, resolveAt: 5.7,
    origin: { x: 730, y: 230 }, aim: { x: 780, y: 610 }, angle: Math.PI / 2,
    range: MOTHER_CORE_BALANCE.sweepRange, halfAngle: MOTHER_CORE_BALANCE.sweepHalfAngle,
    radius: 88, landings: [{ x: 690, y: 430 }, { x: 840, y: 430 }] };
  return { state, combat };
}

describe('mother core warning geometry', () => {
  it('draws the true cone angle/range and clips it against the current organ world', () => {
    const { state, combat } = fixture('crystal-sweep');
    state.world = { ...state.world!, width: 1200, height: 800,
      bounds: { left: 65, right: 1135, top: 110, bottom: 735 },
      foreground: { x: 155, y: 550, width: 190, height: 125 },
      obstacles: [{ id: 'lung-test', x: 730, y: 400, radius: 40 }] };
    const { ctx, calls } = context(); drawMotherCoreDangers(ctx, state, combat);
    const end = calls.findIndex(call => call.method === 'closePath');
    const vertices = calls.slice(0, end).filter(call => call.method === 'lineTo').map(call => ({ x: Number(call.args[0]), y: Number(call.args[1]) }));
    const first = vertices[0], last = vertices.at(-1)!, center = vertices[32];
    expect(Math.atan2(first.y - 230, first.x - 730)).toBeCloseTo(Math.PI / 2 - MOTHER_CORE_BALANCE.sweepHalfAngle, 8);
    expect(Math.atan2(last.y - 230, last.x - 730)).toBeCloseTo(Math.PI / 2 + MOTHER_CORE_BALANCE.sweepHalfAngle, 8);
    expect(Math.hypot(first.x - 730, first.y - 230)).toBeCloseTo(MOTHER_CORE_BALANCE.sweepRange, 8);
    expect(center.x).toBeCloseTo(730, 8); expect(center.y).toBeCloseTo(360, 8);
  });

  it.each(['fission-burst', 'corrosion', 'brood'] as const)('uses serialized %s centers and radii, never the ordinary enemy radius', kind => {
    const { state, combat } = fixture(kind); const attack = combat.attack!;
    attack.radius = kind === 'brood' ? MOTHER_CORE_BALANCE.childRadius + 5 : kind === 'corrosion' ? state.tissue.radius + 12 : MOTHER_CORE_BALANCE.burstRadius;
    const { ctx, calls } = context(); drawMotherCoreDangers(ctx, state, combat);
    const circles = calls.filter(call => call.method === 'ellipse');
    const centers = kind === 'brood' ? attack.landings : [attack.aim];
    expect(circles).toHaveLength(centers.length);
    circles.forEach((circle, index) => expect(circle.args.slice(0, 4)).toEqual([centers[index].x, centers[index].y, attack.radius, attack.radius]));
  });
});
