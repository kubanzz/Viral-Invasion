import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const receipt = async path => { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const evidence = {
  units: 'artifacts/camp-garden-v021/final/unit.json',
  browser: 'artifacts/camp-garden-v021/final/browser/report.json',
  offline: 'artifacts/camp-garden-v021/final/offline/report.json',
  desktopPackage: 'artifacts/releases/v0.21.0/release-package.json',
  mobilePackage: 'artifacts/mobile-release/package-report.json',
};
const reports = Object.fromEntries(await Promise.all(Object.entries(evidence).map(async ([key, path]) => [key, await json(path)])));
assert(reports.units.success && reports.units.numFailedTests === 0);
assert(reports.browser.pass && reports.browser.acceptanceEligible && reports.browser.sourceStable);
assert(reports.browser.cases.length === 3 && reports.browser.cases.every(item => item.pass && item.errors.length === 0));
assert(reports.offline.pass && reports.offline.cases.length === 6);
const metadata = await json('dist/build-meta.json'); assert.equal(metadata.version, '0.21.0');
for (const [path, expected] of Object.entries(metadata.sourceManifest)) assert.equal(sha(await readFile(path)), expected, 'Stale packaged source: ' + path);
for (const [path, expected] of Object.entries(reports.browser.sourceAfter)) assert.equal(sha(await readFile(path)), expected, 'Stale browser source: ' + path);
for (const [path, expected] of Object.entries(reports.browser.runtimeAfter)) assert.equal(sha(await readFile(path)), expected, 'Stale browser runtime: ' + path);
const runtimeBytes = (await stat('.art-generated/art-runtime.json')).size; assert(runtimeBytes <= 32 * 1024 * 1024);
const original = await json('artifacts/sanctum-v020/verification-summary.json');
assert.equal(metadata.art.inputSignature, original.artwork.inputSignature, 'Unexpected source artwork change');
assert(reports.desktopPackage.staticPass && reports.desktopPackage.version === metadata.version);
assert(reports.mobilePackage.sourceValidation.pass && reports.mobilePackage.version === metadata.version);
const packages = await Promise.all(['releases/Viral-Invasion-G4-v0.21.0.zip', 'releases/Viral-Invasion-Mobile.html', 'releases/Viral-Invasion-Mobile.zip'].map(receipt));
assert.equal(packages[0].sha256, reports.desktopPackage.sha256);
assert.equal(packages[1].sha256, reports.mobilePackage.htmlSha256);
assert.equal(packages[2].sha256, reports.mobilePackage.zipSha256);
const result = { version: metadata.version, completedAt: new Date().toISOString(), pass: true,
  behavior: ['World soil beds and staged crop sprites, nearby mouse/touch or E planting/harvest, distant actions refused',
    'Food and three plot records persist through real reload; legacy schema5 records retained',
    'Three separately sorted dormitories with independent solid bodies and walkable courtyard',
    'Curved garden walk and three physically closed planned regions with local labels and full overview'],
  units: { files: reports.units.testResults.length, passed: reports.units.numPassedTests, failed: 0 },
  browserSizes: reports.browser.cases.map(item => ({ width: item.width, height: item.height, touch: item.touch, pass: item.pass })),
  offline: { cases: 6, browsers: ['Chrome', 'Edge'], networkDisabled: true },
  sources: { buildManifestVerified: true, count: Object.keys(metadata.sourceManifest).length, browserSourceAndRuntimeVerified: true },
  art: { unchangedFromV020: true, inputSignature: metadata.art.inputSignature, runtimeBytes, limit: 32 * 1024 * 1024 },
  packages, evidence: Object.fromEntries(await Promise.all(Object.entries(evidence).map(async ([key, path]) => [key, await receipt(path)]))),
  boundaries: ['Legal initial save fixture supplies one empty, one growing and one mature plot; no natural expedition maturity is claimed.',
    'Touch tests use Chromium CDP emulation; physical iPhone/Sitecase remains untested.',
    'Planned regions are previews with blocked entrances; no unlock tasks or extra production systems are included.'],
};
const path = 'artifacts/camp-garden-v021/final/verification-summary.json';
await writeFile(path, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: true, path, tests: result.units, packages }));
