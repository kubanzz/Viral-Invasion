import { describe, expect, it } from 'vitest';
import { SceneLabels, type LabelRect, type SceneLabel, type SceneLabelSink } from '../../src/render/sceneLabels';
import { drawBattleLabels, drawMotherCoreDangers } from '../../src/render/battleVisuals';
import { GameSession } from '../../src/game/session';
import type { MotherCoreState } from '../../src/game/motherCoreTypes';
import type { Target } from '../../src/game/types';

function canvas() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let measureCalls = 0;
  const object: Record<string, unknown> = { font: '', textAlign: '', textBaseline: '',
    measureText(text: string) {
      measureCalls++;
      const size = Number(String(object.font).match(/([\d.]+)px/)?.[1] ?? 11);
      return { width: [...text].reduce((sum, char) => sum + (char === 'W' ? 20 : char === 'i' ? 2 : 9), 0) * size / 11,
        actualBoundingBoxAscent: 8 * size / 11, actualBoundingBoxDescent: 3 * size / 11 };
    },
  };
  for (const method of ['save', 'restore', 'beginPath', 'closePath', 'roundRect', 'fill', 'stroke', 'fillRect', 'fillText', 'strokeText', 'moveTo', 'lineTo', 'ellipse', 'arc', 'setLineDash', 'translate', 'scale', 'rotate']) {
    object[method] = (...args: unknown[]) => calls.push({ method, args });
  }
  return { ctx: object as unknown as CanvasRenderingContext2D, calls, measured: () => measureCalls };
}
const label = (id: string, overrides: Partial<SceneLabel> = {}): SceneLabel => ({ id, anchor: { x: 180, y: 110 }, priority: 60, lines: [{ text: '组织 72%' }], ...overrides });
const overlaps = (a: LabelRect, b: LabelRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const begin = (labels: SceneLabels, options: Partial<Parameters<SceneLabels['begin']>[0]> = {}) => labels.begin({ width: 360, height: 220, project: point => ({ ...point }), scale: 1, scope: 'run:heart', blocked: [], ...options });
const actor = (id: string, overrides: Partial<Target> = {}): Target => ({ id, x: 600, y: 400, role: 'virus', kind: 'single', radius: 22, hp: 68, maxHp: 68,
  hitUntil: 0, scanned: false, traits: [], ...overrides });
function battleState() {
  const session = new GameSession(75, { campaign: true, milestone: 'G2', encounterMode: 'fixture' }); session.start();
  session.state.elapsed = 5; session.state.tick = 300; session.state.scanUntil = 0;
  session.state.battle!.lastAim = { x: 1000, y: 700 };
  return session.state;
}

describe('shared screen label layout', () => {
  it('projects the anchor and applies an uncompressed local offset exactly once', () => {
    const labels = new SceneLabels(), { ctx } = canvas();
    begin(labels, { width: 800, height: 600, scale: 2, project: point => ({ x: 100 + point.x * 2, y: 50 + point.y * .72 * 2 }) });
    labels.add(label('scaled', { anchor: { x: 20, y: 100 }, offset: { x: 6, y: -20 } })); labels.draw(ctx);
    const placed = labels.diagnostics().placements[0];
    expect(placed.anchor).toEqual({ x: 140, y: 194 }); expect(placed.baseline).toEqual({ x: 152, y: 154 });
    expect(placed.compact).toBe(false); expect(placed.conflicted).toBe(false);
  });

  it('uses the measured font width rather than character count and reuses bounded measurements', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels);
    labels.add(label('wide', { anchor: { x: 100, y: 90 }, lines: [{ text: 'WWW' }] }));
    labels.add(label('narrow', { anchor: { x: 250, y: 90 }, lines: [{ text: 'iii' }] })); labels.draw(fake.ctx);
    const first = labels.diagnostics(), width = (id: string) => { const rect = first.placements.find(item => item.id === id)!.rect; return rect.right - rect.left; };
    expect(width('wide')).toBeGreaterThan(width('narrow') * 3); const count = fake.measured();
    begin(labels); labels.add(label('wide', { lines: [{ text: 'WWW' }] })); labels.draw(fake.ctx); expect(fake.measured()).toBe(count);
  });

  it('lays tissue, squad and weak-point labels around each other and a real HUD rectangle', () => {
    const labels = new SceneLabels(), fake = canvas(), hud = { left: 220, right: 360, top: 55, bottom: 220 }; begin(labels, { blocked: [hud] });
    labels.add(label('tissue', { anchor: { x: 210, y: 120 }, priority: 75, essential: true, bar: { ratio: .72, color: '#fff' } }));
    labels.add(label('squad', { anchor: { x: 210, y: 120 }, lines: [{ text: '小队×3 ·4.9s' }] }));
    labels.add(label('weakness', { anchor: { x: 210, y: 120 }, priority: 90, essential: true, lines: [{ text: '◇ 破绽 3s' }] })); labels.draw(fake.ctx);
    const result = labels.diagnostics(); expect(result.placed).toBe(3); expect(result.conflicted).toBe(0);
    for (const item of result.placements) {
      expect(overlaps(item.rect, hud)).toBe(false);
      for (const other of result.placements.filter(peer => peer.id !== item.id)) expect(overlaps(item.rect, other.rect)).toBe(false);
    }
    expect(result.placements[0].id).toBe('weakness');
  });

  it('projects world reservations without changing their geometry or the supplied frame data', () => {
    const labels = new SceneLabels(), fake = canvas(), world = { left: 40, right: 80, top: 60, bottom: 100 }, before = { ...world };
    begin(labels, { project: point => ({ x: point.x * 2, y: point.y * .72 }) }); labels.reserveWorld(world);
    labels.add(label('cross-caption', { anchor: { x: 60, y: 90 }, priority: 100, essential: true, lines: [{ text: '危险' }] })); labels.draw(fake.ctx);
    expect(world).toEqual(before); expect(overlaps(labels.diagnostics().placements[0].rect, { left: 80, right: 160, top: 43.2, bottom: 72 })).toBe(false);
  });

  it('keeps repeated placements stable despite collection order and relocates after a new HUD block', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels);
    const a = label('a', { priority: 80, essential: true }), b = label('b'); labels.add(b); labels.add(a); labels.draw(fake.ctx);
    const first = labels.diagnostics().placements;
    begin(labels); labels.add(a); labels.add(b); labels.draw(fake.ctx); expect(labels.diagnostics().placements).toEqual(first);
    begin(labels, { blocked: [first[0].rect] }); labels.add(a); labels.draw(fake.ctx);
    expect(overlaps(labels.diagnostics().placements[0].rect, first[0].rect)).toBe(false);
    begin(labels, { scope: 'new-run:lung' }); labels.add(a); labels.draw(fake.ctx);
    expect(labels.diagnostics().placements[0].baseline).toEqual(first[0].baseline);
  });

  it('compacts routine explanation when the available height cannot hold two rows', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels, { width: 160, height: 80, blocked: [{ left: 0, right: 160, top: 30, bottom: 80 }] });
    labels.add(label('optional', { anchor: { x: 80, y: 40 }, lines: [{ text: '小队' }, { text: '次要说明' }] })); labels.draw(fake.ctx);
    expect(labels.diagnostics().placed).toBe(1); expect(labels.diagnostics().placements[0].compact).toBe(true);
    expect(labels.diagnostics().conflicted).toBe(0);
  });

  it('retains and diagnoses essential information when a finite viewport has no collision-free placement', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels, { width: 120, height: 70, blocked: [{ left: 0, right: 120, top: 0, bottom: 70 }] });
    labels.add(label('lethal', { anchor: { x: 60, y: 35 }, priority: 100, essential: true, lines: [{ text: '危险 0.3s' }] })); labels.add(label('routine', { anchor: { x: 60, y: 35 } })); labels.draw(fake.ctx);
    const result = labels.diagnostics(); expect(result.placed).toBe(1); expect(result.omitted).toBe(1); expect(result.conflicted).toBe(1);
    expect(result.placements[0].id).toBe('lethal'); expect(fake.calls.some(call => call.method === 'fillText' && call.args[0] === '危险 0.3s')).toBe(true);
  });

  it('culls distant attacks instead of drawing room-spanning leaders, and clamps near-edge labels', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels);
    labels.add(label('far', { anchor: { x: -500, y: 100 }, priority: 100, essential: true }));
    labels.add(label('near-edge', { anchor: { x: -20, y: 100 }, priority: 100, essential: true, lines: [{ text: '冲击' }] })); labels.draw(fake.ctx);
    expect(labels.diagnostics().offscreen).toBe(1); const placed = labels.diagnostics().placements[0];
    expect(placed.id).toBe('near-edge'); expect(placed.rect.left).toBeGreaterThanOrEqual(6); expect(placed.rect.right).toBeLessThanOrEqual(354);
  });

  it('limits leader segments to56 CSSpx and stops before HUD or protected player/attack regions', () => {
    const labels = new SceneLabels(), fake = canvas(), protection = { left: 140, right: 220, top: 80, bottom: 150 }; begin(labels, { blocked: [protection] });
    labels.add(label('move-away', { anchor: { x: 180, y: 110 }, priority: 90, essential: true })); labels.draw(fake.ctx);
    const placed = labels.diagnostics().placements[0]; expect(placed.anchor).toEqual({ x: 180, y: 110 });
    if (placed.leader) {
      const { from, to } = placed.leader; expect(Math.hypot(from.x - to.x, from.y - to.y)).toBeLessThanOrEqual(56 + 1e-7);
      for (let step = 0; step <= 20; step++) {
        const x = from.x + (to.x - from.x) * step / 20, y = from.y + (to.y - from.y) * step / 20;
        expect(x > protection.left && x < protection.right && y > protection.top && y < protection.bottom).toBe(false);
      }
    }
    expect(placed.conflicted).toBe(false);
  });

  it('draws a displaced label leader toward the true anchor when a safe short segment exists', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels);
    labels.add(label('primary', { priority: 90, essential: true }));
    labels.add(label('secondary', { anchor: { x: 100, y: 110 }, offset: { x: 80, y: 0 }, priority: 60 })); labels.draw(fake.ctx);
    const second = labels.diagnostics().placements.find(item => item.id === 'secondary')!;
    expect(second.leader).toBeDefined(); expect(second.anchor).toEqual({ x: 100, y: 110 });
    expect(Math.hypot(second.leader!.from.x - second.leader!.to.x, second.leader!.from.y - second.leader!.to.y)).toBeLessThanOrEqual(56);
  });

  it('bounds both caches across changing countdown text and owner IDs, and diagnostics cannot mutate layout state', () => {
    const labels = new SceneLabels(), fake = canvas();
    for (let index = 0; index < 400; index++) { begin(labels); labels.add(label(`owner-${index}`, { lines: [{ text: `倒计时 ${index}` }] })); labels.draw(fake.ctx); }
    const result = labels.diagnostics(); expect(result.measureCacheSize).toBeLessThanOrEqual(256); expect(result.placementCacheSize).toBeLessThanOrEqual(128);
    result.placements[0].rect.left = -9000; expect(labels.diagnostics().placements[0].rect.left).toBeGreaterThanOrEqual(6);
  });

  it('deduplicates stable owner IDs rather than stacking the same badge twice', () => {
    const labels = new SceneLabels(), fake = canvas(); begin(labels); labels.add(label('squad')); labels.add(label('squad', { lines: [{ text: '更新后' }] })); labels.draw(fake.ctx);
    expect(labels.diagnostics().requested).toBe(1); expect(labels.diagnostics().placed).toBe(1);
    expect(fake.calls.filter(call => call.method === 'fillText').map(call => call.args[0])).toEqual(['更新后']);
  });
});

describe('battle label production collectors', () => {
  it('protects the real visible shell weak point/foot/head without revealing an unobserved MIMIC', () => {
    const state = battleState(), shell = actor('visible-shell', { role: 'elite', radius: 30, traits: ['CARAPACE'], exposedUntil: 8 });
    const hidden = actor('hidden-mimic', { x: 300, traits: ['MIMIC'], role: 'elite', scanned: true });
    state.targets = [shell, hidden]; const before = JSON.stringify(state), protectedRects: LabelRect[] = [], labels: SceneLabel[] = [];
    drawBattleLabels(canvas().ctx, state, { add: item => labels.push(item), reserveWorld: rect => protectedRects.push(rect) });
    expect(protectedRects).toHaveLength(3); expect(labels.some(item => item.id === 'target:hidden-mimic')).toBe(false);
    expect(protectedRects.every(rect => rect.left > 550)).toBe(true);
    const bob = Math.sin(state.elapsed * 5 + shell.x) * 2;
    const weakCenter = { x: shell.x - .15 * shell.radius, y: shell.y * .72 - shell.radius * .8 + bob + .09 * shell.radius };
    const projected = protectedRects.map(rect => ({ ...rect, top: rect.top * .72, bottom: rect.bottom * .72 }));
    expect(projected.some(rect => rect.left <= weakCenter.x - shell.radius * .39 && rect.right >= weakCenter.x + shell.radius * .39
      && rect.top <= weakCenter.y - shell.radius * .43 && rect.bottom >= weakCenter.y + shell.radius * .43)).toBe(true);
    expect(projected.some(rect => rect.top <= shell.y * .72 + 1 && rect.bottom >= shell.y * .72 + 1)).toBe(true);
    const layout = new SceneLabels(), fake = canvas(); begin(layout, { width: 900, height: 650, project: point => ({ x: point.x, y: point.y * .72 }) });
    for (const rect of protectedRects) layout.reserveWorld(rect);
    layout.add(label('neighbor-caption', { anchor: { x: shell.x, y: weakCenter.y / .72 }, priority: 75, essential: true })); layout.draw(fake.ctx);
    expect(layout.diagnostics().conflicted).toBe(0);
    expect(projected.every(rect => !overlaps(layout.diagnostics().placements[0].rect, rect))).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('reserves MIMIC features only after an existing reveal or trace condition makes its label visible', () => {
    const state = battleState(), target = actor('mimic', { role: 'elite', traits: ['MIMIC'] }); state.targets = [target];
    const reserve = () => { const regions: LabelRect[] = []; drawBattleLabels(canvas().ctx, state, { add() {}, reserveWorld: rect => regions.push(rect) }); return regions; };
    expect(reserve()).toEqual([]); target.revealedUntil = 6; expect(reserve().length).toBeGreaterThan(0);
    target.revealedUntil = 0; state.growth!.marks = [{ targetId: target.id, organId: 'heart', until: 8, slowUntil: 7, factor: .7 }];
    expect(reserve().length).toBeGreaterThan(0); state.growth!.marks[0].organId = 'lung'; expect(reserve()).toEqual([]);
  });

  it('keeps hidden mimic state and HP eligibility while submitting real bars and separately focused weakness', () => {
    const state = battleState(), hidden = actor('hidden', { x: 300, traits: ['MIMIC'], scanned: true });
    state.targets = [hidden, actor('plain'), actor('focused', { role: 'elite', exposedUntil: 8 }), actor('nearby', { x: 645, role: 'elite', exposedUntil: 7 })];
    state.battle!.lastAim = { x: 600, y: 400 }; const before = JSON.stringify(state), labels: SceneLabel[] = [];
    drawBattleLabels(canvas().ctx, state, { add: item => labels.push(item) });
    expect(labels.some(item => item.id === 'target:hidden')).toBe(false);
    expect(labels.find(item => item.id === 'target:focused')).toMatchObject({ priority: 90, essential: true, bar: { ratio: 1 } });
    const weakness = labels.filter(item => item.id.startsWith('weakness:'));
    expect(weakness).toHaveLength(2); expect(weakness.every(item => !item.lines[0].text.includes('×'))).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps unobserved ordinary actors unlabelled and groups only unfocused exposed neighbors with the earliest true expiry', () => {
    const state = battleState(); state.targets = [actor('ordinary'), actor('shell-a', { x: 700, exposedUntil: 8 }), actor('shell-b', { x: 745, exposedUntil: 7 })];
    const labels: SceneLabel[] = []; drawBattleLabels(canvas().ctx, state, { add: item => labels.push(item) });
    expect(labels.some(item => item.id === 'target:ordinary')).toBe(false);
    expect(labels.filter(item => item.id.startsWith('weakness:'))).toMatchObject([{ priority: 90, essential: true, lines: [{ text: '◇ 破绽 2s ×2' }] }]);
  });

  it('routes an active core caption to the sink while preserving actual danger primitives and small protected centers', () => {
    const state = battleState(), attack = { id: 'attack-1', kind: 'fission-burst' as const, trait: 'FISSION' as const, startedAt: 4, resolveAt: 6,
      origin: { x: 500, y: 350 }, aim: { x: 650, y: 450 }, angle: 0, range: 400, radius: 110, halfAngle: .5, landings: [] };
    const combat = { coreId: 'core', organId: 'heart', attack } as unknown as MotherCoreState;
    const legacy = canvas(), shared = canvas(), labels: SceneLabel[] = [], protectedRects: LabelRect[] = [], before = JSON.stringify({ state, combat });
    drawMotherCoreDangers(legacy.ctx, state, combat);
    const sink: SceneLabelSink = { add: item => labels.push(item), reserveWorld: rect => protectedRects.push(rect) };
    drawMotherCoreDangers(shared.ctx, state, combat, sink);
    const primitives = (calls: typeof legacy.calls) => calls.filter(call => ['ellipse', 'arc', 'moveTo', 'lineTo', 'closePath'].includes(call.method));
    expect(primitives(shared.calls)).toEqual(primitives(legacy.calls));
    expect(labels).toMatchObject([{ id: 'core-danger:core:attack-1', priority: 100, essential: true, lines: [{ text: '⋈ 裂殖爆发 1.0s' }] }]);
    expect(protectedRects).toHaveLength(2); expect(protectedRects.every(rect => rect.right - rect.left <= 20 && rect.bottom - rect.top <= 20)).toBe(true);
    expect(JSON.stringify({ state, combat })).toBe(before);
  });
});
