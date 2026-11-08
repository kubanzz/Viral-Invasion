import { describe, expect, it } from 'vitest';
import { HEART_BOSS_BALANCE as B, MOTHER_CORE_BALANCE, MotherCoreController } from '../../src/game/motherCore';
import type { MotherCoreCommand, MotherCoreContext, MotherCoreDamageOrigin } from '../../src/game/motherCoreTypes';
import { BALANCE, type Player, type Target } from '../../src/game/types';

function fixture(expedition = true) {
  const core: Target = { id: 'heart-boss', x: 1000, y: 700, radius: 52, hp: B.hp, maxHp: B.hp,
    kind: 'single', role: 'core', traits: ['CARAPACE'], hitUntil: 0, scanned: false };
  const player: Player = { x: 800, y: 700, radius: 19, hp: 100, facing: 0, moving: false,
    dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 };
  const controller = new MotherCoreController({ coreId: core.id, organId: 'heart', traits: ['CARAPACE'], tick: 0, elapsed: 0, heartExpedition: expedition });
  const context: MotherCoreContext = { tick: 0, elapsed: 0, active: true, core, player, liveGuardCount: 0,
    tissue: { x: 1200, y: 700, radius: 40, hp: 100, maxHp: 100 },
    geometry: { width: 2400, height: 1500, bounds: { left: 0, right: 2400, top: 0, bottom: 1500 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } } };
  const commands: MotherCoreCommand[] = [];
  const step = () => { context.tick++; context.elapsed = context.tick / 60; const next = controller.tick(context); commands.push(...next); return next; };
  const advance = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) step(); };
  const damage = (amount: number, origin?: MotherCoreDamageOrigin) => { const allowed = controller.damageLimit(context, amount, origin); core.hp -= allowed; return allowed; };
  const nextAttack = (kind?: string) => {
    for (let i = 0; i < 2400 && (!controller.state.attack || kind && controller.state.attack.kind !== kind); i++) step();
    expect(controller.state.attack).not.toBeNull(); return structuredClone(controller.state.attack!);
  };
  const stage = (stage: 2 | 3) => { while (controller.state.heartBoss!.stage < stage) { damage(100000, { rootId: `bar:${controller.state.heartBoss!.stage}` }); step(); } };
  return { controller, core, player, context, commands, step, advance, damage, nextAttack, stage };
}

describe('heart expedition three real health bars', () => {
  it('requires three independent transactions and rejects root or cast continuations across a break', () => {
    const f = fixture();
    expect(f.damage(100000, { rootId: 'root:a', castId: 'cast:a' })).toBe(B.barHp); expect(f.core.hp).toBe(B.barHp * 2);
    expect(f.damage(100000, { rootId: 'root:a', castId: 'cast:a' })).toBe(0);
    f.step(); expect(f.controller.state.heartBoss!.stage).toBe(2);
    expect(f.damage(100000, { rootId: 'root:a', castId: 'different' })).toBe(0);
    expect(f.damage(100000, { rootId: 'new-root', castId: 'cast:a' })).toBe(0);
    // The 0.6-second presentation is not an invulnerability gate.
    expect(f.damage(100000, { rootId: 'root:b' })).toBe(B.barHp); f.step();
    expect(f.controller.state.heartBoss!.stage).toBe(3);
    expect(f.damage(100000, { rootId: 'root:c' })).toBe(B.barHp); f.step();
    expect(f.core.hp).toBe(0); expect(f.controller.state.cleared).toBe(true);
    expect(f.commands.filter(c => c.kind === 'log' && c.type === 'HEART_BOSS_BAR_BROKEN')).toHaveLength(2);
    expect(f.commands.filter(c => c.kind === 'log' && c.type === 'CORE_CLEARED')).toHaveLength(1);
    f.step(); expect(f.commands.filter(c => c.kind === 'log' && c.type === 'CORE_CLEARED')).toHaveLength(1);
  });

  it('clamps intermediate hits, rejects invalid damage, and retains transaction guards after serialization', () => {
    const f = fixture(); expect(f.damage(NaN)).toBe(0); expect(f.damage(-2)).toBe(0);
    expect(f.damage(B.barHp - 10, { castId: 'burst' })).toBe(B.barHp - 10); expect(f.damage(40, { castId: 'burst' })).toBe(10); f.step();
    expect(f.damage(40, { castId: 'burst' })).toBe(0);
    const saved = JSON.parse(JSON.stringify(f.controller.state));
    const restored = new MotherCoreController({ coreId: f.core.id, organId: 'heart', traits: ['CARAPACE'], tick: f.context.tick, elapsed: f.context.elapsed, heartExpedition: true }, saved);
    expect(restored.state).toEqual(f.controller.state); expect(restored.damageLimit(f.context, 100, { castId: 'burst' })).toBe(0);
  });

  it('cancels the previous telegraph and gives a complete next warning after the 0.6-second transition', () => {
    const f = fixture(), first = f.nextAttack(); f.damage(100000, { rootId: 'break' }); f.step();
    expect(f.controller.state.attack).toBeNull(); expect(f.controller.state.nextActionAt - f.context.elapsed).toBeCloseTo(.6);
    const second = f.nextAttack(); expect(second.id).not.toBe(first.id); expect(second.resolveAt - second.startedAt).toBeCloseTo(1.2);
    expect(f.commands.some(c => c.kind === 'damagePlayer' && c.attackId === first.id)).toBe(false);
  });
});

describe('heart expedition readable threats and safe space', () => {
  it('locks a 1.2-second 24-damage sweep, reaches firing range, and permits a real side step', () => {
    for (const dodge of [false, true]) {
      const f = fixture(); f.player.x = f.core.x - 530; const attack = f.nextAttack();
      expect(attack).toMatchObject({ kind: 'crystal-sweep', range: 620, damage: 24 }); expect(attack.resolveAt - attack.startedAt).toBeCloseTo(1.2);
      while (f.context.elapsed < attack.resolveAt + .02) {
        if (dodge) f.player.y += BALANCE.speed * BALANCE.step; f.step();
        if (f.controller.state.attack?.id === attack.id) expect(f.controller.state.attack.angle).toBe(attack.angle);
      }
      const hits = f.commands.filter(c => c.kind === 'damagePlayer' && c.attackId === attack.id);
      expect(hits).toHaveLength(dodge ? 0 : 1); if (!dodge) expect(hits[0]).toMatchObject({ amount: 24 });
    }
  });

  it('locks a 0.95-second 20-damage circle and lets moving players escape', () => {
    for (const dodge of [false, true]) {
      const f = fixture(), attack = f.nextAttack('heart-marked-strike'); expect(attack.resolveAt - attack.startedAt).toBeCloseTo(.95);
      if (dodge) f.player.y += attack.radius + f.player.radius + 2; f.advance(1);
      const hits = f.commands.filter(c => c.kind === 'damagePlayer' && c.attackId === attack.id);
      expect(hits).toHaveLength(dodge ? 0 : 1); if (!dodge) expect(hits[0]).toMatchObject({ amount: 20 });
    }
  });

  it('has a real pulse gap, at most one hit and 30/32 stage-specific damage', () => {
    for (const stage of [2, 3] as const) for (const safe of [false, true]) {
      const f = fixture(); f.stage(stage); const attack = f.nextAttack('heart-pulse');
      if (safe) { f.player.x = f.core.x + Math.cos(attack.angle) * 200; f.player.y = f.core.y + Math.sin(attack.angle) * 200; }
      f.advance(2.2); const hits = f.commands.filter(c => c.kind === 'damagePlayer' && c.attackId === attack.id);
      expect(hits).toHaveLength(safe ? 0 : 1); if (!safe) expect(hits[0]).toMatchObject({ amount: stage === 2 ? 30 : 32 });
    }
  });

  it('telegraphs each final-stage sweep separately and starts the pulse after both sweeps', () => {
    const f = fixture(); f.stage(3); const first = f.nextAttack();
    expect(first.sweepStep).toBe(1); expect(first.resolveAt - first.startedAt).toBeCloseTo(1.1); f.player.y += 200;
    while (f.controller.state.attack?.id === first.id) f.step();
    const second = f.nextAttack(); expect(second.sweepStep).toBe(2); expect(second.resolveAt - second.startedAt).toBeCloseTo(.75);
    expect(second.angle).not.toBe(first.angle); expect(second.damage).toBe(28); expect(second.startedAt).toBeGreaterThan(first.resolveAt);
    while (f.controller.state.attack?.id === second.id) f.step();
    const pulse = f.nextAttack(); expect(pulse.kind).toBe('heart-pulse'); expect(pulse.startedAt).toBeGreaterThan(second.resolveAt);
  });

  it('respects physical cover and dash invulnerability', () => {
    const covered = fixture(); covered.player.x -= 330;
    covered.context.geometry.obstacles = [{ id: 'cover', x: 800, y: 700, radius: 45 }];
    const first = covered.nextAttack(); covered.advance(1.3);
    expect(covered.commands.some(c => c.kind === 'damagePlayer' && c.attackId === first.id)).toBe(false);
    const dash = fixture(), second = dash.nextAttack(); dash.player.dashUntil = second.resolveAt + .1; dash.advance(1.3);
    expect(dash.commands.some(c => c.kind === 'damagePlayer' && c.attackId === second.id)).toBe(false);
  });

  it('warns for one second, spawns 4x68HP guards every 12 seconds, caps alive guards at six and replenishes losses', () => {
    const f = fixture(); f.stage(2); const first = f.nextAttack('heart-guard-call');
    expect(first.resolveAt - first.startedAt).toBeCloseTo(1); expect(first.landings).toHaveLength(4); f.advance(1.05);
    const firstWave = f.commands.filter(c => c.kind === 'spawn'); expect(firstWave).toHaveLength(4);
    expect(firstWave.every(c => c.kind === 'spawn' && c.hp === 68 && c.sourceId === `${f.core.id}:guard`)).toBe(true);
    f.context.liveGuardCount = 4; const second = f.nextAttack('heart-guard-call');
    expect(second.startedAt - first.startedAt).toBeGreaterThanOrEqual(12); expect(second.landings).toHaveLength(2); f.advance(1.05);
    expect(f.commands.filter(c => c.kind === 'spawn')).toHaveLength(6); f.context.liveGuardCount = 6; f.advance(15);
    expect(f.commands.filter(c => c.kind === 'spawn')).toHaveLength(6);
    f.context.liveGuardCount = 2; f.nextAttack('heart-guard-call'); f.advance(1.05); expect(f.commands.filter(c => c.kind === 'spawn')).toHaveLength(10);
  });
});

describe('heart toughness and compatibility', () => {
  it('breaks at 100, cancels threats, opens exactly 1.2 seconds and restores toughness', () => {
    const f = fixture(); const attack = f.nextAttack(); expect(f.controller.damageToughness(f.context, 40)).toHaveLength(1);
    expect(f.controller.state.heartBoss!.toughness).toBe(60);
    const commands = f.controller.damageToughness(f.context, 60);
    expect(commands.some(c => c.kind === 'log' && c.type === 'HEART_BOSS_STAGGERED')).toBe(true);
    expect(f.controller.state.attack).toBeNull(); expect(f.controller.state.nextActionAt - f.context.elapsed).toBeCloseTo(1.2);
    expect(f.controller.damageToughness(f.context, 100)).toEqual([]); f.advance(1.18); expect(f.controller.state.attack).toBeNull();
    f.advance(.04); expect(f.controller.state.heartBoss!.toughness).toBe(100);
    expect(f.commands.some(c => c.kind === 'damagePlayer' && c.attackId === attack.id)).toBe(false);
  });

  it('freezes inactive ticks, clears live pulses on death and preserves legacy campaign rules', () => {
    const f = fixture(); f.stage(2); f.nextAttack('heart-pulse'); const before = structuredClone(f.controller.state);
    f.context.active = false; for (let i = 0; i < 20; i++) expect(f.controller.tick(f.context)).toEqual([]);
    expect(f.controller.state).toEqual(before); f.context.active = true; f.advance(1.3);
    expect(f.controller.state.pulse).toBeDefined(); f.core.hp = 0; f.step(); expect(f.controller.state.pulse).toBeUndefined();
    const old = fixture(false), attack = old.nextAttack(); expect(old.controller.state.heartBoss).toBeUndefined();
    expect(attack.range).toBe(MOTHER_CORE_BALANCE.sweepRange); expect(attack.resolveAt - attack.startedAt).toBeCloseTo(MOTHER_CORE_BALANCE.sweepWindup);
    expect(old.controller.damageToughness(old.context, 100)).toEqual([]); expect(old.damage(100000)).toBe(old.core.maxHp / 2);
  });
});
