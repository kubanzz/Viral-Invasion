import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BattleDirector } from '../../src/game/battle';
import { TACTICAL_RECORD_LIMIT } from '../../src/game/tacticalFeedback';
import { campaignOverlay } from '../../src/ui/campaignHud';
import { battleOverlay } from '../../src/ui/battleHud';
import type { GameState } from '../../src/game/types';

const create = (milestone: 'G1' | 'G3' = 'G3') => {
  const session = new GameSession(71, { campaign: true, milestone }); session.start(); return session;
};
/** Explicit feedback/event fixtures, not legal-input victories or human comprehension evidence. */
const at = (session: GameSession, seconds: number) => { session.state.tick = Math.round(seconds * 60); session.state.elapsed = seconds; };

describe('bounded tactical explanations and notification priority', () => {
  it.each(['EVOLUTION_WARNING', 'MIGRATION_WARNING', 'INFECTION_CRISIS_STARTED'])('protects %s from scan, repair and routine action spam, then expires', type => {
    const session = create();
    session.emit(type, { trait: 'CARAPACE', duration: 8 });
    const important = session.state.message, until = session.state.messageUntil;
    const before = { hp: session.state.player.hp, tissue: session.state.tissue.hp, infection: session.state.battle!.pressure.infection };
    for (let i = 0; i < 20; i++) { session.message('扫描正在充能。', 1); session.message('组织修复 +25。', 3); new BattleDirector(session).notice('定向冲流完成。', 4); }
    expect(session.state.message).toBe(important); expect(session.state.messageUntil).toBe(until);
    expect({ hp: session.state.player.hp, tissue: session.state.tissue.hp, infection: session.state.battle!.pressure.infection }).toEqual(before);
    at(session, until);
    session.message('扫描已完成。', 3);
    expect(session.state.message).toBe('扫描已完成。'); expect(session.state.messagePriority).toBe(0);
  });

  it('a crisis interrupts an evolution warning and recovery replaces its own urgent explanation', () => {
    const session = create();
    session.emit('EVOLUTION_WARNING', { trait: 'MIMIC', duration: 8 });
    session.emit('INFECTION_CRISIS_STARTED', { deadline: 15 });
    expect(session.state.message).toContain('感染负荷 100');
    session.emit('MIGRATION_WARNING', { deadline: 12 });
    expect(session.state.message).toContain('感染负荷 100');
    session.emit('INFECTION_CRISIS_RECOVERED', { infection: 99 });
    expect(session.state.message).toContain('倒计时解除');
    expect(session.state.tacticalRecords?.some(record => record.eventType === 'MIGRATION_WARNING')).toBe(true);
  });

  it.each(['G1', 'G3'] as const)('retains critical causes after more than 512 raw events and 128 recent messages in %s', milestone => {
    const session = create(milestone), director = new BattleDirector(session);
    session.emit('EVOLUTION_WARNING', { trait: 'FISSION', duration: 8 });
    session.emit('INFECTION_CRISIS_STARTED', { deadline: 15 });
    session.emit('CORE_MEMBRANE_BROKEN', { trait: 'FISSION', remaining: 1 });
    for (let i = 0; i < 900; i++) { at(session, i + 1); session.emit('SCAN_COMPLETED', { found: i % 4 }); director.notice(`普通操作 ${i}`, 1); }
    expect(session.state.events).toHaveLength(512); expect(session.state.battle!.history).toHaveLength(128);
    expect(session.state.events.some(event => event.type === 'CORE_MEMBRANE_BROKEN')).toBe(false);
    const markup = milestone === 'G3' ? campaignOverlay(session.state, false, false, false, true)! : battleOverlay(session.state, false, false, false, true)!;
    expect(markup).toContain('关键决策记录'); expect(markup).toContain('裂殖核膜已破'); expect(markup).toContain('感染负荷 100');
    expect(markup).toContain('反制：'); expect(session.state.tacticalRecords!.length).toBeLessThanOrEqual(TACTICAL_RECORD_LIMIT);
  });

  it('aggregates repeated categories despite arbitrary event IDs and resets presentation state on restart', () => {
    const session = create();
    for (let i = 0; i < 2000; i++) { at(session, i); session.emit('ORGAN_ALARM', { organId: 'heart', eventId: `trip-${i}`, integrity: 20 }); }
    expect(session.state.tacticalRecords).toHaveLength(1);
    expect(session.state.tacticalRecords![0]).toMatchObject({ firstAt: 0, at: 1999, count: 2000 });
    const markup = campaignOverlay(session.state, false, false, false, true)!;
    expect(markup).toContain('本局发生 2000 次');
    session.restart(); expect(session.state.tacticalRecords ?? []).toEqual([]); expect(session.state.messagePriority).toBeUndefined();
    session.message('新的开局提示'); expect(session.state.message).toBe('新的开局提示');
  });

  it('keeps an unmodified compatibility snapshot renderable and escapes recorded text', () => {
    const session = create();
    const legacy: GameState = structuredClone(session.state); delete legacy.tacticalRecords; delete legacy.messagePriority;
    expect(campaignOverlay(legacy, false, false, false, true)).not.toContain('undefined');
    session.emit('RUN_ENDED', { reason: '<img src=x onerror=bad()>' });
    expect(campaignOverlay(session.state, false, false, false, true)).toContain('&lt;img');
    expect(campaignOverlay(session.state, false, false, false, true)).not.toContain('<img src=x');
  });

  it('uses the actual producer field names for sources, elites, offscreen pressure and travel', () => {
    const session = create(), director = new BattleDirector(session);
    const source = session.state.targets.find(target => target.role === 'source')!;
    director.cleared(source);
    director.cleared({ ...source, id: 'fixture-elite', role: 'elite', traits: ['CARAPACE'] });
    session.emit('BACKGROUND_PRESSURE', { organId: 'lung', openSources: 2, integrityLoss: .7, tripLoss: 1.4, totalLoss: 1.4, reason: 'residual-open-source' });
    session.emit('ORGAN_TRAVELLED', { from: 'heart', to: 'lung', eventId: 'fixture-trip', backgroundLoss: 1.4 });
    const text = session.state.tacticalRecords!.map(record => record.text).join(' ');
    expect(text).toContain('心脏感染源已净化'); expect(text).toContain('心脏晶壳精英已清除');
    expect(text).toContain('肺部离场仍有 2 个开放感染源，本次损伤 0.7');
    expect(text).toContain('进入肺部；该器官离场期间损伤 1.4'); expect(text).not.toMatch(/NaN|undefined/);
  });
});
