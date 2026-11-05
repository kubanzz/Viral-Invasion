import type { GameState } from './types';
import type { TerritoryNode } from './territoryTypes';
import { purificationPauseReason, territorySourceShielded, TERRITORY_BALANCE } from './territory';

export type TerritoryMarkerKind = 'purify' | 'blocked' | 'purifying' | 'paused' | 'dormant' | 'shielded' | 'attack' | 'none';
export interface TerritoryMarkerView {
  node: TerritoryNode; kind: TerritoryMarkerKind; near: boolean; progress: number;
  reason: string; label: string; alert: 'contested' | 'captured' | null; alertAge: number;
}
/** Same authoritative blockers as the accepted purification action; no RNG or state writes. */
export function territoryMarkerView(state: GameState, node: TerritoryNode, touch = false): TerritoryMarkerView {
  const near = Math.hypot(state.player.x - node.x, state.player.y - node.y) <= TERRITORY_BALANCE.purificationRange;
  const capturedAge = node.capturedAt === undefined ? Infinity : state.elapsed - node.capturedAt;
  const contestedAge = node.contestedAt === undefined ? Infinity : state.elapsed - node.contestedAt;
  const alert: TerritoryMarkerView['alert'] = node.owner === 'infected' && capturedAge >= 0 && capturedAge < 3 ? 'captured'
    : node.owner === 'healthy' && node.infectionProgress > 0 && contestedAge >= 0 && contestedAge < 2 ? 'contested' : null;
  const base = { node, near, progress: node.purificationProgress / 100, alert, alertAge: alert === 'captured' ? capturedAge : alert === 'contested' ? contestedAge : 0 };
  if (node.kind === 'source') {
    const source = state.territory?.sources[node.id as 'source-west' | 'source-east'];
    const kind = node.permanent || source?.destroyed ? 'none' : !source?.spawned ? 'dormant'
      : territorySourceShielded(state, source.nodeId) ? 'shielded' : 'attack';
    const supplier = kind === 'shielded' && source ? [source.healingNodeId, source.frontNodeId]
      .map(id => state.territory!.nodes.find(candidate => candidate.id === id)).find(candidate => candidate?.owner === 'infected') : undefined;
    return { ...base, kind, reason: supplier?.name ?? '', label: kind === 'attack' ? '射击摧毁'
      : kind === 'shielded' ? `先净化${supplier?.name ?? '同线节点'}` : kind === 'dormant' ? '未苏醒' : '' };
  }
  if (node.owner !== 'infected' || node.kind === 'core') return { ...base, kind: 'none', reason: '', label: '' };
  const pause = purificationPauseReason(state, node), active = state.territory?.purification?.nodeId === node.id;
  const reason = pause === 'healing-required' ? '先夺回生命泉' : pause === 'contaminant' || pause === 'invader' ? '先清敌'
    : pause === 'hurt' ? '躲开攻击' : pause === 'airborne' ? '落地后净化' : pause === 'out-of-range' ? '靠近继续' : pause === 'inactive' ? '已暂停' : '';
  const blocked = !!pause && pause !== 'out-of-range';
  const kind = active ? pause ? 'paused' : 'purifying' : blocked ? 'blocked' : 'purify';
  const label = active ? `${pause ? '净化暂停' : '净化中'} ${Math.floor(node.purificationProgress)}%`
    : blocked ? reason : near ? touch ? '净化组织' : 'F 净化' : '';
  return { ...base, kind, reason, label };
}
