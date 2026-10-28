import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLegalPosition } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import type { GameState, Vec } from '../../src/game/types';
import { CanvasScene } from '../../src/render/canvasScene';
import { aimedPaintedTool, paintedToolMuzzle, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';
import { toolFeedback } from '../../src/render/toolFeedback';

const art = JSON.parse(readFileSync('.art-generated/art-runtime.json', 'utf8')) as { assets: Record<string, SourceRegisteredSpriteAsset> };
const emitter = art.assets['weapon.emitter.painted'];

function shoot(position: Vec, aim: Vec, targetX?: number) {
  const session = new GameSession(31); session.start();
  Object.assign(session.state.player, position);
  expect(isLegalPosition(session.state.player, session.state.player.radius)).toBe(true);
  if (targetX !== undefined) {
    const target = session.state.targets[0];
    Object.assign(target, { x: targetX, y: position.y, hp: 100, radius: 22 });
    session.state.targets = [target];
  } else session.state.targets = [];
  session.step({ moveX: 0, moveY: 0, tool: 1, fire: true, aim });
  const state = session.state, beam = state.effects.find(effect => effect.kind === 'beam')!;
  expect(beam).toBeDefined();
  const recoil = (toolFeedback(state)?.strength ?? 0) * 4;
  const point = { x: state.player.x - Math.cos(state.player.facing) * recoil, y: state.player.y - Math.sin(state.player.facing) * recoil };
  const tool = aimedPaintedTool(emitter, point, state.player.facing)!;
  const muzzle = paintedToolMuzzle(emitter, tool)!;
  return { state, beam, origin: { x: muzzle.x, y: muzzle.y / .72 } };
}

function draw(state: GameState, origin: Vec, low: boolean, scale = 1) {
  let strokes = 0, antibodies = 0;
  let translation: Vec = { x: 0, y: 0 };
  const contacts: { position: Vec; radius: number }[] = [], colors: string[] = [];
  const ctx = { globalAlpha: 1, strokeStyle: '', lineWidth: 1, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; },
    translate(x: number, y: number) { translation = { x, y }; }, scale() {},
    ellipse(_x: number, _y: number, radius: number) { contacts.push({ position: { ...translation }, radius }); }, fill() {} } as unknown as CanvasRenderingContext2D;
  ctx.stroke = function () { strokes++; colors.push(String(ctx.strokeStyle)); };
  const scene = Object.create(CanvasScene.prototype) as CanvasScene;
  Object.assign(scene, { art: { effectOrigin: () => origin }, camera: { scale }, drawAntibody: () => { antibodies++; } });
  (scene as unknown as { drawEffects(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void }).drawEffects(ctx, { ...state, effects: state.effects.filter(effect => effect.kind === 'beam') }, low);
  return { strokes, antibodies, contacts, colors };
}

function expectContact(result: ReturnType<typeof draw>, point: Vec, scale = 1) {
  expect(result.strokes).toBe(2);
  expect(result.antibodies).toBe(0);
  expect(result.colors).toEqual(['#42303a', '#ffe4a4']);
  expect(result.contacts).toEqual([{ position: point, radius: 7 / scale }, { position: point, radius: 7 / scale }]);
}

describe('short primary beams at the painted muzzle', () => {
  it.each(Array.from({ length: 8 }, (_, i) => i * Math.PI / 4))('suppresses a backwards wall beam at angle %s', angle => {
    const position = { x: 440 - Math.cos(angle) * 66, y: 295 - Math.sin(angle) * 66 };
    const result = shoot(position, { x: position.x + Math.cos(angle) * 300, y: position.y + Math.sin(angle) * 300 });
    const { beam, state, origin } = result;
    expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeCloseTo(19, 5);
    const before = JSON.stringify(state);
    for (const low of [false, true]) expectContact(draw(state, origin, low), beam.to);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('suppresses a backwards close-target beam without changing its hit', () => {
    const result = shoot({ x: 330, y: 440 }, { x: 600, y: 440 }, 379);
    expect(result.state.events.some(event => event.type === 'TARGET_HIT')).toBe(true);
    expect(result.beam.to.x).toBeCloseTo(357);
    for (const low of [false, true]) expectContact(draw(result.state, result.origin, low), result.beam.to);
  });

  it('does not imply a contact when a real shot is aimed at its own origin', () => {
    const result = shoot({ x: 330, y: 440 }, { x: 330, y: 440 });
    expect(result.beam.to).toEqual(result.beam.from);
    expect(result.state.events.find(event => event.type === 'TOOL_FIRED')?.data.hit).toBe(false);
    expect(result.state.events.some(event => event.type === 'TARGET_HIT')).toBe(false);
    for (const low of [false, true]) expect(draw(result.state, result.origin, low))
      .toEqual({ strokes: 0, antibodies: 0, contacts: [], colors: [] });
  });

  it('keeps a real zero-length target hit without drawing an invented surface contact', () => {
    const result = shoot({ x: 330, y: 440 }, { x: 330, y: 440 }, 330);
    expect(result.beam.to).toEqual(result.beam.from);
    expect(result.state.events.find(event => event.type === 'TOOL_FIRED')?.data.hit).toBe(true);
    expect(result.state.events.some(event => event.type === 'TARGET_HIT')).toBe(true);
    expect(result.state.effects.some(effect => effect.kind === 'hit')).toBe(true);
    for (const low of [false, true]) expect(draw(result.state, result.origin, low))
      .toEqual({ strokes: 0, antibodies: 0, contacts: [], colors: [] });
  });

  it('keeps the contact size consistent at different camera scales', () => {
    const result = shoot({ x: 330, y: 440 }, { x: 600, y: 440 }, 379);
    for (const scale of [.25, .5, 1, 2]) expectContact(draw(result.state, result.origin, true, scale), result.beam.to, scale);
  });

  it('keeps ordinary forward beams and the original origin fallback', () => {
    const result = shoot({ x: 330, y: 440 }, { x: 800, y: 440 });
    for (const low of [false, true]) {
      expect(draw(result.state, result.origin, low)).toEqual({ strokes: 2, antibodies: 1, contacts: [], colors: ['#8bece455', '#e8fff1'] });
      expect(draw(result.state, result.beam.from, low)).toEqual({ strokes: 2, antibodies: 1, contacts: [], colors: ['#8bece455', '#e8fff1'] });
    }
  });
});
