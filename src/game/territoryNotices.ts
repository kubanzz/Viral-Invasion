import type { GameState, MessagePriority } from './types';
import type { TerritoryRuleEvent } from './territoryTypes';
import { TERRITORY_LANES, territorySourceShielded } from './territory';

/** Messages name the actual objective; they never infer a spring from an event category. */
export function territoryRuleNotice(state: GameState, event: TerritoryRuleEvent): { text: string; seconds: number; priority: MessagePriority } | null {
  const node = state.territory?.nodes.find(candidate => candidate.id === event.data.nodeId);
  const lane = node && TERRITORY_LANES.find(lane => lane.frontNodeId === node.id || lane.healingNodeId === node.id);
  const source = lane && state.territory?.sources[lane.sourceId];
  const sourceName = lane && state.territory?.nodes.find(candidate => candidate.id === lane.sourceId)?.name;
  if (event.type === 'TERRITORY_CONTESTED' && node) return {
    text: node.kind === 'healing' ? `${node.name}正在污染：清除泉边病毒，尚未失守时仍可治疗。`
      : `${node.name}正在被侵染：拦截标记侵染者，保住前线。`, seconds: 4, priority: 2,
  };
  if (event.type === 'TERRITORY_CAPTURED' && node) return {
    text: `${node.name}失守：${source?.spawned && !source.destroyed ? `${sourceName}供能恢复，源膜重新生成。` : ''}清除入侵者，靠近后启动组织净化。`, seconds: 5, priority: 2,
  };
  if (event.type === 'TERRITORY_PURIFIED' && node && lane && source?.spawned && !source.destroyed
    && !territorySourceShielded(state, lane.sourceId)) return {
    text: `${node.name}已净化：${sourceName}供能切断，护膜解除！`, seconds: 5, priority: 2,
  };
  return null;
}
