import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, type GameState } from '../../src/game/types';
import { DEFAULT_EXPEDITION_LOADOUT } from '../../src/game/expedition';
import { BOW_READY_TIME, Player3DMotionController, player3DDirectionalWeights } from '../../src/render/player3DMotion';

function state(): GameState { const session = new GameSession(71); session.start(); session.state.events = []; return session.state; }
function advance(s: GameState, dx = 0, dy = 0, steps = 1): void {
  s.tick += steps; s.elapsed = s.tick * BALANCE.step; delete s.visualTime;
  s.player.x += dx; s.player.y += dy; s.player.moving = dx !== 0 || dy !== 0; s.events = [];
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}

describe('continuous three-dimensional player animation presentation', () => {
  it('blends forward, backward and strafing continuously across direction and angle wrap', () => {
    expect(player3DDirectionalWeights({ x: 100, y: 0 }, 0).Jog).toBe(1);
    expect(player3DDirectionalWeights({ x: -100, y: 0 }, 0).Walk_Backwards).toBe(1);
    expect(player3DDirectionalWeights({ x: 0, y: 100 }, 0).Strafe_right).toBe(1);
    expect(player3DDirectionalWeights({ x: 0, y: -100 }, 0).Strafe_left).toBe(1);
    const diagonal = player3DDirectionalWeights({ x: 100, y: 100 }, 0);
    expect(diagonal.Jog).toBeCloseTo(.5); expect(diagonal.Strafe_right).toBeCloseTo(.5);
    const around = [Math.PI - 1e-5, -Math.PI + 1e-5].map(facing => player3DDirectionalWeights({ x: -100, y: 0 }, facing));
    expect(around[0].Jog).toBeCloseTo(around[1].Jog, 8);
    expect(around[0].Strafe_left + around[1].Strafe_right).toBeLessThan(.001);
    for (let i = 0; i < 360; i++) {
      const angle = i / 180 * Math.PI, weights = player3DDirectionalWeights({ x: Math.cos(angle), y: Math.sin(angle) }, .31);
      expect(Object.values(weights).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('uses accepted displacement and cannot create footsteps from blocked input or interpolated positions', () => {
    const s = state(), motion = new Player3DMotionController(); motion.observe(s); motion.sample(s);
    advance(s, BALANCE.speed * BALANCE.step); motion.observe(s);
    const walking = motion.sample(s); expect(walking.moving).toBe(true); expect(walking.locomotionWeights.Jog).toBe(1);
    const distance = walking.distance;
    const painted = { ...s, player: { ...s.player, x: s.player.x + 30 } };
    expect(motion.sample(painted).distance).toBe(distance);
    advance(s); s.player.moving = true; motion.observe(s);
    const blocked = motion.sample(s); expect(blocked.moving).toBe(false); expect(blocked.distance).toBe(distance);
    expect(blocked.locomotionWeights.Idle_Subtle).toBe(1);
  });

  it('does not consume a duplicate tick, treats teleports as discontinuities and gives dash its own pose', () => {
    const s = state(), motion = new Player3DMotionController(); motion.observe(s);
    advance(s, 3); motion.observe(s); const first = motion.sample(s);
    motion.observe(s); expect(motion.sample(s).distance).toBe(first.distance);
    advance(s, 600); motion.observe(s); expect(motion.sample(s).moving).toBe(false); expect(motion.sample(s).distance).toBe(0);
    advance(s, 12, 6); s.player.dashUntil = s.elapsed + BALANCE.dashDuration;
    s.events = [{ type: 'PLAYER_DASHED', tick: s.tick, data: { x: s.player.x, y: s.player.y } }];
    motion.observe(s); const dash = motion.sample(s);
    expect(dash.dashing).toBe(true); expect(dash.moving).toBe(false); expect(dash.locomotionWeights.Sprint).toBe(1);
    expect(dash.bodyFacing).toBeCloseTo(Math.atan2(6, 12)); expect(dash.upperClip).toBeUndefined();
  });

  it('freezes the displayed animation clock while paused and resets receipts after a run rewind', () => {
    const s = state(), motion = new Player3DMotionController(); motion.observe(s); motion.sample(s);
    advance(s, 3); motion.observe(s); const playing = motion.sample(s);
    s.phase = 'paused'; s.visualTime = 100;
    const paused = motion.sample(s); expect(paused.paused).toBe(true); expect(paused.delta).toBe(0); expect(paused.time).toBe(playing.time);
    s.phase = 'playing'; advance(s); motion.observe(s); expect(motion.sample(s).delta).toBeCloseTo(BALANCE.step);
    s.tick = 0; s.elapsed = 0; s.events = []; s.player.moving = false; s.player.dashUntil = 0;
    motion.observe(s); const restarted = motion.sample(s);
    expect(restarted.delta).toBe(0); expect(restarted.distance).toBe(0); expect(restarted.speed).toBe(0);
    expect(restarted.upperEvent).toBeUndefined(); expect(restarted.fullBodyEvent).toBeUndefined();
  });

  it('consumes a real launch once, deduplicates its tool receipt and expires the upper action independently of movement', () => {
    const s = state(), motion = new Player3DMotionController(); motion.observe(s); motion.sample(s);
    advance(s, 3); s.player.actionUntil = s.elapsed + .15;
    s.events = [
      { type: 'TOOL_FIRED', tick: s.tick, data: { tool: 1 } },
      { type: 'PLAYER_PROJECTILE_LAUNCHED', tick: s.tick, data: { kind: 'primary', castId: 'shot:1' } },
    ];
    motion.observe(s); const shot = motion.sample(s);
    expect(shot.upperEvent?.clip).toBe('Pistol_Shoot'); expect(shot.upperEvent?.id).toContain('shot:1');
    expect(shot.locomotionWeights.Jog).toBe(1); expect(shot.upperEvent!.timeScale).toBeGreaterThan(1);
    motion.observe(s); expect(motion.sample(s).upperEvent?.id).toBe(shot.upperEvent?.id);
    advance(s, 3); motion.observe(s); expect(motion.sample(s).upperEvent?.age).toBeGreaterThan(0);
    advance(s, 0, 0, 15); motion.observe(s); expect(motion.sample(s).upperEvent).toBeUndefined();
    expect(motion.sample(s).upperClip).toBe('Pistol_Idle');
  });

  it('follows committed bow preparation and release, while hurt remains a distinct full-body receipt', () => {
    const s = state(), motion = new Player3DMotionController();
    s.weaponCombat = { loadout: { ...DEFAULT_EXPEDITION_LOADOUT, weaponId: 'piercing' }, serial: 1, cooldowns: { 1: 0, 2: 0, 3: 0 },
      primaryBlockedUntil: .45, overdriveUntil: 0, reservedProjectiles: 1,
      preparation: { castId: 'bow:1', firesAt: .45, direction: { x: 0, y: 1 }, damage: 4 } };
    motion.observe(s); expect(motion.sample(s).upperEvent?.clip).toBe('Bow Pull Back');
    advance(s, 0, 0, 12); motion.observe(s); const drawing = motion.sample(s);
    expect(drawing.upperEvent?.clip).toBe('Bow Pull Back'); expect(drawing.aimFacing).toBeCloseTo(Math.PI / 2);
    advance(s, 0, 0, 17); motion.observe(s); expect(motion.sample(s).upperEvent?.kind).toBe('hold');
    delete s.weaponCombat.preparation; advance(s);
    s.events = [{ type: 'PLAYER_PROJECTILE_LAUNCHED', tick: s.tick, data: { kind: 'primary', castId: 'bow:1', weaponId: 'piercing' } }];
    motion.observe(s); expect(motion.sample(s).upperEvent?.clip).toBe('Bow Release');
    advance(s); s.player.hurtUntil = s.elapsed + .5;
    s.events = [{ type: 'PLAYER_HURT', tick: s.tick, data: { damage: 5 } }]; motion.observe(s);
    expect(motion.sample(s).fullBodyEvent?.clip).toBe('Hit_Chest');
    const eventId = motion.sample(s).fullBodyEvent?.id; motion.observe(s);
    expect(motion.sample(s).fullBodyEvent?.id).toBe(eventId);
  });

  it('does not turn another weapon preparation into a bow draw or bow hold', () => {
    const s = state(), motion = new Player3DMotionController();
    s.weaponCombat = { loadout: { ...DEFAULT_EXPEDITION_LOADOUT, weaponId: 'steady' }, serial: 1, cooldowns: { 1: 0, 2: 0, 3: 0 },
      primaryBlockedUntil: .45, overdriveUntil: 0, reservedProjectiles: 1,
      preparation: { castId: 'steady:1', firesAt: .45, direction: { x: 0, y: 1 }, damage: 4 } };
    motion.observe(s); const preparing = motion.sample(s);
    expect(preparing.upperClip).toBe('Pistol_Idle'); expect(preparing.upperEvent).toBeUndefined();
    advance(s, 0, 0, 30); motion.observe(s); const held = motion.sample(s);
    expect(held.upperClip).toBe('Pistol_Idle'); expect(held.upperEvent).toBeUndefined();
  });

  it('keeps an equipped bow ready while walking and draws only after a committed preparation', () => {
    const s = state(), motion = new Player3DMotionController();
    s.weaponCombat = { loadout: { ...DEFAULT_EXPEDITION_LOADOUT, weaponId: 'piercing' }, serial: 0, cooldowns: { 1: 0, 2: 0, 3: 0 },
      primaryBlockedUntil: 0, overdriveUntil: 0, reservedProjectiles: 0 };
    motion.observe(s); expect(motion.sample(s).upperClip).toBe('Bow_Ready');
    advance(s, 3); motion.observe(s); const walking = motion.sample(s);
    expect(walking.moving).toBe(true); expect(walking.upperClip).toBe('Bow_Ready'); expect(walking.upperEvent).toBeUndefined();
    advance(s, 3);
    s.weaponCombat.preparation = { castId: 'ready-to-draw', firesAt: s.elapsed + .45, direction: { x: 1, y: 0 }, damage: 10 };
    motion.observe(s); const draw = motion.sample(s);
    expect(draw.upperEvent?.clip).toBe('Bow Pull Back'); expect(draw.upperEvent?.timeOffset).toBe(BOW_READY_TIME);
    const original = JSON.stringify(s); s.phase = 'paused'; s.visualTime = 1000;
    const paused = motion.sample(s); expect(paused.upperEvent?.age).toBe(draw.upperEvent?.age); expect(paused.delta).toBe(0);
    s.phase = 'playing'; delete s.visualTime; expect(JSON.stringify(s)).toBe(original);
  });

  it('derives presentation without writing authoritative state', () => {
    const s = state(), motion = new Player3DMotionController(), before = JSON.stringify(s); freeze(s);
    motion.observe(s); motion.sample(s); motion.sample(s, -.2);
    expect(JSON.stringify(s)).toBe(before);
  });
});
