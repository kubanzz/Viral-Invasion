import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { preparationForPlan } from '../../src/game/preparation';
import { protocolRank } from '../../src/game/protocols';
import { ProfileStore, PROFILE_STORAGE_KEY, type ProfileStorage } from '../../src/meta/profile';
import { newRunOptions, replayRunOptions } from '../../src/meta/runOptions';
import { g3Input } from '../helpers/g3Driver';

function storage(): ProfileStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return { raw, getItem: key => raw.get(key) ?? null, setItem: (key, value) => { raw.set(key, value); }, removeItem: key => { raw.delete(key); } };
}
function nextLevel(session: GameSession, level: number) {
  for (let tick = 0; tick < 6000; tick++) {
    if (session.state.growth!.level >= level) return;
    if (session.state.phase !== 'playing') throw Error('Progress stopped before the requested XP threshold');
    session.step(g3Input(session.state, 'block'));
  }
  throw Error('Public-input progression exceeded 100 simulation seconds');
}

describe('starting plan, accepted session actions and archive continuity', () => {
  it('preloads a real I-rank squad, repays the first real XP threshold, then offers the next upgrade normally', () => {
    const session = new GameSession(13, { campaign: true, milestone: 'G3', preparation: preparationForPlan('IMMUNE_BEACON') }); session.start();
    const growth = session.state.growth!;
    expect(growth.xp).toBe(0); expect(growth.research).toBe(0); expect(growth.starterDebt).toBe(1);
    expect(growth.equipped).toEqual([{ id: 'IMMUNE_BEACON', tuning: 'balanced' }]);
    expect(session.state.events.some(event => event.type === 'PREPARATION_APPLIED')).toBe(true);
    session.step({ moveX: 0, moveY: 0, fire: false, aim: session.state.player, scan: true });
    expect(session.state.growth!.cells).toHaveLength(3);
    nextLevel(session, 1);
    expect(session.state.growth!.starterDebt).toBe(0);
    expect(session.state.growth!.draft).toBeNull(); expect(session.state.phase).toBe('playing');
    expect(session.state.events.filter(event => event.type === 'PREPARATION_REPAID')).toHaveLength(1);
    nextLevel(session, 2);
    const draft = session.state.growth!.draft!;
    expect(draft.source).toBe('xp'); expect(draft.level).toBe(2);
    const upgrade = draft.options.find(option => option.protocolId === 'IMMUNE_BEACON')!;
    expect(upgrade.rank).toBe(2);
    session.chooseDraft({ runId: session.state.growth!.runId, draftId: draft.id, optionId: upgrade.id });
    expect(protocolRank(session.state.growth!.equipped[0])).toBe(2);
    const previousId = session.state.runMetrics!.runId;
    session.restart();
    expect(session.state.growth!.equipped).toEqual([{ id: 'IMMUNE_BEACON', tuning: 'balanced' }]);
    expect(session.state.growth!.starterDebt).toBe(1); expect(session.state.growth!.xp).toBe(0);
    expect(session.state.growth!.research).toBe(0); expect(session.state.growth!.cells).toHaveLength(0);
    expect(session.state.runMetrics!.runId).not.toBe(previousId);
  });

  it('keeps a fresh archive on field response and unlocks only after recording a carried protocol from an ended session', () => {
    const disk = storage(), profile = new ProfileStore(disk);
    expect(profile.selectStartingPlan('IMMUNE_BEACON')).toBe(false);
    const session = new GameSession(13, { campaign: true, milestone: 'G3', ...newRunOptions(profile.data) }); session.start();
    expect(session.state.growth!.equipped).toHaveLength(0);
    nextLevel(session, 1);
    const draft = session.state.growth!.draft!, option = draft.options.find(item => item.protocolId === 'IMMUNE_BEACON')!;
    session.chooseDraft({ runId: session.state.growth!.runId, draftId: draft.id, optionId: option.id });
    expect(profile.recordRun(session.state, 'not-ended').kind).toBe('rejected');
    expect(profile.selectStartingPlan('IMMUNE_BEACON')).toBe(false);
    // Explicit terminal-boundary fixture for serialization, not actual defeat evidence.
    session.finish(false, 'Unit fixture: end an otherwise legally played session.');
    profile.recordRun(session.state, 'legally-carried');
    expect(profile.data.unlockedProtocols).toContain('IMMUNE_BEACON');
    expect(profile.selectStartingPlan('IMMUNE_BEACON')).toBe(true);
    const reloaded = new ProfileStore(disk);
    expect(reloaded.data.startingPlan).toBe('IMMUNE_BEACON');
    expect(newRunOptions(reloaded.data).preparation).toEqual(preparationForPlan('IMMUNE_BEACON'));
    const record = reloaded.data.recentRuns[0];
    expect(replayRunOptions(record.encounter!).preparation).toEqual(preparationForPlan('field'));
    expect(record.review).toBeDefined();
    expect(profile.selectStartingPlan('PULSE_BREAK')).toBe(false);
  });

  it('persists a prepared best/recent replay independently of menu preference and defaults old records to field', () => {
    const disk = storage(), profile = new ProfileStore(disk);
    const session = new GameSession(91, { campaign: true, milestone: 'G3', preparation: preparationForPlan('IMMUNE_BEACON') }); session.start();
    // Serialization fixture only: outcome is not a gameplay victory claim.
    session.finish(true, 'Unit fixture: serialize preparation metadata.'); profile.recordRun(session.state, 'prepared-best');
    expect(profile.selectStartingPlan('field')).toBe(true);
    const loaded = new ProfileStore(disk), best = loaded.data.best.fastestVictory!;
    expect(loaded.data.startingPlan).toBe('field');
    expect(replayRunOptions(best.encounter!).preparation).toEqual(preparationForPlan('IMMUNE_BEACON'));
    const old = JSON.parse(disk.raw.get(PROFILE_STORAGE_KEY)!);
    delete old.startingPlan; delete old.best.fastestVictory.encounter.preparation;
    delete old.recentRuns[0].encounter.preparation; delete old.recentRuns[0].review;
    disk.raw.set(PROFILE_STORAGE_KEY, JSON.stringify(old));
    const legacy = new ProfileStore(disk);
    expect(legacy.status.code).toBe('loaded'); expect(legacy.data.startingPlan).toBe('field');
    expect(legacy.data.recentRuns[0].review).toBeUndefined();
    expect(replayRunOptions(legacy.data.recentRuns[0].encounter!).preparation).toEqual(preparationForPlan('field'));
  });
});
