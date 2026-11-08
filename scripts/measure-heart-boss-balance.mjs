import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve(process.argv[2] ?? 'artifacts/heart-boss-balance-20261107-calibrated');
await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: ['scripts/simulate-heart-boss.ts'], bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', metafile: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).sort().map(async path => [path, hash(await readFile(path))])));
const path = resolve(output, 'simulation.mjs'); await writeFile(path, bundle.outputFiles[0].contents);
const { measureBoss, bossMeasurementBalance } = await import(pathToFileURL(path).href);
const cases = [];
for (const initialEnergy of [0, 100]) for (const seed of [71, 19, 12345]) for (const weaponId of ['steady', 'piercing', 'thunder', 'redblade']) {
  const result = measureBoss(weaponId, seed, initialEnergy, 180); cases.push(result);
  console.log(JSON.stringify({ weaponId, seed, initialEnergy, outcome: result.outcome, seconds: result.bossSeconds, stages: result.phaseRows.map(row => Number(row.seconds.toFixed(2))), hp: result.playerHp, bossHp: result.bossHp, incoming: result.incomingByReason }));
}
const summary = [0, 100].flatMap(initialEnergy => ['steady', 'piercing', 'thunder', 'redblade'].map(weaponId => {
  const rows = cases.filter(row => row.weaponId === weaponId && row.initialEnergy === initialEnergy);
  return { weaponId, initialEnergy, victories: rows.filter(row => row.outcome === 'boss-defeated').length, cases: rows.length,
    seconds: [Math.min(...rows.map(row => row.bossSeconds)), Math.max(...rows.map(row => row.bossSeconds))],
    playerHp: [Math.min(...rows.map(row => row.playerHp)), Math.max(...rows.map(row => row.playerHp))],
    phases: [1, 2, 3].map(stage => rows.map(row => row.phaseRows.find(phase => phase.stage === stage)?.seconds)) };
}));
const report = { method: 'Supplied boss-ready initial world, then only actual GameSession.step InputFrame movement/aim/fire/dash/skill/trace commands. No post-start HP/position/target/timer/energy writes, no suppressed attacks, no projectile direct-hit helper.',
  configuration: { version: 'three-bars-v1', bars: `${bossMeasurementBalance.bars}x${bossMeasurementBalance.barHp}`, bossHp: bossMeasurementBalance.hp, baseRarity: 'purple', legendaryRarity: 'gold', upgrade: 0, modules: [], legions: [], initialEnergy: [0, 100], seeds: [71, 19, 12345], maximumSeconds: 180 },
  policy: 'Continuous orbit at 330 range for ranged weapons / 98 for blade; 0.22s telegraph reaction, dodge into cone side or pulse gap; dash if walking cannot reach safety; prioritize nearby guards; use actual ready skills, time blade parry, draw one actual mark every0.2s. Reads the same serialized telegraphs available to rendering.',
  limitations: ['Deterministic simulation, not rendering/device/human play.', 'Boss-ready state is supplied; this does not demonstrate reaching the boss naturally.', 'Exact telegraph and cooldown access makes the automatic strategy more consistent than a human; guard targeting and steering are simple and may underuse a weapon.', 'Zero upgrades/modules/legions isolates the four weapons; this is not the full mature-build baseline. Initial100energy represents a charge legitimately accumulated before arrival, supplied once before combat.'],
  sources, summary, cases, sourcesUnchanged: (await Promise.all(Object.entries(sources).map(async ([path, expected]) => hash(await readFile(path)) === expected))).every(Boolean) };
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'measure-heart-boss-balance.mjs'), await readFile(new URL(import.meta.url)));
console.log(JSON.stringify({ report: resolve(output, 'report.json'), cases: cases.length, sourcesUnchanged: report.sourcesUnchanged }));
