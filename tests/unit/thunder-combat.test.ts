import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { weaponCombatProfile } from '../../src/game/expedition';
import { advanceWeaponSkills, cancelWeaponAction, castWeaponSkill, createWeaponCombat, launchWeaponPrimary } from '../../src/game/weaponSkills';
import { castWeaponUltimate, creditWeaponKill, fillWeaponUltimate, weaponUltimateView } from '../../src/game/weaponUltimates';
import { playerIncomingDamage } from '../../src/game/weaponMelee';
import { launchPrimary, playerProjectilePopulation, type PlayerProjectileHost } from '../../src/game/playerProjectiles';
import { startThunderPrimary, stopThunderPrimary } from '../../src/game/thunderCombat';
import { BALANCE, type GameEvent, type Target } from '../../src/game/types';
import type { DamageOrigin } from '../../src/game/growthTypes';

function fixture() {
  const game = new GameSession(2901, { mode: 'endless' }); game.start();
  const state = game.state;
  Object.assign(state, { tick: 0, elapsed: 0, targets: [], playerProjectiles: [], effects: [], events: [], endlessGrowth: createEndlessGrowth(0),
    weaponCombat: createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 }) });
  Object.assign(state.player, { x: 600, y: 800, hp: 100, facing: 0 });
  state.world = { width: 2200, height: 1600, bounds: { left: 0, right: 2200, top: 0, bottom: 1600 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  const aim = { x: 1100, y: 800 }, hits: { id: string; amount: number; origin: DamageOrigin }[] = [], events: GameEvent[] = [];
  const host: PlayerProjectileHost = { state, damage(target, amount, origin) {
    const actual = Math.min(target.hp, amount); target.hp -= actual;
    if (actual > 0) hits.push({ id: target.id, amount: actual, origin: { ...origin } });
    if (actual > 0 && target.hp === 0) creditWeaponKill(state, target, origin);
    return actual;
  }, emit(type, data) { events.push({ type, data, tick: state.tick }); }, effect(kind, from, to, radius, duration) {
    const effect = { id: state.effects.length, kind, from: { ...from }, to: { ...to }, radius, duration, born: state.elapsed }; state.effects.push(effect); return effect;
  } };
  const add = (id: string, x = 700, y = 800, extra: Partial<Target> = {}) => {
    const target: Target = { id, x, y, radius: 15, hp: 1e7, maxHp: 1e7, role: 'virus', kind: 'single', hitUntil: 0, scanned: false, ...extra };
    state.targets.push(target); return target;
  };
  const step = (frames: number, held = false) => { for (let n = 0; n < frames; n++) {
    if (state.phase === 'playing') { state.tick++; state.elapsed = state.tick * BALANCE.step; }
    advanceWeaponSkills(host, aim, BALANCE.step, held);
  } };
  const stats = () => endlessCombatStats(state.endlessGrowth!);
  const D = () => weaponCombatProfile(state.weaponCombat!.loadout, stats().damageMultiplier).primaryDamage;
  return { state, host, aim, hits, events, add, step, stats, D };
}

describe('held thunder field', () => {
  it('deals the old single-target DPS in fixed .1s pulses, creates no bullets, and stops on release', () => {
    const f = fixture(); f.add('main');
    expect(launchPrimary(f.state, f.aim, f.stats(), 'legacy')).toBe(false);
    expect(launchWeaponPrimary(f.host, f.aim, f.stats(), 'channel')).toBe(true);
    f.step(54, true);
    expect(f.hits).toHaveLength(10);
    expect(f.hits.reduce((sum, hit) => sum + hit.amount, 0)).toBeCloseTo(f.D() / .18);
    expect(playerProjectilePopulation(f.state)).toBe(0);
    f.step(60, false); expect(f.hits).toHaveLength(10); expect(f.state.weaponCombat!.thunder!.channel).toBeUndefined();
  });
  it('does not reward repeatedly tapping faster than the pulse clock', () => {
    const f = fixture(); f.add('main');
    for (let n = 0; n < 60; n++) { startThunderPrimary(f.host, f.aim, f.stats(), `tap:${n}`); stopThunderPrimary(f.state); f.step(1); }
    expect(f.hits).toHaveLength(10);
  });
  it('targets eight distinct visible bodies with one full-strength main and seven 35% branches', () => {
    const f = fixture(); for (let n = 0; n < 12; n++) f.add(`v:${n}`, 680 + n * 8, 800);
    startThunderPrimary(f.host, f.aim, f.stats(), 'budget');
    expect(f.hits).toHaveLength(8); expect(new Set(f.hits.map(hit => hit.id)).size).toBe(8);
    expect(f.hits[0].amount).toBeCloseTo(f.D() * .1 / .18);
    expect(f.hits.slice(1).every(hit => Math.abs(hit.amount - f.hits[0].amount * .35) < 1e-8)).toBe(true);
    expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(8);
  });
  it('uses aiming to select a main body and reconnects as soon as it dies', () => {
    const f = fixture(); f.add('near'); const selected = f.add('selected', 760, 850);
    Object.assign(f.aim, selected); startThunderPrimary(f.host, f.aim, f.stats(), 'aim');
    expect(f.state.weaponCombat!.thunder!.channel!.links[0].targetId).toBe('selected');
    selected.hp = 0; f.step(1, true);
    expect(f.state.weaponCombat!.thunder!.channel!.links[0].targetId).toBe('near');
  });
  it('maps multishot to extra targets, haste to DPS, and pierce to nonrecursive extra branches', () => {
    const multi = fixture(); multi.state.endlessGrowth!.ranks.multishot = 2;
    for (let n = 0; n < 16; n++) multi.add(`m:${n}`, 680 + n * 6);
    startThunderPrimary(multi.host, multi.aim, multi.stats(), 'multi'); expect(multi.hits).toHaveLength(12);
    const jump = fixture(); jump.state.endlessGrowth!.ranks.pierce = 1;
    for (let n = 0; n < 8; n++) jump.add(`root:${n}`, 790, 760 + n * 10);
    jump.add('jump', 900); jump.add('recursive', 1010);
    startThunderPrimary(jump.host, jump.aim, jump.stats(), 'jump');
    expect(jump.hits.map(hit => hit.id)).toContain('jump'); expect(jump.hits.map(hit => hit.id)).not.toContain('recursive');
    expect(new Set(jump.hits.map(hit => hit.id)).size).toBe(jump.hits.length);
    const haste = fixture(); haste.state.endlessGrowth!.ranks.haste = 2; haste.add('fast');
    startThunderPrimary(haste.host, haste.aim, haste.stats(), 'fast'); expect(haste.hits[0].amount).toBeCloseTo(haste.D() * .1 / haste.stats().primaryCooldown);
  });
  it('never chains across solid cover', () => {
    const f = fixture(); const target = f.add('covered', 760); f.state.world!.obstacles = [{ id: 'wall', x: 680, y: 800, radius: 30 }];
    startThunderPrimary(f.host, f.aim, f.stats(), 'cover'); f.step(60, true);
    expect(target.hp).toBe(1e7); expect(f.hits).toHaveLength(0);
  });
  it('lets a positively damaged dying root conduct but rejects zero-damage shield roots as jump relays', () => {
    for (const shielded of [false, true]) {
      const f = fixture(); f.state.endlessGrowth!.ranks.pierce = 1;
      const root = f.add('root', 800, 800, { hp: 1, radius: 10 });
      // Seven closer bodies fill the base field but cannot reach the far jump.
      for (let n = 0; n < 7; n++) f.add(`near:${n}`, 630, 730 + n * 20);
      const far = f.add('far', 910, 800, { radius: 10 });
      const raw = f.host.damage;
      f.host.damage = (target, amount, origin) => shielded && target === root ? 0 : raw(target, amount, origin);
      startThunderPrimary(f.host, f.aim, f.stats(), `relay:${shielded}`);
      expect(f.hits.some(hit => hit.id === far.id)).toBe(!shielded);
      expect(f.state.weaponCombat!.thunder!.marks.some(mark => mark.targetId === root.id)).toBe(false);
    }
  });
});

describe('thunder combo and movement', () => {
  it('refreshes one three-second mark and consumes it for 4D while unmarked bodies take 1D', () => {
    const f = fixture(); f.add('marked'); startThunderPrimary(f.host, f.aim, f.stats(), 'mark'); f.step(30, true);
    expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(1); expect(f.state.weaponCombat!.thunder!.marks[0].until).toBeCloseTo(3.5);
    stopThunderPrimary(f.state); f.add('unmarked', 800); f.hits.length = 0;
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    expect(f.hits.find(hit => hit.id === 'marked')!.amount).toBeCloseTo(f.D() * 4);
    expect(f.hits.find(hit => hit.id === 'unmarked')!.amount).toBeCloseTo(f.D());
    expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(0);
    expect(f.events.filter(event => event.type === 'THUNDER_DETONATE')).toHaveLength(1);
  });
  it('shares the player and powered rod target budget, supplies remote marks, and deduplicates detonation overlap', () => {
    const f = fixture(); f.add('overlap', 790); f.add('remote', 1060);
    startThunderPrimary(f.host, f.aim, f.stats(), 'rod'); castWeaponSkill(f.host, 2, { x: 980, y: 800 }); f.step(6, true);
    const rod = f.state.weaponCombat!.thunder!.rod!; expect(rod.powered).toBe(true);
    expect(f.state.weaponCombat!.thunder!.marks.some(mark => mark.targetId === 'remote')).toBe(true);
    f.hits.length = 0; castWeaponSkill(f.host, 1, f.aim);
    expect(f.hits.filter(hit => hit.id === 'overlap')).toHaveLength(1);
    expect(f.hits.find(hit => hit.id === 'remote')!.amount).toBeCloseTo(f.D() * 4);
    f.step(1, false); expect(rod.powered).toBe(false);
    Object.assign(f.state.player, { x: 400, y: 800 }); f.step(6, true); expect(rod.powered).toBe(false);
  });
  it('limits the combined rod field to the same eight-body pulse budget', () => {
    const f = fixture(); for (let n = 0; n < 12; n++) f.add(`budget:${n}`, 700 + n * 35, 800);
    castWeaponSkill(f.host, 2, { x: 980, y: 800 }); f.hits.length = 0;
    startThunderPrimary(f.host, f.aim, f.stats(), 'combined');
    expect(f.hits).toHaveLength(8); expect(new Set(f.hits.map(hit => hit.id)).size).toBe(8);
  });
  it('selects an aimed remote rod target as the main arc even when eight local bodies fill the budget', () => {
    const f = fixture(); for (let n = 0; n < 8; n++) f.add(`local:${n}`, 690 + n * 7, 800);
    const remote = f.add('aimed-remote', 1060, 800);
    castWeaponSkill(f.host, 2, { x: 980, y: 800 }); f.hits.length = 0;
    Object.assign(f.aim, remote); startThunderPrimary(f.host, f.aim, f.stats(), 'remote-aim');
    expect(f.hits).toHaveLength(8); expect(new Set(f.hits.map(hit => hit.id)).size).toBe(8);
    expect(f.hits[0].id).toBe(remote.id); expect(f.hits[0].amount).toBeCloseTo(f.D() * .1 / .18);
    const main = f.state.weaponCombat!.thunder!.channel!.links.find(link => link.main)!;
    expect(main.targetId).toBe(remote.id); expect(main.from).toEqual({ x: 980, y: 800 });
  });
  it('restricts nova and catalysis to the rod landing/one aftershock and leaves current unchanged', () => {
    const f = fixture(); f.state.endlessGrowth!.ranks = { nova: 2, catalysis: 1 }; f.add('target', 790);
    castWeaponSkill(f.host, 2, { x: 790, y: 800 }); expect(f.hits[0].amount).toBeCloseTo(f.D() * 1.5 * 1.3);
    const rod = f.state.weaponCombat!.thunder!.rod!; expect(rod.radius).toBe(228);
    f.step(30); const secondary = f.hits.filter(hit => hit.origin.ability === 'cannon-aftershock');
    expect(secondary).toHaveLength(1); expect(secondary[0].amount).toBeCloseTo(f.D() * 1.5 * 1.3 * .4);
    startThunderPrimary(f.host, f.aim, f.stats(), 'plain-current'); expect(f.hits.at(-1)!.amount).toBeCloseTo(f.D() * .1 / .18);
  });
  it('moves exactly 280, hits each body once for 2.5D, stays invulnerable, and leaves damaging marks without a held trigger', () => {
    const f = fixture(); f.add('crossed', 720); castWeaponSkill(f.host, 3, f.aim);
    expect(playerIncomingDamage(f.state, 100)).toBe(0); f.step(11);
    expect(f.state.player.x).toBeCloseTo(880); expect(f.state.weaponCombat!.thunder!.dash).toBeUndefined();
    expect(playerIncomingDamage(f.state, 100)).toBe(100);
    expect(f.hits.filter(hit => hit.id === 'crossed')).toHaveLength(1); expect(f.hits[0].amount).toBeCloseTo(f.D() * 2.5);
    f.add('late', 720); f.step(5);
    expect(f.hits.find(hit => hit.id === 'late')!.amount).toBeCloseTo(f.D() * .25);
    expect(f.state.weaponCombat!.thunder!.marks.some(mark => mark.targetId === 'late')).toBe(true);
  });
  it('clips the entire dash footprint at walls and cannot damage a body behind the wall', () => {
    const f = fixture(), target = f.add('behind', 850); f.state.world!.obstacles = [{ id: 'wall', x: 760, y: 800, radius: 30 }];
    castWeaponSkill(f.host, 3, f.aim); f.step(30);
    expect(f.state.player.x).toBeLessThanOrEqual(730 - f.state.player.radius); expect(target.hp).toBe(1e7);
  });
});

describe('moving storm and one committed collapse', () => {
  it('allows a recast after .35 seconds, waits .25 seconds, uses the impact center and spends energy once', () => {
    const f = fixture(); f.add('near'); fillWeaponUltimate(f.state); expect(castWeaponUltimate(f.host, f.aim)).toBe(true);
    f.step(20); expect(weaponUltimateView(f.state)!.canRecast).toBe(false);
    f.step(1); expect(weaponUltimateView(f.state)!.canRecast).toBe(true);
    expect(castWeaponUltimate(f.host, f.aim)).toBe(true); expect(castWeaponUltimate(f.host, f.aim)).toBe(false);
    f.step(14); expect(f.hits).toHaveLength(0);
    Object.assign(f.state.player, { x: 1100, y: 800 }); f.add('impact', 1200); f.step(1);
    expect(f.hits.map(hit => hit.id)).toEqual(['impact']); expect(f.hits[0].amount).toBeCloseTo(f.D() * 4);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'WEAPON_ULTIMATE_PULSE' && event.data.final)).toHaveLength(1);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
  });
  it('caps periodic strikes at twelve and never adds marks or grants energy from storm kills', () => {
    const f = fixture(); for (let n = 0; n < 16; n++) f.add(`storm:${n}`, 680 + n * 4, 800, { hp: 1 });
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.aim); f.step(30);
    expect(f.hits).toHaveLength(12); expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(0); expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
  });
  it('auto-collapses after six seconds, grants the full marked bonus and consumes it exactly once', () => {
    const f = fixture(); f.add('charged'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.aim);
    f.step(360); expect(f.state.weaponCombat!.thunder!.storm!.phase).toBe('collapse');
    startThunderPrimary(f.host, f.aim, f.stats(), 'late-mark'); stopThunderPrimary(f.state); f.hits.length = 0;
    f.step(15); expect(f.hits).toHaveLength(1); expect(f.hits[0].amount).toBeCloseTo(f.D() * 8);
    expect(f.state.weaponCombat!.thunder!.marks).toHaveLength(0); f.step(60); expect(f.hits).toHaveLength(1);
  });
  it('freezes on pause and cancels death/clear without a compensating final explosion', () => {
    const f = fixture(); f.add('durable'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.aim); castWeaponSkill(f.host, 2, f.aim);
    f.state.phase = 'paused'; const before = structuredClone(f.state.weaponCombat); f.step(300); expect(f.state.weaponCombat).toEqual(before);
    f.state.phase = 'playing'; f.state.player.hp = 0; f.step(1); expect(f.state.weaponCombat!.thunder).toBeUndefined(); expect(f.state.weaponCombat!.ultimate).toBeUndefined();
    expect(f.events.some(event => event.type === 'WEAPON_ULTIMATE_PULSE' && event.data.final)).toBe(false);
    const clear = fixture(); fillWeaponUltimate(clear.state); castWeaponUltimate(clear.host, clear.aim); cancelWeaponAction(clear.state, true); clear.step(500);
    expect(clear.events.some(event => event.type === 'WEAPON_ULTIMATE_PULSE' && event.data.final)).toBe(false);
  });
});
