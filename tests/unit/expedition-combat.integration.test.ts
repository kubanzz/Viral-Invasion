import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { CampProfileStore } from '../../src/meta/campProfile';
import { combatPopulation } from '../../src/game/combatPopulation';
import { ritualMotherShielded } from '../../src/game/ritual';
import type { GameEvent, InputFrame, Target } from '../../src/game/types';
import type { RitualProjectile } from '../../src/game/ritualTypes';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { HEART_BOSS_BALANCE } from '../../src/game/motherCore';

/** These are supplied late-battle states followed by real production input,
 * collision, damage, phase and storage transactions; not natural-play evidence. */
function arena(runId: string) {
  const values = new Map<string, string>();
  const camp = new CampProfileStore({ getItem: k => values.get(k) ?? null,
    setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } });
  const game = new GameSession(1515, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, events: GameEvent[] = [];
  const departure = camp.beginExpedition(runId, state.seed); game.configureExpedition(departure);
  state.territory!.recordId = runId;
  state.world = { ...state.world!, obstacles: [] }; state.targets = []; state.effects = [];
  Object.assign(state.player, { x: 1200, y: 750, hp: 100 });
  state.territory!.stage = 'guard';
  for (const n of state.territory!.nodes) Object.assign(n, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const s of Object.values(state.territory!.sources)) Object.assign(s, { destroyed: true, spawned: true });
  for (const d of Object.values(state.territory!.defense)) Object.assign(d, { repelled: true, handoff: true });
  Object.assign(e, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0, remainingToSpawn: 1,
    nextSpawnAt: Infinity, batchIndex: e.batchSchedule.length, batchMemberIndex: 0,
    territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
  state.smartViruses = { serial: 0, slime: [], ritual: { serial: 0, encounters: [], projectiles: [] } };
  game.bus.on('event', event => {
    events.push(structuredClone(event));
    if (event.type === 'TERRITORY_RESCUE_COMPLETED' && state.expedition?.pendingLoot)
      camp.settleVictory(state.expedition.runId, state.expedition.pendingLoot);
    if (event.type === 'RUN_ENDED' && state.result?.success === false) camp.abandonExpedition(runId);
  });
  const step = (extra: Partial<InputFrame> = {}) => game.step({ moveX: 0, moveY: 0, aim: { x: 2000, y: 750 }, fire: false, ...extra });
  const advance = (frames: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < frames && state.phase === 'playing'; i++) step(extra); };
  const rewards = () => ({ score: e.score, kills: e.kills, xp: state.growth!.xp, research: state.growth!.research });
  return { game, state, e, camp, events, step, advance, rewards };
}
function projectile(id: string, x = 1450, y = 750): RitualProjectile {
  return { id: `ritual:orb:${id}`, actorId: 'absent-priest', encounterId: 'fixture-ritual', wave: 8,
    x, y, hp: 68, radius: 17, angle: Math.PI, phase: 'flight', born: 0, firesAt: 0, expiresAt: 20,
    aim: { x: 1200, y: 750 }, tracking: true };
}
const body = (id: string, x: number, y: number, extra: Partial<Target> = {}): Target => ({
  id, x, y, hp: 204, maxHp: 204, radius: 22, kind: 'single', role: 'virus', hitUntil: 0, scanned: false,
  born: 0, sourceId: 'endless:wave:8', waveId: 8, blocksWaveClear: true, traits: [], ...extra,
});

describe('production session intercepts non-biological projectiles', () => {
  it('ordinary capsules hit twice through real swept collision without granting kills, XP or score', () => {
    const f = arena('provided-primary'); f.state.smartViruses!.ritual!.projectiles = [projectile('primary')];
    const before = f.rewards(); f.advance(35, { fire: true, tool: 1 });
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_HIT')).toHaveLength(2);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(1);
    expect(f.events.some(e => e.type === 'PLAYER_PROJECTILE_HIT' && e.data.kind === 'primary')).toBe(true);
    expect(f.state.smartViruses!.ritual!.projectiles).toEqual([]); expect(f.rewards()).toEqual(before);
    expect(combatPopulation(f.state).reserved).toBe(0); expect(f.state.player.hp).toBe(100);
  });
  it('the actual self repulse intercepts both nearby projectiles immediately without reaching toward the aim', () => {
    const f = arena('provided-energy');
    f.state.smartViruses!.ritual!.projectiles = [projectile('energy-a', 1300), projectile('energy-b', 1320, 778)];
    const before = f.rewards(); f.step({ weaponSkill: { slot: 2, aim: { x: 1900, y: 750 } } });
    expect(f.events.find(e => e.type === 'PLAYER_CANNON_EXPLODED')?.data).toMatchObject({
      x: 1200, y: 750, radius: 190, visual: 'pulse-ring', skillId: 'steady-repulse',
    });
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_HIT').map(e => e.data.damage)).toEqual([68, 68]);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(2);
    expect(f.state.smartViruses!.ritual!.projectiles).toEqual([]); expect(f.rewards()).toEqual(before); expect(f.state.player.hp).toBe(100);
  });
  it('the self aftershock intercepts an injured projectile that enters its smaller radius after the main ring', () => {
    const f = arena('provided-aftershock'); f.state.endlessGrowth!.ranks.catalysis = 1;
    f.state.smartViruses!.ritual!.projectiles = [projectile('initial-blast', 1300)];
    f.step({ weaponSkill: { slot: 2, aim: { x: 1500, y: 750 } } });
    const blast = f.events.find(e => e.type === 'PLAYER_CANNON_EXPLODED')!; expect(blast).toBeDefined();
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(1);
    // The reinforced repulse also emits a second pulse at .25s. Supply this
    // separate injured body after both pulses so this test isolates catalysis.
    f.advance(16);
    const later = projectile('aftershock', Number(blast.data.x) + 165); later.hp = 25;
    f.state.smartViruses!.ritual!.projectiles = [later];
    const before = f.rewards(); f.advance(3);
    expect(later.hp).toBe(25); expect(later.x).toBeLessThan(1365);
    expect(f.events.some(e => e.type === 'PLAYER_CANNON_AFTERSHOCK')).toBe(false); f.advance(5);
    const shock = f.events.find(e => e.type === 'PLAYER_CANNON_AFTERSHOCK')!;
    expect(shock.data).toMatchObject({ x: 1200, y: 750, radius: 190 * .75 }); expect(shock.tick - blast.tick).toBe(21);
    expect(f.events.some(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED' && e.data.id === later.id)).toBe(true);
    expect(f.events.find(e => e.type === 'RITUAL_PROJECTILE_HIT' && e.data.id === later.id)?.data.damage).toBe(25);
    expect(f.state.smartViruses!.ritual!.projectiles).toEqual([]); expect(f.rewards()).toEqual(before); expect(f.state.player.hp).toBe(100);
  });
  it('the reinforced storm outward and return legs together intercept a durable moving homing body', () => {
    const f = arena('provided-sword');
    const loadout = { weaponId: 'piercing' as const, rarity: 'white' as const, upgrade: 0 };
    f.state.expedition!.loadout = loadout; f.state.weaponCombat = createWeaponCombat(loadout);
    // A legal in-flight heading while its homing turn catches up to a player who changed sides.
    // It remains a real moving/tracking projectile; no per-frame state or clock intervention occurs.
    const orb = projectile('sword', 1360); orb.angle = 0; orb.hp = 124;
    f.state.smartViruses!.ritual!.projectiles = [orb];
    const before = f.rewards(); f.step({ weaponSkill: { slot: 3, aim: { x: 1700, y: 750 } } });
    for (let n = 0; n < 40 && !f.events.some(e => e.type === 'RITUAL_PROJECTILE_HIT'); n++) f.step();
    expect(orb.hp).toBe(68); expect(orb.x).toBeGreaterThan(1360);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(0);
    expect(f.events.find(e => e.type === 'PLAYER_PROJECTILE_HIT' && e.data.targetId === orb.id)?.data).toMatchObject({
      visual: 'storm-crescent', flightPhase: 'outbound', damage: 56,
    });
    for (let n = 0; n < 40 && !f.events.some(e => e.type === 'PLAYER_PROJECTILE_RETURNED'); n++) f.step();
    expect(f.state.playerProjectiles?.some(p => p.visual === 'storm-crescent' && p.flightPhase === 'returning' && p.damage === 28)).toBe(true);
    f.advance(60);
    expect(f.events.some(e => e.type === 'WEAPON_SKILL_CAST' && e.data.skillId === 'piercing-fan')).toBe(true);
    expect(f.events.some(e => e.type === 'PLAYER_PROJECTILE_HIT' && e.data.kind === 'sword')).toBe(true);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(1);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_HIT' && e.data.id === orb.id).map(e => e.data.damage)).toEqual([56, 56, 12]);
    expect(f.events.find(e => e.type === 'PLAYER_PROJECTILE_HIT' && e.data.targetId === orb.id && e.data.flightPhase === 'returning')?.data.damage).toBe(12);
    expect(f.state.smartViruses!.ritual!.projectiles).toEqual([]); expect(f.state.player.hp).toBe(100); expect(f.rewards()).toEqual(before);
  });
  it('a real dash slash intercepts at the actual post-dash player position', () => {
    const f = arena('provided-dash-slash'); f.state.endlessGrowth!.ranks.dash = 2;
    f.state.smartViruses!.ritual!.projectiles = [projectile('dash-slash')]; const before = f.rewards();
    f.step({ dash: true, moveX: 1 }); f.advance(15);
    expect(f.state.player.x).toBeGreaterThan(1200);
    expect(f.events.some(e => e.type === 'COMBAT_ABILITY_HIT' && e.data.ability === 'dash' && e.data.id === 'ritual:orb:dash-slash')).toBe(true);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(1);
    expect(f.rewards()).toEqual(before);
  });
  it('a reentrant pause on an accepted ritual fire cannot advance that projectile or hurt the player', () => {
    const f = arena('provided-reentrant-fire'), priest = body('reentrant-priest', 1250, 750, { profession: 'ritual-priest' });
    f.state.targets = [priest];
    const orb = projectile('reentrant', priest.x); Object.assign(orb, { actorId: priest.id, phase: 'charging', firesAt: 1 / 60 });
    f.state.smartViruses!.ritual!.projectiles = [orb];
    f.game.bus.on('event', e => { if (e.type === 'RITUAL_PROJECTILE_FIRED') f.game.pause(); });
    f.step(); expect(f.state.phase).toBe('paused'); expect(orb.x).toBe(priest.x); expect(f.state.player.hp).toBe(100);
  });
  it('an accepted launcher flight lands with an intercepting blast without duplicate player bodies or rewards', () => {
    const f = arena('provided-launch');
    f.state.territory!.construction!.building = { id: 'supplied-built-pod', blueprintId: 'launch-pod', builtAt: 0,
      x: 1200, y: 750, nodeId: 'core' };
    f.state.smartViruses!.ritual!.projectiles = [projectile('launch', 1500)];
    const before = f.rewards(); f.step({ cannonReleased: true, cannonAim: { x: 1500, y: 750 } });
    expect(f.state.playerFlight).toBeDefined();
    f.advance(50);
    expect(f.events.some(e => e.type === 'TERRITORY_CANNON_EXPLODED' && Number(e.data.hits) === 1)).toBe(true);
    expect(f.events.filter(e => e.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toHaveLength(1);
    expect(f.state.playerFlight).toBeUndefined(); expect(f.state.player.x).toBeCloseTo(1500);
    expect(f.state.player.hp).toBe(100); expect(f.rewards()).toEqual(before);
  });
});

describe('production ritual shield and biological death transactions', () => {
  it('uses actual bullet damage on priests and opens the mother only after the third real death', () => {
    const f = arena('provided-shield');
    const mother = body('ritual-mother', 1400, 750, { profession: 'ritual-mother', hp: 408, maxHp: 408, radius: 32 });
    const priests = [body('priest-a', 1400, 600, { profession: 'ritual-priest' }),
      body('priest-b', 1400, 900, { profession: 'ritual-priest' }), body('priest-c', 1700, 600, { profession: 'ritual-priest' })];
    f.state.targets = [mother, ...priests];
    f.state.smartViruses!.ritual!.encounters = [{ id: 'fixture-ritual', motherId: mother.id, priestIds: priests.map(p => p.id), wave: 8,
      born: 0, nextCastAt: Object.fromEntries(priests.map(p => [p.id, Infinity])), nextGroupFireAt: 100, shieldBroken: false }];
    f.advance(35, { fire: true, aim: mother }); expect(mother.hp).toBe(408); expect(f.e.kills).toBe(0);
    for (const [index, priest] of priests.entries()) {
      for (let n = 0; n < 150 && priest.hp > 0 && f.state.phase === 'playing'; n++) f.step({ fire: true, aim: priest });
      expect(priest.hp).toBe(0); expect(ritualMotherShielded(f.state, mother)).toBe(index !== 2);
    }
    f.advance(40, { fire: true, aim: mother });
    expect(mother.hp).toBeLessThan(408); expect(f.e.kills).toBe(3);
    expect(f.events.filter(e => e.type === 'TARGET_CLEARED' && String(e.data.id).startsWith('priest-'))).toHaveLength(3);
  });
});

function readyBoss(runId: string) {
  const f = arena(runId), territory = f.state.territory!;
  territory.stage = 'bossPending'; f.e.wave = 3; f.e.clearedWaves = 3; f.e.remainingToSpawn = 0;
  f.e.territoryTasks = { wave: 3, reservedSlots: [], squads: [] }; f.e.smartSupport = { wave: 3, reservedSlots: [], plans: [] };
  Object.assign(f.state.player, { x: 1300, y: 900 });
  f.step(); expect(territory.stage).toBe('boss');
  const boss = f.state.targets.find(t => t.id === territory.bossId)!;
  expect(boss.maxHp).toBe(HEART_BOSS_BALANCE.hp); expect(territory.bossCombat!.heartExpedition).toBe(true);
  // Supply the late recovery window; actual input must deliver the finishing hit.
  boss.hp = 34; boss.exposedUntil = 100;
  territory.bossCombat!.heartBoss!.stage = 3;
  territory.bossCombat!.membrane.remaining = 0; territory.bossCombat!.membrane.floorRatio = 0;
  territory.bossCombat!.seenTraits = [...territory.bossCombat!.traits];
  return { ...f, boss, territory };
}

describe('Boss reward remains provisional until actual final purification', () => {
  it('creates one visible pending drop, pickup does not bank it, and three-second purification settles once', () => {
    const f = readyBoss('provided-victory');
    const last = f.territory.nodes.find(n => n.id === 'front-south')!; last.owner = 'infected';
    f.advance(6, { fire: true, aim: f.boss });
    expect(f.boss.hp).toBe(0); expect(f.territory.stage).toBe('cleanup');
    expect(f.state.expedition!.pendingLoot).toBeDefined(); expect(f.camp.data.materials).toBe(0); expect(f.camp.data.campUnlocked).toBe(false);
    const loot = structuredClone(f.state.expedition!.pendingLoot!);
    Object.assign(f.state.player, { x: f.boss.x, y: f.boss.y }); f.step();
    expect(f.state.expedition!.lootCollected).toBe(true); expect(f.camp.data.claimedRewardIds).toEqual([]);
    Object.assign(f.state.player, { x: last.x - 80, y: last.y }); f.step({ territoryAction: true }); f.advance(185);
    expect(f.territory.stage).toBe('victory'); expect(f.state.phase).toBe('paused');
    expect(f.camp.data.campUnlocked).toBe(true); expect(f.camp.data.victories).toBe(1); expect(f.camp.data.materials).toBe(40);
    expect(f.camp.data.claimedRewardIds).toEqual([loot.id]);
    expect(f.events.filter(e => e.type === 'EXPEDITION_BOSS_LOOT_DROPPED')).toHaveLength(1);
    expect(f.events.filter(e => e.type === 'TERRITORY_RESCUE_COMPLETED')).toHaveLength(1);
    expect(f.camp.settleVictory(loot.runId, loot).code).toBe('duplicate'); expect(f.camp.data.materials).toBe(40);
  });
  it('automatically collects an unvisited drop at successful cleanup', () => {
    const f = readyBoss('provided-auto-collect'); f.advance(6, { fire: true, aim: f.boss });
    expect(f.territory.stage).toBe('victory'); expect(f.state.expedition!.lootCollected).toBe(true);
    expect(f.events.some(e => e.type === 'EXPEDITION_LOOT_COLLECTED')).toBe(false);
    expect(f.camp.data.claimedRewardIds).toHaveLength(1); expect(f.camp.data.victories).toBe(1);
  });
  it('does not bank provisional loot when the player dies during final cleanup', () => {
    const f = readyBoss('provided-cleanup-loss'); f.territory.nodes.find(n => n.id === 'front-south')!.owner = 'infected';
    f.advance(6, { fire: true, aim: f.boss }); expect(f.state.expedition!.pendingLoot).toBeDefined();
    f.state.player.hp = 1; f.state.playerInfection = { until: 100, nextTickAt: f.state.elapsed + 1 / 60 };
    f.step(); expect(f.state.result?.success).toBe(false); expect(f.state.phase).toBe('result');
    expect(f.camp.data.claimedRewardIds).toEqual([]); expect(f.camp.data.materials).toBe(0); expect(f.camp.data.activeExpedition).toBeUndefined();
  });
  it('gives same-tick infection death priority over the actual finishing projectile and rescue award', () => {
    const f = readyBoss('provided-same-tick-loss');
    f.state.player.hp = 1; f.state.playerInfection = { until: 100, nextTickAt: (f.state.tick + 5) / 60 };
    f.advance(5, { fire: true, aim: f.boss });
    expect(f.boss.hp).toBe(0); expect(f.state.result?.success).toBe(false);
    expect(f.territory.rescueSnapshot).toBeUndefined(); expect(f.camp.data.victories).toBe(0);
    expect(f.events.some(e => e.type === 'TERRITORY_RESCUE_COMPLETED')).toBe(false);
  });
  it('gives a real same-tick heart-core attack priority over the Boss finishing hit', () => {
    const f = readyBoss('provided-core-death');
    f.state.tissue.hp = 1;
    const attacker = body('provided-core-attacker', f.state.tissue.x + 30, f.state.tissue.y, {
      sourceId: 'endless:wave:3', waveId: 3, assaultObjective: 'tissue', tactic: 'melee',
      attackTarget: 'tissue', attackAim: { x: f.state.tissue.x, y: f.state.tissue.y },
      attackAt: (f.state.tick + 5) / 60, attackReady: 100,
    });
    f.state.targets.push(attacker); f.advance(5, { fire: true, aim: f.boss });
    expect(f.boss.hp).toBe(0); expect(f.state.tissue.hp).toBe(0); expect(f.state.result?.success).toBe(false);
    expect(f.territory.rescueSnapshot).toBeUndefined(); expect(f.camp.data.claimedRewardIds).toEqual([]);
    expect(f.events.some(e => e.type === 'TERRITORY_RESCUE_COMPLETED')).toBe(false);
  });
});
