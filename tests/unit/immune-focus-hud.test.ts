import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';
import { immuneFocusStatus, immuneFocusView } from '../../src/ui/immuneFocusHud';
import { drawImmuneFocus } from '../../src/render/immuneFocusVisuals';
import type { SceneLabel } from '../../src/render/sceneLabels';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
function fixture() {
  const session = new GameSession(71, { campaign: true, milestone: 'G2' }); session.start();
  const state = session.state;
  state.world = world; Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 750, hp: 100 });
  const target: Target = { id: 'focused-elite', role: 'elite', kind: 'single', x: 700, y: 500, radius: 30,
    hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, traits: ['CARAPACE'], tactic: 'melee' };
  state.targets = [target]; state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
  const input: InputFrame = { moveX: 0, moveY: 0, fire: false, scan: true, aim: { x: target.x, y: target.y } };
  return { session, state, target, input };
}

describe('visible immune focus order', () => {
  it('shows only the actual accepted priority target and never claims a bite', () => {
    const f = fixture(); expect(immuneFocusStatus(f.state)).toBe('');
    f.session.step(f.input);
    expect(immuneFocusView(f.state)?.target.id).toBe(f.target.id);
    expect(immuneFocusStatus(f.state)).toContain('围猎 晶壳精英');
    expect(immuneFocusStatus(f.state)).not.toMatch(/已命中|已清除|实伤/);
  });

  it('keeps the same simulation deadline while paused and clears terminal or invalid targets', () => {
    const f = fixture(); f.session.step(f.input);
    const text = immuneFocusStatus(f.state); f.state.phase = 'paused';
    expect(immuneFocusStatus(f.state)).toBe(text);
    f.state.elapsed = f.state.growth!.beacon!.focus!.until;
    expect(immuneFocusStatus(f.state)).toBe('');
    f.state.elapsed = 1 / 60; f.target.hp = 0;
    expect(immuneFocusView(f.state)).toBeNull();
    f.target.hp = 1000; f.state.phase = 'result';
    expect(immuneFocusStatus(f.state)).toBe('');
  });

  it('hides an order with no living squad or when its target has left the real activity zone', () => {
    const f = fixture(); f.session.step(f.input);
    const cells = f.state.growth!.cells!; f.state.growth!.cells = [];
    expect(immuneFocusStatus(f.state)).toBe('');
    f.state.growth!.cells = cells; f.target.x = 1300;
    expect(immuneFocusView(f.state)).toBeNull();
  });

  it('draws one command reticle and essential label without mutating any game state', () => {
    const f = fixture(); f.session.step(f.input);
    const before = JSON.stringify(f.state), methods: string[] = [], labels: SceneLabel[] = [];
    const ctx = new Proxy({}, { get: (_, name) => (..._args: unknown[]) => methods.push(String(name)), set: () => true }) as CanvasRenderingContext2D;
    drawImmuneFocus(ctx, f.state, { add: label => labels.push(label) });
    expect(methods).toContain('stroke'); expect(labels).toHaveLength(1);
    expect(labels[0].essential).toBe(true); expect(labels[0].lines[0].text).toContain('围猎');
    expect(JSON.stringify(f.state)).toBe(before);
  });
});
