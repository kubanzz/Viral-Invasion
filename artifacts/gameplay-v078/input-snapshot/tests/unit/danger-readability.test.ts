import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { MotherCoreController } from '../../src/game/motherCore';
import type { MotherCoreAttack } from '../../src/game/motherCoreTypes';
import { activeWorld, type GameState, type Vec } from '../../src/game/types';
import { drawEncounterDangers, drawEncounterGround, drawEncounterSignals } from '../../src/render/encounterVisuals';
import { Renderer } from '../../src/render/renderer';
import { Camera } from '../../src/render/camera';
import type { SceneLabelSink } from '../../src/render/sceneLabels';

type Matrix = [number, number, number, number, number, number];
type Paint = { method: string; args: unknown[]; alpha: number; width: number; dash: number[]; matrix: Matrix; clipped: boolean };
type Caption = Parameters<SceneLabelSink['add']>[0];
type Rect = { left: number; right: number; top: number; bottom: number };
function recorder() {
  const paints: Paint[] = [], stack: Array<{ values: Record<string, unknown>; matrix: Matrix; dash: number[]; clips: number }> = [];
  let values: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, font: '10px sans-serif' };
  let matrix: Matrix = [1, 0, 0, 1, 0, 0], dash: number[] = [], clips = 0;
  const record = (method: string, args: unknown[] = []) => paints.push({ method, args, alpha: Number(values.globalAlpha), width: Number(values.lineWidth), dash: [...dash], matrix: [...matrix], clipped: clips > 0 });
  const multiply = (m: Matrix) => {
    const [a, b, c, d, e, f] = matrix, [g, h, i, j, k, l] = m;
    matrix = [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
  };
  const ctx = new Proxy({}, {
    get: (_target, key) => {
      if (key in values) return values[String(key)];
      if (key === 'save') return () => stack.push({ values: { ...values }, matrix: [...matrix], dash: [...dash], clips });
      if (key === 'restore') return () => { const saved = stack.pop(); if (!saved) throw new Error('Unbalanced Canvas restore'); ({ values, matrix, dash, clips } = saved); };
      if (key === 'clip') return (...args: unknown[]) => { clips++; record('clip', args); };
      if (key === 'setTransform') return (...args: Matrix) => { matrix = [...args]; record('setTransform', args); };
      if (key === 'translate') return (x: number, y: number) => multiply([1, 0, 0, 1, x, y]);
      if (key === 'scale') return (x: number, y: number) => multiply([x, 0, 0, y, 0, 0]);
      if (key === 'rotate') return (a: number) => multiply([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
      if (key === 'setLineDash') return (next: number[]) => { dash = [...next]; };
      if (key === 'measureText') return (text: string) => ({ width: [...text].length * 9, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 });
      if (String(key).startsWith('create')) return () => ({ addColorStop() {} });
      return (...args: unknown[]) => record(String(key), args);
    },
    set: (_target, key, value) => { values[String(key)] = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, paints, record, balanced: () => stack.length === 0 };
}
function sink() {
  const captions: Caption[] = [], protectedRects: Rect[] = [];
  const labels: SceneLabelSink = { add: label => captions.push(label), reserveWorld: rect => protectedRects.push(rect) };
  return { labels, captions, protectedRects };
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
function readSnapshot(path: string, pointer: string[] = []): GameState {
  let result = JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
  for (const key of pointer) result = result[key];
  return result as GameState;
}
function archivedCrisis(): GameState {
  return readSnapshot('artifacts/completion-v074/browser/full-1/output/encounters-v070-Formal-enc-8327f-real-stages-and-clean-retry-chrome/formal-evidence.json', ['milestones', 'impact']);
}
function essential(paints: Paint[]) { return paints.filter(p => ['ellipse', 'moveTo', 'lineTo', 'stroke', 'fillText', 'strokeText'].includes(p.method)).map(({ width: _width, ...paint }) => paint); }
function renderer(sample: ReturnType<typeof recorder>) {
  const makeCanvas = () => ({ width: 1366, height: 768, getContext: () => sample.ctx, getBoundingClientRect: () => ({ width: 1366, height: 768 }) }) as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1 });
  vi.stubGlobal('document', { createElement: makeCanvas, querySelector: () => null });
  const result = new Renderer(makeCanvas());
  sample.paints.length = 0;
  return result;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('essential danger presentation (recorded drawing, not human readability)', () => {
  it('preserves real archived source/tissue geometry, countdown, alpha and complete state in both modes', () => {
    const state = archivedCrisis(), before = JSON.stringify(state), crisis = state.campaign!.encounters!.crisis;
    const source = state.targets.find(target => target.id === crisis.sourceId)!;
    expect(crisis.status).toBe('charging'); expect(crisis.blockedByAirway).toBe(false);
    const dx = state.tissue.x - source.x, dy = state.tissue.y - source.y, distance = Math.hypot(dx, dy), ux = dx / distance, uy = dy / distance;
    freeze(state);
    const observations = [false, true].map(low => {
      const drawn = recorder(), labels = sink(); drawn.ctx.globalAlpha = .8;
      drawEncounterGround(drawn.ctx, state, low, labels.labels);
      expect(drawn.paints).toEqual([]);
      drawEncounterDangers(drawn.ctx, state, low, labels.labels);
      const circles = drawn.paints.filter(p => p.method === 'ellipse');
      expect(circles.map(p => p.args.slice(0, 4))).toEqual([
        [source.x, source.y, source.radius + 12, source.radius + 12],
        [state.tissue.x, state.tissue.y, state.tissue.radius + 22, state.tissue.radius + 22],
      ]);
      const path = drawn.paints.find(p => p.method === 'moveTo' && p.dash.join() === '6,15')!;
      expect(path.args).toEqual([source.x + ux * (source.radius + 15), source.y + uy * (source.radius + 15)]);
      const endpoint = drawn.paints.find(p => p.method === 'lineTo' && p.dash.join() === '6,15')!;
      expect(endpoint.args).toEqual([state.tissue.x - ux * (state.tissue.radius + 20), state.tissue.y - uy * (state.tissue.radius + 20)]);
      expect(path.alpha).toBeCloseTo(.8 * .58);
      expect(drawn.paints.filter(p => p.method === 'stroke' && p.alpha === .8 * .58)).toHaveLength(3); // path + two directional chevrons
      expect(circles.every(p => p.alpha === .8 && p.width === (low ? 1.5 : 1.7))).toBe(true);
      expect(labels.captions.map(c => c.lines[0].text)).toEqual([`冲击 ${crisis.chargeRemaining.toFixed(1)}s`, '危机源 · 净化可根治']);
      expect(labels.captions.every(c => c.priority === 100 && c.essential)).toBe(true);
      expect(labels.captions[0].anchor).toEqual(state.tissue);
      const camera = new Camera(1366, 768); camera.follow(state.player, activeWorld(state));
      const legacy = recorder(); camera.apply(legacy.ctx); drawEncounterDangers(legacy.ctx, state, low);
      for (const caption of labels.captions) {
        const projected = camera.worldToScreen(caption.anchor);
        const oldText = legacy.paints.find(p => p.method === 'fillText' && p.args[0] === caption.lines[0].text)!;
        // Compare preferred baselines before shared layout may deliberately
        // displace a caption around bodies/HUD. The world offset is squashed once.
        expect(projected.x + (caption.offset?.x ?? 0) * camera.scale).toBeCloseTo(oldText.matrix[4], 8);
        expect(projected.y + (caption.offset?.y ?? 0) * camera.scale).toBeCloseTo(oldText.matrix[5], 8);
      }
      expect(drawn.paints.some(p => p.method === 'fillText')).toBe(false); // deferred into the shared final label pass
      expect(labels.protectedRects.length).toBeGreaterThan(30);
      expect(labels.protectedRects.every(r => r.right > r.left && r.bottom > r.top && r.right - r.left < 50 && r.bottom - r.top < 50)).toBe(true);
      expect(drawn.ctx.globalAlpha).toBe(.8); expect(drawn.balanced()).toBe(true);
      return { paints: essential(drawn.paints), captions: labels.captions, protectedRects: labels.protectedRects };
    });
    expect(observations[0]).toEqual(observations[1]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('actually composites the real crisis after foreground/effects and defers its text to the final screen pass', () => {
    const state = readSnapshot('artifacts/completion-v074/browser/full-1/output/encounters-v070-Formal-enc-2953d-real-stages-and-clean-retry-chrome/formal-evidence.json', ['milestones', 'window']);
    const before = JSON.stringify(state); freeze(state);
    for (const low of [false, true]) {
      const drawn = recorder(), actual = renderer(drawn), crisis = state.campaign!.encounters!.crisis;
      const source = state.targets.find(target => target.id === crisis.sourceId)!;
      const stages = actual as unknown as Record<string, (...args: unknown[]) => void>;
      for (const name of ['drawForeground', 'drawEffects']) {
        const original = stages[name].bind(actual);
        vi.spyOn(stages, name).mockImplementation((...args: unknown[]) => { original(...args); drawn.record('stageEnd', [name]); });
      }
      actual.render(state, state.player, { lowEffects: low });
      const foreground = drawn.paints.findIndex(p => p.method === 'stageEnd' && p.args[0] === 'drawForeground');
      const effects = drawn.paints.findIndex(p => p.method === 'stageEnd' && p.args[0] === 'drawEffects');
      const sourceRing = drawn.paints.findIndex(p => p.method === 'ellipse' && p.args[0] === source.x && p.args[1] === source.y && p.args[2] === source.radius + 12);
      const countdown = drawn.paints.findIndex(p => p.method === 'fillText' && p.args[0] === `冲击 ${crisis.chargeRemaining.toFixed(1)}s`);
      expect(foreground).toBeGreaterThan(-1); expect(effects).toBeGreaterThan(foreground);
      expect(sourceRing).toBeGreaterThan(effects); expect(countdown).toBeGreaterThan(sourceRing);
      expect(drawn.paints[countdown].matrix).toEqual([1, 0, 0, 1, 0, 0]);
      expect(drawn.paints[sourceRing].alpha).toBeGreaterThan(0);
      expect(drawn.paints[sourceRing].clipped).toBe(false); expect(drawn.paints[countdown].clipped).toBe(false);
      expect(drawn.balanced()).toBe(true);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(['paused', 'airway', 'arming', 'exhausted', 'short-path', 'dead', 'other-organ', 'result'] as const)('uses legitimate %s guards in explicit synthetic variants of an archived state', variant => {
    const state = archivedCrisis(), crisis = state.campaign!.encounters!.crisis, source = state.targets.find(t => t.id === crisis.sourceId)!;
    if (variant === 'paused') state.phase = 'paused';
    if (variant === 'airway') crisis.blockedByAirway = true;
    if (variant === 'arming') { crisis.status = 'arming'; crisis.nextImpactAt = null; }
    if (variant === 'exhausted') crisis.status = 'exhausted';
    if (variant === 'short-path') { source.x = state.tissue.x; source.y = state.tissue.y; }
    if (variant === 'dead') source.hp = 0;
    if (variant === 'other-organ') crisis.organId = 'heart';
    if (variant === 'result') state.phase = 'result';
    const before = JSON.stringify(state); freeze(state);
    for (const low of [false, true]) {
      const drawn = recorder(), labels = sink(); drawEncounterDangers(drawn.ctx, state, low, labels.labels);
      const texts = labels.captions.flatMap(c => c.lines.map(l => l.text));
      if (['dead', 'other-organ', 'result'].includes(variant)) { expect(drawn.paints).toEqual([]); expect(texts).toEqual([]); }
      else if (variant === 'exhausted') { expect(texts).toEqual(['冲击停止 · 净化危机源']); expect(drawn.paints.filter(p => p.method === 'ellipse')).toHaveLength(1); }
      else if (variant === 'short-path') expect(texts).toEqual(['危机源 · 净化可根治']);
      else expect(texts).toContain(variant === 'airway' ? '截流暂停' : '冲击暂停');
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains a real dead mother’s pending split at every actual landing in both production effect modes', () => {
    const state = readSnapshot('artifacts/completion-v074/browser/full-1/output/g4-acceptance-gaps-RUN04-g-d3ac8-area-clear-no-grandchildren-chrome/run04-lineage.json', ['checkpoints', 'motherKilled']);
    const parent = state.targets.find(t => t.hp === 0 && t.splitAt! > state.elapsed)!;
    expect(parent.splitPositions).toHaveLength(2); const before = JSON.stringify(state); freeze(state);
    for (const low of [false, true]) {
      const drawn = recorder(), actual = renderer(drawn), requests: Caption[] = [];
      const labels = (actual as unknown as { labels: SceneLabelSink }).labels, add = labels.add.bind(labels);
      vi.spyOn(labels, 'add').mockImplementation(caption => { requests.push(caption); add(caption); });
      actual.render(state, state.player, { lowEffects: low });
      for (const [index, landing] of parent.splitPositions!.entries()) {
        expect(drawn.paints.some(p => p.method === 'ellipse' && p.args.slice(0, 4).join() === [landing.x, landing.y, 18, 18].join() && p.dash.join() === '3,4' && p.alpha > 0)).toBe(true);
        const request = requests.find(c => c.id === `split:${parent.id}:${index}`)!;
        expect(request.anchor).toEqual(landing);
        const anchor = actual.camera.worldToScreen(landing), legacyBaseline = actual.camera.worldToScreen({ x: landing.x, y: landing.y - 25 });
        expect(anchor.y + request.offset!.y * actual.camera.scale).toBeCloseTo(legacyBaseline.y, 8);
        const placed = actual.diagnostics(state).labels.placements.find(p => p.id === request.id);
        if (placed) expect(placed.anchor).toEqual(anchor); // Layout may move text; its true world landing stays fixed.
      }
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains every real serialized ordinary windup with its circle, inner dash, progress and X in both production modes', () => {
    const state = readSnapshot('artifacts/completion-v074/performance/attempt-1/dense-standard-state.json');
    const threats = state.targets.filter(t => t.hp > 0 && t.attackAim && t.attackAt! > state.elapsed);
    expect(threats).toHaveLength(4); const before = JSON.stringify(state); freeze(state);
    const modes = [false, true].map(low => {
      const drawn = recorder(), actual = renderer(drawn);
      const stages = actual as unknown as Record<string, (...args: unknown[]) => void>, original = stages.drawBattleDangers.bind(actual);
      vi.spyOn(stages, 'drawBattleDangers').mockImplementation((...args: unknown[]) => { drawn.record('stageStart', ['drawBattleDangers']); original(...args); drawn.record('stageEnd', ['drawBattleDangers']); });
      actual.render(state, state.player, { lowEffects: low });
      const dangerStart = drawn.paints.findIndex(p => p.method === 'stageStart' && p.args[0] === 'drawBattleDangers');
      const dangerEnd = drawn.paints.findIndex(p => p.method === 'stageEnd' && p.args[0] === 'drawBattleDangers');
      const dangers = drawn.paints.slice(dangerStart, dangerEnd);
      return threats.map(target => {
        const aim = target.attackAim!, radius = target.attackRadius ?? BATTLE_BALANCE.attackRadius;
        const circles = dangers.filter(p => p.method === 'ellipse' && p.args.slice(0, 4).join() === [aim.x, aim.y, radius, radius].join());
        // Several enemies can share an aim point: retain the actual multiplicity,
        // and match each real countdown arc instead of always choosing the first.
        const sameAim = threats.filter(t => t.attackAim!.x === aim.x && t.attackAim!.y === aim.y && (t.attackRadius ?? BATTLE_BALANCE.attackRadius) === radius);
        expect(circles).toHaveLength(sameAim.length);
        const progress = 1 - Math.max(0, Math.min(1, (target.attackAt! - state.elapsed) / BATTLE_BALANCE.attackWindup));
        const cue = dangers;
        expect(cue.some(p => p.method === 'ellipse' && p.args.slice(0, 4).join() === [aim.x, aim.y, radius * .76, radius * .76].join() && p.dash.join() === '4,5')).toBe(true);
        expect(cue.some(p => p.method === 'arc' && p.args.slice(0, 4).join() === [aim.x, aim.y, radius + 5, -Math.PI / 2].join() && Math.abs(Number(p.args[4]) - (-Math.PI / 2 + Math.PI * 2 * progress)) < 1e-8)).toBe(true);
        for (const [from, to] of [ [[aim.x - 5, aim.y - 4], [aim.x + 5, aim.y + 4]], [[aim.x - 5, aim.y + 4], [aim.x + 5, aim.y - 4]] ]) {
          expect(cue.some(p => p.method === 'moveTo' && p.args.join() === from.join())).toBe(true);
          expect(cue.some(p => p.method === 'lineTo' && p.args.join() === to.join())).toBe(true);
        }
        expect(cue.filter(p => ['ellipse', 'arc', 'stroke'].includes(p.method)).every(p => p.alpha > 0 && !p.clipped)).toBe(true);
        return cue;
      });
    });
    expect(modes[0]).toEqual(modes[1]); expect(JSON.stringify(state)).toBe(before);
  });

  it.each(['crystal-sweep', 'fission-burst', 'corrosion', 'brood'] as const)('preserves serialized %s warning geometry in both production modes (synthetic mechanism fixture)', kind => {
    const state = new GameSession(130026, { campaign: true, milestone: 'G3' }).snapshot();
    state.phase = 'playing'; state.elapsed = 5; state.tick = 300;
    const combat = new MotherCoreController({ coreId: 'core', organId: 'heart', traits: ['CARAPACE', 'FISSION'], tick: 0, elapsed: 0 }).state;
    combat.phase = 'windup'; combat.attack = { id: 'attack', kind, trait: 'CARAPACE', startedAt: 4.5, resolveAt: 5.7,
      origin: { x: 730, y: 230 }, aim: { x: 780, y: 610 }, angle: Math.PI / 2, range: 310, halfAngle: .65,
      radius: 88, landings: [{ x: 690, y: 430 }, { x: 840, y: 430 }] } satisfies MotherCoreAttack;
    state.campaign!.core.combat = combat;
    const before = JSON.stringify(state); freeze(state);
    const output = [false, true].map(low => {
      const drawn = recorder(), actual = renderer(drawn); actual.render(state, state.player, { lowEffects: low });
      if (kind === 'crystal-sweep') {
        const originIndex = drawn.paints.findIndex(p => p.method === 'moveTo' && p.args[0] === combat.attack!.origin.x && p.args[1] === combat.attack!.origin.y);
        expect(originIndex).toBeGreaterThan(-1);
        const end = drawn.paints.findIndex((p, i) => i > originIndex && p.method === 'closePath');
        const vertices = drawn.paints.slice(originIndex + 1, end).filter(p => p.method === 'lineTo');
        expect(vertices).toHaveLength(65); expect(vertices.every(p => p.alpha > 0)).toBe(true);
        return vertices;
      }
      const centers: Vec[] = kind === 'brood' ? combat.attack!.landings : [combat.attack!.aim];
      return centers.map(center => {
        const circle = drawn.paints.find(p => p.method === 'ellipse' && p.args.slice(0, 4).join() === [center.x, center.y, 88, 88].join());
        expect(circle).toBeDefined(); expect(circle!.alpha).toBeGreaterThan(0);
        return circle;
      });
    });
    expect(output[0]).toEqual(output[1]); expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps the compatibility entry point equivalent to separate ground/danger calls', () => {
    const state = archivedCrisis(), combined = recorder(), separated = recorder();
    drawEncounterSignals(combined.ctx, state, true);
    drawEncounterGround(separated.ctx, state, true); drawEncounterDangers(separated.ctx, state, true);
    expect(combined.paints).toEqual(separated.paints);
  });
});
