import { TRAITS } from '../game/battleConfig';
import type { TraitId } from '../game/battleTypes';
import type { GameState } from '../game/types';
import { eliteCycleForecast, eliteCycleWarningCounters, upcomingEliteCycle } from './eliteTacticCycleHud';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const names = (traits: readonly TraitId[]) => traits.map(id => `${TRAITS[id].symbol}${TRAITS[id].name}`).join(' / ');

export function openingEvolutionCounter(trait: 'CARAPACE' | 'FISSION'): string {
  return trait === 'CARAPACE' ? '正面挡弹；用炮弹、剑气或绕后击破。' : '死亡分出2只小体；用炮弹或剑气清群。';
}

/** Present the frozen first-two-wave observation, never a guess about intent. */
export function openingEvolutionDetailText(state: GameState): string {
  const opening = state.endless?.evolution?.opening, selected = opening?.selection;
  if (!opening || !selected) return '';
  const total = opening.precisionDamage + opening.areaDamage;
  const amountText = (amount: number) => String(Number(amount.toFixed(2)));
  const percent = (amount: number) => total > 0 ? `${Number((amount / total * 100).toFixed(1))}%` : '0%';
  const reason = selected.reason === 'precision-dominant' ? '前两波的弹丸实际伤害为主，病毒长出晶壳。'
    : selected.reason === 'area-dominant' ? '前两波的范围实际伤害为主，病毒出现裂殖。'
      : selected.reason === 'mixed' ? '前两波打法混合，本局出现一种新变异。'
        : '前两波有效观测不足，本局出现一种新变异。';
  return `${reason}弹丸伤害 ${amountText(opening.precisionDamage)}（${percent(opening.precisionDamage)}），范围伤害 ${amountText(opening.areaDamage)}（${percent(opening.areaDamage)}）；仅记录实际生命损失，军团和协议伤害不参与。第3—5波仅少量特化体，第5波精英继承${TRAITS[selected.trait].name}。${openingEvolutionCounter(selected.trait)}`;
}

/** Read the already committed birth plan; presentation never chooses a trait. */
export function endlessUpcomingTraits(state: GameState): readonly TraitId[] {
  const e = state.endless;
  return e?.evolution?.pending?.decision.traits ?? e?.traits ?? [];
}

export function endlessTraitCopy(state: GameState): string {
  const e = state.endless;
  if (!e) return '';
  const pending = e.phase === 'warning' ? e.evolution?.pending : undefined;
  const active = e.wave >= 20 ? e.evolution?.current?.traits ?? e.traits : e.traits;
  if (e.phase === 'warning') {
    const upcoming = endlessUpcomingTraits(state);
    return `${upcoming.length ? `将出现：${names(upcoming)}` : '将出现：普通病毒'}${pending && active.length ? `；当前：${names(active)}` : ''}`;
  }
  const opening = e.evolution?.opening;
  if (e.wave >= 3 && e.wave <= 5 && opening?.selection)
    return `${e.wave === 5 ? '精英继承' : '少量特化'}：${names([opening.selection.trait])} · ${openingEvolutionCounter(opening.selection.trait)}`;
  return active.length ? `当前变异：${names(active)}` : `普通病毒 · 每 5 波精英，下次第 ${Math.ceil((e.wave + 1) / 5) * 5} 波`;
}

export function endlessEvolutionWarningMarkup(): string {
  return '<section id="endless-evolution-warning" class="evolution-card endless-evolution-warning" role="status" aria-label="连续挑战进化预警" hidden></section>';
}

/** Simulation seconds freeze with the session, including while its pause menu is open. */
export function endlessEvolutionWarningContent(state: GameState): string | null {
  const e = state.endless, pending = e?.evolution?.pending;
  if (!pending || e?.phase !== 'warning' || state.phase !== 'playing' && state.phase !== 'paused') return null;
  const decision = pending.decision, main = TRAITS[decision.main];
  const companions = decision.traits.filter(id => id !== decision.main).map(id => TRAITS[id].name);
  const seconds = Math.max(0, pending.appliesAt - state.elapsed).toFixed(1);
  const cycle = upcomingEliteCycle(state), shown = cycle ? decision.traits.map(id => TRAITS[id]) : [main];
  return `<div class="warning-title"><strong>△ 进化前兆 · ${escape(main.name)}</strong><b>${seconds}s</b></div>
    <p class="endless-evolution-generation">第 ${decision.generation} 代${companions.length ? ` · 伴随变异：${companions.map(escape).join(' / ')}` : ''}</p>
    ${cycle ? `<p class="endless-elite-cycle">${escape(eliteCycleForecast(state))}</p>` : ''}
    ${cycle ? `<div class="counter endless-elite-counter"><span>双招反制</span>${eliteCycleWarningCounters(state).map(escape).join('<br>')}</div>` : ''}
    <p class="endless-evolution-ability"><span>获得</span>${shown.map(info => `${cycle ? `${escape(info.name)}：` : ''}${escape(info.ability)}`).join('<br>')}</p>
    <div class="endless-evolution-cost"><span>代价</span>${shown.map(info => `${cycle ? `${escape(info.name)}：` : ''}${escape(info.cost)}`).join('<br>')}</div>
    <div class="counter"><span>基础反制</span>${shown.map(info => `${cycle ? `${escape(info.name)}：` : ''}${escape(info.counter)}`).join('<br>')}</div>`;
}

export function updateEndlessEvolutionWarning(state: GameState): void {
  if (typeof document === 'undefined') return;
  const card = document.getElementById('endless-evolution-warning');
  if (!card) return;
  const content = endlessEvolutionWarningContent(state);
  card.hidden = content === null;
  if (card.innerHTML !== (content ?? '')) card.innerHTML = content ?? '';
}
