import { describe, expect, it } from 'vitest';
import { BALANCE, type GameState, type InputFrame } from '../../src/game/types';
import { GameSession } from '../../src/game/session';
import { approvedHeroAnimationClips, HeroAnimationController, requestedHeroAnimation, type HeroAnimationAsset } from '../../src/render/heroAnimation';
import { fixtureHeroAnimationAssets, type HeroAnimationFixtureAsset } from '../fixtures/heroAnimationAssets';

const input = (changes: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 700, y: 440 }, ...changes });
function controller(assets = fixtureHeroAnimationAssets()) { return new HeroAnimationController(approvedHeroAnimationClips(assets)); }
function session() { const game = new GameSession(71); game.start(); return game; }
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
function selectWithoutMutation(animation: HeroAnimationController, state: GameState) {
  const before = JSON.stringify(state), result = animation.select(state); expect(JSON.stringify(state)).toBe(before); return result;
}

describe('approved shared-canvas hero animation groups', () => {
  it('accepts only complete reviewed groups and preserves one source scale across changing body widths and heights', () => {
    const assets = fixtureHeroAnimationAssets(), before = JSON.stringify(assets); freeze(assets);
    const clips = approvedHeroAnimationClips(assets);
    expect(Object.keys(clips)).toEqual(['idle', 'walk', 'hurt', 'dash']);
    expect(Object.values(clips).map(clip => clip!.frames.length)).toEqual([4, 8, 2, 4]);
    for (const clip of Object.values(clips)) for (const frame of clip!.frames) {
      const source = assets[frame.id].sourceBounds;
      expect((frame.layout.bounds.bottom - frame.layout.bounds.top - 4) / source.height).toBeCloseTo(86 / 700, 10);
      expect((frame.layout.bounds.right - frame.layout.bounds.left - 4) / source.width).toBeCloseTo(86 / 700, 10);
    }
    const dash = clips.dash!.frames[1].layout;
    expect(dash.bounds.bottom - dash.bounds.top - 4).toBeCloseTo(550 * 86 / 700);
    expect(dash.bounds.bottom - dash.bounds.top - 4).not.toBeCloseTo(86);
    expect(JSON.stringify(assets)).toBe(before);
  });

  it('ignores canonical aliases and rejects duplicate or missing group members without disabling unrelated valid groups', () => {
    const assets: Record<string, HeroAnimationAsset> = fixtureHeroAnimationAssets();
    assets['hero.walk'] = { ...assets['hero.front_right.walk.00'], aliasOf: 'hero.front_right.walk.00' };
    expect(approvedHeroAnimationClips(assets).walk!.frames).toHaveLength(8);
    delete assets['hero.front_right.walk.07'];
    expect(approvedHeroAnimationClips(assets).walk).toBeUndefined(); expect(approvedHeroAnimationClips(assets).idle).toBeDefined();
    Object.assign(assets, fixtureHeroAnimationAssets());
    (assets['hero.front_right.walk.07'].animation as Record<string, unknown>).index = 6;
    expect(approvedHeroAnimationClips(assets).walk).toBeUndefined();
  });

  it.each([
    ['unapproved', (a: HeroAnimationFixtureAsset) => { a.animation.approved = false; }],
    ['missing declaration', (a: HeroAnimationFixtureAsset) => { delete (a.animation as Partial<typeof a.animation>).frameCount; }],
    ['inconsistent count', (a: HeroAnimationFixtureAsset) => { a.animation.frameCount = 7; }],
    ['inconsistent fps', (a: HeroAnimationFixtureAsset) => { a.animation.fps = 13; }],
    ['invalid fps', (a: HeroAnimationFixtureAsset) => { a.animation.fps = Infinity; }],
    ['different canvas', (a: HeroAnimationFixtureAsset) => { a.sourceSize.width = 1254; }],
    ['different foot anchor', (a: HeroAnimationFixtureAsset) => { a.pivot.y += .08; }],
    ['incomplete source bounds', (a: HeroAnimationFixtureAsset) => { delete (a.sourceBounds as Partial<typeof a.sourceBounds>).width; }],
  ] as const)('rejects an entire walk group with %s', (_name, mutate) => {
    const assets = fixtureHeroAnimationAssets(); mutate(assets['hero.front_right.walk.03']);
    const clips = approvedHeroAnimationClips(assets);
    expect(clips.walk).toBeUndefined(); expect(clips.idle).toBeDefined(); expect(clips.dash).toBeDefined();
  });

  it('requires the approved idle00 scale reference and never treats legacy shot/scan IDs as reviewed body sequences', () => {
    const assets: Record<string, HeroAnimationAsset> = fixtureHeroAnimationAssets();
    delete assets['hero.front_right.hurt.00'];
    assets['hero.shot'] = fixtureHeroAnimationAssets()['hero.front_right.hurt.00'];
    expect(approvedHeroAnimationClips(assets).hurt).toBeUndefined();
    expect(approvedHeroAnimationClips({ 'hero.shot': assets['hero.shot'] })).toEqual({});
    (assets['hero.front_right.idle.00'].animation as Record<string, unknown>).approved = false;
    expect(approvedHeroAnimationClips(assets)).toEqual({});
  });
});

describe('simulation-timed hero frame selection', () => {
  it('uses elapsed loop clocks, freezes a real paused walk despite moving=false, and resets on the same-seed restart', () => {
    const game = session(), animation = controller();
    game.step(input({ moveX: 1 })); expect(selectWithoutMutation(animation, game.state).index).toBe(0);
    for (let i = 0; i < 6; i++) game.step(input({ moveX: 1 }));
    const walk = selectWithoutMutation(animation, game.state); expect(walk.clip).toBe('walk'); expect(walk.index).toBe(1);
    game.pause(); expect(game.state.player.moving).toBe(false);
    expect(selectWithoutMutation(animation, game.state)).toBe(walk);
    game.step(input({ moveX: 1 })); expect(selectWithoutMutation(animation, game.state)).toBe(walk);
    game.resume(); game.step(input({ moveX: 1 })); expect(selectWithoutMutation(animation, game.state).clip).toBe('walk');
    const priorRun = game.state.runMetrics!.runId; game.restart(71);
    expect(game.state.runMetrics!.runId).not.toBe(priorRun);
    const restarted = selectWithoutMutation(animation, game.state); expect(restarted.id).toBe('hero.front_right.idle.00'); expect(restarted.index).toBe(0);
  });

  it('normalizes all four dash frames to the real .16s deadline, preserves aim mirroring and does not replay an older hurt after dash', () => {
    const assets = fixtureHeroAnimationAssets();
    for (const a of Object.values(assets)) if (a.animation.group.endsWith('.dash')) a.animation.fps = 1;
    const game = session(), animation = controller(assets), x = game.state.player.x;
    game.step(input({ moveX: 1, dash: true, practiceHit: true, aim: { x: 0, y: 0 } }));
    expect(game.state.player.x).toBeGreaterThan(x); expect(game.state.events.some(event => event.type === 'PLAYER_DASHED')).toBe(true);
    const start = game.state.elapsed;
    for (const [steps, expected] of [[0, 0], [3, 1], [3, 2], [3, 3]] as const) {
      for (let i = 0; i < steps; i++) game.step(input({ aim: { x: 0, y: 0 } }));
      const pose = selectWithoutMutation(animation, game.state);
      expect(pose.clip).toBe('dash'); expect(pose.index).toBe(expected); expect(pose.flipX).toBe(true); expect(pose.lift).toBe(0);
      expect(requestedHeroAnimation(game.state).duration).toBe(BALANCE.dashDuration);
    }
    game.step(input()); expect(game.state.elapsed - start).toBeGreaterThanOrEqual(.16);
    expect(game.state.player.hurtUntil).toBeGreaterThan(game.state.elapsed);
    expect(selectWithoutMutation(animation, game.state).clip).toBe('idle');
  });

  it('reacts only to new positive PLAYER_HURT events for .15s, supports repeated real hits, and ignores the longer feedback window', () => {
    const assets = fixtureHeroAnimationAssets();
    for (const a of Object.values(assets)) if (a.animation.group.endsWith('.hurt')) a.animation.fps = 1;
    const game = session(), animation = controller(assets); game.step(input({ practiceHit: true }));
    expect(selectWithoutMutation(animation, game.state).clip).toBe('hurt');
    for (let i = 0; i < 5; i++) game.step(input());
    expect(selectWithoutMutation(animation, game.state).index).toBe(1);
    game.step(input({ practiceHit: true })); expect(selectWithoutMutation(animation, game.state).index).toBe(0);
    for (let i = 0; i < 9; i++) game.step(input());
    expect(game.state.player.hurtUntil).toBeGreaterThan(game.state.elapsed);
    expect(selectWithoutMutation(animation, game.state).clip).toBe('idle');
    game.state.player.hp = 1; game.step(input({ practiceHit: true }));
    expect(game.state.events.at(-1)).toMatchObject({ type: 'PLAYER_HURT', data: { damage: 0 } });
    expect(selectWithoutMutation(animation, game.state).clip).toBe('idle');
  });

  it('falls back to the old clean idle/walk body when the requested action group is unavailable', () => {
    const assets = fixtureHeroAnimationAssets(); delete assets['hero.front_right.walk.07']; delete assets['hero.front_right.dash.03'];
    const animation = new HeroAnimationController(approvedHeroAnimationClips(assets)), game = session();
    game.step(input({ moveX: 1 })); expect(selectWithoutMutation(animation, game.state)).toMatchObject({ id: 'hero.walk', animated: false, clip: null });
    game.step(input({ moveX: 1, dash: true })); expect(selectWithoutMutation(animation, game.state)).toMatchObject({ id: 'hero.walk', animated: false });
    game.step(input()); expect(selectWithoutMutation(animation, game.state)).toMatchObject({ id: 'hero.idle', animated: false });
  });

  it('handles snapshot copies and time rollback without mutating serialized state or using a wall clock', () => {
    const animation = controller(), game = session(); game.step(input({ moveX: 1 }));
    let snapshot = game.snapshot(); freeze(snapshot); selectWithoutMutation(animation, snapshot);
    for (let i = 0; i < 12; i++) game.step(input({ moveX: 1 }));
    snapshot = game.snapshot(); freeze(snapshot);
    const frame = selectWithoutMutation(animation, snapshot); expect(frame.index).toBe(2);
    expect(selectWithoutMutation(animation, snapshot).id).toBe(frame.id);
    const rewind = game.snapshot(); rewind.elapsed -= .1; rewind.tick -= 6; freeze(rewind);
    expect(selectWithoutMutation(animation, rewind).index).toBe(0);
  });
});
