import { describe, expect, it } from 'vitest';
import { HEART_BOSS_BALANCE, MOTHER_CORE_BALANCE, MotherCoreController } from '../../src/game/motherCore';
import type { MotherCoreCommand, MotherCoreContext } from '../../src/game/motherCoreTypes';
import { BALANCE, type Player, type Target } from '../../src/game/types';

function fixture(expedition = true) {
  const core: Target = { id: 'heart-boss', x: 1000, y: 700, radius: 52, hp: 1800, maxHp: 1800,
    kind: 'single', role: 'core', traits: ['CARAPACE'], hitUntil: 0, scanned: false };
  const player: Player = { x: 800, y: 700, radius: 19, hp: 100, facing: 0, moving: false,
    dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 };
  const controller = new MotherCoreController({ coreId: core.id, organId: 'heart', traits: ['CARAPACE'],
    tick: 0, elapsed: 0, heartExpedition: expedition });
  const context: MotherCoreContext = { tick: 0, elapsed: 0, active: true, core, player,
    tissue: { x: 1200, y: 700, radius: 40, hp: 100, maxHp: 100 },
    geometry: { width: 2400, height: 1500, bounds: { left: 0, right: 2400, top: 0, bottom: 1500 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } } };
  const commands: MotherCoreCommand[] = [];
  const step = () => { context.tick++; context.elapsed = context.tick / 60; const next = controller.tick(context); commands.push(...next); return next; };
  const advance = (n: number) => { for (let i = 0; i < Math.ceil(n * 60); i++) step(); };
  return { controller, core, player, context, commands, step, advance };
}

describe('heart expedition boss second phase', () => {
  it('keeps the current attack intact, then telegraphs the half-health pulse only once', () => {
    const f = fixture();
    while (!f.controller.state.attack) f.step();
    const firstId = f.controller.state.attack!.id;
    f.core.hp = f.core.maxHp / 2; f.step();
    expect(f.controller.state.secondPhase).toBe(true);
    expect(f.controller.state.attack?.id).toBe(firstId);
    for (let i = 0; i < 400 && f.controller.state.attack?.kind !== 'heart-pulse'; i++) f.step();
    const pulse = f.controller.state.attack!;
    expect(pulse.kind).toBe('heart-pulse'); expect(pulse.resolveAt - pulse.startedAt).toBeCloseTo(1.2);
    expect(f.commands.filter(c => c.kind === 'log' && c.type === 'CORE_ATTACK_RESOLVED' && c.data.attackId === firstId)).toHaveLength(1);
    f.advance(20);
    expect(f.commands.filter(c => c.kind === 'log' && c.type === 'HEART_BOSS_SECOND_PHASE')).toHaveLength(1);
    expect(f.commands.filter(c => c.kind === 'log' && c.type === 'HEART_BOSS_PULSE_STARTED')).toHaveLength(1);
  });
  it('uses an expanding wave with a real safe gap and at most one 28-damage hit', () => {
    for (const safe of [false, true]) {
      const f = fixture(); f.core.hp = 900;
      Object.assign(f.controller.state, { introduced: true, secondPhase: true, pulseQueued: true, nextActionAt: 0, facing: 0 });
      f.player.x = 800; f.step();
      if (safe) {
        const angle = f.controller.state.attack!.angle;
        f.player.x = f.core.x + Math.cos(angle) * 200;
        f.player.y = f.core.y + Math.sin(angle) * 200;
      }
      f.advance(2.2);
      const hits = f.commands.filter(c => c.kind === 'damagePlayer' && c.reason === 'heart-boss-pulse');
      expect(hits).toHaveLength(safe ? 0 : 1);
      if (!safe) expect(hits[0]).toMatchObject({ amount: HEART_BOSS_BALANCE.pulseDamage });
    }
  });
  it('does not change legacy mother rules and clears queued and live pulses on boss death', () => {
    const old = fixture(false); old.core.hp = 900; old.advance(12);
    expect(old.controller.state.secondPhase).toBeUndefined();
    expect(old.commands.some(c => c.kind === 'telegraph' && c.attack.kind === 'heart-pulse')).toBe(false);
    const modern = fixture(); modern.core.hp = 900;
    Object.assign(modern.controller.state, { introduced: true, secondPhase: true, pulseQueued: true, nextActionAt: 0 });
    modern.advance(1.3); expect(modern.controller.state.pulse).toBeDefined();
    modern.core.hp = 0; modern.step(); expect(modern.controller.state.pulse).toBeUndefined(); expect(modern.controller.state.pulseQueued).toBe(false);
  });
});

describe('heart expedition ranged counterplay', () => {
  it('threatens a stationary player at normal-shot range with the actual telegraphed sweep', () => {
    const f = fixture(); f.player.x = f.core.x - 530;
    while (!f.controller.state.attack) f.step();
    const attack = structuredClone(f.controller.state.attack!);
    expect(attack).toMatchObject({ kind: 'crystal-sweep', range: HEART_BOSS_BALANCE.sweepRange,
      halfAngle: HEART_BOSS_BALANCE.sweepHalfAngle });
    expect(attack.range).toBeGreaterThan(530);
    expect(attack.resolveAt - attack.startedAt).toBeCloseTo(1.3);
    expect(f.commands.some(command => command.kind === 'damagePlayer')).toBe(false);
    f.advance(1.4);
    expect(f.commands.filter(command => command.kind === 'damagePlayer' && command.attackId === attack.id))
      .toEqual([expect.objectContaining({ amount: HEART_BOSS_BALANCE.sweepPlayerDamage, reason: 'core-crystal-sweep' })]);
    expect(f.controller.state.phase).toBe('recovery');
    expect(f.controller.state.nextActionAt - f.controller.state.phaseStartedAt).toBeCloseTo(HEART_BOSS_BALANCE.recovery);
  });

  it('locks the long sweep once so a side step during its windup is a real counter', () => {
    const f = fixture(); f.player.x = f.core.x - 530;
    while (!f.controller.state.attack) f.step();
    const attack = structuredClone(f.controller.state.attack!);
    // Walk at the unchanged basic movement speed; no dash or relocation is
    // needed to escape the side of the cone within its promised windup.
    for (let i = 0; i < Math.ceil(1.4 * 60); i++) {
      f.player.y += BALANCE.speed * BALANCE.step; f.step();
      if (f.controller.state.attack?.id === attack.id) {
        expect(f.controller.state.attack.angle).toBe(attack.angle);
        expect(f.controller.state.attack.aim).toEqual(attack.aim);
      }
    }
    expect(f.commands.filter(command => command.kind === 'damagePlayer' && command.attackId === attack.id)).toHaveLength(0);
  });

  it('keeps real tissue obstacles as cover for the extended sweep', () => {
    const f = fixture(); f.player.x = f.core.x - 530;
    f.context.geometry = { ...f.context.geometry, obstacles: [{ id: 'cover', x: f.core.x - 200, y: f.core.y, radius: 45 }] };
    while (!f.controller.state.attack) f.step();
    const id = f.controller.state.attack!.id; f.advance(1.4);
    expect(f.commands.filter(command => command.kind === 'damagePlayer' && command.attackId === id)).toHaveLength(0);
  });

  it('does not shelter an unmoving firing lane in the pulse gap and lets the player move to the shown opening', () => {
    for (const moveIntoGap of [false, true]) {
      const f = fixture(); f.core.hp = 900; f.player.x = f.core.x - 530;
      Object.assign(f.controller.state, { introduced: true, secondPhase: true, pulseQueued: true, nextActionAt: 0 });
      f.step();
      const attack = f.controller.state.attack!;
      expect(attack.range).toBeGreaterThan(530);
      if (moveIntoGap) {
        const safeAngle = attack.angle - attack.halfAngle + .06;
        const goal = { x: f.core.x + Math.cos(safeAngle) * 530, y: f.core.y + Math.sin(safeAngle) * 530 };
        for (let i = 0; i < Math.ceil(2.2 * 60); i++) {
          const dx = goal.x - f.player.x, dy = goal.y - f.player.y, distance = Math.hypot(dx, dy);
          if (distance > 0) {
            const amount = Math.min(distance, BALANCE.speed * BALANCE.step);
            f.player.x += dx / distance * amount; f.player.y += dy / distance * amount;
          }
          f.step();
        }
      } else f.advance(2.2);
      expect(f.commands.filter(command => command.kind === 'damagePlayer' && command.reason === 'heart-boss-pulse'))
        .toHaveLength(moveIntoGap ? 0 : 1);
    }
  });

  it('ignores inactive ticks without advancing a locked windup or its gap', () => {
    const f = fixture(); f.core.hp = 900;
    Object.assign(f.controller.state, { introduced: true, secondPhase: true, pulseQueued: true, nextActionAt: 0 });
    f.step(); const before = structuredClone(f.controller.state);
    f.context.active = false;
    for (let i = 0; i < 120; i++) expect(f.controller.tick(f.context)).toEqual([]);
    expect(f.controller.state).toEqual(before);
    f.context.active = true; f.step();
    expect(f.controller.state.attack?.id).toBe(before.attack!.id);
    expect(f.controller.state.attack?.angle).toBe(before.attack!.angle);
  });

  it('preserves the old campaign sweep range, windup, width and damage', () => {
    const old = fixture(false); old.player.x = old.core.x - 530;
    while (!old.controller.state.attack) old.step();
    const attack = old.controller.state.attack!;
    expect(attack.range).toBe(MOTHER_CORE_BALANCE.sweepRange);
    expect(attack.halfAngle).toBe(MOTHER_CORE_BALANCE.sweepHalfAngle);
    expect(attack.resolveAt - attack.startedAt).toBeCloseTo(MOTHER_CORE_BALANCE.sweepWindup);
    old.advance(1.3);
    expect(old.commands.filter(command => command.kind === 'damagePlayer')).toHaveLength(0);
    expect(old.controller.state.nextActionAt - old.controller.state.phaseStartedAt).toBeCloseTo(MOTHER_CORE_BALANCE.recovery);
    const close = fixture(false); close.player.x = close.core.x + 200;
    while (!close.controller.state.attack) close.step();
    close.advance(1.3);
    expect(close.commands.filter(command => command.kind === 'damagePlayer'))
      .toEqual([expect.objectContaining({ amount: MOTHER_CORE_BALANCE.sweepPlayerDamage })]);
  });
});
