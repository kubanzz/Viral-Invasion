import { activeWorld, type GameState, type Vec } from '../game/types';
import { distance } from '../actors/collision';

export function navigationTarget(state: GameState): { point: Vec; label: string } | undefined {
  const battle = state.battle, campaign = state.campaign;
  if (!battle || !campaign) return;
  if (battle.readyToRetest) return { point: state.terminal, label: '主动复测 · E' };
  if (state.tissue.hp < 45) return { point: state.tissue, label: '抢修组织' };
  if (campaign.migration.status === 'warning' || campaign.migration.status === 'blocking') {
    const nodes = battle.graph.nodes.filter(node => node.kind === 'exit' || node.id === 'gate').sort((a, b) => distance(state.player, a) - distance(state.player, b));
    if (nodes[0]) return { point: nodes[0], label: nodes[0].kind === 'exit' ? '出口追击 · E' : '隔离封锁 · E' };
  }
  const target = state.targets.filter(target => target.hp > 0 && ['source', 'elite', 'core'].includes(target.role ?? '')).sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
  if (target) return { point: target, label: target.role === 'source' ? '净化感染源' : target.role === 'core' ? '击破母巢' : '反制变异精英' };
  if (state.growth && !state.growth.equipped.length && state.growth.research >= 3) {
    const research = battle.graph.nodes.find(node => node.kind === 'research');
    if (research) return { point: research, label: '抗体研究 · E' };
  }
  const other = campaign.arenas[battle.organId === 'heart' ? 'lung' : 'heart'];
  const otherNeedsWork = other.activated && (other.tissue.hp < 50 || other.targets.some(target => target.hp > 0 && (target.role === 'source' || target.role === 'elite')));
  if (otherNeedsWork || campaign.core.status !== 'cleared' && campaign.core.organId !== battle.organId && campaign.migration.choice) {
    const exit = battle.graph.nodes.find(node => node.kind === 'exit');
    if (exit) return { point: exit, label: '前往另一器官 · E' };
  }
  if (state.tissue.hp < 65) return { point: state.tissue, label: '抢修组织' };
  if (campaign.core.status !== 'locked' || battle.readyToRetest) return { point: state.terminal, label: campaign.core.status === 'ready' ? '唤醒母巢 · E' : '主动复测 · E' };
  return;
}

/** Navigation reads the real arena and the same camera rectangle as aiming. */
export function drawNavigationMap(canvas: HTMLCanvasElement, state: GameState, visible: { topLeft: Vec; bottomRight: Vec }): void {
  const ctx = canvas.getContext('2d'); if (!ctx || !state.battle) return;
  const w = canvas.width, h = canvas.height, world = activeWorld(state), b = world.bounds;
  const sx = (w - 16) / (b.right - b.left), sy = (h - 26) / (b.bottom - b.top);
  const p = (point: Vec) => ({ x: 8 + (point.x - b.left) * sx, y: 8 + (point.y - b.top) * sy });
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#12151c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7da79865'; ctx.strokeRect(8, 8, w - 16, h - 26);
  for (const obstacle of world.obstacles) { const v = p(obstacle); ctx.beginPath(); ctx.ellipse(v.x, v.y, obstacle.radius * sx, obstacle.radius * sy, 0, 0, Math.PI * 2); ctx.fillStyle = '#69817b55'; ctx.fill(); }
  const from = p(visible.topLeft), to = p(visible.bottomRight);
  ctx.save(); ctx.beginPath(); ctx.rect(8, 8, w - 16, h - 26); ctx.clip();
  ctx.fillStyle = '#c7f4e00b'; ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y); ctx.strokeStyle = '#c7f4e04a'; ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
  ctx.restore();
  const goal = navigationTarget(state), player = p(state.player);
  if (goal) { const end = p(goal.point); ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(end.x, end.y); ctx.strokeStyle = '#f6d39677'; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.font = '9px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
  for (const node of state.battle.graph.nodes) {
    if (node.kind === 'source' && !node.active) continue;
    const v = p(node), label = node.kind === 'source' ? '源' : node.kind === 'tissue' ? '✚' : node.kind === 'research' ? '研' : node.kind === 'exit' ? '出' : node.kind === 'retest' ? '测' : node.id === 'gate' ? '闸' : '流';
    ctx.fillStyle = node.kind === 'source' ? '#f1aa8a' : node.kind === 'exit' ? '#e0d4ae' : '#a6ddca'; ctx.fillText(label, v.x, v.y + 3);
  }
  ctx.beginPath(); ctx.arc(player.x, player.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#f4fff1'; ctx.fill(); ctx.strokeStyle = '#203c36'; ctx.stroke();
  ctx.fillStyle = '#c5c6b4'; ctx.font = '9px "Microsoft YaHei",sans-serif'; ctx.fillText(goal ? `${goal.label} · ${Math.round(distance(state.player, goal.point))}m` : '白点为你 · 阴影框为当前视野', w / 2, h - 5);
}
