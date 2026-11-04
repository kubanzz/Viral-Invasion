import { GameSession } from '../../src/game/session';
import type { GameEvent, InputFrame } from '../../src/game/types';
import type { TerritorySquadPlan } from '../../src/game/endlessTypes';

/** Isolated production-combat fixture. Supplies only initial world/mission/rank
 * conditions, then uses real Q, navigation, bites, enemy attacks and capture.
 * No HP, damage, actors' deaths or outcomes are injected during simulation. */
export function measureGarrisonCombat(seed: number, rank: 1 | 3, rounds = 1, maximumSeconds = rounds * 20 + 30, wave = 3) {
  const game = new GameSession(seed, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, front = state.territory!.nodes.find(node => node.id === 'front-north')!;
  state.world = { ...state.world!, obstacles: [] }; state.targets = [];
  front.owner = 'healthy'; front.infectionProgress = 0;
  // The player must physically visit the front for the new foot deployment.
  Object.assign(state.player, { x: front.x, y: front.y });
  state.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!.rank = rank;
  const tasks: TerritorySquadPlan[] = Array.from({ length: rounds }, (_, index) => ({
    id: `isolated:${seed}:north:${index}`, wave, laneId: 'north', sourceId: 'source-west',
    slots: [index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3], departureOffset: 4 + index * 10,
    status: 'pending', memberIds: [],
  }));
  const budget = rounds * 4;
  Object.assign(e, { wave, phase: 'combat', phaseUntil: 0, phaseStartedAt: 0,
    totalToSpawn: budget, remainingToSpawn: budget, canceledToSpawn: 0, spawnSerial: 0, spawnedIds: [],
    batchIndex: 0, batchMemberIndex: 0, nextSpawnAt: Infinity, traits: [], supportRemaining: 0, eliteRemaining: 0,
    batchSchedule: [{ at: 0, sector: 0, spread: .3, roles: Array.from({ length: budget }, () => 'ordinary') }],
    territoryTasks: { wave, squads: tasks, reservedSlots: tasks.flatMap(task => task.slots) } });
  const events: GameEvent[] = [];
  let phantomEscortAttacks = 0;
  game.bus.on('event', event => {
    if (event.type === 'ATTACK_TELEGRAPHED' && event.data.target === 'player') {
      const actor = state.targets.find(target => target.id === event.data.actorId);
      if (actor?.territoryTask?.kind === 'escort' && Math.hypot(actor.x - state.player.x, actor.y - state.player.y) > 400) phantomEscortAttacks++;
    }
    if (/TERRITORY_|IMMUNE_CELL_HURT|IMMUNE_CELL_DIED|PROTOCOL_BEACON_HIT|TARGET_HIT|IMMUNE_GUARD_ASSIGNED/.test(event.type))
      events.push(structuredClone(event));
  });
  for (let frame = 0; frame < Math.ceil(maximumSeconds * 60); frame++) {
    if (state.phase !== 'playing' || front.owner !== 'healthy') break;
    const retreat = { x: 1050 - state.player.x, y: 850 - state.player.y }, length = Math.hypot(retreat.x, retreat.y);
    const input: InputFrame = { moveX: frame > 0 && length > 5 ? retreat.x / length : 0,
      moveY: frame > 0 && length > 5 ? retreat.y / length : 0, fire: false, aim: front, ...(frame === 0 ? { scan: true } : {}) };
    game.step(input);
    if (tasks.every(task => task.status === 'complete') && !state.targets.some(target => target.role !== 'source'
      && (target.hp > 0 || target.splitAt !== undefined))) break;
  }
  return {
    seed, rank, rounds, wave, elapsed: state.elapsed, phase: state.phase, owner: front.owner, phantomEscortAttacks,
    held: front.owner === 'healthy' && tasks.every(task => task.status === 'complete') && front.infectionProgress <= 1e-7,
    wavesCleared: e.clearedWaves, squadCount: events.filter(event => event.type === 'TERRITORY_SQUAD_SPAWNED').length,
    finishedSquads: tasks.filter(task => task.status === 'complete').length,
    incomingTasks: tasks.filter(task => task.status === 'pending' || task.status === 'warning').length,
    garrisonDamage: events.filter(event => event.type === 'IMMUNE_CELL_HURT').reduce((total, event) => total + Number(event.data.damage), 0),
    casualties: events.filter(event => event.type === 'IMMUNE_CELL_DIED').length,
    liveCells: state.growth!.cells!.filter(cell => (cell.hp ?? 1) > 0).length,
    realBites: events.filter(event => event.type === 'TARGET_HIT' && typeof event.data.immuneCellId === 'string').length,
    handoff: state.territory!.defense.north.handoff,
    handoffStarted: events.some(event => event.type === 'TERRITORY_HANDOFF_STARTED'),
    maxCellRank: state.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!.rank ?? 1,
    catalysisRank: state.endlessGrowth!.ranks.catalysis ?? 0,
    captureTimes: events.filter(event => event.type === 'TERRITORY_CAPTURED').map(event => event.tick / 60),
    finalActors: state.targets.filter(target => target.hp > 0).map(target => ({ id: target.id, x: target.x, y: target.y, hp: target.hp,
      role: target.role, task: target.territoryTask, attackTarget: target.attackTarget, attackAt: target.attackAt })),
    finalCells: state.growth!.cells!.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, hp: cell.hp, targetId: cell.targetId, activity: cell.activity,
      waypoint: cell.waypoint, attackReadyAt: cell.attackReadyAt })),
    events,
  };
}
