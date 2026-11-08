import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceTerritory, beginTerritoryPurification, destroyTerritorySource, territoryInvaderAt,
  territoryLaneViews, territoryNodeContaminators, territoryNodeView, territoryPollutionRate, TERRITORY_BALANCE } from '../../src/game/territory';
import type { GameState, Target } from '../../src/game/types';
import type { MissionId } from '../../src/game/microfront';

function field(mission: MissionId | null = 'membrane') {
  const game = new GameSession(20261108, { mode: 'endless', territory: true }); game.start();
  if (mission) game.configureExpedition({ runId: `protection:${mission}`, seed: game.state.seed,
    missionId: mission, loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 },
    blueprints: [], modules: [], extraAntibodies: 0, firstClear: true });
  const s = game.state;
  Object.assign(s.endless!, { phase: 'warning', phaseUntil: Infinity, nextSpawnAt: Infinity,
    remainingToSpawn: 1, batchSchedule: [], territoryTasks: { wave: 1, squads: [], reservedSlots: [] } });
  s.targets = []; s.world = { ...s.world!, obstacles: [] };
  const front = s.territory!.nodes.find(node => node.id === 'front-north')!;
  Object.assign(s.player, { x: front.x, y: front.y });
  return { game, s, front };
}
function step(game: GameSession, frames = 1, purify = false) {
  for (let n = 0; n < frames; n++) game.step({ moveX: 0, moveY: 0, aim: game.state.player, fire: false, territoryAction: purify });
}
function carrier(s: GameState, id: 'front-north' | 'heart-healing-1'): Target {
  const node = s.territory!.nodes.find(node => node.id === id)!;
  return { id: `carrier:${id}`, x: node.x, y: node.y, radius: 22, kind: 'single', role: 'virus',
    hp: 68, maxHp: 68, hitUntil: 0, scanned: false, attackReady: Infinity,
    territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: id, squadKind: 'carrier' } };
}

describe('formal mission purification respite', () => {
  it('grants fifteen simulation seconds only after actual player purification and freezes on pause', () => {
    const { game, s, front } = field();
    step(game, 90, true); expect(front.owner).toBe('infected'); expect(front.protectedUntil).toBeUndefined();
    step(game, 90, true);
    expect(front).toMatchObject({ owner: 'healthy', infectionProgress: 0, permanent: false });
    expect(front.protectedUntil).toBeCloseTo(s.elapsed + TERRITORY_BALANCE.purificationProtectionSeconds);
    expect(territoryNodeView(s, front)?.protectionRemaining).toBeCloseTo(15);
    game.pause(); const frozen = game.snapshot(); step(game, 900);
    expect(game.snapshot()).toEqual(frozen); expect(territoryNodeView(s, front)?.protectionRemaining).toBeCloseTo(15);
    game.resume(); step(game, 60);
    expect(territoryNodeView(s, front)?.protectionRemaining).toBeCloseTo(14);
    const legacy = field(null); step(legacy.game, 180, true);
    expect(legacy.front.owner).toBe('healthy'); expect(legacy.front.protectedUntil).toBeUndefined();
  });

  it.each(['front-north', 'heart-healing-1'] as const)('keeps %s clean and suppresses false capture alarms while live viruses remain attackable', id => {
    const { s } = field(), node = s.territory!.nodes.find(n => n.id === id)!;
    node.owner = 'infected'; node.infectionProgress = 100;
    Object.assign(s.player, { x: node.x, y: node.y });
    expect(beginTerritoryPurification(s, node).accepted).toBe(true);
    s.elapsed = 3; advanceTerritory(s, 3);
    expect(node.owner).toBe('healthy'); expect(node.protectedUntil).toBe(18);
    // A spring specialist follows the lane after its front is lost. Ordinary
    // bodies also touch the spring, exercising both contamination paths.
    if (id === 'heart-healing-1') s.territory!.nodes.find(n => n.id === 'front-north')!.owner = 'infected';
    const specialist = carrier(s, id), ordinary = { ...specialist, id: 'ordinary', territoryTask: undefined };
    s.targets = [specialist, ordinary];
    for (const elapsed of [4, 12, 17.9]) {
      s.elapsed = elapsed; expect(advanceTerritory(s, 1).some(event => event.type === 'TERRITORY_CONTESTED')).toBe(false);
      expect(node.infectionProgress).toBe(0); expect(node.owner).toBe('healthy');
      expect(territoryNodeContaminators(s, node)).toEqual([]); expect(territoryPollutionRate(s, node)).toBe(0);
      expect(territoryInvaderAt(s, node)).toBe(false);
      expect(territoryNodeView(s, node)).toMatchObject({ status: 'healthy', infecting: false, recovering: false, infectionProgress: 0, attackerIds: [] });
      expect(territoryLaneViews(s).find(lane => lane.laneId === 'north')?.warning).toBeUndefined();
    }
    expect(s.targets.map(target => target.hp)).toEqual([68, 68]);
    s.elapsed = 18; advanceTerritory(s, 1); expect(node.infectionProgress).toBe(0);
    s.elapsed = 18.5; advanceTerritory(s, 1);
    expect(node.infectionProgress).toBeCloseTo(5); // Only the unprotected half-second, never a hidden backlog.
    expect(territoryNodeView(s, node)?.protectionRemaining).toBeUndefined();
    expect(territoryNodeView(s, node)?.infecting).toBe(true);
    s.elapsed = 28; advanceTerritory(s, 9.5); expect(node.owner).toBe('infected');
  });

  it('keeps destroyed sources permanently healthy without granting temporary source protection', () => {
    const { s } = field(), source = s.territory!.sources['source-west'];
    Object.assign(source, { unlocked: true, spawned: true, actorId: 'source-body' });
    const sourceNode = s.territory!.nodes.find(n => n.id === 'source-west')!;
    s.targets = [{ ...carrier(s, 'front-north'), id: 'source-body', role: 'source', hp: 0, territoryTask: undefined, x: sourceNode.x, y: sourceNode.y }];
    expect(destroyTerritorySource(s, 'source-west').some(event => event.type === 'TERRITORY_SOURCE_DESTROYED')).toBe(true);
    expect(sourceNode).toMatchObject({ owner: 'healthy', permanent: true, infectionProgress: 0 });
    expect(sourceNode.protectedUntil).toBeUndefined();
    s.targets = [{ ...carrier(s, 'front-north'), x: sourceNode.x, y: sourceNode.y }];
    s.elapsed = 100; advanceTerritory(s, 100);
    expect(sourceNode).toMatchObject({ owner: 'healthy', permanent: true, infectionProgress: 0 });
    expect(source.destroyed).toBe(true); expect(destroyTerritorySource(s, 'source-west')).toEqual([]);
  });

  it('allows immediate final cleanup after the last live carrier dies without waiting for protection to expire', () => {
    const { game, s, front } = field('boundary');
    for (const node of s.territory!.nodes) { node.owner = 'healthy'; node.infectionProgress = 0; }
    for (const source of Object.values(s.territory!.sources)) { source.destroyed = true; source.spawned = true; }
    Object.assign(s.endless!, { wave: 5, clearedWaves: 5, phase: 'intermission', remainingToSpawn: 0,
      territoryTasks: { wave: 5, squads: [], reservedSlots: [] } });
    s.territory!.stage = 'cleanup'; front.protectedUntil = s.elapsed + 15;
    const enemy = carrier(s, 'front-north'); s.targets = [enemy];
    step(game); expect(s.result).toBeNull(); expect(s.territory!.stage).toBe('cleanup');
    game.damage(enemy, enemy.hp * 100, { cause: 'basic' }); step(game);
    expect(s.result?.success).toBe(true); expect(s.territory!.stage).toBe('victory');
    expect(s.elapsed).toBeLessThan(front.protectedUntil!);
  });
});
