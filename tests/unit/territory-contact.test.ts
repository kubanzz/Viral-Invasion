import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advancePlayerContactInfection, advanceTerritory, beginTerritoryPurification, infectPlayer,
  territoryContextView, territoryLaneViews, territoryNodeContaminators, territoryNodeView, territoryPollutionRate, territoryPurificationCandidate } from '../../src/game/territory';
import { recentPlayerHealing } from '../../src/render/playerDamageFeedback';
import { territoryContextHint } from '../../src/ui/territoryHud';
import { BALANCE, type GameState, type Target, type Vec } from '../../src/game/types';
function fixture() {
  const game = new GameSession(741, { mode: 'endless', territory: true }); game.start();
  const state = game.state; state.targets = [];
  state.world = { ...state.world!, obstacles: [] };
  return state;
}
const node = (s: GameState, id = 'heart-healing-1') => s.territory!.nodes.find(n => n.id === id)!;
const virus = (at: Vec, extra: Partial<Target> = {}): Target => ({ id: 'touch-virus', x: at.x, y: at.y, kind: 'single', role: 'virus',
  radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, ...extra });
function frame(state: GameState, from: Vec = state.player, to: Vec = state.player) {
  state.tick++; state.elapsed = state.tick * BALANCE.step; Object.assign(state.player, to);
  const events = [...advancePlayerContactInfection(state, from, to, BALANCE.step), ...advanceTerritory(state, BALANCE.step)];
  state.events.push(...events.map(e => ({ ...e, tick: state.tick })));
  return events;
}
describe('real viral body contact and treatment clock', () => {
  it('runs the actual session contact before treatment, adds no instant damage and freezes when paused', () => {
    const game = new GameSession(741, { mode: 'endless', territory: true }); game.start();
    const s = game.state, spring = node(s); s.world = { ...s.world!, obstacles: [] };
    Object.assign(s.endless!, { phase: 'warning', phaseUntil: Infinity, nextSpawnAt: Infinity, remainingToSpawn: 1, batchSchedule: [] });
    Object.assign(s.player, { x: spring.x, y: spring.y, hp: 50 });
    s.targets = [virus(s.player, { attackReady: 1000 })];
    const step = () => game.step({ moveX: 0, moveY: 0, fire: false, aim: s.player });
    step(); expect(s.playerInfection).not.toBeNull(); expect(s.player.hp).toBeCloseTo(50.05);
    for (let i=0;i<89;i++) step();
    expect(s.playerInfection).not.toBeNull(); expect(s.territory!.healingContact.seconds).toBe(0);
    game.pause(); const paused = structuredClone(s);
    for (let i=0;i<60;i++) step(); expect(s).toEqual(paused);
    game.resume(); s.targets = [];
    for (let i=0;i<59;i++) step(); expect(s.playerInfection).not.toBeNull();
    step(); expect(s.playerInfection).toBeNull();
  });
  it('infects on overlap without immediate HP damage, including during dash/contact damage protection', () => {
    const s = fixture(); s.player.dashUntil = 10; s.targets = [virus(s.player)];
    const hp = s.player.hp, events = frame(s);
    expect(events.some(e => e.type === 'PLAYER_INFECTED')).toBe(true);
    expect(s.player.hp).toBe(hp); expect(s.playerInfection!.nextTickAt).toBeCloseTo(s.elapsed + 1);
  });
  it('sweeps a fast grounded pass, respects blockers, and ignores dead bodies and static nests', () => {
    const s = fixture(), from = { x: 600, y: 800 }, to = { x: 750, y: 800 };
    s.targets = [virus({ x: 675, y: 800 })];
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step)).toHaveLength(1);
    s.playerInfection = null; s.targets[0].hp = 0;
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step)).toHaveLength(0);
    s.targets[0].hp = 68; s.targets[0].role = 'nest';
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step)).toHaveLength(0);
    s.targets[0].role = 'virus'; s.world!.obstacles = [{ id: 'wall', x: 630, y: 800, radius: 15 }];
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step)).toHaveLength(0);
  });
  it('does not infect mid-flight or sweep an aerial landing, but a real landing overlap infects', () => {
    const s = fixture(), from = { x: 600, y: 800 }, to = { x: 750, y: 800 };
    s.targets = [virus({ x: 675, y: 800 })];
    s.playerFlight = { id: 'flight', from, to, born: 0, landsAt: 1 } as GameState['playerFlight'];
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step)).toEqual([]);
    s.playerFlight = undefined;
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step, { wasAirborne: true })).toEqual([]);
    s.targets[0].x = to.x;
    expect(advancePlayerContactInfection(s, from, to, BALANCE.step, { wasAirborne: true })).toHaveLength(1);
  });
  it('keeps refreshing 8s without postponing damage ticks; sustained contact cannot be cleansed in a healthy spring', () => {
    const s = fixture(), spring = node(s); Object.assign(s.player, { x: spring.x, y: spring.y, hp: 50 });
    s.targets = [virus(s.player)];
    for (let i = 0; i < 120; i++) frame(s);
    expect(s.playerInfection).not.toBeNull(); expect(s.territory!.healingContact.seconds).toBe(0);
    expect(s.playerInfection!.nextTickAt).toBeLessThan(s.elapsed + 1.02);
    expect(s.events.some(e => e.type === 'PLAYER_HURT' && e.data.reason === 'infection')).toBe(true);
    expect(s.events.some(e => e.type === 'PLAYER_INFECTION_CLEARED' && e.data.reason === 'healing')).toBe(false);
    s.targets = [];
    for (let i = 0; i < 59; i++) frame(s);
    expect(s.playerInfection).not.toBeNull();
    frame(s); expect(s.playerInfection).toBeNull();
  });
  it('refreshes from accepted attacks and freezes exposure/cleansing while paused', () => {
    const s = fixture(), spring = node(s); Object.assign(s.player, spring); infectPlayer(s, 'first');
    for (let i = 0; i < 30; i++) frame(s);
    const nextTick = s.playerInfection!.nextTickAt; infectPlayer(s, 'attack');
    expect(s.territory!.healingContact.seconds).toBe(0); expect(s.playerInfection!.nextTickAt).toBe(nextTick);
    s.phase = 'paused'; const before = structuredClone(s);
    expect(advancePlayerContactInfection(s, s.player, s.player, 1)).toEqual([]);
    expect(advanceTerritory(s, 1)).toEqual([]); expect(s).toEqual(before);
  });
  it('keeps the prior infection ticking in flight and gives no airborne treatment', () => {
    const s = fixture(); infectPlayer(s); s.playerFlight = { id: 'flight', born: 0, landsAt: 10 } as GameState['playerFlight'];
    for (let i = 0; i < 60; i++) frame(s);
    expect(s.player.hp).toBe(99); expect(s.territory!.healingContact.nodeId).toBeNull();
  });
  it('rejects airborne candidates and direct starts without replacing the saved channel', () => {
    const s = fixture(), front = node(s, 'front-north'); Object.assign(s.player, { x: front.x, y: front.y });
    expect(beginTerritoryPurification(s, front).accepted).toBe(true); front.purificationProgress = 42;
    const channel = structuredClone(s.territory!.purification);
    s.playerFlight = { id: 'flight', from: front, to: front, born: 0, landsAt: 1 };
    expect(territoryPurificationCandidate(s)).toBeUndefined();
    expect(beginTerritoryPurification(s, front)).toMatchObject({ accepted: false, reason: 'airborne' });
    expect(territoryContextView(s)).toMatchObject({ action: 'blocked', reason: 'airborne', pausedReason: 'airborne', progress: 42 });
    advanceTerritory(s, .5);
    expect(front.purificationProgress).toBe(42); expect(s.territory!.purification).toEqual(channel);
  });
  it.each([80, 181])('pauses in the actual flight session, keeps infection damage and resumes only in range after landing at +%s', offset => {
    const game = new GameSession(741, { mode: 'endless', territory: true }); game.start();
    const s = game.state, front = node(s, 'front-north'); s.targets = []; s.world = { ...s.world!, obstacles: [] };
    Object.assign(s.endless!, { phase: 'warning', phaseUntil: Infinity, nextSpawnAt: Infinity, remainingToSpawn: 1, batchSchedule: [] });
    Object.assign(s.player, { x: front.x, y: front.y }); beginTerritoryPurification(s, front); front.purificationProgress = 42;
    const channel = structuredClone(s.territory!.purification); infectPlayer(s);
    s.playerFlight = { id: 'flight', from: { x: front.x, y: front.y }, to: { x: front.x + offset, y: front.y }, born: 0, landsAt: .75 };
    const step = () => game.step({ moveX: 0, moveY: 0, fire: false, aim: s.player });
    for (let i = 0; i < 44; i++) step();
    expect(front.purificationProgress).toBe(42); expect(s.territory!.purification).toEqual(channel);
    step(); expect(s.playerFlight).toBeUndefined();
    expect(front.purificationProgress).toBeCloseTo(offset <= 150 ? 42 + 100 / 180 : 42);
    for (let i = 0; i < 15; i++) step();
    expect(s.player.hp).toBe(99); expect(s.events.some(e => e.type === 'PLAYER_HURT' && e.data.reason === 'infection')).toBe(true);
    if (offset > 150) {
      expect(territoryContextView(s).pausedReason).toBe('out-of-range');
      Object.assign(s.player, { x: front.x, y: front.y }); step();
      expect(front.purificationProgress).toBeCloseTo(42 + 100 / 180);
    }
    expect(s.territory!.purification).toEqual(channel);
  });
});

describe('body-sized spring pollution shares its authority with purification and HUD', () => {
  it('uses 36 + enemy radius, never the 150 healing ring; fronts stay specialist-only', () => {
    const s = fixture(), spring = node(s), front = node(s, 'front-north');
    s.targets = [virus({ x: spring.x + 58.001, y: spring.y })];
    expect(territoryPollutionRate(s, spring)).toBe(0);
    s.targets[0].x = spring.x + 58;
    expect(territoryPollutionRate(s, spring)).toBe(2.5);
    front.owner = 'healthy'; Object.assign(s.targets[0], { x: front.x, y: front.y });
    expect(territoryPollutionRate(s, front)).toBe(0);
  });
  it.each(['slime-caster', 'nest-builder', 'fastling'] as const)('includes an actual %s body but excludes its static nest', profession => {
    const s = fixture(), spring = node(s); s.targets = [virus(spring, { profession })];
    expect(territoryNodeContaminators(s, spring).map(t => t.id)).toEqual(['touch-virus']);
    expect(territoryNodeView(s, spring)!.attackerIds).toEqual(['touch-virus']);
    s.targets[0].role = 'nest'; expect(territoryNodeContaminators(s, spring)).toEqual([]);
  });
  it('caps ordinary pressure at 3 bodies, takes max with specialists, and recedes at 10pp/sec', () => {
    const s = fixture(), spring = node(s); s.targets = Array.from({ length: 5 }, (_, i) => virus(spring, { id: `body:${i}` }));
    expect(territoryPollutionRate(s, spring)).toBe(7.5);
    advanceTerritory(s, 1); expect(spring.infectionProgress).toBe(7.5);
    s.targets.push(virus(spring, { id: 'invader', territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: spring.id } }));
    expect(territoryPollutionRate(s, spring)).toBe(10);
    advanceTerritory(s, 1); expect(spring.infectionProgress).toBe(17.5);
    s.targets = []; advanceTerritory(s, 1); expect(spring.infectionProgress).toBe(7.5);
    advanceTerritory(s, 1); expect(spring.infectionProgress).toBe(0);
  });
  it('still finds ordinary contamination after loss, pauses a spring cleanse and resumes once those bodies leave', () => {
    const s = fixture(), spring = node(s); spring.owner = 'infected'; spring.infectionProgress = 100;
    Object.assign(s.player, { x: spring.x, y: spring.y }); s.targets = [virus(spring)]; beginTerritoryPurification(s, spring);
    expect(territoryContextView(s).pausedReason).toBe('contaminant');
    expect(territoryContextHint(s)).toContain('清除贴泉病毒');
    advanceTerritory(s, 1); expect(spring.purificationProgress).toBe(0);
    s.targets = []; advanceTerritory(s, 1); expect(spring.purificationProgress).toBeCloseTo(100 / 3);
  });
  it('gives the actual 40-second single-body loss estimate and blocks pressure through walls', () => {
    const s = fixture(), spring = node(s); s.targets = [virus({ x: spring.x + 50, y: spring.y })];
    expect(territoryLaneViews(s)[0].warning!.seconds).toBe(40);
    s.world!.obstacles = [{ id: 'barrier', x: spring.x + 25, y: spring.y, radius: 5 }];
    expect(territoryPollutionRate(s, spring)).toBe(0);
  });
  it('merges actual small healing receipts and never creates a heal number at full HP', () => {
    const s = fixture(), spring = node(s); Object.assign(s.player, { x: spring.x, y: spring.y, hp: 98 });
    for (let i = 0; i < 30; i++) frame(s);
    expect(recentPlayerHealing(s)!.amount).toBeCloseTo(1.5);
    for (let i = 0; i < 90; i++) frame(s);
    expect(s.player.hp).toBe(100); expect(s.territory!.healingContact.healed).toBe(0);
    expect(recentPlayerHealing(s)).toBeNull();
  });
});
