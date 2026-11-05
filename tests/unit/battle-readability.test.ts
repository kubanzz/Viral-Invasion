import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceTerritory, beginTerritoryPurification, TERRITORY_LANES } from '../../src/game/territory';
import { territoryMarkerView } from '../../src/game/territoryPresentation';
import { HEART_WORLD, LUNG_WORLD, TERRITORY_WORLD } from '../../src/game/organConfig';
import { BALANCE, type GameState, type Target } from '../../src/game/types';
import { isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import { supplyTerritoryDefense } from '../fixtures/territoryDefense';
import { Camera } from '../../src/render/camera';
import { playerHealthView } from '../../src/render/playerHealth';
import { playerVisualBounds } from '../../src/render/raisedObstacleOcclusion';
import { territoryRenderFrame } from '../../src/render/fantasyTerritory';
import { territoryMarkerLayouts } from '../../src/render/territoryMarkers';
import { PlayerDangerFeedback } from '../../src/render/playerDamageFeedback';

function fixture() { const game = new GameSession(71, { campaign: true, milestone: 'G3', mode: 'endless', territory: true }); game.start(); return game.snapshot(); }
function node(s: GameState, id: string) { return s.territory!.nodes.find(n => n.id === id)!; }
function step(s: GameState, seconds: number) { for (let i = 0; i < Math.round(seconds / BALANCE.step); i++) { s.tick++; s.elapsed = s.tick * BALANCE.step; advanceTerritory(s, BALANCE.step); } }
function virus(s: GameState, id: string): Target { return { ...node(s, id), id: 'test-virus', role: 'virus', kind: 'single', radius: 18, hp: 100, maxHp: 100, hitUntil: 0, scanned: false, territoryTask: { kind: 'invade', nodeId: id as 'front-north' } }; }

describe('authoritative target markers and infection alerts', () => {
  it('distinguishes prerequisites, contaminators, hurt and frozen progress without render writes', () => {
    const s = fixture(), front = node(s, 'front-north'), spring = node(s, 'heart-healing-1');
    expect(territoryMarkerView(s, front)).toMatchObject({ kind: 'purify', near: false, label: '' });
    Object.assign(s.player, { x: front.x, y: front.y });
    expect(territoryMarkerView(s, front)).toMatchObject({ kind: 'purify', label: 'F 净化' });
    expect(territoryMarkerView(s, front, true).label).toBe('净化组织');
    spring.owner = 'infected'; expect(territoryMarkerView(s, front)).toMatchObject({ kind: 'blocked', reason: '先夺回生命泉' });
    spring.owner = 'healthy'; s.targets = [virus(s, front.id)];
    expect(territoryMarkerView(s, front)).toMatchObject({ kind: 'blocked', reason: '先清敌' });
    s.targets = []; expect(beginTerritoryPurification(s).accepted).toBe(true); step(s, .5);
    const progress = front.purificationProgress;
    s.territory!.purificationInterruptedUntil = s.elapsed + .8;
    expect(territoryMarkerView(s, front)).toMatchObject({ kind: 'paused', reason: '躲开攻击' });
    step(s, .3); expect(front.purificationProgress).toBe(progress);
    s.phase = 'paused'; const before = JSON.stringify(s); advanceTerritory(s, 1);
    expect(territoryMarkerView(s, front).kind).toBe('paused'); expect(JSON.stringify(s)).toBe(before);
    s.phase = 'playing'; step(s, 4); expect(territoryMarkerView(s, front).kind).toBe('none');
  });
  it('uses source awakening, real garrison membrane and destruction states', () => {
    const s = fixture(), source = node(s, 'source-west');
    expect(territoryMarkerView(s, source).kind).toBe('dormant');
    s.territory!.sources['source-west'].spawned = true;
    expect(territoryMarkerView(s, source).kind).toBe('shielded');
    node(s, 'front-north').owner = 'healthy'; supplyTerritoryDefense(s, ['north']);
    expect(territoryMarkerView(s, source)).toMatchObject({ kind: 'attack', label: '射击摧毁' });
    s.territory!.sources['source-west'].destroyed = true;
    expect(territoryMarkerView(s, source).kind).toBe('none');
  });
  it('records only real transitions, survives log eviction, freezes on pause and clears after recapture', () => {
    const s = fixture(), spring = node(s, 'heart-healing-1');
    expect(s.territory!.nodes.every(n => territoryMarkerView(s, n).alert === null)).toBe(true);
    s.targets = [virus(s, spring.id)]; step(s, .1);
    expect(territoryMarkerView(s, spring).alert).toBe('contested');
    s.events = []; s.phase = 'paused'; const paused = territoryMarkerView(s, spring);
    advanceTerritory(s, 10); expect(territoryMarkerView(s, spring)).toEqual(paused);
    s.phase = 'playing'; step(s, 10);
    expect(spring.owner).toBe('infected'); expect(territoryMarkerView(s, spring).alert).toBe('captured');
    s.targets = []; Object.assign(s.player, { x: spring.x, y: spring.y });
    expect(beginTerritoryPurification(s).accepted).toBe(true); step(s, 3.1);
    expect(territoryMarkerView(s, spring)).toMatchObject({ kind: 'none', alert: null });
    expect(spring.capturedAt).toBeUndefined(); expect(spring.contestedAt).toBeUndefined();
    expect(fixture().territory!.nodes.every(n => n.capturedAt === undefined && n.contestedAt === undefined)).toBe(true);
  });
  it('shows infected targets farther than440 units while healthy nodes add no permanent icon', () => {
    const s = fixture(), front = node(s, 'front-north'); s.player.x = 1300; s.player.y = 900;
    const layout = territoryMarkerLayouts(s, territoryRenderFrame(s), { width: 1366, height: 768, scale: .5, project: p => ({ x: p.x * .5, y: p.y * .5 }) });
    expect(layout.some(m => m.view.node.id === front.id)).toBe(true);
    expect(layout.some(m => m.view.node.kind === 'healing' || m.view.node.kind === 'core')).toBe(false);
  });
});

describe('open rescue lanes and local player health', () => {
  it('keeps campaign geometry and clears every rescue lane by100 units beyond cover edges', () => {
    expect(HEART_WORLD.obstacles).toHaveLength(5); expect(LUNG_WORLD.obstacles).toHaveLength(4);
    const s = fixture(); expect(s.world).toEqual(TERRITORY_WORLD); expect(s.world!.obstacles).toHaveLength(2);
    for (const lane of TERRITORY_LANES) for (let i = 1; i < lane.path.length; i++) {
      const a = node(s, lane.path[i - 1]), b = node(s, lane.path[i]);
      for (let j = 0; j <= 100; j++) {
        const p = { x: a.x + (b.x - a.x) * j / 100, y: a.y + (b.y - a.y) * j / 100 };
        expect(isLegalPosition(p, 100, s.world)).toBe(true);
      }
      expect(wallHit(a, normalized(b.x - a.x, b.y - a.y), Math.hypot(b.x - a.x, b.y - a.y), s.world)).toBeNull();
    }
    const cover = s.world!.obstacles[0]; expect(isLegalPosition(cover, s.player.radius, s.world)).toBe(false);
    expect(wallHit({ x: cover.x - 100, y: cover.y }, { x: 1, y: 0 }, 200, s.world)).toBeCloseTo(60);
  });
  it('keeps constant CSS size, reads expanded max HP, follows lifted body and hides after death', () => {
    const s = fixture(), camera = new Camera(667, 320), feedback = new PlayerDangerFeedback();
    s.endlessGrowth!.ranks.vitality = 2; s.player.hp = 76;
    camera.follow(s.player, TERRITORY_WORLD, { minimumScale: .62, snap: true });
    const body = playerVisualBounds(s), view = playerHealthView(s, camera, body, feedback.update(s))!;
    expect(view.label).toBe('76/140'); expect(view.ratio).toBeCloseTo(76 / 140); expect(view.rect.right - view.rect.left).toBe(64);
    const lifted = playerHealthView(s, camera, { ...body, top: body.top - 40 }, 'healthy')!;
    expect(lifted.rect.top).toBeLessThan(view.rect.top); expect(lifted.rect.top).toBeGreaterThanOrEqual(6);
    s.player.hp = 10; expect(playerHealthView(s, camera, body, feedback.update(s))!.color).toBe('#ed6871');
    s.player.hp = 0; expect(playerHealthView(s, camera, body, feedback.update(s))).toBeNull();
  });
});
