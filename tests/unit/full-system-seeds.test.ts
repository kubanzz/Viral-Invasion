import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GameSession } from '../../src/game/session';
import { BALANCE, activeWorld, type GameState, type InputFrame } from '../../src/game/types';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import type { MigrationChoice } from '../../src/game/campaignTypes';
import { distance, normalized } from '../../src/actors/collision';
import { g3Input, waypoint } from '../helpers/g3Driver';
import { IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';

const REPORT = resolve(process.env.VI_SYSTEM_REPORT ?? 'artifacts/g4-full-system-seeds.json');
const SEED_COUNT = 1000;
const MAX_STEPS = 300 * 60;
const choices: MigrationChoice[] = ['pursue', 'block', 'ignore'];
type Mode = 'base' | 'protocols';
type Summary = {
  seed: number; choice: MigrationChoice; mode: Mode; outcome: 'win' | 'loss' | 'exit' | 'invariant-failure';
  reason: string; tick: number; elapsed: number; peakActive: number; peakStored: number;
  traits: string[]; protocolRoute: string[]; equipped: string[]; drafts: number;
  organs: Array<{ id: string; activated: boolean; integrity: number }>;
  infection: number; vitality: number; playerHp: number; travels: number;
  core: string; demonstratedCoreTraits: string[]; sourceClears: number; sourceTotal: number;
  baseCountersAvailable: boolean; events: Record<string, number>; finalStateSha256: string;
};
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function simulationManifest(): Record<string, string> {
  const names = ['src/game', 'src/actors', 'src/core'].flatMap(directory =>
    readdirSync(directory, { recursive: true }).map(name => join(directory, String(name))).filter(name => statSync(name).isFile()));
  names.push('tests/helpers/g3Driver.ts', 'tests/unit/full-system-seeds.test.ts');
  return Object.fromEntries(names.sort().map(name => [name.replaceAll('\\', '/'), createHash('sha256').update(readFileSync(name)).digest('hex')]));
}

function guard(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(message); }
function finiteRange(value: number, minimum: number, maximum: number, name: string): void {
  guard(Number.isFinite(value) && value >= minimum - 1e-7 && value <= maximum + 1e-7, `${name}=${value}, expected [${minimum},${maximum}]`);
}
function validate(state: GameState): { alive: number; stored: number } {
  const battle = state.battle!, campaign = state.campaign!;
  finiteRange(state.player.hp, 0, 100, 'player.hp');
  finiteRange(battle.pressure.infection, 0, 100, 'infection'); finiteRange(battle.pressure.vitality, 0, 100, 'vitality');
  guard(Number.isSafeInteger(state.tick) && state.tick >= 0 && Number.isFinite(state.elapsed), 'invalid fixed clock');
  guard(Math.abs(state.elapsed - state.tick * BALANCE.step) < 1e-8, 'tick/elapsed disagreement');
  guard(battle.traits.length <= 2 && new Set(battle.traits).size === battle.traits.length, 'illegal/repeated main trait');
  guard(battle.traits.every(trait => ['CARAPACE', 'FISSION', 'MIMIC'].includes(trait)), 'unknown main trait');
  for (const cooldown of [state.scanReady, state.player.dashReady, ...Object.values(state.cooldowns)]) guard(Number.isFinite(cooldown), 'nonfinite tool/scan/dash cooldown');
  const growth = state.growth!;
  guard(growth.equipped.length <= 3 && new Set(growth.equipped.map(item => item.id)).size === growth.equipped.length, 'invalid protocol slots');
  guard(Number.isFinite(growth.xp) && growth.xp >= 0 && Number.isFinite(growth.research) && growth.research >= 0, 'invalid growth resources');
  if (growth.draft) guard(new Set(growth.draft.options.map(option => option.protocolId)).size === 3, 'draft lacks three distinct protocols');
  const cells=growth.cells??[];
  guard(cells.length<=IMMUNE_CELL_BALANCE.maximum&&new Set(cells.map(cell=>cell.id)).size===cells.length,'invalid immune cell population');
  for(const cell of cells){
    const geometry=campaign.arenas[cell.organId].geometry;
    guard(cell.organId===battle.organId,'immune cell leaked across organs');
    finiteRange(cell.x,geometry.bounds.left+cell.radius,geometry.bounds.right-cell.radius,`${cell.id}.x`);
    finiteRange(cell.y,geometry.bounds.top+cell.radius,geometry.bounds.bottom-cell.radius,`${cell.id}.y`);
    guard(Number.isFinite(cell.damage)&&cell.damage>0&&Number.isFinite(cell.until),'invalid immune cell values');
  }
  let alive = 0, stored = 0;
  for (const arena of Object.values(campaign.arenas)) {
    finiteRange(arena.tissue.hp, 0, 100, `${arena.organId}.integrity`);
    const ids = new Set<string>(); let localAlive = 0;
    for (const actor of arena.targets) {
      guard(!ids.has(actor.id), `duplicate actor ${arena.organId}/${actor.id}`); ids.add(actor.id);
      guard(Number.isFinite(actor.maxHp) && actor.maxHp > 0, `invalid maxHp ${actor.id}`);
      finiteRange(actor.hp, 0, actor.maxHp, `${actor.id}.hp`);
      guard(Number.isFinite(actor.x) && Number.isFinite(actor.y) && Number.isFinite(actor.radius) && actor.radius > 0, `invalid actor geometry ${actor.id}`);
      guard((actor.generation ?? 0) <= 1, `recursive fission ${actor.id}`);
      if (actor.hp > 0) localAlive++;
    }
    guard(localAlive <= BATTLE_BALANCE.maxActors, `${arena.organId} active cap ${localAlive}`);
    guard(arena.targets.length <= 96, `${arena.organId} corpse/storage growth ${arena.targets.length}`);
    alive = Math.max(alive, localAlive); stored = Math.max(stored, arena.targets.length);
  }
  const world = activeWorld(state), p = state.player;
  finiteRange(p.x, world.bounds.left + p.radius, world.bounds.right - p.radius, 'player.x');
  finiteRange(p.y, world.bounds.top + p.radius, world.bounds.bottom - p.radius, 'player.y');
  return { alive, stored };
}

/** A test-side strategy adds the explicit post-core rescue decision missing from the shared fast driver. */
function legalInput(state: GameState, choice: MigrationChoice): InputFrame {
  const input = g3Input(state, choice), campaign = state.campaign!;
  const current = state.battle!.organId, other = campaign.arenas[current === 'heart' ? 'lung' : 'heart'];
  if (campaign.core.status === 'cleared' && state.tissue.hp >= 65 && other.activated && other.tissue.hp < 50) {
    const exit = state.battle!.graph.nodes.find(node => node.kind === 'exit')!;
    const next = waypoint(state, exit), move = distance(state.player, exit) > 18 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
    return { ...input, moveX: move.x, moveY: move.y, interact: distance(state.player, exit) < 85 && state.tick % 15 === 0 };
  }
  return input;
}

function resolveDraft(game: GameSession, mode: Mode, seed: number, route: string[]): void {
  const growth = game.state.growth!, draft = growth.draft!;
  if (mode === 'base') { game.discardDraft(draft.id); return; }
  const option = draft.status === 'replacing' ? draft.options.find(item => item.id === draft.selectedOptionId)!
    : draft.options[(seed + growth.consumedDraftIds.length) % draft.options.length];
  const intent = { runId: growth.runId, draftId: draft.id, optionId: option.id };
  const result = game.chooseDraft(intent);
  if (result.kind === 'replace-required') {
    const slotIndex = (seed + growth.consumedDraftIds.length) % growth.equipped.length;
    const replacement = game.chooseDraft({ ...intent, slotIndex, expectedPreviousProtocolId: growth.equipped[slotIndex].id });
    guard(replacement.kind === 'committed', 'valid replacement rejected');
  } else guard(result.kind === 'committed', 'valid draft rejected');
  route.push(`${option.protocolId}:${option.kind}:${option.tuning}`);
}

function execute(seed: number, choice: MigrationChoice, mode: Mode): { summary: Summary; failureState?: GameState } {
  const game = new GameSession(seed, { campaign: true, milestone: 'G3' }); game.start();
  const events: Record<string, number> = {}, route: string[] = [];
  game.bus.on('event', event => { events[event.type] = (events[event.type] ?? 0) + 1; });
  let peakActive = 0, peakStored = 0, invariant: string | undefined, failureState: GameState | undefined;
  for (let actions = 0; actions < MAX_STEPS && game.state.phase !== 'result'; actions++) {
    try {
      if (game.state.growth?.draft) resolveDraft(game, mode, seed, route);
      else if (game.state.phase === 'paused') game.resume();
      else game.step(legalInput(game.state, choice));
      const bounds = validate(game.state); peakActive = Math.max(peakActive, bounds.alive); peakStored = Math.max(peakStored, bounds.stored);
    } catch (error) { invariant = error instanceof Error ? error.message : String(error); failureState = game.snapshot(); break; }
  }
  const state = game.state, c = state.campaign!, b = state.battle!;
  if (state.result?.success) {
    try {
      guard(c.core.status === 'cleared' && c.core.combat?.seenTraits.length === 2, 'win skipped fused core');
      guard(Object.values(c.arenas).every(arena => !arena.activated || arena.tissue.hp >= 50), 'win skipped organ integrity');
      guard(b.pressure.infection < 35 && state.player.hp > 0 && b.pressure.vitality > 0, 'win with fatal pressure');
      guard(events.RUN_ENDED === 1 && events.RETEST_COMPLETED === 1, 'duplicate/missing end or active retest');
    } catch (error) { invariant = String(error); failureState = game.snapshot(); }
  }
  const summary: Summary = { seed, choice, mode, outcome: invariant ? 'invariant-failure' : state.result ? state.result.success ? 'win' : 'loss' : 'exit',
    reason: invariant ?? state.result?.reason ?? 'Driver action budget reached; exited through the public menu without claiming impossibility.',
    tick: state.tick, elapsed: state.elapsed, peakActive, peakStored, traits: [...b.traits], protocolRoute: route,
    equipped: state.growth!.equipped.map(item => `${item.id}:${item.tuning}`), drafts: state.growth!.consumedDraftIds.length,
    organs: Object.values(c.arenas).map(arena => ({ id: arena.organId, activated: arena.activated, integrity: arena.tissue.hp })),
    infection: b.pressure.infection, vitality: b.pressure.vitality, playerHp: state.player.hp, travels: c.stats.travels,
    core: c.core.status, demonstratedCoreTraits: [...(c.core.combat?.seenTraits ?? [])], sourceClears: c.progress.sourceClears, sourceTotal: c.progress.sourceTotal,
    baseCountersAvailable: BALANCE.damage[1] > 0 && BATTLE_BALANCE.carapaceResistance > 0 && BALANCE.damage[2] >= BATTLE_BALANCE.childHp && BALANCE.repair > 0 && Number.isFinite(state.scanReady),
    events, finalStateSha256: fingerprint(state) };
  if (!state.result) { game.menu(); guard(game.state.phase === 'menu', 'public exit failed'); }
  return { summary, failureState };
}

describe('G4 complete-session seed coverage', () => {
  it('runs 1000 complete seeded sessions with bounded states, legal build/base inputs and reproducible endings', () => {
    mkdirSync(dirname(REPORT), { recursive: true });
    const startedAt = new Date().toISOString(), manifest = simulationManifest(), runs: Summary[] = [];
    let firstFailure: GameState | undefined;
    const save = (complete: boolean, replay?: { seed: number; equal: boolean; first: string; second: string }): void => {
      const count = (outcome: Summary['outcome']) => runs.filter(run => run.outcome === outcome).length;
      writeFileSync(REPORT, JSON.stringify({ schemaVersion: 1, complete, expectedSeeds: SEED_COUNT, completedSeeds: runs.length, startedAt, updatedAt: new Date().toISOString(),
        method: 'GameSession.start -> fixed-step public InputFrame and DraftIntent -> win/loss/public menu exit; no state or clock injection.',
        strategy: 'Migration choice rotates pursue/block/ignore. Odd seeds discard protocols; even seeds choose legal deterministic drafts. Public-input post-core rescue revisits unhealthy activated organs.',
        limits: { maximumActionsPerSeed: MAX_STEPS, maxActivePerOrgan: BATTLE_BALANCE.maxActors, maxMainTraits: 2 },
        simulationSourceSha256: fingerprint(manifest), simulationSourceManifest: manifest, simulationSourceUnchanged: fingerprint(simulationManifest()) === fingerprint(manifest),
        outcomes: { wins: count('win'), losses: count('loss'), publicMenuExits: count('exit'), invariantFailures: count('invariant-failure') },
        traitSequences: Object.fromEntries([...new Set(runs.map(run => run.traits.join('>')))].sort().map(key => [key, runs.filter(run => run.traits.join('>') === key).length])),
        modeCoverage: Object.fromEntries((['base', 'protocols'] as const).map(mode => [mode, { total: runs.filter(run => run.mode === mode).length, wins: runs.filter(run => run.mode === mode && run.outcome === 'win').length }])),
        limitations: ['Headless deterministic simulation is not a real browser or human playtest.', 'A driver loss/exit is not proof that a seed is impossible.', 'Configured base counters and real input availability are checked; these runs do not separately execute every counter on every trait.', 'No frame-rate or 10-minute device-performance claim is made.'],
        replay, firstFailure, runs }, null, 2));
    };
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const run = execute(seed, choices[(seed - 1) % choices.length], seed % 2 ? 'base' : 'protocols');
      runs.push(run.summary);
      if (run.failureState) { firstFailure = run.failureState; save(false); break; }
      if (seed % 100 === 0) { save(false); console.info('FULL_SESSION_SEEDS_PROGRESS', JSON.stringify({ completed: seed, wins: runs.filter(row => row.outcome === 'win').length, losses: runs.filter(row => row.outcome === 'loss').length, exits: runs.filter(row => row.outcome === 'exit').length })); }
    }
    const replay1 = execute(91, 'pursue', 'base').summary, replay2 = execute(91, 'pursue', 'base').summary;
    const replay = { seed: 91, equal: replay1.finalStateSha256 === replay2.finalStateSha256, first: replay1.finalStateSha256, second: replay2.finalStateSha256 };
    save(runs.length === SEED_COUNT && !firstFailure, replay);
    expect(firstFailure, `Counterexample is saved in ${REPORT}`).toBeUndefined();
    expect(runs).toHaveLength(SEED_COUNT); expect(replay.equal).toBe(true);
    expect(runs.every(run => run.baseCountersAvailable)).toBe(true);
    expect(fingerprint(simulationManifest())).toBe(fingerprint(manifest));
    for (const choice of choices) for (const mode of ['base', 'protocols'] as const) expect(runs.some(run => run.choice === choice && run.mode === mode && run.outcome === 'win')).toBe(true);
    expect(new Set(runs.filter(run => run.traits.length === 2).map(run => run.traits.join('>'))).size).toBe(6);
    console.info('FULL_SESSION_SEEDS_COMPLETE', JSON.stringify({ seeds: runs.length, wins: runs.filter(run => run.outcome === 'win').length, losses: runs.filter(run => run.outcome === 'loss').length, exits: runs.filter(run => run.outcome === 'exit').length, replayEqual: replay.equal }));
  // The expanded campaign and real cell navigation require a larger batch
  // runner budget; the per-seed action cap and every gameplay invariant stay fixed.
  }, 900_000);
});
