import { describe, expect, it } from 'vitest';
import { createRunMetrics, formatRunMetrics, parseRunMetricsSummary, reduceRunMetrics, RUN_METRICS_FRAME_LIMIT, summarizeRunMetrics } from '../../src/game/runMetrics';
import type { GameEvent } from '../../src/game/types';

type Data = GameEvent['data'];
const event = (type: string, data: Data = {}, tick = 10): GameEvent => ({ type, data, tick });
function run(runId = 'run-a') {
  let current = createRunMetrics(runId), sequence = 0;
  return {
    get state() { return current; },
    send(type: string, data: Data = {}, tick = 10) {
      current = reduceRunMetrics(current, { runId, sequence: sequence++, event: event(type, data, tick) });
      return current;
    },
    hit(rootId: string, targetId: string, protocolId: string, tick = 10, damage = 5) {
      return this.send('TARGET_HIT', { cause: 'protocol', damage, organId: 'heart', rootId, id: targetId, protocolId }, tick);
    },
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('accepted run outcome counters', () => {
  it('counts exact repair increases, actual tissue losses and active costs separately', () => {
    const r = run();
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 93, after: 100, reason: 'repair' });
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 100, after: 100, reason: 'repair' });
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'lung', before: 75, after: 82.5, reason: 'repair' });
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'lung', before: 82.5, after: 79.5, reason: 'pulse-pressure' });
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 100, after: 95, reason: 'enemy' });
    for (const reason of ['protocol-pressure', 'airway-pressure', 'migration-block-pressure']) {
      r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 95, after: 94, reason });
    }
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 94, after: 96, reason: 'unrelated-increase' });
    r.send('PLAYER_HURT', { damage: 2.5 }); r.send('PLAYER_HURT', { damage: 0 });
    r.send('PLAYER_HEALED', { amount: 15 });
    expect(r.state.summary.care).toEqual({ repairActions: 2, repaired: 14.5, organLoss: 11, organCost: 6, playerDamage: 2.5,
      organs: { heart: { repairActions: 1, repaired: 7, loss: 8, cost: 3 }, lung: { repairActions: 1, repaired: 7.5, loss: 3, cost: 3 } } });
    expect(parseRunMetricsSummary(summarizeRunMetrics(r.state))).toEqual(r.state.summary);
  });

  it('joins actual positive protocol hits to their exact logs and keeps trigger units distinct', () => {
    const r = run();
    for (const [rootId, targetId, hop] of [['chain-a', 'one', 1], ['chain-a', 'two', 2], ['chain-b', 'three', 1]] as const) {
      r.hit(rootId, targetId, 'PURIFY_CHAIN');
      r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId, targetId, hop, damage: 999 });
    }
    r.send('PROTOCOL_SYNERGY', { pair: 'PULSE_BREAK+PURIFY_CHAIN', rootId: 'chain-a', hops: 99 });
    r.hit('rebound', 'one', 'PURIFY_CHAIN');
    r.send('PROTOCOL_RICOCHET_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'rebound', targetId: 'one', damage: 999 });
    r.hit('resonance', 'one', 'PULSE_BREAK');
    r.send('PROTOCOL_RESONANCE_HIT', { protocolId: 'PULSE_BREAK', rootId: 'resonance', targetId: 'one', bonus: 999 });
    for (const rootId of ['bite-a', 'bite-b']) {
      r.hit(rootId, 'marked', 'IMMUNE_BEACON');
      r.send('PROTOCOL_BEACON_HIT', { protocolId: 'IMMUNE_BEACON', rootId, targetId: 'marked' });
      r.send('PROTOCOL_SYNERGY', { pair: 'EXPOSE_TRACE+IMMUNE_BEACON', rootId, targetId: 'marked' });
    }
    r.hit('patrol', 'nearby', 'IMMUNE_BEACON');
    r.send('IMMUNE_PATROL_HIT', { protocolId: 'BASE_PATROL', rootId: 'patrol', targetId: 'nearby' });
    expect(r.state.summary.control).toMatchObject({ chainTriggers: 2, chainHops: 3, ricochetHits: 1, resonanceHits: 1,
      beaconBites: 2, patrolBites: 1, synergyPulseChain: 1, synergyTraceBeacon: 2 });
  });

  it('rejects requested damage, zero loss, mismatched roots, targets, protocol labels and old-tick proof', () => {
    const r = run();
    r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'planned', targetId: 'target', hop: 1, damage: 30 });
    r.hit('zero', 'target', 'PURIFY_CHAIN', 10, 0);
    r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'zero', targetId: 'target', hop: 1 });
    r.hit('root', 'target', 'PURIFY_CHAIN');
    for (const data of [
      { protocolId: 'PURIFY_CHAIN', rootId: 'other-root', targetId: 'target', hop: 1 },
      { protocolId: 'PURIFY_CHAIN', rootId: 'root', targetId: 'other-target', hop: 1 },
      { protocolId: 'PULSE_BREAK', rootId: 'root', targetId: 'target', hop: 1 },
      { protocolId: 'PURIFY_CHAIN', rootId: 'root', targetId: 'target', hop: 0 },
      { protocolId: 'PURIFY_CHAIN', rootId: 'root', targetId: 'target', hop: 4 },
    ]) r.send('PROTOCOL_CHAIN_HIT', data);
    r.send('PROTOCOL_BEACON_HIT', { protocolId: 'IMMUNE_BEACON', rootId: 'root', targetId: 'target' });
    r.send('PROTOCOL_SYNERGY', { pair: 'PULSE_BREAK+PURIFY_CHAIN', rootId: 'root' });
    r.send('PROTOCOL_SYNERGY', { pair: 'EXPOSE_TRACE+IMMUNE_BEACON', rootId: 'root', targetId: 'target' });
    r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'root', targetId: 'target', hop: 1 }, 11);
    expect(r.state.summary.control).toEqual(createRunMetrics('empty').summary.control);
  });

  it('does not double-count repeated hit logs, chain roots or synergy logs with new envelope sequences', () => {
    const r = run();
    for (let i = 0; i < 3; i++) {
      r.hit('chain', 'one', 'PURIFY_CHAIN');
      r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'chain', targetId: 'one', hop: 1 });
      r.send('PROTOCOL_SYNERGY', { pair: 'PULSE_BREAK+PURIFY_CHAIN', rootId: 'chain' });
      r.hit('bite', 'marked', 'IMMUNE_BEACON');
      r.send('PROTOCOL_BEACON_HIT', { protocolId: 'IMMUNE_BEACON', rootId: 'bite', targetId: 'marked' });
      r.send('PROTOCOL_SYNERGY', { pair: 'EXPOSE_TRACE+IMMUNE_BEACON', rootId: 'bite', targetId: 'marked' });
    }
    expect(r.state.summary.control).toMatchObject({ chainTriggers: 1, chainHops: 1, synergyPulseChain: 1, beaconBites: 1, synergyTraceBeacon: 1 });
    expect(r.state.frame.entries).toHaveLength(6);
  });

  it('deduplicates envelope sequence, rejects other runs and backward ticks, and freezes on end', () => {
    const initial = createRunMetrics('a');
    const first = reduceRunMetrics(initial, { runId: 'a', sequence: 3, event: event('PLAYER_HURT', { damage: 8 }, 10) });
    for (const input of [
      { runId: 'a', sequence: 3, event: event('PLAYER_HURT', { damage: 99 }, 10) },
      { runId: 'a', sequence: 2, event: event('PLAYER_HURT', { damage: 99 }, 11) },
      { runId: 'b', sequence: 4, event: event('PLAYER_HURT', { damage: 99 }, 11) },
      { runId: 'a', sequence: 4, event: event('PLAYER_HURT', { damage: 99 }, 9) },
    ]) expect(reduceRunMetrics(first, input)).toBe(first);
    const ended = reduceRunMetrics(first, { runId: 'a', sequence: 4, event: event('RUN_ENDED', {}, 11) });
    expect(ended.ended).toBe(true); expect(ended.frame.entries).toEqual([]);
    expect(reduceRunMetrics(ended, { runId: 'a', sequence: 5, event: event('PLAYER_HURT', { damage: 99 }, 12) })).toBe(ended);
    expect(createRunMetrics('retry').summary).toEqual(initial.summary);
    expect(ended.summary.care.playerDamage).toBe(8);
  });

  it('keeps factual diagnosis, environment, migration and core outcomes without claiming prevention', () => {
    const r = run();
    r.send('EVOLUTION_WARNING', { trait: 'CARAPACE' });
    r.send('GROWTH_REWARD', { key: 'diagnose:CARAPACE', xp: 8, research: 1 });
    r.send('GROWTH_REWARD', { key: 'diagnose:CARAPACE', xp: 8, research: 1 });
    r.send('GROWTH_REWARD', { key: 'diagnose:MIMIC', xp: 0, research: 0 });
    r.send('GROWTH_REWARD', { key: 'diagnose:FISSION', xp: 0, research: 1 });
    r.send('SCAN_COMPLETED', { found: 0 }); r.send('SCAN_COMPLETED', { found: 4 });
    r.send('PULSE_TRIGGERED', { organId: 'heart', pushed: 50, exposed: 2, coreHit: true });
    r.send('PULSE_TRIGGERED', { organId: 'lung', pushed: 40, exposed: 1, coreHit: false });
    r.send('AIRWAY_CHANGED', { organId: 'lung', open: false }); r.send('AIRWAY_CHANGED', { organId: 'lung', open: true });
    r.send('ORGAN_CRISIS_INTERRUPTED', { organId: 'heart', sourceId: 'crisis', reason: 'pulse', interruptions: 17 });
    r.send('ORGAN_CRISIS_INTERRUPTED', { organId: 'lung', sourceId: 'crisis', reason: 'airway', interruptions: 20 });
    r.send('ORGAN_CRISIS_INTERRUPTED', { organId: 'heart', sourceId: 'crisis', reason: 'airway', interruptions: 99 });
    r.send('MIGRATION_DECIDED', { choice: 'pursue' }); r.send('MIGRATION_INTERCEPTED', { by: 'clear' });
    r.send('CORE_MEMBRANE_BROKEN', { trait: 'CARAPACE', coreId: 'core' });
    r.send('CORE_MEMBRANE_BROKEN', { trait: 'CARAPACE', coreId: 'core' });
    r.send('CORE_CORROSION_INTERRUPTED', { coreId: 'core', attackId: 'attack', by: 'scan' });
    r.send('CORE_CLEARED', { coreId: 'core' }); r.send('CAMPAIGN_CORE_CLEARED', { coreId: 'core' });
    expect(r.state.summary.control).toMatchObject({ diagnosedTraits: ['CARAPACE', 'FISSION'], scans: 2, pulseUses: 2,
      crystalExposures: 3, corePulseHits: 1, airwayCloses: 1, airwayOpens: 1, crisisPulseInterrupts: 1,
      crisisAirwayInterrupts: 1, migrationChoice: 'pursue', migrationInterception: 'clear', migrationMissed: false,
      coreMembranes: ['CARAPACE'], coreScanInterrupts: 1, coreCleared: true });
    expect(r.state.summary.care.repaired).toBe(0);
    const text = formatRunMetrics(summarizeRunMetrics(r.state));
    expect(text.details.join('')).toContain('不折算避免伤害');
    expect(text.details.join('')).not.toMatch(/避免了|推开 90|新感染源|S 级/);
  });

  it('labels a missed migration only as an interception outcome, not proof of a spawned source', () => {
    const r = run(); r.send('MIGRATION_DECIDED', { choice: 'ignore' }); r.send('MIGRATION_ESTABLISHED', { reason: 'intercept-expired' });
    expect(r.state.summary.control.migrationMissed).toBe(true);
    const migration = formatRunMetrics(r.state.summary).details.find(line => line.startsWith('迁移'));
    expect(migration).toBe('迁移：放任；本次未截住迁移。');
    expect(migration).not.toMatch(/已建立|感染源/);
  });

  it('retains aggregate facts beyond raw-log sized traffic without keeping event or root histories', () => {
    const r = run();
    r.send('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 90, after: 100, reason: 'repair' }, 0);
    for (let tick = 1; tick <= 900; tick++) r.send('TOOL_SELECTED', { tool: tick % 3 + 1 }, tick);
    expect(r.state.summary.care.repaired).toBe(10);
    expect(r.state.summary.limited).toBe(false); expect(r.state.frame.entries).toEqual([]);
    expect(JSON.stringify(summarizeRunMetrics(r.state))).not.toMatch(/TOOL_SELECTED|run-a|lastSequence|frame|rootId|tick/);
    expect(JSON.stringify(summarizeRunMetrics(r.state)).length).toBeLessThan(2000);
  });

  it('bounds same-tick proof joins, marks incomplete data and resumes proof on the next tick', () => {
    const r = run();
    for (let i = 0; i < RUN_METRICS_FRAME_LIMIT + 80; i++) r.hit(`root-${i}`, `target-${i}`, 'PURIFY_CHAIN');
    expect(r.state.frame.entries).toHaveLength(RUN_METRICS_FRAME_LIMIT);
    expect(r.state.summary.limited).toBe(true);
    r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'root-0', targetId: 'target-0', hop: 1 });
    expect(r.state.summary.control.chainHops).toBe(0);
    r.hit('next-tick', 'target', 'PURIFY_CHAIN', 11);
    r.send('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'next-tick', targetId: 'target', hop: 1 }, 11);
    expect(r.state.frame.entries).toHaveLength(2);
    expect(r.state.summary.control.chainHops).toBe(1);
    expect(formatRunMetrics(r.state.summary).notice).toBe('本局统计不完整，以下仅显示已记录事实。');
  });

  it('marks positive protocol loss missing accepted attribution as incomplete and ignores malformed facts', () => {
    const r = run();
    r.send('TARGET_HIT', { cause: 'protocol', damage: 5, id: 'target' });
    for (const data of [{ organId: 'brain', before: 50, after: 70, reason: 'repair' },
      { organId: 'heart', before: -1, after: 40, reason: 'repair' },
      { organId: 'heart', before: 90, after: Infinity, reason: 'repair' }]) r.send('ORGAN_INTEGRITY_CHANGED', data);
    r.send('PLAYER_HURT', { damage: NaN }); r.send('PLAYER_HURT', { damage: -4 }); r.send('PLAYER_HURT', { damage: 101 });
    r.send('CORE_CORROSION_INTERRUPTED', { coreId: 'core', by: 'scan' });
    expect(r.state.summary.care).toEqual(createRunMetrics('empty').summary.care);
    expect(r.state.summary.control.coreScanInterrupts).toBe(0); expect(r.state.summary.limited).toBe(true);
  });

  it('does not mutate frozen previous states, event envelopes or exported summaries', () => {
    const previous = freeze(createRunMetrics('a'));
    const accepted = freeze({ runId: 'a', sequence: 0, event: event('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 90, after: 100, reason: 'repair' }) });
    const next = reduceRunMetrics(previous, accepted);
    expect(previous.summary.care.repaired).toBe(0); expect(next.summary.care.repaired).toBe(10);
    const exported = summarizeRunMetrics(next); exported.care.organs.heart.repaired = 999; exported.control.coreMembranes.push('MIMIC');
    expect(next.summary.care.organs.heart.repaired).toBe(10); expect(next.summary.control.coreMembranes).toEqual([]);
    const hit = freeze(reduceRunMetrics(freeze(next), freeze({ runId: 'a', sequence: 1, event: event('TARGET_HIT', { cause: 'protocol', damage: 2,
      organId: 'heart', rootId: 'root', id: 'target', protocolId: 'PURIFY_CHAIN' }) })));
    const logged = reduceRunMetrics(hit, freeze({ runId: 'a', sequence: 2, event: event('PROTOCOL_CHAIN_HIT', { protocolId: 'PURIFY_CHAIN', rootId: 'root', targetId: 'target', hop: 1 }) }));
    expect(hit.frame.entries).toHaveLength(1); expect(logged.frame.entries).toHaveLength(2);
    expect(hit.summary.control.chainHops).toBe(0); expect(logged.summary.control.chainHops).toBe(1);
  });
});

describe('bounded profile summary and factual result text', () => {
  it('restores only the whitelisted DTO and never restores caches or arbitrary object keys', () => {
    const raw = { ...summarizeRunMetrics(createRunMetrics('live')), frame: { entries: ['secret'] }, runId: 'live' };
    Object.assign(raw.care, { arbitrary: 2 }); Object.assign(raw.control, { rootId: 'secret' });
    const parsed = parseRunMetricsSummary(raw)!;
    expect(parsed).toEqual(summarizeRunMetrics(createRunMetrics('clean')));
    expect(JSON.stringify(parsed)).not.toMatch(/secret|arbitrary|runId|frame/);
    parsed.care.organs.heart.repaired = 5; parsed.control.coreMembranes.push('MIMIC');
    expect(raw.care.organs.heart.repaired).toBe(0); expect(raw.control.coreMembranes).toEqual([]);
  });

  it('rejects missing, malformed and inconsistent profile metrics rather than inventing zeros', () => {
    const valid = summarizeRunMetrics(createRunMetrics('a'));
    const changes: Array<(value: typeof valid) => void> = [
      value => { value.schemaVersion = 2 as 1; },
      value => { delete (value.control as Partial<typeof value.control>).scans; },
      value => { value.care.repaired = NaN; },
      value => { value.care.playerDamage = Infinity; },
      value => { value.care.repairActions = -1; },
      value => { value.care.organCost = 2; },
      value => { value.care.repaired = 8; },
      value => { value.control.chainHops = .5; },
      value => { value.control.chainTriggers = 1; },
      value => { value.control.synergyPulseChain = 1; },
      value => { value.control.synergyTraceBeacon = 1; },
      value => { value.control.corePulseHits = 1; },
      value => { value.control.diagnosedTraits = ['MIMIC', 'MIMIC']; },
      value => { value.control.coreMembranes = ['UNKNOWN' as 'MIMIC']; },
      value => { value.control.migrationChoice = 'wrong' as 'block'; },
      value => { value.control.migrationInterception = 'wrong' as 'clear'; },
    ];
    for (const change of changes) { const malformed = structuredClone(valid); change(malformed); expect(parseRunMetricsSummary(malformed)).toBeUndefined(); }
    for (const missing of [undefined, null, {}, [], { schemaVersion: 1 }]) expect(parseRunMetricsSummary(missing)).toBeUndefined();
    const unrecorded = formatRunMetrics(undefined);
    expect(unrecorded.care).toContain('未记录'); expect(unrecorded.control).toContain('未记录');
    expect(unrecorded.care + unrecorded.control).not.toContain('0'); expect(unrecorded.notice).toContain('未将缺失记录填为零');
  });

  it('keeps compact primary text factual and explains trigger, hop, ricochet and bite units', () => {
    const r = run(); r.send('PLAYER_HURT', { damage: 7 });
    const text = formatRunMetrics(r.state.summary);
    expect(text.care).toBe('有效修复 0 点 · 0 次；受击 7 点');
    expect(text.control).toBe('连锁 0 次 / 0 跳；折射 0 次');
    expect(text.care.length).toBeLessThanOrEqual(35); expect(text.control.length).toBeLessThanOrEqual(35);
    expect(text.chainDefinition).toMatch(/真实邻体正伤害/); expect(text.chainDefinition).toMatch(/进阶折射单列/);
    expect(text.chainDefinition).toMatch(/不按整队轮次计/);
    expect(JSON.stringify(text)).not.toMatch(/S 级|A 级|趣味评分|规避伤害|有效治疗率/);
    expect(text.notice).toBe('');
  });
});
