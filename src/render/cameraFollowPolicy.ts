import type { GameState, Vec } from '../game/types';

/** Decide when a visual camera follows or holds; never modifies game state. */
export class CameraFollowPolicy {
  private scope = '';
  private player: Vec | undefined;

  reset(): void { this.scope = ''; this.player = undefined; }

  next(scope: string, phase: GameState['phase'], player: Vec, deltaSeconds: number, discontinuity: boolean,
    stepPositions: readonly Vec[] = []): { hold: boolean; snap: boolean } {
    const changedScope = scope !== this.scope || !this.player;
    // Compare every fixed-step endpoint, including the position before the first
    // step, so a slow render cannot turn a normal dash into a teleport.
    let previous = this.player, movedFar = false;
    for (const point of [...stepPositions, player]) {
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) > 40) movedFar = true;
      previous = point;
    }
    // A paused overlay freezes the camera at the exact view shown when it was
    // opened, including while the simulation clock is reset on every frame.
    if (phase === 'paused' && !changedScope && !movedFar) return { hold: true, snap: false };
    const snap = changedScope || movedFar || discontinuity || deltaSeconds > .25 || phase === 'menu' || phase === 'result';
    this.scope = scope; this.player = { x: player.x, y: player.y };
    return { hold: false, snap };
  }
}
