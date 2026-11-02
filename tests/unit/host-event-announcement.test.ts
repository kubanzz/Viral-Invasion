import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameSession } from '../../src/game/session';
import { advanceHostEvents, endHostEvent } from '../../src/game/hostEvents';
import { BALANCE } from '../../src/game/types';
import { hostEventAnnouncementMarkup, hostEventAnnouncementView, updateHostEventAnnouncement } from '../../src/ui/hostEventHud';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state;
  state.endless!.wave = 3; state.endless!.phase = 'combat';
  state.tissue.hp = state.tissue.maxHp; state.battle!.pressure.infection = 0;
  state.targets = [{ id: 'announcement-light', role: 'virus', kind: 'single', radius: 14, hp: 100, maxHp: 100,
    x: 700, y: 500, hitUntil: 0, scanned: false, traits: [] }];
  advanceHostEvents(state, BALANCE.step);
  return state;
}

function hud() {
  const nodes = new Map([...hostEventAnnouncementMarkup.matchAll(/id="([^"]+)"/g)].map(match => [match[1],
    { textContent: '', hidden: true, dataset: {} as Record<string, string> }]));
  nodes.set('app', { textContent: '', hidden: false, dataset: {} });
  vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
  return nodes;
}

describe('independent host event announcements', () => {
  it('reveals warning once, shrinks to a countdown, then shows the exact active effects and one ending notice', () => {
    const state = fixture();
    expect(hostEventAnnouncementView(state)).toMatchObject({ title: '宿主准备运动', phase: 'warning', expanded: true, remaining: '8.0s' });
    state.elapsed = 2; expect(hostEventAnnouncementView(state)).toMatchObject({ title: '运动预警', expanded: false, remaining: '6.0s' });
    state.elapsed = 8; advanceHostEvents(state, BALANCE.step);
    expect(hostEventAnnouncementView(state)).toMatchObject({ title: '宿主开始运动', expanded: true, remaining: '35.0s' });
    expect(hostEventAnnouncementView(state)!.description).toContain('−30%');
    expect(hostEventAnnouncementView(state)!.description).toContain('+25%');
    expect(hostEventAnnouncementView(state)!.description).toContain('+15%');
    state.elapsed = 11; expect(hostEventAnnouncementView(state)).toMatchObject({ title: '宿主运动中', expanded: false });
    state.elapsed = 43; advanceHostEvents(state, BALANCE.step);
    expect(hostEventAnnouncementView(state)).toMatchObject({ title: '宿主运动结束', phase: 'ended' });
    state.events = []; state.elapsed = 45.9; expect(hostEventAnnouncementView(state)).not.toBeNull();
    state.elapsed = 46; expect(hostEventAnnouncementView(state)).toBeNull();
  });

  it('does not reset reveal timestamps or replay accessibility announcements after opening details', () => {
    const state = fixture(), nodes = hud(); updateHostEventAnnouncement(state);
    const status = nodes.get('host-announcement-status')!, key = status.dataset.notice;
    state.elapsed = 3; updateHostEventAnnouncement(state, { lowEffects: true });
    expect(nodes.get('host-event-announcement')!.dataset.expanded).toBe('false');
    expect(nodes.get('host-event-announcement')!.dataset.lowEffects).toBe('true');
    const notice = structuredClone(state.hostEvents!.announcement);
    state.phase = 'paused'; updateHostEventAnnouncement(state);
    expect(nodes.get('host-event-announcement')!.hidden).toBe(true);
    state.phase = 'playing'; updateHostEventAnnouncement(state);
    expect(nodes.get('host-event-announcement')!.dataset.expanded).toBe('false');
    expect(status.dataset.notice).toBe(key); expect(state.hostEvents!.announcement).toEqual(notice);
    endHostEvent(state, 'alarm'); updateHostEventAnnouncement(state);
    expect(nodes.get('host-announcement-title')!.textContent).toBe('运动预警取消');
    expect(status.dataset.notice).not.toBe(key);
  });

  it('uses a separate passive element with bounded desktop/touch heights and no wall-clock animation', () => {
    expect(hostEventAnnouncementMarkup).not.toMatch(/<button|tabindex=|role="dialog"|class="host-event-card"/);
    const css = readFileSync(new URL('../../src/ui/hostEventHud.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.host-event-announcement[^}]*max-height:90px[^}]*pointer-events:none/);
    expect(css).toMatch(/body\.touch-mode #app \.host-event-announcement[^}]*max-height:64px/);
    expect(css).not.toMatch(/animation:/);
  });
});
