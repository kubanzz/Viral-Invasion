import type { GameState, Target } from '../game/types';
import type { CombatFrame } from './smartVirusVisuals';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';

export const LIVING_BOSS_ASSET_IDS = ['sanctum.boss.crystal', 'sanctum.boss.fission', 'sanctum.boss.devourer'] as const;
export interface LivingBossAsset extends SourceRegisteredSpriteAsset { flags?: readonly string[] }
export interface LivingBossPose {
  stage: 1 | 2 | 3; action: string; moving: boolean; scaleX: number; scaleY: number;
}

/** Body breathing and gait use the accepted simulation clock, so pause holds the pose. */
export function livingBossPose(target: Target, state: GameState): LivingBossPose | undefined {
  const combat = state.territory?.bossCombat, heart = combat?.heartBoss;
  if (!combat?.heartExpedition || !heart || combat.coreId !== target.id) return;
  const time = state.visualTime ?? state.elapsed, moving = !!combat.locomotion?.moving;
  const lunge = combat.locomotion?.mode === 'lunge', winding = combat.phase === 'windup';
  const breath = Math.sin(time * (heart.stage === 3 ? 4.8 : 3.2));
  const stride = moving ? Math.sin(time * (lunge ? 24 : 10)) : 0;
  const action = target.hp <= 0 ? 'defeated' : lunge ? 'lunge' : winding ? 'windup' : moving ? combat.locomotion!.mode : 'idle';
  return { stage: heart.stage, action, moving,
    scaleX: 1 + breath * .012 + stride * .018 + (winding ? .025 : lunge ? -.025 : 0),
    scaleY: 1 - breath * .009 - stride * .012 + (winding ? -.025 : lunge ? .035 : 0) };
}

/** New art is a complete body. It replaces the old base-plus-stage composition. */
export function livingBossFrame(assets: Readonly<Record<string, LivingBossAsset>>, target: Target, state: GameState): (CombatFrame & { pose: LivingBossPose }) | undefined {
  const pose = livingBossPose(target, state); if (!pose) return;
  const id = LIVING_BOSS_ASSET_IDS[pose.stage - 1], asset = assets[id], canvas = asset?.sourceSize;
  if (!asset?.flags?.includes('living-world-v023-reviewed') || !canvas) return;
  const logicalWidth = [264, 282, 302][pose.stage - 1];
  const layout = sourceRegisteredSpriteLayout(asset, canvas, { x: canvas.width * .5, y: canvas.height * .849609375 }, logicalWidth / canvas.width);
  if (!layout) return;
  const b = layout.bounds;
  return { id, flipX: Math.cos(target.facing ?? state.territory!.bossCombat!.facing) < -.25, pose,
    layout: { ...layout, width: layout.width * pose.scaleX, height: layout.height * pose.scaleY,
      bounds: { left: b.left * pose.scaleX, right: b.right * pose.scaleX, top: b.top * pose.scaleY, bottom: b.bottom * pose.scaleY } } };
}
