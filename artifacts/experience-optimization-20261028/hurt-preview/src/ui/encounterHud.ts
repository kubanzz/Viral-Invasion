import type { GameState } from '../game/types';
import { BALANCE } from '../game/types';
import { BATTLE_BALANCE, TRAITS } from '../game/battleConfig';
import { ORGAN_CRISIS_BALANCE } from '../game/campaignEncounters';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const clock = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

export interface EncounterHudContent {
  kind: 'guide' | 'feedback' | 'crisis'; title: string; line: string; detail: string; canSkip: boolean;
}

export const encounterHudMarkup = `<div class="encounter-hud" id="encounter-hud" role="status" aria-live="polite" hidden><div class="encounter-heading"><strong id="encounter-heading"></strong><button type="button" class="encounter-skip" data-action="skip-counter-guide" hidden>跳过本次提示</button></div><span class="encounter-line" id="encounter-line"></span><span class="encounter-detail" id="encounter-detail"></span></div>`;

function valveHint(state: GameState): string {
  const valve = state.battle?.graph.nodes.find(node => node.kind === 'valve');
  if (!valve) return '两条路线均可用基础工具完成';
  const dx = valve.x - state.player.x, dy = valve.y - state.player.y, distance = Math.hypot(dx, dy);
  const cooldown = Math.max(0, (state.battle?.pulse.readyAt ?? 0) - state.elapsed);
  if (distance <= BALANCE.interactionRange) return cooldown > 0 ? `阀门就在身旁 · 冲流冷却 ${Math.ceil(cooldown)} 秒` : '阀门就在身旁 · 朝威胁方向按 E';
  const vertical = Math.abs(dy) > distance * .3 ? dy < 0 ? '北' : '南' : '';
  const horizontal = Math.abs(dx) > distance * .3 ? dx < 0 ? '西' : '东' : '';
  return `阀门在${vertical}${horizontal} · 距离 ${Math.round(distance)}`;
}

/** One compact hint at a time; existing migration/crisis cards keep priority. */
export function encounterHudContent(state: GameState): EncounterHudContent | null {
  const battle = state.battle;
  if (!battle || state.phase !== 'playing') return null;
  const migration = state.campaign?.migration;
  if (battle.pressure.criticalSince !== null || battle.pressure.organAlarm || migration && ['warning', 'blocking', 'pursuing'].includes(migration.status)) return null;
  const crisis = state.campaign?.encounters?.crisis;
  if (crisis && ['arming', 'charging', 'exhausted'].includes(crisis.status)) {
    const current = battle.organId === crisis.organId, organ = crisis.organId === 'heart' ? '心脏' : '肺部';
    if (crisis.status === 'arming') return { kind: 'crisis', title: `${organ}危机前兆`, line: '留意标记病灶，准备截断它对组织的冲击。', detail: '先抢修还是先根治，由你决定。', canSkip: false };
    if (crisis.status === 'exhausted') return { kind: 'crisis', title: '冲击已停止，病灶仍在', line: '净化危机源，再修复受损组织。', detail: '有限冲击已结束，仍可整理配装再反攻。', canSkip: false };
    if (!current) return { kind: 'crisis', title: `${organ}危机 · 冲击倒数暂停`, line: `通过器官出口返回${organ}，处理标记感染源。`, detail: '器官图仍显示其他残留感染风险。', canSkip: false };
    if (crisis.blockedByAirway) return { kind: 'crisis', title: '气道已截流 · 充能暂停', line: '趁这个窗口净化标记感染源。', detail: '重新开放气道后仍需留意冲击。', canSkip: false };
    const countdown = crisis.nextImpactAt === null ? '充能暂停' : `${Math.ceil(Math.max(0, crisis.chargeRemaining))} 秒后冲击`;
    return { kind: 'crisis', title: `组织危机 · ${countdown}`, line: current && crisis.organId === 'heart' ? '清危机源；或先用 E 冲流中断并抢修。' : '清危机源；或先封闭气道并抢修。', detail: '地面连线指向受威胁的组织。', canSkip: false };
  }
  const encounter = battle.encounter, first = encounter?.firstCounter;
  if (encounter?.configId !== 'campaign-1' || encounter.guideVariant !== 'guided' || !first || first.guideStatus === 'skipped') return null;
  if (first.counterHit && first.guideStatus === 'completed' && state.elapsed - first.counterHit.at <= 4) return {
    kind: 'feedback', title: '反制命中已记录', line: `${first.counterHit.method === 'rear' ? '绕后净化' : '冲流破绽净化'} · 实际伤害 ${number(first.counterHit.damage)}。`, detail: '继续清除变异精英，保住组织。', canSkip: false,
  };
  if (first.status === 'resolved') {
    if (first.counterHit || first.resolvedAt === null || state.elapsed - first.resolvedAt > 4) return null;
    return { kind: 'feedback', title: '首个变异目标已清除', line: '本次未记录绕后或冲流反制，可在手册回看。', detail: '', canSkip: false };
  }
  if (first.guideStatus !== 'active') return null;
  if (first.status === 'opening') return { kind: 'guide', title: '先诊断，再根治', line: '先 Q 诊断感染源，用 1 / 2 净化它。', detail: '组织受损时按 3 瞄准十字节点修复。', canSkip: true };
  if (first.status === 'warning') return { kind: 'guide', title: `晶壳将出现${battle.warning ? ` · ${Math.ceil(Math.max(0, battle.warning.applyAt - state.elapsed))} 秒` : ''}`, line: '它正面抗射击；提前找阀门，准备绕后。', detail: valveHint(state), canSkip: true };
  return { kind: 'guide', title: '晶壳有两条基础解法', line: '绕后用 1；或阀门 E 破壳后用 1 命中。', detail: valveHint(state), canSkip: true };
}

type HudNodes = { heading: HTMLElement; line: HTMLElement; detail: HTMLElement; skip: HTMLButtonElement };
const hudNodes = new WeakMap<HTMLElement, HudNodes>();
const setText = (element: HTMLElement, text: string) => { if (element.textContent !== text) element.textContent = text; };

export function updateEncounterHud(state: GameState): void {
  const host = document.getElementById('encounter-hud');
  if (!host) return;
  const content = encounterHudContent(state);
  host.hidden = !content;
  if (!content) return;
  let nodes = hudNodes.get(host);
  if (!nodes) {
    const heading = host.querySelector<HTMLElement>('#encounter-heading'), line = host.querySelector<HTMLElement>('#encounter-line'), detail = host.querySelector<HTMLElement>('#encounter-detail'), skip = host.querySelector<HTMLButtonElement>('[data-action="skip-counter-guide"]');
    if (!heading || !line || !detail || !skip) return;
    nodes = { heading, line, detail, skip }; hudNodes.set(host, nodes);
  }
  if (host.dataset.kind !== content.kind) host.dataset.kind = content.kind;
  setText(nodes.heading, content.title); setText(nodes.line, content.line); setText(nodes.detail, content.detail);
  nodes.detail.hidden = !content.detail; nodes.skip.hidden = !content.canSkip;
}

export function encounterHelpMarkup(state: GameState): string {
  const battle = state.battle, encounter = battle?.encounter, first = encounter?.firstCounter;
  if (!battle || !encounter || encounter.configId !== 'campaign-1' || !first) return '';
  const guide = first.guideStatus === 'skipped' ? '提示已跳过，战斗与目标继续' : first.counterHit && first.guideStatus === 'completed' ? '已记录实际反制' : first.status === 'resolved' ? '目标已清除' : first.guideStatus === 'active' ? '提示进行中' : '提示未启用';
  const hit = first.counterHit;
  const record = hit ? `${clock(hit.at)} · ${hit.method === 'rear' ? '绕后净化' : '冲流破绽净化'} · 实际伤害 ${number(hit.damage)}` : encounter.guideVariant === 'guided' ? '尚未记录有效绕后／冲流反制命中；清除目标不自动等于掌握反制。' : '本局为自主应对，按实际变异目标清除与阶段结果推进。';
  const firstTarget = first.targetId ? state.targets.find(target => target.id === first.targetId) : undefined;
  const observedTraits = [...new Set([...battle.traits, ...(firstTarget?.traits ?? []), ...(battle.warning ? [battle.warning.trait] : [])])];
  const actualCounters = observedTraits.length ? `<h3>已观测特性 · 按实际反制</h3><ul>${observedTraits.map(id => {
    const trait = TRAITS[id];
    return `<li><b>${escape(trait.name)}${battle.warning?.trait === id ? '（预警中）' : ''}：</b>${escape(trait.ability)}；代价：${escape(trait.cost)}。<br><b>反制：</b>${escape(trait.counter)}。</li>`;
  }).join('')}</ul>` : '<p>尚未侦测到变异。先用 Q 诊断，预警出现后，手册会显示本局实际特性的能力、代价和反制。</p>';
  const crystalRoutes = encounter.guideVariant === 'guided' || observedTraits.includes('CARAPACE') ? `<h3>晶壳反制 · 两条基础路线</h3><ol><li><b>绕后净化：</b>观察晶壳朝向，移动到背后，再用 1 命中；避免持续向正面射击。</li><li><b>借阀门破壳：</b>靠近心脏阀门，鼠标指向晶壳，按 E 发动冲流，再用 1 把握 ${BATTLE_BALANCE.pulseExpose} 秒破绽；每次消耗 ${BATTLE_BALANCE.pulseCost} 点组织完整度，冷却 ${BATTLE_BALANCE.pulseCooldown} 秒。</li></ol><p>两条路线都不要求抽中特定抗体；共振裂解、连锁净化及免疫协同可改变效率和处理方式。</p>` : '';
  const crisis = state.campaign?.encounters?.crisis;
  const crisisHelp = crisis ? `<p><b>组织危机：</b>危机源沿地面连线向组织蓄力，每 ${ORGAN_CRISIS_BALANCE.chargeSeconds} 秒冲击 ${ORGAN_CRISIS_BALANCE.damage} 点完整度，最多 ${ORGAN_CRISIS_BALANCE.maximumImpacts} 次；清除感染源可根治。心脏冲流命中病灶可中断，肺部封闭气道可暂停充能；也可以先用 3 抢修，再返回反攻。离场时该冲击倒数暂停，其他残留感染风险仍见器官图。</p>` : '';
  const skip = encounter.guideVariant === 'guided' && first.guideStatus === 'active' ? '<div class="actions"><button type="button" class="encounter-skip" data-action="skip-counter-guide">跳过本次提示</button></div>' : '';
  return `<section class="encounter-help" aria-label="首次反制与阶段行动">${crystalRoutes}${actualCounters}<p class="encounter-help-record"><b>本局：</b>${encounter.guideVariant === 'guided' ? '首次反制引导' : '自主应对'} · ${escape(guide)}<br><b>实际记录：</b>${escape(record)}</p>${skip}${crisisHelp}</section>`;
}
