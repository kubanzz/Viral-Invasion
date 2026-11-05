import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { WEAPONS, type WeaponId } from '../../src/game/expedition';
import { advancePlayerProjectiles, launchPrimary, launchWeaponVolley, playerProjectilePopulation, type PlayerProjectileHost } from '../../src/game/playerProjectiles';
import { advanceWeaponSkills, castWeaponSkill, createWeaponCombat, weaponPrimaryCooldown, weaponSkillDefinitions } from '../../src/game/weaponSkills';
import { BALANCE, type GameEvent, type Target, type Vec } from '../../src/game/types';

function arena(weaponId: WeaponId = 'piercing') {
  const session = new GameSession(1701, { mode: 'endless' }); session.start();
  const state = session.state;
  Object.assign(state, { elapsed: 0, tick: 0, targets: [], playerProjectiles: [], events: [], effects: [],
    endlessGrowth: createEndlessGrowth(1701), weaponCombat: createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 }),
    world: { width: 2000, height: 1500, bounds: { left: 0, right: 2000, top: 0, bottom: 1500 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } } });
  Object.assign(state.player, { x: 100, y: 400, facing: 0 });
  const hits: { id: string; damage: number; leg: string }[] = [], events: GameEvent[] = [];
  const host: PlayerProjectileHost = { state,
    damage(target, amount, origin) {
      const actual = Math.min(target.hp, amount); target.hp -= actual;
      const shot = state.playerProjectiles?.find(body => body.origin.rootId === origin.rootId && body.hitTargetIds.includes(target.id));
      hits.push({ id: target.id, damage: actual, leg: shot?.flightPhase ?? '' }); return actual;
    },
    emit(type, data) { events.push({ type, data, tick: state.tick }); },
    effect(kind, from, to, radius, duration) { return { id: 0, kind, from, to, radius, duration, born: state.elapsed }; } };
  const add = (id: string, x = 280, y = 400, extra: Partial<Target> = {}): Target => {
    const target: Target = { id, x, y, hp: 10000, maxHp: 10000, radius: 12, role: 'event', kind: 'single', hitUntil: 0, scanned: false, ...extra };
    state.targets.push(target); return target;
  };
  const stats = () => endlessCombatStats(state.endlessGrowth!);
  const aim = { x: 900, y: 400 };
  const step = (frames = 1, direction: Vec = aim) => { for (let n = 0; n < frames; n++) {
    if (state.phase === 'playing') { state.tick++; state.elapsed = state.tick * BALANCE.step; }
    advanceWeaponSkills(host, direction); advancePlayerProjectiles(host);
  } };
  return { state, host, hits, events, add, stats, aim, step };
}

describe('hive and returning bow combat identities', () => {
  it('preserves the two collection IDs while exposing distinct weapon and skill names', () => {
    expect(Object.keys(WEAPONS)).toEqual(['steady', 'piercing']);
    expect(WEAPONS.steady.name).toBe('稳流·蜂巢针枪'); expect(WEAPONS.piercing.name).toBe('贯脉·回旋刃弓');
    expect(weaponSkillDefinitions('steady').map(skill => skill.name)).toEqual(['蜂群追针', '排异震环', '蜂巢超载']);
    expect(weaponSkillDefinitions('piercing').map(skill => skill.name)).toEqual(['蓄势穿心', '束脉锚', '回缝风暴']);
    expect(weaponSkillDefinitions('steady')[1]).toMatchObject({ aim: 'self', range: 0, radius: 155 });
  });

  it('makes the crescent slower and wider with a longer primary interval at every haste rank', () => {
    const hive = arena('steady'), bow = arena();
    launchPrimary(hive.state, hive.aim, hive.stats(), 'hive'); launchPrimary(bow.state, bow.aim, bow.stats(), 'bow');
    expect(hive.state.playerProjectiles![0]).toMatchObject({ speed: 1800, radius: 6, visual: 'hive-needle' });
    expect(bow.state.playerProjectiles![0]).toMatchObject({ speed: 800, radius: 13, remaining: 400, visual: 'crescent', flightPhase: 'outbound' });
    for (const rank of [0, 2, 20]) {
      hive.state.endlessGrowth!.ranks.haste = rank; bow.state.endlessGrowth!.ranks.haste = rank;
      expect(weaponPrimaryCooldown(bow.state, bow.stats())).toBeGreaterThanOrEqual(weaponPrimaryCooldown(hive.state, hive.stats()) * 1.6 - 1e-8);
    }
  });

  it('travels the full outward range, restores two return hits and damages each body at most once per leg', () => {
    const f = arena(); f.add('front', 220); f.add('middle', 300); f.add('rear', 380);
    launchPrimary(f.state, f.aim, f.stats(), 'round-trip'); f.step(30);
    expect(f.state.playerProjectiles![0].x).toBeCloseTo(500); expect(f.state.playerProjectiles![0].flightPhase).toBe('returning');
    expect(f.hits.map(hit => hit.id)).toEqual(['front', 'middle']); f.step(35);
    expect(f.hits.map(hit => hit.id)).toEqual(['front', 'middle', 'rear', 'middle']);
    expect(f.hits.map(hit => hit.damage)).toEqual([28, 28, 18.2, 18.2]);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('lets one durable body receive exactly one outward and one weaker return hit', () => {
    const f = arena(); f.add('durable', 320, 400, { radius: 60 });
    launchPrimary(f.state, f.aim, f.stats(), 'two-hits'); f.step(150);
    expect(f.hits).toHaveLength(2); expect(f.hits[0].damage).toBe(28); expect(f.hits[1].damage).toBe(18.2);
  });

  it('redirects the returning blade toward the actual moving player and sweeps a new route', () => {
    const f = arena(); const returnOnly = f.add('new-route', 300, 550);
    launchPrimary(f.state, f.aim, f.stats(), 'move-return'); f.step(30);
    Object.assign(f.state.player, { x: 100, y: 700 }); f.step();
    expect(f.state.playerProjectiles![0].direction.y).toBeGreaterThan(.5); f.step(45);
    expect(returnOnly.hp).toBeCloseTo(10000 - 18.2);
  });

  it('stops outward and returning blades at real fold collisions', () => {
    const outward = arena(); outward.state.world!.obstacles = [{ id: 'fold', x: 250, y: 400, radius: 30 }];
    const covered = outward.add('covered', 300); launchPrimary(outward.state, outward.aim, outward.stats(), 'blocked'); outward.step(70);
    expect(covered.hp).toBe(10000); expect(outward.state.playerProjectiles).toHaveLength(0);
    const back = arena(); launchPrimary(back.state, back.aim, back.stats(), 'blocked-back'); back.step(30);
    back.state.world!.obstacles = [{ id: 'new-fold', x: 350, y: 400, radius: 30 }];
    const safe = back.add('behind-fold', 250); back.step(60);
    expect(safe.hp).toBe(10000); expect(back.state.playerProjectiles).toHaveLength(0);
  });

  it('expires a return blade instead of chasing a relocating player forever', () => {
    const f = arena(); launchPrimary(f.state, f.aim, f.stats(), 'bounded'); f.step(30);
    Object.assign(f.state.player, { x: 1800, y: 1300 }); f.step(180);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('shares a separate hit ledger for each storm leg even after JSON serialization', () => {
    const f = arena(); const boss = f.add('wide', 300, 400, { radius: 100, role: 'core' });
    castWeaponSkill(f.host, 3, f.aim);
    f.state.playerProjectiles = JSON.parse(JSON.stringify(f.state.playerProjectiles)); f.step(120);
    expect(f.hits.filter(hit => hit.id === boss.id).map(hit => hit.damage)).toEqual([56, 28]);
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_RETURNED')).toHaveLength(3);
  });

  it('increases heavy damage only for later bodies and caps the penetration bonus at 36%', () => {
    const f = arena(); for (let n = 0; n < 7; n++) f.add(`body:${n}`, 220 + n * 65);
    castWeaponSkill(f.host, 1, f.aim); f.step(80);
    expect(f.hits.map(hit => hit.id)).toEqual(['body:0', 'body:1', 'body:2', 'body:3', 'body:4', 'body:5']);
    const expected = [112, 112 * 1.12, 112 * 1.24, 112 * 1.36, 112 * 1.36, 112 * 1.36];
    f.hits.forEach((hit, index) => expect(hit.damage).toBeCloseTo(expected[index]));
  });

  it('spreads the swarm, curves into a visible forward target, and spends a finite turn budget', () => {
    const f = arena('steady'); const target = f.add('tracked', 430, 400, { radius: 24 });
    castWeaponSkill(f.host, 1, f.aim); const first = f.state.playerProjectiles![0], initial = Math.atan2(first.direction.y, first.direction.x);
    expect(initial).toBeCloseTo(-.32); f.step(5);
    expect(first.homing!.targetId).toBe(target.id); expect(Math.atan2(first.direction.y, first.direction.x)).toBeGreaterThan(initial);
    expect(first.homing!.remainingTurn).toBeLessThan(.75); expect(first.homing!.remainingTurn).toBeGreaterThanOrEqual(0);
    target.y = 900; f.step(60); expect(first.homing!.remainingTurn).toBeGreaterThanOrEqual(0);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('never acquires or damages a swarm target through an intervening fold', () => {
    const f = arena('steady'); f.state.world!.obstacles = [{ id: 'fold', x: 250, y: 400, radius: 100 }];
    const covered = f.add('covered', 420); castWeaponSkill(f.host, 1, f.aim); const first = f.state.playerProjectiles![0];
    f.step(70); expect(first.homing!.targetId).toBeUndefined(); expect(covered.hp).toBe(10000);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('resolves the repulse at the player immediately and schedules one stationary aftershock', () => {
    const f = arena('steady'); f.state.endlessGrowth!.ranks.catalysis = 1;
    const near = f.add('near', 200, 400, { role: 'virus' }), far = f.add('aimed-far', 600);
    castWeaponSkill(f.host, 2, far);
    expect(near.hp).toBe(10000 - 68); expect(near.x).toBeCloseTo(270); expect(far.hp).toBe(10000);
    expect(f.events.find(event => event.type === 'PLAYER_CANNON_EXPLODED')!.data).toMatchObject({ x: 100, y: 400, radius: 155, visual: 'pulse-ring' });
    expect(f.state.playerProjectiles).toHaveLength(1); expect(f.state.playerProjectiles![0].kind).toBe('aftershock');
    f.step(60); expect(near.x).toBeCloseTo(270); expect(f.events.filter(event => event.type === 'PLAYER_CANNON_AFTERSHOCK')).toHaveLength(1);
  });

  it('adds exactly two low-damage overdrive side needles without multiplying them by multishot', () => {
    const f = arena('steady'); f.state.weaponCombat = createWeaponCombat({ weaponId: 'steady', rarity: 'gold', upgrade: 3 });
    f.state.endlessGrowth!.ranks = { power: 1, multishot: 2, pierce: 1 };
    castWeaponSkill(f.host, 3, f.aim); launchPrimary(f.state, f.aim, f.stats(), 'overdrive');
    const shots = f.state.playerProjectiles!;
    expect(shots).toHaveLength(7); expect(shots.filter(shot => shot.damage === 34 * 1.18 * 1.18)).toHaveLength(5);
    expect(shots.slice(5).map(shot => shot.damage)).toEqual([34 * 1.18 * 1.18 * .35, 34 * 1.18 * 1.18 * .35]);
    expect(shots.every(shot => shot.hitsRemaining === 2)).toBe(true);
    f.step(241); launchPrimary(f.state, f.aim, f.stats(), 'expired'); expect(f.state.playerProjectiles).toHaveLength(5);
  });

  it('admits overdrive groups atomically and counts delayed swarm commitments against 192', () => {
    const f = arena('steady');
    for (let n = 0; n < 190; n++) launchPrimary(f.state, f.aim, f.stats(), `fill:${n}`);
    castWeaponSkill(f.host, 3, f.aim);
    expect(launchPrimary(f.state, f.aim, f.stats(), 'rejected')).toBe(false);
    expect(playerProjectilePopulation(f.state)).toBe(190);
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(false); expect(f.state.weaponCombat!.cooldowns[1]).toBe(0);
    f.state.playerProjectiles!.splice(0, 3); expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    expect(playerProjectilePopulation(f.state)).toBe(192);
  });

  it('stops a bone projectile at a protected fixed target instead of striking through its membrane', () => {
    const f = arena(); const source = f.add('shielded', 250, 400, { role: 'source' }); const behind = f.add('behind', 350);
    const original = f.host.damage; f.host.damage = (target, amount, origin) => target === source ? 0 : original(target, amount, origin);
    launchWeaponVolley(f.state, f.aim, { castId: 'membrane', kind: 'primary', damage: 112,
      origin: { cause: 'ability', armorResponse: 'heavy', weaponId: 'piercing' }, hitsRemaining: 6 }); f.step(60);
    expect(source.hp).toBe(10000); expect(behind.hp).toBe(10000); expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('blocks all three storm blades at a membrane even though their damage ledger is shared', () => {
    const f = arena(); const source = f.add('shielded', 300, 400, { role: 'source', radius: 95 });
    const behind = f.add('behind', 430, 400, { radius: 55 });
    const original = f.host.damage; f.host.damage = (target, amount, origin) => target === source ? 0 : original(target, amount, origin);
    castWeaponSkill(f.host, 3, f.aim); f.step(120);
    expect(behind.hp).toBe(10000); expect(f.state.playerProjectiles).toHaveLength(0);
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_RETURNED')).toHaveLength(0);
  });

  it('does not leak a reentrant death or clear callback into later target damage or returning bodies', () => {
    const f = arena(); f.add('first', 220); const untouched = f.add('later', 340);
    f.host.damage = (target, amount) => { target.hp -= amount; f.state.playerProjectiles = []; f.state.phase = 'result'; return amount; };
    castWeaponSkill(f.host, 3, f.aim); f.step(90);
    expect(untouched.hp).toBe(10000); expect(f.state.playerProjectiles).toHaveLength(0);
    expect(f.events.filter(event => event.type === 'PLAYER_PROJECTILE_RETURNED')).toHaveLength(0);
  });
});
