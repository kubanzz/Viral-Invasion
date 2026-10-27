import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createCampaignEncounters } from '../../src/game/campaignEncounters';
import { BATTLE_BALANCE, TRAITS } from '../../src/game/battleConfig';
import type { GameState } from '../../src/game/types';
import { encounterHelpMarkup, encounterHudContent } from '../../src/ui/encounterHud';
import { drawEncounterSignals } from '../../src/render/encounterVisuals';

function fixture(): GameState {
  const game = new GameSession(13, { campaign: true, milestone: 'G3', encounterMode: 'formal', counterGuide: 'guided' });
  game.start(); const state = game.snapshot();
  state.campaign!.encounters ??= createCampaignEncounters(state.elapsed);
  return state;
}
function canvas() {
  const calls: Array<{ method: string; args: unknown[] }> = [], values: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({}, {
    get: (_target, key) => key in values ? values[String(key)] : (...args: unknown[]) => { calls.push({ method: String(key), args }); },
    set: (_target, key, value) => { values[String(key)] = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, calls };
}
function freeze(value: unknown): void { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return; Object.freeze(value); for (const child of Object.values(value)) freeze(child); }

describe('encounter presentation uses accepted run state', () => {
  it('does not call a cleared guardian mastered without a recorded counter, and preserves skipped help', () => {
    const state = fixture(), first = state.battle!.encounter!.firstCounter;
    first.status = 'resolved'; first.resolvedAt = state.elapsed; first.counterHit = null;
    expect(encounterHudContent(state)?.line).toContain('未记录');
    expect(encounterHelpMarkup(state)).toContain('清除目标不自动等于掌握反制');
    first.guideStatus = 'skipped'; first.skippedAt = state.elapsed;
    expect(encounterHudContent(state)).toBeNull();
    const help = encounterHelpMarkup(state);
    expect(help).toContain('提示已跳过'); expect(help).toContain('绕后净化'); expect(help).toContain('借阀门破壳');
    expect(help).toContain(`消耗 ${BATTLE_BALANCE.pulseCost} 点组织完整度`);
    expect(help).toContain(`冷却 ${BATTLE_BALANCE.pulseCooldown} 秒`);
  });

  it('shows the actual counter method and damage while migration and danger keep priority', () => {
    const state = fixture(), first = state.battle!.encounter!.firstCounter;
    first.status = 'active'; first.guideStatus = 'completed';
    first.counterHit = { tick: state.tick, at: state.elapsed, targetId: 'first-guardian', method: 'pulse', damage: 17 };
    expect(encounterHudContent(state)?.line).toContain('冲流破绽净化 · 实际伤害 17');
    state.campaign!.migration.status = 'warning'; expect(encounterHudContent(state)).toBeNull();
    state.campaign!.migration.status = 'locked'; state.battle!.pressure.organAlarm = true; expect(encounterHudContent(state)).toBeNull();
  });

  it('shows actual adaptive traits without inventing a crystal-shell encounter', () => {
    const state = fixture(), battle = state.battle!;
    battle.encounter!.guideVariant = 'adaptive'; battle.encounter!.firstCounter.guideStatus = 'inactive';
    battle.traits = [];
    expect(encounterHelpMarkup(state)).toContain('尚未侦测到变异');
    expect(encounterHelpMarkup(state)).not.toContain('晶壳反制 · 两条基础路线');
    battle.traits = ['FISSION']; battle.warning = { trait: 'MIMIC', startedAt: state.elapsed, applyAt: state.elapsed + 8 };
    const help = encounterHelpMarkup(state);
    expect(help).toContain(TRAITS.FISSION.counter); expect(help).toContain(TRAITS.FISSION.cost);
    expect(help).toContain('潜伏（预警中）'); expect(help).toContain(TRAITS.MIMIC.counter);
    expect(help).not.toContain('晶壳反制 · 两条基础路线');
    expect(encounterHudContent(state)).toBeNull();
  });

  it('keeps manual skip reachable after an uncountered clear and removes it after acknowledgment', () => {
    const state = fixture(), first = state.battle!.encounter!.firstCounter;
    first.status = 'resolved'; first.resolvedAt = state.elapsed; first.guideStatus = 'active'; first.counterHit = null;
    state.elapsed += 5;
    expect(encounterHudContent(state)).toBeNull();
    state.phase = 'paused';
    expect(encounterHelpMarkup(state)).toContain('data-action="skip-counter-guide"');
    expect(encounterHelpMarkup(state)).toContain('清除目标不自动等于掌握反制');
    first.guideStatus = 'skipped'; first.skippedAt = state.elapsed;
    expect(encounterHelpMarkup(state)).not.toContain('data-action="skip-counter-guide"');
    expect(encounterHelpMarkup(state)).toContain('提示已跳过');
  });

  it('keeps source-to-tissue signals and the real countdown in low effects without mutating state', () => {
    const state = fixture(), crisis = state.campaign!.encounters!.crisis;
    crisis.status = 'charging'; crisis.organId = 'heart'; crisis.chargeRemaining = 5; crisis.nextImpactAt = state.elapsed + 5;
    state.targets.push({ id: crisis.sourceId, role: 'source', kind: 'single', x: 1500, y: 850, radius: 34, hp: 68, maxHp: 68, hitUntil: 0, scanned: false });
    const before = JSON.stringify(state); freeze(state);
    for (const low of [false, true]) {
      const drawn = canvas(); drawEncounterSignals(drawn.ctx, state, low);
      expect(drawn.calls.find(call => call.method === 'ellipse')?.args.slice(0, 2)).toEqual([1500, 850]);
      expect(drawn.calls.some(call => call.method === 'ellipse' && call.args[0] === state.tissue.x && call.args[1] === state.tissue.y)).toBe(true);
      expect(drawn.calls.some(call => call.method === 'fillText' && call.args[0] === '冲击 5.0s')).toBe(true);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not draw an unaccepted, dead or offscreen-organ crisis source', () => {
    const state = fixture(), crisis = state.campaign!.encounters!.crisis;
    crisis.status = 'charging'; crisis.nextImpactAt = state.elapsed + 4;
    let drawn = canvas(); drawEncounterSignals(drawn.ctx, state, false); expect(drawn.calls).toEqual([]);
    const source = { id: crisis.sourceId, role: 'source' as const, kind: 'single' as const, x: 1500, y: 850, radius: 34, hp: 0, maxHp: 68, hitUntil: 0, scanned: false };
    state.targets.push(source); drawn = canvas(); drawEncounterSignals(drawn.ctx, state, true); expect(drawn.calls).toEqual([]);
    source.hp = 68; crisis.organId = 'lung'; drawn = canvas(); drawEncounterSignals(drawn.ctx, state, true); expect(drawn.calls).toEqual([]);
  });
});
