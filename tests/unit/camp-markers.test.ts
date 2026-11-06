import { describe, expect, it } from 'vitest';
import { campLayout, type CampStationId } from '../../src/game/campLayout';
import { CAMP_CONSTRUCTION_SECONDS, INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import type { GameState } from '../../src/game/types';
import { addCampSiteLabels, campFacilityFallbackBounds, drawCampFoundations, hitCampScreenTarget,
  type CampScreenTarget } from '../../src/render/campMarkers';
import type { SceneLabel } from '../../src/render/sceneLabels';

function state(builtFacilities: CampStationId[] = []): GameState {
  return { elapsed: 10, tissue: { x: 1000, y: 800 }, player: { x: 1000, y: 1070, radius: 14 },
    camp: { prologue: 'building', introComplete: false, introSeconds: 100, builtFacilities } } as GameState;
}
function requests(s: GameState, bounds: Parameters<typeof addCampSiteLabels>[2] = () => undefined): SceneLabel[] {
  const result: SceneLabel[] = []; addCampSiteLabels(s, { add: label => result.push(label) }, bounds); return result;
}
function canvas() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy({}, { get: (_, name: string) => (...args: unknown[]) => calls.push({ name, args }) }) as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('camp foundation and rooftop markers', () => {
  it('keeps the arrival clearing and combat worlds free of planned camp buildings', () => {
    const s = state(); s.camp!.prologue = 'arrival'; const fake = canvas();
    drawCampFoundations(fake.ctx, s); expect(fake.calls).toEqual([]); expect(requests(s)).toEqual([]);
    delete s.camp;
    drawCampFoundations(fake.ctx, s); expect(fake.calls).toEqual([]); expect(requests(s)).toEqual([]);
  });

  it('draws only empty foundations for unbuilt plots without borrowing completed building art', () => {
    const s = state(['warehouse', 'shop']), fake = canvas(), layout = campLayout(s);
    drawCampFoundations(fake.ctx, s);
    const outlines = fake.calls.filter(call => call.name === 'roundRect');
    expect(outlines).toHaveLength(3);
    for (const site of layout.sites.filter(site => !s.camp!.builtFacilities!.includes(site.id))) {
      expect(outlines.some(call => call.args[0] === site.footprint.left && call.args[1] === site.footprint.top)).toBe(true);
    }
    expect(fake.calls.some(call => call.name === 'drawImage')).toBe(false);
    expect(fake.calls.some(call => call.name === 'arc')).toBe(false);
    s.camp!.builtFacilities = [...INTRO_FACILITY_IDS]; fake.calls.length = 0;
    drawCampFoundations(fake.ctx, s); expect(fake.calls).toEqual([]);
  });

  it('reserves scaffold and progress visuals for the one active site while other plots wait', () => {
    const s = state(), fake = canvas(); s.camp!.activeConstruction = 'forge'; s.camp!.constructionSeconds = CAMP_CONSTRUCTION_SECONDS / 2;
    drawCampFoundations(fake.ctx, s);
    expect(fake.calls.filter(call => call.name === 'arc')).toHaveLength(2);
    expect(fake.calls.some(call => call.name === 'drawImage')).toBe(false);
    const labels = requests(s), active = labels.find(label => label.id === 'camp-site:forge')!;
    expect(active.lines[1].text).toContain('50%'); expect(active.bar?.ratio).toBe(.5); expect(active.essential).toBe(true);
    expect(labels.filter(label => label.id !== active.id).every(label => label.lines[1].text === '等待小队完工')).toBe(true);
    expect(labels.some(label => label.lines.some(line => line.text.includes('免费建造')))).toBe(false);
  });

  it('anchors content notices above the actual registered roof regardless of building art size', () => {
    const s = state(['forge']); s.camp!.attention = { forge: { kind: 'craft', label: '可打造', count: 2 } };
    const labels = requests(s, () => ({ left: 540, right: 760, top: 420, bottom: 730 }));
    const notice = labels.find(label => label.id === 'camp-attention:forge')!;
    expect(notice.anchor).toEqual({ x: 650, y: 420 / .72 }); expect(notice.offset!.y).toBeLessThan(0);
    expect(notice.lines[0].text).toBe('! 可打造 · 2'); expect(notice.lines[0].size).toBeGreaterThanOrEqual(14);
    expect(notice.essential).toBe(true);
  });

  it('uses the procedural body bounds when registered art is unavailable', () => {
    const s = state(['warehouse']); s.camp!.attention = { warehouse: { kind: 'equipment', label: '新装备', count: 1 } };
    const site = campLayout(s).facilities[0], bounds = campFacilityFallbackBounds(site);
    const label = requests(s).find(label => label.id === 'camp-attention:warehouse')!;
    expect(bounds.left).toBeLessThan(site.position.x); expect(bounds.right).toBeGreaterThan(site.position.x);
    expect(bounds.top).toBeLessThan(site.position.y * .72); expect(bounds.bottom).toBe(site.position.y * .72);
    expect(label.anchor.y).toBe(bounds.top / .72);
  });

  it('shows building interaction on an accessible side instead of anchoring it to the old entrance', () => {
    const s = state(['forge']), site = campLayout(s).facilities[0];
    s.player.x = site.footprint.right + 25; s.player.y = (site.footprint.top + site.footprint.bottom) / 2;
    const name = requests(s).find(label => label.id === 'camp-name:forge')!;
    expect(name.lines.map(line => line.text)).toEqual([site.name, '点击建筑 / E']);
    expect(name.anchor).toEqual(site.position); expect(name.essential).toBe(true);
    s.player.x += 200;
    expect(requests(s).some(label => label.id === 'camp-name:forge')).toBe(false);
  });

  it('identifies each empty plot and gives the nearest plot a clear free-building action', () => {
    const s = state(), forge = campLayout(s).sites.find(site => site.id === 'forge')!;
    s.player.x = forge.position.x; s.player.y = forge.position.y;
    const labels = requests(s), nearest = labels.find(label => label.id === 'camp-site:forge')!;
    expect(labels.filter(label => label.id.startsWith('camp-site:'))).toHaveLength(5);
    expect(nearest.lines[0].text).toBe(forge.name); expect(nearest.lines[1].text).toContain('点击建造 / E');
    expect(nearest.essential).toBe(true);
    expect(labels.filter(label => label.id !== nearest.id).every(label => !label.essential)).toBe(true);
  });

  it('never puts functional rooftop alerts on an unfinished plot or mutates scene data', () => {
    const s = state(); s.camp!.attention = { forge: { kind: 'craft', label: '可打造', count: 1 } };
    const before = structuredClone(s), fake = canvas(); drawCampFoundations(fake.ctx, s); const labels = requests(s);
    expect(labels.some(label => label.id === 'camp-attention:forge')).toBe(false);
    expect(labels.find(label => label.id === 'camp-site:forge')).toBeDefined(); expect(s).toEqual(before);
  });
});

describe('screen-space camp selection follows the visible building', () => {
  function target(id: CampStationId, groundY = 100): CampScreenTarget {
    return { id, body: { left: 20, top: 10, right: 100, bottom: 150 }, labels: [], eligible: true, built: true, groundY };
  }

  it('lets an explicit roof notification select its building ahead of an overlapping building body', () => {
    const rear = target('warehouse', 100), front = target('forge', 200);
    rear.labels.push({ id: 'camp-attention:warehouse', rect: { left: 40, top: 20, right: 80, bottom: 45 } });
    expect(hitCampScreenTarget([front, rear], { x: 60, y: 30 })).toBe(rear);
    expect(hitCampScreenTarget([rear, front], { x: 60, y: 70 })).toBe(front);
  });

  it('selects the foreground body regardless of target order and never clicks through it when out of range', () => {
    const rear = target('warehouse', 100), front = target('forge', 200); front.eligible = false;
    expect(hitCampScreenTarget([rear, front], { x: 50, y: 60 })).toBe(front);
    expect(hitCampScreenTarget([front, rear], { x: 50, y: 60 })).toBe(front);
    expect(hitCampScreenTarget([rear, front], { x: 50, y: 60 })!.eligible).toBe(false);
  });

  it('keeps a remote explicit label selected so the caller can reject it without entering another nearby building', () => {
    const remote = target('summon', 100), nearby = target('shop', 200); remote.eligible = false;
    remote.labels.push({ id: 'camp-name:summon', rect: { left: 30, top: 80, right: 90, bottom: 110 } });
    expect(hitCampScreenTarget([nearby, remote], { x: 50, y: 90 })).toBe(remote);
  });

  it('uses the registered body envelope for roof clicks instead of requiring the grounded footprint', () => {
    const station = target('warehouse', 500); station.body = { left: 200, top: 100, right: 420, bottom: 500 };
    expect(hitCampScreenTarget([station], { x: 300, y: 110 })).toBe(station);
    expect(hitCampScreenTarget([station], { x: 300, y: 495 })).toBe(station);
  });

  it('includes visible edges while leaving blank space and empty target lists unselected', () => {
    const station = target('departure');
    expect(hitCampScreenTarget([station], { x: 20, y: 10 })).toBe(station);
    expect(hitCampScreenTarget([station], { x: 100, y: 150 })).toBe(station);
    expect(hitCampScreenTarget([station], { x: 100.01, y: 150 })).toBeUndefined();
    expect(hitCampScreenTarget([station], { x: 50, y: 151 })).toBeUndefined();
    expect(hitCampScreenTarget([], { x: 50, y: 50 })).toBeUndefined();
  });

  it('breaks equal-depth overlaps by stable station id without sorting or changing caller data', () => {
    const first = target('warehouse'), second = target('forge'), list = [first, second], before = structuredClone(list);
    expect(hitCampScreenTarget(list, { x: 50, y: 50 })).toBe(second);
    expect(hitCampScreenTarget([...list].reverse(), { x: 50, y: 50 })).toBe(second);
    expect(list).toEqual(before); expect(list[0]).toBe(first);
    first.labels.push({ id: 'camp-site:warehouse', rect: first.body });
    second.labels.push({ id: 'camp-site:forge', rect: second.body });
    expect(hitCampScreenTarget(list, { x: 50, y: 50 })).toBe(second);
  });

  it('can select a planned foundation without treating its unfinished state as a click-through surface', () => {
    const foundation = target('forge', 200), completed = target('warehouse', 100); foundation.built = false;
    expect(hitCampScreenTarget([completed, foundation], { x: 50, y: 80 })).toBe(foundation);
    foundation.labels.push({ id: 'camp-site:forge', rect: { left: 120, top: 60, right: 200, bottom: 100 } });
    expect(hitCampScreenTarget([completed, foundation], { x: 150, y: 80 })).toBe(foundation);
  });
});
