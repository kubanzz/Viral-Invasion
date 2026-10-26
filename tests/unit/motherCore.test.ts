import { describe, expect, it } from 'vitest';
import { MotherCoreController, MOTHER_CORE_BALANCE as B, motherCoreDisturbed } from '../../src/game/motherCore';
import type { MotherCoreCommand, MotherCoreContext } from '../../src/game/motherCoreTypes';
import type { TraitId } from '../../src/game/battleTypes';
import { WORLD, type Target, type WorldGeometry } from '../../src/game/types';
import { GameSession } from '../../src/game/session';
import { BattleDirector } from '../../src/game/battle';
import { distance } from '../../src/actors/collision';

function fixture(traits: TraitId[], geometry: WorldGeometry = WORLD) {
  const session = new GameSession(91, { campaign: true }); session.start();
  const core: Target = { id: 'mother-core', x: 700, y: 390, radius: 50, hp: 600, maxHp: 600,
    kind: 'single', role: 'core', traits: [...traits], facing: 0, hitUntil: 0, scanned: false };
  Object.assign(session.state.player, { x: 900, y: 390 });
  const controller = new MotherCoreController({ coreId: core.id, organId: 'heart', traits, tick: 0, elapsed: 0 });
  const context: MotherCoreContext = { tick: 0, elapsed: 0, active: true, core,
    player: session.state.player, tissue: session.state.tissue, geometry };
  const commands: MotherCoreCommand[] = [];
  const apply = (next: MotherCoreCommand[]) => {
    commands.push(...next);
    for (const command of next) {
      if (command.kind === 'pose') { core.traits = [...command.traits]; core.facing = command.facing; }
      if (command.kind === 'expose') { core.exposedUntil = Math.max(core.exposedUntil ?? 0, command.until); core.revealedUntil = Math.max(core.revealedUntil ?? 0, command.revealUntil); }
    }
    return next;
  };
  const step = () => {
    context.tick++; context.elapsed = context.tick / 60;
    session.state.tick = context.tick; session.state.elapsed = context.elapsed;
    return apply(controller.tick(context));
  };
  const advance = (seconds: number) => { const result: MotherCoreCommand[] = []; for (let index = 0; index < Math.ceil(seconds * 60); index++) result.push(...step()); return result; };
  const awaitAttack = () => { for (let index = 0; index < 900 && !controller.state.attack; index++) step(); expect(controller.state.attack).not.toBeNull(); return structuredClone(controller.state.attack!); };
  const resolveAttack = () => { const result: MotherCoreCommand[] = []; for (let index = 0; index < 900 && controller.state.attack; index++) result.push(...step()); expect(controller.state.attack).toBeNull(); return result; };
  return { controller, context, core, session, commands, apply, step, advance, awaitAttack, resolveAttack };
}

describe('G3 mother core combat controller', () => {
  it('retains a serializable one/two-trait state and rejects an invalid extra-trait core', () => {
    const h = fixture(['CARAPACE', 'MIMIC']); h.advance(.3);
    expect(h.controller.state.traits).toEqual(['CARAPACE', 'MIMIC']);
    const saved = JSON.parse(JSON.stringify(h.controller.state));
    const resumed = new MotherCoreController({ coreId: h.core.id, organId: 'heart', traits: h.controller.state.traits, tick: h.context.tick, elapsed: h.context.elapsed }, saved);
    expect(resumed.state).toBe(saved);
    expect(resumed.state).toEqual(h.controller.state);
    expect(() => fixture([])).toThrow(RangeError);
    expect(() => fixture(['CARAPACE', 'FISSION', 'MIMIC'])).toThrow(RangeError);
    expect(fixture(['FISSION', 'FISSION']).controller.state.traits).toEqual(['FISSION']);
  });

  it('alternates real trait attacks, sends player/tissue damage commands and never directly changes HP', () => {
    const h = fixture(['CARAPACE', 'MIMIC']);
    const playerHp = h.context.player.hp, tissueHp = h.context.tissue.hp;
    const first = h.awaitAttack();
    expect(first.kind).toBe('crystal-sweep');
    expect(first.resolveAt - first.startedAt).toBeCloseTo(B.sweepWindup);
    const sweep = h.resolveAttack();
    expect(sweep.some(command => command.kind === 'damagePlayer' && command.amount === B.sweepPlayerDamage)).toBe(true);
    const second = h.awaitAttack();
    expect(second.kind).toBe('corrosion');
    expect(h.core.traits).toEqual(['MIMIC']);
    const corrosion = h.resolveAttack();
    expect(corrosion.some(command => command.kind === 'damageTissue' && command.amount === B.corrosionTissueDamage)).toBe(true);
    expect(h.context.player.hp).toBe(playerHp);
    expect(h.context.tissue.hp).toBe(tissueHp);
    expect(h.core.hp).toBe(600);
    expect(h.controller.state.attacksResolved).toBe(2);
  });

  it('turns carapace slowly and uses the common frontal resistance, pulse and recovery weakness', () => {
    const h = fixture(['CARAPACE']);
    h.session.state.player.x = 500;
    h.step();
    expect(Math.abs(h.core.facing!)).toBeLessThanOrEqual(B.turnSpeed / 60 + 1e-10);
    h.session.state.player.x = 900;
    const director = new BattleDirector(h.session);
    expect(director.modifiedDamage(h.core, 34)).toBeCloseTo(34 * .3);
    h.apply(h.controller.onPulse(h.context));
    expect(director.modifiedDamage(h.core, 34)).toBe(34);
    expect(h.controller.onPulse(h.context)).toEqual([]);
    h.awaitAttack(); h.resolveAttack();
    expect(h.controller.state.phase).toBe('recovery');
    expect(h.core.exposedUntil).toBeGreaterThan(h.context.elapsed);
    expect(director.modifiedDamage(h.core, 34)).toBe(34);
  });

  it('resolves the previewed cone against current position, dash and the active organ geometry', () => {
    const escaped = fixture(['CARAPACE']);
    const preview = escaped.awaitAttack();
    expect(preview.range).toBe(B.sweepRange);
    expect(preview.halfAngle).toBe(B.sweepHalfAngle);
    escaped.session.state.player.x = 700; escaped.session.state.player.y = 650;
    expect(escaped.resolveAttack().some(command => command.kind === 'damagePlayer')).toBe(false);

    const dashing = fixture(['CARAPACE']); dashing.awaitAttack();
    dashing.session.state.player.dashUntil = dashing.controller.state.attack!.resolveAt + .2;
    expect(dashing.resolveAttack().some(command => command.kind === 'damagePlayer')).toBe(false);

    const blockedWorld: WorldGeometry = { ...WORLD, obstacles: [{ id: 'test-lung-membrane', x: 820, y: 390, radius: 35 }] };
    const blocked = fixture(['CARAPACE'], blockedWorld); blocked.awaitAttack();
    expect(blocked.resolveAttack().some(command => command.kind === 'damagePlayer')).toBe(false);
    const clear = fixture(['CARAPACE']); clear.awaitAttack();
    expect(clear.resolveAttack().some(command => command.kind === 'damagePlayer')).toBe(true);
  });

  it('fission bursts keep their telegraphed landing circle fixed so movement avoids damage', () => {
    const h = fixture(['FISSION']);
    const attack = h.awaitAttack();
    expect(attack.kind).toBe('fission-burst');
    expect(attack.aim).toEqual({ x: 900, y: 390 });
    expect(attack.radius).toBe(B.burstRadius);
    h.session.state.player.y = 600;
    expect(h.resolveAttack().some(command => command.kind === 'damagePlayer')).toBe(false);
  });

  it('advertises then releases exactly two fragile generation-one children at each HP threshold', () => {
    const geometry: WorldGeometry = { ...WORLD, obstacles: [{ id: 'landing-membrane', x: 622, y: 438, radius: 35 }] };
    const h = fixture(['FISSION', 'MIMIC'], geometry);
    h.core.hp = 390;
    const first = h.awaitAttack();
    expect(first.kind).toBe('brood'); expect(first.threshold).toBe(.66);
    expect(first.landings).toHaveLength(2);
    expect(first.resolveAt - first.startedAt).toBeCloseTo(B.broodWindup);
    expect(h.commands.some(command => command.kind === 'spawn')).toBe(false);
    const wave1 = h.resolveAttack().filter(command => command.kind === 'spawn');
    expect(wave1).toHaveLength(2);
    for (const command of wave1) {
      if (command.kind !== 'spawn') continue;
      expect(command).toMatchObject({ generation: 1, hp: 22, radius: 14, sourceId: 'mother-core', traits: ['FISSION'] });
      expect(first.landings).toContainEqual(command.position);
      for (const obstacle of geometry.obstacles) expect(distance(command.position, obstacle)).toBeGreaterThanOrEqual(obstacle.radius + command.radius - 1e-6);
      expect(command.position.x).toBeGreaterThanOrEqual(geometry.bounds.left + command.radius);
      expect(command.position.x).toBeLessThanOrEqual(geometry.bounds.right - command.radius);
    }
    h.core.hp = 180;
    const next = h.awaitAttack(); expect(next.kind).toBe('brood'); expect(next.threshold).toBe(.33);
    h.resolveAttack(); h.advance(30);
    const allSpawns = h.commands.filter(command => command.kind === 'spawn');
    expect(allSpawns).toHaveLength(4);
    expect(new Set(allSpawns.map(command => command.kind === 'spawn' ? command.actorId : '')).size).toBe(4);
    expect(h.controller.state.broodReleased).toEqual([.66, .33]);
    expect(h.controller.state.broodQueued).toEqual([]);
  });

  it('makes mimic periodically visible and allows a real in-range Q to interrupt tissue corrosion', () => {
    const h = fixture(['MIMIC', 'FISSION']); h.awaitAttack();
    expect(h.controller.state.attack?.kind).toBe('corrosion');
    const oldResolve = h.controller.state.attack!.resolveAt;
    expect(motherCoreDisturbed(h.controller.state, 3)).toBe(false);
    expect(motherCoreDisturbed(h.controller.state, 6.1)).toBe(true);
    const scan = h.apply(h.controller.onScan(h.context));
    expect(scan.some(command => command.kind === 'cancelTelegraph')).toBe(true);
    expect(h.controller.state.scanInterrupts).toBe(1);
    expect(h.controller.state.attack).toBeNull();
    expect(h.controller.state.exposedUntil).toBeCloseTo(h.context.elapsed + B.corrosionInterruptExposure);
    expect(motherCoreDisturbed(h.controller.state, h.context.elapsed + 1)).toBe(true);
    expect(h.controller.onScan(h.context)).toEqual([]);
    while (h.context.elapsed <= oldResolve + .1) h.step();
    expect(h.commands.some(command => command.kind === 'damageTissue')).toBe(false);
    const followingPhase = h.awaitAttack();
    expect(followingPhase.trait).toBe('FISSION');

    const far = fixture(['MIMIC']); far.awaitAttack();
    far.session.state.player.x = far.core.x - B.scanRange - 1;
    expect(far.controller.onScan(far.context)).toEqual([]);
    expect(far.resolveAttack().some(command => command.kind === 'damageTissue')).toBe(true);
  });

  it('freezes inactive state, keeps a travelling core and gives a fresh return telegraph', () => {
    const h = fixture(['MIMIC', 'CARAPACE']); h.awaitAttack();
    h.context.active = false;
    const before = structuredClone(h.controller.state);
    for (let index = 0; index < 1800; index++) expect(h.controller.tick(h.context)).toEqual([]);
    expect(h.controller.state).toEqual(before);
    h.context.tick += 600; h.context.elapsed = h.context.tick / 60; h.context.active = true;
    const returned = h.apply(h.controller.tick(h.context));
    expect(returned.some(command => command.kind === 'log' && command.type === 'CORE_REENTRY_GRACE')).toBe(true);
    expect(returned.some(command => command.kind === 'damagePlayer' || command.kind === 'damageTissue')).toBe(false);
    expect(h.controller.state.attack).toBeNull();
    expect(h.controller.state.nextActionAt - h.context.elapsed).toBeCloseTo(B.returnGrace);
    expect(h.controller.state.traits).toEqual(['MIMIC', 'CARAPACE']);
    expect(h.core.hp).toBe(600);
    h.advance(B.returnGrace);
    expect(h.controller.state.attack?.resolveAt).toBeGreaterThan(h.context.elapsed);
  });

  it('announces a full awakening when a newly spawned offscreen core is first visited', () => {
    const h = fixture(['CARAPACE', 'FISSION']);
    h.context.tick = 1200; h.context.elapsed = 20;
    const commands = h.controller.tick(h.context);
    expect(commands.some(command => command.kind === 'damagePlayer' || command.kind === 'damageTissue')).toBe(false);
    expect(h.controller.state.nextActionAt).toBe(20 + B.awakening);
    expect(h.controller.state.phase).toBe('awakening');
  });

  it('emits core-cleared exactly once and cancels pending attacks/children without an early positive-HP win', () => {
    const h = fixture(['FISSION', 'MIMIC']);
    expect(h.controller.notifyCleared(h.context)).toEqual([]);
    h.core.hp = 300; h.awaitAttack();
    expect(h.controller.state.attack?.kind).toBe('brood');
    h.core.hp = 0;
    const clear = h.apply(h.controller.notifyCleared(h.context));
    expect(clear.filter(command => command.kind === 'log' && command.type === 'CORE_CLEARED')).toHaveLength(1);
    expect(h.controller.state).toMatchObject({ cleared: true, phase: 'defeated', attack: null, broodQueued: [] });
    expect(h.controller.notifyCleared(h.context)).toEqual([]);
    expect(h.controller.tick(h.context)).toEqual([]);
    const later = h.advance(10);
    expect(later.some(command => command.kind === 'spawn' || command.kind === 'damagePlayer' || command.kind === 'damageTissue')).toBe(false);
  });

  it.each<[TraitId, TraitId]>([
    ['CARAPACE', 'FISSION'], ['CARAPACE', 'MIMIC'], ['FISSION', 'CARAPACE'],
    ['FISSION', 'MIMIC'], ['MIMIC', 'CARAPACE'], ['MIMIC', 'FISSION'],
  ])('exposes both %s / %s turns under repeated lethal burst without leaving a ghost brood', (first, second) => {
    const h = fixture([first, second]);
    let nextScanAt = 0;
    for (let frame = 0; frame < 1200 && h.core.hp > 0; frame++) {
      // Unit stress of the shared pre-damage contract, not a browser victory:
      // every attempted hit is lethal, and accepted Q is available every 3s.
      if (h.controller.state.attack?.kind === 'corrosion' && h.context.elapsed >= nextScanAt) {
        h.apply(h.controller.onScan(h.context)); nextScanAt = h.context.elapsed + 3;
      }
      const allowed = h.controller.damageLimit(h.context, 1000000);
      h.core.hp -= allowed;
      if (h.controller.state.membrane.remaining > 0) expect(h.core.hp).toBeGreaterThanOrEqual(h.core.maxHp * .5);
      if (h.core.hp <= 0) h.apply(h.controller.notifyCleared(h.context));
      else h.step();
    }
    expect(h.core.hp).toBe(0);
    expect(new Set(h.controller.state.seenTraits)).toEqual(new Set([first, second]));
    expect(h.controller.state.membrane).toMatchObject({ total: 2, remaining: 0, floorRatio: 0, thresholdReached: true });
    const broken = h.commands.filter(command => command.kind === 'log' && command.type === 'CORE_MEMBRANE_BROKEN');
    expect(broken).toHaveLength(2);
    expect(h.commands.filter(command => command.kind === 'log' && command.type === 'CORE_MEMBRANES_OPENED')).toHaveLength(1);
    expect(h.commands.filter(command => command.kind === 'log' && command.type === 'CORE_ATTACK_TELEGRAPHED').length).toBeGreaterThanOrEqual(2);
    if (h.controller.state.seenTraits.includes('MIMIC')) expect(h.controller.state.scanInterrupts).toBe(1);
    const spawnAttempts = h.commands.filter(command => command.kind === 'spawn');
    expect(spawnAttempts.length).toBeLessThanOrEqual(4);
    expect(spawnAttempts.every(command => command.kind === 'spawn' && command.generation === 1)).toBe(true);
    const afterDeath = h.advance(10);
    expect(afterDeath.some(command => command.kind === 'spawn' || command.kind === 'damagePlayer' || command.kind === 'damageTissue')).toBe(false);
    expect(h.controller.notifyCleared(h.context)).toEqual([]);
    expect(h.commands.filter(command => command.kind === 'log' && command.type === 'CORE_CLEARED')).toHaveLength(1);
  });

  it('permits ordinary basic-tool damage throughout the membrane sequence and never requires a protocol', () => {
    const h = fixture(['CARAPACE', 'FISSION']);
    const damage = h.controller.damageLimit(h.context, 34);
    expect(damage).toBe(34); h.core.hp -= damage;
    for (let frame = 0; frame < 1800 && h.core.hp > 0; frame++) {
      if (frame % 11 === 0) h.core.hp -= h.controller.damageLimit(h.context, 34);
      if (h.core.hp <= 0) h.apply(h.controller.notifyCleared(h.context));
      else h.step();
    }
    expect(h.core.hp).toBe(0);
    expect(h.controller.state.seenTraits).toHaveLength(2);
    expect(h.controller.state.membrane.remaining).toBe(0);
  });

  it('replays identical trait/HP/action histories deterministically and retains the configured lung identity', () => {
    const execute = () => {
      const h = fixture(['CARAPACE', 'FISSION']);
      for (let index = 0; index < 1800; index++) {
        if (index === 300) h.core.hp = 380;
        if (index === 800) h.core.hp = 180;
        if (index === 1100) h.apply(h.controller.onPulse(h.context));
        h.step();
      }
      return { state: h.controller.state, commands: h.commands };
    };
    expect(execute()).toEqual(execute());
    const lung = new MotherCoreController({ coreId: 'mother-core', organId: 'lung', traits: ['MIMIC', 'CARAPACE'], tick: 300, elapsed: 5 });
    expect(lung.state.organId).toBe('lung');
    expect(lung.state.traits).toEqual(['MIMIC', 'CARAPACE']);
  });
});
