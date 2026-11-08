import { TERRITORY_LANES, territorySourceShielded } from '../game/territory';
import type { TerritoryLaneId } from '../game/territoryTypes';
import type { GameState } from '../game/types';

/** Describe the same ownership conditions that accept source damage, without advancing combat. */
export function territorySourceAccessView(state: GameState, laneId: TerritoryLaneId) {
  const territory = state.territory, lane = TERRITORY_LANES.find(candidate => candidate.id === laneId);
  if (!territory || !lane) return null;
  const source = territory.sources[lane.sourceId];
  const required = state.expedition?.missionId !== 'membrane' || lane.sourceId === 'source-west';
  const healing = territory.nodes.find(node => node.id === lane.healingNodeId)!;
  const front = territory.nodes.find(node => node.id === lane.frontNodeId)!;
  const shielded = territorySourceShielded(state, lane.sourceId);
  const step = healing.owner !== 'healthy' ? 0 : front.owner !== 'healthy' ? 1 : 2;
  const labels = ['净化生命泉', '净化前线', '攻击感染源'];
  const status = !required ? '本次无感染源' : source.destroyed ? '感染源已净化'
    : healing.owner !== 'healthy' ? `先净化${healing.name}`
      : front.owner !== 'healthy' ? `净化${front.name}，切断源膜供能`
        : source.spawned ? '源膜已解除' : `节点已净化 · 第${state.expedition?.missionId ? 1 : 3}波感染源苏醒`;
  return { required, ready: !shielded, shielded, step, status, active: required && territory.stage === 'rescue' && !source.destroyed,
    steps: (required ? labels : []).map((label, index) => ({ label, done: source.destroyed || index < step, current: !source.destroyed && index === step })) };
}
