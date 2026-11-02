import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { HOST_EVENT_BALANCE, eventModifier } from '../../src/game/hostEvents';
import { hostEventHudMarkup, updateHostEventHud } from '../../src/ui/hostEventHud';
import { drawHostEventGround, drawHostEventLabels, drawHostEventTarget } from '../../src/render/hostEventVisuals';
import type { SceneLabel } from '../../src/render/sceneLabels';

afterEach(() => vi.unstubAllGlobals());

function session() { const game = new GameSession(71, { campaign: true, milestone: 'G3' }); game.start(); return game; }
function hud() {
  const nodes = new Map([...hostEventHudMarkup.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
    textContent: '', hidden: true, dataset: {} as Record<string, string>, ownerDocument: {},
    style: { width: '', values: {} as Record<string, string>, setProperty(key: string, value: string) { this.values[key] = value; } },
  }]));
  vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
  return nodes;
}
function canvas() {
  const operations: { method: string; args: unknown[]; fillStyle?: unknown }[] = [], drawing: Record<string, unknown> = {};
  const ctx = new Proxy(drawing, { get: (target, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : target[String(key)] ?? ((...args: unknown[]) => operations.push({ method: String(key), args, fillStyle: target.fillStyle })), set: (target, key, value) => { target[String(key)] = value; return true; } }) as unknown as CanvasRenderingContext2D;
  return { ctx, operations };
}

describe('host activity presentation', () => {
  it('keeps warning reveal and countdown frozen during pause and names medication rounds as zones', () => {
    const game = session(); expect(game.debugHostEvent('MEDICATION').ok).toBe(true);
    const nodes = hud(); updateHostEventHud(game.state);
    expect(nodes.get('host-event-category')!.textContent).toContain('绿色');
    expect(nodes.get('host-event-title')!.textContent).toContain('药剂入体');
    expect(nodes.get('host-event-time')!.textContent).toBe('2.0s');
    expect(nodes.get('host-event-objectives')!.textContent).toBe('药区待结束 3/3');
    game.pause(); updateHostEventHud(game.state);
    const text = nodes.get('host-event-time')!.textContent, reveal = { ...nodes.get('host-event-card')!.style.values };
    const before = game.snapshot();
    for (let i = 0; i < 120; i++) game.step({ moveX: 0, moveY: 0, aim: game.state.player, fire: false });
    updateHostEventHud(game.state);
    expect(nodes.get('host-event-time')!.textContent).toBe(text);
    expect(nodes.get('host-event-card')!.style.values).toEqual(reveal);
    expect(game.state).toEqual(before);
    expect(hostEventHudMarkup).not.toMatch(/<button|tabindex=|role="dialog"/);
  });

  it('uses the same rest values as its effective modifier and displays a concrete disabled reason', () => {
    const game = session(); game.debugHostEvent('REST');
    const nodes = hud();
    for (let i = 0; i < 120; i++) game.step({ moveX: 0, moveY: 0, aim: game.state.player, fire: false });
    updateHostEventHud(game.state);
    expect(nodes.get('host-event-description')!.textContent).toContain(`+${(HOST_EVENT_BALANCE.rest.activeRepairMultiplier - 1) * 100}%`);
    expect(eventModifier(game.state, 'playerActiveRepair')).toBe(HOST_EVENT_BALANCE.rest.activeRepairMultiplier);
    expect(nodes.get('host-event-time')!.textContent).toBe('30.0s');
    game.state.hostEvents!.active = null;
    updateHostEventHud(game.state, '当前器官只有 1 个真实可修复组织，需要 2 个。');
    expect(nodes.get('host-event-title')!.textContent).toContain('不可用');
    expect(nodes.get('host-event-description')!.textContent).toContain('只有 1 个真实可修复组织');
  });

  it('shows medication preview only in its one second window, and clears its labels on expiry and organ exit', () => {
    const game = session(); game.debugHostEvent('MEDICATION');
    const state = game.state, zone = state.hostEvents!.active!.zones[0], drawn = canvas(), labels: SceneLabel[] = [];
    state.elapsed = zone.previewAt - .01; drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(drawn.operations).toHaveLength(0); expect(labels).toHaveLength(0);
    state.elapsed = zone.previewAt; drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(labels[0].lines[0].text).toContain('1.0s'); expect(labels[0].anchor).toEqual(zone);
    expect(drawn.operations.filter(item => item.method === 'arc')[0].args[2]).toBe(HOST_EVENT_BALANCE.medication.radiusR * state.player.radius);
    drawn.operations.length = 0; labels.length = 0; state.elapsed = zone.endsAt;
    drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(drawn.operations).toHaveLength(0); expect(labels).toHaveLength(0);
    state.elapsed = zone.previewAt; state.battle!.organId = 'lung';
    drawHostEventGround(drawn.ctx, state); expect(drawn.operations).toHaveLength(0);
  });

  it('never draws a skipped medication round or promotes a pending round to an active circle', () => {
    const game = session(); game.debugHostEvent('MEDICATION');
    const state = game.state, zone = state.hostEvents!.active!.zones[0], drawn = canvas(), labels: SceneLabel[] = [];
    zone.medicationState = 'skipped'; zone.skipReason = 'blood-flow-anchor-lost';
    for (const elapsed of [zone.previewAt, zone.startsAt, zone.startsAt + 1]) {
      state.elapsed = elapsed;
      drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
      expect(drawn.operations).toHaveLength(0); expect(labels).toHaveLength(0);
    }
    zone.medicationState = 'pending'; delete zone.skipReason; state.elapsed = zone.startsAt;
    drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(drawn.operations).toHaveLength(0); expect(labels).toHaveLength(0);
    zone.medicationState = 'spawned';
    drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(drawn.operations.some(operation => operation.method === 'arc')).toBe(true);
    expect(labels[0].lines[0].text).toContain('引怪进入');
  });

  it('reports skipped medication count and its reason without counting the skipped round as remaining', () => {
    const game = session(); game.debugHostEvent('MEDICATION');
    const state = game.state, zone = state.hostEvents!.active!.zones[0], nodes = hud();
    state.elapsed = zone.previewAt; zone.medicationState = 'skipped'; zone.skipReason = 'blood-flow-anchor-lost';
    updateHostEventHud(state);
    expect(nodes.get('host-event-objectives')!.textContent).toBe('药区待结束 2/3 · 跳过 1');
    expect(nodes.get('host-event-status')!.textContent).toBe('血流路径失效');
    expect(nodes.get('host-event-card')!.dataset.skipped).toBe('true');
    expect(nodes.get('host-event-description')!.textContent).toContain('每秒 1D');
    state.hostEvents!.active = null;
    updateHostEventHud(state, '依赖不足');
    expect(nodes.get('host-event-status')!.textContent).toBe('宿主活动');
    expect(nodes.get('host-event-card')!.dataset.skipped).toBe('false');
  });

  it('renders smoke below 10% fill opacity, distinct event targets and truthful HP labels without mutating combat', () => {
    const game = session(); game.debugHostEvent('MEDICATION');
    const state = game.state, active = state.hostEvents!.active!;
    active.id = 'SMOKE'; active.phase = 'active'; state.elapsed = active.startsAt;
    const target = { ...state.targets[0], id: 'smoke-test', role: 'event' as const, hp: 34, maxHp: 102, radius: 19 };
    state.targets.push(target); active.targetIds = [target.id];
    active.zones = [{ ...active.zones[0], kind: 'smoke', startsAt: state.elapsed, previewAt: state.elapsed, endsAt: state.elapsed + 35, targetId: target.id }];
    const before = game.snapshot(), drawn = canvas(), labels: SceneLabel[] = [];
    drawHostEventGround(drawn.ctx, state);
    expect(drawn.operations.find(item => item.method === 'fill')!.fillStyle).toBe('#92869d19');
    expect(drawHostEventTarget(drawn.ctx, target, state)).toBe(true);
    expect(drawHostEventTarget(drawn.ctx, state.targets[0], state)).toBe(false);
    drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(labels[0].bar!.ratio).toBeCloseTo(1 / 3); expect(labels[0].lines[0].text).toContain('污染源 · 1 净化');
    expect(state).toEqual(before);
    target.hp = 0; drawn.operations.length = 0; labels.length = 0;
    drawHostEventGround(drawn.ctx, state); drawHostEventLabels(state, { add: label => labels.push(label) });
    expect(drawn.operations).toHaveLength(0); expect(labels).toHaveLength(0);
  });
});
