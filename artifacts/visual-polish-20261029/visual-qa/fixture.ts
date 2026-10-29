import { Renderer } from '../../../src/render/phaserRenderer';
import { GameSession } from '../../../src/game/session';
import { createOrganArena } from '../../../src/game/organConfig';
import type { GameState, Target } from '../../../src/game/types';
import type { OrganId } from '../../../src/game/battleTypes';
import type { EnemyTactic } from '../../../src/game/enemyTacticsTypes';

// Production Renderer fixture: simultaneous warnings assembled for visual QA.
// No claim is made that this is a playable route or a reachable encounter.
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#game')!);
let state: GameState, low = false, fingerprint = '';
function fixture(organ: OrganId): GameState {
  const s = new GameSession(130026, { campaign: true, milestone: 'G3' }).snapshot();
  const arena = createOrganArena(organ, s.seed);
  s.phase = 'playing'; s.tick = 1440; s.elapsed = 24; s.visualTime = 24;
  s.world = arena.geometry; s.player = { ...s.player, x: 1320, y: 980, facing: -.3, moving: false };
  s.tissue = arena.tissue; s.terminal = arena.terminal;
  Object.assign(s.battle!, { organId: organ, graph: arena.graph, pulse: arena.pulse, encounter: undefined });
  s.campaign!.arenas[organ] = arena; s.campaign!.activeOrganId = organ; s.campaign!.encounters = undefined;
  s.effects = []; s.message = ''; s.scanUntil = 0;
  s.targets = Array.from({ length: 24 }, (_, i): Target => ({
    id: `qa-virus-${i}`, kind: 'single', role: 'virus', x: 950 + i % 8 * 105, y: 780 + Math.floor(i / 8) * 195,
    radius: 23, hp: 60, maxHp: 68, hitUntil: 0, scanned: true,
    traits: i % 4 === 0 ? ['CARAPACE'] : i % 4 === 1 ? ['FISSION'] : i % 4 === 2 ? ['MIMIC'] : [],
    revealedUntil: 30, facing: Math.PI * .7, born: 0,
  }));
  const warnings: { kind: EnemyTactic; origin: {x: number; y: number}; aim: {x: number; y: number}; radius: number }[] = [
    { kind: 'thin-ray', origin: {x: 980, y: 860}, aim: {x: 1590, y: 1000}, radius: 14 },
    { kind: 'crystal-charge', origin: {x: 1580, y: 800}, aim: {x: 1280, y: 1160}, radius: 26 },
    { kind: 'fission-burst', origin: {x: 1100, y: 1180}, aim: {x: 1180, y: 1030}, radius: 57 },
    { kind: 'mimic-corrosion', origin: {x: 1630, y: 1180}, aim: {x: 1460, y: 1110}, radius: 78 },
  ];
  s.targets.push(...warnings.map(({kind, origin, aim, radius}): Target => ({
    id: `qa-danger-${kind}`, kind: 'single', role: 'elite', ...origin, radius: 30, hp: 120, maxHp: 120, hitUntil: 0, scanned: true,
    traits: kind === 'crystal-charge' ? ['CARAPACE'] : kind === 'fission-burst' ? ['FISSION'] : kind === 'mimic-corrosion' ? ['MIMIC'] : [],
    revealedUntil: 30, facing: Math.atan2(aim.y - origin.y, aim.x - origin.x), attackAt: 24.55, attackAim: aim,
    attackPlan: { kind, origin, aim, radius, range: Math.hypot(aim.x-origin.x,aim.y-origin.y), windup: 1.1,
      interval: 3, landings: kind === 'fission-burst' ? [aim,{x: 1360,y: 850}] : [],
      ...(kind === 'crystal-charge' ? {chargeEnd: aim, chargeSpeed: 400} : {}), playerDamage: 10, tissueDamage: 5, recoveryExposure: 1 },
  })));
  return s;
}
async function boot() {
  await renderer.ready;
  const api = {
    draw(organ: OrganId, lowEffects: boolean) {
      state = fixture(organ); low = lowEffects; fingerprint = JSON.stringify(state);
      renderer.resize(); renderer.prepareCamera(state, {snap: true});
      renderer.render(state, {x:1450,y:900}, {lowEffects:low,cameraPrepared:true});
    },
    diagnostics() { return { scope:'Frozen production Renderer fixture; assembled visual stress scene, not a gameplay-route test.',
      immutable:JSON.stringify(state)===fingerprint, organ:state.battle!.organId, low,
      diagnostics:renderer.diagnostics(state), warnings:state.targets.filter(t=>t.attackPlan).map(t=>({id:t.id,plan:t.attackPlan})),
      player:renderer.camera.worldToScreen(state.player)}; },
  };
  (window as unknown as {__visualFixture:typeof api}).__visualFixture=api;
  api.draw('lung',false);
  renderer.startFrameLoop(()=>renderer.render(state,{x:1450,y:900},{lowEffects:low,cameraPrepared:true}));
}
void boot();
