import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const identity = JSON.parse(await readFile('artifacts/readability-v076/mixed-scene/release-identity.json', 'utf8'));
const gameSha256 = createHash('sha256').update(await readFile('dist/game.js')).digest('hex');
if (identity.version !== '0.7.6' || identity.gameSha256 !== gameSha256) throw Error('Frozen release differs.');
await mkdir('artifacts/readability-v076/release');
process.env.VI_PACKAGE_REPORT = 'artifacts/readability-v076/release/package.json';
await import('../../scripts/package-release.mjs');
