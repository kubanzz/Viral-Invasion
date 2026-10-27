import { TRAITS } from '../game/battleConfig';
import type { TraitId } from '../game/battleTypes';
import type { GameState } from '../game/types';
import { eliteCycleForecast, eliteCycleWarningCounters, upcomingEliteCycle } from './eliteTacticCycleHud';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const names = (traits: readonly TraitId[]) => traits.map(id => `${TRAITS[id].symbol}${TRAITS[id].name}`).join(' / ');

/** Read the already committed birth plan; presentation never chooses a trait. */
export function endlessUpcomingTraits(state: GameState): readonly TraitId[] {
  const e = state.endless;
  return e?.evolution?.pending?.decision.traits ?? e?.traits ?? [];
}

export function endlessTraitCopy(state: GameState): string {
  const e = state.endless;
  if (!e) return '';
  const pending = e.phase === 'warning' ? e.evolution?.pending : undefined;
  const active = e.evolution?.current?.traits ?? e.traits;
  if (e.phase === 'warning') {
    const upcoming = endlessUpcomingTraits(state);
    return `${upcoming.length ? `将出现：${names(upcoming)}` : '将出现：普通病毒'}${pending && active.length ? `；当前：${names(active)}` : ''}`;
  }
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
