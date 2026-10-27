import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = 'artifacts/gameplay-v078/navigation-audit.json';
try { await readFile(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const imports = await build({ stdin: { contents: `export { GameSession } from './src/game/session'; export { BattleDirector } from './src/game/battle'; export { EndlessDirector } from './src/game/endless'; export { HEART_WORLD, LUNG_WORLD } from './src/game/organConfig'; export { distance, normalized, wallHit, moveWithCollision } from './src/actors/collision';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { GameSession, BattleDirector, EndlessDirector, HEART_WORLD, LUNG_WORLD, distance, normalized, wallHit, moveWithCollision } = await import(`data:text/javascript;base64,${Buffer.from(imports.outputFiles[0].text).toString('base64')}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/actors/collision.ts', 'src/actors/enemyCrowd.ts', 'src/game/battle.ts', 'src/game/endless.ts', 'src/game/organConfig.ts', 'src/game/session.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, sha(await readFile(path))])));
const base = new GameSession(130026, { mode: 'endless' }).state;
const legal = (point, radius, world) => point.x >= world.bounds.left + radius - 1e-6 && point.x <= world.bounds.right - radius + 1e-6 && point.y >= world.bounds.top + radius - 1e-6 && point.y <= world.bounds.bottom - radius + 1e-6 && world.obstacles.every(o => distance(point, o) >= radius + o.radius - 1e-6);
const clear = (from, to, world) => { const d = distance(from, to), hit = wallHit(from, normalized(to.x - from.x, to.y - from.y), d, world); return hit === null || hit >= d - 20; };
const point = p => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) });
function hostFor(state, emit = () => {}) { return { state, emit, effect() {}, message() {}, finish() {}, slowFactor: () => 1, isMigratingActor: () => false }; }
function target(start, role = 'virus', id = 'virus-2', traits = []) { return { ...start, id, kind: 'single', role, radius: role === 'elite' ? 30 : 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, traits, attackReady: 0, born: 0, generation: 0 }; }
function route({ start, goal, role = 'virus', id = 'virus-2', world = HEART_WORLD, seconds = 70, detailed = false }) {
  const state = structuredClone(base); state.phase = 'playing'; state.world = world; state.endless.wave = 5;
  Object.assign(state.player, goal, { hp: 1e9 }); Object.assign(state.tissue, goal, { hp: 1e9 });
  const actor = target(start, role, id); state.targets = [actor];
  let attacks = 0, travelled = 0, last = point(actor), invalidTicks = 0; const path = [last];
  const controller = new BattleDirector(hostFor(state, type => { if (type === 'ATTACK_TELEGRAPHED') attacks++; }));
  for (let tick = 1; tick <= seconds * 60; tick++) {
    state.tick = tick; state.elapsed = tick / 60;
    controller.enemies(); travelled += distance(actor, last); last = { x: actor.x, y: actor.y };
    if (!legal(actor, actor.radius, world)) invalidTicks++;
    if (tick % 60 === 0) path.push(point(actor));
    if (attacks) break;
  }
  const lastWindow = path.slice(-11), drift = lastWindow.length > 1 ? Math.max(...lastWindow.map(p => distance(p, lastWindow[0]))) : 0;
  const result = { start: point(start), goal: point(goal), role, id, seconds: state.elapsed, attacked: attacks > 0, travelled: +travelled.toFixed(3), end: point(actor), distanceToGoal: +distance(actor, goal).toFixed(3), last10SecondDrift: +drift.toFixed(4), blockedSight: !clear(actor, goal, world), invalidTicks };
  if (detailed) result.pathEverySecond = path;
  return result;
}

const minimalElite = route({ start: { x: 400, y: 650 }, goal: { x: 850, y: 650 }, role: 'elite', seconds: 60, detailed: true });
const goals = [];
for (const x of [130, 500, 1050, 1550, 2050, 2270]) for (const y of [190, 480, 800, 1110, 1370]) if (legal({ x, y }, 19, HEART_WORLD)) goals.push({ x, y });
const singles = [];
for (let index = 0; index < goals.length; index++) {
  const goal = goals[index];
  for (const offset of [1, 7, 13, 19]) {
    const start = goals[(index + offset) % goals.length];
    if (!legal(start, 30, HEART_WORLD) || distance(start, goal) < 340) continue;
    for (const role of ['virus', 'elite']) singles.push(route({ start, goal, role, seconds: 70 }));
  }
}
const obstacleRoutes = [];
for (const o of HEART_WORLD.obstacles) for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const id of ['virus-2', 'virus-20']) {
  const start = { x: o.x - Math.cos(angle) * 300, y: o.y - Math.sin(angle) * 300 }, goal = { x: o.x + Math.cos(angle) * 130, y: o.y + Math.sin(angle) * 130 };
  if (legal(start, 22, HEART_WORLD) && legal(goal, 19, HEART_WORLD)) obstacleRoutes.push(route({ start, goal, id, seconds: 60 }));
}

function crowdFixture() {
  const state = structuredClone(base); state.phase = 'playing'; state.endless.wave = 1;
  Object.assign(state.player, { x: 1050, y: 650, hp: 1e9 }); Object.assign(state.tissue, { x: 1050, y: 650, hp: 1e9 });
  state.targets = Array.from({ length: 24 }, (_, i) => target({ x: 300 + (i % 4) * 52, y: 480 + Math.floor(i / 4) * 52 }, 'virus', `virus-${i + 1}`));
  const attacked = new Set(); const samples = [], controller = new BattleDirector(hostFor(state, (type, data) => { if (type === 'ATTACK_TELEGRAPHED') attacked.add(data.actorId); }));
  let invalidTicks = 0, minSpacing = Infinity;
  for (let tick = 1; tick <= 60 * 60; tick++) {
    state.tick = tick; state.elapsed = tick / 60; controller.enemies();
    for (const actor of state.targets) if (!legal(actor, actor.radius, HEART_WORLD)) invalidTicks++;
    if (tick % 60 === 0) {
      for (let a = 0; a < state.targets.length; a++) for (let b = a + 1; b < state.targets.length; b++) minSpacing = Math.min(minSpacing, distance(state.targets[a], state.targets[b]));
      samples.push({ second: tick / 60, within300: state.targets.filter(t => distance(t, state.player) < 300).length, furthest: +Math.max(...state.targets.map(t => distance(t, state.player))).toFixed(3), attacked: attacked.size });
    }
  }
  return { actors: 24, seconds: 60, invalidTicks, minSpacing: +minSpacing.toFixed(5), attacked: attacked.size, samples, end: state.targets.map(t => ({ id: t.id, ...point(t), distanceToGoal: +distance(t, state.player).toFixed(3) })) };
}

const spawn = { samples: 0, valid: 0, failures: 0, blockedSight: 0, examples: [], failureExamples: [] };
const spawnGoals = [{ x: 1200, y: 800 }, { x: 110, y: 170 }, { x: 2290, y: 170 }, { x: 110, y: 1390 }, { x: 2290, y: 1390 }, { x: 850, y: 650 }, { x: 1630, y: 1050 }, { x: 2120, y: 850 }];
for (const seed of [0, 1, 919, 130026, 0xffffffff]) for (const wave of [1, 5, 15]) for (const goal of spawnGoals) {
  const state = structuredClone(base); state.phase = 'playing'; state.seed = seed; state.endless.wave = wave; Object.assign(state.player, goal); state.targets = [];
  const controller = new EndlessDirector(hostFor(state));
  for (let serial = 0; serial < 8; serial++) {
    const radius = wave % 5 === 0 && serial === 0 ? 30 : 22, position = controller.spawnPosition(serial, radius); spawn.samples++;
    if (!position) { spawn.failures++; if (spawn.failureExamples.length < 10) spawn.failureExamples.push({ seed, wave, goal, serial }); continue; }
    const sight = clear(position, goal, HEART_WORLD), isLegal = legal(position, radius, HEART_WORLD);
    if (isLegal) spawn.valid++; if (!sight) spawn.blockedSight++;
    state.targets.push(target(position, radius === 30 ? 'elite' : 'virus', `audit-${serial}`));
    if (radius === 30 && !sight && spawn.examples.length < 12) spawn.examples.push({ seed, wave, player: goal, serial, position: point(position), route: route({ start: position, goal, role: 'elite', seconds: 60 }) });
  }
}

const lungBoundary = { start: { x: 650, y: 1400 }, radius: 22, projected: point(moveWithCollision({ x: 650, y: 1400 }, { x: 0, y: 0 }, 22, LUNG_WORLD)) };
lungBoundary.legal = legal(lungBoundary.projected, lungBoundary.radius, LUNG_WORLD);
lungBoundary.penetration = +(90 - distance(lungBoundary.projected, { x: 650, y: 1330 })).toFixed(4);
const summary = rows => ({ count: rows.length, reachedAttack: rows.filter(r => r.attacked).length, noAttack: rows.filter(r => !r.attacked).length, stuckNoAttack: rows.filter(r => !r.attacked && r.last10SecondDrift < 2).length, illegalRows: rows.filter(r => r.invalidTicks).length });
const report = { audit: 'v077 navigation / bounded isolated production-method simulation', generatedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes,
  method: { productionMethods: ['BattleDirector.enemies', 'EndlessDirector.spawnPosition', 'moveWithCollision'], fixturesWriteOnlyIndependentState: true, productionSourcesChanged: false, browserUsed: false, routeMaximumSeconds: 70, note: 'Stationary goals, no shooting/immune cells/deaths; private methods called in a bundled isolated fixture. This tests reachability and spawn legality, not fun or ordinary run balance.' },
  minimalElite, sweep: { summary: summary(singles), ordinary: summary(singles.filter(r => r.role === 'virus')), elite: summary(singles.filter(r => r.role === 'elite')), failures: singles.filter(r => !r.attacked), all: singles },
  obstacleRoutes: { summary: summary(obstacleRoutes), failures: obstacleRoutes.filter(r => !r.attacked), all: obstacleRoutes }, crowd: crowdFixture(), spawn, lungBoundary,
  spatialUse: { world: { width: HEART_WORLD.width, height: HEART_WORLD.height, bounds: HEART_WORLD.bounds, obstacleCount: HEART_WORLD.obstacles.length }, spawnRing: [420, 600], minimumSpawnDistance: 340, staticFacilities: { tissue: point(base.tissue), valve: base.battle.graph.nodes.filter(n => n.kind === 'valve').map(point) }, note: 'Endless spawns follow the player, but all tissue repair / pulse facilities remain in the center and there are no peripheral objectives. Available area does not itself create a reason to visit the perimeter.' } };
await mkdir('artifacts/gameplay-v078', { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, minimalElite, sweep: report.sweep.summary, ordinary: report.sweep.ordinary, elite: report.sweep.elite, obstacleRoutes: report.obstacleRoutes.summary, crowdEnd: report.crowd.samples.at(-1), spawn: { samples: spawn.samples, valid: spawn.valid, failures: spawn.failures, blockedSight: spawn.blockedSight }, lungBoundary }, null, 2));
