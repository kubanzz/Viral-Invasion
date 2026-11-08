import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { MotherCoreController, HEART_BOSS_BALANCE } from '../../src/game/motherCore';
import { heartBossHudView, territoryHudMarkup } from '../../src/ui/territoryHud';
import { drawHeartBossOverlay } from '../../src/render/heartBossVisuals';
import type { Target } from '../../src/game/types';

function fixture() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state;
  const boss: Target = { id: 'presentation-boss', role: 'core', kind: 'single', x: 1000, y: 700, radius: 52,
    hp: HEART_BOSS_BALANCE.hp, maxHp: HEART_BOSS_BALANCE.hp, hitUntil: 0, scanned: false };
  const combat = new MotherCoreController({ coreId: boss.id, organId: 'heart', traits: ['CARAPACE'], tick: 0, elapsed: 0, heartExpedition: true }).state;
  state.targets = [boss]; state.territory!.bossId = boss.id; state.territory!.bossCombat = combat; state.territory!.stage = 'boss';
  return { state, boss, combat, heart: combat.heartBoss! };
}
function recorder() {
  const arcs: number[][] = [], lines: number[][] = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'arc' ? (...args: number[]) => arcs.push(args)
    : key === 'moveTo' || key === 'lineTo' ? (...args: number[]) => lines.push(args) : () => {}, set: () => true }) as CanvasRenderingContext2D;
  return { ctx, arcs, lines };
}

describe('heart boss phase presentation', () => {
  it('shows the current real bar, remaining bars and toughness, and hides outside the boss encounter', () => {
    const f = fixture(); expect(heartBossHudView(f.state)).toMatchObject({ stage: 1, stageName: '晶膜', hp: HEART_BOSS_BALANCE.barHp, maxHp: HEART_BOSS_BALANCE.barHp, remainingBars: 3, health: 1 });
    f.heart.stage = 2; f.boss.hp = HEART_BOSS_BALANCE.barHp * 2 - 500; f.heart.toughness = 45;
    expect(heartBossHudView(f.state)).toMatchObject({ stage: 2, stageName: '裂殖', hp: HEART_BOSS_BALANCE.barHp - 500, remainingBars: 2, toughness: 45 });
    f.heart.stage = 3; f.boss.hp = 500; f.heart.brokenUntil = f.state.elapsed + 1.2;
    expect(heartBossHudView(f.state)).toMatchObject({ stage: 3, stageName: '噬心', hp: 500, remainingBars: 1, broken: true });
    expect(heartBossHudView(f.state)?.hint).toContain('破韧 1.2s');
    f.state.territory!.stage = 'cleanup'; expect(heartBossHudView(f.state)).toBeNull();
    expect(territoryHudMarkup).toContain('id="heart-boss-health"'); expect(territoryHudMarkup).toContain('aria-label="母巢韧性"');
  });

  it('paints the exact locked impact/guard circles in standard and low effects without mutating simulation', () => {
    for (const kind of ['heart-marked-strike', 'heart-guard-call'] as const) {
      const f = fixture(); f.state.elapsed = .5;
      f.combat.attack = { id: 'preview', kind, trait: 'CARAPACE', startedAt: 0, resolveAt: 1,
        origin: { x: 1000, y: 700 }, aim: { x: 800, y: 650 }, angle: 0, range: 0, radius: 72, halfAngle: 0,
        landings: [{ x: 900, y: 650 }, { x: 1100, y: 650 }] };
      const before = JSON.stringify(f.state), standard = recorder(), low = recorder();
      drawHeartBossOverlay(standard.ctx, f.state, false); drawHeartBossOverlay(low.ctx, f.state, true);
      expect(JSON.stringify(f.state)).toBe(before);
      const expected = kind === 'heart-marked-strike' ? [[800, 650, 72]] : [[900, 650, 24], [1100, 650, 24]];
      for (const arc of expected) {
        expect(standard.arcs.some(a => a.slice(0, 3).join() === arc.join())).toBe(true);
        expect(low.arcs.some(a => a.slice(0, 3).join() === arc.join())).toBe(true);
      }
    }
  });

  it('renders distinct stage silhouettes and refuses to draw a dead or offscreen boss', () => {
    const f = fixture(), one = recorder(); drawHeartBossOverlay(one.ctx, f.state, true);
    f.heart.stage = 3; const three = recorder(); drawHeartBossOverlay(three.ctx, f.state, true);
    expect(one.arcs[0].slice(0, 3)).toEqual([1000, 700, 63]); expect(three.arcs[0].slice(0, 3)).toEqual([1000, 700, 63]);
    f.boss.hp = 0; const dead = recorder(); drawHeartBossOverlay(dead.ctx, f.state); expect(dead.arcs).toEqual([]);
  });
  it('preserves the exact clipped lunge capsule and directional warning under low effects', () => {
    for (const low of [false, true]) {
      const f = fixture(); f.state.elapsed = .4;
      f.combat.attack = { id: 'locked-lunge', kind: 'heart-lunge', trait: 'CARAPACE', startedAt: 0, resolveAt: .95,
        origin: { x: 1000, y: 700 }, aim: { x: 1250, y: 700 }, angle: 0, range: 250, radius: 52, halfAngle: 0, landings: [], damage: 20 };
      const before = JSON.stringify(f.state), output = recorder(), labels: unknown[] = [];
      drawHeartBossOverlay(output.ctx, f.state, low, { add: (value: unknown) => labels.push(value) } as never);
      expect(JSON.stringify(f.state)).toBe(before);
      expect(output.arcs.some(arc => arc.slice(0, 3).join() === '1250,700,52')).toBe(true);
      expect(output.lines).toContainEqual([1000, 752]); expect(output.lines).toContainEqual([1250, 752]);
      expect(labels).toHaveLength(1); expect(heartBossHudView(f.state)?.hint).toContain('向侧面闪避');
    }
  });
});
