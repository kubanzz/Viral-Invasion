import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession } from '../../src/game/session';
import { growthContext } from '../../src/game/growth';
import { summonImmuneCells } from '../../src/game/immuneCells';
import type { GameState } from '../../src/game/types';
import { GrowthVisuals } from '../../src/render/growthVisuals';
import { IMMUNE_TRACE_CUE_TICKS, selectImmuneTraceCues } from '../../src/render/immuneTraceCues';

const recordedPath = 'artifacts/feedback-v061/synergy-rerun2/g2-G2-RUN-06-legally-acqui-b6de1-search-a-fourth-and-replace-chrome/g2-trace-beacon-before-assert.json';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type Call = { method: string; args: unknown[] };
function canvas() {
  const calls: Call[] = [];
  const ctx = new Proxy({}, { get: (_object, method) => (...args: unknown[]) => calls.push({ method: String(method), args }), set: (_object, property, value) => { calls.push({ method: `set:${String(property)}`, args: [value] }); return true; } }) as CanvasRenderingContext2D;
  return { ctx, calls };
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
function fixture(): GameState {
  const state = new GameSession(771, { campaign: true, milestone: 'G2' }).snapshot();
  state.phase = 'playing'; state.tick = 300; state.elapsed = 5;
  const growth = state.growth!;
  growth.beacon = { id: `${growth.runId}:scan:280:beacon`, x: 400, y: 400, organId: 'heart', born: 280 / 60, until: 11, radius: 190, damage: 24, interval: .8, nextAttackAt: 4.8, tuning: 'balanced', mode: 'protocol' };
  growth.cells = summonImmuneCells(growth.beacon, { ...growthContext(state), elapsed: growth.beacon.born, tick: 280 });
  const cell = growth.cells[0], target = state.targets[0];
  target.x = 455; target.y = 395;
  state.events = [{ type: 'PROTOCOL_BEACON_HIT', tick: 295, data: { protocolId: 'IMMUNE_BEACON', rootId: `${cell.id}:bite:295`, cellId: cell.id, targetId: target.id, damage: 8, prioritizedTrace: true, x: 425, y: 385 } }];
  return state;
}

describe('actual-cell trace-hit feedback', () => {
  it('accepts the real v0.6.1 bite events missed by the old turret prefix, without mutating their recorded snapshot', () => {
    const raw = readFileSync(recordedPath, 'utf8'), recorded = JSON.parse(raw) as { snapshot: GameState };
    const state = recorded.snapshot, before = JSON.stringify(state); freeze(state);
    const cues = selectImmuneTraceCues(state);
    expect(cues).toHaveLength(2);
    for (const cue of cues) {
      const event = state.events.find(item => item.type === 'PROTOCOL_BEACON_HIT' && item.data.cellId === cue.cellId && item.data.prioritizedTrace === true)!;
      expect(event.data.rootId).toBe(`${cue.cellId}:bite:${event.tick}`);
      expect(String(event.data.rootId).startsWith(`${state.growth!.beacon!.id}:attack:`)).toBe(false);
      expect(cue.from).toEqual({ x: event.data.x, y: event.data.y });
      expect(cue.targetId).toBe(event.data.targetId);
    }
    const drawn = canvas(); new GrowthVisuals().drawProtocolHits(drawn.ctx, state, state.growth);
    expect(drawn.calls.some(call => call.method === 'lineTo')).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    const output = process.env.VI_TRACE_CUE_EVIDENCE;
    if (output) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify({ scope: 'Read-only selection and Canvas-call checks on an archived real browser snapshot; not a new browser run or full quality-mode visual review.', source: recordedPath, sourceSha256: hash(raw), snapshotBeforeSha256: hash(before), snapshotAfterSha256: hash(JSON.stringify(state)), snapshotTick: state.tick, cueTicks: IMMUNE_TRACE_CUE_TICKS, selectedCues: cues, selectedEvents: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && cues.some(cue => cue.cellId === event.data.cellId)), canvasCalls: drawn.calls, renderSources: Object.fromEntries(['src/render/immuneTraceCues.ts', 'src/render/growthVisuals.ts'].map(file => [file, hash(readFileSync(file))])) }, null, 2));
    }
  });

  it('uses the recorded bite position and live target identity, never the beacon or a later cell position', () => {
    const state = fixture(), event = state.events[0];
    state.growth!.cells![0].x = 550; state.growth!.cells![0].y = 500;
    const [cue] = selectImmuneTraceCues(state);
    expect(cue.from).toEqual({ x: 425, y: 385 });
    expect(cue.to).toEqual({ x: 455, y: 395 });
    expect(cue.progress).toBe(5 / IMMUNE_TRACE_CUE_TICKS);
    event.data.rootId = `${state.growth!.beacon!.id}:attack:295`;
    expect(selectImmuneTraceCues(state)).toEqual([]);
  });

  it('bounds evidence to 24 simulation ticks, rejects future/pre-spawn events and preserves paused cues', () => {
    const paused = fixture(); paused.phase = 'paused';
    expect(selectImmuneTraceCues(paused)).toHaveLength(1);
    paused.tick = 295 + IMMUNE_TRACE_CUE_TICKS - 1;
    expect(selectImmuneTraceCues(paused)).toHaveLength(1);
    paused.tick++;
    expect(selectImmuneTraceCues(paused)).toEqual([]);
    const future = fixture(); future.tick = 294;
    expect(selectImmuneTraceCues(future)).toEqual([]);
    const beforeSpawn = fixture(); beforeSpawn.tick = 280; beforeSpawn.events[0].tick = 279;
    beforeSpawn.events[0].data.rootId = `${beforeSpawn.growth!.cells![0].id}:bite:279`;
    expect(selectImmuneTraceCues(beforeSpawn)).toEqual([]);
  });

  it('rejects previous squads, departed organs, patrols and ended runs even while the old hit remains recent', () => {
    const changes: Array<(state: GameState) => void> = [
      state => { state.growth!.beacon!.id += ':next-squad'; },
      state => { state.growth!.cells![0].beaconId += ':old-squad'; },
      state => { state.growth!.cells![0].organId = 'lung'; },
      state => { state.battle!.organId = 'lung'; },
      state => { state.growth!.beacon!.mode = 'patrol'; },
      state => { state.growth!.ended = true; },
      state => { state.phase = 'result'; },
    ];
    for (const change of changes) { const state = fixture(); change(state); expect(selectImmuneTraceCues(state)).toEqual([]); }
  });

  it('does not invent a cue for expired cells/beacons, dead or absent targets, malformed origins or unmarked/zero-damage hits', () => {
    const changes: Array<(state: GameState) => void> = [
      state => { state.growth!.cells![0].until = state.elapsed; },
      state => { state.growth!.beacon!.until = state.elapsed; },
      state => { state.growth!.cells = []; },
      state => { state.targets[0].hp = 0; },
      state => { state.targets.shift(); },
      state => { state.events[0].data.x = '425'; },
      state => { state.events[0].data.y = NaN; },
      state => { state.events[0].data.prioritizedTrace = false; },
      state => { state.events[0].data.damage = 0; },
      state => { state.events[0].data.protocolId = 'BASE_PATROL'; },
    ];
    for (const change of changes) { const state = fixture(); change(state); expect(selectImmuneTraceCues(state)).toEqual([]); }
  });

  it('keeps only the latest real bite per cell rather than duplicating a burst of identical effects', () => {
    const state = fixture(), old = structuredClone(state.events[0]);
    const latest = structuredClone(old); latest.tick = 299; latest.data.rootId = `${latest.data.cellId}:bite:299`; latest.data.x = 426;
    state.events = [latest, old, structuredClone(latest)];
    const cues = selectImmuneTraceCues(state);
    expect(cues).toHaveLength(1); expect(cues[0].from.x).toBe(426); expect(cues[0].progress).toBe(1 / IMMUNE_TRACE_CUE_TICKS);
  });

  it('draws a short cell-to-target line plus shape cue without changing gameplay or depending on a quality toggle', () => {
    const state = fixture(), before = JSON.stringify(state); freeze(state);
    const first = canvas(), second = canvas(), visuals = new GrowthVisuals();
    visuals.drawProtocolHits(first.ctx, state, state.growth);
    visuals.drawProtocolHits(second.ctx, state, state.growth);
    expect(first.calls).toEqual(second.calls);
    expect(first.calls.filter(call => call.method === 'moveTo' && call.args[0] === 425 && call.args[1] === 385)).toHaveLength(2);
    expect(first.calls.some(call => call.method === 'moveTo' && call.args[0] === 400 && call.args[1] === 400)).toBe(false);
    expect(first.calls.filter(call => call.method === 'lineTo')).toHaveLength(6);
    expect(JSON.stringify(state)).toBe(before);
  });
});
