import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { growthContext, type GrowthController } from '../../src/game/growth';
import type { DamageOrigin, GrowthCommand } from '../../src/game/growthTypes';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';
import { growthDetailsOverlay } from '../../src/ui/growthHud';

const world: WorldGeometry = { width: 2400, height: 1500,
  bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [],
  foreground: { x: 0, y: 0, width: 0, height: 0 } };
type Host = { growthController: GrowthController; damage(target: Target, amount: number, origin: DamageOrigin): number;
  applyGrowthCommands(commands: readonly GrowthCommand[]): void };
const input: InputFrame = { moveX: 0, moveY: 0, aim: { x: 600, y: 500 }, tool: 1, fire: true };
const actor = (id: string, x: number, hp = 204): Target => ({ id, x, y: 500, hp, maxHp: 204, radius: 30,
  role: 'elite', kind: 'single', traits: [], hitUntil: 0, scanned: false, attackReady: 100 });

// Isolated, explicitly supplied post-growth state. HP/radius are real late-wave
// elite values. This does not claim natural card acquisition or a full run.
function configure(session: GameSession) {
  const state = session.state;
  state.world = structuredClone(world);
  Object.assign(state.player, { x: 500, y: 500 });
  Object.assign(state.tissue, { x: 500, y: 750, hp: 100 });
  state.targets = [actor('a', 600), actor('b', 750)];
  state.endlessGrowth!.ranks = { multishot: 2 };
  state.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 3 }];
  state.growth!.chainCharge = 0;
  return { session, host: session as unknown as Host, a: state.targets[0], b: state.targets[1] };
}
function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  return configure(session);
}
const logs = (session: GameSession) => session.state.events.filter(event => event.type === 'PROTOCOL_RICOCHET_HIT');
const receipts = (session: GameSession) => session.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'PURIFY_CHAIN');
const history = (session: GameSession) => session.state.growth!.protocolHistory.filter(entry => entry.type === 'PROTOCOL_RICOCHET_HIT');
const damageCommands = (commands: readonly GrowthCommand[]) => commands.filter((command): command is Extract<GrowthCommand, { kind: 'damage' }> => command.kind === 'damage');
function evidence(f: ReturnType<typeof fixture>) {
  return { scope: 'Explicit post-growth fixture; one public step, unchanged host damage path. Not natural acquisition, campaign, browser, or human evidence.',
    input, preset: { player: { x: 500, y: 500 }, targets: ['a', 'b'].map((id, index) => ({ id, x: 600 + index * 150, y: 500, hp: 204, radius: 30 })),
      ranks: { multishot: 2 }, protocol: { id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 3 }, chainCharge: 0 },
    result: { aHp: f.a.hp, bHp: f.b.hp, actualBDamage: 204 - f.b.hp,
      ricochetHits: f.session.state.runMetrics!.summary.control.ricochetHits,
      uniqueRoots: [...new Set(logs(f.session).map(event => event.data.rootId))],
      history: history(f.session), receipts: receipts(f.session), logs: logs(f.session),
      events: f.session.state.events, metrics: f.session.state.runMetrics, growth: f.session.state.growth } };
}
function normalized(session: GameSession) {
  const runId = session.state.growth!.runId;
  return { hp: session.state.targets.map(target => [target.id, target.hp]),
    events: session.state.events.filter(event => ['TARGET_HIT', 'PROTOCOL_RICOCHET_HIT'].includes(event.type)).map(event => ({ ...event,
      data: { ...event.data, ...(typeof event.data.rootId === 'string' ? { rootId: event.data.rootId.replace(runId, '<run>') } : {}) } })),
    control: session.state.runMetrics!.summary.control, history: history(session), chainCharge: session.state.growth!.chainCharge };
}

describe('independent accepted ricochet transaction receipts', () => {
  it('records both real folds from one public five-ray shot as 140 actual and 140 reported damage', () => {
    const f = fixture(); f.session.step(input);
    if (process.env.VI_RICOCHET_REPORT) {
      mkdirSync(dirname(process.env.VI_RICOCHET_REPORT), { recursive: true });
      writeFileSync(process.env.VI_RICOCHET_REPORT, JSON.stringify(evidence(f), null, 2), { flag: 'wx' });
    }
    expect(f.a.hp).toBe(34); expect(f.b.hp).toBe(64);
    expect(receipts(f.session).map(event => event.data.damage)).toEqual([70, 70]);
    expect(new Set(logs(f.session).map(event => event.data.rootId)).size).toBe(2);
    expect(f.session.state.runMetrics!.summary.control.ricochetHits).toBe(2);
    expect(history(f.session).map(entry => entry.text)).toEqual([
      '连锁进阶：实际折射 1 体，共 70 点伤害。', '连锁进阶：实际折射 1 体，共 70 点伤害。']);
    expect(growthDetailsOverlay(f.session.state, '返回')).toContain('折射 2 次');
    expect(f.session.state.growth!.chainCharge).toBe(1);
  });

  it('uses distinct child roots for independent real hits with the same nonempty upstream root', () => {
    const f = fixture(), origin: DamageOrigin = { cause: 'basic', basicTool: 1, rootId: 'upstream:shared' };
    for (let hit = 0; hit < 4; hit++) f.host.damage(f.a, 34, origin);
    const accepted = logs(f.session);
    expect(f.a.hp).toBe(68); expect(f.b.hp).toBe(64);
    expect(accepted).toHaveLength(2);
    expect(new Set(accepted.map(event => event.data.rootId)).size).toBe(2);
    expect(accepted.every(event => event.data.rootId !== origin.rootId && event.data.sourceRootId === origin.rootId)).toBe(true);
    expect(f.session.state.runMetrics!.summary.control.ricochetHits).toBe(2);
    expect(history(f.session)).toHaveLength(2);
  });

  it('still deduplicates repeated receipt and log deliveries for each accepted transaction', () => {
    const f = fixture(); f.session.step(input);
    const before = { control: structuredClone(f.session.state.runMetrics!.summary.control), history: structuredClone(history(f.session)) };
    const deliveries = f.session.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'PURIFY_CHAIN' || event.type === 'PROTOCOL_RICOCHET_HIT');
    for (let repeat = 0; repeat < 3; repeat++) for (const event of deliveries) f.session.emit(event.type, event.data);
    expect(f.b.hp).toBe(64);
    expect(f.session.state.runMetrics!.summary.control).toEqual(before.control);
    expect(history(f.session)).toEqual(before.history);
  });

  it('retains actual HP clipping separately for two same-tick folds to the same body', () => {
    const f = fixture(); f.b.hp = 75;
    f.session.step(input);
    expect(receipts(f.session).map(event => event.data.damage)).toEqual([70, 5]);
    expect(f.session.state.runMetrics!.summary.control.ricochetHits).toBe(2);
    expect(history(f.session).map(entry => entry.text)).toEqual([
      '连锁进阶：实际折射 1 体，共 70 点伤害。', '连锁进阶：实际折射 1 体，共 5 点伤害。']);
  });

  it('does not consume an accepted identity, reset charge, or report success on budget rejection', () => {
    const f = fixture(), state = f.session.state.growth!, origin: DamageOrigin = { cause: 'basic', basicTool: 1, rootId: 'shared' };
    state.chainCharge = 1; state.budgetTick = f.session.state.tick; state.budgetUsed = GROWTH_BALANCE.commandBudget;
    f.host.damage(f.a, 34, origin);
    expect(state.chainCharge).toBe(2); expect(state.activations?.PURIFY_CHAIN ?? 0).toBe(0);
    expect(state.skippedCommands).toBe(3); expect(logs(f.session)).toEqual([]); expect(history(f.session)).toEqual([]);
    expect(f.session.state.runMetrics!.summary.control.ricochetHits).toBe(0);
    state.budgetUsed = 0; // Explicit same-tick retry isolates identity reservation from budget policy.
    f.host.damage(f.a, 34, origin);
    const clean = fixture(); clean.session.state.growth!.chainCharge = 1; clean.host.damage(clean.a, 34, origin);
    expect(logs(f.session).map(event => event.data.rootId)).toEqual(logs(clean.session).map(event => event.data.rootId));
    expect(state.chainCharge).toBe(0); expect(state.activations?.PURIFY_CHAIN).toBe(1);
    expect(f.session.state.runMetrics!.summary.control.ricochetHits).toBe(1);
  });

  it('does not reserve an identity when no neighbor can receive the fold', () => {
    const f = fixture(), origin: DamageOrigin = { cause: 'basic', basicTool: 1, rootId: 'shared' };
    f.session.state.growth!.chainCharge = 1; f.session.state.targets = [f.a];
    f.host.damage(f.a, 34, origin);
    expect(f.session.state.growth!.chainCharge).toBe(2); expect(logs(f.session)).toEqual([]);
    f.session.state.targets.push(f.b); f.host.damage(f.a, 34, origin);
    const clean = fixture(); clean.session.state.growth!.chainCharge = 1; clean.host.damage(clean.a, 34, origin);
    expect(logs(f.session).map(event => event.data.rootId)).toEqual(logs(clean.session).map(event => event.data.rootId));
  });

  it('keeps same-tick identities distinct across organs and resets only the tick-local ordinal on a later tick', () => {
    const f = fixture(), controller = f.host.growthController, origin: DamageOrigin = { cause: 'basic', rootId: 'shared' };
    const accepted: string[] = [];
    for (const [tick, organId] of [[0, 'heart'], [0, 'lung'], [1, 'lung']] as const) {
      const context = { ...growthContext(f.session.state), tick, organId };
      controller.onHit(context, f.a, origin);
      const command = damageCommands(controller.onHit(context, f.a, origin))[0];
      expect(command).toBeTruthy(); accepted.push(command.rootId);
    }
    expect(new Set(accepted).size).toBe(3);
    expect(accepted.map(root => root.slice(root.lastIndexOf(':') + 1))).toEqual(['1', '2', '1']);
  });

  it('replays deterministically in a fresh controller and resets after restart without reusing the old run namespace', () => {
    const f = fixture(); f.session.step(input);
    const first = normalized(f.session), oldRoots = logs(f.session).map(event => event.data.rootId);
    const replay = fixture(); replay.session.step(input);
    expect(normalized(replay.session)).toEqual(first);
    expect(logs(replay.session).map(event => event.data.rootId)).toEqual(oldRoots);
    f.session.restart(); configure(f.session); f.session.step(input);
    expect(normalized(f.session)).toEqual(first);
    expect(logs(f.session).map(event => event.data.rootId).some(root => oldRoots.includes(root))).toBe(false);
  });

  it('preserves the lethal basic chain branch, its upstream root, and the no-recursion rule', () => {
    const f = fixture(); f.a.hp = 34; f.session.state.targets.push(actor('c', 900));
    f.session.state.growth!.chainCharge = 1;
    const origin: DamageOrigin = { cause: 'basic', basicTool: 1, rootId: 'upstream:lethal' };
    f.host.damage(f.a, 34, origin);
    expect(f.a.hp).toBe(0); expect(f.b.hp).toBe(134); expect(f.session.state.targets.find(target => target.id === 'c')!.hp).toBe(134);
    expect(logs(f.session)).toEqual([]); expect(f.session.state.growth!.chainCharge).toBe(1);
    const chains = f.session.state.events.filter(event => event.type === 'PROTOCOL_CHAIN_HIT');
    expect(chains.map(event => event.data.rootId)).toEqual([origin.rootId, origin.rootId]);
    expect(f.session.state.runMetrics!.summary.control).toMatchObject({ chainTriggers: 1, chainHops: 2, ricochetHits: 0 });
    expect(receipts(f.session)).toHaveLength(2);
  });
});
