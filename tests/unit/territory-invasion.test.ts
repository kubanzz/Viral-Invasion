import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Target } from '../../src/game/types';
import { TERRITORY_BALANCE, territoryInvaderGoal } from '../../src/game/territory';

function waveFixture(wave: number, guard = false) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state;
  if (guard) {
    state.territory!.stage = 'guard';
    for (const source of Object.values(state.territory!.sources)) source.destroyed = true;
    for (const node of state.territory!.nodes) node.owner = 'healthy';
  }
  Object.assign(state.endless!, { wave, phase: 'combat', phaseUntil: 0, phaseStartedAt: 0,
    remainingToSpawn: 6, totalToSpawn: 6, batchIndex: 0, batchMemberIndex: 0, spawnSerial: 0, nextSpawnAt: 0,
    batchSchedule: [{ at: 0, sector: 0, spread: .3, roles: ['ordinary', 'ordinary', 'ordinary'] },
      { at: .1, sector: 0, spread: .3, roles: ['ordinary', 'ordinary', 'ordinary'] }] });
  return game;
}
function frames(game: GameSession, count: number) {
  for (let index = 0; index < count; index++) game.step({ moveX: 0, moveY: 0, fire: false, aim: game.state.player });
}

describe('territory invasion integrates with finite waves and real navigation', () => {
  it('keeps contextual purification from damaging a source or switching the combat weapon', () => {
    const game = waveFixture(3); frames(game, 1);
    const source = game.state.targets.find(target => target.role === 'source')!;
    Object.assign(game.state.player, { x: source.x + 100, y: source.y });
    game.step({ moveX: 0, moveY: 0, fire: false, tool: 3, aim: source });
    expect(source.hp).toBe(TERRITORY_BALANCE.sourceHp);
    expect(game.state.territory!.sources[source.territorySourceId!].destroyed).toBe(false);
    expect(game.state.tool).toBe(1);
    expect(game.state.events.some(event => event.type === 'TERRITORY_ACTION_REJECTED' && event.data.reason === 'no-nearby-target')).toBe(true);
  });
  it('replaces four existing slots with a warned squad even in a six-body custom wave', () => {
    const game = waveFixture(1); frames(game, Math.floor(3.9 / BALANCE.step));
    expect(game.state.targets.filter(target => target.territoryTask)).toHaveLength(0);
    frames(game, Math.ceil(.3 / BALANCE.step));
    const squad = game.state.targets.filter(target => target.territoryTask);
    expect(squad).toHaveLength(4);
    expect(squad.filter(target => target.territoryTask!.kind === 'invade')).toHaveLength(1);
    expect(squad.every(target => target.waveId === 1 && target.blocksWaveClear && target.role === 'virus')).toBe(true);
    expect(game.state.targets.filter(target => target.waveId === 1)).toHaveLength(6);
    expect(game.state.endless!.remainingToSpawn).toBe(0);
  });

  it('uses the healing objective instead of chasing a distant player, then really occupies it and attacks core', () => {
    const game = waveFixture(2), state = game.state, north = state.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
    Object.assign(state.endless!, { remainingToSpawn: 1, nextSpawnAt: Infinity, batchSchedule: [] });
    Object.assign(state.player, { x: 2100, y: 1300 });
    const invader: Target = { id: 'territory-navigation', x: north.x - 200, y: north.y, kind: 'single', role: 'virus',
      hp: 68, maxHp: 68, radius: 22, hitUntil: 0, scanned: false, traits: [], tactic: 'melee', sourceId: 'endless:wave:2',
      born: 0, territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: north.id }, blocksWaveClear: true, waveId: 2 };
    state.targets.push(invader);
    frames(game, Math.ceil(12 / BALANCE.step));
    expect(north.owner).toBe('infected');
    expect(state.events.some(event => event.type === 'TERRITORY_CAPTURED' && event.data.nodeId === north.id)).toBe(true);
    expect(territoryInvaderGoal(state, invader)?.id).toBe('core');
    const coreDistance = Math.hypot(invader.x - state.tissue.x, invader.y - state.tissue.y);
    frames(game, 120);
    expect(Math.hypot(invader.x - state.tissue.x, invader.y - state.tissue.y)).toBeLessThan(coreDistance);
    expect(state.player.hp).toBe(100);
  });
});
