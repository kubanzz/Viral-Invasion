import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { GrowthController, growthContext } from '../../src/game/growth';
import { summonImmuneCells } from '../../src/game/immuneCells';
import { advanceTerritory, advanceTerritoryDefense, beginTerritoryPurification, recordTerritoryCombatEvent,
  territoryBeaconRank, territoryContextView, territoryFrontGarrison, territorySourceShielded } from '../../src/game/territory';
import type { TerritoryLaneId, TerritoryNodeId } from '../../src/game/territoryTypes';
import type { TerritorySquadPlan } from '../../src/game/endlessTypes';
import type { BeaconState } from '../../src/game/growthTypes';
import { BALANCE, type GameEvent, type GameState, type Target } from '../../src/game/types';

// These are supplied rule transactions, not natural-play or balance evidence.
function fixture() {
  const game = new GameSession(741, { mode: 'endless', territory: true }); game.start();
  const state = game.state; state.targets = [];
  Object.assign(state.endless!, { phase: 'combat', phaseUntil: Infinity, remainingToSpawn: 1, nextSpawnAt: Infinity,
    batchSchedule: [], territoryTasks: { wave: 1, squads: [], reservedSlots: [] } });
  return { game, state };
}
const node = (state: GameState, id: TerritoryNodeId) => state.territory!.nodes.find(item => item.id === id)!;
function receipt(state: GameState, type: string, data: GameEvent['data']) {
  return recordTerritoryCombatEvent(state, { tick: state.tick, type, data });
}
function squad(state: GameState, laneId: TerritoryLaneId, nodeId: TerritoryNodeId, serial = 0) {
  const anchor = node(state, nodeId), id = `rule:${laneId}:${serial}`, sourceId = laneId === 'north' ? 'source-west' : 'source-east';
  const members: Target[] = Array.from({ length: 4 }, (_, index) => ({ id: `${id}:${index}`, x: anchor.x + 180, y: anchor.y,
    hp: 68, maxHp: 68, kind: 'single', role: 'virus', radius: 22, hitUntil: 0, scanned: false, territorySourceId: sourceId,
    territoryTask: { kind: index === 0 ? 'invade' : 'escort', nodeId, squadId: id }, blocksWaveClear: true }));
  const plan: TerritorySquadPlan = { id, wave: 1, laneId, sourceId, slots: [0, 1, 2, 3], departureOffset: 4,
    status: 'active', memberIds: members.map(member => member.id) };
  state.targets.push(...members); state.endless!.territoryTasks!.squads.push(plan);
  receipt(state, 'TERRITORY_SQUAD_SPAWNED', { squadId: id });
  return { plan, members };
}
function clear(state: GameState, group: ReturnType<typeof squad>, immuneCellId?: string) {
  for (const target of group.members) {
    target.hp = 0;
    receipt(state, 'TARGET_HIT', { id: target.id, damage: 68, ...(immuneCellId ? { immuneCellId } : {}) });
  }
  group.plan.status = 'complete'; receipt(state, 'TERRITORY_SQUAD_CLEARED', { squadId: group.plan.id });
  return advanceTerritoryDefense(state, BALANCE.step);
}
function place(state: GameState, laneId: TerritoryLaneId, count = 5) {
  const front = node(state, laneId === 'north' ? 'front-north' : 'front-south');
  front.owner = 'healthy'; front.infectionProgress = 0;
  const beacon: BeaconState = { id: `guard:${laneId}`, x: front.x, y: front.y, organId: 'heart', born: 0, until: Infinity,
    radius: 300, damage: 48, interval: .8, nextAttackAt: 0, tuning: 'balanced', rank: 3, cellCount: count, mode: 'protocol',
    guard: { kind: 'territory', regionId: front.id, radius: 300 } };
  state.growth!.beacons = [...state.growth!.beacons ?? [], beacon]; state.growth!.beacon = beacon;
  state.growth!.cells = [...state.growth!.cells ?? [], ...summonImmuneCells(beacon, growthContext(state), count)];
  return beacon;
}
function mature(state: GameState) {
  state.territory!.defense.north.repelled = true; state.territory!.defense.south.repelled = true;
  state.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!.rank = 3;
}

describe('deterministic territorial military growth', () => {
  it('earns II then III from different healthy battle lines, independently of random upgrade choices', () => {
    const { state } = fixture();
    expect(territoryBeaconRank(state)).toBe(1);
    expect(clear(state, squad(state, 'south', 'heart-healing-2')).map(event => event.type)).toContain('TERRITORY_DEFENSE_MILESTONE');
    expect(territoryBeaconRank(state)).toBe(2);
    clear(state, squad(state, 'south', 'heart-healing-2', 1));
    expect(territoryBeaconRank(state)).toBe(2);
    clear(state, squad(state, 'north', 'heart-healing-1'));
    expect(territoryBeaconRank(state)).toBe(3);
    expect(state.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!.rank).toBe(3);
  });
  it('does not reward remote sniping, an infected objective, or a facility that fell during its battle', () => {
    for (const mode of ['remote', 'infected', 'fell'] as const) {
      const { state } = fixture(), group = squad(state, 'north', 'heart-healing-1'), spring = node(state, 'heart-healing-1');
      if (mode === 'remote') for (const member of group.members) member.x = 50;
      if (mode === 'infected') spring.owner = 'infected';
      if (mode === 'fell') {
        receipt(state, 'TARGET_HIT', { id: group.members[0].id, damage: 1 });
        receipt(state, 'TERRITORY_CAPTURED', { nodeId: spring.id });
      }
      clear(state, group);
      expect(state.territory!.defense.north.repelled).toBe(false);
    }
  });
  it('carries a real cleared defense proof across waves until residual invasion recedes, without holding its finite task open', () => {
    const { state } = fixture(), group = squad(state, 'north', 'heart-healing-1'), spring = node(state, 'heart-healing-1');
    spring.infectionProgress = 20; clear(state, group);
    expect(group.plan.status).toBe('complete'); expect(state.territory!.defense.north.repelled).toBe(false);
    state.endless!.territoryTasks = { wave: 2, squads: [], reservedSlots: [] };
    spring.infectionProgress = 0; advanceTerritoryDefense(state, BALANCE.step);
    expect(state.territory!.defense.north.repelled).toBe(true);
  });
  it('pins the existing beacon slot against replacement while allowing other protocol slots to change', () => {
    const own = new GrowthController(741, 'pinned', { version: 1, starterProtocolId: 'IMMUNE_BEACON' }, 'endless');
    const { state } = fixture(); state.growth = own.state;
    own.afterInput(growthContext(state));
    own.state.equipped.push({ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'balanced' });
    const option = { id: 'new-trace', kind: 'equip' as const, protocolId: 'EXPOSE_TRACE' as const, tuning: 'balanced' as const,
      title: 'trace', trigger: '', effect: '', cost: '', tags: [] };
    own.state.draft = { id: 'draft', source: 'endless', serial: 1, status: 'replacing', selectedOptionId: option.id, options: [option, option, option] };
    expect(own.chooseDraft({ runId: own.state.runId, draftId: 'draft', optionId: option.id, slotIndex: 0,
      expectedPreviousProtocolId: 'IMMUNE_BEACON' })).toMatchObject({ kind: 'rejected', reason: 'required-territory-protocol' });
    expect(own.state.equipped[0].id).toBe('IMMUNE_BEACON');
    expect(own.chooseDraft({ runId: own.state.runId, draftId: 'draft', optionId: option.id, slotIndex: 1,
      expectedPreviousProtocolId: 'PULSE_BREAK' }).kind).toBe('committed');
  });
  it('synchronizes fixed beacon milestones without healing veterans, reviving casualties, or resetting attack and deployment clocks', () => {
    const { state } = fixture(), own = new GrowthController(741, 'military-wounds', { version: 1, starterProtocolId: 'IMMUNE_BEACON' }, 'endless');
    state.growth = own.state;
    own.onScan(growthContext(state));
    const veteranId = own.state.cells![0].id, deadId = own.state.cells![1].id;
    own.state.cells![0].hp = 17; own.state.cells![0].attackReadyAt = 4; own.state.cells![1].hp = 0;
    const summonReady = own.state.beaconReadyAt;
    state.territory!.defense.north.repelled = true;
    state.tick++; state.elapsed += BALANCE.step; own.afterInput(growthContext(state));
    expect(own.state.equipped[0].rank).toBe(2);
    expect(own.state.cells).toHaveLength(3); expect(own.state.cells!.some(cell => cell.id === deadId)).toBe(false);
    expect(own.state.cells!.find(cell => cell.id === veteranId)).toMatchObject({ hp: 17, maxHp: 72, attackReadyAt: 4 });
    state.territory!.defense.south.repelled = true;
    state.tick++; state.elapsed += BALANCE.step; own.afterInput(growthContext(state));
    expect(own.state.equipped[0].rank).toBe(3);
    expect(own.state.cells).toHaveLength(4);
    expect(own.state.cells!.find(cell => cell.id === veteranId)).toMatchObject({ hp: 17, maxHp: 84, attackReadyAt: 4 });
    state.tick++; state.elapsed += BALANCE.step; own.afterInput(growthContext(state));
    expect(own.state.cells).toHaveLength(4); expect(own.state.beaconReadyAt).toBe(summonReady);
  });
});

describe('node-powered source membranes and optional garrisons', () => {
  it.each(['north', 'south'] as const)('opens the %s source at rank I without deploying, waiting or earning a handoff', laneId => {
    const { state } = fixture();
    const frontId = laneId === 'north' ? 'front-north' : 'front-south';
    const sourceId = laneId === 'north' ? 'source-west' : 'source-east';
    expect(territoryBeaconRank(state)).toBe(1);
    expect(territorySourceShielded(state, sourceId)).toBe(true);
    node(state, frontId).owner = 'healthy';
    expect(territorySourceShielded(state, sourceId)).toBe(false);
    expect(state.territory!.defense[laneId].handoff).toBe(false);
    expect(state.growth!.cells ?? []).toHaveLength(0);
    expect(territorySourceShielded(state, laneId === 'north' ? 'source-east' : 'source-west')).toBe(true);
  });
  it('allows player-only cleanup without delaying access or reserving another squad', () => {
    const { state } = fixture(); node(state, 'front-north').owner = 'healthy';
    const budget = state.endless!.remainingToSpawn;
    const events = clear(state, squad(state, 'north', 'front-north'));
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
    expect(events.some(event => event.type.startsWith('TERRITORY_HANDOFF'))).toBe(false);
    expect(state.endless!.remainingToSpawn).toBe(budget);
  });
  it.each(['redirect', 'death'] as const)('keeps the membrane open on garrison %s', mode => {
    const { state } = fixture(); mature(state); const beacon = place(state, 'north');
    if (mode === 'redirect') beacon.guard = { kind: 'territory', regionId: 'core', radius: 300 };
    else for (const cell of state.growth!.cells!) cell.hp = 0;
    advanceTerritoryDefense(state, BALANCE.step);
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
  });
  it.each(['front-north', 'heart-healing-1'] as const)('restores the membrane only after %s is captured, then opens on recapture', nodeId => {
    const { state } = fixture(); node(state, 'front-north').owner = 'healthy';
    const supplier = node(state, nodeId); supplier.infectionProgress = 99;
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
    supplier.owner = 'infected'; expect(territorySourceShielded(state, 'source-west')).toBe(true);
    supplier.owner = 'healthy'; expect(territorySourceShielded(state, 'source-west')).toBe(false);
    state.territory!.sources['source-west'].destroyed = true; supplier.owner = 'infected';
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
  });
  it('keeps a real fission parent and both actual offspring in the same finite squad until every child is cleared', () => {
    const { game, state } = fixture(), group = squad(state, 'north', 'heart-healing-1');
    group.members[0].traits = ['FISSION'];
    const damage = (target: Target) => (game as unknown as { damage(target: Target, amount: number): number }).damage(target, target.maxHp);
    for (const target of group.members) damage(target);
    expect(group.members[0].splitAt).toBeDefined();
    for (let frame = 0; frame < 55; frame++) game.step({ moveX: 0, moveY: 0, fire: false, aim: state.player });
    const children = state.targets.filter(target => target.generation === 1);
    expect(children).toHaveLength(2);
    expect(children.every(child => child.territoryTask?.kind === 'escort'
      && child.territoryTask.squadId === group.plan.id && group.plan.memberIds.includes(child.id))).toBe(true);
    expect(group.plan.status).toBe('active');
    expect(state.territory!.defense.north.repelled).toBe(false);
    for (const child of children) damage(child);
    game.step({ moveX: 0, moveY: 0, fire: false, aim: state.player });
    expect(group.plan.status).toBe('complete');
    expect(state.territory!.defense.north.repelled).toBe(true);
  });
});

describe('hurt interruption and simulation-clock healthy territory time', () => {
  it('pauses purification for .8 seconds on real direct damage while infection ticks and stale receipts cannot extend it', () => {
    const { state } = fixture(), front = node(state, 'front-north');
    Object.assign(state.player, { x: front.x, y: front.y }); beginTerritoryPurification(state, front);
    receipt(state, 'PLAYER_HURT', { reason: 'melee', damage: 8 });
    expect(territoryContextView(state).pausedReason).toBe('hurt');
    advanceTerritory(state, BALANCE.step); expect(front.purificationProgress).toBe(0);
    state.tick = 24; state.elapsed = .4; receipt(state, 'PLAYER_HURT', { reason: 'infection', damage: 1 });
    receipt(state, 'PLAYER_HURT', { reason: 'melee', damage: 0 });
    recordTerritoryCombatEvent(state, { type: 'PLAYER_HURT', tick: 23, data: { reason: 'melee', damage: 8 } });
    expect(state.territory!.purificationInterruptedUntil).toBe(.8);
    state.tick = 48; state.elapsed = .8; advanceTerritory(state, BALANCE.step);
    expect(front.purificationProgress).toBeGreaterThan(0);
    const progress = front.purificationProgress;
    state.phase = 'paused'; advanceTerritory(state, 10); expect(front.purificationProgress).toBe(progress);
  });
  it('accumulates when all seven owners and invasion progress are clean, even if an invader is still approaching', () => {
    const { state } = fixture();
    for (const item of state.territory!.nodes) { item.owner = 'healthy'; item.infectionProgress = 0; }
    const group = squad(state, 'north', 'front-north'); group.members[0].x = 450;
    advanceTerritoryDefense(state, 1); expect(state.territory!.stability).toMatchObject({ active: true, totalSeconds: 1, currentSeconds: 1, bestSeconds: 1 });
    node(state, 'front-north').infectionProgress = 1; advanceTerritoryDefense(state, .5);
    expect(state.territory!.stability).toMatchObject({ active: false, totalSeconds: 1, currentSeconds: 0, bestSeconds: 1 });
    node(state, 'front-north').infectionProgress = 0; advanceTerritoryDefense(state, 2);
    expect(state.territory!.stability).toMatchObject({ active: true, totalSeconds: 3, currentSeconds: 2, bestSeconds: 2 });
    const before = structuredClone(state.territory!.stability);
    state.phase = 'paused'; advanceTerritoryDefense(state, 60); expect(state.territory!.stability).toEqual(before);
    state.phase = 'playing'; state.player.hp = 0; advanceTerritoryDefense(state, 60); expect(state.territory!.stability).toEqual(before);
  });
});
