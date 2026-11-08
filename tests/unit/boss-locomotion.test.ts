import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, moveWithCollision } from '../../src/actors/collision';
import { BOSS_LOCOMOTION, bossStraightEnd } from '../../src/game/bossLocomotion';
import { MotherCoreController, HEART_BOSS_BALANCE } from '../../src/game/motherCore';
import type { MotherCoreCommand, MotherCoreContext, MotherCoreState } from '../../src/game/motherCoreTypes';
import { BALANCE, type Player, type Target, type WorldGeometry } from '../../src/game/types';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { applyBladeTraceInput } from '../../src/game/bladeTechniques';
import { castWeaponUltimate, fillWeaponUltimate } from '../../src/game/weaponUltimates';

function fixture(stage: 1 | 2 | 3 = 1, expedition = true, restored?: MotherCoreState) {
  const core: Target = { id: 'moving-boss', x: 1100, y: 800, radius: 52, hp: HEART_BOSS_BALANCE.hp,
    maxHp: HEART_BOSS_BALANCE.hp, kind: 'single', role: 'core', traits: ['CARAPACE'], hitUntil: 0, scanned: false };
  const player: Player = { x: 900, y: 800, radius: 19, hp: 100, facing: 0, moving: false,
    dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 };
  const geometry: WorldGeometry = { width: 2400, height: 1600, bounds: { left: 0, right: 2400, top: 0, bottom: 1600 },
    obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  const controller = new MotherCoreController({ coreId: core.id, organId: 'heart', traits: ['CARAPACE'],
    tick: 0, elapsed: 0, heartExpedition: expedition }, restored);
  if (controller.state.heartBoss) {
    controller.state.heartBoss.stage = stage;
    core.hp = HEART_BOSS_BALANCE.barHp * (4 - stage);
  }
  const context: MotherCoreContext = { tick: 0, elapsed: 0, active: true, core, player, geometry,
    tissue: { x: 1200, y: 1100, radius: 40, hp: 100, maxHp: 100 }, liveGuardCount: 0 };
  const commands: MotherCoreCommand[] = [];
  const step = () => {
    context.tick++; context.elapsed = context.tick * BALANCE.step;
    const next = controller.tick(context);
    for (const command of next) {
      if (command.kind === 'move') Object.assign(core, moveWithCollision(core, command.delta, core.radius, geometry));
      if (command.kind === 'damagePlayer') player.hp -= command.amount;
    }
    commands.push(...next); return next;
  };
  const advance = (seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) step(); };
  const nextLunge = () => {
    for (let n = 0; n < 2400 && controller.state.attack?.kind !== 'heart-lunge'; n++) step();
    expect(controller.state.attack?.kind).toBe('heart-lunge'); return structuredClone(controller.state.attack!);
  };
  return { core, player, geometry, controller, context, commands, step, advance, nextLunge };
}

describe('authoritative mother core hunting locomotion', () => {
  it.each([1, 2, 3] as const)('actually moves a stage %s body between attacks, with capped step distance and frozen locked warnings', stage => {
    const f = fixture(stage); f.player.x = 400;
    const initial = { x: f.core.x, y: f.core.y }; let moved = 0;
    for (let n = 0; n < 10 * 60; n++) {
      const before = { x: f.core.x, y: f.core.y }, attack = f.controller.state.attack;
      f.step();
      const travel = distance(before, f.core); moved += travel;
      expect(travel).toBeLessThanOrEqual(BOSS_LOCOMOTION.lunge.speed[stage - 1] * BALANCE.step + 1e-5);
      expect(isLegalPosition(f.core, f.core.radius, f.geometry)).toBe(true);
      if (attack && f.controller.state.attack?.id === attack.id) {
        expect(travel).toBe(0); expect(f.controller.state.attack.origin).toEqual(attack.origin);
      }
    }
    expect(moved).toBeGreaterThan(120); expect(distance(initial, f.core)).toBeGreaterThan(70);
    expect(f.commands.some(command => command.kind === 'move')).toBe(true);
  });
  it('routes pursuit around full-body obstacles and never leaves world bounds', () => {
    const f = fixture(); f.player.x = 450;
    f.geometry.obstacles = [{ id: 'fold', x: 900, y: 800, radius: 90 }];
    f.controller.state.introduced = true; f.controller.state.phase = 'recovery'; f.controller.state.nextActionAt = 20;
    const start = { x: f.core.x, y: f.core.y };
    for (let n = 0; n < 8 * 60; n++) {
      f.step(); expect(isLegalPosition(f.core, f.core.radius, f.geometry)).toBe(true);
      expect(f.controller.state.locomotion!.route.length).toBeLessThanOrEqual(BOSS_LOCOMOTION.maximumRoutePoints);
    }
    expect(f.core.x).toBeLessThan(850); expect(distance(start, f.core)).toBeGreaterThan(300);
    f.player.x = -300; f.player.y = -300; f.advance(5);
    expect(isLegalPosition(f.core, f.core.radius, f.geometry)).toBe(true);
  });
  it('keeps old campaign traits and attack rules while moving only within a 120-unit home leash', () => {
    const f = fixture(1, false), origin = { x: f.core.x, y: f.core.y }; f.player.x = 700;
    let moved = 0;
    for (let n = 0; n < 12 * 60; n++) {
      const before = { x: f.core.x, y: f.core.y }, attack = f.controller.state.attack;
      f.step(); moved += distance(before, f.core);
      expect(distance(origin, f.core)).toBeLessThanOrEqual(120 + 1e-7);
      if (attack && f.controller.state.attack?.id === attack.id) expect(f.core).toMatchObject(before);
    }
    expect(moved).toBeGreaterThan(40); expect(f.controller.state.heartBoss).toBeUndefined();
    expect(f.commands.filter(command => command.kind === 'telegraph').every(command => command.kind === 'telegraph' && command.attack.kind === 'crystal-sweep')).toBe(true);
  });
});

describe('locked short-range mother lunge', () => {
  it.each([1, 2, 3] as const)('advertises stage %s aim once, then moves the actual body and hits at most once', stage => {
    const f = fixture(stage), attack = f.nextLunge();
    expect(attack.resolveAt - attack.startedAt).toBeCloseTo(BOSS_LOCOMOTION.lunge.windup[stage - 1]);
    const origin = { x: f.core.x, y: f.core.y }, direction = { x: Math.cos(attack.angle), y: Math.sin(attack.angle) };
    Object.assign(f.player, { x: attack.origin.x + direction.x * attack.range * .6, y: attack.origin.y + direction.y * attack.range * .6 });
    while (f.context.elapsed + BALANCE.step < attack.resolveAt) {
      f.step(); expect(f.core).toMatchObject(origin); expect(f.controller.state.attack).toEqual(attack);
    }
    f.advance(1);
    expect(distance(origin, f.core)).toBeGreaterThan(80);
    const hits = f.commands.filter(command => command.kind === 'damagePlayer' && command.attackId === attack.id);
    expect(hits).toHaveLength(1); expect(hits[0]).toMatchObject({ amount: BOSS_LOCOMOTION.lunge.damage[stage - 1], reason: 'heart-boss-lunge' });
    expect(f.controller.state.locomotion?.lunge).toBeUndefined();
  });
  it.each(['side-walk', 'dash', 'cover'] as const)('permits actual %s escape without a tracking corridor', escape => {
    const f = fixture(3), attack = f.nextLunge();
    const direction = { x: Math.cos(attack.angle), y: Math.sin(attack.angle) };
    Object.assign(f.player, { x: attack.origin.x + direction.x * attack.range * .6, y: attack.origin.y + direction.y * attack.range * .6 });
    if (escape === 'cover') {
      f.geometry.obstacles = [{ id: 'new-fold', x: attack.origin.x + direction.x * attack.range * .3,
        y: attack.origin.y + direction.y * attack.range * .3, radius: 25 }];
    }
    while (f.context.elapsed < attack.resolveAt + .6) {
      if (escape === 'side-walk' && f.context.elapsed < attack.resolveAt) {
        f.player.x += -direction.y * BALANCE.speed * BALANCE.step;
        f.player.y += direction.x * BALANCE.speed * BALANCE.step;
      }
      if (escape === 'dash') f.player.dashUntil = attack.resolveAt + 1;
      f.step();
    }
    expect(f.commands.filter(command => command.kind === 'damagePlayer' && command.attackId === attack.id)).toHaveLength(0);
    expect(isLegalPosition(f.core, f.core.radius, f.geometry)).toBe(true);
  });
  it('clips its advertised corridor against the full body, and refuses illegal spawn recovery teleports', () => {
    const f = fixture(); f.geometry.obstacles = [{ id: 'wall', x: 1300, y: 800, radius: 50 }];
    expect(bossStraightEnd(f.core, { x: 1, y: 0 }, 390, 52, f.geometry).x).toBeCloseTo(1197.5);
    expect(bossStraightEnd({ x: 1300, y: 800 }, { x: 1, y: 0 }, 390, 52, f.geometry)).toEqual({ x: 1300, y: 800 });
    expect(bossStraightEnd({ x: 2300, y: 800 }, { x: 1, y: 0 }, 390, 52, f.geometry).x).toBe(2348);
    expect(bossStraightEnd({ x: 1198, y: 800 }, { x: -1, y: 0 }, 100, 52, f.geometry).x).toBe(1098);
  });
  it('cancels a committed lunge on stagger and bar break, and holds position for transition/recovery', () => {
    for (const reason of ['stagger', 'bar'] as const) {
      const f = fixture(), attack = f.nextLunge();
      while (f.context.elapsed < attack.resolveAt + .05) f.step();
      expect(f.controller.state.locomotion?.lunge).toBeDefined();
      if (reason === 'stagger') f.controller.damageToughness(f.context, 100);
      else { const allowed = f.controller.damageLimit(f.context, 1e8, { castId: 'independent-break' }); f.core.hp -= allowed; f.step(); }
      const stopped = { x: f.core.x, y: f.core.y }; f.advance(reason === 'bar' ? .5 : 1);
      expect(f.core).toMatchObject(stopped); expect(f.controller.state.locomotion?.lunge).toBeUndefined();
    }
  });
  it('freezes while inactive, respects zero movement factor, and reproduces a JSON-restored pursuit', () => {
    const a = fixture(); a.controller.state.introduced = true; a.controller.state.phase = 'recovery'; a.controller.state.nextActionAt = 30;
    a.player.x = 450; a.geometry.obstacles = [{ id: 'fold', x: 900, y: 800, radius: 90 }]; a.advance(.8);
    const frozen = structuredClone(a.controller.state), position = { x: a.core.x, y: a.core.y };
    a.context.active = false; a.advance(1); expect(a.controller.state).toEqual(frozen); expect(a.core).toMatchObject(position);
    a.context.active = true; a.context.movementFactor = 0; a.advance(.1); expect(a.core).toMatchObject(position);
    a.context.movementFactor = 1;
    const b = fixture(1, true, JSON.parse(JSON.stringify(a.controller.state)));
    Object.assign(b.core, a.core); Object.assign(b.player, a.player); Object.assign(b.geometry, a.geometry);
    b.context.tick = a.context.tick; b.context.elapsed = a.context.elapsed;
    for (let n = 0; n < 180; n++) { a.step(); b.step(); expect(b.core).toEqual(a.core); expect(b.controller.state).toEqual(a.controller.state); }
  });
});

describe('production moving boss integration with blade trace', () => {
  it('moves the actual session core and freezes a hand-connected mark through the blade cinematic and execution', () => {
    const game = new GameSession(23071, { mode: 'endless', territory: true }); game.start(); const s = game.state;
    s.world = { width: 2400, height: 1600, bounds: { left: 0, right: 2400, top: 0, bottom: 1600 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    s.targets = []; Object.assign(s.player, { x: 1250, y: 900, hp: 10000 });
    for (const node of s.territory!.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0 });
    for (const source of Object.values(s.territory!.sources)) Object.assign(source, { destroyed: true, spawned: true });
    Object.assign(s.endless!, { wave: 8, clearedWaves: 8, phase: 'combat', remainingToSpawn: 0, nextSpawnAt: Infinity,
      batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
    s.territory!.stage = 'bossPending';
    const step = () => game.step({ moveX: 0, moveY: 0, fire: false, aim: { x: 1500, y: 900 } }); step();
    const boss = s.targets.find(target => target.id === s.territory!.bossId)!;
    const initial = { x: boss.x, y: boss.y }; for (let n = 0; n < 6 * 60; n++) step();
    expect(distance(initial, boss)).toBeGreaterThan(30);
    s.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
    fillWeaponUltimate(s); expect(castWeaponUltimate(game, boss)).toBe(true);
    const trace = s.weaponCombat.bladeTrace!;
    applyBladeTraceInput(s, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 12 });
    const locked = { x: boss.x, y: boss.y };
    while (s.weaponCombat.bladeTrace && s.weaponCombat.bladeTrace.phase !== 'recovery') { step(); expect(boss).toMatchObject(locked); }
    expect(boss.hp).toBeLessThan(boss.maxHp); expect(s.weaponCombat.ultimateEnergy).toBe(0);
  });
});
