import { GameSession } from '../src/game/session';
import { g3Input } from '../tests/helpers/g3Driver';
for (const choice of ['pursue','block','ignore'] as const) {
  const game = new GameSession(91, { campaign: true, milestone: 'G3' }); game.start();
  let hurts = 0;
  game.bus.on('event', event => { if (event.type === 'PLAYER_HURT') hurts++; });
  for (let i = 0; i < 24000 && game.state.phase !== 'result'; i++) {
    const draft = game.state.growth?.draft;
    if (draft) { game.discardDraft(draft.id); continue; }
    game.step(g3Input(game.state, choice));
  }
  const s = game.state;
  console.log(JSON.stringify({ choice, elapsed: s.elapsed, result: s.result, player: s.player.hp, hurts,
    core: s.campaign!.core.status, sourceClears: s.campaign!.progress.sourceClears }));
}
