import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { ORGAN_CRISIS_POSITIONS } from '../../src/game/campaignEncounters';
import { recordTacticalEvent, tacticalFeedback, TACTICAL_RECORD_LIMIT } from '../../src/game/tacticalFeedback';
import { campaignOverlay } from '../../src/ui/campaignHud';
import type { GameEvent } from '../../src/game/types';

const create = () => { const session = new GameSession(71, { campaign: true, milestone: 'G3' }); session.start(); return session; };
const at = (session: GameSession, tick: number) => { session.state.tick = tick; session.state.elapsed = tick / 60; };
const started = (organId: 'heart' | 'lung' = 'heart', blockedByAirway = false): GameEvent['data'] => ({ organId, sourceId: `${organId}-crisis-source`, chargeSeconds: 8, maximumImpacts: 3, blockedByAirway });

/** Mechanism fixture at III: subsequent spawn, pulse, damage and clear use the real host. */
function actualCrisis() {
  const session = create(), state = session.state, campaign = state.campaign!;
  campaign.encounters!.stage = 'III'; campaign.migration.status = 'resolved'; campaign.migration.choice = 'block'; campaign.core.organId = 'heart';
  state.battle!.traits = ['CARAPACE', 'FISSION']; state.battle!.encounter!.firstCounter.status = 'resolved';
  Object.assign(state.player, state.battle!.pulse.origin);
  const step = (input: { fire?: boolean; tool?: 1 | 2 | 3; interact?: boolean } = {}) => session.step({ moveX: 0, moveY: 0, aim: ORGAN_CRISIS_POSITIONS.heart, fire: false, ...input });
  // The accepted spawn queues lifecycle logs for the next fixed-step flush.
  step(); step();
  return { session, state, step };
}

describe('accepted organ-crisis explanations remain reviewable', () => {
  it('records actual host spawn, directional interruption and clear, replacing the live alarm', () => {
    const { session, state, step } = actualCrisis();
    expect(state.tacticalRecords?.find(record => record.eventType === 'ORGAN_CRISIS_STARTED')?.text).toContain('开始 8 秒充能');
    step({ interact: true });
    expect(state.campaign!.encounters!.crisis.interruptions).toBe(1);
    expect(state.tacticalRecords?.find(record => record.eventType === 'ORGAN_CRISIS_INTERRUPTED')?.text).toContain('心脏冲流已打断');
    step({ fire: true, tool: 1 }); for (let i = 0; i < 12; i++) step(); step({ fire: true, tool: 1 });
    expect(state.campaign!.encounters!.crisis.status).toBe('cleared');
    const cleared = state.tacticalRecords?.find(record => record.eventType === 'ORGAN_CRISIS_CLEARED');
    expect(cleared?.text).toContain('实际冲击 0 次、中断 1 次');
    expect(state.message).toContain('冲击已停止'); expect(state.message).not.toContain('8 秒后冲击');
    const history = campaignOverlay(state, false, false, false, true)!;
    expect(history).toContain('开始 8 秒充能'); expect(history).toContain('心脏冲流已打断'); expect(history).toContain('实际冲击 0 次、中断 1 次');
    expect(session.state.player.hp).toBeGreaterThan(0);
  });

  it('distinguishes preclosed airways from actual interruptions without inventing damage or restoration', () => {
    const session = create();
    session.emit('ORGAN_CRISIS_STARTED', started('lung', true));
    expect(session.state.message).toContain('气道已关闭，冲击充能暂停'); expect(session.state.message).not.toContain('8 秒后');
    expect(session.state.tacticalRecords?.some(record => record.eventType === 'ORGAN_CRISIS_INTERRUPTED')).toBe(false);
    at(session, 1); session.emit('ORGAN_CRISIS_INTERRUPTED', { organId: 'lung', sourceId: 'lung-crisis-source', reason: 'airway', interruptions: 1, chargeSeconds: 8 });
    expect(session.state.message).toContain('肺部气道已截断');
    at(session, 2); session.emit('ORGAN_CRISIS_CLEARED', { organId: 'lung', sourceId: 'lung-crisis-source', impacts: 1, interruptions: 1 });
    expect(session.state.message).toContain('实际冲击 1 次、中断 1 次');
    expect(session.state.message).not.toMatch(/恢复完整度|避免了|损伤 −6|已修复/);
  });

  it('rejects malformed or unsupported event primitives instead of guessing a cause', () => {
    for (const data of [{ ...started(), organId: 'brain' }, { ...started(), sourceId: '' }, { ...started(), chargeSeconds: NaN }, { ...started(), maximumImpacts: -1 }, { ...started(), blockedByAirway: undefined }]) {
      expect(tacticalFeedback({ type: 'ORGAN_CRISIS_STARTED', tick: 0, data: data as GameEvent['data'] })).toBeUndefined();
    }
    expect(tacticalFeedback({ type: 'ORGAN_CRISIS_INTERRUPTED', tick: 0, data: { organId: 'heart', sourceId: 'heart-crisis-source', reason: 'airway', interruptions: 1, chargeSeconds: 8 } })).toBeUndefined();
    expect(tacticalFeedback({ type: 'ORGAN_CRISIS_INTERRUPTED', tick: 0, data: { organId: 'lung', sourceId: 'lung-crisis-source', reason: 'unknown', interruptions: 1, chargeSeconds: 8 } })).toBeUndefined();
    expect(tacticalFeedback({ type: 'ORGAN_CRISIS_CLEARED', tick: 0, data: { organId: 'heart', sourceId: 'heart-crisis-source', impacts: -1, interruptions: 0 } })).toBeUndefined();
  });

  it('deduplicates delivery and aggregates later accepted events using finite categories', () => {
    const session = create();
    session.emit('ORGAN_CRISIS_STARTED', started()); session.emit('ORGAN_CRISIS_STARTED', started());
    expect(session.state.tacticalRecords).toHaveLength(1); expect(session.state.tacticalRecords![0].count).toBe(1);
    at(session, 1); session.emit('ORGAN_CRISIS_CLEARED', { organId: 'heart', sourceId: 'heart-crisis-source', impacts: 0, interruptions: 0 });
    const message = session.state.message;
    expect(recordTacticalEvent(session.state, { type: 'ORGAN_CRISIS_STARTED', tick: 0, data: started() })).toBeUndefined();
    expect(session.state.message).toBe(message);
    for (let tick = 2; tick < 202; tick++) {
      at(session, tick);
      session.emit('ORGAN_CRISIS_INTERRUPTED', { organId: 'heart', sourceId: `arbitrary-source-${tick}`, reason: 'pulse', interruptions: tick - 1, chargeSeconds: 8 });
    }
    expect(session.state.tacticalRecords).toHaveLength(3);
    expect(session.state.tacticalRecords!.find(record => record.eventType === 'ORGAN_CRISIS_INTERRUPTED')).toMatchObject({ firstAt: 2 / 60, at: 201 / 60, count: 200 });
    expect(session.state.tacticalRecords!.every(record => !record.key.includes('arbitrary-source'))).toBe(true);
    expect(session.state.tacticalRecords!.length).toBeLessThanOrEqual(TACTICAL_RECORD_LIMIT);
  });

  it('keeps all three causes visible after the raw log and recent messages have been evicted', () => {
    const session = create();
    session.emit('ORGAN_CRISIS_STARTED', started());
    at(session, 1); session.emit('ORGAN_CRISIS_INTERRUPTED', { organId: 'heart', sourceId: 'heart-crisis-source', reason: 'pulse', interruptions: 1, chargeSeconds: 8 });
    at(session, 2); session.emit('ORGAN_CRISIS_CLEARED', { organId: 'heart', sourceId: 'heart-crisis-source', impacts: 2, interruptions: 1 });
    for (let tick = 3; tick < 903; tick++) { at(session, tick); session.emit('TOOL_SELECTED', { tool: tick % 3 + 1 }); session.state.battle!.history.push({ at: session.state.elapsed, text: '普通工具操作' }); if (session.state.battle!.history.length > 128) session.state.battle!.history.shift(); }
    expect(session.state.events).toHaveLength(512); expect(session.state.events.some(event => event.type.startsWith('ORGAN_CRISIS_'))).toBe(false);
    const history = campaignOverlay(session.state, false, false, false, true)!;
    expect(history).toContain('开始 8 秒充能'); expect(history).toContain('心脏冲流已打断'); expect(history).toContain('实际冲击 2 次、中断 1 次');
  });

  it('retains records under higher-priority danger, freezes lifecycle feedback on pause/end and resets on restart', () => {
    const session = create();
    session.emit('INFECTION_CRISIS_STARTED', {}); const danger = session.state.message;
    session.emit('ORGAN_CRISIS_STARTED', started()); expect(session.state.message).toBe(danger);
    expect(session.state.tacticalRecords?.some(record => record.eventType === 'ORGAN_CRISIS_STARTED')).toBe(true);
    session.pause(); const paused = structuredClone(session.state.tacticalRecords);
    session.emit('ORGAN_CRISIS_CLEARED', { organId: 'heart', sourceId: 'heart-crisis-source', impacts: 0, interruptions: 0 });
    expect(session.state.tacticalRecords).toEqual(paused);
    session.resume(); session.finish(false, '机制测试结束'); const ended = structuredClone(session.state.tacticalRecords);
    session.emit('ORGAN_CRISIS_CLEARED', { organId: 'heart', sourceId: 'heart-crisis-source', impacts: 0, interruptions: 0 });
    expect(session.state.tacticalRecords).toEqual(ended);
    session.restart(); expect(session.state.tacticalRecords ?? []).toEqual([]); expect(session.state.message).not.toContain('危机源已净化');
  });
});
