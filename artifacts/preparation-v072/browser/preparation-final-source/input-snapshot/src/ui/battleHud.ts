import type { GameState } from '../game/types';
import { TRAITS } from '../game/battleConfig';
import { campaignHudMarkup, campaignOverlay, updateCampaignHud } from './campaignHud';
import { tacticalHistoryMarkup } from './tacticalHistory';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const get = (id: string) => document.getElementById(id)!;

export const battleHudMarkup = `
  <section class="objective battle-objective"><div class="eyebrow" id="battle-stage">HEART / 心脏防线</div><h2 id="objective-title">阻止感染扩散</h2><p id="battle-objective"></p><div class="battle-progress" id="battle-progress"></div><p class="interaction-hint" id="interaction-hint">靠近装置 · E 交互</p></section>
  <aside class="telemetry battle-telemetry">
    <div class="readout"><label>战士耐久 <b id="hp-label">100</b></label><div class="meter"><i id="hp-meter"></i></div></div>
    <div class="readout"><label><span id="organ-integrity-name">心脏完整度</span><b id="tissue-label">70%</b></label><div class="meter"><i id="tissue-meter"></i></div><p>按 3 瞄准十字节点抢修</p></div>
    <div class="readout pressure"><label>感染负荷 <b id="infection-label">0%</b></label><div class="meter"><i id="infection-meter"></i></div><p id="crisis-label">净化感染源，截断传播</p><div class="vitality">全身稳定 <b id="vitality-label">100%</b></div></div>
    <div class="pulse-readout"><span id="pulse-phase"></span><b id="pulse-ready"></b><small id="pulse-explanation">阀门附近 E · 朝鼠标冲流<br>击退 / 破壳 · 消耗组织完整度</small></div>
  </aside>
  <div class="evolution-card" id="evolution-card" role="status" hidden></div>
  <div class="trait-strip" id="trait-strip"></div>${campaignHudMarkup}`;

export function updateBattleHud(state: GameState): void {
  const battle = state.battle!;
  const { pressure, pulse } = battle;
  get('battle-stage').textContent = `${battle.organId === 'heart' ? 'HEART / 心脏' : 'LUNG / 肺部'} · ${battle.stageLabel}`;
  get('objective-title').textContent = battle.readyToRetest ? '返回终端，主动复测' : '夺回这道生命防线';
  get('battle-objective').textContent = battle.objective;
  get('battle-progress').textContent = `感染源 ${battle.stats.sourceClears} / 2　进化精英 ${battle.stats.eliteClears} / 2`;
  get('hp-label').textContent = `${Math.ceil(state.player.hp)} / 100`;
  get('hp-meter').style.width = `${state.player.hp}%`;
  get('tissue-label').textContent = `${Math.ceil(state.tissue.hp)}%`;
  get('tissue-meter').style.width = `${state.tissue.hp}%`;
  get('infection-label').textContent = `${Math.ceil(pressure.infection)}%`;
  get('infection-meter').style.width = `${pressure.infection}%`;
  get('vitality-label').textContent = `${Math.ceil(pressure.vitality)}%`;
  get('crisis-label').textContent = pressure.criticalSince !== null ? `⚠ 感染失控：${Math.max(0, 15 - (state.elapsed - pressure.criticalSince)).toFixed(1)} 秒 · 立即净化或抢修` : pressure.organAlarm ? '⚠ 器官濒危：抢修可阻止全身稳定下降' : '净化感染源 / 关闭隔离闸可降低压力';
  document.body.classList.toggle('crisis', pressure.criticalSince !== null || pressure.organAlarm);
  get('pulse-phase').textContent = `${({ charge: '△ 蓄力', surge: '≋ 冲流', rest: '◡ 舒缓' } as const)[pulse.phase]} ${pulse.phaseRemaining.toFixed(1)}s`;
  get('pulse-ready').textContent = pulse.readyAt > state.elapsed ? `冲流冷却 ${(pulse.readyAt - state.elapsed).toFixed(1)}s` : 'E 冲流就绪';
  const nearby = battle.graph.nodes.filter(node => node.kind !== 'source' && node.kind !== 'tissue' && Math.hypot(node.x - state.player.x, node.y - state.player.y) <= 110).sort((a,b) => Math.hypot(a.x-state.player.x,a.y-state.player.y)-Math.hypot(b.x-state.player.x,b.y-state.player.y))[0];
  get('interaction-hint').textContent = nearby ? `E · ${({ valve: '朝瞄准方向发动冲流', gate: '开关隔离闸', retest: '复测当前器官', exit: '前往另一器官', research: '查看抗体研究' } as Record<string,string>)[nearby.kind] ?? '使用装置'}` : '靠近装置按 E · Q 扫描诊断';
  const warning = battle.warning;
  const card = get('evolution-card');
  card.hidden = !warning;
  if (warning) {
    const trait = TRAITS[warning.trait];
    card.innerHTML = `<div class="warning-title"><strong>△ 变异前兆 · ${trait.name}</strong><b>${Math.max(0, warning.applyAt-state.elapsed).toFixed(1)}s</b></div><p>${escape(trait.ability)}</p><div><span>代价</span>${escape(trait.cost)}</div><div class="counter"><span>反制</span>${escape(trait.counter)}</div>`;
  }
  get('trait-strip').innerHTML = battle.traits.map(id => `<span title="${escape(TRAITS[id].counter)}">${TRAITS[id].symbol} ${TRAITS[id].name}</span>`).join('');
  updateCampaignHud(state);
}

export function battleOverlay(state: GameState, help: boolean, resumeAfterHelp: boolean, lowEffects: boolean, history: boolean): string | null {
  if (state.campaign) return campaignOverlay(state, help, resumeAfterHelp, lowEffects, history);
  const b = state.battle!;
  const effects = `<div class="switches"><button data-action="effects">特效：${lowEffects ? '低' : '标准'}</button></div>`;
  const modal = (content: string, label: string) => `<div class="overlay"><section class="modal battle-modal" role="dialog" aria-modal="true" aria-label="${label}">${content}</section></div>`;
  if (history) {
    const important = state.events.filter(event => /EVOLUTION|SOURCE_CLEARED|PULSE|CRISIS|GATE|ORGAN_ALARM|RETEST/.test(event.type));
    return modal(`<div class="eyebrow">FIELD RECORD / 本局战术记录</div><h2>看见变化，找到反制。</h2><div class="trait-history">${b.traits.map(id=>{const t=TRAITS[id];return `<article><h3>${t.symbol} ${t.name}</h3><p>${escape(t.ability)}</p><p>代价：${escape(t.cost)}<br>反制：${escape(t.counter)}</p></article>`;}).join('') || '<p>变异尚未发生。先扫描感染源，观察传播路径。</p>'}</div>${tacticalHistoryMarkup(state)}<h3>近期行动</h3><ol class="event-history">${b.history.slice().reverse().map(item=>`<li><time>${time(item.at)}</time><span>${escape(item.text)}</span></li>`).join('')}</ol><details><summary>模拟事件 · ${important.length} 条近期记录</summary><ol class="event-history">${important.slice(-40).reverse().map(event=>`<li><time>${time(event.tick/60)}</time><span>${escape(event.type)}<small>${escape(Object.entries(event.data).map(([k,v])=>`${k}: ${v}`).join(' · '))}</small></span></li>`).join('')}</ol></details><div class="actions"><button class="primary" data-action="close-history">返回战场</button></div>`, '战术记录');
  }
  if (help) return modal(`<div class="eyebrow">FIELD MANUAL / 作战手册</div><h2>诊断、反制，保住器官。</h2><p>先净化两个感染源，停止增援；击败两次变异精英，再把心脏修复到至少 50%，感染降至 35% 以下，靠近复测终端按 E。</p><div class="help-grid"><div><kbd>WASD</kbd>自由移动</div><div><kbd>鼠标</kbd>瞄准 · 左键行动</div><div><kbd>Space</kbd>冲刺避开攻击前摇</div><div><kbd>Q</kbd>诊断与显露潜伏体</div><div><kbd>1</kbd>精确净化</div><div><kbd>2</kbd>范围裂解 · 处理小体</div><div><kbd>3</kbd>瞄准十字组织抢修</div><div><kbd>E</kbd>附近装置 / 复测</div></div><p>晶壳：绕后或借阀门冲流破壳。裂殖：死亡产生有限脆弱小体，用范围裂解收尾。潜伏：Q 显露；观察周期波纹也可直接攻击。</p><p>阀门冲流朝向鼠标，消耗组织完整度并有冷却。隔离闸关闭后切断感染传播。危险区域有轮廓和前摇，冲刺能位移但不会全程无敌。</p><p>感染达 100% 后仍有 15 秒可挽回；抢修与净化能降低感染。器官危机会先警报，再持续损失全身稳定。Esc、失焦和本手册都会暂停模拟。</p>${effects}<div class="actions"><button class="primary" data-action="close-help">返回${resumeAfterHelp ? '战场' : '上一级'}</button><button data-action="history">战术记录</button></div>`, '操作指南');
  if (state.phase === 'menu') return `<div class="overlay intro"><section class="intro-card"><div class="eyebrow">A MICROSCOPIC FANTASY · HEART / 01</div><h1>Viral<br><span>Invasion</span></h1><h2>病 毒 入 侵</h2><p class="lead">深入巨人的心脏。<br>病毒正在改变，你也必须改变。借心跳撕开晶壳，扫描伪装，截断感染，在战斗与抢修间守住生命。</p><div class="mission"><span><b>01</b> 诊断变异</span><span><b>02</b> 借用心跳</span><span><b>03</b> 挽救器官</span></div><div class="actions"><button class="primary" data-action="start">进入心脏防线　↗</button><button class="quiet" data-action="help">作战手册</button></div><p class="intro-footnote">${b.milestone} 心脏战术切片 · 键鼠操作 · 完全离线<br>WASD 移动 / 鼠标瞄准 / 左键行动</p></section><div class="intro-art-label"><strong>The heart fights back.</strong><small>活体战场 / 借心跳反制进化</small></div></div>`;
  if (state.phase === 'paused') return modal(`<div class="eyebrow">VIRAL INVASION / 病毒入侵</div><h2>让心跳，等你片刻。</h2><p>战场、传播与危机倒计时已暂停。</p><div class="seed">SEED ${state.seed} · ${time(state.elapsed)}</div><div class="actions"><button class="primary" data-action="continue">继续战斗</button><button data-action="retry">同种子重试</button><button data-action="history">战术记录</button><button data-action="help">作战手册</button><button class="quiet" data-action="menu">返回主菜单</button></div>${effects}`, '战斗已暂停');
  if (state.phase === 'result') return modal(`<div class="result-seal">${state.result?.success ? '✧' : '△'}</div><div class="eyebrow">VIRAL INVASION / ${state.result?.success ? 'HEART STABILIZED' : 'CASE ENDED'}</div><h2>${state.result?.success ? '心脏，重新有力地跳动。' : '这次防线，没能守住。'}</h2><p>${escape(state.result?.reason ?? '')}</p><div class="stats"><div><strong>${time(state.elapsed)}</strong><small>作战用时</small></div><div><strong>${b.stats.kills}</strong><small>净化感染体</small></div><div><strong>${b.stats.pulses}</strong><small>心跳冲流</small></div></div><div class="seed">SEED ${state.seed} · 组织 ${Math.ceil(state.tissue.hp)}% · 感染 ${Math.ceil(b.pressure.infection)}%</div><p>本局进化：${b.traits.map(id=>TRAITS[id].name).join(' → ') || '未发生'}<br>${b.stats.pulses === 0 ? '下次尝试：靠近阀门，借 E 冲流击退并破开晶壳。' : b.stats.scans === 0 ? '下次尝试：用 Q 提前诊断潜伏体与变异弱点。' : state.tissue.hp < 50 ? '下次尝试：截断传播后抢修组织，保住全身稳定。' : '下次尝试：用范围裂解收拢裂殖小体，留出处理感染源的窗口。'}</p><div class="actions"><button class="primary" data-action="retry">同种子重试</button><button data-action="new">新病例</button><button data-action="history">战术记录</button><button class="quiet" data-action="menu">返回主菜单</button></div>`, '病例结算');
  return null;
}
