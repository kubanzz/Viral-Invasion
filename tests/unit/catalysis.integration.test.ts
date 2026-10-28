import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { activeCatalysisTargets } from '../../src/game/catalysis';
import { endlessCombatStats } from '../../src/game/endlessGrowth';
import type { EndlessGrowthState } from '../../src/game/endlessGrowthTypes';
import { recordEndlessBehavior } from '../../src/game/endlessBehavior';
import type { DamageOrigin, GrowthCommand } from '../../src/game/growthTypes';
import { advanceImmuneCells, IMMUNE_CELL_BALANCE, summonImmuneCells } from '../../src/game/immuneCells';
import { growthContext } from '../../src/game/growth';
import { GameSession } from '../../src/game/session';
import { BALANCE, type GameEvent, type InputFrame, type Target, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x = 800, y = 500, changes: Partial<Target> = {}): Target => ({
  id, x, y, role: 'source', kind: 'single', radius: 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false,
  generation: 0, traits: [], born: 0, sourceId: 'endless:wave:1', attackReady: 1000, recoverUntil: 1000, ...changes,
});
function fixture(targets = [actor('a')], ranks: EndlessGrowthState['ranks'] = { catalysis: 1, nova: 1 }, obstacles: WorldGeometry['obstacles'] = []) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state; state.world = { ...structuredClone(world), obstacles };
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 750, hp: 100 });
  state.targets = targets; state.endlessGrowth!.ranks = { ...ranks }; state.growth!.equipped = [];
  for (const target of targets) if (target.role === 'source') state.battle!.graph.nodes.push({
    id: target.id, kind: 'source', x: target.x, y: target.y, active: true, infected: true,
  });
  Object.assign(state.endless!, { phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: 1000 });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  return { session, state, targets, events };
}
function step(session: GameSession, extra: Partial<InputFrame> = {}) {
  session.step({ moveX: 0, moveY: 0, aim: { x: 800, y: 500 }, fire: false, ...extra });
}
function through(session: GameSession, tick: number) {
  while (session.state.tick < tick && session.state.phase === 'playing') step(session);
  expect(session.state.tick).toBe(tick);
}
function prime(session: GameSession, aim = { x: 800, y: 500 }) {
  step(session); // Every cast requires a new press; held fire does not repeat tool 2.
  step(session, { fire: true, tool: 2, aim });
  for (let tick = 0; tick < 80 && session.state.traction && session.state.phase === 'playing'; tick++) step(session);
}
const blastHits = (events: GameEvent[]) => events.filter(event => event.type === 'TARGET_HIT' && event.data.ability === 'catalysis');
const ofType = (events: GameEvent[], type: string) => events.filter(event => event.type === type);
// Narrow internal access is used only for rejected/forged-source adversarial inputs.
const internals = (session: GameSession) => session as unknown as {
  damage(target: Target, amount: number, origin: DamageOrigin): number;
  applyGrowthCommands(commands: GrowthCommand[]): void;
  fire(aim: { x: number; y: number }): void;
};

describe('real catalysis primer attacks and finite batch lifecycle', () => {
  it('caps direct HP loss at eight, removes knockback and stamps only the nearest three actual surviving hits', () => {
    const targets = [actor('far', 800, 570), actor('b', 810, 500), actor('a', 790, 500),
      actor('center'), actor('dies', 780, 500, { hp: 7 }), actor('blocked', 900, 500)];
    const f = fixture(targets, { catalysis: 1, nova: 1, power: 2 }, [{ id: 'local-cover', x: 850, y: 500, radius: 10 }]);
    const positions = targets.map(target => ({ id: target.id, x: target.x, y: target.y }));
    prime(f.session);
    expect(f.state.endlessGrowth!.pendingCatalysis).toMatchObject({ organId: 'heart', createdAt: f.state.elapsed,
      until: f.state.elapsed + 4, targetIds: ['center', 'a', 'b'], damage: endlessCombatStats(f.state.endlessGrowth!).catalysisDamage });
    for (const target of targets) {
      expect({ id: target.id, x: target.x, y: target.y }).toEqual(positions.find(previous => previous.id === target.id));
      expect(target.hp).toBe(target.id === 'blocked' ? 1000 : target.id === 'dies' ? 0 : 992);
    }
    expect(ofType(f.events, 'AREA_DISPLACED')).toEqual([]);
    expect(ofType(f.events, 'CATALYSIS_ARMED')).toHaveLength(1);
    expect(f.state.message).toContain('催化已铺设'); expect(f.state.message).toContain('整批一次');
    expect(f.state.effects.some(effect => effect.kind === 'scan')).toBe(true);
    expect(ofType(f.events, 'TARGET_HIT').every(event => Number(event.data.damage) <= 8)).toBe(true);
    const before = structuredClone(f.state);
    expect(activeCatalysisTargets(f.state).map(target => target.id).sort()).toEqual(['a', 'b', 'center']);
    expect(f.state).toEqual(before);
  });

  it('keeps the full delayed blast without the card and the same inward collection after conversion', () => {
    const f = fixture([actor('a', 800, 600, { role: 'virus', recoverUntil: 0 })], { nova: 2, power: 1 });
    prime(f.session);
    expect(f.targets[0].hp).toBeCloseTo(1000 - BALANCE.damage[2] * 1.18 * 1.3);
    expect(Number(ofType(f.events, 'TRACTION_DISPLACED')[0].data.distance)).toBeGreaterThan(0);
    expect(distance(f.targets[0], { x: 800, y: 500 })).toBeLessThan(100);
    expect(ofType(f.events, 'AREA_DISPLACED')).toEqual([]);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    expect(ofType(f.events, 'CATALYSIS_ARMED')).toEqual([]);
    expect(ofType(f.events, 'TARGET_HIT')[0].data.basicTool).toBe(2);
    const converted = fixture([actor('converted', 800, 600, { role: 'virus', recoverUntil: 0 })]); prime(converted.session);
    expect(converted.targets[0].hp).toBe(992);
    expect(ofType(converted.events, 'TRACTION_DISPLACED')).toHaveLength(1);
    expect(distance(converted.targets[0], { x: 800, y: 500 })).toBeLessThan(100);
    expect(ofType(converted.events, 'AREA_DISPLACED')).toEqual([]);
  });

  it('replaces the previous batch only after a new effective primer and captures that cast budget once', () => {
    const f = fixture([actor('a'), actor('next', 900, 700)]);
    prime(f.session); const previous = structuredClone(f.state.endlessGrowth!.pendingCatalysis!);
    f.state.endlessGrowth!.ranks.power = 2;
    through(f.session, 140); prime(f.session, { x: 850, y: 650 });
    const next = f.state.endlessGrowth!.pendingCatalysis!;
    expect(next.id).not.toBe(previous.id); expect(next.targetIds).toEqual(['next']);
    expect(next.until).toBe(f.state.elapsed + 4);
    expect(next.damage).toBeCloseTo(BALANCE.damage[2] * 1.36 * 1.15 * 1.25);
    expect(previous.damage).toBeCloseTo(BALANCE.damage[2] * 1.15 * 1.25);
    expect(ofType(f.events, 'CATALYSIS_ARMED')[1].data.replacedBatchId).toBe(previous.id);
  });

  it.each(['cooldown', 'empty', 'range'] as const)('does not refresh the batch after a %s attempt', kind => {
    const f = fixture(); prime(f.session); const pending = structuredClone(f.state.endlessGrowth!.pendingCatalysis);
    if (kind !== 'cooldown') through(f.session, 140);
    prime(f.session, kind === 'empty' ? { x: 500, y: 700 } : kind === 'range' ? { x: 2000, y: 500 } : { x: 800, y: 500 });
    expect(f.state.endlessGrowth!.pendingCatalysis).toEqual(pending);
    expect(ofType(f.events, 'CATALYSIS_ARMED')).toHaveLength(1);
  });

  it('does not create a batch from positive primer hits that leave no survivor', () => {
    const f = fixture([actor('fragile', 800, 500, { hp: 7 })]); prime(f.session);
    expect(ofType(f.events, 'TARGET_HIT')[0].data.damage).toBe(7);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    expect(ofType(f.events, 'CATALYSIS_ARMED')).toEqual([]);
  });

  it('waits for existing on-hit protocol results before accepting the surviving primer set', () => {
    const f = fixture([actor('protocol-victim', 800, 500, { hp: 20 }), actor('survivor', 850, 500)]);
    f.state.tick = 120; f.state.elapsed = 2;
    f.state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }];
    f.state.battle!.pulse.origin = { ...f.state.player };
    prime(f.session);
    expect(f.targets[0].hp).toBe(0);
    expect(f.state.endlessGrowth!.pendingCatalysis!.targetIds).toEqual(['survivor']);
    expect(f.events.findIndex(event => event.type === 'PROTOCOL_RESONANCE_HIT')).toBeLessThan(f.events.findIndex(event => event.type === 'CATALYSIS_ARMED'));
  });

  it('freezes TTL during real paused steps and clears once at the exact simulation deadline', () => {
    const f = fixture(); prime(f.session); const until = f.state.endlessGrowth!.pendingCatalysis!.until;
    f.session.pause(); const paused = f.session.snapshot();
    for (let tick = 0; tick < 300; tick++) step(f.session, { fire: true, scan: true });
    expect(f.session.snapshot()).toEqual(paused); expect(activeCatalysisTargets(f.state)).toHaveLength(1);
    f.session.resume(); through(f.session, Math.round(until * 60));
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    expect(ofType(f.events, 'CATALYSIS_EXPIRED')).toHaveLength(1);
    expect(ofType(f.events, 'CATALYSIS_EXPIRED')[0].data.reason).toBe('timeout');
    expect(blastHits(f.events)).toEqual([]);
  });

  it.each(['dead-members', 'wave-clear', 'run-ended', 'new-run', 'menu'] as const)('clears retained batch state on %s', reason => {
    const f = fixture(); prime(f.session);
    if (reason === 'dead-members') {
      internals(f.session).damage(f.targets[0], 1000, { cause: 'protocol', protocolId: 'PURIFY_CHAIN' }); step(f.session);
    } else if (reason === 'wave-clear') f.session.completeWave(1);
    else if (reason === 'run-ended') f.session.finish(false, 'test retreat');
    else if (reason === 'new-run') f.session.restart();
    else f.session.menu();
    expect(f.session.state.endlessGrowth?.pendingCatalysis).toBeUndefined();
    expect(activeCatalysisTargets(f.session.state)).toEqual([]);
    expect(blastHits(f.events)).toEqual([]);
  });
});

describe('atomic catalysis conversion and original protocol order', () => {
  it('consumes before the primary hit callback, then applies the captured budget after original hit effects', () => {
    const f = fixture([actor('a'), actor('near', 850, 500)]); prime(f.session);
    const batch = structuredClone(f.state.endlessGrowth!.pendingCatalysis!);
    let pendingAtPrimaryHit = true;
    f.session.bus.on('event', event => {
      if (event.type === 'TARGET_HIT' && event.data.basicTool === 1) pendingAtPrimaryHit = !!f.state.endlessGrowth!.pendingCatalysis;
    });
    f.state.endlessGrowth!.ranks.power = 5; // The pending batch retains its original tool-2 projection.
    step(f.session, { tool: 1, fire: true });
    expect(pendingAtPrimaryHit).toBe(false);
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toHaveLength(1);
    expect(ofType(f.events, 'CATALYSIS_DETONATED')).toHaveLength(1);
    expect(blastHits(f.events)).toHaveLength(2);
    expect(blastHits(f.events).every(event => event.data.rootId === batch.id && Number(event.data.damage) === batch.damage)).toBe(true);
    expect(f.targets[0].hp).toBeCloseTo(1000 - 8 - 34 * 1.9 - batch.damage);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    const resolved = ofType(f.events, 'CATALYSIS_RESOLVED'); expect(resolved).toHaveLength(1);
    expect(resolved[0].data.hits).toBe(2); expect(Number(resolved[0].data.damage)).toBeCloseTo(batch.damage * 2);
    expect(f.state.message).toContain('实际命中 2 体');
  });

  it('retains the lethal primary chain before the blast, with one clear per body and no catalyst chain', () => {
    const f = fixture([actor('a', 800, 500, { hp: 28 }), actor('chain-neighbor', 870, 500, { hp: 50 }), actor('far', 940, 500)]);
    prime(f.session); f.state.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced' }];
    step(f.session, { tool: 1, fire: true });
    expect(ofType(f.events, 'TARGET_CLEARED').filter(event => event.data.id === 'a')).toHaveLength(1);
    expect(ofType(f.events, 'TARGET_CLEARED').filter(event => event.data.id === 'chain-neighbor')).toHaveLength(1);
    expect(ofType(f.events, 'PROTOCOL_CHAIN_HIT')).toHaveLength(2);
    expect(ofType(f.events, 'PROTOCOL_CHAIN_HIT').every(event => event.data.rootId !== ofType(f.events, 'CATALYSIS_CONSUMED')[0].data.batchId)).toBe(true);
    const blastAt = f.events.findIndex(event => event.type === 'CATALYSIS_DETONATED');
    expect(f.events.map((event, index) => event.type === 'PROTOCOL_CHAIN_HIT' ? index : -1).filter(index => index >= 0).at(-1)).toBeLessThan(blastAt);
    expect(f.targets[2].hp).toBe(962);
    expect(blastHits(f.events).map(event => event.data.id)).toEqual(['chain-neighbor']);
  });

  it('truthfully resolves zero blast hits when the primary killed the only nearby body', () => {
    const f = fixture([actor('a', 800, 500, { hp: 28 })]); prime(f.session);
    step(f.session, { tool: 1, fire: true });
    expect(ofType(f.events, 'CATALYSIS_DETONATED')[0].data.candidates).toBe(0);
    expect(ofType(f.events, 'CATALYSIS_RESOLVED')[0].data).toMatchObject({ hits: 0, damage: 0 });
    expect(blastHits(f.events)).toEqual([]); expect(f.state.message).toContain('实际命中 0 体');
  });

  it('retains nonlethal ricochet and resonance before one blast without retriggering either protocol', () => {
    const f = fixture([actor('a'), actor('neighbor', 870, 500)]); prime(f.session);
    f.state.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 2 }, { id: 'PULSE_BREAK', tuning: 'balanced' }];
    f.state.growth!.chainCharge = 2; f.state.battle!.pulse.origin = { ...f.state.player };
    f.state.tick = 120; f.state.elapsed = 2;
    step(f.session, { tool: 1, fire: true });
    const blastAt = f.events.findIndex(event => event.type === 'CATALYSIS_DETONATED');
    for (const type of ['PROTOCOL_RICOCHET_HIT', 'PROTOCOL_RESONANCE_HIT']) {
      expect(ofType(f.events, type)).toHaveLength(1);
      expect(f.events.findIndex(event => event.type === type)).toBeLessThan(blastAt);
    }
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toHaveLength(1);
  });

  it('lets same-tick multishot and piercing hits consume a batch only once', () => {
    const targets = [actor('center', 900, 500), actor('upper', 896, 444), actor('lower', 896, 556), actor('front', 700, 500)];
    const f = fixture(targets, { catalysis: 1, nova: 1, multishot: 1, pierce: 3 }); prime(f.session, { x: 900, y: 500 });
    step(f.session, { tool: 1, fire: true, aim: { x: 1000, y: 500 } });
    expect(ofType(f.events, 'TARGET_HIT').filter(event => event.data.basicTool === 1).length).toBeGreaterThanOrEqual(4);
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toHaveLength(1);
    expect(ofType(f.events, 'CATALYSIS_DETONATED')).toHaveLength(1);
    expect(blastHits(f.events)).toHaveLength(3);
  });

  it('filters each blast LOS before stable distance/ID truncation and never exceeds three victims', () => {
    const f = fixture([actor('center'), actor('blocked', 850, 500), actor('near', 800, 440), actor('third', 800, 580), actor('extra', 800, 600)],
      { catalysis: 1, nova: 1 }, [{ id: 'cover', x: 820, y: 500, radius: 6 }]);
    prime(f.session); step(f.session, { tool: 1, fire: true });
    expect(blastHits(f.events).map(event => event.data.id)).toEqual(['center', 'near', 'third']);
    expect(f.targets[1].hp).toBe(1000); expect(f.targets[4].hp).toBe(992);
  });

  it.each(['finish', 'restart'] as const)('does not leak a claimed blast when a primary-hit callback performs %s', action => {
    const f = fixture(); prime(f.session); let invoked = false;
    let restartedSnapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (!invoked && event.type === 'TARGET_HIT' && event.data.basicTool === 1) {
        invoked = true;
        if (action === 'finish') f.session.finish(false, 'callback exit');
        else { f.session.restart(); restartedSnapshot = f.session.snapshot(); }
      }
    });
    step(f.session, { tool: 1, fire: true });
    expect(invoked).toBe(true); expect(blastHits(f.events)).toEqual([]);
    expect(ofType(f.events, 'CATALYSIS_DETONATED')).toEqual([]);
    expect(f.session.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    if (action === 'restart') expect(f.session.snapshot()).toEqual(restartedSnapshot);
  });

  it('does not let a lethal-clear callback pass an old source to the new battle director', () => {
    const f = fixture([actor('a', 800, 500, { hp: 28 })]); prime(f.session);
    let restartedSnapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (event.type === 'TARGET_CLEARED' && event.data.id === 'a') {
        f.session.restart(); restartedSnapshot = f.session.snapshot();
      }
    });
    expect(() => step(f.session, { tool: 1, fire: true })).not.toThrow();
    expect(restartedSnapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(restartedSnapshot);
    expect(f.session.state.tick).toBe(0); expect(f.session.state.battle!.stats.sourceClears).toBe(0);
    expect(ofType(f.events, 'CATALYSIS_DETONATED')).toEqual([]);
  });

  it('stops the rest of a blast when its lethal hit callback starts a new run', () => {
    const f = fixture([actor('a'), actor('neighbor', 850, 500, { hp: 70 }), actor('third', 800, 570)]); prime(f.session);
    let restarted = false;
    let restartedSnapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (event.type === 'TARGET_HIT' && event.data.ability === 'catalysis' && event.data.id === 'neighbor') {
        restarted = true; f.session.restart(); restartedSnapshot = f.session.snapshot();
      }
    });
    expect(() => step(f.session, { tool: 1, fire: true })).not.toThrow();
    expect(restarted).toBe(true); expect(f.session.state.tick).toBe(0);
    expect(f.session.snapshot()).toEqual(restartedSnapshot);
    expect(blastHits(f.events).map(event => event.data.id)).toEqual(['a', 'neighbor']);
    expect(ofType(f.events, 'CATALYSIS_RESOLVED')).toEqual([]);
    expect(f.session.state.battle!.stats.sourceClears).toBe(0);
  });

  it.each(['run-ended', 'wave-cleared'] as const)('does not send stale %s work into a run opened by the expiry callback', reason => {
    const f = fixture(); prime(f.session);
    f.session.bus.on('event', event => { if (event.type === 'CATALYSIS_EXPIRED' && event.data.reason === reason) f.session.restart(); });
    if (reason === 'run-ended') f.session.finish(false, 'retreat'); else f.session.completeWave(1);
    expect(f.session.state.tick).toBe(0); expect(f.session.state.phase).toBe('playing');
    expect(f.session.state.runMetrics!.ended).toBe(false); expect(f.session.state.growth!.xp).toBe(0);
    expect(f.session.state.endlessGrowth!.draft).toBeNull(); expect(ofType(f.events, 'RUN_ENDED')).toEqual([]);
  });

  it('finishes the blast before opening and pausing an already queued legal XP draft', () => {
    const f = fixture(); prime(f.session);
    Object.assign(f.state.growth!, { xp: 20, level: 1, nextXp: 55, starterDebt: 0, pendingLevels: [1] });
    step(f.session, { tool: 1, fire: true });
    expect(ofType(f.events, 'CATALYSIS_RESOLVED')).toHaveLength(1);
    expect(f.state.growth!.draft?.source).toBe('xp'); expect(f.state.phase).toBe('paused');
    expect(f.events.findIndex(event => event.type === 'CATALYSIS_RESOLVED')).toBeLessThan(f.events.findIndex(event => event.type === 'RUN_PAUSED'));
  });

  it('resolves an actual last-wave kill before clear rewards and their ordinary modal pause', () => {
    const f = fixture([actor('last-body', 800, 500, { hp: 70, role: 'virus' })]); prime(f.session);
    // An already-settled preparation lets this real clear open an XP draft as well.
    f.state.growth!.starterDebt = 0;
    f.state.endless!.remainingToSpawn = 0;
    step(f.session, { tool: 1, fire: true });
    const resolved = f.events.findIndex(event => event.type === 'CATALYSIS_RESOLVED');
    const cleared = f.events.findIndex(event => event.type === 'ENDLESS_WAVE_CLEARED');
    const paused = f.events.findIndex(event => event.type === 'RUN_PAUSED');
    expect(resolved).toBeGreaterThanOrEqual(0); expect(cleared).toBeGreaterThan(resolved); expect(paused).toBeGreaterThan(cleared);
    expect(f.state.phase).toBe('paused'); expect(f.state.endlessGrowth!.draft).toBeDefined();
    expect(f.state.growth!.draft?.source).toBe('xp'); expect(f.state.endless!.clearedWaves).toBe(1);
  });
});

describe('actual immune-cell provenance and catalyst exclusion rules', () => {
  it.each([1, 2, 3] as const)('allows real contact bites to trigger while holding tool %i', tool => {
    const f = fixture([actor('a'), actor('near', 850, 500)]); prime(f.session);
    f.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    step(f.session, { tool, scan: true }); through(f.session, 35);
    const consumed = ofType(f.events, 'CATALYSIS_CONSUMED'); expect(consumed).toHaveLength(1);
    expect(consumed[0].data.trigger).toBe('immune-cell');
    const accepted = ofType(f.events, 'TARGET_HIT').find(event => event.data.immuneCellId === consumed[0].data.immuneCellId);
    expect(accepted?.data).toMatchObject({ cause: 'protocol', protocolId: 'IMMUNE_BEACON', tool });
    expect(Number(accepted?.data.damage)).toBeGreaterThan(0);
    expect(ofType(f.events, 'CATALYSIS_DETONATED')).toHaveLength(1);
  });

  it('also accepts the real single baseline patrol without inventing an equipped-lamp bite', () => {
    const f = fixture(); prime(f.session);
    step(f.session, { tool: 3, scan: true }); through(f.session, 55);
    expect(f.state.growth!.beacon!.mode).toBe('patrol'); expect(f.state.growth!.cells).toHaveLength(1);
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toHaveLength(1);
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')[0].data.trigger).toBe('immune-cell');
    expect(ofType(f.events, 'IMMUNE_PATROL_HIT').some(event => event.data.targetId === 'a')).toBe(true);
    expect(ofType(f.events, 'PROTOCOL_BEACON_HIT')).toEqual([]);
  });

  it('accepts a real already-ready cell bite after primer damage in the same simulation tick', () => {
    const f = fixture(); f.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    f.state.growth!.beacon = { id: 'squad', organId: 'heart', x: 800, y: 500, born: 0, until: 6,
      radius: 190, damage: 24, interval: .8, nextAttackAt: 0, tuning: 'balanced', mode: 'protocol' };
    f.state.growth!.cells = summonImmuneCells(f.state.growth!.beacon, growthContext(f.state))
      .map(cell => ({ ...cell, x: 800, y: 470, attackReadyAt: 20 / 60 }));
    prime(f.session);
    const armed = ofType(f.events, 'CATALYSIS_ARMED')[0], consumed = ofType(f.events, 'CATALYSIS_CONSUMED')[0];
    expect(armed.tick).toBe(20); expect(consumed.tick).toBe(armed.tick);
    expect(f.events.indexOf(armed)).toBeLessThan(f.events.indexOf(consumed));
    expect(consumed.data.trigger).toBe('immune-cell'); expect(ofType(f.events, 'CATALYSIS_DETONATED')).toHaveLength(1);
  });

  it.each(['request-log', 'root-prefix', 'held-tool', 'other-ability', 'zero-precision'] as const)('does not let %s masquerade as a real catalyst trigger', kind => {
    const f = fixture(); prime(f.session); f.state.tool = 1;
    if (kind === 'request-log') f.session.emit('PROTOCOL_BEACON_HIT', { protocolId: 'IMMUNE_BEACON', rootId: 'fake:bite:1', cellId: 'ghost', targetId: 'a', damage: 8 });
    else if (kind === 'root-prefix') internals(f.session).damage(f.targets[0], 1, { cause: 'protocol', protocolId: 'IMMUNE_BEACON', rootId: 'squad:cell:0:bite:1' });
    else if (kind === 'held-tool') internals(f.session).damage(f.targets[0], 1, { cause: 'basic' });
    else if (kind === 'other-ability') internals(f.session).damage(f.targets[0], 1, { cause: 'ability', ability: 'scan' });
    else internals(f.session).damage(f.targets[0], 0, { cause: 'basic', basicTool: 1 });
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeDefined();
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toEqual([]);
  });

  it.each(['missing-id', 'missing-cell', 'old-beacon', 'wrong-organ', 'expired-cell', 'wrong-target', 'distant', 'wall', 'old-pose', 'invalid-clock', 'zero-hit', 'other-protocol'] as const)('rejects %s cell provenance even if a positive request names a living target', kind => {
    const f = fixture(); prime(f.session);
    const origin = { id: 'squad', organId: 'heart' as const, x: 800, y: 500, born: 0, until: 6,
      radius: 190, damage: 24, interval: .8, nextAttackAt: 0, tuning: 'balanced' as const, mode: 'protocol' as const };
    f.state.growth!.beacon = origin;
    const cell = { ...summonImmuneCells(origin, growthContext(f.state), 1)[0], x: 800, y: 470, targetId: 'a',
      updatedAt: f.state.elapsed, attackReadyAt: f.state.elapsed + .8, attackUntil: f.state.elapsed + IMMUNE_CELL_BALANCE.attackPose,
      activity: 'biting' as const };
    f.state.growth!.cells = [cell];
    const command: Extract<GrowthCommand, { kind: 'damage' }> = { kind: 'damage', organId: 'heart', protocolId: 'IMMUNE_BEACON',
      rootId: 'fake:bite:1', cause: 'protocol', targetId: 'a', amount: 1, hop: 0, immuneCellId: cell.id };
    if (kind === 'missing-id') delete command.immuneCellId;
    if (kind === 'missing-cell') command.immuneCellId = 'ghost';
    if (kind === 'old-beacon') cell.beaconId = 'old';
    if (kind === 'wrong-organ') cell.organId = 'lung';
    if (kind === 'expired-cell') cell.until = f.state.elapsed;
    if (kind === 'wrong-target') cell.targetId = 'other';
    if (kind === 'distant') cell.x = 500;
    if (kind === 'old-pose') { cell.attackReadyAt -= 1 / 60; cell.attackUntil -= 1 / 60; }
    if (kind === 'invalid-clock') cell.attackUntil = NaN;
    if (kind === 'zero-hit') command.amount = 0;
    if (kind === 'other-protocol') command.protocolId = 'PURIFY_CHAIN';
    if (kind === 'wall') {
      f.targets[0].radius = 15; cell.x = 762; cell.y = 500;
      f.state.world = { ...world, obstacles: [{ id: 'thin-fold', x: 781, y: 500, radius: 2 }] };
    }
    internals(f.session).applyGrowthCommands([command]);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeDefined();
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toEqual([]);
  });

  it('consumes a real bite proof once even if that bite preceded the current batch', () => {
    const f = fixture();
    f.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const origin = { id: 'squad', organId: 'heart' as const, x: 800, y: 500, born: 0, until: 6,
      radius: 190, damage: 24, interval: .8, nextAttackAt: 0, tuning: 'balanced' as const, mode: 'protocol' as const };
    f.state.growth!.beacon = origin;
    const cells = summonImmuneCells(origin, { ...growthContext(f.state), tick: 0, elapsed: 0 }, 1)
      .map(cell => ({ ...cell, x: 800, y: 470, attackReadyAt: 0 }));
    let commands: GrowthCommand[] = [];
    f.session.bus.on('event', event => {
      if (event.type !== 'TARGET_HIT' || event.data.basicTool !== 2) return;
      // A real bite is accepted during the primer receipt, just before its batch is armed.
      const advanced = advanceImmuneCells(cells, origin, growthContext(f.state));
      f.state.growth!.cells = advanced.cells;
      commands = advanced.commands.filter(command => command.kind === 'damage');
      internals(f.session).applyGrowthCommands(commands);
    });
    prime(f.session);
    expect(ofType(f.events, 'TARGET_HIT').some(event => event.data.immuneCellId === cells[0].id)).toBe(true);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeDefined();
    internals(f.session).applyGrowthCommands(commands);
    expect(f.state.endlessGrowth!.pendingCatalysis).toBeDefined();
    expect(ofType(f.events, 'CATALYSIS_CONSUMED')).toEqual([]);
  });

  it.each([1, 2, 3] as const)('attributes actual catalysis blasts to area damage while holding tool %i', tool => {
    const history = recordEndlessBehavior([], { type: 'TARGET_HIT', tick: 30,
      data: { cause: 'ability', ability: 'catalysis', tool, damage: 19, rawDamage: 100 } }, 30);
    expect(history).toEqual([{ tick: 30, precisionDamage: 0, areaDamage: 19, scans: 0, isolations: 0, repaired: 0 }]);
    expect(recordEndlessBehavior([], { type: 'TARGET_HIT', tick: 30,
      data: { cause: 'protocol', protocolId: 'IMMUNE_BEACON', tool, damage: 8, immuneCellId: 'actual-cell' } }, 30)).toEqual([]);
  });
});
