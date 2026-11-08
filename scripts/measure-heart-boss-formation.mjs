import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const weapons = (option('--weapons') ?? 'steady,piercing').split(',');
assert(weapons.length && weapons.every(id => ['steady', 'piercing', 'thunder', 'redblade'].includes(id)) && new Set(weapons).size === weapons.length, 'invalid weapon selection');
const stationaryModes = process.argv.includes('--reactive-only') ? [false] : [false, true];
const output = resolve(process.argv.slice(2).find(value => !value.startsWith('--')) ?? 'artifacts/heart-boss-balance-20261107-calibrated');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const historicalBaselinePath = resolve('artifacts/heart-boss-balance-20261107/report.json');
const baseline = await readFile(historicalBaselinePath);
const bundle = await build({ entryPoints: ['scripts/simulate-heart-boss.ts'], bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', metafile: true });
const sources = Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).sort().map(async path => [path, hash(await readFile(path))])));
const path = resolve(output, 'formation-simulation.mjs'); await writeFile(path, bundle.outputFiles[0].contents);
const { measureBoss, bossMeasurementBalance } = await import(pathToFileURL(path).href);
const cases = [];
for (const stationary of stationaryModes) for (const seed of [71, 19, 12345]) for (const weaponId of weapons) {
  const result = measureBoss(weaponId, seed, 0, 180, { phagocytePair: true, stationary }); cases.push(result);
  console.log(JSON.stringify({ weaponId, seed, stationary, outcome: result.outcome, seconds: result.bossSeconds, stages: result.phaseRows.map(row => Number(row.seconds.toFixed(2))), hp: result.playerHp,
    bossHp: result.bossHp, incoming: result.incomingByReason, army: result.army }));
}
const report = { method: 'Same supplied boss-ready initial world and production-only InputFrame policy as the retained24case baseline. Two fed phagocyte departure slots. Actual Q deploys/moves squads and can replace wholly dead squads through the production rules; actual R is used when at least4cells engage a guard wave, without active prior R. No combat state repair/recreation.',
  historicalBaseline: { path: historicalBaselinePath, bars: JSON.parse(baseline).configuration.bars, sha256: hash(baseline), cases: JSON.parse(baseline).cases.length, preserved: true },
  configuration: { bars: `${bossMeasurementBalance.bars}x${bossMeasurementBalance.barHp}`, bossHp: bossMeasurementBalance.hp, weapons, stationaryModes,
    loadouts: 'purple steady/piercing and gold thunder/redblade, upgrade0, modules[]', legions: '2xfed phagocyte', initialEnergy: 0, seeds: [71, 19, 12345], maximumSeconds: 180 },
  controls: { reactive: 'Existing0.22s reaction, actual movement/dash and ready weapon skills; Q when slots missing or both beacons lag >100units and6seconds since prior order; R for nearby live guard wave.',
    stationary: 'Identical targeting and offensive skill/Q/R policy, moveX=moveY=0, dash=false and no blade parry. No HP or damage manipulation. Starts250units from actual boss spawn, inside its sweep.' },
  limitations: ['Supplied boss-ready world, not a natural full mission playthrough.', 'Exact serialized telegraph/cooldown access and mechanical reaction are more consistent than a human.', 'Basic phagocytes retain their production targeting restrictions; no forced core-target attacks.', 'These runs verify difficulty and pacing of the defined automatic policies, not physical device performance or human fun.'],
  sources, cases, sourcesUnchanged: (await Promise.all(Object.entries(sources).map(async ([path, expected]) => hash(await readFile(path)) === expected))).every(Boolean) };
await writeFile(resolve(output, 'formation-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'measure-heart-boss-formation.mjs'), await readFile(new URL(import.meta.url)));
console.log(JSON.stringify({ report: resolve(output, 'formation-report.json'), cases: cases.length, sourcesUnchanged: report.sourcesUnchanged, baselinePreserved: hash(await readFile(historicalBaselinePath)) === hash(baseline) }));
