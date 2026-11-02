import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { EndlessProfileStore } from '../../src/meta/endlessProfile';
import { healingPoints } from '../../src/game/healingPoints';

const idle = { moveX: 0, moveY: 0, aim: { x: 1200, y: 900 }, fire: false };
function session() { const game = new GameSession(71, { mode: 'endless' }); game.start(); return game; }
/** Post-clear transaction fixture; does not represent naturally winning five waves. */
function clear(game: GameSession, wave: number) {
  game.state.targets = [];
  Object.assign(game.state.endless!, { wave, clearedWaves: wave, phase: 'intermission',
    remainingToSpawn: 0, pendingChildren: 0, phaseUntil: game.state.elapsed + 1 });
  game.completeWave(wave);
}
function combat(game: GameSession) {
  const s = game.state, draft = s.endlessGrowth!.draft!;
  return game.chooseCombatUpgrade(draft.id, draft.options.find(option => option.id !== 'vitality')!.id, s.growth!.runId);
}
function protocol(game: GameSession) {
  const draft = game.state.growth!.draft!;
  expect(draft.source).toBe('endless');
  return game.discardDraft(draft.id);
}

describe('competition challenge reward and checkpoint transactions', () => {
  it('starts with a real immune protocol but no XP debt or initial debt tutorial', () => {
    const game = session();
    expect(game.state.growth).toMatchObject({ xp: 0, nextXp: null, starterDebt: 0,
      equipped: [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }] });
    expect(game.state.growth!.lastEvolution?.hint ?? '').not.toMatch(/预支|结清|55/);
  });

  it('awards combat before a single milestone protocol and freezes every intermediate step', () => {
    const game = session(), s = game.state;
    s.player.hp = 50; s.tissue.hp = 70;
    clear(game, 5);
    expect(s.phase).toBe('paused');
    expect(s.growth!.draft).toBeNull();
    expect(s.endless!.reward).toEqual({ wave: 5, step: 'combat' });
    expect(game.continueEndlessStage()).toBe(false);
    const tick = s.tick;
    for (let n = 0; n < 30; n++) game.step({ ...idle, fire: true, scan: true });
    expect(s.tick).toBe(tick);
    expect(combat(game)).toBe(true);
    expect(s.endless!.reward!.step).toBe('protocol');
    expect(s.growth!.draft).toMatchObject({ source: 'endless', endlessWave: 5 });
    expect(s.player.hp).toBe(68); expect(s.tissue.hp).toBe(82);
    expect(s.growth!.xp).toBe(0);
    game.resume(); expect(s.phase).toBe('paused');
    expect(protocol(game).kind).toBe('discarded');
    expect(s.endless!.reward!.step).toBe('complete');
    expect(s.phase).toBe('paused'); expect(s.tick).toBe(tick);
    expect(s.growth!.consumedDraftIds).toHaveLength(1);
    expect(s.events.some(event => event.type === 'RUN_ENDED')).toBe(false);
  });

  it('blocks ordinary resume at the checkpoint, and continues to six with the same run and no bonus', () => {
    const game = session(), s = game.state;
    clear(game, 5); combat(game); protocol(game);
    const before = { runId: s.growth!.runId, seed: s.seed, hp: s.player.hp, tissue: s.tissue.hp,
      score: s.endless!.score, level: s.endlessGrowth!.level, equipped: structuredClone(s.growth!.equipped) };
    game.resume(); game.step(idle);
    expect(s.phase).toBe('paused'); expect(s.endless!.wave).toBe(5);
    expect(game.continueEndlessStage()).toBe(true);
    expect(game.continueEndlessStage()).toBe(false);
    for (let n = 0; n < 65; n++) game.step(idle);
    expect(s.endless!.wave).toBe(6);
    expect({ runId: s.growth!.runId, seed: s.seed, hp: s.player.hp, tissue: s.tissue.hp,
      score: s.endless!.score, level: s.endlessGrowth!.level, equipped: s.growth!.equipped }).toEqual(before);
  });

  it('writes nothing at a checkpoint and records exactly one ended run on explicit exit', () => {
    const game = session(), store = new EndlessProfileStore(null);
    game.bus.on('event', event => { if (event.type === 'RUN_ENDED') store.recordRun(game.state, 'competition-run'); });
    clear(game, 5); combat(game); protocol(game);
    expect(store.data.runs).toBe(0);
    expect(game.finishEndlessStage()).toBe(true);
    expect(game.finishEndlessStage()).toBe(false);
    expect(store.data.runs).toBe(1);
    expect(store.data.recentRuns[0]).toMatchObject({ clearedWaves: 5, extracted: true });
  });

  it('cannot double-grant a wave or reuse a stale choice', () => {
    const game = session(); clear(game, 1);
    const draft = game.state.endlessGrowth!.draft!, run = game.state.growth!.runId;
    const chosen = draft.options[0].id;
    expect(game.chooseCombatUpgrade(draft.id, chosen, run)).toBe(true);
    const before = structuredClone(game.state.endlessGrowth);
    game.completeWave(1);
    expect(game.state.endlessGrowth).toEqual(before);
    expect(game.chooseCombatUpgrade(draft.id, chosen, run)).toBe(false);
    expect(game.state.growth!.xp).toBe(0);
  });

  it('does not repeat the first-stage checkpoint at ten, and restarting clears it', () => {
    const game = session(); clear(game, 5); combat(game); protocol(game); game.continueEndlessStage();
    clear(game, 10); combat(game); protocol(game);
    expect(game.state.phase).toBe('playing');
    expect(game.state.endless!.stageCheckpoint).toBe('acknowledged');
    game.restart();
    expect(game.state.endless!.wave).toBe(1); expect(game.state.endless!.stageCheckpoint).toBeUndefined();
    expect(game.state.endless!.reward).toBeUndefined(); expect(game.state.endlessGrowth!.level).toBe(0);
  });

  it('leaves campaign preparation and experience progression available', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G3', preparation: { version: 1, starterProtocolId: 'IMMUNE_BEACON' } });
    game.start();
    expect(game.state.growth).toMatchObject({ nextXp: 20, starterDebt: 1 });
    expect(game.continueEndlessStage()).toBe(false);
  });

  it('announces occupied challenge treatment without asking for unavailable samples', () => {
    const game = session(), s = game.state, node = healingPoints(s)[0];
    node.infection = 99.99;
    s.targets.push({ id: 'treatment-raider', x: node.x, y: node.y, role: 'virus', kind: 'single', radius: 22,
      hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, traits: [], attackReady: 100 });
    game.step(idle);
    expect(s.events.some(event => event.type === 'HEALING_POINT_OCCUPIED')).toBe(true);
    expect(s.message).toContain('本次不回血');
    expect(s.message).not.toContain('样本');
  });
});
