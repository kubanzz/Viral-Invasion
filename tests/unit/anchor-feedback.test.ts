import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { anchorDangerView } from '../../src/game/anchorDanger';
import { anchorHealthView, drawAnchorHealth } from '../../src/render/anchorHealth';
import { Camera } from '../../src/render/camera';
import { drawEndlessMinimap } from '../../src/ui/endlessHud';
import { territoryInvasionWarning, territoryHudView } from '../../src/ui/territoryHud';
import { mobileHudView } from '../../src/ui/mobileHud';
import type { GameState, Target } from '../../src/game/types';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  game.configureExpedition({ runId: 'anchor-test', seed: 71, loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 },
    blueprints: [], extraAntibodies: 0, firstClear: true, missionId: 'membrane', modules: [] });
  game.state.targets = []; game.state.elapsed = 5; game.state.tick = 300;
  return game;
}
const attacker = (s: GameState, patch: Partial<Target> = {}): Target => ({ id: 'anchor-attacker', role: 'virus', kind: 'single',
  x: s.tissue.x + 70, y: s.tissue.y, radius: 22, hp: 100, maxHp: 100, hitUntil: 0, scanned: false,
  territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: 'core' }, ...patch });
function drawing() {
  const texts: string[] = [], arcs: number[][] = [];
  const ctx = new Proxy({}, { get: (_, method) => method === 'fillText' ? (text: string) => texts.push(text)
    : method === 'arc' ? (...args: number[]) => arcs.push(args) : () => {}, set: () => true }) as CanvasRenderingContext2D;
  return { ctx, texts, arcs };
}

describe('protected anchor combat feedback', () => {
  it('requires a committed attack rather than proximity or a redirected attack on allies', () => {
    const s = fixture().state; s.targets = [attacker(s)];
    expect(anchorDangerView(s).attacked).toBe(false); expect(territoryInvasionWarning(s)).toBe('');
    s.targets[0].attackAt = 6; s.targets[0].attackTarget = 'immune';
    expect(anchorDangerView(s).attacked).toBe(false);
    s.targets[0].attackTarget = 'tissue';
    expect(anchorDangerView(s)).toMatchObject({ attacked: true, attackerIds: ['anchor-attacker'] });
    expect(mobileHudView(s).warnings[0]).toEqual({ kind: 'anchor', text: '稳态锚受袭 · 返回防守' });
    expect(territoryHudView(s)?.detail).toBe('稳态锚受袭 · 返回防守');
    s.targets[0].hp = 0; expect(anchorDangerView(s).attacked).toBe(false);
  });
  it.each(['enemy-attack', 'core-corrosion', 'core-crystal-sweep', 'core-fission-burst'])('retains a real %s hit for two paused simulation seconds', reason => {
    const game = fixture(), s = game.state;
    game.emit('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 100, after: 95, reason });
    expect(s.territory!.coreLastHitAt).toBe(5); expect(anchorDangerView(s).attacked).toBe(true);
    s.events = []; s.phase = 'paused'; expect(anchorDangerView(s).attacked).toBe(true);
    s.elapsed = 7; expect(anchorDangerView(s).attacked).toBe(false);
  });
  it.each(['repair', 'infection', 'protocol-pressure', 'pulse-pressure', 'offscreen-open-sources'])('never calls %s erosion or repair a real enemy attack', reason => {
    const game = fixture(); game.emit('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 100, after: 95, reason });
    expect(game.state.territory!.coreLastHitAt).toBeUndefined(); expect(anchorDangerView(game.state).attacked).toBe(false);
  });
  it('records an actual resolved strike, including its lethal hit, without relying on live attacker state', () => {
    const game = fixture(), s = game.state;
    s.tissue.hp = 1; s.targets = [attacker(s, { attackAt: 5, attackTarget: 'tissue', attackAim: { ...s.tissue } })];
    game.step({ moveX: 0, moveY: 0, aim: s.player, fire: false });
    expect(s.tissue.hp).toBe(0); expect(s.territory!.coreLastHitAt).toBe(s.elapsed);
    expect(s.phase).toBe('result'); expect(s.result?.success).toBe(false);
  });
  it('shows full and damaged anchor HP at its world position and uses its actual maximum', () => {
    const s = fixture().state, camera = new Camera(); camera.width = 1440; camera.height = 900;
    s.tissue.maxHp = 200; s.tissue.hp = 200; const full = anchorHealthView(s, camera)!;
    expect(full).toMatchObject({ ratio: 1, label: '200/200', attacked: false });
    s.tissue.hp = 60; expect(anchorHealthView(s, camera)).toMatchObject({ ratio: .3, color: '#ed6871', label: '60/200' });
    const drawn = drawing(); drawAnchorHealth(drawn.ctx, anchorHealthView(s, camera)); expect(drawn.texts).toEqual(['稳态锚', '60/200']);
    expect(mobileHudView(s)).toMatchObject({ tissue: '60/200', organ: '稳态锚' });
    camera.offsetX = -10000; expect(anchorHealthView(s, camera)).toBeNull();
    camera.offsetX = 0; s.phase = 'result'; expect(anchorHealthView(s, camera)).toBeNull();
  });
  it('moves the anchor vitals clear of the top HUD and player health on a compact viewport', () => {
    const s = fixture().state, camera = new Camera(); camera.width = 667; camera.height = 320;
    camera.offsetX = 300 - s.tissue.x; camera.offsetY = 170 - s.tissue.y * camera.yScale;
    const blocked = [{ left: 0, right: 667, top: 0, bottom: 122 }, { left: 260, right: 324, top: 140, bottom: 162 }];
    const health = anchorHealthView(s, camera, blocked)!;
    expect(health).not.toBeNull();
    expect(blocked.some(r => r.left < health.rect.right && r.right > health.rect.left && r.top < health.rect.bottom && r.bottom > health.rect.top)).toBe(false);
  });
  it('draws a recognizable minimap alarm in standard and low effects without warning for idle infected terrain', () => {
    const s = fixture().state, d = drawing();
    vi.stubGlobal('document', { getElementById: () => ({ width: 220, height: 130, getContext: () => d.ctx }) });
    drawEndlessMinimap(s); expect(d.texts).not.toContain('!');
    s.territory!.coreLastHitAt = s.elapsed;
    drawEndlessMinimap(s); expect(d.texts).toContain('!');
    d.texts.length = 0; d.arcs.length = 0; drawEndlessMinimap(s, true);
    expect(d.texts).toContain('!'); expect(d.arcs.some(arc => arc[2] === 7)).toBe(true);
  });
});
