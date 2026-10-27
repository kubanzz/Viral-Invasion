import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'artifacts/readability-v076/mixed-scene';
const result = await build({ entryPoints: [`${base}/driver.ts`], bundle: true, platform: 'node', format: 'esm',
  packages: 'external', outfile: `${base}/driver.mjs`, sourcemap: false, metafile: true });
const files = [...new Set([...Object.keys(result.metafile.inputs), ...['capture.mjs', 'prepare.mjs', 'bind-release.mjs', 'driver.mjs', 'README.md'].map(p => `${base}/${p}`)])].sort();
const inputs = {};
for (const path of files) inputs[path] = createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(`${base}/prepared.json`, JSON.stringify({ schemaVersion: 1, preparedAt: new Date().toISOString(),
  status: 'host-prepared-release-unbound', method: 'Static host compilation only; no browser, game, test or state simulation.', inputs }, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, browserStarted: false, releaseBound: false, dependencyCount: files.length }));
