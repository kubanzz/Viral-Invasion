import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const output = 'artifacts/gameplay-v078/navigation-performance.json';
try { await readFile(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const baselineSource = execFileSync('git', ['show', 'HEAD:src/actors/collision.ts'], { encoding: 'utf8' });
const current = await build({ stdin: { contents: `export { EnemyNavigator } from './src/actors/enemyNavigation'; export { moveWithCollision } from './src/actors/collision'; export { HEART_WORLD } from './src/game/organConfig';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const old = await build({ stdin: { contents: baselineSource, resolveDir: `${process.cwd()}/src/actors`, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const load = built => import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { EnemyNavigator, moveWithCollision, HEART_WORLD } = await load(current), baseline = await load(old);
const actor = i => ({ x: 400, y: 650, id: `perf-${i}`, radius: i % 2 ? 22 : 30, hp: 100, maxHp: 100, role: 'virus', kind: 'single', traits: [], scanned: false, hitUntil: 0 });
const navigator = new EnemyNavigator(), actors = Array.from({ length: 24 }, (_, i) => actor(i)), plans = new Map();
const perFrame = [], replanFrames = []; let replans = 0, totalChecksum = 0;
for (let tick = 0; tick < 2400; tick++) {
  const goal = { x: 850, y: 650 + ((tick % 8) - 4) * 4 }, started = performance.now(); let framePlans = 0;
  for (const target of actors) {
    const point = navigator.waypoint(target, goal, HEART_WORLD, tick / 60); totalChecksum += point.x + point.y;
    const at = navigator.routes.get(target.id)?.plannedAt;
    if (at !== undefined && plans.get(target.id) !== at) { plans.set(target.id, at); replans++; framePlans++; }
  }
  const duration = performance.now() - started; perFrame.push(duration); if (framePlans) replanFrames.push(duration);
}
const stats = samples => { const ordered = samples.slice().sort((a, b) => a - b); return { samples: samples.length, totalMs: samples.reduce((a, b) => a + b, 0), medianMs: ordered[Math.floor(ordered.length * .5)], p95Ms: ordered[Math.floor(ordered.length * .95)], p99Ms: ordered[Math.floor(ordered.length * .99)], maxMs: ordered.at(-1) }; };
function collisionRun(move) {
  let checksum = 0; const started = performance.now();
  for (let i = 0; i < 100000; i++) {
    const point = move({ x: 400 + i % 100 * 5, y: 800 + i % 4 * 2 }, { x: 1, y: .4 }, 22, HEART_WORLD); checksum += point.x + point.y;
  }
  return { ms: performance.now() - started, checksum };
}
collisionRun(baseline.moveWithCollision); collisionRun(moveWithCollision);
const pairedCollision = [];
for (let round = 0; round < 5; round++) {
  const order = round % 2 ? ['current', 'baseline'] : ['baseline', 'current'], result = {};
  for (const kind of order) result[kind] = collisionRun(kind === 'current' ? moveWithCollision : baseline.moveWithCollision);
  pairedCollision.push({ round, ...result, identicalChecksum: Math.abs(result.current.checksum - result.baseline.checksum) < 1e-6 });
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/actors/collision.ts', 'src/actors/enemyNavigation.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))])));
const report = { benchmark: 'Bounded isolated CPU microbenchmark; not browser frame/performance acceptance', generatedAt: new Date().toISOString(), baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), baselineCollisionSha256: hash(baselineSource), sourceHashes,
  navigation: { actors: 24, simulationFrames: 2400, calls: 24 * 2400, goalPerFrameStep: 4, goalMaximumOscillation: 28, replans, replanFraction: replans / (24 * 2400), retainedRoutes: navigator.routes.size, allFrames: stats(perFrame), replanFrames: stats(replanFrames), checksum: totalChecksum,
    note: 'Every actor is held at an obstructed starting position, exercising cache/route cost without crowd or combat cost. Half radius22/half30; real moving bodies usually exit the obstruction fast path.' },
  collision: { callsPerSample: 100000, pairedCollision, baselineMedianMs: stats(pairedCollision.map(row => row.baseline.ms)).medianMs, currentMedianMs: stats(pairedCollision.map(row => row.current.ms)).medianMs, note: 'Same unobstructed legal trajectories and identical checksums; alternating same-process comparison after warmup. New legality checks add finite CPU cost. Concurrent host load can affect timings.' },
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, navigation: report.navigation, collision: { baselineMedianMs: report.collision.baselineMedianMs, currentMedianMs: report.collision.currentMedianMs, identicalChecksums: pairedCollision.every(row => row.identicalChecksum) } }, null, 2));
