import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BattleDirector, type BattleHost } from '../../src/game/battle';
import { ENCOUNTER_CONFIGS } from '../../src/game/encounterConfig';
import { BATTLE_BALANCE as B } from '../../src/game/battleConfig';
import { activeWorld, type InputFrame, type Target, type Vec } from '../../src/game/types';
import { distance, wallHit, normalized } from '../../src/actors/collision';

const idle = (aim: Vec = { x: 1600, y: 930 }): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim });
const formal = (seed = 17) => { const s = new GameSession(seed, { campaign: true, milestone: 'G3' }); s.start(); return s; };
function advance(s: GameSession, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) s.step(idle()); }
function guardian(s: GameSession): Target { return s.state.targets.find(target => target.id === s.state.battle!.encounter!.firstCounter.targetId)!; }
function active() {
  const s = formal();
  // Mechanism fixture: accepted opening milestones, then real simulation time.
  s.state.battle!.stats.sourceClears = 1; s.state.battle!.stats.scans = 1;
  s.step(idle()); advance(s, 8.05);
  expect(s.state.battle!.encounter!.firstCounter.status).toBe('active');
  return s;
}
function frontalPose(s: GameSession) {
  const target = guardian(s);
  Object.assign(s.state.player, { x: target.x - 100, y: target.y });
  target.facing = Math.PI;
  return target;
}

describe('versioned first-counter encounter', () => {
  it('separates formal guided defaults, explicit trait overrides and early fixtures', () => {
    const s = formal(); expect(s.state.battle!.encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided', openingSpawned: 0 });
    expect(s.state.battle!.forcedFirstTrait).toBeUndefined();
    expect(s.state.battle!.firstTrait).toBe('CARAPACE');
    expect(s.state.targets.filter(target => target.role === 'virus')).toHaveLength(2);
    for (const milestone of ['G1', 'G2'] as const) {
      const f = new GameSession(17, { campaign: true, milestone, encounterMode: 'formal' });
      expect(f.state.battle!.encounter!.configId).toBe('fixture-1');
      expect(f.state.targets.filter(target => target.role === 'virus')).toHaveLength(4);
    }
    const override = new GameSession(17, { campaign: true, milestone: 'G3', firstTrait: 'MIMIC' });
    expect(override.state.battle!.encounter!.guideVariant).toBe('adaptive');
    expect(override.state.battle!.forcedFirstTrait).toBe('MIMIC');
    const adaptive = new GameSession(17, { campaign: true, milestone: 'G3', counterGuide: 'adaptive' });
    expect(adaptive.state.battle!.forcedFirstTrait).toBeUndefined();
    const fixture = new GameSession(17, { campaign: true, milestone: 'G3', encounterMode: 'fixture' });
    expect(fixture.state.battle!.encounter!.configId).toBe('fixture-1');
    expect(fixture.state.targets.filter(target => target.role === 'virus')).toHaveLength(4);
  });

  it('starts early only after clear-source plus real scan and preserves eight simulation seconds of warning', () => {
    const s = formal(), source = s.state.targets.find(target => target.role === 'source')!;
    Object.assign(s.state.player, { x: source.x - 140, y: source.y + 100 });
    for (let i = 0; i < 100 && source.hp > 0; i++) s.step({ ...idle(source), fire: true, tool: 1 });
    expect(source.hp).toBe(0); expect(s.state.battle!.warning).toBeNull();
    if (s.state.growth?.draft) s.discardDraft(s.state.growth.draft.id);
    s.step({ ...idle(), scan: true });
    const warned = s.state.battle!.warning!;
    expect(warned.trait).toBe('CARAPACE'); expect(warned.startedAt).toBeLessThan(14);
    expect(warned.applyAt - warned.startedAt).toBe(8);
    advance(s, 7.9); expect(s.state.battle!.traits).toEqual([]);
    advance(s, .2); expect(s.state.battle!.traits[0]).toBe('CARAPACE');
    expect(s.state.events.find(event => event.type === 'EVOLUTION_APPLIED')!.data.warningDuration).toBeGreaterThanOrEqual(8);
  });

  it('falls back at 14 seconds, with a full warning even when no source/scan is complete', () => {
    const s = formal(); advance(s, 14);
    expect(s.state.battle!.encounter!.firstCounter.status).toBe('warning');
    expect(s.state.battle!.warning!.applyAt).toBeGreaterThanOrEqual(22);
    expect(s.state.battle!.stats.scans).toBe(0);
  });

  it('spawns a full-health ordinary-combat guardian with clear valve and rear approaches', () => {
    const s = active(), target = guardian(s), config = ENCOUNTER_CONFIGS['campaign-1'];
    expect(target).toMatchObject({ role: 'elite', hp: B.eliteHp, maxHp: B.eliteHp, traits: ['CARAPACE'] });
    expect(distance(target, config.introGuardian)).toBeLessThan(5);
    expect(target.attackReady).toBeGreaterThan(s.state.battle!.encounter!.firstCounter.appliedAt!);
    const valve = s.state.battle!.pulse.origin, direction = normalized(target.x - valve.x, target.y - valve.y);
    expect(distance(valve, target)).toBeLessThan(B.pulseRange);
    expect(wallHit(valve, direction, distance(valve, target), activeWorld(s.state))).toBeNull();
    for (const offset of [{ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }]) {
      const point = { x: target.x + offset.x, y: target.y + offset.y };
      expect(activeWorld(s.state).obstacles.every(obstacle => distance(point, obstacle) > obstacle.radius + s.state.player.radius)).toBe(true);
    }
  });

  it('does not credit frontal reduced damage, protocol damage or unproven antibody exposure', () => {
    const s = active(), target = frontalPose(s);
    s.step({ ...idle(target), tool: 1, fire: true });
    expect(target.hp).toBeCloseTo(B.eliteHp - 34 * .3);
    expect(s.state.battle!.encounter!.firstCounter.counterHit).toBeNull();
    target.exposedUntil = s.state.elapsed + 4; target.facing = Math.PI; s.state.cooldowns[1] = 0;
    s.step({ ...idle(target), tool: 1, fire: true });
    expect(target.hp).toBeCloseTo(B.eliteHp - 34 * .3 - 34);
    expect(s.state.battle!.encounter!.firstCounter.counterHit).toBeNull();
    s.emit('TARGET_HIT', { id: target.id, damage: 9, cause: 'protocol', tool: 1 });
    expect(s.state.events.filter(event => event.type === 'COUNTER_GUIDE_COMPLETED')).toHaveLength(0);
  });

  it('credits actual rear basic hits once, including after a skipped guide', () => {
    const s = active(), target = frontalPose(s), director = new BattleDirector(s);
    expect(director.skipCounterGuide()).toBe(true);
    const skippedAt = s.state.battle!.encounter!.firstCounter.skippedAt;
    expect(director.skipCounterGuide()).toBe(false);
    target.facing = 0;
    s.step({ ...idle(target), tool: 1, fire: true });
    const first = s.state.battle!.encounter!.firstCounter;
    expect(first.counterHit).toMatchObject({ targetId: target.id, method: 'rear', damage: 34 });
    expect(first.guideStatus).toBe('completed'); expect(first.skippedAt).toBe(skippedAt);
    s.state.cooldowns[1] = 0; s.step({ ...idle(target), tool: 1, fire: true });
    expect(s.state.events.filter(event => event.type === 'COUNTER_GUIDE_COMPLETED')).toHaveLength(1);
  });

  it('credits a real valve pulse bound to this guardian, then a real frontal basic hit', () => {
    const s = active(), target = guardian(s);
    Object.assign(s.state.player, s.state.battle!.pulse.origin);
    target.facing = Math.PI;
    const before = s.state.tissue.hp;
    s.step({ ...idle(target), interact: true });
    const pulse = [...s.state.events].reverse().find(event => event.type === 'PULSE_TRIGGERED')!;
    expect(pulse.data.exposedTargetIds).toBe(target.id);
    expect(s.state.tissue.hp).toBeCloseTo(before - B.pulseCost);
    target.facing = Math.atan2(s.state.player.y - target.y, s.state.player.x - target.x);
    s.step({ ...idle(target), fire: true, tool: 1 });
    expect(s.state.battle!.encounter!.firstCounter.counterHit).toMatchObject({ method: 'pulse', damage: 34, targetId: target.id });
  });

  it('rejects an expired pulse window and a pulse that exposed a different ID', () => {
    const s = active(), target = frontalPose(s);
    target.exposedUntil = s.state.elapsed + 4;
    s.emit('PULSE_TRIGGERED', { exposedTargetIds: 'different-guardian' });
    s.step({ ...idle(target), fire: true, tool: 1 });
    expect(s.state.battle!.encounter!.firstCounter.counterHit).toBeNull();
    s.emit('PULSE_TRIGGERED', { exposedTargetIds: target.id });
    advance(s, 4.1); target.facing = Math.atan2(s.state.player.y - target.y, s.state.player.x - target.x); target.exposedUntil = s.state.elapsed + 2;
    s.step({ ...idle(target), fire: true, tool: 1 });
    expect(s.state.battle!.encounter!.firstCounter.counterHit).toBeNull();
  });

  it('skipping changes only guide state/event, no actor, variant, ability or reward', () => {
    const s = active(), before = s.snapshot(), director = new BattleDirector(s);
    expect(director.skipCounterGuide()).toBe(true);
    const after = s.snapshot();
    expect(after.targets).toEqual(before.targets); expect(after.growth).toEqual(before.growth);
    expect(after.cooldowns).toEqual(before.cooldowns); expect(after.player).toEqual(before.player);
    expect(after.battle!.encounter!.guideVariant).toBe('guided');
    expect(after.battle!.traits).toEqual(before.battle!.traits);
    expect(after.battle!.stats).toEqual(before.battle!.stats);
    expect(after.events.filter(event => event.type === 'COUNTER_GUIDE_SKIPPED')).toHaveLength(1);
  });

  it('resolves only its guardian, opens second warning immediately, and does not invent counter success', () => {
    const s = active(), target = frontalPose(s), director = new BattleDirector(s);
    // A separate elite's death is an explicit mechanism fixture, not the guardian.
    const other = { ...target, id: 'other-elite', hp: 0 };
    director.cleared(other);
    if (s.state.growth?.draft) s.discardDraft(s.state.growth.draft.id);
    s.step(idle());
    expect(s.state.battle!.encounter!.firstCounter.status).toBe('active');
    expect(s.state.battle!.warning).toBeNull();
    target.hp = 65;
    if (s.state.growth?.draft) s.discardDraft(s.state.growth.draft.id);
    expect(s.state.phase).toBe('playing');
    s.step({ ...idle(target), tool: 2, fire: true });
    expect(target.hp).toBe(0);
    const first = s.state.battle!.encounter!.firstCounter;
    expect(first.status).toBe('resolved'); expect(first.counterHit).toBeNull(); expect(first.guideStatus).toBe('active');
    if (s.state.growth?.draft) s.discardDraft(s.state.growth.draft.id);
    s.step(idle());
    expect(s.state.battle!.warning!.startedAt! - first.resolvedAt!).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(new BattleDirector(s).skipCounterGuide()).toBe(true);
    expect(s.state.events.some(event => event.type === 'COUNTER_GUIDE_COMPLETED')).toBe(false);
  });

  it('bounds opening total production even after ordinary deaths, and restores normal production after resolution', () => {
    const s = formal(), state = s.state;
    let director: BattleDirector;
    const host: BattleHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; state.events.push(event); director.recordEvent(event); }, message() {}, effect() {}, finish() {} };
    director = new BattleDirector(host);
    const update = (seconds: number) => { state.elapsed = seconds; state.tick = seconds * 60; director.afterInput(); };
    update(8); update(16); update(24);
    expect(state.battle!.encounter!.openingSpawned).toBe(2);
    expect(state.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.role === 'virus')).toHaveLength(2);
    for (const target of state.targets) if (target.role === 'virus') target.hp = 0;
    update(32); update(40);
    expect(state.battle!.encounter!.openingSpawned).toBe(2);
    const first = guardian(s); first.hp = 0; director.cleared(first);
    update(48);
    expect(state.targets.filter(target => target.hp > 0 && target.role === 'virus').length).toBeGreaterThan(0);
  });

  it('freezes lesson/warning on pause and reproduces/reset the same formal configuration', () => {
    const a = formal(), b = formal();
    for (let i = 0; i < 600; i++) { const input = { ...idle(), scan: i === 1 }; a.step(input); b.step(input); }
    expect(a.snapshot()).toEqual(b.snapshot());
    a.pause(); const paused = a.snapshot(); advance(a, 20); expect(a.snapshot()).toEqual(paused);
    a.restart(); expect(a.state.battle!.encounter).toEqual(formal().state.battle!.encounter);
    expect(a.state.battle!.encounter!.firstCounter.counterHit).toBeNull();
  });
});
