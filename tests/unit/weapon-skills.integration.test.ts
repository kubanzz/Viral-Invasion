import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { playerProjectilePopulation } from '../../src/game/playerProjectiles';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import type { WeaponId } from '../../src/game/expedition';
import type { GameEvent, InputFrame, Target } from '../../src/game/types';

/** Supplied combat state; inputs, projectile collisions, damage, pause and
 * wave-upgrade transactions all run through the production GameSession. */
function arena(weaponId: WeaponId = 'steady') {
  const game = new GameSession(1610, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, territory = state.territory!;
  state.world = { ...state.world!, obstacles: [] };
  Object.assign(state.player, { x: 1200, y: 750, hp: 100 });
  state.targets = []; state.effects = []; state.events = [];
  state.weaponCombat = createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 });
  if (state.expedition) state.expedition.loadout = { weaponId, rarity: 'white', upgrade: 0 };
  territory.stage = 'guard';
  for (const node of territory.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const source of Object.values(territory.sources)) Object.assign(source, { destroyed: true, spawned: true });
  Object.assign(e, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0, remainingToSpawn: 1,
    nextSpawnAt: Infinity, batchIndex: e.batchSchedule.length, batchMemberIndex: 0,
    territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
  const events: GameEvent[] = []; game.bus.on('event', event => events.push(structuredClone(event)));
  const target = (id: string, x = 1500, y = 750, hp = 10000) => {
    const body: Target = { id, x, y, hp, maxHp: hp, radius: 22, kind: 'single', role: 'event', hitUntil: 0, scanned: false, blocksWaveClear: false };
    state.targets.push(body); return body;
  };
  const aim = { x: 1800, y: 750 };
  const step = (extra: Partial<InputFrame> = {}) => game.step({ moveX: 0, moveY: 0, aim, fire: false, ...extra });
  const advance = (frames: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < frames; i++) step(extra); };
  return { game, state, e, territory, events, target, step, advance, aim };
}

describe('production weapon skill input and lifecycle integration', () => {
  it('dispatches slot 2 as a weapon skill while normal fire stays independent', () => {
    const f = arena(); f.target('capsule-target', 1300);
    f.step({ weaponSkill: { slot: 2, aim: f.aim }, fire: true });
    expect(f.state.tool).toBe(1); expect(f.state.weaponCombat!.cooldowns[2]).toBeCloseTo(f.state.elapsed + 9);
    expect(f.state.cooldowns[2]).toBe(0); expect(f.state.playerProjectiles).toHaveLength(0);
    f.advance(40, { fire: true });
    const hits = f.events.filter(event => event.type === 'TARGET_HIT');
    expect(hits.some(event => event.data.skillId === 'steady-repulse' && event.data.damageCategory === 'area' && event.data.damage === 68)).toBe(true);
    expect(hits.some(event => event.data.cause === 'basic' && event.data.weaponId === 'steady' && event.data.damageCategory === 'precision')).toBe(true);
  });
  it('preserves an accepted burst, cooldown and reservation exactly across pause, then resumes without catch-up debt', () => {
    const f = arena(); f.target('durable'); f.step({ weaponSkill: { slot: 1, aim: f.aim } }); f.advance(5);
    f.game.pause(); const runtime = structuredClone(f.state.weaponCombat), shots = structuredClone(f.state.playerProjectiles), elapsed = f.state.elapsed;
    f.advance(600, { fire: true, weaponSkill: { slot: 3, aim: f.aim } });
    expect(f.state.elapsed).toBe(elapsed); expect(f.state.weaponCombat).toEqual(runtime); expect(f.state.playerProjectiles).toEqual(shots);
    f.game.resume(); f.advance(35);
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'steady-burst')).toHaveLength(8);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
  });
  it('cancels the unlaunched tail on dash without refunding a cooldown or resurrecting needles', () => {
    const f = arena(); f.target('durable'); f.step({ weaponSkill: { slot: 1, aim: f.aim } }); f.advance(3);
    const before = f.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'steady-burst').length;
    const readyAt = f.state.weaponCombat!.cooldowns[1]; f.step({ dash: true, moveY: 1 }); f.advance(50);
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(readyAt);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0); expect(f.state.weaponCombat!.burst).toBeUndefined();
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'steady-burst')).toHaveLength(before);
  });
  it('clears accepted actions and all projectile obligations before opening a wave reward, without resetting skill cooldowns', () => {
    const f = arena('piercing'); f.step({ weaponSkill: { slot: 1, aim: f.aim } });
    expect(playerProjectilePopulation(f.state)).toBe(1); const readyAt = f.state.weaponCombat!.cooldowns[1];
    f.game.completeWave(8);
    expect(f.state.phase).toBe('paused'); expect(f.state.weaponCombat!.preparation).toBeUndefined();
    expect(playerProjectilePopulation(f.state)).toBe(0);
    const draft = f.state.endlessGrowth!.draft!;
    expect(f.game.chooseCombatUpgrade(draft.id, draft.options[0].id, f.state.growth!.runId)).toBe(true);
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(readyAt); f.advance(40);
    expect(f.events.some(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'piercing-heavy')).toBe(false);
  });
  it('lets contextual purification start beside a node without consuming the third weapon skill', () => {
    const f = arena(); const front = f.territory.nodes.find(node => node.id === 'front-north')!;
    front.owner = 'infected'; Object.assign(f.state.player, { x: front.x + 70, y: front.y });
    f.step({ territoryAction: true });
    expect(f.state.weaponCombat!.cooldowns[3]).toBe(0);
    f.advance(185);
    expect(front.owner).toBe('healthy'); expect(f.events.some(event => event.type === 'WEAPON_SKILL_CAST')).toBe(false);
  });
  it('rejects a skill when the player is already dead and leaves no delayed projectile or reservation', () => {
    const f = arena('piercing'); f.state.player.hp = 0;
    f.step({ weaponSkill: { slot: 1, aim: f.aim } });
    expect(f.state.result?.success).toBe(false); expect(playerProjectilePopulation(f.state)).toBe(0);
    expect(f.events.some(event => event.type === 'WEAPON_SKILL_CAST')).toBe(false);
  });
  it('freezes a committed heavy preparation across pause and resumes its original direction from the new actual position', () => {
    const f = arena('piercing'); f.target('original-line', 1600, 750);
    f.step({ weaponSkill: { slot: 1, aim: f.aim } }); f.advance(8);
    f.game.pause(); const held = structuredClone(f.state.weaponCombat), elapsed = f.state.elapsed;
    f.advance(120, { weaponSkill: { slot: 2, aim: f.aim } });
    expect(f.state.weaponCombat).toEqual(held); expect(f.state.elapsed).toBe(elapsed);
    f.game.resume(); f.advance(40, { moveY: 1, aim: { x: 1200, y: 1500 } });
    const launched = f.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'piercing-heavy');
    expect(launched).toHaveLength(1);
    expect(launched[0].data.y).toBeGreaterThan(750);
    expect(launched[0].data.aimY).toBeCloseTo(Number(launched[0].data.y));
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
  });
  it('cancels a committed heavy on actual launcher takeoff and rejects ground skills during flight', () => {
    const f = arena('piercing');
    f.territory.construction!.building = { id: 'fixture-launcher', blueprintId: 'launch-pod', builtAt: 0,
      x: 1200, y: 750, nodeId: 'core' };
    f.step({ weaponSkill: { slot: 1, aim: f.aim } }); f.advance(4);
    const readyAt = f.state.weaponCombat!.cooldowns[1];
    f.step({ cannonReleased: true, cannonAim: { x: 1500, y: 750 } });
    expect(f.state.playerFlight).toBeDefined(); expect(f.state.weaponCombat!.preparation).toBeUndefined();
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
    f.advance(30, { weaponSkill: { slot: 2, aim: f.aim }, fire: true });
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(readyAt); expect(f.state.weaponCombat!.cooldowns[2]).toBe(0);
    expect(f.events.some(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.skillId === 'piercing-heavy')).toBe(false);
    expect(f.events.some(event => event.type === 'WEAPON_SKILL_CAST' && event.data.slot === 2)).toBe(false);
    f.advance(30); expect(f.state.playerFlight).toBeUndefined(); expect(f.state.player.x).toBeCloseTo(1500);
  });
  it.each([
    ['steady', 1], ['steady', 2], ['piercing', 1], ['piercing', 2], ['piercing', 3],
  ] as const)('keeps %s skill %s behind the actual source supply membrane', (weaponId, slot) => {
    const f = arena(weaponId), source = f.target('protected-source', weaponId === 'steady' && slot === 2 ? 1320 : 1500, 750, 1200);
    Object.assign(source, { role: 'source', territorySourceId: 'source-west' });
    Object.assign(f.territory.sources['source-west'], { destroyed: false, spawned: true });
    f.territory.nodes.find(node => node.id === 'front-north')!.owner = 'infected';
    f.step({ weaponSkill: { slot, aim: source } }); f.advance(80);
    expect(source.hp).toBe(1200);
    expect(f.events.some(event => event.type === 'TERRITORY_SOURCE_PROTECTED')).toBe(true);
    expect(f.e.kills).toBe(0);
  });
  it('physically stops a primary crescent at a supplied source even after its outward damage budget is exhausted', () => {
    const f = arena('piercing');
    f.target('front', 1260); f.target('second', 1340);
    const source = f.target('protected-source', 1450, 750, 1200), behind = f.target('behind-source', 1540);
    Object.assign(source, { role: 'source', territorySourceId: 'source-west', radius: 35 });
    Object.assign(f.territory.sources['source-west'], { destroyed: false, spawned: true });
    f.territory.nodes.find(node => node.id === 'front-north')!.owner = 'infected';
    f.step({ fire: true }); f.advance(100);
    expect(source.hp).toBe(1200); expect(behind.hp).toBe(10000);
    expect(f.events.some(event => event.type === 'TERRITORY_SOURCE_PROTECTED')).toBe(true);
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_RETURNED')).toHaveLength(0);
  });
});
