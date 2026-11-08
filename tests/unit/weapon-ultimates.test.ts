import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { CampWeaponTrial } from '../../src/game/campWeaponTrial';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { advancePlayerProjectiles, launchPrimary, playerProjectilePopulation, type PlayerProjectileHost } from '../../src/game/playerProjectiles';
import { advanceWeaponSkills, cancelWeaponAction, castWeaponSkill, createWeaponCombat, launchWeaponPrimary, weaponPrimaryCooldown } from '../../src/game/weaponSkills';
import { castWeaponUltimate, creditWeaponBossDamage, creditWeaponKill, fillWeaponUltimate, weaponUltimateView } from '../../src/game/weaponUltimates';
import { playerIncomingDamage, setWeaponMitigation } from '../../src/game/weaponMelee';
import { BALANCE, type GameEvent, type InputFrame, type Target } from '../../src/game/types';
import type { DamageOrigin } from '../../src/game/growthTypes';
import type { WeaponId } from '../../src/game/expedition';
import { applyBladeTraceInput, resolveBladeIncomingDamage } from '../../src/game/bladeTechniques';
import { HEART_BOSS_BALANCE } from '../../src/game/motherCore';

function arena(id: WeaponId = 'steady') {
  const game = new GameSession(1920, { mode: 'endless' }); game.start();
  const state = game.state;
  Object.assign(state, { elapsed: 0, tick: 0, targets: [], playerProjectiles: [], events: [], effects: [],
    endlessGrowth: createEndlessGrowth(1920), weaponCombat: createWeaponCombat({ weaponId: id, rarity: id === 'thunder' || id === 'redblade' ? 'gold' : 'purple', upgrade: 0 }) });
  state.world = { width: 2200, height: 1600, bounds: { left: 0, right: 2200, top: 0, bottom: 1600 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 600, y: 800, hp: 100, facing: 0 });
  const aim = { x: 1100, y: 800 }, hits: { id: string; damage: number; origin: DamageOrigin }[] = [], events: GameEvent[] = [];
  const host: PlayerProjectileHost = { state, damage(target, amount, origin) {
    const actual = Math.min(Math.max(0, target.hp), amount); target.hp -= actual;
    if (actual > 0) hits.push({ id: target.id, damage: actual, origin: { ...origin } });
    creditWeaponBossDamage(state, target, actual, origin);
    if (actual > 0 && target.hp === 0) creditWeaponKill(state, target, origin);
    return actual;
  }, emit(type, data) { events.push({ type, data, tick: state.tick }); },
  effect(kind, from, to, radius, duration) { const effect = { id: state.effects.length, kind, from: { ...from }, to: { ...to }, radius, duration, born: state.elapsed }; state.effects.push(effect); return effect; } };
  const add = (name: string, x = 690, y = 800, hp = 1e8, extra: Partial<Target> = {}) => {
    const body: Target = { id: name, x, y, radius: 22, hp, maxHp: hp, role: 'virus', kind: 'single', hitUntil: 0, scanned: false, ...extra };
    state.targets.push(body); return body;
  };
  const step = (frames = 1, held = false) => { for (let n = 0; n < frames; n++) {
    if (state.phase === 'playing') { state.tick++; state.elapsed = state.tick * BALANCE.step; }
    advanceWeaponSkills(host, aim, BALANCE.step, held); advancePlayerProjectiles(host, BALANCE.step);
  } };
  return { state, host, aim, hits, events, add, step, stats: () => endlessCombatStats(state.endlessGrowth!) };
}

describe('kill-charged weapon ultimates', () => {
  it('credits each biological kill once with elite, structural and child weights, clamps full, and rejects false targets', () => {
    const f = arena(), origin: DamageOrigin = { cause: 'protocol', immuneCellId: 'owned-cell' };
    const ordinary = f.add('ordinary', 800, 800, 0);
    expect(creditWeaponKill(f.state, ordinary, origin)).toBe(2);
    expect(creditWeaponKill(f.state, ordinary, origin)).toBe(0);
    expect(creditWeaponKill(f.state, f.add('child', 800, 800, 0, { generation: 1 }), origin)).toBe(1);
    expect(creditWeaponKill(f.state, f.add('elite', 800, 800, 0, { role: 'elite' }), origin)).toBe(12);
    expect(creditWeaponKill(f.state, f.add('source', 800, 800, 0, { role: 'source' }), origin)).toBe(20);
    for (const role of ['event', 'capsule'] as const) expect(creditWeaponKill(f.state, f.add(role, 800, 800, 0, { role }), origin)).toBe(0);
    expect(creditWeaponKill(f.state, f.add('alive'), origin)).toBe(0);
    fillWeaponUltimate(f.state); expect(creditWeaponKill(f.state, f.add('overflow', 800, 800, 0), origin)).toBe(0);
    expect(weaponUltimateView(f.state)?.energy).toBe(100);
  });
  it('never charges from an ultimate or a delayed descendant carrying its provenance', () => {
    const f = arena();
    expect(creditWeaponKill(f.state, f.add('u', 800, 800, 0), { cause: 'ability', ultimateId: 'thunder-ultimate' })).toBe(0);
    expect(creditWeaponKill(f.state, f.add('descendant', 800, 800, 0), { cause: 'protocol', rootId: 'weapon:thunder:ultimate:1' })).toBe(0);
    expect(weaponUltimateView(f.state)?.energy).toBe(0);
  });
  it('rejects insufficient energy and projectile pressure without spending charge, then commits exactly once', () => {
    const f = arena(); expect(castWeaponUltimate(f.host, f.aim)).toBe(false);
    fillWeaponUltimate(f.state);
    for (let n = 0; n < 168; n++) launchPrimary(f.state, f.aim, f.stats(), `cap:${n}`);
    expect(castWeaponUltimate(f.host, f.aim)).toBe(false); expect(f.state.weaponCombat!.ultimateEnergy).toBe(100);
    f.state.playerProjectiles = []; expect(castWeaponUltimate(f.host, f.aim)).toBe(true);
    expect(castWeaponUltimate(f.host, f.aim)).toBe(false); expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
    expect(playerProjectilePopulation(f.state)).toBe(25);
  });
  it.each(['steady', 'piercing', 'thunder', 'redblade'] as const)('%s has an independent committed ultimate with true damage provenance', id => {
    const f = arena(id); f.add('durable', 700, 800, 1e8, { radius: 45 }); fillWeaponUltimate(f.state);
    expect(castWeaponUltimate(f.host, { x: 700, y: 800 })).toBe(true); f.step(250);
    expect(f.hits.length).toBeGreaterThan(0);
    expect(f.hits.every(hit => hit.origin.ultimateId === `${id}-ultimate`)).toBe(true);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST')).toHaveLength(1);
  });
  it('freezes a field on pause, retains charge across ordinary cancellation and clears commitments on wave/end cancellation', () => {
    const f = arena('thunder'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.aim); f.step(8);
    const pending = structuredClone(f.state.weaponCombat); f.state.phase = 'paused'; f.step(120);
    expect(f.state.weaponCombat).toEqual(pending);
    f.state.phase = 'playing'; f.state.weaponCombat!.ultimateEnergy = 40;
    cancelWeaponAction(f.state); expect(f.state.weaponCombat!.ultimate).toBeDefined();
    cancelWeaponAction(f.state, true); expect(f.state.weaponCombat!.ultimate).toBeUndefined();
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(40); expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
  });
  it('keeps radial and melee ultimate damage behind actual cover', () => {
    const f = arena('redblade'), body = f.add('behind', 770);
    f.state.world!.obstacles = [{ id: 'wall', x: 685, y: 800, radius: 36 }];
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.aim); f.step(200); expect(body.hp).toBe(1e8);
  });
});

describe('boss-damage ultimate energy', () => {
  it('awards the same energy for the same real HP loss across different hit counts and weapons', () => {
    for (const id of ['steady', 'piercing', 'thunder', 'redblade'] as const) {
      const one = arena(id), many = arena(id);
      const oneBoss = one.add('one', 700, 800, 1000, { role: 'core' });
      const manyBoss = many.add('many', 700, 800, 1000, { role: 'core' });
      one.host.damage(oneBoss, 250, { cause: 'basic', weaponId: id });
      for (let n = 0; n < 25; n++) many.host.damage(manyBoss, 10, { cause: 'basic', weaponId: id });
      expect(one.state.weaponCombat!.ultimateEnergy).toBe(50);
      expect(many.state.weaponCombat!.ultimateEnergy).toBe(50);
    }
  });
  it.each([
    { cause: 'ability', ultimateId: 'thunder-ultimate' },
    { cause: 'ability', skillId: 'redblade-ultimate' },
    { cause: 'protocol', rootId: 'weapon:steady:ultimate:1:descendant' },
    { cause: 'ability', ability: 'host-event' },
  ] satisfies DamageOrigin[])('rejects excluded damage provenance %j', origin => {
    const f = arena(), boss = f.add('boss', 700, 800, 1000, { role: 'core' });
    f.host.damage(boss, 100, origin);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
  });
  it('rejects non-boss, invalid, missing and inactive damage receipts', () => {
    const f = arena(), boss = f.add('boss', 700, 800, 1000, { role: 'core' });
    const origin: DamageOrigin = { cause: 'basic' };
    for (const amount of [0, -1, NaN, Infinity]) expect(creditWeaponBossDamage(f.state, boss, amount, origin)).toBe(0);
    expect(creditWeaponBossDamage(f.state, f.add('ordinary'), 100, origin)).toBe(0);
    expect(creditWeaponBossDamage(f.state, { ...boss }, 100, origin)).toBe(0);
    f.state.phase = 'paused'; expect(creditWeaponBossDamage(f.state, boss, 100, origin)).toBe(0);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
  });
});

describe('legendary weapon contracts', () => {
  it('runs the new compact trial domain without inheriting the retired execution dash refund', () => {
    const trial = new CampWeaponTrial({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
    expect(trial.skill(1)).toBe(true);
    for (let n = 0; n < 25; n++) trial.advance(.02);
    expect(trial.view.skills.find(view => view.slot === 1)!.remaining).toBeGreaterThan(0);
    expect(trial.skill(3)).toBe(true);
    for (let n = 0; n < 100; n++) trial.advance(.02);
    expect(trial.view.targets.some(body => body.hp <= 0)).toBe(true);
    expect(trial.view.skills.find(view => view.slot === 1)!.ready).toBe(false);
    expect(trial.snapshot().weaponCombat!.executionRefund).toBeUndefined();
    expect(trial.view.ultimate?.energy).toBe(0);
  });
  it('detonates charged targets immediately under one root without a retired spear reservation', () => {
    const f = arena('thunder'); f.add('durable', 850);
    launchWeaponPrimary(f.host, f.aim, f.stats(), 'prime'); f.step(1, true);
    const before = f.hits.length;
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    expect(f.hits.slice(before)).toHaveLength(1);
    expect(f.hits.at(-1)!.damage).toBeCloseTo(43 * 1.09 * 4);
    expect(f.hits.at(-1)!.origin.skillId).toBe('thunder-spear');
    expect(f.state.playerProjectiles).toHaveLength(0);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
    const cooldown = f.state.weaponCombat!.cooldowns[1]; cancelWeaponAction(f.state); f.step(20);
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(cooldown);
    expect(f.events.filter(event => event.type === 'THUNDER_DETONATE')).toHaveLength(1);
  });
  it('uses a bounded distinct field instead of the retired recursive-looking two-body projectile chain', () => {
    const f = arena('thunder'); f.state.endlessGrowth!.ranks = { multishot: 2, pierce: 3 };
    f.add('main', 700, 800, 1); f.add('chain-a', 760); f.add('chain-b', 780, 820); f.add('chain-c', 800, 840);
    launchWeaponPrimary(f.host, f.aim, f.stats(), 'lightning'); f.step(40);
    expect(f.events.filter(event => event.type === 'WEAPON_CHAIN_HIT')).toHaveLength(0);
    expect(f.hits.filter(hit => hit.origin.allowChain === false)).toHaveLength(4);
    expect(new Set(f.hits.map(hit => hit.id)).size).toBe(4);
  });
  it('uses actual near-range three-hit sword combos, resets after idle, and never launches fake sword bullets', () => {
    const f = arena('redblade'), near = f.add('near'), far = f.add('far', 1000);
    for (let n = 0; n < 3; n++) { expect(launchWeaponPrimary(f.host, f.aim, f.stats(), `combo:${n}`)).toBe(true); f.step(15); }
    expect(f.hits.filter(hit => hit.id === near.id).map(hit => Number(hit.damage.toFixed(4)))).toEqual([59.514, 65.4654, 111.2454]);
    expect(far.hp).toBe(1e8); expect(f.state.playerProjectiles).toHaveLength(0);
    f.step(60); launchWeaponPrimary(f.host, f.aim, f.stats(), 'reset');
    expect(f.events.filter(event => event.type === 'WEAPON_MELEE_SWING').at(-1)!.data.combo).toBe(1);
  });
  it('clips blade dash at walls and hits a body at most once throughout its travel', () => {
    const f = arena('redblade'); const near = f.add('near', 680, 780), wallBehind = f.add('behind', 860);
    f.state.world!.obstacles = [{ id: 'wall', x: 760, y: 800, radius: 35 }];
    castWeaponSkill(f.host, 1, f.aim); f.step(20);
    expect(f.state.player.x).toBeLessThanOrEqual(706.001); expect(f.hits.filter(hit => hit.id === near.id)).toHaveLength(1);
    expect(wallBehind.hp).toBe(1e8); expect(f.state.weaponCombat!.meleeDash).toBeUndefined();
  });
  it('travels exactly 220 from its accepted position without consuming a future step on the cast tick', () => {
    const f = arena('redblade'), before = { x: f.state.player.x, y: f.state.player.y };
    castWeaponSkill(f.host, 1, f.aim);
    advanceWeaponSkills(f.host, f.aim, BALANCE.step);
    expect(f.state.player.x).toBe(before.x); expect(f.state.player.y).toBe(before.y);
    f.step(20);
    expect(f.state.player.x - before.x).toBeCloseTo(220, 8);
    expect(f.state.player.y).toBe(before.y);
    expect(f.state.weaponCombat!.meleeDash).toBeUndefined();
  });
  it('applies the strongest active damage reduction without extending the short stronger window', () => {
    const f = arena('redblade'); setWeaponMitigation(f.state, 3, .65); setWeaponMitigation(f.state, .18, .3);
    expect(playerIncomingDamage(f.state, 20)).toBe(6); f.step(20); expect(playerIncomingDamage(f.state, 20)).toBe(13);
    f.step(200); expect(playerIncomingDamage(f.state, 20)).toBe(20);
  });
  it('does not refund the dash from domain kills or unrelated damage', () => {
    const f = arena('redblade'); f.state.weaponCombat!.cooldowns[1] = 6; castWeaponSkill(f.host, 3, f.aim);
    creditWeaponKill(f.state, f.add('unrelated', 1000, 800, 0), { cause: 'protocol' }); expect(f.state.weaponCombat!.cooldowns[1]).toBe(6);
    creditWeaponKill(f.state, f.add('domain', 1000, 800, 0), { cause: 'ability', castId: f.state.weaponCombat!.bladeDomain!.castId, skillId: 'redblade-domain' });
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(6);
    expect(f.state.weaponCombat!.executionRefund).toBeUndefined();
  });
  it('preserves the two-blade-per-leg ledger after JSON serialization', () => {
    const f = arena('piercing'); f.add('wide', 800, 800, 1e8, { radius: 120 }); castWeaponSkill(f.host, 3, f.aim);
    f.state.playerProjectiles = JSON.parse(JSON.stringify(f.state.playerProjectiles)); f.step(200);
    expect(f.hits.filter(hit => hit.origin.skillId === 'piercing-fan')).toHaveLength(4);
  });
});

function productionArena(id: WeaponId) {
  const game = new GameSession(1930, { mode: 'endless', territory: true }); game.start();
  const state = game.state, territory = state.territory!, e = state.endless!;
  state.world = { ...state.world!, obstacles: [] }; Object.assign(state.player, { x: 1200, y: 750, hp: 100 });
  state.targets = []; state.effects = []; state.events = [];
  state.weaponCombat = createWeaponCombat({ weaponId: id, rarity: id === 'thunder' || id === 'redblade' ? 'gold' : 'purple', upgrade: 0 });
  state.expedition!.loadout = { ...state.weaponCombat.loadout }; territory.stage = 'guard';
  for (const node of territory.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const source of Object.values(territory.sources)) Object.assign(source, { destroyed: true, spawned: true });
  Object.assign(e, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0, remainingToSpawn: 1, nextSpawnAt: Infinity,
    batchIndex: e.batchSchedule.length, batchMemberIndex: 0, territoryTasks: { wave: 8, reservedSlots: [], squads: [] },
    smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
  const events: GameEvent[] = []; game.bus.on('event', event => events.push(structuredClone(event)));
  const aim = { x: 1500, y: 750 };
  const add = (name: string, hp: number, extra: Partial<Target> = {}) => {
    const target: Target = { id: name, x: 1300, y: 750, hp, maxHp: hp, radius: 25, role: 'virus', kind: 'single',
      hitUntil: 0, scanned: false, waveId: 8, blocksWaveClear: true, ...extra };
    state.targets.push(target); return target;
  };
  const step = (input: Partial<InputFrame> = {}, frames = 1) => { for (let n = 0; n < frames; n++) game.step({ moveX: 0, moveY: 0, aim, fire: false, ...input }); };
  return { game, state, territory, e, events, aim, add, step };
}
describe('production ultimate integration', () => {
  it.each(['steady', 'piercing', 'thunder', 'redblade'] as const)('charges %s from actual primary hits on the real three-bar mother', id => {
    const f = productionArena(id);
    f.territory.stage = 'bossPending'; f.e.clearedWaves = f.e.wave; f.e.remainingToSpawn = 0;
    Object.assign(f.state.player, { x: 1300, y: 900 }); f.step();
    const boss = f.state.targets.find(target => target.id === f.territory.bossId)!;
    Object.assign(f.state.player, { x: boss.x - 100, y: boss.y });
    f.step({ fire: true, primaryHeld: true, aim: boss }, 12);
    const actual = f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === boss.id)
      .reduce((sum, event) => sum + Number(event.data.damage), 0);
    expect(actual).toBeGreaterThan(0);
    expect(f.state.weaponCombat!.ultimateEnergy).toBeCloseTo(actual / boss.maxHp * 200, 8);
    expect(f.events.some(event => event.type === 'WEAPON_ENERGY_CHANGED' && Number(event.data.gained) > 0)).toBe(true);
  });
  it('charges only accepted damage at bar boundaries and can cast a newly earned ultimate halfway through a live mother', () => {
    const f = productionArena('steady');
    f.territory.stage = 'bossPending'; f.e.clearedWaves = f.e.wave; f.e.remainingToSpawn = 0;
    Object.assign(f.state.player, { x: 1300, y: 900 }); f.step();
    const boss = f.state.targets.find(target => target.id === f.territory.bossId)!;
    expect(f.game.damage(boss, 100000, { cause: 'ability', rootId: 'bar-one' })).toBe(HEART_BOSS_BALANCE.barHp);
    expect(f.state.weaponCombat!.ultimateEnergy).toBeCloseTo(200 / 3, 8);
    expect(f.game.damage(boss, 100000, { cause: 'ability', rootId: 'bar-one' })).toBe(0);
    expect(f.state.weaponCombat!.ultimateEnergy).toBeCloseTo(200 / 3, 8);
    f.step();
    expect(f.game.damage(boss, 100000, { cause: 'ability', rootId: 'bar-one' })).toBe(0);
    expect(f.game.damage(boss, HEART_BOSS_BALANCE.barHp / 2, { cause: 'ability', rootId: 'bar-two' })).toBe(2700);
    expect(boss.hp).toBe(boss.maxHp / 2);
    expect(weaponUltimateView(f.state)?.ready).toBe(true);
    expect(f.events.filter(event => event.type === 'WEAPON_ENERGY_CHANGED' && event.data.ready)).toHaveLength(1);
    f.step({ weaponUltimate: { aim: boss } });
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST')).toHaveLength(1);
  });
  it('credits only the final real HP loss without a second core kill award or dead-body credit', () => {
    const f = productionArena('steady'), boss = f.add('wounded-core', 25, { role: 'core', maxHp: 1000 });
    expect(f.game.damage(boss, 10000, { cause: 'ability' })).toBe(25);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(5);
    expect(f.game.damage(boss, 10000, { cause: 'ability' })).toBe(0);
    expect(creditWeaponKill(f.state, boss, { cause: 'ability' })).toBe(0);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(5);
  });
  it('accepts a released thunder tap as one first pulse and leaves no held channel or delayed damage', () => {
    const f = productionArena('thunder'); f.add('tap-target', 10000);
    f.step({ primaryHeld: false, fire: true });
    const hits = () => f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === 'tap-target');
    expect(hits()).toHaveLength(1); expect(f.state.shots).toBe(1);
    expect(f.state.weaponCombat!.thunder!.channel).toBeUndefined();
    f.step({ primaryHeld: false, fire: false }, 20); expect(hits()).toHaveLength(1);
  });
  it('rejects a released thunder tap while primary is blocked or the player is dashing', () => {
    const f = productionArena('thunder'); f.add('blocked-tap', 10000);
    f.state.weaponCombat!.primaryBlockedUntil = 10;
    f.step({ primaryHeld: false, fire: true });
    f.state.weaponCombat!.primaryBlockedUntil = 0;
    f.step({ primaryHeld: false, fire: true, dash: true });
    expect(f.events.some(event => event.type === 'THUNDER_PULSE')).toBe(false);
    expect(f.state.shots).toBe(0);
  });
  it('keeps one held thunder channel damaging a real mother after a bar break with one transaction per pulse', () => {
    const f = productionArena('thunder');
    f.territory.stage = 'bossPending'; f.e.clearedWaves = f.e.wave; f.e.remainingToSpawn = 0;
    Object.assign(f.state.player, { x: 1300, y: 900 }); f.step();
    const boss = f.state.targets.find(target => target.id === f.territory.bossId)!;
    Object.assign(f.state.player, { x: boss.x - 100, y: boss.y });
    boss.hp = HEART_BOSS_BALANCE.barHp * 2 + 1;
    f.step({ primaryHeld: true, fire: false, aim: boss });
    expect(boss.hp).toBe(HEART_BOSS_BALANCE.barHp * 2);
    const channelId = f.state.weaponCombat!.thunder!.channel!.castId;
    f.step({ primaryHeld: true, fire: false, aim: boss }, 18);
    expect(f.state.weaponCombat!.thunder!.channel!.castId).toBe(channelId);
    expect(boss.hp).toBeLessThan(HEART_BOSS_BALANCE.barHp * 2);
    const hits = f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === boss.id && event.data.cause === 'basic');
    expect(hits.length).toBeGreaterThan(1);
    expect(new Set(hits.map(event => event.data.castId)).size).toBe(hits.length);
    expect(f.territory.bossCombat!.heartBoss!.blockedDamageTransactions).not.toContain(`cast:${channelId}`);
  });
  it('keeps every new thunder damage source behind a real powered source membrane', () => {
    const f = productionArena('thunder'), source = f.add('powered-source', 3000, { role: 'source', territorySourceId: 'source-west' });
    Object.assign(f.territory.sources['source-west'], { destroyed: false, spawned: true });
    f.territory.nodes.find(node => node.id === 'front-north')!.owner = 'infected';
    f.step({ primaryHeld: true }, 8);
    expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(0);
    for (const slot of [1, 2, 3] as const) f.step({ primaryHeld: true, weaponSkill: { slot, aim: source } });
    fillWeaponUltimate(f.state); f.step({ weaponUltimate: { aim: source } }); f.step({}, 390);
    expect(source.hp).toBe(3000);
    expect(f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === source.id)).toHaveLength(0);
  });
  it('retains thunder-dash movement when Space is pressed and lets its held primary continue', () => {
    const f = productionArena('thunder'); f.add('dash-target', 10000);
    f.step({ primaryHeld: true, weaponSkill: { slot: 3, aim: f.aim } });
    const from = f.state.player.x, until = f.state.weaponCombat!.thunder!.dash!.until;
    f.step({ primaryHeld: true, dash: true, moveY: 1 });
    expect(f.state.player.x).toBeGreaterThan(from);
    expect(f.state.player.dashUntil).toBe(0); expect(f.state.weaponCombat!.thunder!.dash!.until).toBe(until);
    expect(f.state.weaponCombat!.thunder!.channel).toBeDefined();
  });
  it('keeps strengthened four-mark damage inside one real boss bar and suppresses continuations from the same cast', () => {
    const f = productionArena('redblade');
    f.territory.stage = 'bossPending'; f.e.clearedWaves = f.e.wave; f.e.remainingToSpawn = 0;
    Object.assign(f.state.player, { x: 1300, y: 900 });
    f.step(); expect(f.territory.stage).toBe('boss');
    const boss = f.state.targets.find(target => target.id === f.territory.bossId)!;
    boss.hp = HEART_BOSS_BALANCE.barHp * 2 + 100;
    fillWeaponUltimate(f.state); f.step({ weaponUltimate: { aim: boss } });
    const trace = f.state.weaponCombat!.bladeTrace!;
    f.step({ bladeTrace: { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 12 } });
    expect(trace.phase).toBe('windup');
    f.step({}, 140);
    expect(boss.hp).toBe(HEART_BOSS_BALANCE.barHp * 2);
    expect(f.territory.bossCombat!.heartBoss!.stage).toBe(2);
    expect(f.territory.bossCombat!.heartBoss!.blockedDamageTransactions).toContain(`cast:${trace.castId}`);
    expect(f.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === boss.id)
      .map(event => event.data.damage)).toEqual([100]);
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_IMPACT')).toHaveLength(4);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
    expect(f.game.damage(boss, 100, { cause: 'ability', rootId: trace.castId, castId: trace.castId, ultimateId: 'redblade-ultimate' })).toBe(0);
    expect(f.game.damage(boss, 50, { cause: 'ability', rootId: 'independent-after-fourfold' })).toBe(50);
  });
  it('charges through actual primary collision and the unified positive-to-zero kill transaction exactly once', () => {
    const f = productionArena('steady'); f.add('natural-kill', 1); f.step({ fire: true }, 20);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(2);
    expect(f.events.filter(event => event.type === 'TARGET_CLEARED' && event.data.id === 'natural-kill')).toHaveLength(1);
  });
  it.each(['steady', 'piercing', 'thunder', 'redblade'] as const)('keeps %s ultimate behind the production source membrane and never self-charges', id => {
    const f = productionArena(id), source = f.add('protected-source', 3000, { role: 'source', territorySourceId: 'source-west' });
    Object.assign(f.territory.sources['source-west'], { destroyed: false, spawned: true });
    f.territory.nodes.find(node => node.id === 'front-north')!.owner = 'infected';
    if (id === 'redblade') f.add('blade-route-target', 1e8, { role: 'elite', x: 1250, y: 800 });
    fillWeaponUltimate(f.state); f.step({ weaponUltimate: { aim: { x: source.x, y: source.y } } }); f.step({}, 220);
    expect(source.hp).toBe(3000); expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST')).toHaveLength(1);
  });
  it('retains accumulated energy across a wave reward but cancels active damage commitments', () => {
    const f = productionArena('thunder'); f.state.weaponCombat!.ultimateEnergy = 64;
    f.game.completeWave(8); expect(f.state.weaponCombat!.ultimateEnergy).toBe(64);
    expect(f.state.weaponCombat!.ultimate).toBeUndefined(); expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
  });
  it('cancels mission-wave tracing and compact domain commitments while retaining earned energy', () => {
    const f = productionArena('redblade');
    f.state.expedition!.missionId = 'membrane';
    f.add('durable', 1e8);
    fillWeaponUltimate(f.state);
    f.step({ weaponSkill: { slot: 3, aim: f.aim } });
    f.step({ weaponUltimate: { aim: f.aim } });
    const runtime = f.state.weaponCombat!;
    expect(runtime.ultimate).toBeDefined();
    expect(runtime.bladeTrace).toBeDefined(); expect(runtime.bladeDomain).toBeDefined();
    runtime.ultimateEnergy = 42;
    const casts = f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST').length;
    f.game.completeWave(8);
    expect(runtime.ultimateEnergy).toBe(42);
    expect(runtime.ultimate).toBeUndefined(); expect(runtime.pendingActions).toBeUndefined();
    expect(runtime.bladeTrace).toBeUndefined(); expect(runtime.bladeDomain).toBeUndefined();
    expect(runtime.meleeDash).toBeUndefined(); expect(runtime.executionRefund).toBeUndefined();
    expect(runtime.reservedProjectiles).toBe(0); expect(f.state.playerProjectiles).toEqual([]);
    expect(runtime.overdriveUntil).toBeLessThanOrEqual(f.state.elapsed);
    expect(runtime.mitigations).toBeUndefined();
    f.step({}, 45);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST')).toHaveLength(casts);
    expect(runtime.ultimateEnergy).toBe(42);
  });
});

function measure(id: WeaponId, hp = 1e8, count = 1, duration = 30, withUltimate = true, initialEnergy = 0) {
  const f = arena(id); const bodies = Array.from({ length: count }, (_, i) => f.add(`bench:${i}`, 690 + i % 4 * 36, 800 + (Math.floor(i / 4) - Math.floor(count / 8)) * 36, hp, count === 1 ? { role: 'core' } : {}));
  f.state.weaponCombat!.ultimateEnergy = initialEnergy;
  if (initialEnergy > 0 && count === 1) Object.assign(f.aim, { x: bodies[0].x, y: bodies[0].y });
  const positions = bodies.map(body => ({ x: body.x, y: body.y }));
  let nextPrimary = 0, kills = 0, serial = 0;
  const respawnAt = new Map<Target, number>();
  for (let frame = 0; frame < duration * 60; frame++) {
    for (const body of bodies) if (body.hp <= 0) {
      if (!respawnAt.has(body)) { kills++; respawnAt.set(body, f.state.elapsed + .5); }
      if (f.state.elapsed + 1e-8 >= respawnAt.get(body)!) { body.hp = hp; body.id = `bench:respawn:${++serial}`; respawnAt.delete(body); }
    }
    for (const slot of [2, 3, 1] as const) castWeaponSkill(f.host, slot, f.aim);
    // Counter weapons are measured with an actual front hit in the perfect window.
    // The durable fixture is a boss, so an ordinary-virus execution cannot inflate it.
    if (id === 'redblade' && f.state.weaponCombat!.bladeParry && !f.state.weaponCombat!.bladeParry.resolved)
      resolveBladeIncomingDamage(f.host, 20, { source: bodies[0], id: `bench:attack:${frame}` });
    if (withUltimate && weaponUltimateView(f.state)?.ready) castWeaponUltimate(f.host, f.aim);
    const trace = f.state.weaponCombat!.bladeTrace;
    if (trace?.phase === 'drawing') applyBladeTraceInput(f.state, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 16 });
    if (f.state.elapsed >= nextPrimary && launchWeaponPrimary(f.host, f.aim, f.stats(), `bench:${frame}`)) nextPrimary = f.state.elapsed + weaponPrimaryCooldown(f.state, f.stats());
    f.step(1, id === 'thunder');
    // Controlled output fixture: cover, movement and target access are measured
    // in their own tests; displacement never removes a weapon's benchmark target.
    if (f.state.weaponCombat!.bladeTrace?.phase !== 'executing') Object.assign(f.state.player, { x: 600, y: 800 });
    bodies.forEach((body, i) => Object.assign(body, positions[i]));
    if (playerProjectilePopulation(f.state) > 192) throw new Error('projectile-cap');
  }
  return { damage: f.hits.reduce((sum, hit) => sum + hit.damage, 0), kills, ultimateCasts: f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST').length };
}
describe('measured weapon balance fixtures', () => {
  it('reports actual 30-second durable single target and 60-second finite-HP group throughput with natural energy', () => {
    const ids: WeaponId[] = ['steady', 'piercing', 'thunder', 'redblade'];
    const single = Object.fromEntries(ids.map(id => [id, measure(id, 1e8, 1, 30, false)]));
    const singleWithOneStoredUltimate = Object.fromEntries(ids.map(id => [id, measure(id, 1e8, 1, 30, true, 100)]));
    const groups = Object.fromEntries([34, 51, 68].map(hp => [hp, Object.fromEntries(ids.map(id => [id, measure(id, hp, 12, 60, true)]))]));
    const groupsWithoutUltimate = Object.fromEntries([34, 51, 68].map(hp => [hp, Object.fromEntries(ids.map(id => [id, measure(id, hp, 12, 60, false)]))]));
    console.info('WEAPON_BALANCE_REPORT ' + JSON.stringify({ configuration: { singleSeconds: 30, groupSeconds: 60,
      targetCount: 12, respawnDelay: .5, maximumPopulation: 48, maximumProjectiles: 192, startingEnergy: 0,
      redblade: 'actual perfect-counter input; manual four-point tracing; durable targets classified as bosses' },
      singleWithoutUltimate: single, singleWithOneStoredUltimate, groupsWithNaturalUltimate: groups, groupsWithoutUltimate }));
    const bestPurpleSingle = Math.max(single.steady.damage, single.piercing.damage);
    for (const id of ['redblade'] as const) {
      expect(single[id].damage / bestPurpleSingle).toBeGreaterThanOrEqual(1.25);
      expect(single[id].damage / bestPurpleSingle).toBeLessThanOrEqual(1.4);
    }
    const bestPurpleStoredSingle = Math.max(singleWithOneStoredUltimate.steady.damage, singleWithOneStoredUltimate.piercing.damage);
    for (const id of ['redblade'] as const) {
      expect(singleWithOneStoredUltimate[id].damage / bestPurpleStoredSingle).toBeGreaterThanOrEqual(1.25);
      // Fourfold's v0.22 corridor and mark damage deliberately increase the
      // stored-ultimate ceiling; its ordinary rotation retains the 1.4 cap.
      expect(singleWithOneStoredUltimate[id].damage / bestPurpleStoredSingle).toBeLessThanOrEqual(id === 'redblade' ? 1.55 : 1.4);
    }
    expect(Object.values(singleWithOneStoredUltimate).every(value => value.ultimateCasts === 1 && value.kills === 0)).toBe(true);
    for (const group of Object.values(groups)) {
      const bestPurple = Math.max(group.steady.kills, group.piercing.kills);
      expect(group.thunder.kills / bestPurple).toBeGreaterThanOrEqual(1.5);
      expect(group.thunder.kills / bestPurple).toBeLessThanOrEqual(2);
      expect(group.redblade.kills / bestPurple).toBeGreaterThanOrEqual(1.45);
      expect(group.redblade.kills / bestPurple).toBeLessThanOrEqual(2);
    }
    expect(Object.values(groups).every(group => Object.values(group).every(value => value.kills > 0 && value.ultimateCasts > 0))).toBe(true);
  });
});
