import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { advancePlayerProjectiles, clearPlayerProjectiles, launchCannon, launchPrimary, launchSwordVolley,
  PLAYER_PROJECTILE_BALANCE, type PlayerProjectileHost } from '../../src/game/playerProjectiles';
import { BALANCE, type Target } from '../../src/game/types';
import type { DamageOrigin } from '../../src/game/growthTypes';
import { projectileDrawPosition } from '../../src/render/playerProjectileVisuals';

function fixture() {
  const session = new GameSession(44, { mode: 'endless' }); session.start();
  const state = session.state;
  state.targets = []; state.effects = []; state.events = []; state.elapsed = 0; state.tick = 0;
  state.world = { width: 2000, height: 1500, bounds: { left: 0, right: 2000, top: 0, bottom: 1500 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 100, y: 300, facing: 0 });
  const growth = createEndlessGrowth(44), receipts: Array<{ id: string; damage: number; origin: DamageOrigin }> = [];
  const host: PlayerProjectileHost = { state,
    damage(target, damage, origin) { const accepted = Math.min(target.hp, damage); target.hp -= accepted;
      receipts.push({ id: target.id, damage: accepted, origin }); return accepted; },
    emit(type, data) { state.events.push({ type, data, tick: state.tick }); },
    effect(kind, from, to, radius, duration) { return { id: 0, kind, from, to, radius, duration, born: state.elapsed }; } };
  const add = (id: string, x: number, y = 300, radius = 2, hp = 1000) => {
    const target: Target = { id, x, y, radius, hp, maxHp: hp, kind: 'single', role: 'virus', hitUntil: 0, scanned: false };
    state.targets.push(target); return target;
  };
  const step = (count = 1) => { for (let i = 0; i < count; i++) {
    state.tick++; state.elapsed = state.tick * BALANCE.step; advancePlayerProjectiles(host);
  } };
  return { state, host, growth, receipts, add, step, stats: () => endlessCombatStats(growth), aim: { x: 1000, y: 300 } };
}

describe('independent player projectile simulation', () => {
  it('moves a real bullet and sweeps a tiny capsule between fixed positions, with damage only on impact', () => {
    const f = fixture(), target = f.add('tiny-capsule', 151, 300, 1); target.role = 'capsule';
    expect(launchPrimary(f.state, f.aim, f.stats(), 'bullet')).toBe(true);
    expect(f.receipts).toHaveLength(0); expect(f.state.targets).toHaveLength(1);
    f.step(); expect(f.state.playerProjectiles![0].x).toBe(130); expect(target.hp).toBe(1000);
    f.step(); expect(target.hp).toBe(966); expect(f.receipts).toHaveLength(1);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('sorts hits by distance, pierces only its budget and never hits an overlapping target twice', () => {
    const f = fixture(); f.growth.ranks.pierce = 1;
    f.add('last', 260); f.add('first', 145, 300, 25); f.add('second', 210);
    launchPrimary(f.state, f.aim, f.stats(), 'pierce'); f.step(12);
    expect(f.receipts.map(hit => hit.id)).toEqual(['first', 'second']);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('uses expanded wall collision before a target and blocks a cannon explosion behind the wall', () => {
    const f = fixture(); f.state.world!.obstacles = [{ id: 'fold', x: 200, y: 300, radius: 30 }];
    const behind = f.add('covered', 245, 300, 5), near = f.add('near', 125, 335, 5);
    launchPrimary(f.state, f.aim, f.stats(), 'blocked-bullet'); f.step(5);
    expect(behind.hp).toBe(1000); expect(f.state.playerProjectiles).toHaveLength(0);
    launchCannon(f.state, f.aim, f.stats(), 'blocked-cannon'); f.step(8);
    expect(behind.hp).toBe(1000); expect(near.hp).toBe(920);
    const explosion = f.state.events.find(event => event.type === 'PLAYER_CANNON_EXPLODED')!;
    expect(explosion.data.x).toBe(158); expect(explosion.data.radius).toBe(96);
  });

  it('cannon explodes once on its first body, applies only area damage and snapshots tool, power and nova', () => {
    const f = fixture(); f.growth.ranks = { power: 1, nova: 2 };
    const target = f.add('contact', 180), nearby = f.add('nearby', 205, 330);
    const damage = 80 * 1.18 * 1.3;
    launchCannon(f.state, f.aim, f.stats(), 'cannon');
    f.state.tool = 1; f.growth.ranks.power = 100;
    f.step(20);
    expect(target.hp).toBeCloseTo(1000 - damage); expect(nearby.hp).toBeCloseTo(1000 - damage);
    expect(f.receipts).toHaveLength(2);
    expect(f.receipts.every(hit => hit.origin.cause === 'basic' && hit.origin.basicTool === 2)).toBe(true);
    expect(f.state.events.filter(event => event.type === 'PLAYER_CANNON_EXPLODED')).toHaveLength(1);
  });

  it('detonates at the aimed point or maximum reach without a direct hit', () => {
    const f = fixture(); launchCannon(f.state, { x: 142, y: 300 }, f.stats(), 'destination'); f.step(5);
    expect(f.state.events.find(event => event.type === 'PLAYER_CANNON_EXPLODED')!.data.x).toBe(142);
    launchCannon(f.state, f.aim, f.stats(), 'maximum'); f.step(30);
    expect(f.state.events.filter(event => event.type === 'PLAYER_CANNON_EXPLODED')[1].data.x).toBe(520);
  });

  it('keeps the full main blast and schedules one 75%-radius, 40%-damage aftershock with an ability origin', () => {
    const f = fixture(); f.growth.ranks = { catalysis: 1, nova: 1 };
    const target = f.add('durable', 160), main = 80 * 1.15;
    launchCannon(f.state, { x: 150, y: 300 }, f.stats(), 'echo'); f.step(4);
    const explosion = f.state.events.find(event => event.type === 'PLAYER_CANNON_EXPLODED')!;
    expect(target.hp).toBeCloseTo(1000 - main);
    expect(f.state.playerProjectiles).toHaveLength(1); expect(f.state.playerProjectiles![0].kind).toBe('aftershock');
    f.step(19); expect(f.receipts).toHaveLength(1); f.step(2);
    const echoes = f.state.events.filter(event => event.type === 'PLAYER_CANNON_AFTERSHOCK');
    expect(echoes).toHaveLength(1); expect(echoes[0].tick - explosion.tick).toBe(21);
    expect(echoes[0].data.radius).toBe(110 * .75); expect(target.hp).toBeCloseTo(1000 - main * 1.4);
    expect(f.receipts[1].origin).toMatchObject({ cause: 'ability', ability: 'cannon-aftershock', allowChain: false });
    f.step(60); expect(f.receipts).toHaveLength(2); expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('shares one sword receipt per enemy across all five crescents and still pierces other enemies', () => {
    const f = fixture(); f.add('wide', 210, 300, 70); f.add('further', 360, 300, 60);
    expect(launchSwordVolley(f.state, f.aim, 125, 5, 'sword')).toBe(true);
    // Serialized bodies still honor the cast-wide ledger after references are restored separately.
    f.state.playerProjectiles = JSON.parse(JSON.stringify(f.state.playerProjectiles));
    f.step(50);
    expect(f.receipts.map(hit => hit.id).sort()).toEqual(['further', 'wide']);
    expect(f.receipts.every(hit => hit.origin.ability === 'charged-slash' && hit.damage === 125)).toBe(true);
  });

  it('accepts complete volleys atomically under the independent 192-body cap', () => {
    const f = fixture(); f.growth.ranks.multishot = 1;
    for (let index = 0; index < 63; index++) expect(launchPrimary(f.state, f.aim, f.stats(), `fill:${index}`)).toBe(true);
    expect(f.state.playerProjectiles).toHaveLength(189);
    expect(launchSwordVolley(f.state, f.aim, 80, 5, 'overflow')).toBe(false);
    expect(f.state.playerProjectiles).toHaveLength(189);
    expect(launchPrimary(f.state, f.aim, f.stats(), 'last')).toBe(true);
    expect(f.state.playerProjectiles).toHaveLength(PLAYER_PROJECTILE_BALANCE.maximum);
    expect(launchCannon(f.state, f.aim, f.stats(), 'full')).toBe(false);
    expect(f.state.targets).toHaveLength(0);
  });

  it('freezes during pause and clears both flight and scheduled aftershocks without late hits', () => {
    const f = fixture(); f.growth.ranks.catalysis = 1;
    launchCannon(f.state, { x: 110, y: 300 }, f.stats(), 'pending'); f.step();
    launchPrimary(f.state, f.aim, f.stats(), 'flight');
    f.state.phase = 'paused'; const snapshot = structuredClone(f.state.playerProjectiles);
    advancePlayerProjectiles(f.host); expect(f.state.playerProjectiles).toEqual(snapshot);
    clearPlayerProjectiles(f.state); f.state.phase = 'playing'; f.step(40);
    expect(f.state.events.filter(event => event.type === 'PLAYER_CANNON_AFTERSHOCK')).toHaveLength(0);
  });

  it('does not restore stale projectiles when damage ends or clears a run reentrantly', () => {
    const f = fixture(); f.add('first', 150); f.add('second', 170); f.growth.ranks.catalysis = 1;
    f.host.damage = (target, amount) => { target.hp -= amount; clearPlayerProjectiles(f.state); return amount; };
    launchCannon(f.state, f.aim, f.stats(), 'reentry'); f.step(20);
    expect(f.state.playerProjectiles).toHaveLength(0);
    expect(f.state.targets[1].hp).toBe(1000);
  });

  it('uses the painted muzzle near birth and converges to real ground coordinates without changing collision', () => {
    const f = fixture(); launchPrimary(f.state, f.aim, f.stats(), 'visual'); const shot = f.state.playerProjectiles![0];
    expect(projectileDrawPosition(shot, { x: 130, y: 250 })).toEqual({ x: 130, y: 250 });
    f.step(4); expect(projectileDrawPosition(shot, { x: 130, y: 250 })).toEqual({ x: 220, y: 300 });
  });

  it('reserves the aftershock slot before callbacks can fill the projectile queue', () => {
    const f = fixture(); f.growth.ranks.catalysis = 1;
    launchCannon(f.state, { x: 110, y: 300 }, f.stats(), 'reserved');
    f.host.emit = (type, data) => {
      f.state.events.push({ type, data, tick: f.state.tick });
      if (type === 'PLAYER_CANNON_EXPLODED') for (let i = 0; i < 200; i++) launchPrimary(f.state, f.aim, f.stats(), `callback:${i}`);
    };
    f.step(); expect(f.state.playerProjectiles).toHaveLength(192);
    expect(f.state.playerProjectiles!.filter(shot => shot.kind === 'aftershock')).toHaveLength(1);
  });
});
