import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, activeWorld, type InputFrame, type Target, type Vec } from '../../src/game/types';
import { getOrganDefinition } from '../../src/game/organConfig';
import { WORLD } from '../../src/game/types';

const idle = (aim: Vec = { x: 780, y: 610 }): InputFrame => ({ moveX: 0, moveY: 0, aim, fire: false });
const campaign = (): GameSession => { const game = new GameSession(91, { campaign: true, milestone: 'G3' }); game.start(); return game; };
function advance(game: GameSession, seconds: number): void { for (let tick = 0; tick < Math.ceil(seconds * 60); tick++) game.step(idle()); }

/** Deliberate mechanism preconditions; these tests do not claim earned goals or browser victories. */
function unlockedTravel(game: GameSession): void {
  const s = game.state, c = s.campaign!;
  c.migration.status = 'resolved'; c.migration.choice = 'ignore'; c.migration.resolvedAt = 0;
  c.arenas.lung.activated = true;
  for (const arena of Object.values(c.arenas)) arena.graph.nodes.find(node => node.kind === 'exit')!.active = true;
}
function retestFixture(game: GameSession): void {
  const s = game.state, c = s.campaign!;
  c.core.status = 'cleared'; c.phase = 'retest';
  c.migration.status = 'resolved'; c.migration.choice = 'block';
  s.targets = [];
  for (const arena of Object.values(c.arenas)) {
    arena.tissue.hp = 100;
    for (const node of arena.graph.nodes) if (node.kind === 'source') node.active = false;
  }
  s.battle!.pressure.infection = 10;
  s.battle!.nextEvolutionAt = Infinity;
  Object.assign(s.player, s.terminal);
}

describe('G3 independent session boundaries', () => {
  it('round trips preserve local HP, cleared sources, closed routes and all global cooldowns', () => {
    const game = campaign(), s = game.state, c = s.campaign!;
    unlockedTravel(game);
    s.targets = s.targets.filter(target => target.role === 'source');
    const cleared = s.targets.find(target => target.id === 'source-a')!;
    const damaged = s.targets.find(target => target.id === 'source-b')!;
    cleared.hp = 0; cleared.deadAt = 0; damaged.hp = 111;
    s.battle!.graph.nodes.find(node => node.id === cleared.id)!.active = false;
    const edge = s.battle!.graph.edges.find(link => link.from === cleared.id)!; edge.open = false;
    s.battle!.graph.nodes.find(node => node.id === 'gate')!.active = false;
    s.tissue.hp = 44; s.player.hp = 73;
    s.cooldowns = { 1: 25, 2: 26, 3: 27 }; s.scanReady = 29; s.player.dashReady = 28;
    s.battle!.nextEvolutionAt = Infinity;
    Object.assign(s.player, getOrganDefinition('heart').exit);
    game.step({ ...idle(), interact: true });
    expect(s.battle!.organId).toBe('lung');
    expect(activeWorld(s).obstacles.map(obstacle => obstacle.id)).toEqual(['alveolus-a', 'alveolus-b']);
    expect(s.player.hp).toBe(73);
    expect(s.cooldowns).toEqual({ 1: 25, 2: 26, 3: 27 });
    expect(s.scanReady).toBe(29); expect(s.player.dashReady).toBe(28);
    s.tissue.hp = 69;
    game.step({ ...idle(), interact: true });
    expect(s.battle!.organId).toBe('lung'); expect(c.stats.travels).toBe(1);
    advance(game, 3.1);
    game.step({ ...idle(), interact: true });
    expect(s.battle!.organId).toBe('heart'); expect(c.stats.travels).toBe(2);
    expect(activeWorld(s)).toEqual(WORLD);
    expect(s.tissue.hp).toBe(44); expect(c.arenas.lung.tissue.hp).toBe(69);
    expect(s.targets.find(target => target.id === cleared.id)!.hp).toBe(0);
    expect(s.targets.find(target => target.id === damaged.id)!.hp).toBe(111);
    expect(s.battle!.graph.edges.find(link => link.id === edge.id)!.open).toBe(false);
    expect(s.cooldowns).toEqual({ 1: 25, 2: 26, 3: 27 });
    expect(s.scanReady).toBe(29); expect(s.player.dashReady).toBe(28);
  });

  it('requires every activated organ at 50 and infection strictly below 35 before active retest', () => {
    const cases = [
      { heart: 50, lung: 50, activeLung: true, infection: 34.9, expected: true },
      { heart: 49.99, lung: 100, activeLung: true, infection: 0, expected: false },
      { heart: 100, lung: 49.99, activeLung: true, infection: 0, expected: false },
      { heart: 100, lung: 0, activeLung: false, infection: 0, expected: true },
      { heart: 100, lung: 100, activeLung: true, infection: 35, expected: false },
      { heart: 100, lung: 100, activeLung: true, infection: 34.99, expected: true },
    ];
    for (const fixture of cases) {
      const game = campaign(), s = game.state; retestFixture(game);
      s.campaign!.arenas.heart.tissue.hp = fixture.heart;
      s.campaign!.arenas.lung.tissue.hp = fixture.lung;
      s.campaign!.arenas.lung.activated = fixture.activeLung;
      s.battle!.pressure.infection = fixture.infection;
      game.step({ ...idle(), interact: true });
      expect(s.result?.success ?? false, JSON.stringify(fixture)).toBe(fixture.expected);
      expect(s.events.filter(event => event.type === 'RETEST_COMPLETED')).toHaveLength(fixture.expected ? 1 : 0);
      if (fixture.expected) {
        game.step({ ...idle(), interact: true });
        expect(s.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
      }
    }
    const unearned = campaign(); retestFixture(unearned); unearned.state.campaign!.core.status = 'active';
    unearned.step({ ...idle(), interact: true }); expect(unearned.state.result).toBeNull();
  });

  it('rechecks organ integrity after a same-tick enemy strike instead of accepting an early retest', () => {
    const game = campaign(), s = game.state; retestFixture(game);
    s.tissue.hp = 50;
    const enemy: Target = { id: 'audit-final-strike', role: 'virus', kind: 'single', x: s.tissue.x - 80, y: s.tissue.y,
      hp: 68, maxHp: 68, radius: 22, hitUntil: 0, scanned: false, traits: [], attackAt: BALANCE.step,
      attackAim: { x: s.tissue.x, y: s.tissue.y }, attackTarget: 'tissue', attackReady: 100 };
    s.targets = [enemy];
    game.step({ ...idle(), interact: true });
    expect(s.tissue.hp).toBe(46); expect(s.result).toBeNull();
    expect(s.events.some(event => event.type === 'RETEST_COMPLETED')).toBe(false);
    expect(s.events.some(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'enemy-attack')).toBe(true);
    game.step({ ...idle(s.tissue), tool: 3, fire: true, interact: true });
    expect(s.tissue.hp).toBe(71); expect(s.result?.success).toBe(true);
    expect(s.events.filter(event => event.type === 'RETEST_COMPLETED')).toHaveLength(1);
  });

  it.each([
    { failure: 'player', reason: '耐久耗尽' },
    { failure: 'vitality', reason: '身体崩溃' },
    { failure: 'infection', reason: '感染失控' },
  ])('keeps $failure failure terminal before healing, travel or retest', ({ failure, reason }) => {
    const game = campaign(), s = game.state; retestFixture(game);
    s.tick = 900; s.elapsed = 15; s.tissue.hp = 50;
    if (failure === 'player') s.player.hp = 0;
    if (failure === 'vitality') s.battle!.pressure.vitality = 0;
    if (failure === 'infection') { s.battle!.pressure.infection = 100; s.battle!.pressure.criticalSince = 0; }
    game.step({ ...idle(s.tissue), fire: true, tool: 3, interact: true });
    expect(s.result).toMatchObject({ success: false }); expect(s.result!.reason).toContain(reason);
    expect(s.tissue.hp).toBe(50); expect(s.campaign!.stats.travels).toBe(0);
    expect(s.events.some(event => event.type === 'RETEST_COMPLETED')).toBe(false);
    game.step({ ...idle(), interact: true });
    expect(s.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
  });

  it('resolves a lethal mother-core attack before a queued same-tick exit trip', () => {
    const game = campaign(), s = game.state, c = s.campaign!;
    unlockedTravel(game);
    s.targets = []; c.arenas.heart.targets = s.targets;
    for (const node of s.battle!.graph.nodes) if (node.kind === 'source') node.active = false;
    s.battle!.traits = ['FISSION', 'MIMIC']; s.battle!.nextEvolutionAt = Infinity;
    c.core.status = 'ready'; c.core.organId = 'heart';
    Object.assign(s.player, s.terminal);
    game.step({ ...idle(), interact: true });
    expect(c.core.combat).toBeDefined();
    Object.assign(s.player, getOrganDefinition('heart').exit); s.player.hp = 5;
    const core = s.targets.find(target => target.role === 'core')!;
    const combat = c.core.combat!;
    combat.phase = 'windup'; combat.activeTrait = 'FISSION';
    combat.attack = { id: 'audit-core-final-strike', trait: 'FISSION', kind: 'fission-burst', startedAt: s.elapsed - 1,
      resolveAt: s.elapsed + BALANCE.step, origin: { x: core.x, y: core.y }, aim: { x: s.player.x, y: s.player.y },
      angle: 0, range: 0, radius: 88, halfAngle: 0, landings: [] };
    game.step({ ...idle(), interact: true });
    expect(s.result?.success).toBe(false); expect(s.result?.reason).toContain('耐久耗尽');
    expect(s.battle!.organId).toBe('heart'); expect(c.stats.travels).toBe(0);
    expect(s.events.some(event => event.type === 'PLAYER_HURT' && event.data.reason === 'core-fission-burst')).toBe(true);
    expect(s.events.some(event => event.type === 'ORGAN_TRAVELLED')).toBe(false);
  });

  it('accrues offscreen pressure through repeated cooldown-respecting round trips', () => {
    const game = campaign(), s = game.state, c = s.campaign!;
    unlockedTravel(game);
    // Isolate the background clock: static sources remain, production/evolution is
    // disabled only in this fixture; every subsequent trip is public E input.
    s.battle!.nextEvolutionAt = Infinity;
    s.targets = s.targets.filter(target => target.role === 'source');
    for (const arena of Object.values(c.arenas)) {
      arena.targets = arena.targets.filter(target => target.role === 'source'); arena.tissue.hp = 100;
      for (const id of Object.keys(arena.nextSpawnAt)) arena.nextSpawnAt[id] = Infinity;
    }
    Object.assign(s.player, getOrganDefinition('heart').exit);
    for (let tick = 0; tick < 90 * 60; tick++) game.step({ ...idle(), interact: tick % 181 === 0 });
    expect(s.phase).toBe('playing'); expect(c.stats.travels).toBeGreaterThanOrEqual(20);
    expect(c.stats.backgroundDamage).toBeGreaterThan(0);
    expect(c.arenas.heart.totalBackgroundLoss).toBeGreaterThan(0);
    expect(c.arenas.lung.totalBackgroundLoss).toBeGreaterThan(0);
    expect(c.arenas.heart.offscreenElapsed).toBeGreaterThan(30);
    expect(c.arenas.lung.offscreenElapsed).toBeGreaterThan(30);
  });
});
