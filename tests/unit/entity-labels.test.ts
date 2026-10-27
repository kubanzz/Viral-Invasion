import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { GrowthVisuals } from '../../src/render/growthVisuals';
import { drawLungAirway } from '../../src/render/lungVisuals';
import { summonImmuneCells } from '../../src/game/immuneCells';
import { growthContext } from '../../src/game/growth';
import type { SceneLabel } from '../../src/render/sceneLabels';

// Isolated drawing fixtures: these are never written into the browser game.
function canvas() {
  const text: string[] = [], shapes: string[] = [];
  return { text, shapes, ctx: new Proxy({}, {
    get: (_, method) => method === 'fillText' ? (value: string) => text.push(value) : () => shapes.push(String(method)),
    set: () => true,
  }) as CanvasRenderingContext2D };
}

describe('shared entity information pass', () => {
  it('merges squad identity and lifetime while counting only living members of this beacon and organ', () => {
    const state = new GameSession(13, { campaign: true, milestone: 'G3' }).snapshot();
    state.elapsed = 2;
    const growth = state.growth!;
    growth.beacon = { id: 'current', x: 500, y: 500, organId: 'heart', born: 0, until: 10, radius: 200, damage: 24, interval: .8, nextAttackAt: 2, tuning: 'balanced' };
    const members = summonImmuneCells(growth.beacon, growthContext(state));
    growth.cells = [members[0], { ...members[1], until: 1 }, { ...members[2], organId: 'lung' }, { ...members[0], id: 'old', beaconId: 'old' }];
    const before = JSON.stringify(state), labels: SceneLabel[] = [], drawn = canvas();
    new GrowthVisuals().drawBeacon(drawn.ctx, state, growth, { add: label => labels.push(label) });
    expect(labels).toHaveLength(1);
    expect(labels[0].lines[0].text).toBe('✚ 灯塔小队 ×1 · 8.0s');
    expect(labels[0].anchor).toMatchObject({ x: 500, y: 500 });
    expect(drawn.text).toEqual([]);
    expect(drawn.shapes).toContain('roundRect'); // The actual beacon remains at its body anchor.
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps a baseline patrol distinct from the equipped beacon without drawing a fake beacon body', () => {
    const state = new GameSession(13, { campaign: true, milestone: 'G3' }).snapshot();
    state.growth!.beacon = { id: 'patrol', mode: 'patrol', x: 500, y: 500, organId: 'heart', born: 0, until: 3.5, radius: 200, damage: 12, interval: 1.2, nextAttackAt: 0, tuning: 'balanced' };
    state.growth!.cells = summonImmuneCells(state.growth!.beacon, growthContext(state), 1);
    const labels: SceneLabel[] = [], drawn = canvas();
    new GrowthVisuals().drawBeacon(drawn.ctx, state, state.growth, { add: label => labels.push(label) });
    expect(labels[0].lines[0].text).toBe('✚ 免疫侦巡 ×1 · 3.5s');
    expect(drawn.text).toEqual([]); expect(drawn.shapes).toEqual([]);
  });

  it('preserves airway cost, pressure and cooldown information when body text moves into the shared pass', () => {
    const state = new GameSession(13, { campaign: true, milestone: 'G3' }).snapshot();
    const flow = state.campaign!.arenas.lung.flow!;
    state.elapsed = 2; flow.changedAt = state.elapsed; flow.pressureUntil = 5;
    const before = JSON.stringify(state), labels: SceneLabel[] = [], drawn = canvas();
    const anchor = { x: 1200, y: 600 };
    drawLungAirway(drawn.ctx, state, flow, true, { add: label => labels.push(label) }, anchor);
    expect(labels[0].essential).toBe(true);
    expect(labels[0].anchor).toEqual(anchor);
    expect(labels[0].lines.map(line => line.text).join(' ')).toMatch(/气道切换冷却/);
    expect(labels[0].lines.at(-1)!.text).toBe('△ 切换承压 3.0s');
    expect(drawn.text).toEqual([]); expect(drawn.shapes).toContain('ellipse');
    state.elapsed = 40; labels.length = 0;
    drawLungAirway(drawn.ctx, state, flow, true, { add: label => labels.push(label) }, anchor);
    expect(labels[0].lines[1].text).toMatch(/\[ E \].*组织 −\d/);
    expect(labels[0].lines).toHaveLength(2);
    state.elapsed = 2; expect(JSON.stringify(state)).toBe(before);
  });
});
