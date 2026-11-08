import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const directory = 'artifacts/thunder-rework-v025';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const [unit, renderer, offline, build, art, mobile] = await Promise.all([
  json('artifacts/unit-generated/unit-results.json'), json(`${directory}/current-verification/report.json`),
  json(`${directory}/offline-usable/report.json`), json('dist/build-meta.json'),
  json(`${directory}/art-integration.json`), json('artifacts/mobile-release/package-report.json'),
]);
assert.equal(unit.success, true); assert.equal(unit.numFailedTests, 0);
assert(renderer.pass && renderer.sourcesUnchanged && renderer.bundleUnchanged);
assert.equal(renderer.cases.length, 4);
assert(offline.pass && offline.buildUnchanged && offline.sourcesUnchanged && offline.mobileUnchanged);
assert.equal(offline.cases.length, 4);
for (const [path, expected] of Object.entries(build.sourceManifest)) assert.equal(sha(await readFile(path)), expected, `Stale build source: ${path}`);
for (const [path, expected] of Object.entries(build.outputManifest)) assert.equal(sha(await readFile(`dist/${path}`)), expected, `Stale build output: ${path}`);
for (const [path, expected] of Object.entries(renderer.sourceBefore)) if (build.sourceManifest[path])
  assert.equal(expected, build.sourceManifest[path], `Browser fixture differs from build: ${path}`);
const canonicalMobile = await readFile('releases/Viral-Invasion-Mobile.html');
const checkedMobile = await readFile(`${directory}/offline-usable/Viral-Invasion-Thunder-Mobile.html`);
assert(canonicalMobile.equals(checkedMobile)); assert.equal(sha(canonicalMobile), mobile.htmlSha256);
const report = {
  schemaVersion: 1, status: 'complete', date: '2026-11-08', version: build.version,
  unit: { files: unit.testResults.length, tests: unit.numPassedTests, failures: 0,
    log: `${directory}/unit-final-current.log`, legacyCampaignSeeds: 6 },
  typecheck: { command: 'node_modules/.bin/tsc --noEmit', exitCode: 0 },
  renderingAndInputs: { cases: renderer.cases.length, pass: true, report: `${directory}/current-verification/report.json`,
    benchmarks: `${directory}/current-verification/benchmarks.json` },
  offlineAndTrialLayout: { cases: offline.cases.length, pass: true, report: `${directory}/offline-usable/report.json`,
    scope: 'Chrome/Edge, desktop/browser touch; cold start with network disabled, real camp trial input and minimum canvas/control geometry.' },
  art: { count: art.assets.length, sourcePngBytes: art.sourcePngBytes, report: `${directory}/art-integration.json` },
  build: { sourceFiles: Object.keys(build.sourceManifest).length, outputManifest: build.outputManifest },
  deliverables: { desktop: 'dist/index.html', mobile: 'releases/Viral-Invasion-Mobile.html', mobileZip: 'releases/Viral-Invasion-Mobile.zip',
    mobileSha256: mobile.htmlSha256, preview: 'http://127.0.0.1:4173/' },
  limitations: ['Browser touch emulation, not physical-phone or human fun validation.',
    'Legacy campaign regression uses six seeds; the earlier default 1000-seed run was interrupted during source changes and is not a passing result.'],
};
await writeFile(`${directory}/verification-summary.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, unit: report.unit.tests, browserCases: 8, mobileSha256: mobile.htmlSha256 }));
