import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const output = resolve(process.env.VI_GARRISON_OUTPUT ?? 'artifacts/garrison-20261103/pressure');
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { measureGarrisonCombat } from './tests/fixtures/garrisonCombat';`, loader: 'ts' },
  bundle: true, write: false, platform: 'node', target: 'node24', format: 'esm', metafile: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const sources = Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).filter(path => path !== '<stdin>')
  .map(async path => [path, hash(await readFile(path))])));
const modulePath = resolve(output, 'simulation.mjs');
await writeFile(modulePath, bundle.outputFiles[0].contents);
const { measureGarrisonCombat } = await import(pathToFileURL(modulePath).href);
const seeds = process.env.VI_GARRISON_SEEDS ? process.env.VI_GARRISON_SEEDS.split(',').map(Number) : [71, 19, 12345, 42, 2026, 9, 301, 88, 8765, 54321];
const cases = [];
for (const seed of seeds) for (const [rank, rounds] of [[1, 1], [1, 3], [3, 1], [3, 16]]) {
  const measured = measureGarrisonCombat(seed, rank, rounds);
  cases.push(measured);
  console.log(JSON.stringify({ ...measured, events: undefined, finalActors: undefined, finalCells: undefined }));
}
const mature = cases.filter(item => item.rank === 3 && item.rounds === 1);
const report = {
  scope: 'Isolated production GameSession combat with supplied initial rank, healthy north front and an obstacle-free heart arena. Real Q deploys at the player feet, then real movement retreats to (1050,850). Player never fires, purifies, repairs, replaces cells or injects combat HP/damage/deaths. Finite squads use production warning, birth, navigation, attacks and capture. Does not measure browser input, natural progression, phone performance or human difficulty.',
  sources,
  sourcesUnchanged: (await Promise.all(Object.entries(sources).map(async ([path, before]) => before === hash(await readFile(path))))).every(Boolean),
  matureSingle: { held: mature.filter(item => item.held).length, total: mature.length, tookDamageCount: mature.filter(item => item.garrisonDamage > 0).length,
    allRealBites: mature.every(item => item.realBites > 0), handoffs: mature.filter(item => item.handoff).length },
  cases,
};
await writeFile(resolve(output, 'garrison-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ matureSingle: report.matureSingle, sourcesUnchanged: report.sourcesUnchanged }));
