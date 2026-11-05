import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { combatPopulation } from '../../src/game/combatPopulation';
import { advanceSmartViruses, advanceSmartVirusActor, cancelSmartSupports, planSmartSupports } from '../../src/game/smartViruses';
import type { GameEvent, Target } from '../../src/game/types';

const body = (id: string, extra: Partial<Target> = {}): Target => ({
  id, x: 1500, y: 1100, hp: 68, maxHp: 68, radius: 22, kind: 'single', role: 'virus', scanned: false,
  hitUntil: 0, sourceId: 'endless:wave:3', ...extra,
});
function fixture(wave = 3) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const s = game.state, e = s.endless!, events: GameEvent[] = [];
  s.world = { ...s.world!, obstacles: [] }; s.targets = []; Object.assign(s.player, { x: 1200, y: 1000 });
  const roles = Array.from({ length: 24 }, () => 'ordinary' as const);
  Object.assign(e, { wave, phase: 'combat', phaseStartedAt: 0, phaseUntil: 0, remainingToSpawn: 0, canceledToSpawn: 0,
    spawnedIds: [], spawnSerial: 0, clearedWaves: wave - 1, nextSpawnAt: 0, batchIndex: 8, batchMemberIndex: 0,
    batchSchedule: Array.from({ length: 8 }, (_, index) => ({ at: index, sector: 0, spread: .2, roles: roles.slice(index * 3, index * 3 + 3) })),
    territoryTasks: { wave, reservedSlots: [], squads: [] } });
  e.smartSupport = planSmartSupports(s.seed, wave, roles);
  e.smartSupport.plans = e.smartSupport.plans.filter(plan => plan.kind !== 'ritual');
  e.smartSupport.reservedSlots = e.smartSupport.plans.flatMap(plan => plan.slots);
  e.remainingToSpawn = e.smartSupport.reservedSlots.length;
  const host = { state: s, emit(type: string, data: GameEvent['data']) { events.push({ type, data, tick: s.tick }); } };
  const at = (seconds: number) => { s.elapsed = seconds; s.tick = Math.round(seconds * 60); advanceSmartViruses(host); };
  return { game, s, e, roles, host, events, at };
}

describe('independent smart-wave review regressions', () => {
  it('continues pending support work after every ordinary batch has been skipped, then clears once the born support dies', () => {
    const f = fixture(2);
    expect(f.e.batchIndex).toBe(f.e.batchSchedule.length); expect(f.e.remainingToSpawn).toBe(1);
    for (let step = 0; step < 450 && f.s.phase === 'playing'; step++)
      f.game.step({ moveX: 0, moveY: 0, aim: { ...f.s.player }, fire: false });
    const caster = f.s.targets.find(target => target.profession === 'slime-caster');
    expect(caster).toBeDefined(); expect(f.e.remainingToSpawn).toBe(0); expect(f.e.clearedWaves).toBe(1);
    caster!.hp = 0; caster!.deadAt = f.s.elapsed;
    f.game.step({ moveX: 0, moveY: 0, aim: { ...f.s.player }, fire: false });
    expect(f.e.clearedWaves).toBe(2);
    expect(f.s.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED' && event.data.wave === 2)).toHaveLength(1);
  });

  it('reserves seven brood descendants alongside a live fission parent, split promise, capsule and ordinary bodies', () => {
    const f = fixture();
    f.s.targets = [
      ...Array.from({ length: 36 }, (_, i) => body(`ordinary:${i}`)),
      body('live-parent', { traits: ['FISSION'], generation: 0 }),
      body('capsule', { role: 'capsule' }),
      body('split-promise', { hp: 0, splitAt: 100, splitPositions: [{ x: 1000, y: 600 }, { x: 1040, y: 600 }] }),
      body('neutral-event', { role: 'event' }),
    ];
    expect(combatPopulation(f.s)).toMatchObject({ reserved: 41, pending: 2 });
    f.at(2); f.at(6); expect(f.s.targets.some(target => target.profession === 'nest-builder')).toBe(false);
    f.s.targets[0].hp = 0; f.at(6.5);
    expect(combatPopulation(f.s)).toMatchObject({ reserved: 48, broodReserved: 7, pending: 2 });
    const plan = f.e.smartSupport!.plans[0], builder = f.s.targets.find(target => target.id === plan.builderId)!;
    builder.hp = 0; f.at(7); f.at(8);
    expect(f.e.canceledToSpawn).toBe(7); expect(f.e.remainingToSpawn).toBe(0);
    expect(combatPopulation(f.s)).toMatchObject({ reserved: 40, broodReserved: 0 });
    expect(f.events.filter(event => event.type === 'SMART_SUPPORT_CANCELED')).toHaveLength(1);
  });

  it('keeps the complete final quota canceled exactly once when the host already truncated the wave', () => {
    const f = fixture(); f.at(2); f.at(6);
    const plan = f.e.smartSupport!.plans[0], builder = f.s.targets.find(target => target.id === plan.builderId)!;
    f.e.canceledToSpawn += f.e.remainingToSpawn; f.e.remainingToSpawn = 0;
    f.s.territory!.stage = 'bossPending'; f.at(7); f.at(8);
    advanceSmartVirusActor(f.host, builder);
    expect(f.e.canceledToSpawn).toBe(7); expect(f.e.remainingToSpawn).toBe(0);
    expect(combatPopulation(f.s).broodReserved).toBe(0);
    expect(f.events.filter(event => event.type === 'SMART_SUPPORT_CANCELED')).toHaveLength(1);
    expect(f.s.targets.filter(target => target.hp > 0).map(target => target.id)).toEqual([builder.id]);
    cancelSmartSupports(f.host); expect(f.e.canceledToSpawn).toBe(7);
  });

  it('the shipped finite wave plan admits at most two casters and the shared slime cap includes windups', () => {
    const f = fixture(4); f.at(2); f.at(6); f.at(8); f.at(12);
    const casters = f.s.targets.filter(target => target.profession === 'slime-caster');
    expect(casters).toHaveLength(2);
    casters.forEach((caster, index) => { caster.x = f.s.player.x - 320; caster.y = f.s.player.y + index * 30; caster.attackReady = 0; });
    casters.forEach(caster => advanceSmartVirusActor(f.host, caster));
    expect(f.s.smartViruses!.slime).toHaveLength(2);
    expect(f.s.smartViruses!.slime.every(cast => cast.phase === 'windup')).toBe(true);
    for (let step = 0; step < 10; step++) { f.at(12 + step / 10); casters.forEach(caster => advanceSmartVirusActor(f.host, caster)); }
    expect(f.s.targets.filter(target => target.profession === 'slime-caster')).toHaveLength(2);
    expect(f.s.smartViruses!.slime.length).toBeLessThanOrEqual(2);
  });
});
