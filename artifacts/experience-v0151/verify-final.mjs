import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only product verification. Only this summary/coverage are derived outputs.
// Required final inputs are explicit; old v0.15 results remain references only.
const base = dirname(fileURLToPath(import.meta.url)), root = resolve(base, '../..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--config', 'Usage: node artifacts/experience-v0151/verify-final.mjs [--config path]');
const configPath = resolve(root, args[1] ?? 'artifacts/experience-v0151/final-inputs.json');
const path = value => { assert.ok(typeof value === 'string' && value.length, 'Missing explicit evidence path'); return resolve(root, value); };
const local = value => relative(root, path(value)).replaceAll('\\', '/');
const bytes = value => readFile(path(value));
const sha = async value => createHash('sha256').update(await bytes(value)).digest('hex');
const json = async value => JSON.parse((await bytes(value)).toString('utf8').replace(/^\uFEFF/, ''));
const info = async value => { const file = await stat(path(value)); assert.ok(file.isFile() && file.size > 0, `Missing/empty ${value}`); return { path: local(value), bytes: file.size, sha256: await sha(value) }; };
const equalFiles = async (a, b) => assert.ok((await bytes(a)).equals(await bytes(b)), `Different bytes: ${a} / ${b}`);
const summary = { version: '0.15.1', startedAt: new Date().toISOString(), pass: false, checks: [], references: [],
  scope: 'v0.15.1 incremental experience-polish release: actual current inputs/tests, loopback-served build bytes, real desktop/touch progression, reward/trial/UI, and delivered ZIP identity.',
  boundaries: ['Local immutable HTTP input checks do not claim direct file-protocol execution.', 'v0.15.0 art/native-frame/48-population and pressure results are historical baseline references, not newly repeated v0.15.1 measurements.', 'Natural automation uses skilled inputs and is not first-player observation.'],
  manualPending: ['Physical-phone audio/WebGL/safe-area/background/multitouch', 'Five new players: clarity, handoff understanding, construction discovery and replay', 'Novice 5–8 minute success-time/difficulty distribution'] };
async function check(name, run) { try { const details = await run(); summary.checks.push({ name, pass: true, details }); return details; } catch (error) { summary.checks.push({ name, pass: false, error: error.stack ?? String(error) }); } }
async function manifest(manifest, label, expected, auxiliary = []) {
  assert.ok(manifest && Object.keys(manifest).length, `${label}: missing manifest`);
  for (const [file, expectedSha] of Object.entries(manifest)) {
    assert.equal(await sha(file), expectedSha, `${label}: current bytes changed ${file}`);
    if (expected) {
      if (local(file) in expected) assert.equal(expected[local(file)], expectedSha, `${label}: candidate input differs ${file}`);
      else assert.ok(auxiliary.includes(local(file)), `${label}: runtime input not attested ${file}`);
    }
  }
  return Object.keys(manifest).length;
}
const valueAt = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
function assertions(report, list) {
  assert.ok(Array.isArray(list) && list.length, 'Explicit assertions required');
  for (const entry of list) {
    const actual = valueAt(report, entry.path);
    if (entry.op === 'gte') assert.ok(typeof actual === 'number' && actual >= entry.value, entry.path);
    else if (entry.op === 'length') assert.equal(actual?.length, entry.value, entry.path);
    else if (entry.op === 'truthy') assert.ok(actual, entry.path);
    else { assert.ok(!entry.op || entry.op === 'equal', `Unsupported assertion ${entry.op}`); assert.deepEqual(actual, entry.value, entry.path); }
  }
}
let config, meta;
await check('explicit-final-inputs', async () => {
  config = await json(configPath); assert.equal(config.version, '0.15.1'); assert.equal(config.final, true);
  assert.deepEqual(config.pendingMedia ?? [], [], 'Required final media remain pending');
  for (const key of ['candidate', 'dist', 'typecheck', 'naturalDesktop', 'naturalTouch', 'layout', 'mobileHtml']) assert.ok(config[key], `Missing ${key}`);
  assert.ok(config.runtimeVersion?.startsWith('0.15.1')); assert.ok(config.unitReports?.length);
  assert.ok(config.releaseFiles?.length >= 3 && config.zipContents?.length >= 2);
  return info(configPath);
});
if (config) {
  meta = await check('frozen-current-candidate', async () => {
    const candidate = await json(join(config.candidate, 'build-meta.json')); assert.equal(candidate.version, config.version); assert.equal(candidate.stage, 'G4');
    const count = await manifest(candidate.sourceManifest, 'Current candidate');
    for (const [name, expected] of Object.entries(candidate.outputManifest)) { assert.equal(await sha(join(config.candidate, name)), expected); await equalFiles(join(config.candidate, name), join(config.dist, name)); }
    await equalFiles(join(config.candidate, 'build-meta.json'), join(config.dist, 'build-meta.json'));
    summary.sourceInputCount = count; summary.gameSha256 = candidate.outputManifest['game.js']; return candidate;
  });
  await check('current-typecheck', async () => { const report = await json(config.typecheck); assert.equal(report.exitCode, 0); if (report.version) assert.equal(report.version, config.version); return info(config.typecheck); });
  await check('explicit-unit-regressions', async () => {
    const selected = new Map(), reports = [];
    for (const file of config.unitReports) {
      const report = await json(file), occurrences = new Map();
      const cases = report.testResults.flatMap(suite => suite.assertionResults.map(test => ({ file: local(suite.name), ...test })));
      assert.equal(cases.length, report.numTotalTests); assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0);
      assert.equal(cases.filter(item => item.status === 'passed').length, report.numPassedTests); assert.equal(cases.filter(item => item.status === 'failed').length, report.numFailedTests);
      for (const item of cases) { const identity = `${item.file.toLowerCase()}\0${item.fullName}`, ordinal = occurrences.get(identity) ?? 0; occurrences.set(identity, ordinal + 1); const key = `${identity}\0${ordinal}`; selected.set(key, { file: item.file, name: item.fullName, occurrence: ordinal + 1, report: local(file), status: item.status }); }
      reports.push({ ...(await info(file)), total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests });
    }
    assert.ok(selected.size > 0 && [...selected.values()].every(test => test.status === 'passed'), 'Unresolved final unit assertion failure');
    const coverage = { pass: true, scope: config.unitScope ?? 'Explicit reports listed here; do not infer broader counts.', selectedAssertions: selected.size, reports, selected: [...selected.values()] };
    await writeFile(join(base, 'unit-coverage-final.json'), JSON.stringify(coverage, null, 2)); return { selectedAssertions: selected.size, reports, scope: coverage.scope };
  });
  if (config.testRunIdentity) await check('test-run-source-identity', async () => {
    const report = await json(config.testRunIdentity); assert.equal(report.sourcesUnchanged, true); assert.deepEqual(report.sourceBefore, report.sourceAfter);
    await manifest(report.sourceBefore, 'Test run sources', undefined); return info(config.testRunIdentity);
  });
  if (config.systemSeeds) await check('explicit-bounded-system-regression', async () => {
    const report = await json(config.systemSeeds); assert.equal(report.complete, true); assert.equal(report.expectedSeeds, config.expectedSystemSeeds); assert.equal(report.completedSeeds, config.expectedSystemSeeds);
    assert.equal(report.simulationSourceUnchanged, true); assert.ok(!report.firstFailure); assert.ok(report.expectedSeeds > 0);
    await manifest(report.simulationSourceManifest, 'System sources'); if (report.replay) assert.equal(report.replay.equal, true); if (report.preparedReplay) assert.equal(report.preparedReplay.equal, true);
    return { ...(await info(config.systemSeeds)), completedSeeds: report.completedSeeds };
  });
  async function servedIdentity(served, responseHashes, label) {
    assert.ok(meta, 'Candidate identity must pass before browser evidence'); assert.equal(served?.transport, 'immutable-allowlisted-loopback-http');
    const origin = new URL(served.origin); assert.equal(origin.protocol, 'http:'); assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname));
    assert.equal(resolve(served.candidateRoot), path(config.candidate)); assert.equal(served.metadataSha256, await sha(join(config.candidate, 'build-meta.json')));
    const allowed = [join(config.candidate, 'index.html'), join(config.candidate, 'game.js'), join(config.candidate, 'game.css'), join(config.candidate, 'build-meta.json'), config.mobileHtml].map(path);
    assert.ok(served.assets?.length >= 4 && served.assets.length <= 5);
    for (const asset of served.assets) { assert.ok(allowed.includes(path(asset.path)), `${label}: unexpected served path ${asset.path}`); assert.equal(asset.sha256, await sha(asset.path)); assert.equal(asset.bytes, (await stat(path(asset.path))).size); }
    assert.ok(responseHashes && Object.keys(responseHashes).length, `${label}: actual HTTP response hashes required`);
    for (const [name, actual] of Object.entries(responseHashes)) { const asset = served.assets.find(item => item.name === name); assert.ok(asset, `${label}: unattested HTTP response ${name}`); assert.equal(actual, asset.sha256, `${label}: actual response byte drift`); }
    const entry = served.entryKind === 'mobile' ? 'mobile.html' : 'game.js'; assert.ok(responseHashes[entry], `${label}: missing loaded product bytes`);
  }
  async function natural(file, touch) {
    const report = await json(file); assert.equal(report.pass, true); assert.equal(report.pilot, false); assert.deepEqual(report.errors, []); assert.deepEqual(report.remoteRequests, []);
    assert.equal(report.sourcesUnchanged, true); assert.equal(report.outputsUnchanged, true); assert.equal(report.candidateUnchanged, true);
    assert.equal(report.candidateBefore?.version, config.version); assert.deepEqual(report.candidateBefore.currentSourceMismatches, []); assert.deepEqual(report.candidateBefore.outputManifest, meta.outputManifest);
    assert.deepEqual(report.candidateBefore, report.candidateAfter); assert.equal(report.candidateBefore.sha256, await sha(join(config.candidate, 'build-meta.json')));
    assert.equal(report.candidateBefore.productionInputCount, Object.keys(meta.sourceManifest).length); assert.equal(report.runtimeVersion, config.runtimeVersion);
    assert.deepEqual(report.sourceBefore, report.sourceAfter); await manifest(report.sourceBefore, 'Natural runtime inputs', meta.sourceManifest, ['src/game/territoryTypes.ts']);
    assert.deepEqual(report.outputBefore, report.outputAfter); assert.ok(report.outputBefore && Object.keys(report.outputBefore).length); await manifest(report.outputBefore, 'Natural frozen disk outputs');
    await servedIdentity(report.servedCandidate, report.responseHashes, touch ? 'Touch' : 'Desktop');
    assert.equal(new URL(report.entry).origin, report.servedCandidate.origin);
    assert.ok(report.victory?.snapshot && report.secondDeparture?.expedition); assert.notEqual(report.runId, report.secondDeparture.expedition.runId);
    for (const lane of ['north', 'south']) assert.ok(report.events?.some(event => event.type === 'TERRITORY_HANDOFF_COMPLETED' && event.data.laneId === lane));
    assert.ok(report.events?.some(event => event.type === 'CONSTRUCTION_COMPLETED') && report.launch?.landed, 'Real construction and player landing must occur');
    assert.ok(report.events?.some(event => event.type === 'TERRITORY_CANNON_EXPLODED' && event.data.hits > 0 && event.data.damage > 0), 'Launcher must demonstrate an actual combat impact');
    assert.ok(report.events?.some(event => event.type === 'HEART_BOSS_SECOND_PHASE'));
    assert.ok(report.events?.some(event => event.type === 'CORE_ATTACK_TELEGRAPHED' && event.data.range > 530), 'Actual distant Boss telegraph not reached');
    assert.ok(report.bossCounterplay?.length > 0, 'Boss attack must cause an actual input response');
    assert.ok(report.maxAlive <= 48 && report.maxReserved <= 48); assert.equal(report.savedAtVictory.runs, 1); assert.equal(report.savedAtVictory.rescues, 1);
    assert.equal(report.campAtVictory.victories, 1); assert.equal(report.campAtVictory.claimedRewardIds.length, 1); assert.equal(report.campAfterDeparture.victories, 1); assert.equal(report.campAfterDeparture.claimedRewardIds.length, 1);
    const reveal = report.rewardDisclosure; assert.equal(reveal?.visible, true); assert.equal(reveal.onScreen, true); assert.match(reveal.text, /战利品/); assert.match(reveal.text, /贯脉针枪/); assert.match(reveal.text, /速装弹射荚/); assert.match(reveal.text, /40/); assert.ok(['purple', 'gold'].includes(reveal.rarity));
    assert.equal(report.blueprintDisclosure?.visible, true); assert.ok(report.blueprintDisclosure.gap >= 7.9, 'First blueprint notice overlaps the actual objective HUD');
    assert.ok(report.victoryLayouts?.length >= (touch ? 2 : 1));
    for (const item of report.victoryLayouts) { assert.equal(item.pass, true); assert.equal(item.primaryExposed, true); assert.ok(item.controls.length >= 4 && item.controls.every(control => control.width >= 48 && control.height >= 48)); }
    if (touch) assert.ok(report.victoryLayouts.some(item => item.width === 667 && item.height === 320), 'Actual small-landscape victory not exercised');
    assert.equal(report.campDirectForge, true); const trial = report.trialVerification; assert.equal(trial?.pass, true); assert.equal(trial.profileBefore, trial.profileAfter);
    for (const [id, hits] of [['steady', 1], ['piercing', 2]]) { const item = trial.cases.find(test => test.weaponId === id); assert.equal(item?.pass, true); assert.equal(item.after.shots, 1); assert.equal(item.after.hits, hits);
      assert.equal(item.coVisible?.fireExposed, true); assert.equal(item.coVisible.canvasFullyInsideContent, true); assert.ok(item.coVisible.samples?.length >= 13 && item.coVisible.samples.every(sample => sample.exposed), 'Entire range, targets/labels/damage/summary and fire must be visible together');
      if (touch) assert.deepEqual(item.coVisible.viewport, { width: 667, height: 320 }, 'Real trial must exercise the smallest landscape layout'); }
    if (touch) assert.match(report.method, /touch|CDP/i);
    assert.equal(report.videoComplete, true); const video = await info(report.video); assert.equal(video.sha256, report.videoMetadata?.sha256); assert.equal(video.bytes, report.videoMetadata?.bytes);
    return { ...(await info(file)), method: report.method, scope: report.scope, rescueSeconds: report.victory.snapshot.elapsed, maxAlive: report.maxAlive, maxReserved: report.maxReserved, video };
  }
  await check('actual-desktop-expedition-reward-trial', () => natural(config.naturalDesktop, false));
  await check('actual-touch-expedition-reward-trial', () => natural(config.naturalTouch, true));
  await check('current-layout-and-inputs', async () => {
    const report = await json(config.layout); assert.equal(report.pass, true); assert.equal(report.version, config.version); assert.equal(report.candidateUnchanged, true); assert.equal(report.sourcesUnchanged, true); assert.equal(report.serverClosed, true); assert.equal(report.browsersClosed, true);
    assert.deepEqual(report.identityBefore, report.identityAfter); assert.equal(report.identityBefore.version, config.version); assert.deepEqual(report.identityBefore.outputs, meta.outputManifest); assert.equal(report.identityBefore.mobileHash, await sha(config.mobileHtml));
    assert.deepEqual(report.sourceBefore, report.sourceAfter); await manifest(report.sourceBefore, 'Layout sources', meta.sourceManifest);
    assert.ok(report.cases?.length >= 4); for (const size of [[667, 320], [844, 390], [915, 412], [1366, 768]]) assert.ok(report.cases.some(item => item.viewport.width === size[0] && item.viewport.height === size[1]), `Missing viewport ${size}`);
    for (const item of report.cases) { assert.equal(item.pass, true, item.id); assert.deepEqual(item.errors, []); assert.deepEqual(item.remoteRequests, []); await servedIdentity({ ...report.servedCandidate, entryKind: item.touch ? 'mobile' : 'desktop' }, item.responseHashes, item.id);
      if (item.touch) { assert.ok(item.controls?.every(control => control.width >= 47.99 && control.height >= 47.99)); assert.ok(item.minimumGap >= 7.99); assert.ok(item.multiTouch?.shotsAfter > item.multiTouch?.shotsBefore && item.multiTouch.moveDistance > 0); }
    }
    return { ...(await info(config.layout)), cases: report.cases.length, scope: report.scope };
  });
  for (const item of config.supplemental ?? []) await check(item.name, async () => {
    const report = await json(item.path); assertions(report, item.assertions);
    if (item.name === 'component-fixtures') {
      assert.equal(resolve(report.candidate), path(config.candidate)); assert.equal(report.cssSha256, meta.outputManifest['game.css']); assert.deepEqual(report.errors, []);
      assert.deepEqual(report.sourceBefore, report.sourceAfter); await manifest(report.sourceBefore, 'Component fixture sources', meta.sourceManifest);
      for (const entry of report.fixtureData) assert.equal(await sha(entry.path), entry.sha256, 'Earned fixture-data bytes changed');
      for (const entry of report.cases) { assert.equal(entry.pass, true); assert.equal(entry.victory.overflow, false); assert.equal(entry.victory.primaryExposed, true); assert.ok(entry.victory.controls.every(control => control.width >= 48 && control.height >= 48)); assert.equal(entry.trial.canvasFullyInsideContent, true); assert.ok(entry.trial.points.some(point => point.name === 'shot-hit-damage-summary') && entry.trial.points.every(point => point.exposed)); }
    }
    return { ...(await info(item.path)), scope: item.scope };
  });
  await check('unchanged-art-budget', async () => {
    const file = config.artRuntime ?? '.art-generated/art-runtime.json', current = await info(file); assert.ok(current.bytes <= 20 * 1024 * 1024);
    if (config.expectedArtSha256) assert.equal(current.sha256, config.expectedArtSha256); return { ...current, note: 'Resource-size/identity check only; historical native-frame and 48-population results are not rerun here.' };
  });
  await check('delivered-file-hashes-and-independent-zips', async () => {
    // A preliminary final:false configuration can still check package bytes,
    // but explicit-final-inputs always fails, so it cannot yield a final pass.
    const requiredRoles = ['desktop-zip', 'mobile-html', 'mobile-zip', ...(config.final === true ? ['gameplay-image', 'rewards-image', 'trial-image', 'touch-video'] : [])];
    for (const role of requiredRoles) assert.ok(config.releaseFiles.some(item => item.role === role), `Missing delivered ${role}`);
    const files = []; for (const item of config.releaseFiles) { const details = await info(item.path); assert.equal(details.sha256, item.sha256, `Release changed ${item.path}`); if (item.equals) await equalFiles(item.path, item.equals); files.push(details); }
    const require = createRequire(import.meta.url), { yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
    const zips = [];
    for (const zip of config.zipContents) {
      const seen = new Set(); let total = 0;
      await new Promise((done, fail) => yauzl.open(path(zip.path), { lazyEntries: true }, (error, archive) => {
        if (error) return fail(error); archive.on('error', fail); archive.on('entry', entry => {
          try { const name = entry.fileName, normalized = relative(root, resolve(root, name)); assert.ok(!isAbsolute(name) && normalized !== '..' && !normalized.startsWith('../') && !normalized.startsWith('..\\'), `Unsafe ZIP path ${name}`); assert.ok(!seen.has(name), `Duplicate ZIP entry ${name}`); seen.add(name); total += entry.uncompressedSize; assert.ok(seen.size <= 64 && total < 128 * 1024 * 1024, 'Unexpected ZIP dimensions');
            if (!(name in zip.files)) { archive.readEntry(); return; }
            archive.openReadStream(entry, (streamError, stream) => { if (streamError) { archive.close(); fail(streamError); return; } (async () => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); assert.ok(Buffer.concat(chunks).equals(await bytes(zip.files[name])), `ZIP decoded bytes differ ${zip.path}:${name}`); archive.readEntry(); })().catch(failure => { archive.close(); fail(failure); }); });
          } catch (failure) { archive.close(); fail(failure); }
        }); archive.on('end', () => { try { for (const name of Object.keys(zip.files)) assert.ok(seen.has(name), `Missing ZIP entry ${name}`); done(); } catch (failure) { fail(failure); } }); archive.readEntry();
      }));
      zips.push({ path: local(zip.path), entries: seen.size, verifiedEntries: Object.keys(zip.files), uncompressedBytes: total });
    }
    return { files, zips, scope: 'Independent ZIP byte decoding; no direct file-protocol execution claim.' };
  });
  for (const reference of config.baselineReferences ?? []) summary.references.push({ ...(await info(reference.path)), scope: reference.scope, currentReleaseVerification: false });
}
summary.finishedAt = new Date().toISOString(); summary.failedChecks = summary.checks.filter(item => !item.pass).map(item => item.name); summary.pass = summary.checks.length > 0 && summary.failedChecks.length === 0;
await writeFile(join(base, 'verification-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, checks: summary.checks.length, failedChecks: summary.failedChecks, report: local(join(base, 'verification-summary.json')) }));
if (!summary.pass) process.exitCode = 1;
