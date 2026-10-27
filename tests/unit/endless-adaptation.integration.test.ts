import { describe, expect, it } from 'vitest';
import { EndlessDirector } from '../../src/game/endless';
import { ENDLESS_EVOLUTION_TACTICS } from '../../src/game/endlessEvolution';
import { GameSession } from '../../src/game/session';
import type { TraitId } from '../../src/game/battleTypes';
import type { GameEvent, InputFrame } from '../../src/game/types';

const idle = (session: GameSession, extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aim: session.state.player, fire: false, ...extra });

/** Explicit end-of-wave fixture, followed only by normal fixed-update inputs. */
function boundary(seed = 71) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const s = session.state, e = s.endless!;
  s.targets = [];
  Object.assign(e, { wave: 19, clearedWaves: 19, phase: 'intermission', phaseUntil: 0, remainingToSpawn: 0,
    traits: ['CARAPACE', 'FISSION'], evolution: { history: [], recentPrimaries: ['CARAPACE', 'FISSION', 'MIMIC'] } });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const advance = (ticks: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < ticks; i++) session.step(idle(session, extra)); };
  return { session, s, e, events, advance };
}

describe('announced endless generations in the actual session', () => {
  it('keeps old active traits for480 real ticks and commits the announced set before actual births', () => {
    const f = boundary(); f.advance(1);
    const pending = structuredClone(f.e.evolution!.pending!);
    expect(pending).toBeDefined(); expect(f.e.phase).toBe('warning'); expect(f.e.wave).toBe(20);
    expect(pending.appliesAt - pending.warnedAt).toBeCloseTo(8);
    expect(f.e.traits).toEqual(['CARAPACE', 'FISSION']); expect(f.s.targets).toHaveLength(0);
    const warning = f.events.find(event => event.type === 'ENDLESS_WAVE_WARNING')!;
    expect(warning.data.traits).toBe(pending.decision.traits.join('+'));
    f.advance(479); expect(f.s.targets).toHaveLength(0); expect(f.e.traits).toEqual(['CARAPACE', 'FISSION']);
    expect(f.e.evolution!.pending).toEqual(pending);
    f.advance(1); expect(f.e.phase).toBe('combat'); expect(f.e.evolution!.pending).toBeUndefined();
    expect(f.e.traits).toEqual(pending.decision.traits); expect(f.s.battle!.traits).toEqual(f.e.traits);
    const applied = f.events.filter(event => event.type === 'ENDLESS_EVOLUTION_APPLIED'); expect(applied).toHaveLength(1);
    expect(applied[0].tick - warning.tick).toBe(480);
    const elite = f.s.targets.find(target => target.role === 'elite')!;
    expect(elite).toBeDefined(); expect(elite.traits).toEqual([pending.decision.main]);
    expect(elite.tactic).toBe(ENDLESS_EVOLUTION_TACTICS[pending.decision.main]); expect(elite.maxHp).toBe(204);
    for (const target of f.s.targets) {
      expect(target.traits!.every(trait => f.e.traits.includes(trait))).toBe(true);
      expect(target.traits!.length).toBeLessThanOrEqual(1);
      if (target.tactic === 'thin-ray') { expect(target.traits).toEqual([]); expect(target.maxHp).toBe(68); }
    }
  });

  it('freezes the complete warning on pause and never rerolls it on accepted Q inputs', () => {
    const f = boundary(); f.advance(1); const pending = structuredClone(f.e.evolution!.pending);
    f.session.pause(); const paused = f.session.snapshot(); f.advance(180, { scan: true, fire: true, moveX: 1 });
    expect(f.session.snapshot()).toEqual(paused); f.session.resume();
    f.advance(120, { scan: true });
    expect(f.e.evolution!.pending).toEqual(pending);
    expect(f.events.filter(event => event.type === 'ENDLESS_EVOLUTION_WARNING')).toHaveLength(1);
    expect(f.e.traits).toEqual(['CARAPACE', 'FISSION']); expect(f.s.targets).toHaveLength(0);
  });

  it('carries the committed generation through the next four waves without reading new behavior', () => {
    const f = boundary(); f.advance(481); const committed = structuredClone(f.e.evolution!.current!);
    // Director-only continuation: all battle/kill/XP claims stay in the natural
    // public-input evidence. This fixture isolates plan carry and queue identity.
    const director = new EndlessDirector({ state: f.s, emit(type, data) { f.events.push({ type, data, tick: f.s.tick }); },
      message() {}, effect() {}, completeWave() {} });
    for (let wave = 21; wave <= 24; wave++) {
      Object.assign(f.e, { wave: wave - 1, phase: 'intermission', phaseUntil: f.s.elapsed }); f.s.targets = [];
      f.e.evolution!.history = [{ tick: f.s.tick, precisionDamage: wave * 1000, areaDamage: 0, scans: wave, isolations: 0, repaired: 0 }];
      director.beforeInput();
      expect(f.e.wave).toBe(wave); expect(f.e.evolution!.pending).toBeUndefined(); expect(f.e.warningSeconds).toBe(2);
      expect(f.e.traits).toEqual(committed.traits); expect(f.e.evolution!.current).toEqual(committed);
    }
    expect(f.events.filter(event => event.type === 'ENDLESS_EVOLUTION_WARNING')).toHaveLength(1);
  });

  it('clears both active and pending evolution evidence on a public new run', () => {
    const f = boundary(); f.advance(481); expect(f.e.evolution!.current).toBeDefined();
    f.session.start(71);
    expect(f.session.state.tick).toBe(0); expect(f.session.state.endless!.wave).toBe(1);
    expect(f.session.state.endless!.evolution).toEqual({ history: [], recentPrimaries: [] });
    expect(f.session.state.endless!.traits).toEqual([]);
  });
});
