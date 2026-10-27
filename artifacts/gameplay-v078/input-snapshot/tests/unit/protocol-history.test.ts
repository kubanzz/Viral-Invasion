import { describe, expect, it } from 'vitest';
import { acceptedProtocolHit, growthContext, type GrowthController } from '../../src/game/growth';
import type { GrowthCommand, ProtocolId } from '../../src/game/growthTypes';
import { MotherCoreController } from '../../src/game/motherCore';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { GameEvent, InputFrame, Target } from '../../src/game/types';
import { GrowthVisuals } from '../../src/render/growthVisuals';
import { growthHistoryMarkup } from '../../src/ui/growthHud';

// Explicit isolated mechanism presets. Only setup uses direct state; every
// damage receipt below is emitted by GameSession's unchanged common host path.
// Calling its command bridge here does not claim a browser or campaign victory.
type Host = { growthController: GrowthController; motherController?: MotherCoreController; applyGrowthCommands(commands: readonly GrowthCommand[]): void };
const actor = (id: string, x: number, hp = 68): Target => ({ id, x, y: 400, role: 'virus', kind: 'single', hp, maxHp: hp, radius: 22, hitUntil: 0, scanned: false, traits: [] });
const idle: InputFrame = { moveX: 0, moveY: 0, aim: { x: 600, y: 400 }, tool: 1, fire: false, scan: false, interact: false };
function fixture(ids: ProtocolId[] = ['PULSE_BREAK', 'PURIFY_CHAIN']) {
  const session = new GameSession(13, { campaign: true, milestone: 'G2', encounterMode: 'fixture' });
  session.start();
  const host = session as unknown as Host, growth = host.growthController;
  growth.state.equipped = ids.map(id => ({ id, tuning: 'balanced' }));
  const dead = actor('root', 500, 0), neighbors = [actor('one', 600), actor('two', 700), actor('three', 800)];
  session.state.targets = [dead, ...neighbors];
  return { session, host, growth, dead, neighbors };
}
const actual = (growth: GrowthController, type = 'PROTOCOL_CHAIN_HIT') => growth.state.protocolHistory.filter(entry => entry.type === type);
const damage = (commands: readonly GrowthCommand[]) => commands.filter((command): command is Extract<GrowthCommand, { kind: 'damage' }> => command.kind === 'damage');
function plan(f: ReturnType<typeof fixture>, rootId = 'accepted-chain') {
  return f.growth.onKill(growthContext(f.session.state), f.dead, { cause: 'basic', rootId, wasPulseExposed: true });
}
function labels(session: GameSession): string[] {
  const drawn: string[] = [];
  const canvas = new Proxy({}, { get: (_target, key) => key === 'fillText' ? (value: string) => drawn.push(value) : () => {}, set: () => true }) as CanvasRenderingContext2D;
  new GrowthVisuals().drawProtocolHits(canvas, session.state, session.state.growth);
  return drawn;
}
function coreFixture(hp = 100) {
  const session = new GameSession(19, { campaign: true, milestone: 'G3' }); session.start();
  const host = session as unknown as Host, growth = host.growthController;
  growth.state.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced' }];
  const dead = actor('root', 1000, 0), core = { ...actor('protected-core', 1100, hp), y: 800, role: 'core' as const, maxHp: 200 }, neighbor = { ...actor('after-core', 1200), y: 800 };
  dead.y = 800;
  session.state.targets = [dead, core, neighbor];
  session.state.campaign!.arenas.heart.targets = session.state.targets;
  host.motherController = new MotherCoreController({ coreId: core.id, organId: 'heart', traits: ['CARAPACE'], tick: session.state.tick, elapsed: session.state.elapsed });
  const commands = growth.onKill(growthContext(session.state), dead, { cause: 'basic', rootId: 'membrane-chain' });
  return { session, host, growth, core, neighbor, commands };
}

describe('accepted protocol history and hit acknowledgements', () => {
  it('keeps a visible plan and records no successful hops when every planned body is already dead', () => {
    const f = fixture(), commands = plan(f);
    expect(damage(commands)).toHaveLength(3);
    expect(f.growth.state.protocolHistory.at(-1)).toMatchObject({ type: 'PROTOCOL_CHAIN_PLANNED', text: expect.stringContaining('计划：尝试 3 跳') });
    expect(actual(f.growth)).toEqual([]);
    for (const target of f.neighbors) target.hp = 0;
    f.host.applyGrowthCommands(commands);
    expect(f.session.state.events.some(event => event.type === 'TARGET_HIT')).toBe(false);
    expect(f.session.state.runMetrics!.summary.control.chainHops).toBe(0);
    expect(actual(f.growth)).toEqual([]);
    expect(growthHistoryMarkup(f.session.state)).toContain('连锁净化计划：尝试 3 跳');
    expect(labels(f.session)).toEqual([]);
  });

  it('does not turn an out-of-organ host rejection or exhausted budget into a success', () => {
    const rejected = fixture(), commands = plan(rejected).map(command => command.kind === 'log' ? command : { ...command, organId: 'lung' as const });
    rejected.host.applyGrowthCommands(commands);
    expect(rejected.neighbors.map(target => target.hp)).toEqual([68, 68, 68]);
    expect(actual(rejected.growth)).toEqual([]); expect(labels(rejected.session)).toEqual([]);
    const exhausted = fixture(); exhausted.growth.state.budgetTick = exhausted.session.state.tick; exhausted.growth.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    expect(plan(exhausted)).toEqual([]);
    expect(exhausted.growth.state.protocolHistory).toEqual([]);
    expect(exhausted.growth.state.skippedCommands).toBeGreaterThan(0);
  });

  it('rejects zero actual membrane loss, then numbers only the later accepted hop', () => {
    const f = coreFixture(100);
    expect(damage(f.commands).map(command => command.targetId)).toEqual(['protected-core', 'after-core']);
    f.host.applyGrowthCommands(f.commands);
    expect(f.core.hp).toBe(100); expect(f.neighbor.hp).toBe(30);
    const hits = f.session.state.events.filter(event => event.type === 'TARGET_HIT');
    expect(hits).toHaveLength(1); expect(hits[0].data).toMatchObject({ id: 'after-core', damage: 38, rootId: 'membrane-chain' });
    expect(actual(f.growth)).toHaveLength(1);
    expect(actual(f.growth)[0].text).toBe('连锁净化：实际命中 1 跳，共 38 点伤害。');
    expect(f.session.state.runMetrics!.summary.control.chainHops).toBe(1);
    expect(labels(f.session)).toEqual(['1']);
  });

  it('uses actual clipped HP loss rather than requested damage at a protected core', () => {
    const f = coreFixture(105);
    f.host.applyGrowthCommands(f.commands);
    expect(f.core.hp).toBe(100);
    expect(f.session.state.events.filter(event => event.type === 'TARGET_HIT').map(event => event.data.damage)).toEqual([5, 38]);
    expect(actual(f.growth)[0].text).toBe('连锁净化：实际命中 2 跳，共 43 点伤害。');
    expect(actual(f.growth)[0].text).not.toContain('76');
    expect(labels(f.session)).toEqual(['1', '2']);
  });

  it('reports two actual hops for a three-hop plan when the middle target disappears', () => {
    const f = fixture(), commands = plan(f);
    f.neighbors[0].hp = 5; f.neighbors[1].hp = 0;
    f.host.applyGrowthCommands(commands);
    expect(f.session.state.events.filter(event => event.type === 'TARGET_HIT').map(event => event.data.damage)).toEqual([5, 38]);
    expect(actual(f.growth)).toHaveLength(1);
    expect(actual(f.growth)[0].text).toBe('共振联动 · 连锁净化：实际命中 2 跳，共 43 点伤害。');
    expect(growthHistoryMarkup(f.session.state)).toContain('尝试 3 跳');
    expect(growthHistoryMarkup(f.session.state)).toContain('实际命中 2 跳');
    expect(labels(f.session)).toEqual(['1', '2']);
  });

  it('accumulates real normal multihop loss once and retains the original cap and no-recursion rules', () => {
    const f = fixture(); for (const target of f.neighbors) target.hp = 30;
    const commands = plan(f);
    expect(damage(commands).map(command => command.hop)).toEqual([1, 2, 3]);
    f.host.applyGrowthCommands(commands);
    expect(f.neighbors.every(target => target.hp === 0)).toBe(true);
    expect(f.session.state.events.filter(event => event.type === 'TARGET_HIT').map(event => event.data.damage)).toEqual([30, 30, 30]);
    expect(f.growth.state.chainRoots).toEqual(['accepted-chain']);
    expect(f.session.state.runMetrics!.summary.control).toMatchObject({ chainTriggers: 1, chainHops: 3, synergyPulseChain: 1 });
    expect(actual(f.growth)[0].text).toBe('共振联动 · 连锁净化：实际命中 3 跳，共 90 点伤害。');
    const logs = commands.filter((command): command is Extract<GrowthCommand, { kind: 'log' }> => command.kind === 'log');
    for (const log of logs) f.session.emit(log.type, log.data);
    expect(actual(f.growth)).toHaveLength(1); expect(actual(f.growth)[0].text).toContain('实际命中 3 跳，共 90');
    expect(f.session.state.runMetrics!.summary.control.chainHops).toBe(3);
  });

  it('requires matching tick, root, target, protocol, organ and a positive host receipt for visible hit markers', () => {
    const f = fixture(), commands = plan(f); f.host.applyGrowthCommands(commands);
    const event = f.session.state.events.find(event => event.type === 'PROTOCOL_CHAIN_HIT')!;
    expect(acceptedProtocolHit(event, f.session.state.events, 'heart')?.data.damage).toBe(38);
    for (const changed of [
      { ...event, tick: event.tick + 1 },
      { ...event, data: { ...event.data, rootId: 'other' } },
      { ...event, data: { ...event.data, targetId: 'other' } },
      { ...event, data: { ...event.data, protocolId: 'PULSE_BREAK' } },
    ] satisfies GameEvent[]) expect(acceptedProtocolHit(changed, f.session.state.events, 'heart')).toBeUndefined();
    expect(acceptedProtocolHit(event, f.session.state.events, 'lung')).toBeUndefined();
    const zero = f.session.state.events.map(hit => hit.type === 'TARGET_HIT' ? { ...hit, data: { ...hit.data, damage: 0 } } : hit);
    expect(acceptedProtocolHit(event, zero, 'heart')).toBeUndefined();
    const history = structuredClone(f.growth.state.protocolHistory);
    f.session.step(idle); f.session.emit(event.type, event.data);
    expect(f.growth.state.protocolHistory).toEqual(history);
  });

  it('keeps resonance and ricochet plans separate from their actual accepted damage', () => {
    const f = fixture(['PULSE_BREAK', 'PURIFY_CHAIN']);
    f.growth.state.equipped[1].rank = 3;
    const context = { ...growthContext(f.session.state), rhythm: 'surge' as const, rhythmCycle: 0, deviceOrigin: { x: 600, y: 400 }, player: { x: 600, y: 400 } };
    const target = f.neighbors[0]; target.hp = 5;
    f.growth.onHit(context, target); // First real-hit callback only charges the rankIII ricochet.
    const commands = f.growth.onHit(context, target);
    expect(damage(commands).some(command => command.protocolId === 'PURIFY_CHAIN')).toBe(true);
    // The pulse cycle was already reserved above; apply that original resonance
    // request through a separate ordinary fixture to test actual HP clamping.
    const pulse = fixture(['PULSE_BREAK']), pulseTarget = pulse.neighbors[0]; pulseTarget.hp = 5;
    const resonance = pulse.growth.onHit({ ...growthContext(pulse.session.state), rhythm: 'surge', rhythmCycle: 0, deviceOrigin: pulse.session.state.player }, pulseTarget);
    expect(actual(pulse.growth, 'PROTOCOL_RESONANCE_HIT')).toEqual([]);
    pulse.host.applyGrowthCommands(resonance);
    expect(actual(pulse.growth, 'PROTOCOL_RESONANCE_HIT')[0].text).toBe('节律共振：实际追加 5 点伤害（1 体）。');
    f.neighbors[1].hp = 7;
    f.host.applyGrowthCommands(commands);
    expect(actual(f.growth, 'PROTOCOL_RICOCHET_HIT')[0].text).toBe('连锁进阶：实际折射 1 体，共 7 点伤害。');
    expect(f.growth.state.protocolHistory.some(entry => entry.type === 'PROTOCOL_RICOCHET_PLANNED' && entry.text.includes('尝试折射'))).toBe(true);
  });
});
