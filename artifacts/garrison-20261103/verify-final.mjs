import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'artifacts/garrison-20261103';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const meta = await json(`${base}/candidate-6/build-meta.json`);
const gameSha = 'ce35bdc2c7c27419ac89030d18f05e75bbf77f10b61efa765fe65677be8e648a';
assert.equal(meta.version, '0.13.0'); assert.equal(meta.outputManifest['game.js'], gameSha);
for (const [path, hash] of Object.entries(meta.sourceManifest)) assert.equal(await sha(path), hash, `Source drift: ${path}`);
for (const name of ['index.html', 'game.js', 'game.css', 'build-meta.json'])
  assert.ok((await readFile(`dist/${name}`)).equals(await readFile(`${base}/candidate-6/${name}`)), `dist differs: ${name}`);
assert.ok(meta.art.runtimeBytes <= 20 * 1024 * 1024);
const unit = await json(`${base}/unit-final.json`), system = await json(`${base}/system-six-seed-final.json`);
assert.equal(unit.numFailedTests, 0); assert.equal(unit.numPendingTests, 0); assert.equal(unit.numPassedTests, unit.numTotalTests);
assert.equal(system.expectedSeeds, 6); assert.equal(system.completedSeeds, 6); assert.equal(system.complete, true);
const ui = await json(`${base}/ui-input-final.json`);
assert.equal(ui.passed, 20); assert.equal(ui.failed, 0); assert.equal(ui.skipped, 0); assert.equal(ui.gameSha256, gameSha);
const paths = ['natural-desktop-c6-1', 'natural-touch-c6-2'];
const natural = [];
for (const path of paths) {
  const r = await json(`${base}/${path}/browser-report.json`);
  assert.equal(r.pass, true); assert.equal(r.sourcesUnchanged, true); assert.equal(r.outputsUnchanged, true);
  assert.equal(r.errors.length, 0); assert.ok(r.maxReserved <= 48);
  assert.equal(r.savedAtVictory.runs, 1); assert.equal(r.savedAtVictory.rescues, 1);
  assert.equal(r.savedAfterGuard.runs, 1); assert.equal(r.savedAfterGuard.rescues, 1);
  assert.equal(r.savedAfterGuard.schemaVersion, 4);
  const record = r.savedAfterGuard.recentRuns.find(record => record.runId === r.runId);
  assert.deepEqual(record.rescue.snapshot, r.victory.snapshot);
  assert.ok(record.fullyPurifiedSeconds >= r.victory.snapshot.fullyPurifiedSeconds);
  assert.ok(r.victory.snapshot.fullyPurifiedSeconds > 0); assert.ok(record.guard.ended);
  for (const lane of ['north', 'south']) {
    assert.ok(r.events.some(e => e.type === 'TERRITORY_DEFENSE_MILESTONE' && e.data.laneId === lane));
    assert.ok(r.events.some(e => e.type === 'TERRITORY_HANDOFF_COMPLETED' && e.data.laneId === lane));
  }
  assert.ok(!r.choices.some(c => c.id === 'immune'));
  for (const source of ['source-west', 'source-east']) {
    const damage = r.events.filter(e => e.type === 'TARGET_HIT' && e.data.id === `territory:${source}`).reduce((sum, e) => sum + e.data.damage, 0);
    assert.ok(Math.abs(damage - 1200) < 1e-6);
  }
  natural.push({ report: `${path}/browser-report.json`, pass: true, method: r.method, runId: r.runId,
    victorySimulationSeconds: r.victory.snapshot.elapsed, finalSimulationSeconds: r.guardEnd.elapsed,
    victoryHealthySeconds: r.victory.snapshot.fullyPurifiedSeconds, finalHealthySeconds: record.fullyPurifiedSeconds,
    maxReserved: r.maxReserved, errors: r.errors.length, video: r.video ?? null });
}
const pressure = await json(`${base}/pressure-accepted/garrison-report.json`);
assert.equal(pressure.sourcesUnchanged, true); assert.equal(pressure.matureSingle.held, 10);
assert.equal(pressure.matureSingle.total, 10); assert.equal(pressure.matureSingle.tookDamageCount, 10);
assert.ok(pressure.cases.filter(c => c.rank === 1 && c.rounds === 3).every(c => !c.held));
assert.ok(pressure.cases.filter(c => c.rank === 3 && c.rounds === 16).every(c => !c.held));
for (const [path, hash] of Object.entries(pressure.sources)) assert.equal(await sha(path), hash, `Pressure source drift: ${path}`);
const render = await json('artifacts/v013-render/final-c6-inheritance.json');
assert.equal(render.pass, true); assert.equal(render.finalCandidate.gameSha256, gameSha);
const perf = await json(`${base}/performance-final/performance-report.json`);
assert.equal(perf.pass, true); assert.equal(perf.sourcesUnchanged, true); assert.equal(perf.outputsUnchanged, true);
assert.equal(perf.cases.length, 4); assert.ok(perf.cases.every(c => c.pass && c.sample.minAlive === 48 && c.sample.maxAlive === 48));
const desktop = await json('artifacts/releases/v0.13.0/release-package.json');
const mobile = await json('artifacts/mobile-release/package-report.json');
assert.equal(desktop.staticPass, true); assert.equal(mobile.version, '0.13.0');
assert.equal(await sha(desktop.zip), desktop.sha256); assert.equal(await sha(mobile.html), ui.mobileSha256);
assert.equal(await sha(mobile.zip), mobile.zipSha256);
for (const name of ['Viral-Invasion-Mobile.html', 'Viral-Invasion-Mobile.zip'])
  assert.ok((await readFile(`releases/${name}`)).equals(await readFile(`releases/Viral-Invasion-Mobile-v0.13.0/${name}`)));
const smoke = await json(`${base}/final-offline-smoke.json`);
assert.equal(smoke.pass, true); assert.equal(smoke.cases.length, 3);
assert.ok(smoke.cases.every(c => c.pass && !c.errors.length && !c.remoteRequests.length));
const preserved = {
  approvedConcept: await sha('asserts/ViralInvasion_Fantasy_v1/references/territory-style-approved-v1.png'),
  previousDesktop: await sha('releases/Viral-Invasion-G4-v0.12.0.zip'),
  previousMobile: await sha('releases/Viral-Invasion-Mobile-v0.12.0/Viral-Invasion-Mobile.html'),
};
assert.equal(preserved.approvedConcept, '8caaa9cabe4a229f6a091360f642436bc021cf03aafed4111e173760aafdfabe');
assert.equal(preserved.previousDesktop, '1bbd53e1a77ce5d316911891927bbad04a161ecddefb1005b04e2b362d424da2');
assert.equal(preserved.previousMobile, '0873cc98f50402e5c2d993d9976caece010f4af0fe5c0661aff373583785405a');
const report = {
  version: '0.13.0', candidate: 'candidate-6', gameSha256: gameSha, sourceInputCount: Object.keys(meta.sourceManifest).length,
  runtimeArtBytes: meta.art.runtimeBytes, runtimeArtLimitBytes: 20 * 1024 * 1024, pass: true,
  unit: { report: 'unit-final.json', passed: unit.numPassedTests, failed: 0, skipped: 0, systemSeeds: 6 },
  ui: { report: 'ui-input-final.json', passed: 20, failed: 0, skipped: 0 }, natural,
  pressure: { report: 'pressure-accepted/garrison-report.json', scope: pressure.scope, matureSingle: pressure.matureSingle,
    baseThreeSquadsHeld: 0, matureSixteenSquadsHeld: 0 },
  render: { report: 'artifacts/v013-render/final-c6-inheritance.json', scope: render.boundary },
  performance: { report: 'performance-final/performance-report.json', scope: perf.scope,
    cases: perf.cases.map(c => ({ name: c.name, fps: c.sample.averageFps, p95Ms: c.sample.p95Ms, maxMs: c.sample.maxMs,
      minAlive: c.sample.minAlive, maxAlive: c.sample.maxAlive, sampleSeconds: c.sample.durationSeconds })) },
  offline: { report: 'final-offline-smoke.json', passed: 3 },
  releases: { desktop: { zip: desktop.zip, bytes: desktop.bytes, sha256: desktop.sha256 },
    mobile: { html: mobile.html, bytes: mobile.htmlBytes, sha256: mobile.htmlSha256, zip: mobile.zip, zipSha256: mobile.zipSha256 },
    screenshot: 'releases/Viral-Invasion-v0.13.0-Gameplay.png', video: 'releases/Viral-Invasion-v0.13.0-Touch-Demo.webm' },
  preserved,
  manualPending: ['Physical phone/WebGL/audio/safe-area/background experience', 'Five new players clarity and replay observation', '5–8 minute first-run duration and difficulty distribution'],
  limits: ['Natural completion times belong to skilled automation, not human first runs.', 'Windows Chrome four 15-second samples do not establish phone or long-term performance; refresh cap was not fixed to 60Hz.', 'First touch route completed rescue but harness selected a hidden pause button afterwards; original failure preserved under natural-touch-c6-1. Only harness selector was corrected.'],
};
await writeFile(`${base}/verification-summary.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, version: report.version, unit: report.unit, ui: report.ui, offline: report.offline, gameSha256: gameSha }));
