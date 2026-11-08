import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { initializeConstruction, unlockConstructionBlueprint } from '../../src/game/construction';
import { castWeaponUltimate, fillWeaponUltimate } from '../../src/game/weaponUltimates';
import { updateConstructionDiscovery, updateConstructionPlacement } from '../../src/ui/constructionHud';
import type { Target } from '../../src/game/types';

function hud() {
  const notice = { hidden: true, style: { top: '' } }, button = { hidden: true, dataset: { newBlueprint: '' } };
  const tactical = { dataset: { newBlueprint: '' } }, placement = { hidden: true };
  const root = {
    querySelector(selector: string) { return selector === '#construction-discovery' ? notice : selector === '#construction-placement' ? placement : null; },
    querySelectorAll(selector: string) {
      if (selector === '[data-action="build-open"]') return [notice, button];
      if (selector === '.construction-open, .mobile-tactical-menu') return [button, tactical];
      return [];
    },
    getBoundingClientRect() { return { top: 0, bottom: 0, height: 0 }; },
  } as unknown as HTMLElement;
  return { root, notice, button, tactical };
}

describe('construction discovery while drawing a blade route', () => {
  it.each(['drawing', 'windup', 'executing', 'recovery'] as const)('hides the unread notice/emphasis during %s and restores them after sheathing', phase => {
    const game = new GameSession(2020, { mode: 'endless', territory: true }); game.start();
    game.configureExpedition({ runId: 'construction-trace-hud', seed: 2020, firstClear: false,
      loadout: { weaponId: 'redblade', rarity: 'gold', upgrade: 0 }, blueprints: [], extraAntibodies: 0 });
    const state = game.state, ui = hud(); initializeConstruction(state);
    const discovered = unlockConstructionBlueprint(state, 'launch-pod').some(event => event.type === 'CONSTRUCTION_BLUEPRINT_UNLOCKED');
    expect(discovered).toBe(true);
    const refresh = () => {
      // The actual main HUD updates general placement visibility first.
      updateConstructionPlacement(ui.root, state);
      updateConstructionDiscovery(ui.root, state, discovered);
    };
    refresh(); expect(ui.notice.hidden).toBe(false); expect(ui.button.dataset.newBlueprint).toBe('true');
    const target: Target = { id: 'trace-hud-virus', x: state.player.x + 80, y: state.player.y, radius: 22,
      role: 'virus', kind: 'single', hp: 100, maxHp: 100, hitUntil: 0, scanned: false };
    state.targets = [target]; fillWeaponUltimate(state);
    expect(castWeaponUltimate(game, target)).toBe(true);
    expect(state.weaponCombat!.bladeTrace?.phase).toBe('drawing');
    // The production cast supplies all trace data; select each valid lifecycle
    // phase without making this UI regression depend on combat route timing.
    state.weaponCombat!.bladeTrace!.phase = phase;
    const during = JSON.stringify(state); refresh();
    expect(ui.notice.hidden).toBe(true);
    expect(ui.button.dataset.newBlueprint).toBe('false'); expect(ui.tactical.dataset.newBlueprint).toBe('false');
    expect(JSON.stringify(state)).toBe(during);
    delete state.weaponCombat!.bladeTrace;
    refresh(); expect(ui.notice.hidden).toBe(false);
    expect(ui.button.dataset.newBlueprint).toBe('true'); expect(ui.tactical.dataset.newBlueprint).toBe('true');
    expect(state.territory!.construction!.availableBlueprints).toContain('launch-pod');
    updateConstructionDiscovery(ui.root, state, false);
    expect(ui.notice.hidden).toBe(true); expect(ui.button.dataset.newBlueprint).toBe('false');
  });
});
