import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = 'artifacts/gameplay-v078/navigation-audit-details.json';
try { await readFile(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const bundled = await build({ stdin: { contents: `export { GameSession } from './src/game/session'; export { BattleDirector } from './src/game/battle'; export { LUNG_WORLD } from './src/game/organConfig'; export { distance, moveWithCollision } from './src/actors/collision';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { GameSession, BattleDirector, LUNG_WORLD, distance, moveWithCollision } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const legal = (p, r) => p.x >= 85 + r - 1e-7 && p.x <= 2315 - r + 1e-7 && p.y >= 145 + r - 1e-7 && p.y <= 1415 - r + 1e-7 && LUNG_WORLD.obstacles.every(o => distance(p, o) >= r + o.radius - 1e-7);
const point = p => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) });
const walk = { start: { x: 550, y: 1393 }, radius: 22, delta: { x: 64 / 60, y: 0 }, ticks: 0, startLegal: true, firstIllegal: null, maximumPenetration: 0, pathEveryHalfSecond: [] };
let position = { ...walk.start }; walk.startLegal = legal(position, walk.radius);
for (let tick = 1; tick <= 600; tick++) {
  position = moveWithCollision(position, walk.delta, walk.radius, LUNG_WORLD);
  const penetration = 90 - distance(position, { x: 650, y: 1330 });
  if (!legal(position, walk.radius) && !walk.firstIllegal) walk.firstIllegal = { tick, seconds: tick / 60, position: point(position), penetration };
  walk.maximumPenetration = Math.max(walk.maximumPenetration, penetration);
  if (tick % 30 === 0) walk.pathEveryHalfSecond.push({ seconds: tick / 60, position: point(position), legal: legal(position, walk.radius) });
  walk.ticks = tick;
}
walk.end = point(position); walk.maximumPenetration = +walk.maximumPenetration.toFixed(5);
const state = new GameSession(130026, { mode: 'endless' }).state; state.world = LUNG_WORLD; state.phase = 'playing'; state.endless.wave = 1;
Object.assign(state.player, { x: 750, y: 1393, hp: 1e9 }); Object.assign(state.tissue, { x: 750, y: 1393, hp: 1e9 });
const actor = { x: 550, y: 1393, id: 'virus-2', role: 'virus', kind: 'single', radius: 22, hp: 1000, maxHp: 1000, traits: [], hitUntil: 0, scanned: false, attackReady: 0 }; state.targets = [actor];
const route = { start: point(actor), goal: point(state.player), startLegal: legal(actor, actor.radius), goalLegal: legal(state.player, state.player.radius), firstIllegal: null, illegalTicks: 0, attackCount: 0, pathEverySecond: [] };
const controller = new BattleDirector({ state, emit(type) { if (type === 'ATTACK_TELEGRAPHED') route.attackCount++; }, message() {}, effect() {}, finish() {}, slowFactor: () => 1, isMigratingActor: () => false });
for (let tick = 1; tick <= 1800; tick++) {
  state.tick = tick; state.elapsed = tick / 60; controller.enemies();
  if (!legal(actor, actor.radius)) { route.illegalTicks++; route.firstIllegal ??= { tick, seconds: tick / 60, position: point(actor) }; }
  if (tick % 60 === 0) route.pathEverySecond.push({ seconds: tick / 60, position: point(actor), legal: legal(actor, actor.radius) });
}
route.end = point(actor);
const primaryBytes = await readFile('artifacts/gameplay-v078/navigation-audit.json'), primary = JSON.parse(primaryBytes);
const naturalSpawnStalls = primary.spawn.examples.filter(example => !example.route.attacked && example.route.last10SecondDrift === 0);
const report = { audit: 'v077 navigation supplement / legal-start lower lung boundary', generatedAt: new Date().toISOString(), primaryAudit: { path: 'artifacts/gameplay-v078/navigation-audit.json', sha256: createHash('sha256').update(primaryBytes).digest('hex') }, sourceHashes: primary.sourceHashes,
  scope: 'Lung boundary is existing campaign geometry; endless currently uses heart. Both simulations initialize independent fixture state only.', walk, actualEnemyMethodRoute: route, naturalSpawnStalls,
  recommendations: [
    { priority: 'P1', issue: 'Elite stops inside attack range even if its line of sight is obstructed.', fix: 'Treat a blocked shot as requiring locomotion. Enter windup only when both range and sight are satisfied. Do not continue idle at the line-of-sight rejection.' },
    { priority: 'P2', issue: 'Local goal tangent has no global route or progress invariant.', fix: 'Keep existing crowd separation as local steering. Add a static-world route planner using inflated obstacles per radius class. A visibility graph with 16 exterior samples per obstacle (+4 world units clearance), bounds-safe edges, deterministic A*/Dijkstra and a capped waypoint list is sufficient for 4–5 circular obstacles. Replan only after goal displacement or a bounded stall timeout, with a per-tick planning cap; no render-driven state or gameplay RNG.' },
    { priority: 'P2', issue: 'Circle projection followed by boundary clamping can return a center that overlaps a circle.', fix: 'Validate the final point after all constraints. Use bounded resolution and fall back to the last legal substep when projection cannot satisfy both circle and world bounds; never return a known illegal center. Add legal-start regression along the south side of lung alveolus-d.' },
    { priority: 'Design', issue: 'Endless has a larger traversable world but peripheral space lacks competing objectives.', fix: 'Spawn rings follow the player, while repair and pulse anchors remain central. After navigation correctness, rotate a bounded temporary supply/counter objective into reachable outer regions so movement pays off, without forcing an exhausting perimeter sweep.' },
  ],
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, walk: { startLegal: walk.startLegal, firstIllegal: walk.firstIllegal, end: walk.end, maximumPenetration: walk.maximumPenetration }, actualEnemyMethodRoute: { startLegal: route.startLegal, goalLegal: route.goalLegal, firstIllegal: route.firstIllegal, illegalTicks: route.illegalTicks, end: route.end, attackCount: route.attackCount }, naturalSpawnStalls: naturalSpawnStalls.length }, null, 2));
