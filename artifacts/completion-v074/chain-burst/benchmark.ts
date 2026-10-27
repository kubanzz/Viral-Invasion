import { GameSession } from '../../../src/game/session';
import { GrowthController, growthContext } from '../../../src/game/growth';
import { GROWTH_BALANCE, getPulseConfig } from '../../../src/game/protocols';
import { BATTLE_BALANCE } from '../../../src/game/battleConfig';
import { Renderer } from '../../../src/render/renderer';
import type { DamageOrigin, GrowthCommand } from '../../../src/game/growthTypes';
import type { GameEvent, Target } from '../../../src/game/types';

type Scenario = 'cap24-hits100' | 'cap24-resonance-recursion100' | 'overcap100-clears100';
type Quality = 'standard' | 'low';
interface PrivateSessionTestAdapter {
  growthController: GrowthController;
  damage(target: Target, amount: number, origin?: DamageOrigin): void;
  applyGrowthCommands(commands: readonly GrowthCommand[]): void;
}
interface Counts {
  requestedBasicHits: number; acceptedBasicHits: number; acceptedProtocolHits: number; acceptedBasicClears: number;
  protocolClears: number; damageCalls: number; maxDamageDepth: number; applyCalls: number; maxApplyDepth: number;
  onHitCallbacks: number; onKillCallbacks: number; chainKillCallbacks: number; chainKillReturnedCommands: number;
  generatedCommands: number; generatedDamageCommands: number; maxHop: number; observedThreeHopRoots: number;
  budgetUsed: number; skippedBeforeFlush: number; budgetSkippedEvents: number;
  emittedEvents: number; effects: number; liveAfter: number; actorsBefore: number; maxMetricEntries: number; metricsLimited: boolean;
}
const scenarios: Scenario[] = ['cap24-hits100', 'cap24-resonance-recursion100', 'overcap100-clears100'];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sourceTarget = (id: string, index: number, hp = 1_000_000): Target => ({
  id, x: 590 + index % 10 * 17, y: 360 + Math.floor(index / 10) * 17,
  role: 'virus', kind: 'single', hp, maxHp: hp, radius: 14, hitUntil: 0, scanned: false, traits: [], generation: 0,
});

/**
 * Explicit isolated mechanism fixture. This page never imports main.ts and has
 * no access to a user's running app, archive, storage, network or formal run.
 * The adapter only observes and delegates real production private methods.
 * It does not implement damage acceptance, recursion, chain or budget rules.
 */
function createFixture(scenario: Scenario, serial: number) {
  const session = new GameSession(740000 + serial, { campaign: true, milestone: 'G2', encounterMode: 'fixture', counterGuide: 'adaptive' });
  session.start();
  const host = session as unknown as PrivateSessionTestAdapter;
  const growth = host.growthController, state = session.state;
  assert(growth instanceof GrowthController, 'The production session must own the actual GrowthController.');
  assert(state.battle?.encounter?.configId === 'fixture-1', 'Benchmark must never become a formal encounter.');
  state.tick = 132; state.elapsed = 2.2; state.tool = 1;
  Object.assign(state.player, { x: 730, y: 230 });
  Object.assign(state.battle!.pulse, { phase: 'surge', cycleIndex: 0 });
  growth.state.equipped = [{ id: 'PULSE_BREAK', tuning: 'focused', rank: 3 }, { id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 3 }];
  state.targets = Array.from({ length: scenario === 'overcap100-clears100' ? 100 : BATTLE_BALANCE.maxActors }, (_, index) => sourceTarget(`preset-${serial}-${index}`, index));
  if (scenario === 'cap24-resonance-recursion100') {
    // The first accepted basic hit leaves less HP than a real resonance bonus.
    // Three-hop protocol kills then return through real session.damage/onKill.
    state.targets[0].hp = getPulseConfig('focused', 3).bonusDamage;
    for (const target of state.targets.slice(1, -1)) target.hp = 20;
    state.targets.at(-1)!.hp = 1_000_000;
  }
  if (scenario === 'overcap100-clears100') for (const target of state.targets) target.exposedUntil = state.elapsed + 4;
  state.effects = []; state.events = [];
  const counts: Counts = { requestedBasicHits: 0, acceptedBasicHits: 0, acceptedProtocolHits: 0, acceptedBasicClears: 0,
    protocolClears: 0, damageCalls: 0, maxDamageDepth: 0, applyCalls: 0, maxApplyDepth: 0,
    onHitCallbacks: 0, onKillCallbacks: 0, chainKillCallbacks: 0, chainKillReturnedCommands: 0,
    generatedCommands: 0, generatedDamageCommands: 0, maxHop: 0, observedThreeHopRoots: 0,
    budgetUsed: 0, skippedBeforeFlush: 0, budgetSkippedEvents: 0, emittedEvents: 0, effects: 0, liveAfter: 0,
    actorsBefore: state.targets.length, maxMetricEntries: 0, metricsLimited: false };
  const receipts: Array<{ type: string; tick: number; data: GameEvent['data'] }> = [];
  const commandKinds: Record<string, number> = {}, generatedRootHops = new Map<string, number>();
  let damageDepth = 0, applyDepth = 0;
  const actualDamage = host.damage.bind(session), actualApply = host.applyGrowthCommands.bind(session), actualEmit = session.emit.bind(session);
  const actualOnHit = growth.onHit.bind(growth), actualOnKill = growth.onKill.bind(growth);
  const observeCommands = (commands: readonly GrowthCommand[]) => {
    counts.generatedCommands += commands.length;
    for (const command of commands) {
      commandKinds[command.kind] = (commandKinds[command.kind] ?? 0) + 1;
      if (command.kind === 'damage') {
        counts.generatedDamageCommands++; counts.maxHop = Math.max(counts.maxHop, command.hop);
        if (command.protocolId === 'PURIFY_CHAIN') generatedRootHops.set(command.rootId, Math.max(generatedRootHops.get(command.rootId) ?? 0, command.hop));
      }
    }
  };
  growth.onHit = (...args) => { counts.onHitCallbacks++; const commands = actualOnHit(...args); observeCommands(commands); return commands; };
  growth.onKill = (...args) => {
    counts.onKillCallbacks++;
    const chainOrigin = args[2]?.cause === 'protocol' && args[2]?.protocolId === 'PURIFY_CHAIN';
    if (chainOrigin) counts.chainKillCallbacks++;
    const commands = actualOnKill(...args);
    if (chainOrigin) counts.chainKillReturnedCommands += commands.length;
    observeCommands(commands); return commands;
  };
  host.damage = (target, amount, origin) => {
    counts.damageCalls++; counts.maxDamageDepth = Math.max(counts.maxDamageDepth, ++damageDepth);
    try { actualDamage(target, amount, origin); }
    finally { damageDepth--; }
  };
  host.applyGrowthCommands = commands => {
    counts.applyCalls++; counts.maxApplyDepth = Math.max(counts.maxApplyDepth, ++applyDepth);
    try { actualApply(commands); } finally { applyDepth--; }
  };
  session.emit = (type, data) => {
    actualEmit(type, data); // Production reducer and accepted callbacks run first.
    counts.emittedEvents++;
    if (type === 'TARGET_HIT' && Number(data.damage) > 0) {
      if (data.cause === 'basic') counts.acceptedBasicHits++; else if (data.cause === 'protocol') counts.acceptedProtocolHits++;
      if (data.remainingHp === 0) {
        if (data.cause === 'basic') counts.acceptedBasicClears++; else if (data.cause === 'protocol') counts.protocolClears++;
      }
    }
    if (type === 'PROTOCOL_BUDGET_SKIPPED') counts.budgetSkippedEvents++;
    counts.maxMetricEntries = Math.max(counts.maxMetricEntries, state.runMetrics?.frame.entries.length ?? 0);
    if (receipts.length < 512) receipts.push({ type, tick: state.tick, data: { ...data } });
  };
  const inputs = Array.from({ length: 100 }, (_, index) => ({
    target: scenario === 'cap24-resonance-recursion100' ? index === 0 ? state.targets[0] : state.targets.at(-1)! : state.targets[index % state.targets.length],
    amount: scenario === 'overcap100-clears100' ? 1_000_000 : 1,
    origin: { cause: 'basic' as const, rootId: `${scenario}:${serial}:basic:${index}` },
  }));
  const execute = () => {
    // All 100 real damage calls and their recursive callbacks share one tick,
    // one JS turn and one RAF callback. They are not concurrent JS threads.
    for (const input of inputs) { counts.requestedBasicHits++; host.damage(input.target, input.amount, input.origin); }
    counts.budgetUsed = growth.state.budgetUsed; counts.skippedBeforeFlush = growth.state.skippedCommands;
    host.applyGrowthCommands(growth.afterInput(growthContext(state)));
    counts.observedThreeHopRoots = [...generatedRootHops.values()].filter(hop => hop === 3).length;
    counts.effects = state.effects.length; counts.liveAfter = state.targets.filter(target => target.hp > 0).length;
    counts.metricsLimited = state.runMetrics?.summary.limited ?? true;
    assert(counts.requestedBasicHits === 100 && counts.acceptedBasicHits === 100, 'All 100 input events must have actual positive basic HP-loss receipts.');
    assert(counts.generatedCommands <= GROWTH_BALANCE.commandBudget && counts.budgetUsed <= GROWTH_BALANCE.commandBudget, 'Production protocol command budget was exceeded.');
    assert(counts.maxHop <= GROWTH_BALANCE.chainCap && counts.maxHop <= 3, 'A real generated damage command exceeded the configured chain cap.');
    assert(counts.chainKillReturnedCommands === 0, 'A PURIFY_CHAIN kill recursively generated another protocol chain.');
    assert(damageDepth === 0 && applyDepth === 0 && counts.maxDamageDepth <= 3, 'Production callback stack did not unwind within the expected basic→resonance→chain path.');
    assert(counts.maxMetricEntries <= 256 && !counts.metricsLimited, 'Accepted metrics became incomplete or unbounded.');
    if (scenario === 'cap24-resonance-recursion100') assert(counts.chainKillCallbacks > 0 && counts.protocolClears > 0 && counts.observedThreeHopRoots > 0, 'The recursive kill path must actually execute.');
    if (scenario === 'overcap100-clears100') assert(counts.acceptedBasicClears === 100 && counts.skippedBeforeFlush > 0 && counts.budgetSkippedEvents > 0, 'The over-cap mechanism fixture must really clear 100 targets and exercise production budget rejection.');
    return { counts, commandKinds, receipts, acceptedMetrics: state.runMetrics?.summary };
  };
  return { session, state, execute };
}

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, minimum: sorted[0], median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)], maximum: sorted.at(-1),
    mean: values.reduce((total, value) => total + value, 0) / values.length };
};
const canvas = document.querySelector<HTMLCanvasElement>('#bench-canvas')!;
const status = document.querySelector<HTMLElement>('#status')!;
const renderer = new Renderer(canvas);
const warm = createFixture('cap24-hits100', 0);
renderer.render(warm.state, warm.state.player);
status.textContent = '隔离机制工具已加载；尚未运行 100 事件测量。';

async function run(options: { samples?: number; warmups?: number } = {}) {
  const samples = options.samples ?? 60, warmups = options.warmups ?? 6;
  assert(Number.isInteger(samples) && samples >= 20 && samples <= 120, 'Use 20–120 bounded measured samples per case.');
  assert(Number.isInteger(warmups) && warmups >= 2 && warmups <= 20, 'Use 2–20 bounded warmups per case.');
  const output = [];
  let serial = 1;
  for (const quality of ['standard', 'low'] as Quality[]) for (const scenario of scenarios) {
    const rows: Array<{ index: number; mechanismCpuMs: number; renderCpuMs: number; totalSyncCpuMs: number; nextRafIntervalMs: number; baselineRafIntervalMs: number;
      counts: Counts; firstSampleDetail?: ReturnType<ReturnType<typeof createFixture>['execute']> }> = [];
    const baseline: number[] = [];
    status.textContent = `${scenario} / ${quality}；100 个同 tick 事件；${scenario.startsWith('overcap') ? '100 对象超上限机制夹具，非正常战役' : '24 对象机制夹具'}。`;
    for (let index = -warmups; index < samples; index++) {
      assert(!document.hidden, 'A hidden document cannot provide meaningful RAF timing.');
      const fixture = createFixture(scenario, serial++);
      const baselineFrameAt = await nextFrame();
      const baselineAt = performance.now(); renderer.render(fixture.state, fixture.state.player, { lowEffects: quality === 'low' });
      const baselineCpuMs = performance.now() - baselineAt;
      const frameAt = await nextFrame();
      const begin = performance.now(), detail = fixture.execute(), mechanismEnd = performance.now();
      renderer.render(fixture.state, fixture.state.player, { lowEffects: quality === 'low' });
      const syncEnd = performance.now(), nextAt = await nextFrame();
      if (index >= 0) {
        baseline.push(baselineCpuMs);
        rows.push({ index, mechanismCpuMs: mechanismEnd - begin, renderCpuMs: syncEnd - mechanismEnd, totalSyncCpuMs: syncEnd - begin,
          nextRafIntervalMs: nextAt - frameAt, baselineRafIntervalMs: frameAt - baselineFrameAt, counts: detail.counts,
          ...(index === 0 ? { firstSampleDetail: detail } : {}) });
      }
    }
    const timing = Object.fromEntries((['mechanismCpuMs', 'renderCpuMs', 'totalSyncCpuMs', 'nextRafIntervalMs'] as const).map(key => [key, quantiles(rows.map(row => row[key]))]));
    output.push({ scenario, quality, actorFixture: scenario.startsWith('overcap') ? 'Explicit100-target over-cap mechanism fixture; never a production spawning claim.' : '24-target isolated fixture;100 events share the tick.',
      sampleCount: samples, warmupCount: warmups, baselineRenderCpuMs: quantiles(baseline), timing,
      baselineRafIntervalMs: quantiles(rows.map(row => row.baselineRafIntervalMs)),
      provisionalTimingAssessment: { definition: 'Declared diagnostic targets only; AC-M08-04 itself does not specify millisecond limits.',
        totalSyncP95Within33ms: timing.totalSyncCpuMs.p95 <= 33, nextRafP95Within50ms: timing.nextRafIntervalMs.p95 <= 50,
        totalSyncMaximumWithin100ms: timing.totalSyncCpuMs.maximum! <= 100, nextRafMaximumWithin100ms: timing.nextRafIntervalMs.maximum! <= 100 }, rows });
  }
  status.textContent = '隔离机制测量结束；原始逐帧样本与宿主接受回执已就绪。';
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), scenarioCount: output.length, requestedEventsPerSample: 100,
    productionActorCap: BATTLE_BALANCE.maxActors, productionCommandBudget: GROWTH_BALANCE.commandBudget, productionChainCap: GROWTH_BALANCE.chainCap,
    environment: { userAgent: navigator.userAgent, devicePixelRatio, width: innerWidth, height: innerHeight, hidden: document.hidden },
    method: 'Isolated local HTML imports actual GameSession/GrowthController/Renderer without main.ts. Explicit test adapters observe then delegate actual private session.damage/applyGrowthCommands and real emit/reducer/callback methods.100 accepted positive-HP-loss basic damage inputs execute in one JS turn/tick/RAF callback per sample.',
    setupScope: 'Session construction and explicit preset arrangement occur before the measured RAF. Baseline render warms the real renderer. Measured synchronous CPU includes production damage callbacks, assertion instrumentation, accepted telemetry, and subsequent real renderer.render.',
    limitations: ['This is an explicit isolated mechanism benchmark, not natural input, formal progression, a live-game state injection, an ordinary campaign100-actor load, or human evidence.',
      'The100-clear case deliberately exceeds the normal24-actor cap and is labelled separately. The two other cases use24 actors with100 incoming events, not100 simultaneous actors.',
      'RAF intervals observe browser scheduling/compositing opportunities. Canvas call CPU and RAF do not measure GPU completion or prove every target device meets a frame budget.',
      'Finite repeat samples and bounded maximum callback depth show the measured paths terminate. They do not prove all conceivable configurations or provide a machine-checked no-recursion theorem.',
      'Instrumentation adds observation and assertion overhead. There is no claim that measured CPU is a bare production frame; no uninstrumented FPS substitution is made.',
      'No AI, world tick, input cooldown, spawning, full-game progression, persistence, long-session memory or gameplay balance is validated.'], cases: output };
}

Object.defineProperty(window, '__isolatedChainBurst', { value: { run, prepared: true }, writable: false });
