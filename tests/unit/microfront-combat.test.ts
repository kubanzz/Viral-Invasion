import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { MISSION_COMBAT, MISSION_LOOT_POLICY, missionDeathHaul } from '../../src/game/missionCombat';
import { growthContext, GrowthController } from '../../src/game/growth';
import type { ExpeditionDeparture } from '../../src/game/expedition';
import type { GameEvent, InputFrame, Target } from '../../src/game/types';
import type { MissionId } from '../../src/game/microfront';
import { distance, normalized } from '../../src/actors/collision';
import { waypoint } from '../helpers/g3Driver';

function mission(id: MissionId = 'membrane', modules: ExpeditionDeparture['modules'] = []) {
  const game = new GameSession(20261105, { mode: 'endless', territory: true }); game.start();
  const departure: ExpeditionDeparture = { runId: `mission:${id}`, seed: game.state.seed,
    loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 }, blueprints: [], extraAntibodies: 0, firstClear: true,
    missionId: id, modules };
  const events: GameEvent[] = []; game.bus.on('event', event => events.push(structuredClone(event)));
  game.configureExpedition(departure);
  return { game, state: game.state, events, departure };
}
function step(game: GameSession, frames = 1, extra: Partial<InputFrame> = {}) {
  for (let n = 0; n < frames; n++) game.step({ moveX: 0, moveY: 0, aim: game.state.player, fire: false, ...extra });
}
function acceptedDamage(game: GameSession, target: Target, amount = target.hp) {
  return (game as unknown as { damage(t: Target, n: number): number }).damage(target, amount);
}

describe('finite microfront missions', () => {
  it('uses a deterministic one-in-eight ordinary drop sample without reducing special drops', () => {
    const f = mission(); let count = 0;
    const body: Target = { id: '', role: 'virus', kind: 'single', hp: 0, maxHp: 34,
      x: 1000, y: 1000, radius: 22, hitUntil: 0, scanned: false };
    for (let index = 0; index < 10000; index++) {
      const target = { ...body, id: `virus-${index}` }, haul = missionDeathHaul(f.state, target);
      expect(missionDeathHaul(f.state, target)).toEqual(haul);
      if (haul.coins) { count++; expect(haul.coins).toBe(MISSION_LOOT_POLICY.ordinaryCoins); }
      else expect(haul).toEqual({ coins: 0, materials: 0, fragments: {}, items: [] });
    }
    expect(MISSION_LOOT_POLICY.ordinaryDropDenominator).toBe(8);
    expect(count).toBeGreaterThan(1000); expect(count).toBeLessThan(1500);
    expect(missionDeathHaul(f.state, { ...body, id: 'fixed-source', role: 'source' }).items).toHaveLength(1);
  });
  it('freezes camp modules, keeps basic Q and never opens combat, XP, milestone or research drafts', () => {
    const f = mission('membrane', [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 2 }]);
    f.departure.modules![0].rank = 3;
    expect(f.state.growth!.equipped).toEqual([{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 2 }]);
    step(f.game, 1, { scan: true }); expect(f.state.growth!.cells).toHaveLength(3);
    for (let wave = 1; wave <= 10; wave++) f.game.completeWave(wave);
    expect(f.state.phase).toBe('playing'); expect(f.state.endlessGrowth!.draft).toBeNull();
    expect(f.state.growth!.draft).toBeNull(); expect(f.state.growth!.pendingResearch).toBeNull();
    const c = new GrowthController(2);
    c.state.research = 100;
    const context = growthContext(f.state);
    c.rewardEndlessMilestone(5, context);
    expect(c.requestResearch('test', context).kind).toBe('rejected');
    expect(c.openResearch('test', context).kind).toBe('rejected');
    expect(c.state.draft).toBeNull(); expect(c.state.research).toBe(100);
  });

  it('receives a real death drop once, accumulates materials/fragments/items and keeps it readable on failure', () => {
    const f = mission(); step(f.game, 125);
    const source = f.state.targets.find(target => target.role === 'source')!;
    const front = f.state.territory!.nodes.find(node => node.id === 'front-north')!;
    front.owner = 'healthy'; front.infectionProgress = 0;
    expect(source.hp).toBe(MISSION_COMBAT.membrane.sourceHp);
    acceptedDamage(f.game, source);
    const haul = structuredClone(f.state.expedition!.haul!);
    expect(haul.materials).toBe(4); expect(haul.items).toHaveLength(1);
    expect(Object.values(haul.fragments).reduce((a, b) => a + (b ?? 0), 0)).toBe(2);
    const receipt = f.events.find(event => event.type === 'MISSION_LOOT_COLLECTED')!;
    expect(receipt.data.actorId).toBe(source.id); expect(receipt.data.x).toBe(source.x);
    f.game.emit('TARGET_CLEARED', { id: source.id });
    expect(f.state.expedition!.haul).toEqual(haul);
    f.game.finish(false, '测试撤离');
    expect(f.state.expedition!.haul).toEqual(haul);
    expect(f.events.filter(event => event.type === 'MISSION_LOOT_COLLECTED')).toHaveLength(1);
  });

  it('a carried chain module produces real extra damage from a production bullet kill', () => {
    const f = mission('membrane', [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 2 }]);
    // Supplied quiet field isolates weapon-to-module dispatch. Only ordinary
    // production projectile collision and damage perform the kill and chain.
    f.state.endless!.phaseUntil = Infinity;
    Object.assign(f.state.player, { x: 1100, y: 900 });
    const target = (id: string, x: number, y: number, hp: number): Target => ({ id, x, y, hp, maxHp: hp,
      role: 'virus', kind: 'single', radius: 22, hitUntil: 0, scanned: false, sourceId: 'endless:wave:1', traits: [] });
    const first = target('chain-root', 1250, 900, 34), second = target('chain-neighbor', 1280, 1000, 200);
    f.state.targets = [first, second];
    step(f.game, 20, { fire: true, aim: first });
    expect(first.hp).toBe(0);
    expect(f.events.some(event => event.type === 'TARGET_HIT' && event.data.id === second.id
      && event.data.cause === 'protocol' && event.data.protocolId === 'PURIFY_CHAIN' && Number(event.data.damage) > 0)).toBe(true);
    expect(f.state.growth!.equipped[0].rank).toBe(2);
  });

  it('first assignment needs an actually purified front and killed source, then wins without a mother', () => {
    const f = mission();
    // Supplied end-of-budget fixture; purification and source death below use
    // ordinary production input/damage, not fabricated success events.
    const e = f.state.endless!;
    Object.assign(e, { wave: 3, clearedWaves: 3, phase: 'combat', remainingToSpawn: 0, nextSpawnAt: Infinity,
      batchIndex: e.batchSchedule.length, territoryTasks: { wave: 3, squads: [], reservedSlots: [] } });
    step(f.game);
    const source = f.state.targets.find(target => target.role === 'source')!;
    const front = f.state.territory!.nodes.find(node => node.id === 'front-north')!;
    Object.assign(f.state.player, { x: front.x, y: front.y });
    step(f.game, 180, { territoryAction: true });
    expect(front.firstPurified).toBe(true); expect(f.state.result).toBeNull();
    acceptedDamage(f.game, source); step(f.game);
    expect(f.state.result?.success).toBe(true); expect(f.state.phase).toBe('result');
    expect(f.events.some(event => event.type === 'TERRITORY_BOSS_STARTED')).toBe(false);
    expect(f.events.filter(event => event.type === 'TERRITORY_RESCUE_COMPLETED')).toHaveLength(1);
    expect(f.state.expedition!.haul!.items).toHaveLength(1);
  });

  it('second assignment waits for both fronts, both sources and a real elite death', () => {
    const f = mission('corridor'), e = f.state.endless!;
    Object.assign(e, { wave: 4, clearedWaves: 4, phase: 'combat', remainingToSpawn: 0, nextSpawnAt: Infinity,
      batchIndex: e.batchSchedule.length, territoryTasks: { wave: 4, squads: [], reservedSlots: [] } });
    step(f.game);
    for (const front of f.state.territory!.nodes.filter(node => node.kind === 'front')) {
      Object.assign(f.state.player, { x: front.x, y: front.y }); step(f.game, 180, { territoryAction: true });
    }
    for (const source of f.state.targets.filter(target => target.role === 'source')) acceptedDamage(f.game, source);
    step(f.game); expect(f.state.result).toBeNull();
    const elite: Target = { id: 'provided-elite', role: 'elite', kind: 'single', hp: 170, maxHp: 170,
      x: 1400, y: 1000, radius: 30, hitUntil: 0, scanned: false, sourceId: 'endless:wave:4', traits: [] };
    f.state.targets.push(elite); acceptedDamage(f.game, elite); step(f.game);
    expect(f.state.result?.success).toBe(true);
    expect(f.events.some(event => event.type === 'TERRITORY_BOSS_STARTED')).toBe(false);
  });

  it('keeps the third assignment behind the full finite budget and mother encounter', () => {
    const f = mission('boundary');
    for (const node of f.state.territory!.nodes) { node.owner = 'healthy'; node.infectionProgress = 0; }
    for (const source of Object.values(f.state.territory!.sources)) source.destroyed = true;
    const e = f.state.endless!;
    Object.assign(e, { phase: 'intermission', wave: 4, clearedWaves: 4, phaseUntil: Infinity });
    step(f.game); expect(f.state.territory!.stage).toBe('rescue');
    Object.assign(e, { wave: 5, clearedWaves: 5 }); step(f.game);
    expect(f.state.territory!.stage).toBe('boss');
    expect(f.state.targets.find(target => target.role === 'core')?.hp).toBe(1100);
    expect(f.state.result).toBeNull();
    const boss = f.state.targets.find(target => target.role === 'core')!;
    f.state.territory!.bossCombat!.membrane.remaining = 0;
    f.state.territory!.bossCombat!.seenTraits = [...f.state.territory!.bossCombat!.traits];
    acceptedDamage(f.game, boss, boss.maxHp * 10); step(f.game);
    expect(f.state.result?.success).toBe(true);
    expect(f.state.expedition!.haul!.items).toHaveLength(0);
    expect(f.state.expedition!.pendingLoot).toBeDefined();
    expect(f.state.expedition!.missionId).toBe('boundary');
  });

  it('initial white equipment clears the first mission through actual movement, shooting and purification', () => {
    const f = mission(), s = f.state;
    for (let frame = 0; frame < 60 * 360 && s.phase === 'playing'; frame++) {
      const front = s.territory!.nodes.find(node => node.id === 'front-north')!;
      const live = s.targets.filter(target => target.hp > 0);
      const mobile = live.filter(target => target.role !== 'source').sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
      const source = live.find(target => target.role === 'source');
      const target = mobile && distance(mobile, s.player) < 450 ? mobile : source ?? mobile;
      const fountain = s.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
      const healing = s.player.hp < 45;
      const destination = healing ? fountain : front.owner !== 'healthy' ? front : source ?? target ?? fountain;
      const stopRange = destination === front || destination === fountain ? 70 : 300;
      const next = waypoint(s, destination), go = distance(s.player, destination) > stopRange;
      let move = go ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
      if (mobile && distance(mobile, s.player) < 125 && !(front.owner === 'infected' && distance(front, s.player) < 120))
        move = normalized(s.player.x - mobile.x, s.player.y - mobile.y);
      const slot = mobile && distance(mobile, s.player) < 155 ? 2 : target ? 1 : undefined;
      f.game.step({ moveX: move.x, moveY: move.y, aim: target ?? destination, fire: !!target,
        territoryAction: true, scan: frame % 180 === 0,
        ...(slot ? { weaponSkill: { slot, aim: target ?? destination } } : {}) });
    }
    expect({ result: s.result, hp: s.player.hp, core: s.tissue.hp, seconds: s.elapsed,
      wave: s.endless!.wave, cleared: s.endless!.clearedWaves, sources: s.territory!.sources,
      targets: s.targets.filter(t => t.hp > 0).map(t => ({ id: t.id, hp: t.hp, x: t.x, y: t.y })) }).toMatchObject({ result: { success: true } });
    expect(s.endlessGrowth!.level).toBe(0); expect(s.growth!.equipped).toEqual([]);
    expect(f.events.some(event => event.type === 'COMBAT_UPGRADE_COMMITTED' || event.type === 'PROTOCOL_DRAFT_OPENED')).toBe(false);
    expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(3);
    const births = f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.missionBaseBudget === true);
    expect(births).toHaveLength(MISSION_COMBAT.membrane.waves.reduce((sum, value) => sum + value, 0));
    const cleared = new Set(f.events.filter(event => event.type === 'TARGET_CLEARED').map(event => event.data.id));
    expect(births.every(event => cleared.has(event.data.id))).toBe(true);
    for (const [index, budget] of MISSION_COMBAT.membrane.waves.entries())
      expect(births.filter(event => event.data.wave === index + 1)).toHaveLength(budget);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    expect(s.expedition!.haul!.materials).toBeGreaterThan(0);
  }, 20000);
});
