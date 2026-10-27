import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target } from '../../src/game/types';
import type { ProtocolId } from '../../src/game/growthTypes';

const evidenceDirectory = process.env.VI_SYNERGY_REPORT_DIR ?? 'artifacts/completion-v074/chain-audit';

// Explicit isolated preset arena: waves are loaded by the fixture, not earned
// in a formal campaign. Every trigger, cooldown, damage and synergy receipt is
// produced by normal fixed-step InputFrame actions and the real common host.
// No event, HP loss, elapsed time, protocol command or victory is fabricated.
const actor = (id: string, x: number, y: number, hp = 1000): Target => ({ id, x, y, hp, maxHp: hp, role: 'virus', kind: 'single', radius: 22,
  hitUntil: 0, scanned: false, traits: [], generation: 0, attackReady: 1e9 });
const idle = (aim = { x: 700, y: 400 }): InputFrame => ({ moveX: 0, moveY: 0, aim, tool: 1, fire: false, scan: false, interact: false });
function preset(ids: ProtocolId[], player = { x: 600, y: 400 }) {
  const session = new GameSession(1704, { campaign: true, milestone: 'G2', encounterMode: 'fixture' }); session.start();
  Object.assign(session.state.player, player);
  session.state.growth!.equipped = ids.map(id => ({ id, tuning: 'balanced' }));
  session.state.targets = [];
  // Autonomous source pressure is outside these two controlled pair experiments.
  for (const node of session.state.battle!.graph.nodes) if (node.kind === 'source') node.active = false;
  return session;
}
function waitUntil(session: GameSession, predicate: () => boolean, maxSteps = 1000) {
  for (let step = 0; step < maxSteps && !predicate(); step++) {
    expect(session.state.phase).toBe('playing'); session.step(idle());
  }
  expect(predicate()).toBe(true);
}
function positiveJoins(session: GameSession, pair: string, since: number) {
  return session.state.events.filter(event => event.type === 'PROTOCOL_SYNERGY' && event.tick >= since && event.data.pair === pair).map(event => {
    const hit = session.state.events.find(hit => hit.type === 'TARGET_HIT' && hit.tick === event.tick && hit.data.rootId === event.data.rootId
      && hit.data.cause === 'protocol' && Number(hit.data.damage) > 0 && (event.data.targetId === undefined || hit.data.id === event.data.targetId));
    expect(hit, 'A synergy intent without positive accepted same-root/tick host loss is not a trigger.').toBeDefined();
    return { event, hit: hit! };
  });
}
function pulseChain(ids: ProtocolId[]) {
  const session = preset(ids, { x: 730, y: 230 }), repetitions = [];
  for (let repetition = 0; repetition < 2; repetition++) {
    waitUntil(session, () => session.state.elapsed + 1e-9 >= session.state.battle!.pulse.readyAt);
    const root = actor(`pulse-root-${repetition}`, 790, 230, 30); root.traits = ['CARAPACE'];
    const neighbors = [850, 910, 970].map((x, index) => actor(`pulse-${repetition}-${index}`, x, 230));
    session.state.targets = [root, ...neighbors];
    const before = session.state.tick;
    session.step({ ...idle(root), interact: true });
    expect(root.exposedUntil).toBeGreaterThan(session.state.elapsed);
    const pulse = session.state.events.filter(event => event.type === 'PULSE_TRIGGERED').at(-1)!;
    session.step({ ...idle(root), fire: true });
    expect(root.hp).toBe(0);
    const hits = session.state.events.filter(event => event.type === 'TARGET_HIT' && event.tick >= before && event.data.protocolId === 'PURIFY_CHAIN');
    const joins = positiveJoins(session, 'PULSE_BREAK+PURIFY_CHAIN', before);
    repetitions.push({ beforeTick: before, pulse, shotTick: session.state.tick, rootId: hits[0]?.data.rootId ?? null,
      acceptedChainHits: hits, synergies: joins, neighborHp: neighbors.map(target => target.hp), readyAt: session.state.battle!.pulse.readyAt });
    session.state.targets = [];
  }
  return { ids, repetitions, metrics: session.state.runMetrics!.summary.control };
}
function traceBeacon(ids: ProtocolId[]) {
  const session = preset(ids), repetitions = [];
  for (let repetition = 0; repetition < 2; repetition++) {
    waitUntil(session, () => session.state.elapsed + 1e-9 >= Math.max(session.state.scanReady, session.state.growth!.beaconReadyAt));
    const marked = actor(`marked-${repetition}`, 810, 400);
    session.state.targets = [marked];
    const since = session.state.tick + 1;
    session.step({ ...idle(), scan: true });
    const beacon = structuredClone(session.state.growth!.beacon!);
    expect(beacon).not.toBeNull();
    const near = actor(`unmarked-${repetition}`, 730, 420);
    session.state.targets.push(near); // Explicit newly loaded preset body after Q; it was not scanned.
    const readyAt = session.state.growth!.beaconReadyAt;
    session.step({ ...idle(), scan: true }); // A premature Q must not replace the just-created helper.
    expect(session.state.growth!.beacon!.id).toBe(beacon.id);
    expect(session.state.growth!.beaconReadyAt).toBe(readyAt);
    waitUntil(session, () => session.state.events.some(event => ['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT'].includes(event.type) && event.tick >= since), 180);
    const bite = session.state.events.find(event => ['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT'].includes(event.type) && event.tick >= since)!;
    const accepted = session.state.events.find(hit => hit.type === 'TARGET_HIT' && hit.tick === bite.tick && hit.data.rootId === bite.data.rootId
      && hit.data.id === bite.data.targetId && Number(hit.data.damage) > 0)!;
    expect(accepted).toBeDefined();
    const synergies = positiveJoins(session, 'EXPOSE_TRACE+IMMUNE_BEACON', since);
    repetitions.push({ scanTick: since, beacon, bite, accepted, synergies, nextReadyAt: readyAt });
    session.state.targets = [];
  }
  return { ids, repetitions, metrics: session.state.runMetrics!.summary.control };
}

describe('AC-M08-03 repeated preset pair effects with single-protocol controls', () => {
  it('repeats actual pulse-exposed three-hop roots after the real cooldown, unlike either single protocol', () => {
    const pair = pulseChain(['PULSE_BREAK', 'PURIFY_CHAIN']), chainOnly = pulseChain(['PURIFY_CHAIN']), pulseOnly = pulseChain(['PULSE_BREAK']);
    expect(pair.repetitions.map(run => run.acceptedChainHits.length)).toEqual([3, 3]);
    expect(chainOnly.repetitions.map(run => run.acceptedChainHits.length)).toEqual([2, 2]);
    expect(pulseOnly.repetitions.map(run => run.acceptedChainHits.length)).toEqual([0, 0]);
    expect(pair.repetitions.every(run => run.synergies.length === 1 && run.acceptedChainHits.every(hit => Number(hit.data.damage) > 0))).toBe(true);
    expect(new Set(pair.repetitions.map(run => run.rootId)).size).toBe(2);
    expect(pair.repetitions[1].pulse.tick).toBeGreaterThan(pair.repetitions[0].pulse.tick);
    expect(pair.repetitions[1].pulse.tick / 60 + 1e-9).toBeGreaterThanOrEqual(pair.repetitions[0].readyAt);
    expect(pair.metrics).toMatchObject({ chainTriggers: 2, chainHops: 6, synergyPulseChain: 2 });
    expect(chainOnly.metrics.synergyPulseChain).toBe(0); expect(pulseOnly.metrics.synergyPulseChain).toBe(0);
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(evidenceDirectory + '/pulse-chain-repeats.json', JSON.stringify({ scope: 'Explicit preset waves; actual InputFrame E/basic kills and host-positive receipts. Not campaign/browser/human evidence.', pair, chainOnly, pulseOnly }, null, 2));
  });

  it('repeats marked-priority actual bites after real Q/squad cooldowns, unlike either single protocol', () => {
    const pair = traceBeacon(['EXPOSE_TRACE', 'IMMUNE_BEACON']), beaconOnly = traceBeacon(['IMMUNE_BEACON']), traceOnly = traceBeacon(['EXPOSE_TRACE']);
    expect(pair.repetitions.map(run => run.bite.data.targetId)).toEqual(['marked-0', 'marked-1']);
    expect(beaconOnly.repetitions.map(run => run.bite.data.targetId)).toEqual(['unmarked-0', 'unmarked-1']);
    expect(traceOnly.repetitions.every(run => run.beacon.mode === 'patrol' && run.bite.type === 'IMMUNE_PATROL_HIT')).toBe(true);
    expect(pair.repetitions.every(run => run.bite.data.prioritizedTrace === true && run.synergies.length > 0 && Number(run.accepted.data.damage) > 0)).toBe(true);
    expect(new Set(pair.repetitions.map(run => run.beacon.id)).size).toBe(2);
    expect(new Set(pair.repetitions.map(run => run.bite.data.rootId)).size).toBe(2);
    expect(pair.repetitions[1].scanTick / 60 + 1e-9).toBeGreaterThanOrEqual(pair.repetitions[0].nextReadyAt);
    expect(pair.repetitions[1].bite.tick).toBeGreaterThan(pair.repetitions[0].bite.tick);
    expect(pair.metrics.synergyTraceBeacon).toBeGreaterThanOrEqual(2);
    expect(beaconOnly.metrics.synergyTraceBeacon).toBe(0); expect(traceOnly.metrics.synergyTraceBeacon).toBe(0);
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(evidenceDirectory + '/trace-beacon-repeats.json', JSON.stringify({ scope: 'Explicit post-scan near-body presets; actual InputFrame Q/cooldowns/cell movement/contact/host-positive receipts. Not campaign/browser/human evidence.', pair, beaconOnly, traceOnly }, null, 2));
  });
});
