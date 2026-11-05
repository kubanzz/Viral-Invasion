import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { combatPopulation } from '../../src/game/combatPopulation';
import { advanceSmartViruses, advanceSmartVirusActor, planSmartSupports, playerSlimeMultiplier, cancelSmartSupports, smartRemainingSlots, smartSpringRaidGoal } from '../../src/game/smartViruses';
import { planTerritoryAssaults } from '../../src/game/endless';
import type { Target, GameEvent } from '../../src/game/types';
import type { SmartSupportPlan } from '../../src/game/smartVirusesTypes';

function fixture(wave = 3) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, events: GameEvent[] = [];
  state.world = { ...state.world!, obstacles: [] }; state.targets = []; Object.assign(state.player, { x: 1200, y: 1000 });
  Object.assign(e, { wave, phase: 'combat', phaseStartedAt: 0, remainingToSpawn: 0, canceledToSpawn: 0, spawnedIds: [], spawnSerial: 0 });
  const roles = Array.from({ length: 80 }, () => 'ordinary' as const), reserved = planTerritoryAssaults(wave, roles).reservedSlots;
  e.smartSupport = planSmartSupports(state.seed, wave, roles, reserved);
  // These fixtures isolate the eight-slot brood ledger; ritual's independent
  // four-slot atomic reservation and cancellation are covered in ritual.test.
  e.smartSupport.plans = e.smartSupport.plans.filter(plan => plan.kind !== 'ritual');
  e.smartSupport.reservedSlots = e.smartSupport.plans.flatMap(plan => plan.slots);
  e.remainingToSpawn = e.smartSupport.reservedSlots.length;
  const host = { state, emit(type: string, data: GameEvent['data']) { events.push({ type, tick: state.tick, data }); } };
  const at = (n: number) => { state.elapsed = n; state.tick = Math.round(n * 60); advanceSmartViruses(host); };
  return { game, state, e, host, events, at };
}
function make(id: string, x = 1200, y = 900, extra: Partial<Target> = {}): Target {
  return { id, x, y, hp: 68, maxHp: 68, radius: 22, kind: 'single', role: 'virus', scanned: false, hitUntil: 0, ...extra };
}
function buildNest(f: ReturnType<typeof fixture>) {
  f.at(2); f.at(6); const plan = f.e.smartSupport!.plans[0], builder = f.state.targets.find(t => t.id === plan.builderId)!;
  expect(builder).toBeDefined(); plan.nestPosition = { x: builder.x + 65, y: builder.y };
  advanceSmartVirusActor(f.host, builder); const until = plan.buildUntil!; expect(until).toBeGreaterThan(f.state.elapsed);
  f.state.elapsed = until; advanceSmartVirusActor(f.host, builder); return { plan, builder, nest: f.state.targets.find(t => t.id === plan.nestId)! };
}
describe('finite smart-virus support economy', () => {
  it('teaches caster then brood, preserves opening lessons and invasion slots', () => {
    for (const [wave, cost] of [[1, 0], [2, 1], [3, 12], [4, 10], [8, 14], [12, 14], [15, 10]]) {
      const roles = Array.from({ length: 80 }, () => 'ordinary' as const), forbidden = planTerritoryAssaults(wave, roles).reservedSlots;
      const plan = planSmartSupports(71, wave, roles, forbidden);
      expect(plan.reservedSlots).toHaveLength(cost); expect(new Set(plan.reservedSlots).size).toBe(cost);
      expect(plan.reservedSlots.every(s => s >= 3 && !forbidden.includes(s))).toBe(true);
    }
  });
  it('reserves all seven future brood bodies atomically and refuses 49 population', () => {
    const f = fixture(); f.state.targets = Array.from({ length: 41 }, (_, i) => make(`existing:${i}`));
    f.at(2); f.at(6); expect(f.state.targets.some(t => t.profession)).toBe(false);
    f.state.targets[0].hp = 0; f.at(6.5);
    expect(f.state.targets.filter(t => t.profession === 'nest-builder')).toHaveLength(1);
    expect(combatPopulation(f.state)).toMatchObject({ reserved: 48, broodReserved: 7 });
    expect(f.e.remainingToSpawn).toBe(7);
  });
  it('killing the constructor cancels seven promises once and releases the wave', () => {
    const f = fixture(); f.at(2); f.at(6); f.state.targets[0].hp = 0; f.at(7); f.at(8);
    expect(f.e.remainingToSpawn).toBe(0); expect(f.e.canceledToSpawn).toBe(7); expect(combatPopulation(f.state).reserved).toBe(0);
    expect(f.events.filter(e => e.type === 'SMART_SUPPORT_CANCELED')).toHaveLength(1);
  });
  it('hatches exactly six finite fastlings, converting reservations without adding population', () => {
    const f = fixture(), { plan, nest } = buildNest(f); expect(nest).toBeDefined();
    expect(combatPopulation(f.state)).toMatchObject({ reserved: 8, broodReserved: 6 });
    for (let i = 0; i < 3; i++) f.at(plan.nextHatchAt!);
    expect(f.state.targets.filter(t => t.profession === 'fastling')).toHaveLength(6);
    expect(combatPopulation(f.state)).toMatchObject({ reserved: 8, broodReserved: 0 });
    expect(f.e.remainingToSpawn).toBe(0); f.at(100);
    expect(f.state.targets.filter(t => t.profession === 'fastling')).toHaveLength(6);
    expect(f.state.targets.filter(t => t.profession === 'fastling').every(t => t.hp === 24 && t.generation === 1 && t.traits?.length === 0 && !t.territoryTask)).toBe(true);
  });
  it('gives a full first-hatch warning and splits each pair between pursuit and actual spring raiding', () => {
    const f = fixture(), { plan } = buildNest(f);
    expect(plan.nextHatchAt! - f.state.elapsed).toBeCloseTo(1);
    f.at(plan.nextHatchAt! - .01); expect(f.state.targets.some(t => t.profession === 'fastling')).toBe(false);
    f.at(plan.nextHatchAt!);
    const pair = f.state.targets.filter(t => t.profession === 'fastling'); expect(pair).toHaveLength(2);
    expect(pair.filter(t => !!smartSpringRaidGoal(f.state, t))).toHaveLength(1);
    f.state.territory!.nodes.filter(n => n.kind === 'front').forEach(n => n.owner = 'healthy');
    expect(pair.filter(t => !!smartSpringRaidGoal(f.state, t))).toHaveLength(0);
  });
  it('a completed nest survives its builder but destroying it cancels only unborn young', () => {
    const f = fixture(), { plan, builder, nest } = buildNest(f);
    builder.hp = 0; f.at(plan.nextHatchAt!); expect(f.state.targets.filter(t => t.profession === 'fastling')).toHaveLength(2);
    nest.hp = 0; f.at(f.state.elapsed + .1); f.at(f.state.elapsed + .1);
    expect(f.e.canceledToSpawn).toBe(4); expect(f.e.remainingToSpawn).toBe(0);
    expect(f.state.targets.filter(t => t.hp > 0 && t.profession === 'fastling')).toHaveLength(2);
  });
  it('source cancellation is idempotent, preserves existing bodies, and guard is not canceled by historical dead sources', () => {
    const f = fixture(), { plan, nest } = buildNest(f);
    cancelSmartSupports(f.host, plan.sourceId); cancelSmartSupports(f.host, plan.sourceId);
    expect(f.e.canceledToSpawn).toBe(6); expect(nest.hp).toBe(238); expect(f.e.remainingToSpawn).toBe(0);
    const guard = fixture(); guard.state.territory!.stage = 'guard'; Object.values(guard.state.territory!.sources).forEach(s => s.destroyed = true);
    guard.at(2); guard.at(6); expect(guard.state.targets.some(t => t.profession === 'nest-builder')).toBe(true);
  });
  it('never double-debits promises after the host already truncated the complete queue', () => {
    const f = fixture(); f.at(2); f.at(6); f.e.canceledToSpawn += f.e.remainingToSpawn; f.e.remainingToSpawn = 0;
    f.state.territory!.stage = 'bossPending'; f.at(7);
    expect(f.e.canceledToSpawn).toBe(7); expect(combatPopulation(f.state).broodReserved).toBe(0);
  });
});
describe('readable control and actual lane objectives', () => {
  it('freezes the announced landing and caps both pending and active slime at two', () => {
    const f = fixture(2); f.state.targets = [make('caster-a', 900, 1000, { profession: 'slime-caster', attackReady: 0 }), make('caster-b', 900, 1080, { profession: 'slime-caster', attackReady: 0 }), make('caster-c', 900, 920, { profession: 'slime-caster', attackReady: 0 })];
    f.state.targets.forEach(t => advanceSmartVirusActor(f.host, t)); expect(f.state.smartViruses!.slime).toHaveLength(2);
    const aim = { ...f.state.smartViruses!.slime[0].aim }; f.state.player.x += 150; f.at(.9); f.at(1.35);
    expect(f.state.smartViruses!.slime[0]).toMatchObject({ aim, phase: 'pool' });
  });
  it('death interrupts a windup but not a glob already in flight', () => {
    const f = fixture(2), actor = make('caster', 900, 1000, { profession: 'slime-caster', attackReady: 0 }); f.state.targets = [actor];
    advanceSmartVirusActor(f.host, actor); actor.hp = 0; f.at(.5); expect(f.state.smartViruses!.slime).toHaveLength(0);
    actor.hp = 68; actor.attackReady = 0; advanceSmartVirusActor(f.host, actor); f.at(1.4); actor.hp = 0; f.at(1.85);
    expect(f.state.smartViruses!.slime[0]?.phase).toBe('pool');
  });
  it('slows actual contact without stacking, damage or root; dash and airborne escape', () => {
    const f = fixture(2), p = { ...f.state.player };
    f.state.smartViruses = { serial: 2, slime: [0, 1].map(i => ({ id: `${i}`, actorId: 'x', wave: 2, origin: p, aim: p, phase: 'pool', warnedAt: 0, firesAt: 0, landsAt: 0, expiresAt: 3 })) };
    expect(playerSlimeMultiplier(f.state)).toBe(.72); expect(f.state.player.hp).toBe(100);
    f.state.player.dashUntil = 1; expect(playerSlimeMultiplier(f.state)).toBe(1); f.state.player.dashUntil = 0;
    f.state.player.x += 200; expect(playerSlimeMultiplier(f.state)).toBe(1); f.state.player.x = p.x; f.state.elapsed = 4; expect(playerSlimeMultiplier(f.state)).toBe(1);
  });
  it('ordinary and designated fastling raiders only target springs after front loss', () => {
    const f = fixture(), actor = make('raider', 900, 700, { springRaidLane: 'north' });
    expect(smartSpringRaidGoal(f.state, actor)?.id).toBe('heart-healing-1');
    f.state.territory!.nodes.find(n => n.id === 'front-north')!.owner = 'healthy'; expect(smartSpringRaidGoal(f.state, actor)).toBeUndefined();
    actor.profession = 'fastling'; f.state.territory!.nodes.find(n => n.id === 'front-north')!.owner = 'infected'; expect(smartSpringRaidGoal(f.state, actor)?.id).toBe('heart-healing-1');
    delete actor.springRaidLane; expect(smartSpringRaidGoal(f.state, actor)).toBeUndefined();
  });
});
