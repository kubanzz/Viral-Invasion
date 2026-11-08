import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function receipt(path) { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; }
const paths = {
  regular: 'artifacts/sanctum-v020/unit-regular-final.json',
  finalAssets: 'artifacts/sanctum-v020/unit-final-assets.json',
  thousandSeeds: 'artifacts/unit-generated/full-system-seeds.json',
  camp: 'artifacts/sanctum-v020/camp-browser-final/report.json',
  trial: 'artifacts/blade-v020/browser/report.json',
  battleInput: 'artifacts/blade-battle-v020-frozen/report.json',
  boss: 'artifacts/heart-boss-balance-20261107-calibrated-four-weapons/formation-report.json',
  pressure: 'artifacts/sanctum-render-v020-post-input-fix/report.json',
  offline: 'artifacts/sanctum-v020/offline/report.json',
  desktopPackage: 'artifacts/releases/v0.20.0/release-package.json',
  mobilePackage: 'artifacts/mobile-release/package-report.json',
  art: 'artifacts/sanctum-v020/art-integration.json',
};
const reports = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await json(path)])));
assert(reports.regular.success && reports.regular.numFailedTests === 0);
assert(reports.finalAssets.success && reports.finalAssets.numFailedTests === 0);
assert(reports.thousandSeeds.complete && reports.thousandSeeds.completedSeeds === 1000 && reports.thousandSeeds.simulationSourceUnchanged);
for (const [path, hash] of Object.entries(reports.thousandSeeds.simulationSourceManifest)) assert.equal(sha(await readFile(path)), hash, 'Gameplay changed after the seed audit: ' + path);
for (const key of ['camp', 'trial', 'battleInput', 'pressure', 'offline']) assert.equal(reports[key].pass, true, key + ' did not pass');
assert(reports.pressure.acceptanceEligible && reports.pressure.fingerprints.after.unchanged && reports.pressure.bundleUnchanged);
for (const { path, sha256 } of reports.pressure.fingerprints.before.files) assert.equal(sha(await readFile(path)), sha256, 'Render source changed after pressure verification: ' + path);
assert.equal(reports.boss.cases.length, 12);
assert(reports.boss.cases.every(item => item.outcome === 'boss-defeated'));
assert.equal(reports.desktopPackage.version, '0.20.0'); assert(reports.desktopPackage.staticPass);
assert.equal(reports.mobilePackage.version, '0.20.0'); assert(reports.mobilePackage.sourceValidation.pass && reports.mobilePackage.outputValidation.pass);
assert.equal(reports.art.count, 74);
const metadata = await json('dist/build-meta.json'), runtime = await json('.art-generated/art-runtime.json');
assert.equal(metadata.version, '0.20.0'); assert.equal(metadata.art.inputSignature, runtime.inputSignature);
for (const [path, hash] of Object.entries(metadata.sourceManifest)) assert.equal(sha(await readFile(path)), hash, 'Stale release source: ' + path);
const runtimeBytes = (await stat('.art-generated/art-runtime.json')).size;
assert(runtimeBytes <= 32 * 1024 * 1024);
const packages = await Promise.all([
  'releases/Viral-Invasion-G4-v0.20.0.zip', 'releases/Viral-Invasion-Mobile.html', 'releases/Viral-Invasion-Mobile.zip',
].map(receipt));
assert.equal(packages[0].sha256, reports.desktopPackage.sha256);
assert.equal(packages[1].sha256, reports.mobilePackage.htmlSha256);
assert.equal(packages[2].sha256, reports.mobilePackage.zipSha256);
const report = { version: metadata.version, completedAt: new Date().toISOString(), pass: true,
  source: { buildMetadata: await receipt('dist/build-meta.json'), sourceFiles: Object.keys(metadata.sourceManifest).length,
    currentBuildManifestVerified: true, seedAuditGameplayManifestVerified: true, pressureRenderManifestVerified: true },
  artwork: { count: reports.art.count, sourcePngBytes: reports.art.bytes, runtimeBytes, runtimeBudgetBytes: 32 * 1024 * 1024,
    inputSignature: runtime.inputSignature, selectionSha256: runtime.selectionSha256, pipelineSha256: runtime.pipelineSha256,
    delivery: await receipt('asserts/ViralInvasion_Sanctum_v020/delivery.json') },
  regularTests: { files: reports.regular.testResults.length, tests: reports.regular.numPassedTests, failures: 0 },
  thousandSeeds: { completed: 1000, outcomes: reports.thousandSeeds.outcomes, scope: reports.thousandSeeds.coverageScope },
  boss: { cases: reports.boss.cases.length, wins: 12, configuration: reports.boss.configuration },
  browserSizes: ['1366x768', '844x390', '667x320'],
  pressure: reports.pressure.cases.map(item => ({ mode: item.mode, pass: item.pass, frameIntervals: item.frameIntervals,
    renderTimes: item.renderTimes, updateTimes: item.updateTimes, min: item.details.min, max: item.details.max,
    stages: item.details.stages, renderedEvidence: item.details.renderedEvidence })),
  packages, evidence: Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await receipt(path)]))),
  correctedCandidate: { reason: 'Touch tracing could activate the construction-discovery notification. During bladeTrace the notice is now deferred and opening construction is rejected. Final package and real input checks were repeated.',
    rejectedPackage: 'artifacts/sanctum-v020/rejected-candidate', failedInputEvidence: 'artifacts/blade-battle-v020-frozen-attempt-1/report.json' },
  limits: ['Touch tests use desktop Chromium CDP touch emulation; physical iPhone/Sitecase remains untested.',
    'Boss comparisons use an automated InputFrame pilot and a supplied boss-ready initial world; they do not establish human difficulty or natural mission duration.',
    'Pressure scene supplies durable enemies/legions and periodic energy; frame-time measurements describe this desktop headless Chrome machine without an FPS pass threshold.',
    'Camp and showcase tests disclose initial legal save fixtures for maturity, collection and near-pity; these are not claims of naturally earned progress.'],
};
const path = resolve('artifacts/sanctum-v020/verification-summary.json');
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, path, tests: report.regularTests, artwork: report.artwork.runtimeBytes, packages }));
