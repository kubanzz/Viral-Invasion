import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, relative, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// This verifier only reads product/evidence files. Its own summary and unit
// coverage are derived artifacts. Missing evidence fails; it never invents a pass.
const base = dirname(fileURLToPath(import.meta.url)), root = resolve(base, '../..');
const args = process.argv.slice(2), configIndex = args.indexOf('--config');
if (args.length && (args.length !== 2 || args[0] !== '--config' || !args[1]))
  throw Error('Usage: node artifacts/expedition-v015/verify-final.mjs [--config path/to/final-inputs.json]');
const configPath = resolve(root, configIndex >= 0 ? args[configIndex + 1] : 'artifacts/expedition-v015/final-inputs.json');
const local = path => relative(root, resolve(root, path)).replaceAll('\\', '/');
const file = path => { assert.equal(typeof path, 'string', 'Missing evidence path'); assert.ok(path.length, 'Empty evidence path'); return resolve(root, path); };
const json = async path => JSON.parse((await readFile(file(path), 'utf8')).replace(/^\uFEFF/, ''));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async path => digest(await readFile(file(path)));
const evidence = async path => ({ path: local(path), sha256: await sha(path), bytes: (await stat(file(path))).size });
const nonempty = async path => { const info = await stat(file(path)); assert.ok(info.isFile() && info.size > 0, `Missing/empty ${path}`); return info.size; };
const sameBytes = async (a, b) => assert.ok((await readFile(file(a))).equals(await readFile(file(b))), `Different bytes: ${a} / ${b}`);
const summary = { version: '0.15.0', startedAt: new Date().toISOString(), pass: false, checks: [],
  manualPending: ['Physical phones: WebGL/audio/safe area/background/multitouch', 'Five new players: clarity, counterplay and voluntary replay', 'Novice first-run 5–8 minute success-time and difficulty distribution'],
  boundaries: ['Natural runs describe automated skilled inputs, not novice play.', 'Supplied-state art, pressure and 48-population tests are separately labelled and do not prove natural progression.', 'Desktop touch emulation does not prove phone hardware performance.', 'Original failed/pilot results are retained as history and never silently relabelled final passes.'] };
async function check(name, fn) {
  try { const details = await fn(); summary.checks.push({ name, pass: true, details }); return details; }
  catch (error) { summary.checks.push({ name, pass: false, error: error.stack ?? String(error) }); return undefined; }
}
async function manifestMatches(manifest, label, expectedSubset, requireAll = true) {
  assert.ok(manifest && typeof manifest === 'object' && Object.keys(manifest).length > 0, `${label}: empty manifest`);
  for (const [path, expected] of Object.entries(manifest)) {
    assert.equal(await sha(path), expected, `${label}: current source drift ${path}`);
    if (expectedSubset && (requireAll || local(path) in expectedSubset)) assert.equal(expectedSubset[local(path)], expected, `${label}: input not attested by candidate ${path}`);
  }
  return Object.keys(manifest).length;
}
function valueAt(value, path) { return path.split('.').reduce((current, key) => current?.[key], value); }
function assertions(value, list, label) {
  assert.ok(Array.isArray(list) && list.length, `${label}: explicit report assertions required`);
  for (const item of list) {
    const found = valueAt(value, item.path);
    if (item.op === 'gte') assert.ok(typeof found === 'number' && found >= item.value, `${label}:${item.path} below ${item.value}`);
    else if (item.op === 'lte') assert.ok(typeof found === 'number' && found <= item.value, `${label}:${item.path} above ${item.value}`);
    else if (item.op === 'length') assert.equal(found?.length, item.value, `${label}:${item.path} length`);
    else if (item.op === 'truthy') assert.ok(found, `${label}:${item.path} is empty/false`);
    else { assert.ok(item.op === undefined || item.op === 'equal', `Unknown assertion operation ${item.op}`); assert.deepEqual(found, item.value, `${label}:${item.path}`); }
  }
}
let config, metadata;
await check('explicit-final-evidence-inputs', async () => {
  config = await json(configPath); assert.equal(config.version, '0.15.0'); assert.equal(config.final, true);
  assert.ok(config.candidate && config.typecheck && config.systemSeeds && config.naturalDesktop && config.naturalTouch);
  assert.ok(Array.isArray(config.unitReports) && config.unitReports.length);
  assert.ok(Array.isArray(config.evidence) && config.evidence.length);
  for (const required of ['layout', 'offline', 'pressure', 'performance48', 'native-art', 'art-integration'])
    assert.ok(config.evidence.some(item => item.name === required), `Missing required final evidence kind ${required}`);
  return { ...(await evidence(configPath)), note: 'All inputs are explicit paths; historical pilots never satisfy required final slots.' };
});
if (config) {
  metadata = await check('final-candidate-source-and-output-attestation', async () => {
    const path = join(config.candidate, 'build-meta.json'), meta = await json(path);
    assert.equal(meta.version, '0.15.0'); assert.equal(meta.stage, 'G4');
    const count = await manifestMatches(meta.sourceManifest, 'Candidate');
    assert.ok(meta.outputManifest && Object.keys(meta.outputManifest).length);
    for (const [name, expected] of Object.entries(meta.outputManifest)) assert.equal(await sha(join(config.candidate, name)), expected, `Candidate output drift ${name}`);
    for (const name of ['index.html', 'game.js', 'game.css', 'build-meta.json']) await sameBytes(join(config.candidate, name), join(config.dist ?? 'dist', name));
    summary.candidate = local(config.candidate); summary.gameSha256 = meta.outputManifest['game.js']; summary.sourceInputCount = count;
    return meta;
  });
  await check('typecheck', async () => { const report = await json(config.typecheck); assert.equal(report.exitCode, 0); if (report.version) assert.equal(report.version, '0.15.0'); if (report.buildVersion) assert.equal(report.buildVersion, '0.15.0'); return evidence(config.typecheck); });
  await check('final-unit-coverage', async () => {
    const identities = new Map(), reports = [];
    for (const path of config.unitReports) {
      const report = await json(path), cases = report.testResults.flatMap(suite => suite.assertionResults.map(test => ({ file: local(suite.name), ...test })));
      assert.equal(cases.length, report.numTotalTests, `Unit assertion total ${path}`);
      assert.equal(cases.filter(test => test.status === 'passed').length, report.numPassedTests); assert.equal(cases.filter(test => test.status === 'failed').length, report.numFailedTests);
      assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0);
      const occurrences = new Map();
      for (const test of cases) {
        const identity = `${test.file.toLowerCase()}\0${test.fullName}`, ordinal = occurrences.get(identity) ?? 0; occurrences.set(identity, ordinal + 1);
        const key = `${identity}\0${ordinal}`, value = identities.get(key) ?? { file: test.file, fullName: test.fullName, occurrence: ordinal + 1, attempts: [] };
        value.attempts.push({ report: local(path), status: test.status, failureMessages: test.failureMessages ?? [], durationMs: test.duration ?? null });
        value.selected = value.attempts.at(-1); identities.set(key, value);
      }
      reports.push({ ...(await evidence(path)), total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, success: report.success });
    }
    const cases = [...identities.values()]; assert.ok(cases.length > 0); assert.ok(cases.every(item => item.selected.status === 'passed'), 'Unresolved final unit failures');
    const histories = []; for (const path of config.historicalUnitReports ?? []) histories.push(await evidence(path));
    const coverage = { pass: true, method: 'Normalized file/fullName plus ordinal; later targeted attempts replace the matching occurrence only. Historical non-final reports are retained separately.',
      coveredAssertions: cases.length, uniqueIdentities: new Set(cases.map(item => `${item.file}\0${item.fullName}`)).size, reports, historicalReports: histories, cases };
    await writeFile(join(base, 'unit-coverage-final.json'), JSON.stringify(coverage, null, 2));
    return { assertions: cases.length, uniqueIdentities: coverage.uniqueIdentities, reports, historicalReports: histories };
  });
  await check('explicit-bounded-system-seeds', async () => {
    const report = await json(config.systemSeeds); assert.equal(report.complete, true); assert.ok(report.expectedSeeds > 0); assert.equal(report.completedSeeds, report.expectedSeeds);
    if (config.expectedSystemSeeds !== undefined) assert.equal(report.expectedSeeds, config.expectedSystemSeeds);
    assert.ok(!report.firstFailure, 'System seed failure retained');
    assert.equal(report.simulationSourceUnchanged, true, 'System report source drift');
    await manifestMatches(report.simulationSourceManifest, 'System seed inputs', metadata?.sourceManifest, false);
    if (report.replay) assert.equal(report.replay.equal, true); if (report.preparedReplay) assert.equal(report.preparedReplay.equal, true);
    return { ...(await evidence(config.systemSeeds)), completedSeeds: report.completedSeeds, scope: report.coverageScope ?? 'Explicit bounded system regression; do not infer 1000 seeds.' };
  });
  async function natural(path, touch) {
    const report = await json(path); assert.equal(report.pass, true); assert.equal(report.pilot, false, 'A devserver/pilot cannot qualify final completion');
    assert.equal(report.sourcesUnchanged, true); assert.equal(report.outputsUnchanged, true); assert.equal(report.candidateUnchanged, true); assert.deepEqual(report.errors, []);
    assert.ok(metadata, 'Candidate metadata was not verified');
    assert.equal(report.candidateBefore?.version, '0.15.0'); assert.deepEqual(report.candidateBefore?.currentSourceMismatches, []);
    assert.deepEqual(report.candidateBefore?.outputManifest, metadata.outputManifest); assert.equal(report.candidateBefore?.productionInputCount, Object.keys(metadata.sourceManifest).length);
    // Type-only imports are erased by esbuild and therefore are absent from its
    // runtime-input manifest. The natural pilot also hashes this shared type
    // contract; keep checking those bytes without pretending they were emitted.
    const naturalTypeOnlyInputs = ['src/game/territoryTypes.ts'];
    const auxiliaryInputs = Object.keys(report.sourceBefore ?? {}).filter(path => !(local(path) in metadata.sourceManifest));
    for (const path of auxiliaryInputs) assert.ok(naturalTypeOnlyInputs.includes(local(path)), `Unattested natural runtime input ${path}`);
    await manifestMatches(report.sourceBefore, 'Natural input report', metadata.sourceManifest, false); assert.deepEqual(report.sourceBefore, report.sourceAfter);
    for (const name of ['CONSTRUCTION_COMPLETED', 'TERRITORY_DEFENSE_MILESTONE', 'RITUAL_SPAWNED', 'RITUAL_PROJECTILE_INTERCEPTED', 'HEART_BOSS_SECOND_PHASE'])
      assert.ok(report.events?.some(event => event.type === name), `Natural ${touch ? 'touch' : 'desktop'} missing ${name}`);
    for (const lane of ['north', 'south']) assert.ok(report.events.some(event => event.type === 'TERRITORY_HANDOFF_COMPLETED' && event.data.laneId === lane));
    assert.ok(!report.choices?.some(choice => choice.id === 'immune'), 'Guaranteed progression must not depend on random immune upgrades');
    assert.ok(report.maxAlive <= 48 && report.maxReserved <= 48); assert.ok(report.victory?.snapshot && report.construction?.completedAt && report.launch?.landed);
    assert.equal(report.savedAtVictory.runs, 1); assert.equal(report.savedAtVictory.rescues, 1); assert.equal(report.campAtVictory.victories, 1); assert.equal(report.campAtVictory.claimedRewardIds.length, 1);
    assert.equal(report.campAtVictory.activeExpedition, undefined); assert.equal(report.campPrepared.materials, 12); assert.equal(report.campPrepared.equipped, 'piercing');
    assert.equal(report.secondDeparture.expedition.loadout.weaponId, 'piercing'); assert.equal(report.secondDeparture.expedition.loadout.upgrade, 1);
    assert.notEqual(report.secondDeparture.expedition.runId, report.runId); assert.equal(report.secondDeparture.growth.antibodyCharges, 4);
    assert.equal(report.campAfterDeparture.extraAntibodyStock, 0); assert.equal(report.campAfterDeparture.victories, 1); assert.equal(report.campAfterDeparture.claimedRewardIds.length, 1);
    assert.equal(report.campAfterDeparture.activeExpedition.runId, report.secondDeparture.expedition.runId);
    if (touch) {
      assert.ok(/touch|CDP/i.test(report.method), 'Touch method must identify actual input'); assert.equal(report.videoComplete, true); await nonempty(report.video);
      assert.equal(await sha(report.video), report.videoMetadata?.sha256, 'Touch video hash differs');
      assert.equal((await stat(file(report.video))).size, report.videoMetadata?.bytes, 'Touch video size differs');
    }
    return { ...(await evidence(path)), inputMethod: report.method, scope: report.scope, rescueSeconds: report.victory.snapshot.elapsed, maxAlive: report.maxAlive, maxReserved: report.maxReserved,
      runId: report.runId, secondRunId: report.secondDeparture.expedition.runId, lootReceipts: report.campAfterDeparture.claimedRewardIds.length };
  }
  await check('natural-desktop-complete-expedition-and-camp', () => natural(config.naturalDesktop, false));
  await check('natural-touch-complete-expedition-and-camp', () => natural(config.naturalTouch, true));
  if (config.naturalLoot) await check('supplemental-natural-visible-boss-loot', async () => {
    const details = await natural(config.naturalLoot, false), report = await json(config.naturalLoot);
    const shown = report.lootVisible, picked = report.lootPickedUp;
    assert.ok(shown?.loot?.pendingLoot?.id, 'Visible loot must have an actual pending reward');
    assert.equal(shown.loot.pendingLoot.runId, report.runId);
    assert.ok(Number.isFinite(shown.screen?.x) && Number.isFinite(shown.screen?.y), 'Loot must have a recorded screen position');
    assert.ok(shown.liveResiduals?.length >= 1, 'Visible loot is recorded before actual residual combat ends');
    assert.ok(picked?.tick > shown.tick && picked.liveResiduals >= 1, 'Actual pickup precedes residual clearance');
    assert.ok(report.victory.snapshot.atTick > picked.tick, 'Permanent victory settlement must follow provisional pickup');
    assert.equal(report.videoComplete, true); await nonempty(report.video);
    assert.equal(await sha(report.video), report.videoMetadata?.sha256, 'Supplemental loot video hash differs');
    return { ...details, visibleAt: shown.elapsed, pickedUpAt: picked.elapsed, residualsAtDisplay: shown.liveResiduals.length,
      note: 'Independent natural input route, retained alongside the two required final runs; no supplied battle state.' };
  });
  for (const item of config.evidence) await check(item.name, async () => {
    const report = await json(item.path); assertions(report, item.assertions, item.name);
    if (report.errors) assert.deepEqual(report.errors, []); if (report.sourcesUnchanged !== undefined) assert.equal(report.sourcesUnchanged, true);
    if (report.sourceUnchanged !== undefined) assert.equal(report.sourceUnchanged, true);
    if (item.name === 'pressure') {
      const cases = report.cases?.filter(entry => entry.rank === 3 && entry.rounds === 1);
      assert.equal(cases?.length, 10); assert.ok(cases.filter(entry => entry.held).length >= 8); assert.ok(cases.filter(entry => entry.handoff).length >= 8);
      assert.ok(cases.every(entry => entry.realBites > 0)); assert.ok(cases.every(entry => entry.garrisonDamage > 0));
      const stated = report.summary ?? report.matureSingle;
      assert.equal(stated.total, cases.length); assert.equal(stated.held, cases.filter(entry => entry.held).length);
      assert.equal(stated.handoffs, cases.filter(entry => entry.handoff).length);
    }
    if (item.name === 'performance48') {
      assert.equal(report.version, '0.15.0'); assert.equal(report.groups?.length, 4);
      assert.ok(metadata, 'Candidate metadata was not verified');
      assert.equal(resolve(report.candidate), resolve(config.candidate)); assert.deepEqual(report.releaseOutputs, metadata.outputManifest);
      assert.equal(report.sourceUnchanged, true); await manifestMatches(report.sourceBefore, 'Performance48 inputs', metadata.sourceManifest, false);
      for (const input of report.sourceComparison ?? []) { assert.equal(input.matches, true, input.path); assert.equal(input.actual, input.candidate, input.path); }
      for (const group of report.groups) {
        assert.equal(group.pass, true); assert.ok(group.wallSeconds >= 15); assert.equal(group.finalPhase, 'playing');
        for (const key of ['minimumAlive', 'maximumAlive', 'minimumReserved', 'maximumReserved']) assert.equal(group[key], 48, `${group.id}:${key}`);
        assert.ok(group.metrics?.averageFps >= 50 && group.metrics.p95Ms <= 33.3);
      }
    }
    if (item.name === 'layout') {
      const identity = report.identityBefore ?? report.identity;
      assert.equal(identity?.version, '0.15.0'); assert.deepEqual(identity?.outputs, metadata?.outputManifest);
      assert.equal(identity?.mobileHash ?? identity?.mobileSha, await sha('releases/Viral-Invasion-Mobile.html'));
      if (report.identityBefore) { assert.equal(report.candidateUnchanged, true); assert.deepEqual(report.identityBefore, report.identityAfter); }
      assert.ok(report.cases?.length >= 8);
      for (const scenario of report.cases) {
        assert.equal(scenario.pass, true, scenario.id); assert.deepEqual(scenario.errors, []); assert.deepEqual(scenario.remoteRequests, []);
        if (scenario.touch) { assert.ok(scenario.controls.every(control => control.width >= 48 && control.height >= 48)); assert.ok(scenario.minimumGap >= 8); }
      }
    }
    if (item.name === 'art-integration') { assert.equal(report.selected, true); assert.equal(report.inspectedFrames, 74); assert.equal(report.preservedExistingSprites, 204); }
    for (const key of item.sourceManifestFields ?? []) await manifestMatches(valueAt(report, key), `${item.name}:${key}`, metadata?.sourceManifest, !item.permitAuxiliarySources);
    for (const path of item.artifacts ?? []) await nonempty(path);
    return { ...(await evidence(item.path)), scope: item.scope ?? report.scope ?? report.method, assertions: item.assertions, artifacts: await Promise.all((item.artifacts ?? []).map(evidence)) };
  });
  await check('art-runtime-budget-and-frozen-sources', async () => {
    const path = config.artRuntime ?? '.art-generated/art-runtime.json', bytes = await readFile(file(path)), runtime = JSON.parse(bytes.toString('utf8'));
    assert.ok(bytes.length <= 20 * 1024 * 1024, `Art runtime ${bytes.length} exceeds unchanged 20MiB limit`);
    const selected = Object.entries(runtime.assets).filter(([id]) => id.startsWith('fantasy.expedition.')); assert.equal(selected.length, 74);
    for (const [id, asset] of selected) { assert.equal(asset.animation?.approved, true, `Unreviewed native asset ${id}`); assert.equal(asset.touchesSourceEdge, false, `Source edge ${id}`); }
    const frozen = await json(config.frozenSources);
    assert.ok(Array.isArray(frozen) && frozen.length >= 204, 'Frozen source baseline must cover all old 204 sprites');
    const selection = await json('asserts/art-selection.json');
    for (const old of frozen) {
      const current = selection.sprites.find(asset => asset.id === old.id); assert.ok(current, `Lost frozen selection ${old.id}`);
      assert.equal(digest(JSON.stringify(current)), old.selectionEntrySha256, `Frozen selection changed ${old.id}`);
      assert.equal(await sha(join('asserts', current.source)), old.sourceSha256, `Frozen pixels changed ${old.id}`);
    }
    return { ...(await evidence(path)), runtimeBytes: bytes.length, newFrames: selected.length, preservedOldSprites: frozen.length };
  });
  await check('release-files-and-independent-zip-bytes', async () => {
    assert.ok(Array.isArray(config.releaseFiles) && config.releaseFiles.length >= 5, 'Explicit release path/hash list required');
    const files = [];
    for (const entry of config.releaseFiles) { await nonempty(entry.path); assert.equal(await sha(entry.path), entry.sha256, `Released file drift ${entry.path}`); if (entry.equals) await sameBytes(entry.path, entry.equals); files.push(await evidence(entry.path)); }
    const require = createRequire(import.meta.url), { yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
    assert.ok(Array.isArray(config.zipContents) && config.zipContents.length >= 2, 'Both desktop and mobile ZIP contents must be verified');
    for (const zip of config.zipContents) {
      await new Promise((done, fail) => yauzl.open(file(zip.path), { lazyEntries: true }, (error, archive) => {
        if (error) { fail(error); return; }
        const seen = new Set(); archive.on('error', fail);
        archive.on('entry', entry => {
          if (!(entry.fileName in zip.files)) { archive.readEntry(); return; }
          archive.openReadStream(entry, (streamError, stream) => {
            if (streamError) { archive.close(); fail(streamError); return; }
            (async () => {
              const chunks = []; for await (const chunk of stream) chunks.push(chunk);
              assert.ok(Buffer.concat(chunks).equals(await readFile(file(zip.files[entry.fileName]))), `ZIP contents differ ${zip.path}:${entry.fileName}`);
              assert.ok(!seen.has(entry.fileName), `Duplicate ZIP entry ${entry.fileName}`); seen.add(entry.fileName); archive.readEntry();
            })().catch(failure => { archive.close(); fail(failure); });
          });
        });
        archive.on('end', () => { try { assert.equal(seen.size, Object.keys(zip.files).length, `Missing declared ZIP entries ${zip.path}`); done(); } catch (failure) { fail(failure); } });
        archive.readEntry();
      }));
    }
    return { files, zips: config.zipContents.map(zip => ({ path: local(zip.path), verifiedEntries: Object.keys(zip.files) })) };
  });
}
summary.finishedAt = new Date().toISOString(); summary.failedChecks = summary.checks.filter(item => !item.pass).map(item => item.name);
summary.pass = summary.checks.length > 0 && summary.failedChecks.length === 0;
await mkdir(base, { recursive: true }); await writeFile(join(base, 'verification-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, checks: summary.checks.length, failedChecks: summary.failedChecks, report: local(join(base, 'verification-summary.json')) }));
if (!summary.pass) process.exitCode = 1;
