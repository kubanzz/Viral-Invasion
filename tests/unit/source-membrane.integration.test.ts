import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { territorySourceShielded } from '../../src/game/territory';
import { territoryMarkerView } from '../../src/game/territoryPresentation';
import { territoryHudView, territoryResultView } from '../../src/ui/territoryHud';
import type { Target } from '../../src/game/types';

/** Explicit starting-state fixtures; actions, damage and objective transitions use production code. */
function fixture() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state, territory = state.territory!;
  state.targets = [];
  Object.assign(state.endless!, { phase: 'combat', remainingToSpawn: 1, nextSpawnAt: Infinity,
    batchSchedule: [], territoryTasks: { wave: 1, squads: [], reservedSlots: [] } });
  const host = game as unknown as { damage(target: Target, amount: number): number; advanceTerritoryGoal(): void };
  const sourceNode = territory.nodes.find(node => node.id === 'source-west')!;
  const source: Target = { id: 'territory:source-west', x: sourceNode.x, y: sourceNode.y,
    kind: 'single', role: 'source', radius: 34, hp: 1200, maxHp: 1200, hitUntil: 0,
    scanned: false, traits: [], territorySourceId: 'source-west', blocksWaveClear: false };
  Object.assign(territory.sources['source-west'], { spawned: true, unlocked: true, actorId: source.id });
  state.targets.push(source);
  return { game, state, territory, source, host };
}

describe('source access and rescue progression without mandatory army interception', () => {
  it('accepts normal node purification input, then real source damage at rank I without deploying a legion', () => {
    const { game, state, territory, source, host } = fixture();
    const front = territory.nodes.find(node => node.id === 'front-north')!;
    expect(host.damage(source, 40)).toBe(0);
    expect(state.message).toContain('北线前沿');
    Object.assign(state.player, { x: front.x, y: front.y });
    const input = { moveX: 0, moveY: 0, fire: false, aim: front };
    game.step({ ...input, territoryAction: true });
    for (let i = 0; i < 185; i++) game.step(input);
    expect(front.owner).toBe('healthy');
    expect(territorySourceShielded(state, 'source-west')).toBe(false);
    expect(state.scans).toBe(0);
    expect(state.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!.rank).toBe(1);
    expect(territory.defense.north.handoff).toBe(false);
    expect(host.damage(source, 40)).toBe(40);
    const hp = source.hp;
    const spring = territory.nodes.find(node => node.id === 'heart-healing-1')!;
    spring.owner = 'infected';
    expect(host.damage(source, 40)).toBe(0);
    expect(territoryMarkerView(state, territory.nodes.find(node => node.id === 'source-west')!).label).toContain('北侧生命泉');
    expect(source.hp).toBe(hp);
    spring.owner = 'healthy';
    expect(host.damage(source, 40)).toBe(40);
    expect(source.hp).toBe(hp - 40);
    expect(territoryHudView(state)!.lines[0].sourceOpen).toBe(true);
    expect(territoryHudView(state)!.objective).toContain('击破西侧感染源');
  });

  it('opens the real mother encounter and saves victory with both legacy handoff flags false', () => {
    const { game, state, territory, host } = fixture();
    state.targets = [];
    for (const node of territory.nodes) { node.owner = 'healthy'; node.infectionProgress = 0; }
    for (const source of Object.values(territory.sources)) source.destroyed = true;
    Object.assign(state.endless!, { remainingToSpawn: 0, pendingChildren: 0, clearedWaves: state.endless!.wave });
    territory.stage = 'bossPending';
    host.advanceTerritoryGoal();
    expect(territory.stage).toBe('boss');
    const mother = state.targets.find(target => target.id === territory.bossId)!;
    expect(mother.hp).toBeGreaterThan(0);
    // The boss death is supplied here; boss attack and membrane tests cover combat separately.
    mother.hp = 0;
    host.advanceTerritoryGoal();
    expect(territory.stage).toBe('victory');
    expect(state.phase).toBe('paused');
    expect(territory.rescueSnapshot).toBeDefined();
    expect(territoryResultView(state)?.checks.every(check => check.completed)).toBe(true);
    expect(territory.defense.north.handoff || territory.defense.south.handoff).toBe(false);
    expect(game.continueTerritoryGuard()).toBe(true);
  });

  it('still requires final cleanup and gives same-frame death precedence over victory', () => {
    for (const blocked of ['infected', 'enemy', 'player', 'core'] as const) {
      const { game, state, territory } = fixture();
      for (const node of territory.nodes) { node.owner = 'healthy'; node.infectionProgress = 0; }
      for (const source of Object.values(territory.sources)) source.destroyed = true;
      territory.stage = 'cleanup'; state.targets = [];
      Object.assign(state.endless!, { remainingToSpawn: 0, pendingChildren: 0 });
      if (blocked === 'infected') territory.nodes.find(node => node.id === 'front-south')!.owner = 'infected';
      if (blocked === 'enemy') state.targets.push({ id: 'remaining-enemy', x: 200, y: 300, role: 'virus',
        kind: 'single', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false });
      if (blocked === 'player') state.player.hp = 0;
      if (blocked === 'core') state.tissue.hp = 0;
      game.step({ moveX: 0, moveY: 0, fire: false, aim: state.player });
      expect(territory.rescueSnapshot).toBeUndefined();
      expect(territory.stage).not.toBe('victory');
      if (blocked === 'player' || blocked === 'core') expect(state.result?.success).toBe(false);
    }
  });
});
