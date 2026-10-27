import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('artifacts/readability-v076/release/package.json', 'utf8'));
if (report.version !== '0.7.6' || !report.staticPass) throw Error('Package verification missing.');
process.env.VI_RELEASE_REPORT = 'artifacts/readability-v076/release/smoke';
process.argv[2] = report.verifiedFolder;
await import('../../scripts/verify-release.mjs');
