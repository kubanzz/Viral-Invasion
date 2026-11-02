import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const cases = [
  ['current', false, false, false],
  ['old-numbers', true, false, false],
  ['old-numbers-no-immune-aggro', true, true, false],
  ['current-no-raids', false, false, true],
];
const report = [];
for (const [name, oldNumbers, noImmuneAggro, noRaids] of cases) {
  const outfile = `artifacts/legions-20261030-threat-${name}.mjs`;
  await build({ entryPoints: ['artifacts/legions-20261030-threat-probe.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'comparison', setup(builder) {
      builder.onLoad({ filter: /battle(?:Config)?\.ts$/ }, async ({ path }) => {
        let contents = await readFile(path, 'utf8');
        if (oldNumbers && path.endsWith('battleConfig.ts')) contents = contents.replace('enemySpeed: 70', 'enemySpeed: 64').replace('playerDamage: 8, tissueDamage: 4.5', 'playerDamage: 7, tissueDamage: 4');
        if (noImmuneAggro && path.endsWith('battle.ts')) contents = contents.replace('const immune = this.immuneGoal(target, originalGoal);', 'const immune = undefined;');
        if (noRaids && path.endsWith('battle.ts')) contents = contents.replace('const aidPoint = !immune && raider', 'const aidPoint = false && raider');
        return { contents, loader: 'ts' };
      });
    } }] });
  const output = execFileSync(process.execPath, [outfile], { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  report.push({ name, outcomes: output });
  console.log(JSON.stringify({ name, outcomes: output }));
}
await writeFile('artifacts/legions-20261030-threat-comparison.json', JSON.stringify(report, null, 2));
