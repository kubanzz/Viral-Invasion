import { describe, expect, it } from 'vitest';
import { BattleDirector, type BattleHost } from '../../src/game/battle';
import { EndlessDirector } from '../../src/game/endless';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import { activeWorld, type GameEvent, type Target } from '../../src/game/types';
import type { ViralCapsuleState } from '../../src/game/viralCapsulesTypes';
import { advanceViralCapsules, makeViralCapsuleCarrier, releaseViralCapsule, terminateViralCapsule,
  viralCapsulePlan, viralCapsuleReservedPopulation, VIRAL_CAPSULE_BALANCE, type ViralCapsuleHost } from '../../src/game/viralCapsules';

type CapsuleTarget = Target & { viralCapsule?: ViralCapsuleState; viralCapsuleCarrier?: { stock: 0 | 1 } };
function fixture(wave = 5) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.world = { ...activeWorld(state), obstacles: [] }; state.targets = []; state.elapsed = 10; state.tick = 600;
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0, remainingToSpawn: 0 });
  const events: GameEvent[] = []; let endless: EndlessDirector;
  const emit = (type: string, data: GameEvent['data']) => { const event = { type, data, tick: state.tick }; events.push(event); state.events.push(event); endless.recordEvent(event); };
  const host: EndlessHost = { state, emit, effect() {}, message() {}, completeWave() {} };
  endless = new EndlessDirector(host); endless.beforeInput();
  const warning = events.find(event => event.type === 'ENDLESS_WAVE_WARNING')!;
  state.elapsed += e.warningSeconds; state.tick = Math.round(state.elapsed * 60); endless.beforeInput(); endless.afterInput();
  const battleHost: BattleHost = { state, emit, effect() {}, message() {}, finish() {} };
  const battle = new BattleDirector(battleHost);
  const carrier = state.targets.find(actor => (actor as CapsuleTarget).viralCapsuleCarrier) as CapsuleTarget;
  const at = (seconds: number) => { state.elapsed += seconds; state.tick = Math.round(state.elapsed * 60); battle.afterInput(); };
  return { session, state, e, events, warning, endless, battle, carrier, at };
}

function flightFixture(wave = 5, objective: 'player' | 'tissue' = 'player') {
  const f = fixture(wave), state = f.state;
  Object.assign(state.player, { x: 1000, y: 600 }); Object.assign(state.tissue, { x: 1600, y: 900 });
  const carrier: Target = { id: 'detached-fixture', x: 700, y: 600, radius: 22, hp: 0, maxHp: 68,
    role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [],
    viralCapsuleCarrier: makeViralCapsuleCarrier('detached-fixture', wave, objective, wave >= 15) };
  state.targets = [carrier];
  const host: ViralCapsuleHost = { get state() { return state; }, emit(type, data) { f.events.push({ type, data, tick: state.tick }); },
    damagePlayer(_target, amount) { if (state.elapsed < state.player.dashUntil) return false; state.player.hp -= amount; return true; },
    damageTissue(_target, amount) { state.tissue.hp -= amount; return true; } };
  releaseViralCapsule(host, carrier, 'death');
  const mother = state.targets.find(actor => actor.role === 'capsule')!;
  const step = (count = 1) => { for (let frame = 0; frame < count; frame++) {
    state.tick++; state.elapsed = state.tick / 60; advanceViralCapsules(host);
    expect(viralCapsuleReservedPopulation(state)).toBeLessThanOrEqual(24);
    expect(state.targets.filter(actor => actor.role === 'capsule' && actor.hp > 0).length).toBeLessThanOrEqual(4);
  } };
  return { ...f, carrier, host, mother, step };
}

function interceptionFixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
  state.world = { ...activeWorld(state), obstacles: [] };
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 1500, y: 900 });
  Object.assign(state.endless!, { wave: 6, phase: 'combat', phaseUntil: 0, remainingToSpawn: 0, spawnSerial: 1, totalToSpawn: 1 });
  const carrier: Target = { id: 'intercept-carrier', x: 700, y: 500, radius: 22, hp: 0, maxHp: 68, deadAt: 0,
    role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], viralCapsuleCarrier: makeViralCapsuleCarrier('intercept-carrier', 6, 'player', false) };
  const sentinel: Target = { id: 'unrelated-live-fixture', x: 2100, y: 1200, radius: 22, hp: 10000, maxHp: 10000,
    role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], attackReady: Infinity };
  state.targets = [carrier, sentinel];
  releaseViralCapsule({ state, emit(type, data) { state.events.push({ type, data, tick: state.tick }); }, damagePlayer() { return false; }, damageTissue() { return false; } }, carrier, 'death');
  const capsule = state.targets.find(actor => actor.role === 'capsule')!;
  const before = { kills: state.endless!.kills, combo: state.endless!.combo, score: state.endless!.score, xp: state.growth!.xp,
    research: state.growth!.research, battleKills: state.battle!.stats.kills };
  const input = { moveX: 0, moveY: 0, fire: false, aim: { x: capsule.x, y: capsule.y } };
  return { session, state, capsule, before, input };
}

describe('finite detached viral capsules', () => {
  it('announces one original elite/pressure carrier, with no carriers added to harvest waves', () => {
    for (const [wave, slot, objective] of [[5, 0, 'player'], [6, 1, 'tissue'], [8, 1, 'tissue'], [15, 0, 'player'], [16, 1, 'tissue']] as const) {
      const f = fixture(wave);
      expect(f.warning.data.capsuleCarrierSlot).toBe(slot); expect(f.warning.data.capsuleObjective).toBe(objective);
      expect(f.warning.data.capsuleFork).toBe(wave >= 15); expect(f.carrier?.viralCapsuleCarrier?.stock).toBe(1);
      expect(f.state.targets.filter(actor => (actor as CapsuleTarget).viralCapsuleCarrier)).toHaveLength(1);
      expect(f.e.spawnSerial + f.e.canceledToSpawn + f.e.remainingToSpawn).toBe(f.e.totalToSpawn);
    }
    for (const wave of [2, 3, 4, 7, 9, 12, 14, 17]) {
      const f = fixture(wave); expect(f.carrier).toBeUndefined(); expect(f.warning.data.capsuleCarrierSlot).toBeUndefined();
    }
  });

  it('consumes the one stock before death callbacks and creates only an announced interceptable body, with no instant damage', () => {
    const f = fixture(); expect(f.carrier).toBeDefined();
    Object.assign(f.carrier, { x: f.state.player.x + 200, y: f.state.player.y, hp: 0, traits: [] });
    const before = { player: f.state.player.hp, tissue: f.state.tissue.hp, budget: f.e.remainingToSpawn, serial: f.e.spawnSerial };
    f.battle.cleared(f.carrier); f.battle.cleared(f.carrier);
    const capsules = f.state.targets.filter(actor => (actor as CapsuleTarget).viralCapsule);
    expect(capsules).toHaveLength(1); expect(f.carrier.viralCapsuleCarrier!.stock).toBe(0);
    expect(capsules[0].hp).toBeGreaterThan(0); expect((capsules[0] as CapsuleTarget).viralCapsule!.phase).toBe('warning');
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(1);
    expect(f.state.player.hp).toBe(before.player); expect(f.state.tissue.hp).toBe(before.tissue);
    expect(f.e.remainingToSpawn).toBe(before.budget); expect(f.e.spawnSerial).toBe(before.serial);
  });

  it('finishes a real carrier warning before a live release and cannot release again on later death', () => {
    const f = fixture(); expect(f.carrier).toBeDefined();
    f.state.targets = [f.carrier]; Object.assign(f.carrier, { traits: [], attackReady: 0 });
    f.at(1 / 60); expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_CARRIER_WARNED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(0);
    f.at(.79); expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(0);
    f.at(.02); expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(1);
    f.carrier.hp = 0; f.battle.cleared(f.carrier);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(1);
  });

  it('moves only after its warning, locks aim, and produces one actual collision rather than automatic death damage', () => {
    const f = flightFixture(), origin = { x: f.mother.x, y: f.mother.y };
    f.step(47); expect({ x: f.mother.x, y: f.mother.y }).toEqual(origin); expect(f.state.player.hp).toBe(100);
    f.step(2); expect(f.mother.x).toBeGreaterThan(origin.x); expect(f.state.player.hp).toBe(100);
    f.step(100); expect(f.state.player.hp).toBe(88); expect(f.mother.hp).toBe(0);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_HIT')).toHaveLength(1);
    f.step(100); expect(f.state.player.hp).toBe(88);
    const dodge = flightFixture(); dodge.state.player.y += 100; dodge.step(250);
    expect(dodge.state.player.hp).toBe(100); expect(dodge.mother.viralCapsule!.aim).toEqual({ x: 1000, y: 600 });
    expect(dodge.mother.viralCapsule!.terminalReason).toBe('range');
  });

  it('stops at inflated walls, expires without kill credit, and freezes while paused', () => {
    const wall = flightFixture(); wall.state.world!.obstacles = [{ id: 'cover', x: 850, y: 600, radius: 30 }];
    wall.step(200); expect(wall.mother.viralCapsule!.terminalReason).toBe('wall'); expect(wall.mother.x).toBeCloseTo(806);
    expect(wall.state.player.hp).toBe(100); expect(wall.events.some(event => event.type === 'TARGET_CLEARED' && event.data.id === wall.mother.id)).toBe(false);
    const paused = flightFixture(), before = structuredClone(paused.mother); paused.state.phase = 'paused'; paused.step(30);
    expect(paused.mother).toEqual(before); paused.state.phase = 'playing';
    paused.mother.viralCapsule!.expiresAt = paused.state.elapsed; paused.step();
    expect(paused.mother.viralCapsule!.terminalReason).toBe('expired');
    expect(paused.events.some(event => event.type === 'TARGET_CLEARED' && event.data.id === paused.mother.id)).toBe(false);
  });

  it('lets a mother interception prevent both branches, otherwise creates at most two independently warned fixed branches', () => {
    const cut = flightFixture(15); terminateViralCapsule(cut.host, cut.mother); cut.step(200);
    expect(cut.state.targets.filter(actor => actor.viralCapsule)).toHaveLength(1);
    expect(cut.events.some(event => event.type === 'VIRAL_CAPSULE_SPLIT')).toBe(false);
    const split = flightFixture(15); split.step(90);
    const children = split.state.targets.filter(actor => actor.viralCapsule?.generation === 1);
    expect(children).toHaveLength(2); expect(split.mother.hp).toBe(0);
    expect(split.mother.viralCapsule!.terminalReason).toBe('split');
    expect(children.map(actor => actor.viralCapsule!.objective)).toEqual(['player', 'tissue']);
    expect(children.every(actor => actor.viralCapsule!.warningUntil > actor.born!)).toBe(true);
    expect(children.every(actor => actor.viralCapsule!.expiresAt === split.mother.viralCapsule!.expiresAt)).toBe(true);
    const aims = children.map(actor => structuredClone(actor.viralCapsule!.aim)); split.state.player.y += 200; split.step(5);
    expect(children.map(actor => actor.viralCapsule!.aim)).toEqual(aims);
    expect(split.events.filter(event => event.type === 'VIRAL_CAPSULE_SPLIT')).toHaveLength(1);
  });

  it('keeps lethal collision receipts and skips a later capsule intercepted by an earlier synchronous receipt', () => {
    const lethal = flightFixture(); lethal.state.player.hp = 12; lethal.step(160);
    expect(lethal.state.player.hp).toBe(0);
    expect(lethal.events.filter(event => event.type === 'VIRAL_CAPSULE_HIT')).toHaveLength(1);
    expect(lethal.mother.viralCapsule!.terminalReason).toBe('hit-player');
    const f = flightFixture();
    const other: Target = { ...f.carrier, id: 'second-carrier', viralCapsuleCarrier: makeViralCapsuleCarrier('second-carrier', 5, 'player', false) };
    releaseViralCapsule(f.host, other, 'death');
    const second = f.state.targets.find(actor => actor.viralCapsule?.carrierId === other.id)!;
    const damagePlayer = f.host.damagePlayer;
    f.host.damagePlayer = (target, amount) => { const actual = damagePlayer(target, amount); terminateViralCapsule(f.host, second); return actual; };
    f.step(160);
    expect(second.viralCapsule!.terminalReason).toBe('intercepted'); expect(f.state.player.hp).toBe(88);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_HIT')).toHaveLength(1);
  });

  it('fizzles once at the shared population limit without stealing a promised fission child or queue slot', () => {
    const f = fixture(6); expect(f.carrier).toBeDefined();
    f.state.targets = [f.carrier, ...Array.from({ length: 22 }, (_, index): Target => ({ id: `full-${index}`, x: 300 + index * 50,
      y: 300, radius: 22, hp: 68, maxHp: 68, role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], attackReady: Infinity }))];
    f.carrier.traits = ['FISSION']; expect(viralCapsuleReservedPopulation(f.state)).toBe(24);
    const budget = f.e.remainingToSpawn; f.carrier.hp = 0; f.battle.cleared(f.carrier);
    expect(f.carrier.splitPositions).toHaveLength(2); expect(viralCapsuleReservedPopulation(f.state)).toBe(24);
    expect(f.carrier.viralCapsuleCarrier!.stock).toBe(0); expect(f.state.targets.some(actor => actor.role === 'capsule')).toBe(false);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_FIZZLED')).toHaveLength(1);
    expect(f.events.find(event => event.type === 'VIRAL_CAPSULE_FIZZLED')!.data.reason).toBe('population-cap');
    expect(f.e.remainingToSpawn).toBe(budget); f.battle.cleared(f.carrier);
    expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_FIZZLED')).toHaveLength(1);
  });

  it('keeps living capsule bodies in wave-clear obligations while rejecting their score and combo receipts', () => {
    const f = fixture(); f.carrier.hp = 0; f.carrier.traits = []; f.battle.cleared(f.carrier);
    const capsule = f.state.targets.find(actor => actor.role === 'capsule')!;
    for (const actor of f.state.targets) if (actor.role !== 'capsule') { actor.hp = 0; delete actor.splitAt; }
    Object.assign(f.e, { remainingToSpawn: 0, pendingChildren: 0 }); f.endless.afterInput(); expect(f.e.phase).toBe('combat');
    const before = { score: f.e.score, kills: f.e.kills, combo: f.e.combo };
    capsule.hp = 0; f.endless.recordEvent({ type: 'TARGET_CLEARED', tick: f.state.tick, data: { id: capsule.id } });
    expect({ score: f.e.score, kills: f.e.kills, combo: f.e.combo }).toEqual(before);
    f.battle.cleared(capsule); f.endless.afterInput(); expect(f.e.phase).toBe('intermission');
  });

  it('keeps carrier selection out of support and owned source quotas and has fixed wave-only damage limits', () => {
    expect(viralCapsulePlan(6, ['source', 'support'])).toBeUndefined();
    const f = fixture(6); expect(viralCapsulePlan(6, f.e.batchSchedule.flatMap(batch => batch.roles), { ...f.e.source!, quotaSlots: [1] })).toBeUndefined();
    expect(flightFixture(5).mother.viralCapsule).toMatchObject({ playerDamage: 12, tissueDamage: 10, speed: 220 });
    expect(flightFixture(500).mother.viralCapsule).toMatchObject({ playerDamage: 32, tissueDamage: 20 });
    expect(VIRAL_CAPSULE_BALANCE.maximumBodies).toBe(4);
  });

  it('lets real primary input intercept one capsule with no virus kill, combo, XP, research or chain award', () => {
    const f = interceptionFixture(); f.state.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 3 }];
    f.session.step({ ...f.input, fire: true, tool: 1 });
    expect(f.capsule.hp).toBe(0); expect(f.capsule.viralCapsule!.terminalReason).toBe('intercepted');
    expect({ kills: f.state.endless!.kills, combo: f.state.endless!.combo, score: f.state.endless!.score, xp: f.state.growth!.xp,
      research: f.state.growth!.research, battleKills: f.state.battle!.stats.kills }).toEqual(f.before);
    expect(f.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === f.capsule.id)).toHaveLength(1);
    expect(f.state.events.filter(event => event.type === 'VIRAL_CAPSULE_TERMINATED' && event.data.id === f.capsule.id)).toHaveLength(1);
    expect(f.state.events.some(event => event.type === 'PROTOCOL_CHAIN_HIT')).toBe(false);
    expect(f.state.tissue.hp).toBe(100); expect(f.state.player.hp).toBe(100);
  });

  it('lets real Q-deployed cells walk into contact and intercept without issuing virus kill rewards', () => {
    const f = interceptionFixture(); f.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced', rank: 1 }];
    f.session.step({ ...f.input, scan: true });
    for (let frame = 0; frame < 50 && f.capsule.hp > 0; frame++) f.session.step(f.input);
    expect(f.capsule.hp).toBe(0); expect(f.capsule.viralCapsule!.terminalReason).toBe('intercepted');
    const hits = f.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === f.capsule.id);
    expect(hits.length).toBeGreaterThan(0); expect(hits.every(event => event.data.protocolId === 'IMMUNE_BEACON' && Number(event.data.damage) > 0)).toBe(true);
    expect(hits.reduce((sum, event) => sum + Number(event.data.damage), 0)).toBe(20);
    expect(f.state.endless!.kills).toBe(f.before.kills); expect(f.state.endless!.score).toBe(f.before.score); expect(f.state.growth!.xp).toBe(f.before.xp);
    expect(f.state.player.hp).toBe(100);
  });

  it('lets real tool2 damage the capsule through its accepted delayed blast', () => {
    const f = interceptionFixture(); f.session.step({ ...f.input, fire: true, tool: 2 });
    for (let frame = 0; frame < 65 && f.capsule.hp > 0; frame++) f.session.step(f.input);
    expect(f.capsule.hp).toBe(0); expect(f.capsule.viralCapsule!.terminalReason).toBe('intercepted');
    expect(f.state.events.some(event => event.type === 'TARGET_HIT' && event.data.id === f.capsule.id && Number(event.data.damage) > 0)).toBe(true);
    expect(f.state.endless!.kills).toBe(f.before.kills); expect(f.state.growth!.xp).toBe(f.before.xp);
  });
});
