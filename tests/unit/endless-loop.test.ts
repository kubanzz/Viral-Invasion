import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { endlessCombatStats } from '../../src/game/endlessGrowth';
import type { EndlessUpgradeId } from '../../src/game/endlessGrowthTypes';
import { activeWorld, type GameState, type InputFrame, type Target, type Vec } from '../../src/game/types';
import type { DraftOption, ProtocolId } from '../../src/game/growthTypes';
import { waypoint } from '../helpers/g3Driver';

const idle = (aim: Vec = { x: 1200, y: 900 }): InputFrame => ({ moveX: 0, moveY: 0, aim, fire: false });
const visible = (s: GameState, target: Vec, radius = 0) => {
  const d = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), d, activeWorld(s));
  return hit === null || hit >= d - radius;
};

/** Uses only observed world state to choose normal keys and mouse input. No simulation fields are written. */
function challengeInput(s: GameState): InputFrame {
  const enemies = s.targets.filter(target => target.hp > 0);
  const stats = endlessCombatStats(s.endlessGrowth!);
  const repair = s.tissue.hp < 72 || s.player.hp < stats.maxHp * .55 && s.tissue.hp < 99;
  const ranked = enemies.slice().sort((a, b) => {
    const priority = (target: Target) => (target.traits?.includes('MIMIC') && s.tissue.hp < 85 ? -500 : 0) + distance(s.player, target);
    return priority(a) - priority(b) || a.id.localeCompare(b.id);
  });
  const target = ranked.find(enemy => distance(s.player, enemy) < 520 && visible(s, enemy, enemy.radius)) ?? ranked[0];
  let destination: Vec = { x: 1100, y: 800 };
  if (repair) destination = { x: s.tissue.x - 90, y: s.tissue.y - 55 };
  else if (target) {
    const away = normalized(s.player.x - target.x, s.player.y - target.y);
    if (distance(s.player, target) > 330 || !visible(s, target, target.radius)) destination = target;
    else if (distance(s.player, target) < 190) destination = { x: target.x + away.x * 285, y: target.y + away.y * 285 };
    else destination = { ...s.player };
  }
  // Move perpendicular to a frozen incoming blast rather than following its old aim.
  const danger = enemies.find(enemy => enemy.attackAt !== undefined && enemy.attackTarget === 'player' && enemy.attackAim
    && distance(s.player, enemy.attackAim) < (enemy.attackRadius ?? 58) + s.player.radius + 30);
  if (danger?.attackAim) {
    const out = normalized(s.player.x - danger.x, s.player.y - danger.y);
    destination = { x: s.player.x - out.y * 190, y: s.player.y + out.x * 190 };
  }
  const next = waypoint(s, destination);
  const move = distance(s.player, destination) > 12 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  const canRepair = repair && distance(s.player, s.tissue) < 520 && visible(s, s.tissue, s.tissue.radius);
  const areaReady = s.cooldowns[2] <= s.elapsed;
  const aim = canRepair ? s.tissue : target ?? destination;
  return { moveX: move.x, moveY: move.y, aim: { x: aim.x, y: aim.y }, fire: canRepair || !!target,
    tool: canRepair ? 3 : areaReady ? 2 : 1,
    scan: !!target && s.scanReady <= s.elapsed && distance(s.player, target) < 640,
    dash: !!danger && s.player.dashReady <= s.elapsed && danger.attackAt! - s.elapsed < .28,
    interact: !!target && distance(s.player, s.battle!.pulse.origin) < 90 && s.battle!.pulse.readyAt <= s.elapsed };
}

function protocolPriority(option: DraftOption, s: GameState): number {
  const current = s.growth!.equipped.find(item => item.id === option.protocolId);
  if (!current && option.protocolId === 'PURIFY_CHAIN') return 0;
  if (option.protocolId === 'IMMUNE_BEACON' && (option.rank ?? 1) > (current?.rank ?? 1)) return 1;
  if (option.protocolId === 'PURIFY_CHAIN' && (option.rank ?? 1) > (current?.rank ?? 1)) return 2;
  if (!current && option.protocolId === 'EXPOSE_TRACE') return 3;
  return 4;
}

/** Both modal types are resolved through the public transaction APIs, including replacement confirmation. */
function choosePending(session: GameSession, trace: string[]): void {
  for (let guard = 0; guard < 12 && session.state.phase === 'paused'; guard++) {
    const s = session.state, growth = s.growth!, draft = growth.draft;
    if (draft) {
      const option = draft.options.slice().sort((a, b) => protocolPriority(a, s) - protocolPriority(b, s) || a.id.localeCompare(b.id))[0];
      const intent = { runId: growth.runId, draftId: draft.id, optionId: option.id };
      let result = session.chooseDraft(intent);
      if (result.kind === 'replace-required') {
        const slotIndex = Math.max(0, growth.equipped.findIndex(item => item.id === 'PULSE_BREAK'));
        const previous: ProtocolId = growth.equipped[slotIndex].id;
        result = session.chooseDraft({ ...intent, slotIndex, expectedPreviousProtocolId: previous });
      }
      expect(result.kind).toBe('committed'); trace.push(`protocol:${option.protocolId}:${option.tuning}:${option.rank ?? 1}`);
      continue;
    }
    const combat = s.endlessGrowth!.draft;
    if (combat) {
      const priority: EndlessUpgradeId[] = ['multishot', 'nova', 'pierce', 'power', 'haste', 'immune', 'scan', 'dash', 'vitality'];
      const option = combat.options.slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
      expect(session.chooseCombatUpgrade(combat.id, option.id, growth.runId)).toBe(true);
      trace.push(`combat:${combat.wave}:${option.id}`); continue;
    }
    session.resume();
  }
  expect(session.state.phase, 'all pending public choices must resume combat').toBe('playing');
}

function diagnosis(session: GameSession): string {
  const s = session.state;
  return JSON.stringify({ phase: s.phase, result: s.result, wave: s.endless?.wave, cleared: s.endless?.clearedWaves,
    elapsed: s.elapsed, hp: s.player.hp, tissue: s.tissue.hp, player: { x: s.player.x, y: s.player.y },
    remaining: s.endless?.remainingToSpawn, pending: s.endless?.pendingChildren,
    targets: s.targets.filter(target => target.hp > 0).map(({ id, x, y, hp, traits, attackAt }) => ({ id, x, y, hp, traits, attackAt })) });
}

describe('real session continuous challenge loop', () => {
  it('naturally clears 12 waves with public inputs/choices and reproduces the same seed, input and choices', () => {
    const a = new GameSession(71, { mode: 'endless' }), b = new GameSession(71, { mode: 'endless' }); a.start(); b.start();
    const choicesA: string[] = [], choicesB: string[] = [], cleared: number[] = [];
    const hash = createHash('sha256');
    let maxLiving = 0, maxTelegraphs = 0, frozenChecks = 0, pendingFissionTicks = 0, lastWaveTick = 0, dualModalPauses = 0;
    a.bus.on('event', event => {
      if (event.type !== 'ENDLESS_WAVE_CLEARED') return;
      cleared.push(Number(event.data.wave)); lastWaveTick = a.state.tick;
      expect(a.state.player.hp).toBeGreaterThan(0); expect(a.state.tissue.hp).toBeGreaterThan(0);
      expect(a.state.targets.filter(target => target.hp > 0)).toHaveLength(0);
      expect(a.state.targets.some(target => target.splitAt !== undefined)).toBe(false);
    });
    const limit = 12 * 100 * 60;
    for (let step = 0; step < limit && a.state.endless!.clearedWaves < 12; step++) {
      if (a.state.phase === 'paused') {
        if (a.state.growth?.draft && a.state.endlessGrowth?.draft) dualModalPauses++;
        const frozen = a.state.tick; for (let pause = 0; pause < 4; pause++) a.step(idle()); expect(a.state.tick).toBe(frozen);
        choosePending(a, choicesA); choosePending(b, choicesB); expect(choicesA).toEqual(choicesB);
      }
      if (a.state.phase === 'result') throw new Error(`Unmodified-input bot failed: ${diagnosis(a)}`);
      if (a.state.tick - lastWaveTick > 100 * 60) throw new Error(`Natural-wave progress stalled: ${diagnosis(a)}`);
      const committed = a.state.targets.filter(target => target.hp > 0 && target.attackAt !== undefined)
        .map(target => ({ id: target.id, at: target.attackAt, x: target.x, y: target.y, aim: { ...target.attackAim! } }));
      const input = challengeInput(a.state); hash.update(JSON.stringify(input));
      a.step(input); b.step(structuredClone(input));
      const live = a.state.targets.filter(target => target.hp > 0);
      maxLiving = Math.max(maxLiving, live.length); maxTelegraphs = Math.max(maxTelegraphs, live.filter(target => target.attackAt !== undefined).length);
      if (a.state.targets.some(target => target.splitAt !== undefined)) pendingFissionTicks++;
      expect(live.length).toBeLessThanOrEqual(24); expect(live.filter(target => target.attackAt !== undefined).length).toBeLessThanOrEqual(3);
      for (const pose of committed) {
        const current = live.find(target => target.id === pose.id);
        if (!current || current.attackAt !== pose.at) continue; // real death, resolution or accepted knockback can end the commitment
        expect({ x: current.x, y: current.y, aim: current.attackAim }).toEqual({ x: pose.x, y: pose.y, aim: pose.aim }); frozenChecks++;
      }
      if (step % 300 === 0) expect(a.snapshot()).toEqual(b.snapshot());
    }
    expect(a.state.endless!.clearedWaves, diagnosis(a)).toBe(12);
    expect(cleared).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    if (a.state.phase === 'paused') { choosePending(a, choicesA); choosePending(b, choicesB); }
    expect(a.snapshot()).toEqual(b.snapshot()); expect(a.state.endlessGrowth!.level).toBe(12);
    expect(choicesA.filter(choice => choice.startsWith('combat:'))).toHaveLength(12);
    expect(pendingFissionTicks).toBeGreaterThan(0);
    expect(choicesA.some(choice => choice.startsWith('protocol:'))).toBe(true);
    console.info(JSON.stringify({ proof: 'natural-input-12-wave', seed: 71, elapsed: a.state.elapsed,
      clearedWaves: a.state.endless!.clearedWaves, maxLiving, maxTelegraphs, frozenChecks, pendingFissionTicks, dualModalPauses,
      hp: a.state.player.hp, tissue: a.state.tissue.hp, inputSha256: hash.digest('hex'), choices: choicesA }));
  }, 60000);

  it('loses naturally with no attacks, grants no clear reward after death and resets the same seed on restart', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const runId = session.state.growth!.runId;
    for (let tick = 0; tick < 90 * 60 && session.state.phase !== 'result'; tick++) session.step(idle(session.state.player));
    expect(session.state.phase, diagnosis(session)).toBe('result'); expect(session.state.result?.success).toBe(false);
    expect(session.state.player.hp).toBe(0); expect(session.state.endless!.clearedWaves).toBe(0);
    expect(session.state.endlessGrowth!.level).toBe(0); expect(session.state.endlessGrowth!.draft).toBeNull();
    const dead = session.snapshot(); session.completeWave(1); for (let i = 0; i < 20; i++) session.step(idle()); expect(session.snapshot()).toEqual(dead);
    session.restart();
    expect(session.state.seed).toBe(71); expect(session.state.phase).toBe('playing'); expect(session.state.tick).toBe(0);
    expect(session.state.player.hp).toBe(100); expect(session.state.tissue.hp).toBe(100); expect(session.state.targets).toEqual([]);
    expect(session.state.endless).toMatchObject({ wave: 1, clearedWaves: 0, score: 0, kills: 0, combo: 0, bestCombo: 0, phase: 'warning' });
    expect(session.state.endlessGrowth).toMatchObject({ level: 0, ranks: {}, draft: null, history: [] });
    expect(session.state.growth!.runId).not.toBe(runId);
    expect(session.chooseCombatUpgrade('endless:71:wave:1:level:1', 'power', runId)).toBe(false);
  }, 30000);

  it('checks terminal HP before clearing an otherwise empty wave and cannot reward a terminal player', () => {
    // This focused terminal-order fixture is separate from the untouched 12-wave run above.
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    session.state.endless!.phase = 'combat'; session.state.endless!.remainingToSpawn = 0;
    session.state.player.hp = 0; session.step(idle());
    expect(session.state.phase).toBe('result'); expect(session.state.endless!.clearedWaves).toBe(0);
    expect(session.state.endlessGrowth!.draft).toBeNull(); expect(session.state.growth!.xp).toBe(0);
  });

  it('holds a real wave through parent death and actual delayed fission children, then freezes its upgrade pause before the next wave', () => {
    // A focused combat fixture tests the real damage/death/split transaction order.
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    const s = session.state;
    Object.assign(s.endless!, { wave: 10, phase: 'combat', remainingToSpawn: 0, phaseUntil: 0, traits: ['FISSION'] });
    const parent: Target = { id: 'real-fission-parent', x: s.player.x + 220, y: s.player.y, hp: 34, maxHp: 68, role: 'virus', kind: 'cluster',
      radius: 22, traits: ['FISSION'], generation: 0, sourceId: 'endless:wave:10', hitUntil: 0, scanned: false, attackReady: 100 };
    s.targets = [parent];
    session.step({ ...idle(parent), fire: true, tool: 1 });
    expect(parent.hp).toBe(0); expect(parent.splitAt).toBeGreaterThan(s.elapsed);
    expect(s.endless!.phase).toBe('combat'); expect(s.endless!.pendingChildren).toBe(2); expect(s.endless!.clearedWaves).toBe(0);
    for (let i = 0; i < 49; i++) session.step(idle());
    const children = s.targets.filter(target => target.hp > 0);
    expect(children).toHaveLength(2); expect(children.every(child => child.generation === 1 && child.sourceId === parent.sourceId)).toBe(true);
    expect(s.endless!.phase).toBe('combat'); expect(s.endless!.pendingChildren).toBe(0);
    session.step({ ...idle({ x: parent.x, y: parent.y }), tool: 2, fire: true });
    expect(children.every(child => child.hp === 0 && child.splitAt === undefined)).toBe(true);
    expect(s.endless!.clearedWaves).toBe(10); expect(s.endless!.kills).toBe(3); expect(s.phase).toBe('paused');
    expect(s.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
    const pauseTick = s.tick, intermissionUntil = s.endless!.phaseUntil;
    for (let i = 0; i < 100; i++) session.step(idle());
    expect(s.tick).toBe(pauseTick); expect(s.endless!.phaseUntil).toBe(intermissionUntil);
    const choices: string[] = []; choosePending(session, choices);
    expect(s.phase).toBe('playing'); expect(s.endless!.phase).toBe('intermission');
    expect(s.endlessGrowth!.level).toBe(1);
    for (let i = 0; i < 180; i++) session.step(idle());
    expect(s.endless!.wave).toBe(11); expect(s.endless!.phase).toBe('warning');
    expect(s.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
  });

  it('commits at most three real elite blasts and preserves their bodies and frozen aim until resolution', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
    Object.assign(s.endless!, { wave: 5, phase: 'combat', remainingToSpawn: 0, phaseUntil: 0 });
    s.targets = Array.from({ length: 5 }, (_, i): Target => ({ id: `elite-contract-${i}`, role: 'elite', kind: 'single',
      x: s.player.x + Math.cos(i * Math.PI * 2 / 5) * 215, y: s.player.y + Math.sin(i * Math.PI * 2 / 5) * 215,
      radius: 30, hp: 10000, maxHp: 10000, traits: [], generation: 0, sourceId: 'endless:wave:5',
      hitUntil: 0, scanned: false, attackReady: 0 }));
    session.step(idle());
    const committed = s.targets.filter(target => target.attackAt !== undefined).map(target => structuredClone(target));
    expect(committed).toHaveLength(3);
    for (const target of committed) { expect(target.attackRadius).toBe(105); expect(target.attackAt! - s.elapsed).toBeCloseTo(1.1); }
    for (let i = 0; i < 55; i++) {
      // Move the actual player: an elite must keep aiming at the committed old position.
      session.step({ ...idle(), moveX: 1, moveY: .3 });
      expect(s.targets.filter(target => target.hp > 0 && target.attackAt !== undefined).length).toBeLessThanOrEqual(3);
      for (const before of committed) {
        const target = s.targets.find(item => item.id === before.id)!;
        expect(target.attackAt).toBe(before.attackAt); expect(target.attackAim).toEqual(before.attackAim);
        expect({ x: target.x, y: target.y }).toEqual({ x: before.x, y: before.y });
      }
    }
    for (let i = 0; i < 20; i++) session.step({ ...idle(), moveX: 1 });
    for (const before of committed) expect(s.targets.find(target => target.id === before.id)!.attackAt).not.toBe(before.attackAt);
    expect(s.targets.filter(target => target.attackAt !== undefined).length).toBeLessThanOrEqual(3);
    expect(s.player.hp).toBe(100);
  });

  it('materializes eight promised children into the 24-body cap before admitting another primary batch', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const s = session.state;
    Object.assign(s.endless!, { phase: 'combat', remainingToSpawn: 12, totalToSpawn: 28, phaseUntil: 0, nextSpawnAt: 0 });
    const base: Target = { id: 'resident', role: 'virus', kind: 'single', x: 1000, y: 800, radius: 22,
      hp: 68, maxHp: 68, traits: [], generation: 0, sourceId: 'endless:wave:1', hitUntil: 0, scanned: false, attackReady: 100 };
    s.targets = Array.from({ length: 16 }, (_, i) => ({ ...base, id: `resident-${i}`, x: 1000 + (i % 4) * 60, y: 730 + Math.floor(i / 4) * 60 }));
    for (let i = 0; i < 4; i++) {
      const point = { x: 1100 + Math.cos(i * Math.PI / 2) * 220, y: 800 + Math.sin(i * Math.PI / 2) * 220 };
      s.targets.push({ ...base, ...point, id: `pending-parent-${i}`, hp: 0, deadAt: 0, traits: ['FISSION'],
        splitAt: .1, splitPositions: [{ x: point.x - 27, y: point.y + 10 }, { x: point.x + 27, y: point.y + 10 }] });
    }
    for (let i = 0; i < 10; i++) {
      session.step(idle()); expect(s.targets.filter(target => target.hp > 0).length).toBeLessThanOrEqual(24);
      expect(s.endless!.remainingToSpawn).toBe(12);
    }
    expect(s.targets.filter(target => target.hp > 0)).toHaveLength(24);
    expect(s.targets.filter(target => target.hp > 0 && target.generation === 1)).toHaveLength(8);
    expect(s.endless!.pendingChildren).toBe(0);
    expect(s.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(8);
    expect(s.endless!.phase).toBe('combat'); expect(s.endless!.clearedWaves).toBe(0);
  });
});
