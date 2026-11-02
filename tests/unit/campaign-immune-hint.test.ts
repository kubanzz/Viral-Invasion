import { afterEach, describe, expect, it, vi } from 'vitest';
import { distance } from '../../src/actors/collision';
import { preparationForPlan } from '../../src/game/preparation';
import { GameSession } from '../../src/game/session';
import type { GameState, InputFrame } from '../../src/game/types';
import { campaignImmuneResearchHint, endlessImmuneHint, updateGrowthHud } from '../../src/ui/growthHud';

afterEach(() => vi.unstubAllGlobals());

function campaign(beacon = false) {
  const session = new GameSession(71, { campaign: true, milestone: 'G3', counterGuide: 'adaptive', preparation: preparationForPlan(beacon ? 'IMMUNE_BEACON' : 'field') });
  session.start();
  const s = session.state;
  // Controlled source durability/placement keeps the real campaign Q lifecycle
  // observable without killing objectives or opening unrelated XP modals.
  s.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(s.player, { x: 500, y: 500 }); Object.assign(s.tissue, { x: 500, y: 750, hp: 100 });
  s.targets = s.targets.filter(target => target.role === 'source');
  for (const [index, target] of s.targets.entries()) {
    Object.assign(target, { x: 700 + index * 200, y: 500, hp: 1000, maxHp: 1000, traits: index ? [] : ['MIMIC'] });
    Object.assign(s.battle!.graph.nodes.find(node => node.id === target.id)!, { x: target.x, y: target.y });
    s.battle!.nextSpawnAt[target.id] = 1000;
  }
  return session;
}
const input = (extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aim: { x: 700, y: 500 }, fire: false, ...extra });
function until(session: GameSession, tick: number) {
  while (session.state.tick < tick && session.state.phase === 'playing') session.step(input());
  expect(session.state.tick).toBe(tick);
}
function hint(state: GameState) {
  const before = structuredClone(state), value = campaignImmuneResearchHint(state);
  expect(state).toEqual(before);
  return value;
}

describe('campaign immune discovery and honest Q availability hints', () => {
  it('shows one-cell permanent patrols, accepted bites, scan cooldown and a two-legion limit', () => {
    const session = campaign(), s = session.state;
    expect(hint(s)).toContain('军团0/2'); expect(hint(s)).toContain('Q部署1体侦巡');
    expect(hint(s)).toContain('E研究（诊断后可定向）');
    session.step(input({ scan: true }));
    expect(s.growth!.cells).toHaveLength(1);
    expect(hint(s)).toContain('军团1/2'); expect(hint(s)).toContain('本区1体常驻'); expect(hint(s)).toContain('Q3s后');
    expect(hint(s)).toContain('E研究（可定向 1 类）');
    expect(hint(s)).not.toContain('重指挥');
    const firstId = s.growth!.beacon!.id;
    session.step(input({ scan: true }));
    expect(s.scans).toBe(1); expect(s.growth!.beacon!.id).toBe(firstId);
    until(session, 90);
    expect(s.events.some(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON' && Number(event.data.damage) > 0)).toBe(true);
    until(session, 212);
    expect(s.growth!.cells).toHaveLength(1); expect(hint(s)).toContain('Q部署1体侦巡');
    expect(s.growth!.cells![0].until).toBe(Infinity);
    session.step(input({ scan: true }));
    expect(s.growth!.cells).toHaveLength(2); expect(s.growth!.beacon!.id).not.toBe(firstId);
    expect(s.growth!.beacons!.some(beacon => beacon.id === firstId)).toBe(true);
    expect(hint(s)).toContain('军团2/2'); expect(hint(s)).toContain('本区2体常驻');
    until(session, 400); session.step(input({ scan: true }));
    expect(s.growth!.beacons).toHaveLength(2); expect(s.growth!.cells).toHaveLength(2);
    expect(hint(s)).toContain('指挥军团');
    expect(s.events.some(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toBe(false);
  });

  it('distinguishes redirect readiness from second-legion deployment with accepted campaign Q inputs', () => {
    const session = campaign(true), s = session.state;
    expect(hint(s)).toContain('Q部署军团');
    session.step(input({ scan: true }));
    expect(s.growth!.cells).toHaveLength(3);
    expect(hint(s)).toContain('本区3体常驻'); expect(hint(s)).toContain('Q3s后');
    expect(hint(s)).not.toContain('Q重指挥');
    const beaconId = s.growth!.beacon!.id, expires = s.growth!.beacon!.until, summonReady = s.growth!.beaconReadyAt;
    until(session, 181);
    expect(hint(s)).toContain('Q指挥'); expect(hint(s)).toContain('部署9s后');
    const cells = structuredClone(s.growth!.cells!);
    session.step(input({ scan: true, aim: { x: 900, y: 500 } }));
    expect(s.events.some(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
    expect(s.growth!.beacon).toMatchObject({ id: beaconId, until: expires });
    expect(s.growth!.beaconReadyAt).toBe(summonReady);
    for (const cell of s.growth!.cells!) expect(distance(cell, cells.find(before => before.id === cell.id)!)).toBeLessThanOrEqual(190 / 60 + 1e-7);
    expect(hint(s)).toContain('Q3s后');
    until(session, 363);
    expect(s.growth!.cells).toHaveLength(3);
    expect(hint(s)).toContain('部署6s后'); expect(hint(s)).toContain('Q指挥');
    expect(hint(s)).not.toContain('Infinity'); expect(hint(s)).not.toContain('不续命');
    session.step(input({ scan: true }));
    expect(s.growth!.cells).toHaveLength(3);
    expect(s.events.filter(event => event.type === 'PROTOCOL_BEACON_CREATED')).toHaveLength(1);
    expect(hint(s)).toContain('Q3s后');
    until(session, 722);
    expect(hint(s)).toContain('Q部署军团');
    session.step(input({ scan: true }));
    expect(s.growth!.cells).toHaveLength(6); expect(s.growth!.beacon!.id).not.toBe(beaconId);
    expect(s.growth!.beacons!.find(beacon => beacon.id === beaconId)?.until).toBe(Infinity);
    expect(hint(s)).toContain('军团2/2'); expect(hint(s)).toContain('本区6体常驻'); expect(hint(s)).toContain('指挥军团');
    expect(s.events.filter(event => event.type === 'PROTOCOL_BEACON_CREATED')).toHaveLength(2);
  });

  it('renders the pure hint into the existing campaign HUD without adding nodes or mutating gameplay', () => {
    const session = campaign(true), s = session.state, counter = { textContent: '' };
    const slots = { children: [] as { querySelector: () => typeof counter }[], set innerHTML(_value: string) { this.children = Array.from({ length: 3 }, () => ({ querySelector: () => counter })); } };
    const nodes: Record<string, unknown> = { 'protocol-slots': slots };
    for (const id of ['growth-research', 'growth-xp', 'xp-meter', 'research-hint', 'evolution-feedback']) nodes[id] = { textContent: '', style: {}, hidden: false };
    vi.stubGlobal('document', { getElementById: (id: string) => nodes[id] });
    const before = structuredClone(s); updateGrowthHud(s);
    expect((nodes['research-hint'] as { textContent: string }).textContent).toBe(hint(s));
    expect(s).toEqual(before);
  });

  it('renders permanent endless counts across both legions without an Infinity countdown or dead bodies', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    session.step(input({ scan: true }));
    const s = session.state, growth = s.growth!, first = growth.beacon!;
    const second = { ...first, id: 'second-test-legion' };
    growth.beacons = [first, second]; growth.beacon = second;
    growth.cells = [...growth.cells!, ...growth.cells!.map(cell => ({ ...cell, id: `${cell.id}:second`, beaconId: second.id }))];
    growth.cells[0].hp = 0;
    const before = structuredClone(s), text = endlessImmuneHint(s);
    expect(text).toContain('军团2/2'); expect(text).toContain('本区5体常驻'); expect(text).toContain('指挥军团');
    expect(text).not.toContain('Infinity'); expect(text).not.toContain('不续命'); expect(s).toEqual(before);
    const counter = { textContent: '' };
    const slots = { children: [] as { querySelector: () => typeof counter }[], set innerHTML(_value: string) { this.children = Array.from({ length: 3 }, () => ({ querySelector: () => counter })); } };
    const nodes: Record<string, unknown> = { 'protocol-slots': slots };
    for (const id of ['growth-research', 'growth-xp', 'xp-meter', 'research-hint', 'evolution-feedback']) nodes[id] = { textContent: '', style: {}, hidden: false };
    vi.stubGlobal('document', { getElementById: (id: string) => nodes[id] });
    updateGrowthHud(s);
    expect((nodes['research-hint'] as { textContent: string }).textContent).toBe(text);
    expect(s).toEqual(before);
  });
});
