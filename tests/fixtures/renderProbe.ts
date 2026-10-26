import { Renderer } from '../../src/render/renderer';
import { activeWorld, BALANCE, type GameState, type Target, type Vec } from '../../src/game/types';

interface Fingerprints {
  fullJsonSha256: string;
  fullJsonBytes: number;
  hpSha256: string;
  damageSha256: string;
  collisionGeometrySha256: string;
}
type Source = 'original' | 'normal' | 'low';
interface Observation { frame: number; source: Source; unchanged: boolean; completeJsonEqual: boolean; fingerprints: Fingerprints }
interface ProbeOptions { frames: number }

const encode = (value: unknown): string => JSON.stringify(value);
const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function targetGeometry(target: Target) {
  return {
    id: target.id, x: target.x, y: target.y, radius: target.radius, facing: target.facing,
    attackAt: target.attackAt, attackReady: target.attackReady, attackAim: target.attackAim,
    attackRadius: target.attackRadius, attackTarget: target.attackTarget,
    splitAt: target.splitAt, splitPositions: target.splitPositions,
  };
}
function health(state: GameState) {
  return {
    playerHp: state.player.hp, tissue: { hp: state.tissue.hp, maxHp: state.tissue.maxHp },
    targets: state.targets.map(target => ({ id: target.id, hp: target.hp, maxHp: target.maxHp })),
    pressure: state.battle?.pressure,
    organs: state.campaign ? Object.fromEntries(Object.entries(state.campaign.arenas).map(([id, arena]) => [id, {
      tissue: { hp: arena.tissue.hp, maxHp: arena.tissue.maxHp },
      targets: arena.targets.map(target => ({ id: target.id, hp: target.hp, maxHp: target.maxHp })),
    }])) : null,
  };
}
function damage(state: GameState) {
  return {
    health: health(state), shots: state.shots, hits: state.hits, scans: state.scans, dashes: state.dashes,
    battleStats: state.battle?.stats, campaignStats: state.campaign?.stats,
    protocolDamageTaken: state.growth?.damageTakenByOrgan, beacon: state.growth?.beacon,
    cooldowns: state.cooldowns, scanReady: state.scanReady, baseBalance: BALANCE,
    damageEvents: state.events.filter(event => /DAMAGE|HURT|HIT|REPAIR|CLEARED|DESTROYED/.test(event.type)),
    pendingCommands: state.campaign?.pendingCommands, coreCombat: state.campaign?.core.combat,
  };
}
function collisionGeometry(state: GameState) {
  return {
    activeWorld: activeWorld(state),
    player: { x: state.player.x, y: state.player.y, radius: state.player.radius, facing: state.player.facing },
    tissue: { x: state.tissue.x, y: state.tissue.y, radius: state.tissue.radius }, terminal: state.terminal,
    targets: state.targets.map(targetGeometry), graph: state.battle?.graph, pulse: state.battle?.pulse,
    tool: state.tool, lastAim: state.battle?.lastAim, effects: state.effects,
    beacon: state.growth?.beacon, marks: state.growth?.marks,
    coreAttack: state.campaign?.core.combat?.attack,
    organs: state.campaign ? Object.fromEntries(Object.entries(state.campaign.arenas).map(([id, arena]) => [id, {
      geometry: arena.geometry, graph: arena.graph, pulse: arena.pulse, flow: arena.flow,
      targets: arena.targets.map(targetGeometry), tissue: { x: arena.tissue.x, y: arena.tissue.y, radius: arena.tissue.radius },
      terminal: arena.terminal,
    }])) : null,
  };
}
async function fingerprints(state: GameState): Promise<Fingerprints> {
  const full = encode(state);
  const [fullJsonSha256, hpSha256, damageSha256, collisionGeometrySha256] = await Promise.all([
    sha256(full), sha256(encode(health(state))), sha256(encode(damage(state))), sha256(encode(collisionGeometry(state))),
  ]);
  return { fullJsonSha256, fullJsonBytes: bytes(full).byteLength, hpSha256, damageSha256, collisionGeometrySha256 };
}
const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

/**
 * Isolated technical fixture. It consumes a read-only snapshot captured elsewhere;
 * it never constructs a GameSession, calls step(), advances a game clock, or loads main.ts.
 * Normal/low effect renders share the source tick, but have independent cloned state and renderers.
 */
async function run(snapshot: GameState, options: ProbeOptions) {
  if (snapshot.game !== 'viral-invasion' || !Number.isSafeInteger(snapshot.tick) || !Number.isFinite(snapshot.elapsed)
    || !snapshot.player || !snapshot.tissue || !Array.isArray(snapshot.targets) || !Array.isArray(snapshot.events)) {
    throw new Error('Expected a serialized Viral Invasion GameState snapshot.');
  }
  if (!Number.isSafeInteger(options.frames) || options.frames < 2 || options.frames > 120) throw new Error('frames must be 2–120.');
  if (!crypto.subtle) throw new Error('SHA-256 requires WebCrypto in this browser file context.');
  await document.fonts.ready;
  const normalCanvas = document.querySelector<HTMLCanvasElement>('#normal')!;
  const lowCanvas = document.querySelector<HTMLCanvasElement>('#low')!;
  const normalRenderer = new Renderer(normalCanvas), lowRenderer = new Renderer(lowCanvas);
  const normalContext = normalCanvas.getContext('2d'), lowContext = lowCanvas.getContext('2d');
  if (!(normalContext instanceof CanvasRenderingContext2D) || !(lowContext instanceof CanvasRenderingContext2D)) {
    throw new Error('Actual browser CanvasRenderingContext2D is required.');
  }
  const states = { original: snapshot, normal: structuredClone(snapshot), low: structuredClone(snapshot) };
  const sourceJson = encode(snapshot);
  const baseline = await fingerprints(snapshot);
  const aim: Vec = { ...(snapshot.battle?.lastAim ?? { x: snapshot.player.x, y: snapshot.player.y }) };
  const observations: Observation[] = [];
  async function observe(frame: number): Promise<void> {
    for (const source of ['original', 'normal', 'low'] as const) {
      const current = await fingerprints(states[source]);
      const completeJsonEqual = encode(states[source]) === sourceJson;
      observations.push({ frame, source, completeJsonEqual, fingerprints: current,
        unchanged: completeJsonEqual && encode(current) === encode(baseline) });
    }
  }
  await observe(0);
  for (let frame = 1; frame <= options.frames; frame++) {
    await nextFrame();
    normalRenderer.render(states.normal, aim, { lowEffects: false });
    lowRenderer.render(states.low, aim, { lowEffects: true });
    await observe(frame);
  }
  // Export the actual backing stores; this captures Canvas2D output without HUD or DOM overlays.
  const png = { normal: normalCanvas.toDataURL('image/png'), low: lowCanvas.toDataURL('image/png') };
  await observe(options.frames + 1);
  return {
    pass: observations.every(observation => observation.unchanged),
    seed: snapshot.seed, tick: snapshot.tick, elapsed: snapshot.elapsed, phase: snapshot.phase,
    organ: snapshot.battle?.organId ?? 'training', aliveActors: snapshot.targets.filter(target => target.hp > 0).length,
    framesPerMode: options.frames, aim, baseline, observations,
    canvas: { context: 'real CanvasRenderingContext2D', normal: { width: normalCanvas.width, height: normalCanvas.height },
      low: { width: lowCanvas.width, height: lowCanvas.height }, dpr: devicePixelRatio },
    rendererDiagnostics: { normal: normalRenderer.diagnostics(states.normal), low: lowRenderer.diagnostics(states.low) },
    png,
  };
}

declare global { interface Window { readonly __renderProbe: { run: typeof run } } }
Object.defineProperty(window, '__renderProbe', { value: Object.freeze({ run }), writable: false });
