import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BattleDirector, mimicDisturbed } from '../../src/game/battle';
import { BATTLE_BALANCE as B } from '../../src/game/battleConfig';
import { BALANCE, type GameEvent, type InputFrame, type Target, type Vec } from '../../src/game/types';
import type { TraitId } from '../../src/game/battleTypes';
import { distance } from '../../src/actors/collision';

const idle = (aim: Vec = { x: 780, y: 440 }): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim });
function campaign(trait: TraitId = 'CARAPACE', seed = 71) {
  const session = new GameSession(seed, { campaign: true, firstTrait: trait }); session.start(); return session;
}
function advance(session: GameSession, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) session.step(idle());
}
function onlyEnemy(session: GameSession, trait: TraitId, x = 500, y = 440): Target {
  session.state.targets = [{ id: 'fixture', x, y, kind: 'single', role: 'virus', hp: 100, maxHp: 100, radius: 22, traits: [trait], hitUntil: 0, scanned: false, facing: Math.PI, born: 0, attackReady: 1000, generation: 0 }];
  return session.state.targets[0];
}

describe('G1 battle rules', () => {
  it('has seeded independent campaign state and preserves the training fixture', () => {
    const a = campaign(); const b = campaign();
    for (let i = 0; i < 600; i++) {
      const input = { ...idle(), fire: i % 13 === 0, scan: i === 1, moveX: i < 80 ? 1 : 0 };
      a.step(input); b.step(input);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(new GameSession().state.battle).toBeUndefined();
    expect(a.state.battle?.graph.nodes).toHaveLength(6);
    a.restart(); expect(a.state.battle?.traits).toEqual([]);
    expect(a.state.battle?.history).toEqual([]);
  });

  it.each<TraitId>(['CARAPACE', 'FISSION', 'MIMIC'])('warns for at least 8 simulation seconds before applying %s', trait => {
    const s = campaign(trait);
    advance(s, B.firstWarningAt);
    expect(s.state.battle?.warning?.trait).toBe(trait);
    expect(s.state.battle?.traits).toEqual([]);
    advance(s, B.warningDuration - .1);
    expect(s.state.battle?.traits).toEqual([]);
    advance(s, .2);
    expect(s.state.battle?.traits).toEqual([trait]);
    expect(s.state.targets.some(t => t.role === 'elite' && t.traits?.includes(trait))).toBe(true);
    expect(s.state.events.find(e => e.type === 'EVOLUTION_APPLIED')?.data.warningDuration).toBeGreaterThanOrEqual(8);
    expect(s.state.battle?.history.some(entry => entry.text.includes('代价'))).toBe(true);
  });

  it('makes carapace frontal resistance, rear weakness and slower movement real', () => {
    const s = campaign();
    const enemy = onlyEnemy(s, 'CARAPACE');
    s.step({ ...idle(enemy), fire: true, tool: 1 });
    expect(enemy.hp).toBeCloseTo(100 - 34 * .3);
    enemy.facing = 0; s.state.cooldowns[1] = 0;
    s.step({ ...idle(enemy), fire: true, tool: 1 });
    expect(enemy.hp).toBeCloseTo(100 - 34 * .3 - 34);
    const before = { x: enemy.x, y: enemy.y };
    s.step(idle());
    expect(distance(enemy, before)).toBeCloseTo(B.enemySpeed * B.carapaceSpeed * BALANCE.step);
  });

  it('mimics remain base-counterable, periodically disturb and Q reveals them', () => {
    const s = campaign('MIMIC'); const enemy = onlyEnemy(s, 'MIMIC', 500, 440);
    expect(mimicDisturbed(enemy, 1)).toBe(true);
    expect(mimicDisturbed(enemy, 3)).toBe(false);
    expect(mimicDisturbed(enemy, 6.2)).toBe(true);
    s.step({ ...idle(enemy), scan: true, fire: true });
    expect(enemy.hp).toBe(66);
    expect(enemy.revealedUntil).toBeGreaterThan(s.state.elapsed + 4.9);
    const before = { x: enemy.x, y: enemy.y }; s.step(idle());
    expect(distance(before, enemy)).toBeCloseTo(B.enemySpeed * B.mimicSpeed * BALANCE.step);
    enemy.x = s.state.tissue.x; enemy.y = s.state.tissue.y;
    s.state.player.x = 650; s.state.player.y = 600;
    s.step({ ...idle(s.state.tissue), tool: 3, fire: true });
    expect(enemy.hp).toBe(31);
    expect(s.state.events.some(e => e.type === 'MIMIC_PURGED')).toBe(true);
  });

  it('fission advertises finite child landing points and cannot recursively divide', () => {
    const s = campaign('FISSION'); const parent = onlyEnemy(s, 'FISSION'); parent.hp = 34;
    s.step({ ...idle(parent), fire: true });
    expect(parent.hp).toBe(0);
    expect(parent.splitAt).toBeCloseTo(s.state.elapsed + B.fissionDelay);
    expect(parent.splitPositions).toHaveLength(2);
    expect(s.state.targets.filter(t => t.hp > 0)).toHaveLength(0);
    advance(s, B.fissionDelay - .05);
    expect(s.state.targets.filter(t => t.hp > 0)).toHaveLength(0);
    advance(s, .1);
    const children = s.state.targets.filter(t => t.hp > 0);
    expect(children).toHaveLength(2);
    expect(children.every(t => t.generation === 1 && t.maxHp === B.childHp)).toBe(true);
    s.step({ ...idle(children[0]), tool: 2, fire: true });
    advance(s, 1);
    expect(s.state.targets.filter(t => t.hp > 0)).toHaveLength(0);
    expect(s.state.events.filter(e => e.type === 'FISSION_SPAWNED')).toHaveLength(1);
  });

  it('clears each source exactly once, stopping its production and reducing pressure', () => {
    const s = campaign(); const source = s.state.targets.find(t => t.role === 'source')!;
    s.state.targets = [source]; source.hp = 34;
    const before = s.state.battle!.pressure.infection;
    s.step({ ...idle(source), fire: true });
    expect(source.hp).toBe(0);
    expect(s.state.battle!.pressure.infection).toBeLessThan(before - 13);
    for (let i = 0; i < 1800; i++) s.step({ ...idle(source), fire: true });
    expect(s.state.battle?.stats.sourceClears).toBe(1);
    expect(s.state.targets.filter(t => t.sourceId === source.id)).toHaveLength(0);
    expect(s.state.events.filter(e => e.type === 'INFECTION_SOURCE_CLEARED')).toHaveLength(1);
  });

  it('gives an organ alarm grace period, recovers through actual repair, and separates failure reasons', () => {
    const s = campaign(); s.state.targets = []; s.state.tissue.hp = 20;
    s.step(idle());
    expect(s.state.battle?.pressure.organAlarm).toBe(true);
    expect(s.state.events.some(e => e.type === 'ORGAN_ALARM')).toBe(true);
    advance(s, 7.8); expect(s.state.battle?.pressure.vitality).toBe(100);
    advance(s, .3); expect(s.state.battle!.pressure.vitality).toBeLessThan(100);
    s.state.player.x = 650; s.state.player.y = 600;
    s.step({ ...idle(s.state.tissue), fire: true, tool: 3 });
    expect(s.state.tissue.hp).toBeGreaterThanOrEqual(30);
    expect(s.state.battle?.pressure.organAlarm).toBe(false);
    expect(s.state.battle?.organLowSince).toBeNull();

    const death = campaign(); death.state.player.hp = 0; death.step(idle());
    expect(death.state.result?.reason).toContain('耐久耗尽');
    const collapse = campaign(); collapse.state.battle!.pressure.vitality = 0; collapse.state.tissue.hp = 0; collapse.step(idle());
    expect(collapse.state.result?.reason).toContain('身体崩溃');
    const crisis = campaign(); crisis.state.targets = []; crisis.state.battle!.pressure.infection = 100;
    advance(crisis, 15.1);
    expect(crisis.state.result?.reason).toContain('感染失控');
  });

  it('does not resurrect zero vitality through regeneration and keeps overlapping player/tissue attack identities separate', () => {
    const collapse = campaign(); collapse.state.battle!.pressure.vitality = 0;
    // A healthy organ would ordinarily regenerate vitality during this tick.
    collapse.state.tissue.hp = 100; collapse.step(idle());
    expect(collapse.state.result?.reason).toContain('身体崩溃');

    const s = campaign();
    const enemy = onlyEnemy(s, 'CARAPACE', 730, 610);
    s.state.player.x = s.state.tissue.x; s.state.player.y = s.state.tissue.y;
    enemy.attackAt = BALANCE.step; enemy.attackAim = { x: s.state.player.x, y: s.state.player.y }; enemy.attackTarget = 'player';
    const tissueBefore = s.state.tissue.hp;
    s.step(idle());
    expect(s.state.player.hp).toBe(100 - B.playerDamage);
    expect(s.state.tissue.hp).toBe(tissueBefore);
  });

  it('uses real input objectives and active retest to complete all three opening trait scenarios', () => {
    for (const trait of ['CARAPACE', 'FISSION', 'MIMIC'] as const) {
      const s = campaign(trait, 91);
      for (let tick = 0; tick < 9000 && s.state.phase === 'playing'; tick++) {
        const state = s.state; const battle = state.battle!;
        const point = battle.readyToRetest ? state.terminal : state.tissue.hp < 55 ? { x: 650, y: 580 } : { x: 620, y: 520 };
        const move = distance(state.player, point) > 12 ? { x: point.x - state.player.x, y: point.y - state.player.y } : { x: 0, y: 0 };
        const alive = state.targets.filter(t => t.hp > 0).sort((a, b) => (a.role === 'source' ? -2 : a.role === 'elite' ? -1 : 0) - (b.role === 'source' ? -2 : b.role === 'elite' ? -1 : 0) || distance(a, state.player) - distance(b, state.player));
        const heal = state.tissue.hp < 70;
        const target = alive[0];
        const tool = heal ? 3 : state.elapsed >= state.cooldowns[2] ? 2 : 1;
        s.step({ moveX: move.x, moveY: move.y, aim: heal ? state.tissue : target ?? state.terminal, tool, fire: heal || !!target, scan: tick % 200 === 0, interact: battle.readyToRetest && distance(state.player, state.terminal) < 90 });
      }
      expect(s.state.result, trait).toMatchObject({ success: true });
      expect(s.state.battle?.traits).toHaveLength(2);
      expect(new Set(s.state.battle?.traits).size).toBe(2);
      expect(s.state.battle?.stats.sourceClears).toBe(2);
      expect(s.state.battle?.stats.eliteClears).toBe(2);
      expect(s.state.events.filter(e => e.type === 'RETEST_COMPLETED')).toHaveLength(1);
    }
  });

  it('runs 20 minutes of the combat system at hard population and memory bounds', () => {
    const session = campaign('FISSION'); const state = session.state;
    const log: GameEvent[] = [];
    // A system stress host records failures but intentionally keeps simulating the
    // post-failure world. This is not a successful run or browser completion test.
    const director = new BattleDirector({
      state, emit(type, data) { log.push({ type, data, tick: state.tick }); if (log.length > 512) log.shift(); },
      message() {}, effect() {}, finish() {},
    });
    let peak = 0;
    for (let tick = 1; tick <= 1200 * 60; tick++) {
      state.tick = tick; state.elapsed = tick / 60;
      if (tick % 120 === 0) {
        const actor = state.targets.find(t => t.role === 'virus' && t.hp > 0 && t.traits?.includes('FISSION'));
        if (actor) { actor.hp = 0; director.cleared(actor); }
      }
      director.beforeInput(idle()); director.afterInput();
      peak = Math.max(peak, state.targets.filter(t => t.hp > 0).length);
      expect(state.targets.length).toBeLessThanOrEqual(B.maxActors + 4);
    }
    expect(state.elapsed).toBe(1200);
    expect(peak).toBeLessThanOrEqual(B.maxActors);
    expect(log).toHaveLength(512);
    expect(state.battle!.pressure.infection).toBeGreaterThanOrEqual(0);
    expect(state.battle!.pressure.infection).toBeLessThanOrEqual(100);
    expect(state.tissue.hp).toBeGreaterThanOrEqual(0);
    expect(state.player.hp).toBeGreaterThanOrEqual(0);
  // This asserts 72,000 simulated ticks and bounded state, not a 20-second
  // product performance budget. The unchanged v076 path also takes ~19s in
  // isolation; leave headroom for workers/OS scheduling on developer machines.
  }, 45000);
});
