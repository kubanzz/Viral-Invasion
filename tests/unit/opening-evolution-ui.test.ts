import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { OpeningEvolutionReason, OpeningEvolutionTrait } from '../../src/game/openingEvolution';
import { hostEventAnnouncementMarkup, hostEventAnnouncementView, openingEvolutionAnnouncementView, updateHostEventAnnouncement } from '../../src/ui/hostEventHud';
import { endlessHudMarkup, endlessOverlay, updateEndlessHud } from '../../src/ui/endlessHud';
import { endlessEvolutionWarningContent, endlessTraitCopy, openingEvolutionDetailText } from '../../src/ui/endlessEvolutionWarning';
import { mobileHudView } from '../../src/ui/mobileHud';

afterEach(() => vi.unstubAllGlobals());

function fixture(trait: OpeningEvolutionTrait = 'CARAPACE', reason: OpeningEvolutionReason = 'precision-dominant') {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.elapsed = 100; state.tick = 6000;
  Object.assign(e, { wave: 3, phase: 'warning', phaseStartedAt: 100, phaseUntil: 108, traits: [trait] });
  e.evolution!.opening = { precisionDamage: trait === 'CARAPACE' ? 800 : 200, areaDamage: trait === 'CARAPACE' ? 200 : 800,
    selection: { trait, reason, frozenAtTick: 5900 }, warningAt: 100 };
  return { session, state, e, opening: e.evolution!.opening };
}

function hud() {
  const markup = hostEventAnnouncementMarkup + endlessHudMarkup();
  const nodes = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match => [match[1],
    { textContent: '', innerHTML: '', hidden: true, open: false, title: '', style: { width: '' }, dataset: {} as Record<string, string> }]));
  nodes.set('app', { textContent: '', innerHTML: '', hidden: false, open: false, title: '', style: { width: '' }, dataset: {} });
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'endless-minimap' ? { getContext: () => null } : nodes.get(id) ?? null });
  return nodes;
}

describe('first-stage evolution presentation', () => {
  it.each<OpeningEvolutionTrait>(['CARAPACE', 'FISSION'])('announces the saved %s plan with a counter through the full eight-second warning', trait => {
    const f = fixture(trait), before = structuredClone(f.state);
    const view = openingEvolutionAnnouncementView(f.state)!;
    expect(view).toMatchObject({ kind: 'evolution', phase: 'warning', expanded: true, remaining: '8.0s' });
    expect(view.title).toContain(trait === 'CARAPACE' ? '晶壳' : '裂殖');
    expect(view.description).toContain('炮弹'); expect(view.description).toContain('剑气');
    f.state.elapsed = 107.5; expect(openingEvolutionAnnouncementView(f.state)).toMatchObject({ remaining: '.5s'.replace(/^\./, '0.'), expanded: true });
    expect(f.e.evolution!.opening).toEqual(before.endless!.evolution!.opening);
    expect(endlessEvolutionWarningContent(f.state)).toBeNull(); // no second card in the same region
  });

  it('waits for an actual variant birth, then shows three seconds before returning to compact status', () => {
    const f = fixture(); f.e.phase = 'combat'; f.state.elapsed = 108; f.opening.appliedAt = 108;
    expect(openingEvolutionAnnouncementView(f.state)).toBeNull();
    f.opening.firstBornAt = 109; f.opening.waveNotice = { wave: 3, bornAt: 109, elite: false }; f.state.elapsed = 109;
    expect(openingEvolutionAnnouncementView(f.state)).toMatchObject({ title: '晶壳已出现', expanded: true });
    f.state.elapsed = 111.99; expect(openingEvolutionAnnouncementView(f.state)).not.toBeNull();
    f.state.elapsed = 112; expect(openingEvolutionAnnouncementView(f.state)).toBeNull();
    expect(endlessTraitCopy(f.state)).toContain('少量特化：◇晶壳');
    expect(mobileHudView(f.state).warnings).toContainEqual({ kind: 'opening-evolution', text: '◇晶壳 · 炮弹/剑气/绕后' });
  });

  it('reminds once at the next wave birth and explicitly names elite inheritance', () => {
    const f = fixture('FISSION', 'area-dominant'); f.e.phase = 'combat';
    f.e.wave = 4; f.opening.waveNotice = { wave: 4, bornAt: 100, elite: false };
    expect(openingEvolutionAnnouncementView(f.state)?.title).toBe('少量裂殖混入敌群');
    f.state.elapsed = 103; expect(openingEvolutionAnnouncementView(f.state)).toBeNull();
    f.e.wave = 5; f.opening.waveNotice = { wave: 5, bornAt: 103, elite: true };
    expect(openingEvolutionAnnouncementView(f.state)?.title).toBe('精英继承 · 裂殖');
    expect(endlessTraitCopy(f.state)).toContain('精英继承：⋈裂殖');
    f.e.wave = 10; f.e.traits = ['FISSION'];
    expect(openingEvolutionAnnouncementView(f.state)).toBeNull();
    expect(endlessTraitCopy(f.state)).toBe('当前变异：⋈裂殖');
  });

  it('shows factual frozen damage ratios and never invents an observed strategy for mixed or insufficient samples', () => {
    const f = fixture();
    expect(openingEvolutionDetailText(f.state)).toContain('弹丸伤害 800（80%）');
    expect(openingEvolutionDetailText(f.state)).toContain('范围伤害 200（20%）');
    f.opening.selection!.reason = 'mixed'; expect(openingEvolutionDetailText(f.state)).toContain('打法混合');
    expect(openingEvolutionDetailText(f.state)).not.toContain('伤害为主');
    f.opening.precisionDamage = 0; f.opening.areaDamage = 0; f.opening.selection!.reason = 'insufficient-data';
    expect(openingEvolutionDetailText(f.state)).toContain('有效观测不足');
    expect(openingEvolutionDetailText(f.state)).not.toMatch(/NaN|Infinity|识别了|针对你的/);
    expect(endlessOverlay(f.state, true, false)).toContain('病毒也会进化');
  });

  it('keeps details expanded and does not mutate the observation while refreshing the HUD', () => {
    const f = fixture(), nodes = hud(), before = structuredClone(f.state);
    nodes.get('endless-opening-details')!.open = true;
    updateEndlessHud(f.state); updateEndlessHud(f.state);
    expect(nodes.get('endless-opening-details')!.hidden).toBe(false);
    expect(nodes.get('endless-opening-details')!.open).toBe(true);
    expect(nodes.get('endless-opening-detail')!.textContent).toContain('800（80%）');
    expect(f.state).toEqual(before);
  });

  it('freezes on pause, returns without replaying, and gives a new same-seed run a fresh notice key', () => {
    const f = fixture(), nodes = hud(); updateHostEventAnnouncement(f.state, { lowEffects: true });
    const status = nodes.get('host-announcement-status')!, key = status.dataset.notice;
    const first = status.textContent;
    f.session.pause(); const tick = f.state.tick;
    for (let i = 0; i < 90; i++) f.session.step({ moveX: 1, moveY: 0, aim: f.state.player, fire: true });
    expect(f.state.tick).toBe(tick); updateHostEventAnnouncement(f.state);
    expect(nodes.get('host-event-announcement')!.hidden).toBe(true);
    f.session.resume(); updateHostEventAnnouncement(f.state);
    expect(status.dataset.notice).toBe(key); expect(status.textContent).toBe(first);
    expect(nodes.get('host-event-announcement')!.dataset.kind).toBe('evolution');
    f.state.growth!.runId += ':retry'; updateHostEventAnnouncement(f.state);
    expect(status.dataset.notice).not.toBe(key);
  });

  it('preempts a host notice without stacking or replaying its accessibility message on return', () => {
    const f = fixture(), nodes = hud(); f.e.phase = 'combat';
    f.state.targets = [{ id: 'light', role: 'virus', kind: 'single', x: 700, y: 500, radius: 20, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: [] }];
    expect(f.session.debugHostEvent('EXERCISE').ok).toBe(true);
    updateHostEventAnnouncement(f.state); const status = nodes.get('host-announcement-status')!;
    const hostKey = status.dataset.notice; expect(hostEventAnnouncementView(f.state)?.kind).toBe('host');
    f.e.wave = 4; f.opening.waveNotice = { wave: 4, bornAt: f.state.elapsed, elite: false };
    updateHostEventAnnouncement(f.state); const variantText = status.textContent;
    expect(hostEventAnnouncementView(f.state)?.kind).toBe('evolution'); expect(status.dataset.notice).not.toBe(hostKey);
    f.state.elapsed += 3; updateHostEventAnnouncement(f.state);
    expect(hostEventAnnouncementView(f.state)?.kind).toBe('host'); expect(status.dataset.notice).toBe(hostKey);
    expect(status.textContent).toBe(variantText); // unchanged live region: no old warning replay
    expect(hostEventAnnouncementMarkup.match(/id="host-event-announcement"/g)).toHaveLength(1);
  });
});
