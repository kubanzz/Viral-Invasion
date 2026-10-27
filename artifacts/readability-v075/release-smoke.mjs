import { readFile } from 'node:fs/promises';
const packaged = JSON.parse(await readFile(new URL('./release-package.json', import.meta.url), 'utf8'));
process.argv[2] = packaged.verifiedFolder;
process.env.VI_RELEASE_REPORT = 'artifacts/readability-v075/release-smoke';
await import('../../scripts/verify-release.mjs');
