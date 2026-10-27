import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sourcePath = 'artifacts/readability-v075/measure-pressure.mjs';
const destination = 'artifacts/readability-v076/performance';
const raw = await readFile(sourcePath), source = raw.toString('utf8');
if (!source.includes("buildMetadata.version !== '0.7.5'") || !source.includes('verifyFrozen075')) throw Error('Unexpected archived host.');
const current = source.replaceAll('verifyFrozen075', 'verifyFrozen076')
  .replaceAll("buildMetadata.version !== '0.7.5'", "buildMetadata.version !== '0.7.6'")
  .replace("'artifacts/readability-v075/perf/formal'", "'artifacts/readability-v076/performance/unsequenced-refused'");
await mkdir(destination);
await writeFile(`${destination}/measure-pressure.mjs`, current, { flag: 'wx' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(`${destination}/host-derivation.json`, JSON.stringify({ status: 'prepared-only', browserStarted: false,
  from: sourcePath, fromSha256: sha(raw), to: `${destination}/measure-pressure.mjs`, toSha256: sha(current),
  changes: ['Expected release 0.7.5 to 0.7.6', 'Matching guard function name', 'Default output moved under this iteration'],
  scope: 'Measurement method unchanged; no archived bytes modified and no measurement has run.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ prepared: true, browserStarted: false, sourceSha256: sha(raw), targetSha256: sha(current) }));
