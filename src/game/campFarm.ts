import { campLayout, type CampRect } from './campLayout';
import { FARM_BALANCE, type FarmPlot } from './legionCatalog';
import type { GameState, Vec } from './types';

export type CampCropStatus = 'empty' | 'seed' | 'grow' | 'ripe';
export type CampCropInteraction = 'plant' | 'harvest' | 'water' | 'pests' | 'wait';
export const CAMP_FARM_RULES = { sowSeconds: 1.5, matureSeconds: 150, expeditionSeconds: 75,
  waterBoostSeconds: 25, pestBoostSeconds: 25, pestsAtSeconds: 60, growingAtSeconds: 35 } as const;
export const CAMP_FARM_PLOT_OFFSETS = [{ x: -90, y: -60 }, { x: 90, y: -60 }, { x: -90, y: 80 }] as const;
/** Legacy expedition stages remain readable; live growth uses simulated seconds. */
export function farmGrownSeconds(plot: FarmPlot): number {
  if (!plot.planted) return 0;
  return Math.min(CAMP_FARM_RULES.matureSeconds, Math.max(0, plot.grownSeconds ?? plot.growth * CAMP_FARM_RULES.expeditionSeconds));
}
export function setFarmGrownSeconds(plot: FarmPlot, seconds: number): void {
  plot.grownSeconds = plot.planted ? Math.min(CAMP_FARM_RULES.matureSeconds, Math.max(0, Math.round(seconds * 1e6) / 1e6)) : 0;
  plot.growth = Math.min(FARM_BALANCE.maturity, Math.floor(plot.grownSeconds / CAMP_FARM_RULES.expeditionSeconds));
}
export function emptyFarmPlot(): FarmPlot { return { planted: false, growth: 0, grownSeconds: 0, watered: false, pestsCleared: false }; }
export function formatFarmCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export interface CampGardenPlot {
  index: number; position: Vec; rect: CampRect; interactionPosition: Vec;
  status: CampCropStatus; growth: number; eligible: boolean;
  grownSeconds: number; remainingSeconds: number; growthProgress: number; action: CampCropInteraction;
  watered: boolean; pestsCleared: boolean; waterAvailable: boolean; pestsAvailable: boolean; sowProgress: number | null;
}
/** World beds are the same three persisted plots used by expedition settlement. */
export function campFarmPlots(state: GameState): CampGardenPlot[] {
  if (!state.camp || state.camp.prologue === 'arrival') return [];
  const farm = campLayout(state).facilities.find(site => site.id === 'farm');
  if (!farm) return [];
  return CAMP_FARM_PLOT_OFFSETS.map((offset, index) => {
    const position = { x: farm.position.x + offset.x, y: farm.position.y + offset.y };
    const plot = state.camp!.farmPlots?.[index], growth = plot?.growth ?? 0, grownSeconds = plot ? farmGrownSeconds(plot) : 0;
    const rect = { left: position.x - 63, right: position.x + 63, top: position.y - 45, bottom: position.y + 45 };
    const dx = Math.max(rect.left - state.player.x, 0, state.player.x - rect.right);
    const dy = Math.max(rect.top - state.player.y, 0, state.player.y - rect.bottom);
    const status = !plot?.planted ? 'empty' : grownSeconds >= CAMP_FARM_RULES.matureSeconds ? 'ripe'
      : grownSeconds >= CAMP_FARM_RULES.growingAtSeconds ? 'grow' : 'seed';
    const waterAvailable = !!plot?.planted && status !== 'ripe' && !plot.watered;
    const pestsAvailable = !!plot?.planted && status !== 'ripe' && grownSeconds >= CAMP_FARM_RULES.pestsAtSeconds && !plot.pestsCleared;
    const sow = state.camp!.farmAction;
    return { index, position, rect, interactionPosition: { x: position.x, y: position.y + (index < 2 ? -78 : 78) }, growth, grownSeconds,
      status, remainingSeconds: plot?.planted ? CAMP_FARM_RULES.matureSeconds - grownSeconds : 0,
      growthProgress: grownSeconds / CAMP_FARM_RULES.matureSeconds, watered: !!plot?.watered, pestsCleared: !!plot?.pestsCleared,
      waterAvailable, pestsAvailable, action: status === 'empty' ? 'plant' : status === 'ripe' ? 'harvest' : waterAvailable ? 'water' : pestsAvailable ? 'pests' : 'wait',
      sowProgress: sow?.index === index ? Math.max(0, Math.min(1, (state.elapsed - sow.startedAt) / sow.duration)) : null,
      eligible: state.phase === 'playing' && Math.hypot(dx, dy) <= 55 };
  });
}
export function nearbyCampPlot(state: GameState): CampGardenPlot | undefined {
  return campFarmPlots(state).filter(plot => plot.eligible).sort((a, b) => Math.hypot(a.position.x - state.player.x, a.position.y - state.player.y)
    - Math.hypot(b.position.x - state.player.x, b.position.y - state.player.y) || a.index - b.index)[0];
}
export function campCropAction(plot: CampGardenPlot): string {
  if (plot.sowProgress !== null) return `播种中 · ${Math.max(0, CAMP_FARM_RULES.sowSeconds * (1 - plot.sowProgress)).toFixed(1)}秒`;
  return plot.action === 'harvest' ? `采摘蜜露营养荚 · +${FARM_BALANCE.harvest}口粮`
    : plot.action === 'plant' ? '免费播种 · 停留1.5秒'
    : plot.action === 'water' ? `浇水 · 加速25秒 · 余${formatFarmCountdown(plot.remainingSeconds)}`
    : plot.action === 'pests' ? `除虫 · 加速25秒 · 余${formatFarmCountdown(plot.remainingSeconds)}`
    : `营养荚生长中 · 余${formatFarmCountdown(plot.remainingSeconds)}`;
}

export interface CampFarmSowingResult { index: number; completed: boolean; cancelled: boolean }
/** Starting a gesture never plants or spends anything. Completion is committed by the profile writer. */
export function startCampFarmSeeding(state: GameState, index: number): boolean {
  const plot = campFarmPlots(state).find(plot => plot.index === index);
  if (!state.camp || state.camp.farmAction || state.camp.overview || !plot?.eligible || plot.status !== 'empty') return false;
  state.camp.farmAction = { kind: 'plant', index, startedAt: state.elapsed, duration: CAMP_FARM_RULES.sowSeconds };
  delete state.camp.cropFeedback; return true;
}
export function cancelCampFarmSeeding(state: GameState): void { if (state.camp) delete state.camp.farmAction; }
export function advanceCampFarmSeeding(state: GameState): CampFarmSowingResult | undefined {
  const action = state.camp?.farmAction; if (!action) return;
  if (state.phase !== 'playing') return;
  const plot = campFarmPlots(state).find(plot => plot.index === action.index);
  if (state.camp!.overview || !plot?.eligible || plot.status !== 'empty') {
    cancelCampFarmSeeding(state);
    state.camp!.cropFeedback = { index: action.index, kind: 'cancel', message: '播种已取消 · 未消耗种子', until: state.elapsed + 1.5 };
    return { index: action.index, completed: false, cancelled: true };
  }
  if (state.elapsed + 1e-8 < action.startedAt + action.duration) return;
  cancelCampFarmSeeding(state); return { index: action.index, completed: true, cancelled: false };
}
