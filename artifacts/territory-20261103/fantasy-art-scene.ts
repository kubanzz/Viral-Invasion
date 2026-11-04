import { GameSession } from '../../src/game/session';
import { createOrganArena, sourceTarget } from '../../src/game/organConfig';
import { activeWorld, type GameState } from '../../src/game/types';
import { syncTerritoryHealingNodes } from '../../src/game/territory';
import { Renderer } from '../../src/render/renderer';
import { fantasyObstacleKind } from '../../src/render/fantasyTerritory';

const params = new URL(location.href).searchParams, scene = params.get('scene') ?? 'heart';
const variant = params.get('variant') ?? 'initial', focus = params.get('focus') ?? 'overview';
const game = new GameSession(71, scene === 'training' ? {} : { campaign: true, milestone: 'G3',
  ...(scene === 'heart' ? { mode: 'endless', territory: true } : {}) });
game.start();
const original = game.snapshot(), state: GameState = structuredClone(original);
state.phase = scene === 'menu' ? 'menu' : 'paused'; state.elapsed = 3; state.tick = 180; state.visualTime = 3;
state.effects = []; state.events = [];
if (scene === 'lung') {
  const arena = createOrganArena('lung', 71);
  state.world = arena.geometry; state.targets = arena.targets; state.tissue = arena.tissue; state.terminal = arena.terminal;
  state.battle!.organId = 'lung'; state.battle!.graph = arena.graph; state.battle!.pulse = arena.pulse;
  state.campaign!.arenas.lung = arena; state.campaign!.activeOrganId = 'lung';
  state.player.x = arena.tissue.x - 100; state.player.y = arena.tissue.y - 100;
  if (arena.flow) arena.flow.airwayOpen = variant === 'open';
  for (const node of arena.graph.nodes) {
    if (variant === 'healthy' || variant === 'cleared') { node.infected = false; if (node.kind === 'source') node.active = false; if (node.kind === 'healing') node.infection = 0; }
    if (variant === 'infected') { node.infected = true; if (node.kind === 'healing') node.infection = 100; }
  }
  if (variant === 'healthy' || variant === 'cleared') for (const target of state.targets) if (target.role === 'source') target.hp = 0;
}
if (state.territory) {
  for (const node of state.territory.nodes) {
    if (variant === 'healthy') { node.owner = 'healthy'; node.infectionProgress = 0; }
    if (variant === 'infected' && node.kind !== 'core') { node.owner = 'infected'; node.infectionProgress = 100; }
  }
  if (variant === 'recovering') {
    const node = state.territory.nodes.find(item => item.id === 'heart-healing-2')!;
    node.owner = 'infected'; node.purificationProgress = 50;
    state.territory.purification = { nodeId: node.id, startedAt: state.elapsed - 1.5 };
  }
  syncTerritoryHealingNodes(state);
  if (variant !== 'healthy') for (const node of state.territory.nodes.filter(item => item.kind === 'source')) {
    const actor = sourceTarget(`art-fixture:${node.id}`, node, 238);
    state.targets.push(actor);
  }
}
if (state.battle?.organId === 'heart') state.battle.pulse.phase = variant === 'open' ? 'surge' : 'rest';
const world = activeWorld(state);
const point = focus === 'tree' || focus === 'rock' ? world.obstacles.find(obstacle => fantasyObstacleKind(obstacle.id) === focus)
  : focus === 'core' ? state.tissue
    : focus === 'source' ? state.targets.find(target => target.role === 'source')
      : focus === 'healing' ? state.battle?.graph.nodes.find(node => node.kind === 'healing' && (scene !== 'heart' || node.id === 'heart-healing-2'))
        : focus === 'valve' || focus === 'airway' ? state.battle?.graph.nodes.find(node => node.kind === 'valve' || node.id === 'airway') : undefined;
if (point) { state.player.x = Math.max(world.bounds.left + state.player.radius, Math.min(world.bounds.right - state.player.radius, point.x - 110));
  state.player.y = Math.max(world.bounds.top + state.player.radius, Math.min(world.bounds.bottom - state.player.radius, point.y + 100)); }
const before = JSON.stringify(state);
const freeze = (value: unknown) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); Object.values(value).forEach(freeze); };
freeze(state);
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#game')!); await renderer.ready;
renderer.prepareCamera(state, { snap: true });
if (focus === 'overview') {
  renderer.camera.scale = Math.min((innerWidth - 100) / (world.width + 200), (innerHeight - 100) / ((world.height + 200) * .72));
  renderer.camera.panX = renderer.camera.panY = 0;
  renderer.camera.offsetX = (innerWidth - world.width * renderer.camera.scale) / 2 - 120 * renderer.camera.scale;
  renderer.camera.offsetY = (innerHeight - world.height * .72 * renderer.camera.scale) / 2 - 150 * renderer.camera.scale;
}
renderer.render(state, state.player, { cameraPrepared: true, lowEffects: params.get('low') === '1' });
await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
const scope = 'CONTROLLED ART FIXTURE: modified, frozen clone of a real GameSession and organ factory. Real production Renderer/art/collision geometry; no simulation replay, natural reachability, gameplay input or performance claim.';
document.querySelector('#scope')!.textContent = `${scene} / ${variant} / ${focus} · 视觉状态检查，非自然通关记录`;
Object.defineProperty(window, '__fantasyArtProbe', { value: Object.freeze({ ready: true,
  inspect: () => ({ scope, scene, variant, focus, stateUnchanged: JSON.stringify(state) === before,
    sourceState: original, displayedState: state, diagnostics: renderer.diagnostics(state) }) }) });
