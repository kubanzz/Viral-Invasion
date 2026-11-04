import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = 'artifacts/actor-overhaul-20261103';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const build = await json('dist/build-meta.json');
const unit = await json(`${base}/final-pause-unit.json`);
const art = await json('artifacts/actor-art-v2/final-5/report.json');
const perf = await json(`${base}/performance-3ee2/performance-report.json`);
const guard = await json(`${base}/guard-3ee2/browser-report.json`);
const offline = await json(`${base}/final-offline-smoke.json`);
const desktop = await json('artifacts/releases/v0.11.0/release-package.json');
const mobile = await json('artifacts/mobile-release/package-report.json');
for (const [path, expected] of Object.entries(build.sourceManifest)) assert.equal(await sha(path), expected, path);
for (const [path, expected] of Object.entries(build.outputManifest)) assert.equal(await sha(`dist/${path}`), expected, path);
assert.equal(build.version, '0.11.0');
assert.equal(await sha('dist/game.js'), '3ee2d91c62b5c1301d4260d8d47d231bf55384234c47fa2011d3b5cf15eb1f26');
assert.equal(unit.numPassedTests, 1606);
assert.equal(unit.numFailedTests + unit.numPendingTests, 0);
for (const [name, report] of Object.entries({ art, perf, guard, offline })) assert.equal(report.pass, true, name);
assert.equal(await sha(desktop.zip), desktop.sha256);
assert.equal(await sha(mobile.html), mobile.htmlSha256);
assert.equal(await sha(mobile.zip), mobile.zipSha256);
assert.equal(await sha('releases/Viral-Invasion-Mobile-v0.11.0/Viral-Invasion-Mobile.html'), mobile.htmlSha256);
assert.equal(await sha('releases/Viral-Invasion-Mobile-v0.11.0/Viral-Invasion-Mobile.zip'), mobile.zipSha256);
assert.equal(await sha('asserts/ViralInvasion_Fantasy_v1/references/territory-style-approved-v1.png'), '8caaa9cabe4a229f6a091360f642436bc021cf03aafed4111e173760aafdfabe');
for (const path of ['releases/Viral-Invasion-G4-v0.10.0.zip', 'releases/Viral-Invasion-Mobile-v0.10.0/Viral-Invasion-Mobile.html']) assert.ok((await stat(path)).size > 0);
const summary = {
  version: build.version, completedAt: new Date().toISOString(), gameJsSha256: await sha('dist/game.js'),
  attestedInputs: Object.keys(build.sourceManifest).length, sourcesAndOutputsMatch: true,
  scope: 'Actor-style replacement and presentation self-check. Existing territory gameplay retained.',
  reports: {
    unit: `${base}/final-pause-unit.json`, systemSixSeed: `${base}/final-pause-system-six-seed.json`,
    art: 'artifacts/actor-art-v2/final-5/report.json',
    desktopE2e: `${base}/e2e-3ee2-report.json`, desktopDirectionalRerun: `${base}/e2e-hero-startup-rerun-report.json`,
    chromeTrustedTouch: `${base}/e2e-touch-cleanup-rerun-report.json`,
    performance: `${base}/performance-3ee2/performance-report.json`, guard: `${base}/guard-3ee2/browser-report.json`,
    offline: `${base}/final-offline-smoke.json`, desktopPackage: 'artifacts/releases/v0.11.0/release-package.json',
    mobilePackage: 'artifacts/mobile-release/package-report.json',
    naturalComparison: `${base}/natural-comparison/comparison-v0.11.0-final-5.json`,
  },
  unit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests, skipped: unit.numPendingTests, systemSeeds: 6 },
  art: { technicalPass: art.technicalPass, actorAcceptance: art.actorAcceptance,
    derivedCases: art.derived.cases.length, nativeIds: art.coverage.requiredNativeIdCount,
    observedNativeIds: art.coverage.actuallyObservedNativeIds.length, densePresentationCases: art.coverage.denseDerivedCaptured,
    ruleDirectionCases: art.coverage.ruleDirectionCases, missingActions: art.coverage.missingActions,
    missingViews: art.coverage.missingViews,
    originalAcceptanceStatus: art.acceptanceStatus,
    visualReview: { reviewer: 'Codex root visual inspection, not human player testing',
      scope: 'Approved concept, actual-size family/action/direction contacts, menu, dense cases, final natural training comparison and mother combat image reviewed.' } },
  performance: { scope: perf.scope, pass: perf.pass,
    cases: perf.cases.map(c => ({ name: c.name, pass: c.pass, averageFps: c.sample.averageFps,
      p95Ms: c.sample.p95Ms, maxMs: c.sample.maxMs, seconds: c.sample.durationSeconds,
      minAlive: c.sample.minAlive, maxAlive: c.sample.maxAlive, maxReserved: c.sample.maxReserved,
      minVisible: c.sample.minVisible, maxVisible: c.sample.maxVisible, errors: c.errors })) },
  guard: { pass: guard.pass, savedRuns: guard.savedAfterGuard.runs, savedRescues: guard.savedAfterGuard.rescues,
    victoryElapsed: guard.victory.snapshot.elapsed, end: guard.guardEnd, errors: guard.errors },
  desktop: { path: desktop.zip, bytes: desktop.bytes, sha256: desktop.sha256 },
  mobile: { html: mobile.html, htmlBytes: mobile.htmlBytes, htmlSha256: mobile.htmlSha256,
    zip: mobile.zip, zipBytes: mobile.zipBytes, zipSha256: mobile.zipSha256,
    testedCandidateMatches: mobile.htmlSha256 === '45f392a1ede75ceafab87af1e1ede3080c68bb4bcd0d0b9dd2a8bdf2c9ff4a90' },
  runtimeArtBytes: build.art.runtimeBytes,
  limits: [
    'Windows desktop browsers and CDP trusted touch events; physical phone and five-player testing pending.',
    'Lung presentation covered by supplied Renderer cases; no new natural full lung traversal.',
    'Four independent dense performance samples of about 15 seconds; not a 600-second or hardware-phone benchmark.',
    'Player/tool observed each rAF; enemies use 100ms scene samples plus state transitions, not all enemy transient frames.',
    'Eight natural sequences include six short action flows and two rescue routes; 240 seconds is an upper bound, not completed duration.',
    'AI source art plus reference posing and local rig/soft-body baking; not 115 independently AI-painted animation frames.',
  ],
  pass: true,
};
await writeFile(`${base}/verification-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: true, version: summary.version, inputs: summary.attestedInputs,
  desktopBytes: desktop.bytes, mobileHtmlBytes: mobile.htmlBytes, report: resolve(base, 'verification-summary.json') }));
