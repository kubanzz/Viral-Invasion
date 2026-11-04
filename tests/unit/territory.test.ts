import { describe, expect, it } from 'vitest';
import { advanceTerritory, beginTerritoryPurification, boundedRegionPolygon, createTerritoryState, destroyTerritorySource, infectPlayer,
  initializeTerritory, syncTerritoryHealingNodes, territoryHealingNodeAt, territoryInvaderGoal, territorySourceShielded,
  territoryContextView, territoryLaneViews, territoryNodeView, territoryPurificationCandidate,
  territoryNodeAt, territoryPolygon, TERRITORY_BALANCE } from '../../src/game/territory';
import { BALANCE, type GameState, type Target, type Vec } from '../../src/game/types';
import type { BattleState } from '../../src/game/battleTypes';
import type { TerritoryNodeId, TerritoryRuleEvent } from '../../src/game/territoryTypes';
import { createEndlessGrowth } from '../../src/game/endlessGrowth';
import { GrowthController } from '../../src/game/growth';
import { supplyTerritoryDefense } from '../fixtures/territoryDefense';

const bounds = { left: 85, right: 2315, top: 145, bottom: 1415 };
function fixture(): GameState {
  const state: GameState = {
    game: 'viral-invasion', schemaVersion: 1, seed: 71, phase: 'playing', tick: 0, elapsed: 0,
    player: { x: 1200, y: 900, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
    tissue: { x: 1200, y: 900, hp: 100, maxHp: 100, radius: 43 }, terminal: { x: 0, y: 0 },
    targets: [], tool: 1, cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0,
    effects: [], events: [], message: '', messageUntil: 0, shots: 0, hits: 0, scans: 0, dashes: 0, result: null,
  };
  initializeTerritory(state);
  return state;
}
const node = (state: GameState, id: TerritoryNodeId) => state.territory!.nodes.find(candidate => candidate.id === id)!;
const invader = (state: GameState, nodeId: TerritoryNodeId = 'heart-healing-1', id = 'invader'): Target => ({
  ...node(state, nodeId), id, role: 'virus', kind: 'single', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false,
  territoryTask: { kind: 'invade', nodeId },
});
function run(state: GameState, seconds: number): TerritoryRuleEvent[] {
  const events: TerritoryRuleEvent[] = [], steps = Math.round(seconds / BALANCE.step);
  for (let tick = 0; tick < steps; tick++) {
    state.tick++; state.elapsed = state.tick * BALANCE.step;
    events.push(...advanceTerritory(state, BALANCE.step));
  }
  return events;
}
const polygonArea = (points: Vec[]) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2;
function insideConvex(point: Vec, polygon: Vec[]): boolean {
  return polygon.every((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= -1e-6;
  });
}

describe('heart territory ownership and bounded Voronoi geometry', () => {
  it('creates seven independent regions, healthy springs and two infected fronts with locked source mappings', () => {
    const state = fixture(), territory = state.territory!;
    expect(territory.nodes.map(region => [region.id, region.x, region.y, region.owner])).toEqual([
      ['core', 1200, 900, 'healthy'], ['heart-healing-1', 1150, 330, 'healthy'],
      ['heart-healing-2', 1880, 1300, 'healthy'], ['source-west', 450, 600, 'infected'], ['source-east', 1950, 450, 'infected'],
      ['front-north', 700, 350, 'infected'], ['front-south', 2140, 950, 'infected'],
    ]);
    expect(territory.sources['source-west']).toMatchObject({ healingNodeId: 'heart-healing-1', unlocked: false, destroyed: false });
    expect(territory.sources['source-east']).toMatchObject({ healingNodeId: 'heart-healing-2', unlocked: false, destroyed: false });
    const other = createTerritoryState(); territory.nodes[0].infectionProgress = 50;
    expect(other.nodes[0].infectionProgress).toBe(0);
    expect(state.playerInfection).toBeNull(); expect(territory.stage).toBe('rescue');
  });

  it('covers actual map bounds exactly and agrees with nearest-site ownership', () => {
    const territory = createTerritoryState();
    const polygons = territory.nodes.map(region => territoryPolygon(territory, region.id, bounds));
    expect(polygons.every(polygon => polygon.length >= 3 && polygon.length <= 8)).toBe(true);
    expect(polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0)).toBeCloseTo((bounds.right - bounds.left) * (bounds.bottom - bounds.top), 6);
    for (const polygon of polygons) for (const point of polygon) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.left - 1e-7); expect(point.x).toBeLessThanOrEqual(bounds.right + 1e-7);
      expect(point.y).toBeGreaterThanOrEqual(bounds.top - 1e-7); expect(point.y).toBeLessThanOrEqual(bounds.bottom + 1e-7);
    }
    for (let x = 100; x < 2300; x += 137) for (let y = 160; y < 1400; y += 113) {
      const point = { x, y }, selected = territoryNodeAt(territory, point)!;
      expect(insideConvex(point, polygons[territory.nodes.indexOf(selected)])).toBe(true);
    }
    expect(territoryNodeAt(territory, { x: 825, y: 750 })!.id).toBe('core');
    expect(territoryNodeAt(territory, { x: NaN, y: 0 })).toBeUndefined();
    expect(territoryPolygon(territory, 'core', { ...bounds, right: bounds.left })).toEqual([]);
  });

  it('mirrors ownership into existing graph nodes without accepting graph writes as authority', () => {
    const state = fixture();
    state.battle = { graph: { nodes: [], edges: [] } } as unknown as BattleState;
    syncTerritoryHealingNodes(state);
    expect(state.battle.graph.nodes).toHaveLength(2);
    const north = state.battle.graph.nodes[0]; north.infected = true; north.infection = 100;
    syncTerritoryHealingNodes(state);
    expect(north.infected).toBe(false); expect(north.infection).toBe(0);
    expect(state.battle.graph.nodes[1].infected).toBe(false);
    expect(node(state, 'heart-healing-1').owner).toBe('healthy');
  });

  it('supports arbitrary readonly legacy graph sites without inventing territory state or mutating sites', () => {
    const sites = Object.freeze([Object.freeze({ id: 'lung:legacy-source/a', x: 50, y: 50, active: false }),
      Object.freeze({ id: 'lung-custom-healing-9', x: 150, y: 50, active: true })]);
    const before = structuredClone(sites), rectangle = { left: 0, right: 200, top: 0, bottom: 100 };
    const left = boundedRegionPolygon(sites, sites[0].id, rectangle), right = boundedRegionPolygon(sites, sites[1].id, rectangle);
    expect(polygonArea(left)).toBe(10_000); expect(polygonArea(right)).toBe(10_000);
    expect(left.every(point => point.x <= 100)).toBe(true); expect(right.every(point => point.x >= 100)).toBe(true);
    expect(boundedRegionPolygon(sites, 'not-a-site', rectangle)).toEqual([]);
    expect(sites).toEqual(before);
  });
});

describe('visible invaders and mobile purification', () => {
  it('requires a dedicated live invader at the inclusive 120-unit radius; crowds do not accelerate capture', () => {
    const single = fixture(), crowd = fixture(), ordinary = fixture();
    single.targets = [invader(single)]; single.targets[0].x += TERRITORY_BALANCE.captureRadius;
    crowd.targets = Array.from({ length: 8 }, (_, index) => invader(crowd, 'heart-healing-1', `invader-${index}`));
    ordinary.targets = [{ ...invader(ordinary), territoryTask: undefined }];
    run(single, 5); run(crowd, 5); run(ordinary, 5);
    expect(node(single, 'heart-healing-1').infectionProgress).toBeCloseTo(50);
    expect(node(crowd, 'heart-healing-1').infectionProgress).toBeCloseTo(50);
    expect(node(ordinary, 'heart-healing-1').infectionProgress).toBeCloseTo(12.5);
    const events = run(single, 5);
    expect(node(single, 'heart-healing-1').owner).toBe('infected');
    expect(events.filter(event => event.type === 'TERRITORY_CAPTURED')).toHaveLength(1);
    expect(run(single, 1).filter(event => event.type === 'TERRITORY_CAPTURED')).toHaveLength(0);
    const outside = fixture(); outside.targets = [invader(outside)]; outside.targets[0].x += 120.001;
    run(outside, 1); expect(node(outside, 'heart-healing-1').infectionProgress).toBe(0);
  });

  it('recovers ten percentage points per second after invaders leave and never infects the core region', () => {
    const state = fixture(); state.targets = [invader(state)]; run(state, 5);
    state.targets[0].hp = 0; run(state, 2);
    expect(node(state, 'heart-healing-1').infectionProgress).toBeCloseTo(30);
    expect(run(state, 3).filter(event => event.type === 'TERRITORY_CAPTURE_REPELLED')).toHaveLength(1);
    state.targets = [invader(state, 'core')]; run(state, 12);
    expect(node(state, 'core').owner).toBe('healthy');
    expect(node(state, 'core').infectionProgress).toBe(0);
  });

  it('maps each source to its facility, then redirects a successful invader to the heart', () => {
    const state = fixture(), target = invader(state);
    target.territorySourceId = 'source-west';
    expect(territoryInvaderGoal(state, target)!.id).toBe('heart-healing-1');
    node(state, 'heart-healing-1').owner = 'infected';
    expect(territoryInvaderGoal(state, target)!.id).toBe('core');
    target.territorySourceId = 'source-east';
    expect(territoryInvaderGoal(state, target)!.id).toBe('heart-healing-2');
    target.hp = 0; expect(territoryInvaderGoal(state, target)).toBeUndefined();
  });

  it('starts with tool 3 nearby, preserves progress while leaving or interrupted, and permits movement and shooting', () => {
    const state = fixture(), south = node(state, 'heart-healing-2');
    Object.assign(south, { owner: 'infected', infectionProgress: 100 });
    state.player.x = south.x - 150; state.player.y = south.y;
    expect(beginTerritoryPurification(state, south)).toMatchObject({ accepted: true, nodeId: south.id });
    const startedAt = state.territory!.purification!.startedAt;
    run(state, 1); expect(south.purificationProgress).toBeCloseTo(100 / 3);
    state.player.x = south.x - 151; run(state, 1);
    expect(south.purificationProgress).toBeCloseTo(100 / 3);
    state.player.x = south.x - 100; state.player.moving = true; state.tool = 1; state.shots = 8;
    expect(beginTerritoryPurification(state, south).events).toEqual([]);
    expect(state.territory!.purification!.startedAt).toBe(startedAt);
    state.targets = [invader(state, south.id)]; run(state, 1);
    expect(south.purificationProgress).toBeCloseTo(100 / 3);
    state.targets = [];
    const events = run(state, 2);
    expect(south.owner).toBe('healthy'); expect(state.territory!.purification).toBeNull();
    expect(events.find(event => event.type === 'TERRITORY_PURIFIED')?.data).toMatchObject({ nodeId: south.id, first: true, reason: 'player' });
    expect(state.tool).toBe(1); expect(state.shots).toBe(8); expect(state.phase).toBe('playing'); expect(state.territory!.stage).toBe('rescue');
  });

  it('rejects remote, healthy, core and live source targets without changing progress', () => {
    const state = fixture();
    expect(beginTerritoryPurification(state, node(state, 'heart-healing-2')).reason).toBe('range');
    for (const id of ['source-west', 'core', 'heart-healing-1'] as const) {
      const region = node(state, id); Object.assign(state.player, { x: region.x, y: region.y });
      expect(beginTerritoryPurification(state, region).reason).toBe(region.kind === 'healing' ? 'healthy' : region.kind);
    }
    expect(state.territory!.purification).toBeNull();
  });

  it('only marks the first reclaim for rewards and does not grant score or replenish other regions', () => {
    const state = fixture(), south = node(state, 'heart-healing-2'); Object.assign(state.player, { x: south.x, y: south.y });
    Object.assign(south, { owner: 'infected', infectionProgress: 100 });
    beginTerritoryPurification(state, south); run(state, 3);
    state.targets = [invader(state, south.id)]; run(state, 10);
    state.targets = []; beginTerritoryPurification(state, south);
    expect(run(state, 3).find(event => event.type === 'TERRITORY_PURIFIED')?.data.first).toBe(false);
    state.territory!.sources['source-west'].unlocked = true;
    state.territory!.sources['source-west'].spawned = true;
    state.territory!.sources['source-west'].actorId = 'dead-source';
    state.targets.push({ ...invader(state), id: 'dead-source', role: 'source', hp: 0, territorySourceId: 'source-west', territoryTask: undefined });
    const events = destroyTerritorySource(state, 'source-west');
    expect(events.find(event => event.type === 'TERRITORY_SOURCE_DESTROYED')?.data.firstReward).toBe(true);
    expect(node(state, 'source-west')).toMatchObject({ owner: 'healthy', permanent: true });
    expect(node(state, 'source-east').owner).toBe('infected');
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    expect(state).not.toHaveProperty('score'); expect(state.events).toEqual([]);
  });

  it('does not purify a locked, unspawned, living, absent or mismatched source', () => {
    const state = fixture(), source = state.territory!.sources['source-west'];
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    source.unlocked = true; expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    source.spawned = true; source.actorId = 'expected';
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    state.targets = [{ ...invader(state), id: 'expected', role: 'source', territorySourceId: 'source-west' }];
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    state.targets[0].hp = 0; state.targets[0].id = 'other';
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    expect(source.destroyed).toBe(false); expect(source.rewarded).toBe(false);
    expect(node(state, 'source-west').owner).toBe('infected');
  });
});

describe('two fixed fronts and contextual objectives', () => {
  it('retargets through the first healthy front, spring, then core on its own lane', () => {
    const state = fixture(), target = invader(state); target.territorySourceId = 'source-west';
    node(state, 'front-north').owner = 'healthy';
    expect(territoryInvaderGoal(state, target)?.id).toBe('front-north');
    node(state, 'front-north').owner = 'infected';
    expect(territoryInvaderGoal(state, target)?.id).toBe('heart-healing-1');
    node(state, 'heart-healing-1').owner = 'infected';
    expect(territoryInvaderGoal(state, target)?.id).toBe('core');
    node(state, 'front-south').owner = 'healthy';
    expect(territoryInvaderGoal(state, target)?.id).toBe('core');
  });

  it('captures a reclaimed front with the same ten-second rule and escorts never capture', () => {
    const state = fixture(), front = node(state, 'front-north'); front.owner = 'healthy'; front.infectionProgress = 0;
    const target = invader(state, front.id); target.territorySourceId = 'source-west'; state.targets = [target];
    run(state, 5); expect(front.infectionProgress).toBeCloseTo(50);
    target.territoryTask!.kind = 'escort'; run(state, 2); expect(front.infectionProgress).toBeCloseTo(30);
    target.territoryTask!.kind = 'invade'; run(state, 7); expect(front.owner).toBe('infected');
    expect(territoryInvaderGoal(state, target)?.id).toBe('heart-healing-1');
  });

  it('requires the corresponding spring and resumes a front purification from saved progress', () => {
    const state = fixture(), front = node(state, 'front-north'), spring = node(state, 'heart-healing-1');
    Object.assign(state.player, { x: front.x, y: front.y }); spring.owner = 'infected';
    expect(beginTerritoryPurification(state, front)).toMatchObject({ accepted: false, reason: 'healing-required' });
    expect(territoryPurificationCandidate(state)).toBeUndefined();
    expect(territoryContextView(state)).toMatchObject({ action: 'blocked', reason: 'healing-required', requiredNodeId: spring.id });
    spring.owner = 'healthy'; beginTerritoryPurification(state, front); run(state, 1);
    expect(front.purificationProgress).toBeCloseTo(100 / 3);
    spring.owner = 'infected'; run(state, 1);
    expect(front.purificationProgress).toBeCloseTo(100 / 3);
    expect(territoryNodeView(state, front)).toMatchObject({ purificationActive: true, pausedReason: 'healing-required', requiredNodeId: spring.id });
    spring.owner = 'healthy'; run(state, 2); expect(front.owner).toBe('healthy');
  });

  it('opens each source membrane after real prior handoff while its own front, spring and garrison remain healthy', () => {
    const state = fixture(), front = node(state, 'front-north'), spring = node(state, 'heart-healing-1');
    expect(territorySourceShielded(state, 'source-west')).toBe(true);
    state.growth = new GrowthController(71, 'source-membrane', { version: 1, starterProtocolId: 'IMMUNE_BEACON' }, 'endless').state;
    supplyTerritoryDefense(state, ['north']);
    front.owner = 'healthy'; expect(territorySourceShielded(state, 'source-west')).toBe(false);
    expect(territorySourceShielded(state, 'source-east')).toBe(true);
    spring.owner = 'infected'; expect(territorySourceShielded(state, 'source-west')).toBe(true);
    spring.owner = 'healthy'; front.owner = 'infected'; expect(territorySourceShielded(state, 'source-west')).toBe(true);
    state.territory!.sources['source-west'].destroyed = true;
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
  });

  it('chooses an eligible nearby spring over a blocked front, retaining the old purification channel for display', () => {
    const state = fixture(), front = node(state, 'front-north'), spring = node(state, 'heart-healing-1');
    Object.assign(state.player, { x: front.x, y: front.y }); beginTerritoryPurification(state, front); run(state, 1);
    spring.owner = 'infected'; spring.x = front.x + 100; spring.y = front.y;
    expect(territoryPurificationCandidate(state)?.id).toBe(spring.id);
    expect(territoryContextView(state)).toMatchObject({ action: 'purify', nodeId: front.id, actionNodeId: spring.id, pausedReason: 'healing-required' });
    expect(territoryContextView(state).progress).toBeCloseTo(100 / 3);
    Object.assign(state.player, { x: 1200, y: 900 }); state.tissue.hp = 50;
    expect(territoryContextView(state)).toMatchObject({ action: 'repair', nodeId: front.id, actionNodeId: 'core' });
    expect(territoryContextView(state).progress).toBeCloseTo(100 / 3);
  });

  it('shows capture warnings only for actual attackers and attributes core attacks to the correct line', () => {
    const state = fixture();
    expect(territoryLaneViews(state).every(lane => lane.warning === undefined)).toBe(true);
    const target = invader(state); target.territorySourceId = 'source-west'; state.targets = [target]; run(state, 1);
    const north = territoryLaneViews(state)[0];
    expect(north.warning?.nodeId).toBe('heart-healing-1');
    expect(north.warning?.progress).toBeCloseTo(10); expect(north.warning?.seconds).toBeCloseTo(9);
    expect(north.healing.incomingFrom).toEqual({ x: target.x, y: target.y });
    node(state, 'heart-healing-1').owner = 'infected'; Object.assign(target, node(state, 'core'), { id: 'core-attacker' });
    expect(territoryLaneViews(state)[0].attackedNodeIds).toContain('core');
    expect(territoryLaneViews(state)[1].attackedNodeIds).not.toContain('core');
  });
});

describe('continuous facilities and player contact infection', () => {
  it('heals only in a healthy facility radius, continues during contest, and does not stack overlapping facilities', () => {
    const state = fixture(), north = node(state, 'heart-healing-1'), south = node(state, 'heart-healing-2');
    Object.assign(state.player, { x: north.x - 150, y: north.y, hp: 40 });
    Object.assign(south, { x: north.x, y: north.y, owner: 'healthy' });
    north.infectionProgress = 50; state.targets = [invader(state)];
    const events = run(state, 1);
    expect(state.player.hp).toBeCloseTo(43);
    expect(territoryHealingNodeAt(state)?.id).toBe(north.id);
    expect(events.filter(event => event.type === 'TERRITORY_PLAYER_HEALED').reduce((sum, event) => sum + Number(event.data.amount), 0)).toBeCloseTo(3);
    state.player.x -= .001; run(state, 1); expect(state.player.hp).toBeCloseTo(43);
    state.player.x = north.x; north.owner = south.owner = 'infected'; run(state, 1);
    expect(state.player.hp).toBeCloseTo(43); expect(state.territory!.healingContact.nodeId).toBeNull();
  });

  it('respects upgraded HP and emits only actual healing without lowering above-base vitality', () => {
    const state = fixture(), north = node(state, 'heart-healing-1');
    state.endlessGrowth = createEndlessGrowth(71); state.endlessGrowth.ranks.vitality = 2;
    Object.assign(state.player, { x: north.x, y: north.y, hp: 139 });
    const events = run(state, 1);
    expect(state.player.hp).toBe(140);
    expect(events.filter(event => event.type === 'TERRITORY_PLAYER_HEALED').reduce((sum, event) => sum + Number(event.data.healed), 0)).toBeCloseTo(1);
    expect(run(state, 1).some(event => event.type === 'TERRITORY_PLAYER_HEALED')).toBe(false);
  });

  it('inflicts eight one-HP ticks, and refresh never delays the next tick or stacks damage', () => {
    const state = fixture();
    expect(infectPlayer(state, 'virus-a')?.type).toBe('PLAYER_INFECTED');
    run(state, .5); expect(state.player.hp).toBe(100);
    expect(infectPlayer(state, 'virus-b')).toBeNull();
    expect(state.playerInfection).toMatchObject({ until: 8.5, nextTickAt: 1, sourceId: 'virus-b' });
    run(state, .5); expect(state.player.hp).toBe(99);
    expect(infectPlayer(state, 'virus-b')).toBeNull();
    run(state, 8);
    expect(state.player.hp).toBe(91); expect(state.playerInfection).toBeNull();
    const fresh = fixture(); infectPlayer(fresh); const events = run(fresh, 8);
    expect(fresh.player.hp).toBe(92);
    expect(events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(8);
    expect(events.filter(event => event.type === 'PLAYER_INFECTION_CLEARED')).toHaveLength(1);
    expect(run(fresh, 2).some(event => event.type === 'PLAYER_HURT')).toBe(false);
  });

  it('cleanses after one continuous second, resets interrupted contact, and cannot revive a dead player', () => {
    const state = fixture(), north = node(state, 'heart-healing-1');
    infectPlayer(state); Object.assign(state.player, { x: north.x, y: north.y, hp: 50 });
    run(state, .5); expect(state.playerInfection).not.toBeNull();
    state.player.x += 151; run(state, .5); expect(state.territory!.healingContact.seconds).toBe(0);
    state.player.x = north.x; run(state, .5); expect(state.playerInfection).not.toBeNull();
    const events = run(state, .5);
    expect(state.playerInfection).toBeNull();
    expect(events.find(event => event.type === 'PLAYER_INFECTION_CLEARED')?.data.reason).toBe('healing');
    state.player.hp = 0; run(state, 2); expect(state.player.hp).toBe(0);
  });

  it('does not bank an instant cleanse and requires a full fresh second after every new exposure', () => {
    const state = fixture(), north = node(state, 'heart-healing-1');
    Object.assign(state.player, { x: north.x, y: north.y }); run(state, 2);
    expect(state.territory!.healingContact.seconds).toBe(1);
    infectPlayer(state); run(state, .5); expect(state.playerInfection).not.toBeNull();
    infectPlayer(state); run(state, .5);
    expect(state.playerInfection).not.toBeNull();
    run(state, .5);
    expect(state.playerInfection).toBeNull();
  });

  it.each(['menu', 'paused', 'result', 'victory'] as const)('freezes ownership, purification, infection and healing in %s', phase => {
    const state = fixture(), south = node(state, 'heart-healing-2');
    Object.assign(state.player, { x: south.x, y: south.y, hp: 50 });
    beginTerritoryPurification(state, south); infectPlayer(state); state.targets = [invader(state)];
    if (phase === 'victory') state.territory!.stage = 'victory'; else state.phase = phase;
    const before = structuredClone(state);
    expect(advanceTerritory(state, 10)).toEqual([]); expect(infectPlayer(state)).toBeNull();
    expect(beginTerritoryPurification(state, south).accepted).toBe(false);
    expect(destroyTerritorySource(state, 'source-west')).toEqual([]);
    expect(state).toEqual(before);
  });

  it('continues facility and capture rules in optional guard without touching the rescue snapshot', () => {
    const state = fixture(), north = node(state, 'heart-healing-1');
    state.territory!.stage = 'guard';
    state.territory!.rescueSnapshot = { runId: 'original', seed: 71, atTick: 10, elapsed: 1, wave: 8, clearedWaves: 8,
      score: 100, kills: 100, bestCombo: 20, level: 8, playerHp: 80, coreHp: 70,
      fullyPurifiedSeconds: 0, longestFullyPurifiedSeconds: 0 };
    const snapshot = structuredClone(state.territory!.rescueSnapshot);
    Object.assign(state.player, { x: north.x, y: north.y, hp: 50 }); state.targets = [invader(state)];
    run(state, 1);
    expect(node(state, north.id).infectionProgress).toBeGreaterThan(0); expect(state.player.hp).toBeCloseTo(53);
    expect(state.territory!.rescueSnapshot).toEqual(snapshot); expect(state.territory!.stage).toBe('guard');
  });

  it.each([0, -1, NaN, Infinity])('ignores invalid duration %s', dt => {
    const state = fixture(), before = structuredClone(state);
    expect(advanceTerritory(state, dt)).toEqual([]); expect(state).toEqual(before);
  });
});
