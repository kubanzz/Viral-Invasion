import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'artifacts/completion-v075/visual-capture';
const inputs = ['driver.ts', 'capture.mjs', 'prepare.mjs'].map(name => `${base}/${name}`).concat([
  'tests/e2e/fullRunDriver.ts', 'tests/e2e/campaignDriver.ts', 'tests/e2e/heldMovement.ts',
  'tests/helpers/g3Driver.ts', 'tests/helpers/failureDriver.ts',
]);
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
// Static compilation of the host helper, never a production or browser build.
await build({ entryPoints: [`${base}/driver.ts`], bundle: true, platform: 'node', format: 'esm',
  packages: 'external', outfile: `${base}/driver.mjs`, sourcemap: false });
const checks = {};
for (const path of inputs.concat(`${base}/driver.mjs`)) checks[path] = await hash(path);
await writeFile(`${base}/prepared.json`, JSON.stringify({ method: 'Static host preparation only. No game, browser or test execution.', preparedAt: new Date().toISOString(), inputs: checks }, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, browserStarted: false, helper: `${base}/driver.mjs` }));
