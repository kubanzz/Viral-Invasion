// Read-only audit proposal. NOT EXECUTED, not part of tests/, and not a browser win.
// Direct setup below is an explicit mechanism fixture, followed by one public E input.
import { distance } from '../../../src/actors/collision';
import { GameSession } from '../../../src/game/session';
import { activeWorld, type GameEvent, type Target } from '../../../src/game/types';
import { BATTLE_BALANCE } from '../../../src/game/battleConfig';

const game = new GameSession(91, { campaign: true, milestone: 'G1' });
game.start();
const state = game.state, pulse = state.battle!.pulse, world = activeWorld(state);
Object.assign(state.player, pulse.origin);
const target: Target = {
  id: 'audit-boundary-pulse', role: 'virus', kind: 'single',
  x: world.bounds.right - 22, y: pulse.origin.y, radius: 22,
  hp: 68, maxHp: 68, scanned: false, hitUntil: 0, traits: [],
};
state.targets = [target];
const before = { x: target.x, y: target.y };
if (distance(pulse.origin, target) > BATTLE_BALANCE.pulseRange + target.radius) {
  throw new Error('Fixture boundary is outside the real pulse; choose another valid boundary point.');
}
let proof: { event: GameEvent; eventTimePosition: { x: number; y: number }; actualDisplacement: number } | undefined;
game.bus.on('event', event => {
  if (event.type !== 'PULSE_TRIGGERED') return;
  // Capture synchronously: normal enemy movement later in the same step can move it inward.
  const eventTimePosition = { x: target.x, y: target.y };
  proof = { event: structuredClone(event), eventTimePosition, actualDisplacement: distance(before, eventTimePosition) };
});
game.step({ moveX: 0, moveY: 0, aim: before, fire: false, interact: true });
console.log({ before, proof, visibleNoticeAfterStep: game.state.message,
  expectedCurrentCounterexample: 'event pushed=1 and live 推开1体, despite event-time actualDisplacement=0' });
