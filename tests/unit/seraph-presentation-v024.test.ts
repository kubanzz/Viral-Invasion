import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../../src/game/types';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import { legionPaintedPose } from '../../src/render/legionPresentation';
import { SeraphVfx, seraphCue, SERAPH_VFX_BUDGET } from '../../src/render/seraphVfx';
import { MotionInterpolation } from '../../src/render/motionInterpolation';

const cell = (id = 'commander'): ImmuneCellState => ({ id, beaconId: 'beacon', organId: 'heart', x: 100, y: 100,
  born: 0, until: 100, hp: 100, radius: 18, facing: 0, damage: 10, interval: 1, updatedAt: 1,
  attackReadyAt: 10, attackUntil: 0, targetId: 'enemy', activity: 'guarding', navigationAt: 0, waypoint: null,
  legionId: 'seraph', legionRole: 'leader', seraphRole: 'commander' });
const event = (kind: string, tick = 60, data: GameEvent['data'] = {}): GameEvent => ({ type: `LEGION_SERAPH_${kind}`, tick,
  data: { actionId: 'action', cellId: 'commander', role: 'commander', fromX: 100, fromY: 100, x: 180, y: 100,
    targetId: 'enemy', part: 0, sequence: 1, ...data } });
function state(events: GameEvent[] = [], cells = [cell()], tick = 60): GameState {
  return { seed: 71, tick, elapsed: tick / 60, visualTime: tick / 60, phase: 'playing', player: { hp: 100, x: 300, y: 300, radius: 20 },
    events, targets: [], battle: { organId: 'heart' }, growth: { runId: 'test-run', cells } } as unknown as GameState;
}
function canvas() {
  const strokes: { color: string; path: { name: string; args: number[] }[] }[] = [];
  const stack: { alpha: number; stroke: string; width: number }[] = [];
  let path: { name: string; args: number[] }[] = [];
  const ctx = { globalAlpha: 1, strokeStyle: '', lineWidth: 1,
    save() { stack.push({ alpha: this.globalAlpha, stroke: this.strokeStyle, width: this.lineWidth }); },
    restore() { const s = stack.pop()!; this.globalAlpha = s.alpha; this.strokeStyle = s.stroke; this.lineWidth = s.width; },
    translate() {}, scale() {}, rotate() {}, beginPath() { path = []; },
    moveTo(...args: number[]) { path.push({ name: 'move', args }); }, lineTo(...args: number[]) { path.push({ name: 'line', args }); },
    quadraticCurveTo(...args: number[]) { path.push({ name: 'curve', args }); }, arc(...args: number[]) { path.push({ name: 'arc', args }); },
    closePath() { path.push({ name: 'close', args: [] }); },
    stroke() { strokes.push({ color: this.strokeStyle, path: structuredClone(path) }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, stack };
}
function modernAssets() {
  const assets: Record<string, unknown> = {};
  for (const role of ['commander', 'lancer', 'prism']) for (const view of ['front', 'back']) for (const action of ['idle', 'move', 'attack']) {
    const group = `seraph24.${role}.${view}.${action}`, count = action === 'idle' ? 2 : 4;
    for (let index = 0; index < count; index++) assets[`${group}.${String(index).padStart(2, '0')}`] = {
      width: 512, height: 512, pivot: { x: .5, y: .85 }, visibleBounds: { x: 60, y: 60, width: 390, height: index ? 370 : 380 },
      sourceSize: { width: 512, height: 512 }, sourceBounds: { x: 60, y: 60, width: 390, height: index ? 370 : 380 },
      animation: { group, index, frameCount: count, fps: action === 'idle' ? 4 : 10, approved: true },
    };
  }
  return assets;
}

describe('v0.24 authoritative Seraph presentation', () => {
  it('requires accepted positive damage for impact and keeps three prism receipts as three actual rays in low effects', () => {
    expect(seraphCue(event('HIT', 60, { damage: 0 }))).toBeUndefined();
    expect(seraphCue(event('HIT', 60, { damage: -1 }))).toBeUndefined();
    expect(seraphCue(event('HIT', 60, { damage: 10, x: NaN }))).toBeUndefined();
    const events = [0, 1, 2].map(part => event('RELEASED', 60, { role: 'prism', part, x: 180 + part * 20, y: 100 + part * 10 }));
    const game = state(events), before = JSON.stringify(game), vfx = new SeraphVfx(), paint = canvas();
    vfx.draw(paint.ctx, game, true);
    expect(vfx.diagnostics().byKind).toEqual({ release: 3 });
    expect(paint.strokes).toHaveLength(6); // one colored stroke and one white core per accepted ray
    for (let part = 0; part < 3; part++) expect(paint.strokes[part * 2].path.at(-1)).toEqual({ name: 'line', args: [180 + part * 20, 100 + part * 10 - 14 / .72] });
    expect(paint.stack).toHaveLength(0); expect(JSON.stringify(game)).toBe(before);
  });
  it('retains a bus-delivered hit before a crowded ordinary log, deduplicates it and enforces fixed draw budgets', () => {
    const vfx = new SeraphVfx(), hit = event('HIT', 60, { damage: 12 });
    vfx.accept(hit);
    const noise = Array.from({ length: 512 }, () => ({ type: 'TARGET_MOVED', tick: 60, data: {} }));
    const game = state(noise), paint = canvas(); vfx.draw(paint.ctx, game);
    expect(vfx.diagnostics()).toMatchObject({ active: 1, accepted: 1, scanned: 64, drawn: 1, byKind: { hit: 1 } });
    vfx.accept({ ...hit, tick: 61 }); vfx.draw(paint.ctx, { ...game, tick: 61, elapsed: 61 / 60, visualTime: 61 / 60 });
    expect(vfx.diagnostics().accepted).toBe(1);
    for (let n = 0; n < 100; n++) vfx.accept(event('HIT', 61, { damage: 8, actionId: `burst-${n}` }));
    expect(vfx.diagnostics().queued).toBe(SERAPH_VFX_BUDGET.pending);
    vfx.draw(paint.ctx, { ...game, tick: 62, elapsed: 62 / 60, visualTime: 62 / 60 }, true);
    expect(vfx.diagnostics().active).toBe(SERAPH_VFX_BUDGET.active);
    expect(vfx.diagnostics().drawn).toBe(SERAPH_VFX_BUDGET.lowActive);
    expect(vfx.diagnostics().dropped).toBeGreaterThan(0);
  });
  it('retains receipts ahead of real MotionInterpolation time, draws each once when due and keeps pending cues frozen on pause', () => {
    const vfx = new SeraphVfx(), motion = new MotionInterpolation(), game = state([], [cell()], 59);
    delete game.visualTime;
    const hit = event('HIT', 60, { damage: 10 });
    motion.step(game, () => { game.tick = 60; game.elapsed = 1; game.events.push(hit); vfx.accept(hit); });
    const before = JSON.stringify(game), early = motion.present(game, .5);
    expect(early.visualTime).toBeLessThan(1); vfx.draw(canvas().ctx, early);
    expect(vfx.diagnostics()).toMatchObject({ accepted: 1, active: 0, queued: 1 });
    game.phase = 'paused'; vfx.draw(canvas().ctx, motion.present(game, 1));
    expect(vfx.diagnostics()).toMatchObject({ accepted: 1, active: 0, queued: 1 });
    game.phase = 'playing';
    // No simulation step is needed to consume a pending receipt once the
    // displayed timestamp reaches it; a second draw cannot instantiate it again.
    vfx.draw(canvas().ctx, motion.present(game, 1));
    expect(vfx.diagnostics()).toMatchObject({ accepted: 1, active: 1, queued: 0, byKind: { hit: 1 } });
    vfx.draw(canvas().ctx, motion.present(game, 1)); expect(vfx.diagnostics().active).toBe(1);
    expect(JSON.stringify(game)).toBe(before);
    const second = event('RELEASED', 61, { actionId: 'second' });
    motion.step(game, () => { game.tick = 61; game.elapsed = 61 / 60; game.events.push(second); vfx.accept(second); });
    vfx.draw(canvas().ctx, motion.present(game, .5)); expect(vfx.diagnostics()).toMatchObject({ active: 1, queued: 1 });
    motion.step(game, () => { game.tick = 62; game.elapsed = 62 / 60; });
    vfx.draw(canvas().ctx, motion.present(game, .5));
    expect(vfx.diagnostics()).toMatchObject({ active: 2, queued: 0, byKind: { hit: 1, release: 1 } });
  });
  it('shows a finite commander cleave arc even when its actual release starts and ends at the same point', () => {
    for (const low of [false, true]) {
      const vfx = new SeraphVfx(), paint = canvas();
      const cue = event('RELEASED', 60, { attack: 'cleave', x: 100, y: 100 });
      vfx.draw(paint.ctx, state([{ type: 'RUN_STARTED', tick: 0, data: {} }, cue]), low);
      const arcs = paint.strokes.flatMap(stroke => stroke.path.filter(part => part.name === 'arc'));
      expect(arcs).toHaveLength(low ? 2 : 4);
      expect(arcs.every(arc => arc.args[2] >= 24 && arc.args[2] <= 42)).toBe(true);
      expect(vfx.diagnostics().byKind).toEqual({ release: 1 });
      vfx.draw(canvas().ctx, state([], [cell()], 76), low); expect(vfx.diagnostics().active).toBe(0);
    }
  });
  it('freezes the exact effect frame on pause and clears it for death, camp, organ and run changes', () => {
    const hit = event('HIT', 60, { damage: 10 }), vfx = new SeraphVfx(), game = state([hit]);
    const first = canvas(); vfx.draw(first.ctx, game);
    const frozen = canvas(); vfx.draw(frozen.ctx, { ...game, phase: 'paused', visualTime: 100 });
    expect(frozen.strokes).toEqual(first.strokes); expect(vfx.diagnostics().clock).toBe(1);
    const resumed = canvas(); vfx.draw(resumed.ctx, game); expect(resumed.strokes).toEqual(first.strokes);
    vfx.draw(canvas().ctx, { ...game, player: { ...game.player, hp: 0 } });
    expect(vfx.diagnostics()).toMatchObject({ active: 0, queued: 0, scope: { cleared: true, reason: 'death' } });
    vfx.draw(canvas().ctx, { ...game, tick: 61, elapsed: 61 / 60, visualTime: 61 / 60 });
    expect(vfx.diagnostics().active).toBe(0);
    for (const changed of [{ ...game, camp: {} }, { ...game, battle: { organId: 'lung' } }, { ...game, seed: 72 }]) {
      const separate = new SeraphVfx(); separate.draw(canvas().ctx, game);
      separate.draw(canvas().ctx, changed as GameState);
      expect(separate.diagnostics().active).toBe(0);
    }
  });
  it('samples only actual echo travel, bounds its history and stops the trail when its source dies', () => {
    const echo = { ...cell(), echo: true }, vfx = new SeraphVfx(), game = state([], [echo]);
    for (let n = 0; n < 20; n++) {
      game.tick = 60 + n * 6; game.elapsed = game.visualTime = game.tick / 60;
      vfx.draw(canvas().ctx, game);
    }
    const still = canvas(); vfx.draw(still.ctx, game); expect(still.strokes).toHaveLength(0);
    for (let n = 0; n < 10; n++) {
      game.tick += 6; game.elapsed = game.visualTime = game.tick / 60; echo.x += 5;
      vfx.draw(canvas().ctx, game);
    }
    expect(vfx.diagnostics().echoSamples).toBe(SERAPH_VFX_BUDGET.echoSamples);
    const moving = canvas(); vfx.draw(moving.ctx, game); expect(moving.strokes).toHaveLength(2);
    echo.hp = 0; vfx.draw(canvas().ctx, game); expect(vfx.diagnostics().echoBodies).toBe(0);
  });
  it('uses approved complete role families, fixed reference scale and authoritative phase frames', () => {
    const assets = modernAssets(), actor = cell();
    const phase = (kind: 'windup' | 'release' | 'recover', elapsed: number) => {
      actor.seraphAction = { actionId: 'action', kind: 'thrust', phase: kind, startedAt: 1, phaseStartedAt: 1, until: 2,
        targetId: 'enemy', origin: actor, aim: { x: 180, y: 100 }, direction: { x: 1, y: 0 }, part: 0, sequence: 1, strong: false, damage: 10, traveled: 0 };
      return legionPaintedPose(assets, actor, elapsed)!;
    };
    expect(phase('windup', 1.1).id).toBe('seraph24.commander.front.attack.00');
    expect(phase('windup', 1.8).id).toBe('seraph24.commander.front.attack.01');
    const release = phase('release', 1.1), recover = phase('recover', 1.8);
    expect(release.id).toBe('seraph24.commander.front.attack.02'); expect(recover.id).toBe('seraph24.commander.front.attack.03');
    expect(release.sourceScale).toBe(recover.sourceScale); expect(release.height).toBe(72);
    actor.seraphAction!.kind = 'cleave'; actor.seraphAction!.phaseStartedAt = 1; actor.seraphAction!.releaseTick = 60;
    expect(legionPaintedPose(assets, actor, 1.079)?.id).toBe('seraph24.commander.front.attack.02');
    expect(legionPaintedPose(assets, actor, 1.08)?.id).toBe('seraph24.commander.front.attack.03');
    const pausedPose = legionPaintedPose(assets, actor, 1.079);
    expect(legionPaintedPose(assets, actor, 1.079)).toEqual(pausedPose);
    actor.seraphRole = 'prism'; expect(legionPaintedPose(assets, actor, 1.8)?.height).toBe(58);
    actor.seraphAction = undefined; actor.attackUntil = 0;
    expect(legionPaintedPose(assets, actor, 20)?.id).toContain('.idle.');
    const unapproved = structuredClone(assets) as Record<string, { animation: { approved: boolean } }>;
    unapproved['seraph24.prism.back.attack.03'].animation.approved = false;
    expect(legionPaintedPose(unapproved, actor, 20)).toBeUndefined();
    delete (assets as Record<string, unknown>)['seraph24.lancer.back.attack.03'];
    actor.seraphRole = 'lancer'; expect(legionPaintedPose(assets, actor, 20)).toBeUndefined();
    actor.seraphRole = 'commander'; actor.hp = 0; expect(legionPaintedPose(assets, actor, 1.079)).toBeUndefined();
  });
  it('does not replay a completed modern release during the old bite-clock tail and keeps genuine legacy compatibility', () => {
    const assets = modernAssets(), actor = cell();
    actor.attackUntil = 1.24; actor.activity = 'biting'; actor.seraphAction = undefined;
    expect(legionPaintedPose(assets, actor, 1.16)?.id).toContain('.idle.');
    expect(legionPaintedPose(assets, actor, 1.18)?.id).toContain('.idle.');
    actor.activity = 'returning'; expect(legionPaintedPose(assets, actor, 1.18)?.id).toContain('.move.');
    const old: Record<string, unknown> = { 'sanctum.seraph.leader.front': { sourceBounds: { height: 400 } } };
    for (let n = 0; n < 4; n++) old[`sanctum.seraph.leader.front.attack.0${n}`] = {};
    actor.seraphRole = undefined; actor.activity = 'biting';
    expect(legionPaintedPose(old, actor, 1.16)?.id).toContain('.attack.');
  });
});
