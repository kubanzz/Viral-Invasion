import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { activeEliteTacticCycle, createEliteTacticCycle } from '../../src/game/eliteTacticCycle';
import type { TraitId } from '../../src/game/battleTypes';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const pairs: [TraitId, TraitId][] = [['CARAPACE', 'FISSION'], ['CARAPACE', 'MIMIC'], ['FISSION', 'CARAPACE'],
  ['FISSION', 'MIMIC'], ['MIMIC', 'CARAPACE'], ['MIMIC', 'FISSION']];
const tacticFor = { CARAPACE: 'crystal-charge', FISSION: 'fission-burst', MIMIC: 'mimic-corrosion' } as const;

// Explicit attack-transaction fixtures; spawn counts and natural difficulty are qualified separately.
function fixture(traits: [TraitId, TraitId] = ['FISSION', 'MIMIC']) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
  s.world = structuredClone(world); Object.assign(s.player, { x: 1100, y: 700 }); Object.assign(s.tissue, { x: 1200, y: 1000, hp: 100 });
  s.growth!.cells = []; s.growth!.beacon = null; s.growth!.ended = true;
  Object.assign(s.endless!, { wave: 20, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const target: Target = { id: 'duet-elite', x: 700, y: 700, hp: 204, maxHp: 204, radius: 30,
    role: 'elite', kind: traits.includes('FISSION') ? 'cluster' : 'single', traits: [...traits], tactic: tacticFor[traits[0]],
    eliteCycle: createEliteTacticCycle(traits), generation: 0, sourceId: 'endless:wave:20', born: 0, attackReady: 0,
    hitUntil: 0, scanned: false, facing: 0 };
  s.targets = [target];
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (patch: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: { x: target.x, y: target.y }, fire: false, ...patch });
  const advance = (ticks: number, patch: Partial<InputFrame> = {}) => { for (let i = 0; i < ticks; i++) step(patch); };
  const until = (predicate: () => boolean, limit = 1800) => { for (let i = 0; i < limit && !predicate(); i++) step(); expect(predicate()).toBe(true); };
  return { session, s, target, events, step, advance, until };
}
const ofType = (events: GameEvent[], type: string) => events.filter(e => e.type === type);

describe('one accepted elite commitment alternates only after completion', () => {
  it.each(pairs)('executes %s then %s with the original full warnings and recovery', (first, second) => {
    const f = fixture([first, second]); f.step();
    expect(f.target.attackPlan?.kind).toBe(tacticFor[first]);
    const frozen = structuredClone(f.target.attackPlan), deadline = f.target.attackAt;
    f.advance(12, { moveY: 1 });
    expect(f.target.attackPlan).toEqual(frozen); expect(f.target.attackAt).toBe(deadline);
    expect(f.target.eliteCycle?.index).toBe(0);
    f.until(() => ofType(f.events, 'ELITE_TACTIC_ADVANCED').length === 1);
    expect(f.target.tactic).toBe(tacticFor[first]); expect(f.target.eliteCycle?.index).toBe(1);
    const recovery = f.target.recoverUntil!;
    expect(recovery - f.s.elapsed).toBeCloseTo(first === 'CARAPACE' ? 2 : 1.5, 6);
    while (f.s.elapsed + 1 / 60 < recovery - 1e-7) { f.step(); expect(f.target.tactic).toBe(tacticFor[first]); }
    f.until(() => ofType(f.events, 'ELITE_TACTIC_COMMITTED').length >= 3);
    expect(ofType(f.events, 'ELITE_TACTIC_COMMITTED').slice(0, 3).map(e => e.data.tactic))
      .toEqual([tacticFor[first], tacticFor[second], tacticFor[first]]);
    expect(f.target.hp).toBe(204);
  });

  it('keeps factory/query pure and restricts cycles to the living current late-wave parent', () => {
    expect(createEliteTacticCycle([])).toBeUndefined(); expect(createEliteTacticCycle(['FISSION'])).toBeUndefined();
    expect(createEliteTacticCycle(['FISSION', 'FISSION'])).toBeUndefined();
    expect(createEliteTacticCycle(['FISSION', 'MIMIC', 'CARAPACE'])).toBeUndefined();
    const f = fixture(), before = f.session.snapshot(); expect(activeEliteTacticCycle(f.s, f.target)).toBe(f.target.eliteCycle);
    expect(f.session.snapshot()).toEqual(before); f.session.pause(); expect(activeEliteTacticCycle(f.s, f.target)).toBeDefined();
    f.target.generation = 1; expect(activeEliteTacticCycle(f.s, f.target)).toBeUndefined(); f.target.generation = 0;
    f.target.sourceId = 'endless:wave:15'; expect(activeEliteTacticCycle(f.s, f.target)).toBeUndefined(); f.target.sourceId = 'endless:wave:20';
    f.s.endless!.wave = 19; expect(activeEliteTacticCycle(f.s, f.target)).toBeUndefined();
  });

  it('freezes its full commitment and clocks throughout a real pause', () => {
    const f = fixture(); f.step(); f.session.pause(); const paused = f.session.snapshot();
    f.advance(300, { scan: true, fire: true, tool: 2 }); expect(f.session.snapshot()).toEqual(paused);
    f.session.resume(); f.until(() => ofType(f.events, 'ELITE_TACTIC_ADVANCED').length === 1);
  });

  it('Q interrupts one corrosion commitment and a recovery-time push neither flips nor shortens it', () => {
    const f = fixture(['MIMIC', 'CARAPACE']); f.step(); f.step({ scan: true });
    const deadline = f.target.recoverUntil!;
    expect(deadline - f.s.elapsed).toBeCloseTo(2); expect(f.target.tactic).toBe('mimic-corrosion');
    expect(f.target.eliteCycle?.index).toBe(1); expect(f.target.eliteCycle?.committedTick).toBeUndefined();
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(1);
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')[0].data.reason).toBe('scan-interrupted');
    f.step({ tool: 2, fire: true }); expect(f.target.recoverUntil).toBe(deadline);
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(1);
    f.advance(20); expect(f.target.tactic).toBe('mimic-corrosion'); expect(f.target.attackAt).toBeUndefined();
  });

  it.each(['CARAPACE', 'FISSION', 'MIMIC'] as const)('a real tool2 displacement interrupts %s once and retains its full recovery', first => {
    const second = first === 'MIMIC' ? 'FISSION' : 'MIMIC'; const f = fixture([first, second]); f.step();
    const recovery = f.target.attackPlan!.recoveryExposure;
    f.step({ tool: 2, fire: true }); const deadline = f.target.recoverUntil!;
    expect(ofType(f.events, 'AREA_DISPLACED')).toHaveLength(1); expect(f.target.hp).toBe(139);
    expect(deadline - f.s.elapsed).toBeCloseTo(recovery); expect(f.target.eliteCycle?.index).toBe(1);
    expect(f.target.tactic).toBe(tacticFor[first]); expect(f.target.attackPlan).toBeUndefined();
    f.advance(74); f.step({ tool: 2, fire: true });
    expect(f.target.recoverUntil).toBe(deadline); expect(f.target.eliteCycle?.index).toBe(1);
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(1);
  });

  it('a collision-clipped zero push does not interrupt or consume a commitment', () => {
    const f = fixture(); Object.assign(f.target, { x: 50, y: 700 }); Object.assign(f.s.player, { x: 300, y: 700 });
    f.step(); const plan = structuredClone(f.target.attackPlan); f.step({ tool: 2, fire: true });
    expect(ofType(f.events, 'AREA_DISPLACED')).toHaveLength(0); expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(0);
    expect(f.target.attackPlan).toEqual(plan); expect(f.target.eliteCycle?.index).toBe(0);
  });

  it('E pulse commits its original exposure/reveal and completes the interrupted cycle once', () => {
    const f = fixture(['CARAPACE', 'MIMIC']); f.step();
    Object.assign(f.s.battle!.graph.nodes.find(n => n.kind === 'valve')!, f.s.player);
    f.s.battle!.pulse.origin = { x: f.s.player.x, y: f.s.player.y };
    const before = f.s.tissue.hp; f.step({ interact: true });
    expect(before - f.s.tissue.hp).toBe(BATTLE_BALANCE.pulseCost);
    expect(f.target.exposedUntil! - f.s.elapsed).toBeCloseTo(BATTLE_BALANCE.pulseExpose);
    expect(f.target.revealedUntil! - f.s.elapsed).toBeCloseTo(BATTLE_BALANCE.scanReveal);
    expect(f.target.recoverUntil! - f.s.elapsed).toBeCloseTo(2);
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED').map(e => e.data.reason)).toEqual(['pulse-interrupted']);
  });

  it('does not consume a tactic while a same-kind heavy commitment occupies its slot', () => {
    const f = fixture(); const blocker: Target = { ...structuredClone(f.target), id: 'blocker', x: 700, y: 790, role: 'virus', eliteCycle: undefined };
    f.s.targets = [blocker, f.target]; f.advance(20);
    expect(blocker.attackPlan?.kind).toBe('fission-burst'); expect(f.target.attackPlan).toBeUndefined();
    expect(f.target.eliteCycle?.index).toBe(0); expect(f.target.eliteCycle?.committedTick).toBeUndefined();
    expect(ofType(f.events, 'ELITE_TACTIC_COMMITTED')).toHaveLength(0);
  });

  it.each(['cooldown', 'range', 'line-of-sight'] as const)('does not advance a plan rejected by %s', reason => {
    const f = fixture(['CARAPACE', 'MIMIC']);
    if (reason === 'cooldown') f.target.attackReady = 5;
    if (reason === 'range') { Object.assign(f.s.player, { x: 2100, y: 700 }); Object.assign(f.s.tissue, { x: 2100, y: 1100 }); }
    if (reason === 'line-of-sight') f.s.world = { ...world, obstacles: [{ id: 'fold', x: 900, y: 700, radius: 130 }] };
    f.advance(30); expect(f.target.attackPlan).toBeUndefined(); expect(f.target.eliteCycle?.index).toBe(0);
    expect(f.target.eliteCycle?.committedTick).toBeUndefined(); expect(ofType(f.events, 'ELITE_TACTIC_COMMITTED')).toHaveLength(0);
  });

  it('a real tool2 push interrupts an already moving charge and retains two recovery seconds', () => {
    const f = fixture(['CARAPACE', 'MIMIC']); f.until(() => !!f.target.charge); f.step({ tool: 2, fire: true });
    expect(f.target.charge).toBeUndefined(); expect(f.target.recoverUntil! - f.s.elapsed).toBeCloseTo(2);
    expect(f.target.eliteCycle?.index).toBe(1); expect(f.target.tactic).toBe('crystal-charge');
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED').map(e => e.data.reason)).toEqual(['area-interrupted']);
  });

  it('retains the existing total concurrency limit without skipping the waiting elite action', () => {
    const f = fixture();
    const positions = [[680, 700], [1100, 280], [1520, 700]];
    const blockers: Target[] = positions.map(([x, y], i) => ({ ...structuredClone(f.target), id: `ray-${i}`, x, y, radius: 22,
      role: 'virus', tactic: 'thin-ray', traits: [], eliteCycle: undefined }));
    f.target.x = 800; f.target.y = 950; f.s.targets = [...blockers, f.target]; f.step();
    expect(f.s.targets.filter(t => t.attackAt !== undefined || t.charge)).toHaveLength(3);
    expect(f.target.attackPlan).toBeUndefined(); expect(f.target.eliteCycle?.committedTick).toBeUndefined();
    expect(f.target.eliteCycle?.index).toBe(0);
  });
});

describe('cycle callbacks cannot replay accepted actions or contaminate a fresh session', () => {
  it.each(['ELITE_TACTIC_COMMITTED', 'ELITE_TACTIC_ADVANCED'] as const)('preserves the callback snapshot after %s restarts', type => {
    const f = fixture(); let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === type && !atCallback) { f.session.restart(); atCallback = f.session.snapshot(); } });
    f.until(() => !!atCallback); expect(f.session.snapshot()).toEqual(atCallback);
  });

  it.each(['ELITE_TACTIC_COMMITTED', 'ELITE_TACTIC_ADVANCED'] as const)('preserves the callback snapshot after %s pauses', type => {
    const f = fixture(); let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === type && !atCallback) { f.session.pause(); atCallback = f.session.snapshot(); } });
    f.until(() => !!atCallback); expect(f.session.snapshot()).toEqual(atCallback);
  });

  it.each(['scan', 'area', 'pulse'].flatMap(method => ['pause', 'restart'].map(action => [method, action] as const)))('finishes the %s interruption transaction before its new %s callback', (method, action) => {
    const f = fixture([method === 'scan' ? 'MIMIC' : 'CARAPACE', 'FISSION']); f.step();
    if (method === 'pulse') {
      Object.assign(f.s.battle!.graph.nodes.find(n => n.kind === 'valve')!, f.s.player);
      f.s.battle!.pulse.origin = { x: f.s.player.x, y: f.s.player.y };
    }
    let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === 'ELITE_TACTIC_ADVANCED') {
      if (action === 'pause') f.session.pause(); else f.session.restart(); atCallback = f.session.snapshot();
    } });
    f.step(method === 'scan' ? { scan: true } : method === 'area' ? { tool: 2, fire: true } : { interact: true });
    expect(atCallback).toBeDefined(); expect(f.session.snapshot()).toEqual(atCallback);
    expect(f.target.eliteCycle?.index).toBe(1); expect(f.target.recoverUntil! - f.s.elapsed).toBeGreaterThanOrEqual(1.5);
    if (method === 'pulse') expect(f.target.exposedUntil! - f.s.elapsed).toBeCloseTo(BATTLE_BALANCE.pulseExpose);
  });

  it.each([true, false])('consumes an actual damaging burst before a pause receipt (cycling=%s)', cycling => {
    const f = fixture(); if (!cycling) delete f.target.eliteCycle;
    let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === 'PLAYER_HURT' && !atCallback) { f.session.pause(); atCallback = f.session.snapshot(); } });
    f.until(() => !!atCallback); expect(f.session.snapshot()).toEqual(atCallback);
    const hp = f.s.player.hp; f.session.resume(); f.advance(30);
    expect(f.s.player.hp).toBe(hp); expect(ofType(f.events, 'PLAYER_HURT')).toHaveLength(1);
  });

  it('commits a charge contact and actual moved position before its damage callback pauses', () => {
    const f = fixture(['CARAPACE', 'MIMIC']); let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === 'PLAYER_HURT' && !atCallback) { f.session.pause(); atCallback = f.session.snapshot(); } });
    f.until(() => !!atCallback); expect(f.session.snapshot()).toEqual(atCallback); expect(f.target.charge?.hitPlayer).toBe(true);
    const hp = f.s.player.hp; f.session.resume(); f.advance(30); expect(f.s.player.hp).toBe(hp);
    expect(ofType(f.events, 'PLAYER_HURT')).toHaveLength(1); expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(1);
  });

  it('clears a dead commitment without advancing, then consumes each promised child before its spawn pause', () => {
    const f = fixture(); f.target.hp = 65; f.step(); f.step({ tool: 2, fire: true });
    expect(f.target.hp).toBe(0); expect(f.target.eliteCycle?.index).toBe(0); expect(f.target.eliteCycle?.committedTick).toBeUndefined();
    // Twenty-two live neighbors plus the two reserved children use exactly the existing budget24.
    for (let i = 0; i < 22; i++) f.s.targets.push({ id: `neighbor-${i}`, x: 1800 + i % 5 * 80, y: 150 + Math.floor(i / 5) * 80,
      hp: 68, maxHp: 68, radius: 22, role: 'virus', kind: 'single', traits: [], hitUntil: 0, scanned: false,
      generation: 0, sourceId: 'endless:wave:20', tactic: 'melee', attackReady: Infinity });
    let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === 'ACTOR_SPAWNED' && e.data.generation === 1 && !atCallback) { f.session.pause(); atCallback = f.session.snapshot(); } });
    f.until(() => !!atCallback); expect(f.session.snapshot()).toEqual(atCallback); expect(f.target.splitPositions).toHaveLength(1);
    f.session.resume(); f.step(); const children = f.s.targets.filter(t => t.generation === 1);
    expect(children).toHaveLength(2); expect(children.every(t => t.hp === 22 && t.eliteCycle === undefined)).toBe(true);
    expect(f.s.targets.filter(t => t.hp > 0)).toHaveLength(24);
    expect(f.target.splitAt).toBeUndefined(); expect(ofType(f.events, 'FISSION_SPAWNED').at(-1)?.data.children).toBe(2);
    expect(ofType(f.events, 'ELITE_TACTIC_ADVANCED')).toHaveLength(0);
  });

  it.each(['pause', 'restart'] as const)('reserves fission before an elite death callback can %s', action => {
    const f = fixture(); f.target.hp = 65; let atCallback: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', e => { if (e.type === 'ELITE_CLEARED' && !atCallback) {
      if (action === 'pause') f.session.pause(); else f.session.restart(); atCallback = f.session.snapshot();
    } });
    f.step({ tool: 2, fire: true }); expect(f.session.snapshot()).toEqual(atCallback);
    if (action === 'pause') { expect(f.target.splitPositions).toHaveLength(2); f.session.resume(); f.advance(60); expect(f.s.targets.filter(t => t.generation === 1)).toHaveLength(2); }
    else expect(f.session.state.events.some(e => e.type === 'FISSION_WARNING')).toBe(false);
  });
});
