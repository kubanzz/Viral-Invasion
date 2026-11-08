import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeMobileHtml } from './package-mobile.mjs';

// Read-only evidence aggregation: no build, art synchronization, browser, ZIP
// extraction, source mutation or package rewriting happens in this script.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const input = {
  units: option('--units') ?? 'artifacts/blade-surge-v022/final/unit.json',
  typecheck: option('--typecheck') ?? 'artifacts/blade-surge-v022/final/typecheck.json',
  balance: option('--balance') ?? 'artifacts/blade-surge-v022/balance/report.json',
  browser: option('--browser') ?? 'artifacts/blade-surge-v022/final/browser/report.json',
  pressure: option('--pressure') ?? 'artifacts/blade-surge-v022/pressure/report.json',
  offline: option('--offline') ?? 'artifacts/blade-surge-v022/final/offline/report.json',
  desktop: option('--desktop') ?? 'artifacts/releases/v0.22.0/release-package.json',
  mobile: option('--mobile') ?? 'artifacts/blade-surge-v022/final/mobile-package.json',
};
const buildDirectory = resolve(root, option('--build') ?? '.tools/blade-surge-v022-final');
const verifiedDirectory = resolve(root, option('--verified') ?? '.tools/release-v0.22.0-verified');
const mobileDirectory = resolve(root, option('--phone') ?? 'releases/Viral-Invasion-Mobile-v0.22.0');
const destination = resolve(root, option('--out') ?? 'artifacts/blade-surge-v022/final/verification-summary.json');
const allowedExternalUi = new Set(['src/ui/campEquipment.css', 'src/ui/campEquipmentHud.ts']);
const posix = value => value.replaceAll('\\', '/');
const local = path => posix(relative(root, path));
const absolute = path => {
  const value = /^file:/i.test(path) ? fileURLToPath(path) : path;
  const pathValue = resolve(root, value), inside = relative(root, pathValue);
  assert(inside && inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside), 'Evidence path escapes workspace: ' + path);
  return pathValue;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(absolute(path), 'utf8'));
const validHash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
async function receipt(path) {
  const target = absolute(path), hash = createHash('sha256');
  for await (const bytes of createReadStream(target)) hash.update(bytes);
  return { path: local(target), bytes: (await stat(target)).size, sha256: hash.digest('hex') };
}
async function verifyFile(path, expected, bytes) {
  assert(validHash(expected), 'Invalid expected SHA256 for ' + path);
  const result = await receipt(path);
  assert.equal(result.sha256, expected, 'Hash mismatch: ' + path);
  if (bytes !== undefined) assert.equal(result.bytes, bytes, 'Byte count mismatch: ' + path);
  return result;
}
const reports = {}, result = { version: '0.22.0', completedAt: null, pass: false, evidence: {}, checks: {}, failures: [] };
const check = (name, details = true) => { result.checks[name] = details; };

async function validateManifest(manifest, label, { externalUi = false, metadata } = {}) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), label + ' has no source manifest');
  const files = Object.entries(manifest), differences = [];
  for (let offset = 0; offset < files.length; offset += 8) {
    await Promise.all(files.slice(offset, offset + 8).map(async ([path, expected]) => {
      assert(validHash(expected), label + ' invalid SHA256: ' + path);
      if (metadata && Object.hasOwn(metadata, posix(path))) assert.equal(expected, metadata[posix(path)], label + ' disagrees with packaged source: ' + path);
      const current = await receipt(path);
      if (current.sha256 !== expected) {
        if (!externalUi || !allowedExternalUi.has(posix(path))) assert.fail(label + ' current source differs: ' + path);
        differences.push({ path: posix(path), packagedSha256: expected, currentSha256: current.sha256,
          scope: 'External equipment UI work; excluded from the released immutable candidate. No full-workspace equality claim.' });
      }
    }));
  }
  return { count: files.length, differences: differences.sort((a, b) => a.path.localeCompare(b.path)) };
}

async function verifyFrozenMap(map, label, expected) {
  assert(map && Object.keys(map).length >= 2, label + ' missing immutable output hashes');
  const found = new Set();
  for (const [path, hash] of Object.entries(map)) {
    const target = absolute(path), name = basename(target);
    assert(expected.has(target), label + ' refers to a different release file: ' + path);
    assert.equal(hash, expected.get(target), label + ' differs from the release output: ' + path);
    await verifyFile(target, hash); found.add(name);
  }
  assert(found.has('index.html') && found.has('game.js'), label + ' must bind index.html and game.js');
}

async function verifyArchive(path, expectedFiles) {
  const require = createRequire(import.meta.url);
  const { yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
  const actual = [];
  await new Promise((done, reject) => {
    yauzl.open(absolute(path), { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const seen = new Set(); archive.on('error', reject);
      archive.on('entry', entry => {
        (async () => {
          assert(expectedFiles.has(entry.fileName) && !seen.has(entry.fileName), 'Unexpected or repeated ZIP entry: ' + entry.fileName);
          seen.add(entry.fileName);
          const stream = await new Promise((accept, fail) => archive.openReadStream(entry, (error, stream) => error ? fail(error) : accept(stream)));
          const parts = []; for await (const part of stream) parts.push(part);
          const bytes = Buffer.concat(parts), expected = expectedFiles.get(entry.fileName);
          assert(bytes.equals(expected), 'Independently decoded ZIP bytes differ: ' + entry.fileName);
          actual.push({ name: entry.fileName, bytes: bytes.length, sha256: sha(bytes) }); archive.readEntry();
        })().catch(error => { archive.close(); reject(error); });
      });
      archive.on('end', () => {
        try { assert.equal(seen.size, expectedFiles.size, 'ZIP entries missing'); done(); } catch (error) { reject(error); }
      });
      archive.readEntry();
    });
  });
  return actual;
}

try {
  for (const [name, path] of Object.entries(input)) { reports[name] = await json(path); result.evidence[name] = await receipt(path); }
  const metadataPath = join(buildDirectory, 'build-meta.json'), metadata = await json(metadataPath);
  assert.equal(metadata.version, result.version); assert.equal(metadata.format, 'iife'); assert(metadata.browserTargets.includes('safari17.6'));
  const metadataReceipt = await receipt(metadataPath);
  result.build = { metadata: metadataReceipt, version: metadata.version, stage: metadata.stage, targets: metadata.browserTargets };
  const required = ['src/main.ts', 'src/audio.ts', 'src/game/bladeTechniques.ts',
    'src/game/weaponSkills.ts', 'src/game/weaponMelee.ts', 'src/game/weaponUltimates.ts', 'src/game/session.ts',
    'src/game/campWeaponTrial.ts', 'src/game/motherCore.ts', 'src/input/controller.ts', 'src/input/touchControls.ts',
    'src/render/bladeCinematic.ts', 'src/render/bladeUltimateVfx.ts', 'src/render/bladeAnimationClips.ts',
    'src/render/weaponUltimateVisuals.ts', 'src/render/player3D.ts', 'src/render/player3DMotion.ts',
    'src/render/heldWeapons3D.ts', 'src/render/canvasScene.ts', 'src/render/phaserRenderer.ts', 'src/ui/campWeaponTrial.ts',
    'src/ui/sanctum.css', 'src/ui/constructionHud.ts', 'asserts/ViralInvasion_BladeMotion_v022/bladeMotion.ts',
    'asserts/ViralInvasion_BladeMotion_v022/delivery.json'];
  for (const path of required) assert(validHash(metadata.sourceManifest?.[path]), 'Packaged skill input is unattested: ' + path);
  const currentSources = await validateManifest(metadata.sourceManifest, 'Packaged source manifest', { externalUi: true });
  result.sources = { packagedSourceValidationAtPackaging: true, currentManifestCount: currentSources.count,
    requiredSkillFiles: required, allPackagedGameRenderInputAudioSkillSourcesMatchCurrent: true,
    externalUiDifferences: currentSources.differences, allAttestedSourcesMatchCurrentWorkspace: currentSources.differences.length === 0,
    completeWorkspaceEqualityClaimed: false,
    statement: currentSources.differences.length ? 'The immutable release matches all attested sources except the explicitly listed external equipment UI work. Current workspace is not identical to the release.'
      : 'Every source attested by the build metadata matches the current workspace; untracked or unattested files are outside this statement.' };
  check('packagedSkillSourcesMatchCurrent');
  const outputs = {};
  for (const name of ['index.html', 'game.js', 'game.css']) outputs[name] = await verifyFile(join(buildDirectory, name), metadata.outputManifest[name]);
  result.build.outputs = outputs;
  await verifyFile(join(verifiedDirectory, 'build-meta.json'), metadataReceipt.sha256, metadataReceipt.bytes);
  const desktop = reports.desktop, mobile = reports.mobile;
  assert.equal(desktop.version, metadata.version); assert.equal(desktop.stage, metadata.stage); assert(desktop.staticPass && desktop.sourceValidation?.pass);
  assert.equal(desktop.sourceValidation.count, currentSources.count); assert.equal(absolute(desktop.verifiedFolder), verifiedDirectory);
  assert.equal(mobile.version, metadata.version); assert(mobile.sourceValidation?.pass && mobile.outputValidation?.pass);
  assert.equal(mobile.sourceValidation.count, currentSources.count); assert.equal(mobile.outputValidation.count, 3);
  assert.equal(dirname(absolute(mobile.html)), mobileDirectory); assert.equal(dirname(absolute(mobile.zip)), mobileDirectory);
  const desktopFiles = new Map();
  assert.deepEqual(desktop.files.map(file => file.name).sort(), ['README.txt', 'Open-Game.cmd', 'build-meta.json', 'game.js', 'index.html'].sort());
  for (const file of desktop.files) {
    const extracted = await verifyFile(join(verifiedDirectory, file.name), file.sha256, file.bytes);
    await verifyFile(join(dirname(absolute(desktop.zip)), `Viral-Invasion-${metadata.stage}-v${metadata.version}`, file.name), extracted.sha256, extracted.bytes);
    if (Object.hasOwn(outputs, file.name)) assert.equal(file.sha256, outputs[file.name].sha256, 'Extracted file differs from build output: ' + file.name);
    if (file.name === 'build-meta.json') assert.equal(file.sha256, metadataReceipt.sha256);
    desktopFiles.set(file.name, await readFile(join(verifiedDirectory, file.name)));
  }
  const desktopZip = await verifyFile(desktop.zip, desktop.sha256, desktop.bytes);
  const desktopDecoded = await verifyArchive(desktop.zip, desktopFiles);
  const mobileFiles = new Map();
  assert.deepEqual(mobile.files.map(file => file.name).sort(), ['Viral-Invasion-Mobile.html', '手机试玩说明.txt'].sort());
  for (const file of mobile.files) {
    // The phone ZIP includes instructions copied verbatim from the attested
    // Markdown. The release directory deliberately exposes only HTML and ZIP.
    const source = file.name === '手机试玩说明.txt' ? 'Docs/ViralInvasion_Mobile_Playtest.md' : join(mobileDirectory, file.name);
    await verifyFile(source, file.sha256, file.bytes);
    mobileFiles.set(file.name, await readFile(absolute(source)));
  }
  const composed = composeMobileHtml(await readFile(join(buildDirectory, 'index.html'), 'utf8'), await readFile(join(buildDirectory, 'game.js'), 'utf8'));
  assert(mobileFiles.get('Viral-Invasion-Mobile.html').equals(Buffer.from(composed)), 'Phone HTML is not the exact packaged build composition');
  const phoneHtml = await verifyFile(mobile.html, mobile.htmlSha256, mobile.htmlBytes);
  const phoneZip = await verifyFile(mobile.zip, mobile.zipSha256, mobile.zipBytes);
  const phoneDecoded = await verifyArchive(mobile.zip, mobileFiles);
  result.packages = { desktopZip, desktopDecoded, independentlyExtractedDirectory: local(verifiedDirectory),
    phoneHtml, phoneZip, phoneDecoded, phoneHtmlExactlyComposedFromFrozenBuild: true };
  check('allPackageEntriesHashesAndIndependentDecodedBytes');

  const frozen = new Map([['index.html', outputs['index.html'].sha256], ['game.js', outputs['game.js'].sha256], ['build-meta.json', metadataReceipt.sha256]]
    .map(([name, hash]) => [join(verifiedDirectory, name), hash]));
  const units = reports.units;
  assert(units.success && units.numFailedTests === 0 && units.numPendingTests === 0 && units.numPassedTests === units.numTotalTests);
  assert(units.testResults.length >= 230 && units.numPassedTests >= 2370, 'Final full unit suite is incomplete');
  assert(units.testResults.every(file => file.status === 'passed' && file.assertionResults.every(test => test.status === 'passed')));
  const presentationTests = units.testResults.find(file => posix(file.name).endsWith('/tests/unit/blade-presentation.test.ts'));
  assert(presentationTests?.assertionResults.some(test => test.status === 'passed' && test.fullName.includes('clears a receipt-driven finish on death, scene changes and reset')),
    'Receipt-driven finisher lifecycle unit coverage is missing');
  result.units = { scope: 'Regular unit suite; the separate 1000-seed qualification is not claimed here.',
    files: units.testResults.length, passed: units.numPassedTests, failed: 0, pending: 0, receiptDrivenFinisherLifecyclePassed: true };
  const balance = reports.balance;
  assert(balance.pass && balance.sourceStable && balance.exitCode === 0 && balance.tests?.passed >= 65 && balance.tests.failed === 0);
  await validateManifest(balance.hashes, 'Balance measurement', { metadata: metadata.sourceManifest });
  assert(balance.redbladeStoredUltimateRatioToBestPurple >= 1.25 && balance.redbladeStoredUltimateRatioToBestPurple <= 1.55);
  result.balance = { tests: balance.tests, contract: balance.contract, measurements: balance.measurements,
    redbladeStoredUltimateRatioToBestPurple: balance.redbladeStoredUltimateRatioToBestPurple, sourcesMatchPackagedBuild: true };
  check('fullUnitsAndBalancedDamageEvidence');

  const browser = reports.browser;
  assert(browser.pass && browser.cases.length === 6 && browser.errors.length === 0);
  assert.equal(absolute(browser.entry), join(verifiedDirectory, 'index.html'));
  await verifyFrozenMap(browser.packageBefore, 'Browser immutable input', frozen);
  await verifyFrozenMap(browser.packageAfter, 'Browser immutable output', frozen);
  await validateManifest(browser.sourceBefore, 'Browser starting skill sources', { metadata: metadata.sourceManifest });
  await validateManifest(browser.sourceAfter, 'Browser final skill sources', { metadata: metadata.sourceManifest });
  const typecheck = reports.typecheck;
  assert(typecheck.pass && typecheck.exitCode === 0 && typecheck.sourceUnchanged === true
    && typecheck.command === 'node node_modules/typescript/bin/tsc --noEmit',
    'Final TypeScript compilation did not pass');
  assert(Number.isFinite(Date.parse(typecheck.startedAt)) && Number.isFinite(Date.parse(typecheck.completedAt)), 'Typecheck timestamps missing');
  assert(typecheck.sourceManifest?.['src/render/player3DMotion.ts'], 'Final typecheck must attest the repaired motion source');
  await validateManifest(typecheck.sourceManifest, 'Final TypeScript compilation sources', { metadata: metadata.sourceManifest });
  const typeOnlyPaths = ['src/game/weaponSkillsTypes.ts'];
  result.typeOnlySourcesEvidence = [];
  for (const path of typeOnlyPaths) {
    const current = await receipt(path), expected = balance.hashes[path];
    assert(validHash(expected), 'Balance report must attest pure type definitions: ' + path);
    assert.equal(current.sha256, expected, 'Current type-only source differs from measured definitions: ' + path);
    assert.equal(browser.sourceBefore[path], expected, 'Browser starting definitions differ: ' + path);
    assert.equal(browser.sourceAfter[path], expected, 'Browser final definitions differ: ' + path);
    assert.equal(typecheck.sourceManifest[path], expected, 'Final tsc compiled different definitions: ' + path);
    if (metadata.sourceManifest[path]) assert.equal(metadata.sourceManifest[path], expected, 'Build metadata definitions differ: ' + path);
    result.typeOnlySourcesEvidence.push({ ...current, buildMetadataAttested: !!metadata.sourceManifest[path], runtimeArtifactInput: false,
      balanceAndBrowserBeforeAfterAndCurrentHashesEqual: true, finalTscHashEqual: true,
      evidence: ['balance', 'browser', 'typecheck', 'units'],
      statement: 'Type-only declarations are erased by esbuild. This is independently hash-bound source/test/tsc evidence, not a claim that the file is present in runtime build metadata.' });
  }
  result.typecheck = { pass: true, exitCode: 0, command: typecheck.command, startedAt: typecheck.startedAt,
    completedAt: typecheck.completedAt, sourceCount: Object.keys(typecheck.sourceManifest).length,
    sourceUnchanged: true, evidence: result.evidence.typecheck,
    log: await receipt(join(dirname(absolute(input.typecheck)), 'typecheck.log')) };
  check('typeOnlyDefinitionsAndFinalTscCompilation');
  const browserCases = [];
  for (const width of [1366, 844, 667]) for (const mode of ['standard', 'low']) {
    const item = browser.cases.find(item => item.width === width && item.mode === mode);
    assert(item?.pass && item.pageErrors.length === 0 && item.sequences.length === 3, 'Missing final browser case: ' + width + '/' + mode);
    for (const label of ['manual', 'timeout', 'draw-detail']) assert(item.sequences.some(sequence => sequence.label === label && sequence.final));
    assert(Math.abs(item.pause.delta) < .15 && item.cancelPhase === 'drawing');
    browserCases.push({ width, height: item.height, touch: item.touch, mode, sequences: item.sequences.map(sequence => sequence.label),
      screenshots: item.screenshots.length, video: item.video, backgroundSimulationDelta: item.pause.delta, pass: true });
  }
  assert(browser.naturalBattle, 'Natural-charge battle supplement is missing');
  const naturalPath = browser.naturalBattle.report ?? join(dirname(absolute(input.browser)), 'natural-battle/report.json');
  const natural = await json(naturalPath);
  result.evidence.naturalBattle = await receipt(naturalPath);
  if (browser.naturalBattle.sha256) assert.equal(result.evidence.naturalBattle.sha256, browser.naturalBattle.sha256, 'Supplied natural battle report changed');
  assert(natural.cases.length === 1 && natural.cases[0].width === 844 && natural.cases[0].pass);
  const naturalCase = natural.cases[0];
  assert(naturalCase.result?.manual && naturalCase.result.accidentalPrimary === 0 && naturalCase.result.energy === 0 && naturalCase.result.drawingMovement > 4);
  assert(naturalCase.result.kills.length > 0 && naturalCase.pageErrors.length === 0 && naturalCase.surgeSequence);
  const castId = naturalCase.cast?.castId, settle = naturalCase.surgeSequence.finishSettleProbe;
  const activeSettle = settle?.samples?.filter(sample => sample.clip === 'Blade_FinishSettle_v022') ?? [];
  assert(castId && natural.verifyFinishSettle && settle?.receipt?.type === 'BLADE_TRACE_FINISHED'
    && settle.receipt.data.castId === castId && settle.cleared && activeSettle.length > 0,
  'Natural battle must verify the receipt-driven real full-body finisher');
  assert(activeSettle.every(sample => Number.isFinite(sample.poseTime)), 'Missing actual rendered finisher pose timestamps');
  assert(activeSettle.at(-1).poseTime - activeSettle[0].poseTime >= .20, 'Finisher observations do not span the authored recovery action');
  assert(Math.abs(Number(settle.receipt.data.until) - settle.receipt.tick / 60 - .30) < .035, 'Finisher receipt must own a .30s recovery');
  assert(activeSettle.at(-1).poseTime <= Number(settle.receipt.data.until) + .06, 'Finisher did not clean up within its authored interval');
  const earlyCleanupSamples = settle.samples.filter(sample => sample.tracePhase === null
    && Number.isFinite(sample.elapsed) && sample.elapsed < Number(settle.receipt.data.until) - 1e-6);
  const earlyCleanupObserved = earlyCleanupSamples.length > 0;
  if (earlyCleanupObserved) assert(earlyCleanupSamples.some(sample => sample.clip === 'Blade_FinishSettle_v022'),
    'Observed early trace cleanup discarded the authored full-body finisher');
  if (typeof settle.earlyCleanupObserved === 'boolean') assert.equal(settle.earlyCleanupObserved, earlyCleanupObserved,
    'Finisher early-cleanup classification disagrees with its raw samples');
  const impacts = (naturalCase.events ?? []).filter(event => event.type === 'BLADE_TRACE_IMPACT' && event.data.castId === castId);
  assert.equal(new Set(impacts.map(event => event.data.mark)).size, 4, 'Natural battle did not reach all four real landing marks');
  if (!natural.pass) assert(browser.naturalBattle.frozenFileSourceDriftOnly && natural.errors.length > 0
    && natural.errors.every(error => error.includes('supplied Vite candidate changed during input verification')), 'Natural battle failed for a gameplay reason');
  await verifyFrozenMap(natural.candidate.frozenFilesBefore, 'Natural battle immutable input', frozen);
  // A source-drift assertion may precede the child harness's final output hash
  // capture. The enclosing browser report still attests the same immutable files.
  if (natural.candidate.frozenFilesAfter) await verifyFrozenMap(natural.candidate.frozenFilesAfter, 'Natural battle immutable output', frozen);
  await validateManifest(natural.candidate.sourceManifest, 'Natural battle sources', { metadata: metadata.sourceManifest });
  if (natural.candidate.sourceAfter) await validateManifest(natural.candidate.sourceAfter, 'Natural battle final sources', { metadata: metadata.sourceManifest });
  result.browser = { cases: browserCases, sourceStable: browser.sourceStable, immutablePackageVerified: true,
    naturalBattle: { result: naturalCase.result, surgeSequenceObserved: true, workspaceSourceDriftOnly: !!browser.naturalBattle.frozenFileSourceDriftOnly,
      independentFinisher: { castId, clip: 'Blade_FinishSettle_v022', receipt: settle.receipt,
        actualPoseSamples: activeSettle.length, postTraceCleanupSamples: activeSettle.filter(sample => sample.tracePhase === null).length,
        earlyCleanupObserved, earlyTraceCleanupSamples: earlyCleanupSamples.length,
        independentReceiptEvidence: earlyCleanupObserved ? 'Actual browser samples show the full-body finisher after early trace cleanup; unit lifecycle tests also pass.'
          : 'This natural battle retained its trace through normal recovery. Independent receipt behavior on early cleanup is verified by the passed unit lifecycle tests; early cleanup is not claimed as observed browser behavior.',
        firstPoseTime: activeSettle[0].poseTime, lastPoseTime: activeSettle.at(-1).poseTime,
        coveredPoseSeconds: activeSettle.at(-1).poseTime - activeSettle[0].poseTime, restoredLocomotion: settle.cleared },
      distinctLandingMarks: [...new Set(impacts.map(event => event.data.mark))].sort() } };
  check('sixInputCasesAndNaturalChargeAgainstImmutablePackage');
  check('receiptDrivenFullBodyFinisherLifecycleAndObservedTiming');

  const offline = reports.offline;
  assert(offline.pass && offline.version === metadata.version && offline.cases.length === 6);
  const offlineExpected = new Map([...frozen, [absolute(mobile.html), phoneHtml.sha256]]);
  for (const [path, expected] of Object.entries(offline.artifactHashes)) {
    assert.equal(expected, offlineExpected.get(absolute(path)), 'Offline smoke used a different packaged file: ' + path);
    await verifyFile(path, expected);
  }
  for (const path of [join(verifiedDirectory, 'index.html'), join(verifiedDirectory, 'game.js'), absolute(mobile.html)])
    assert.equal(offline.artifactHashes[path], offlineExpected.get(path), 'Offline smoke did not bind ' + path);
  for (const channel of ['chrome', 'msedge']) for (const width of [1366, 844, 667]) {
    const item = offline.cases.find(item => item.channel === channel && item.viewport.width === width);
    assert(item?.pass && item.errors.length === 0 && item.externalRequests.length === 0 && item.ticks > 0);
    assert.equal(item.packagedMobile, width !== 1366); assert.equal(item.artSignature, metadata.art.inputSignature);
    assert.deepEqual([...item.clips].sort(), [...metadata.player3D.authoredBladeClips].sort());
  }
  result.offline = { cases: 6, channels: ['chrome', 'msedge'], networkDisabled: true, exactPackageHashesVerified: true,
    physicalPhoneVerified: false };
  check('sixOfflineStartupAndMovementCases');

  const pressure = reports.pressure;
  assert(pressure.pass && pressure.acceptanceEligible && pressure.fingerprints.after.unchanged && pressure.fingerprints.afterBundle.unchanged && pressure.bundleUnchanged);
  assert(pressure.secondsPerMode >= 30 && pressure.cases.length === 2 && pressure.performanceThresholdApplied === false);
  assert.deepEqual([...pressure.modes].sort(), ['low', 'standard']);
  const pressureManifest = Object.fromEntries(pressure.fingerprints.before.files.map(file => [posix(file.path), file.sha256]));
  const signature = sha([...pressure.fingerprints.before.files].map(file => file.path + ':' + file.sha256).join('\n'));
  assert.equal(signature, pressure.fingerprints.before.sha256, 'Pressure dependency fingerprint content mismatch');
  assert.equal(pressure.fingerprints.after.sha256, signature); assert.equal(pressure.fingerprints.afterBundle.sha256, signature);
  await validateManifest(pressureManifest, 'Pressure dependency fingerprint', { metadata: metadata.sourceManifest });
  for (const path of pressure.dependencies) assert.equal(pressureManifest[posix(path)], metadata.sourceManifest[posix(path)], 'Pressure dependency is not the packaged version: ' + path);
  const pressureFolder = dirname(absolute(input.pressure));
  await verifyFile(join(pressureFolder, 'fixture.js'), pressure.bundleSha256);
  await verifyFile(join(pressureFolder, 'measurement-script.mjs'), pressure.harnessSha256);
  await verifyFile('scripts/verify-blade-pressure-v022.mjs', pressure.harnessSha256);
  result.pressure = { scope: pressure.scope, performanceInterpretation: pressure.performanceInterpretation, device: pressure.device,
    acceptanceEligible: true, sourceAndBundleStable: true, sourceMatchesPackagedDependencies: true, performanceThresholdApplied: false, cases: [] };
  for (const mode of ['standard', 'low']) {
    const item = pressure.cases.find(item => item.mode === mode), details = item?.details;
    assert(item?.pass && item.errors.length === 0 && item.remoteRequests.length === 0 && details.error === null);
    assert(details.seconds >= 30 && details.min.living === 48 && details.max.living === 48 && details.max.reserved <= 48 && details.max.weaponProjectiles <= 192);
    assert(details.min.legions === 2 && details.max.legions === 2 && details.min.seraph === 4 && details.casts >= 2 && !details.bossDefeated);
    assert.deepEqual(details.stages, [1, 2, 3]);
    assert(details.preserveStageThree && Number.isFinite(details.preservationStartedAt));
    for (const phase of ['drawing', 'windup', 'executing', 'recovery']) assert(details.tracePhases.includes(phase));
    for (const phase of ['focus', 'eyes-open', 'draw']) assert(details.renderedEvidence.cinematicPhases.includes(phase));
    for (const clip of ['Blade_ChargeDraw_v022', 'Blade_FourfoldDash_v020', 'Blade_FinishSettle_v022']) assert(details.renderedEvidence.fullBodyClips.includes(clip));
    assert(item.frameIntervals.count > 0 && Number.isFinite(item.frameIntervals.p95Ms) && item.duringUltimateFrameIntervals.count > 0);
    result.pressure.cases.push({ mode, wallSeconds: details.seconds, simulationSeconds: details.simulationSeconds,
      frameIntervals: item.frameIntervals, duringUltimateFrameIntervals: item.duringUltimateFrameIntervals,
      phaseFrameIntervals: item.phaseFrameIntervals, updateTimes: item.updateTimes, renderTimes: item.renderTimes,
      min: details.min, max: details.max, stages: details.stages, casts: details.casts,
      forcedRecharges: details.forcedRecharges, preservationStartedAt: details.preservationStartedAt,
      renderedEvidence: details.renderedEvidence, memory: item.memory, pass: true });
  }
  check('twoThirtySecondRenderedPressureModesWithoutFpsClaim');

  const runtimePath = '.art-generated/art-runtime.json', runtime = await json(runtimePath), runtimeReceipt = await receipt(runtimePath);
  assert.equal(runtime.inputSignature, metadata.art.inputSignature); assert.equal(runtimeReceipt.bytes, metadata.art.runtimeBytes);
  assert(runtimeReceipt.bytes < 32 * 1024 * 1024, 'Runtime artwork exceeds the 32 MiB ceiling');
  assert.equal(runtime.selectionSha256, metadata.art.selectionSha256); assert.equal(runtime.pipelineSha256, metadata.art.pipelineSha256);
  const prior = await json('.tools/release-v0.21.0-verified/build-meta.json');
  const pngSources = Object.entries(metadata.sourceManifest).filter(([path]) => path.endsWith('.png'));
  assert.equal(pngSources.length, 393);
  for (const [path, hash] of pngSources) assert.equal(hash, prior.sourceManifest[path], 'Selected PNG changed since v0.21: ' + path);
  assert.deepEqual(metadata.art.atlases, prior.art.atlases); assert.deepEqual(metadata.art.environments, prior.art.environments);
  assert.equal(metadata.art.selectionSha256, prior.art.selectionSha256); assert.equal(metadata.art.pipelineSha256, prior.art.pipelineSha256);
  result.art = { selectedPngSources: pngSources.length, selectedPngBytesUnchangedFromV021: true, atlasAndEnvironmentMetadataUnchangedFromV021: true,
    inputSignature: metadata.art.inputSignature, previousInputSignature: prior.art.inputSignature,
    inputSignatureUnchanged: metadata.art.inputSignature === prior.art.inputSignature,
    runtimeBytes: runtimeReceipt.bytes, previousRuntimeBytes: prior.art.runtimeBytes, budgetBytes: 32 * 1024 * 1024,
    statement: '393 selected PNG source hashes, generated atlas/environment metadata, selection hash and pipeline hash match v0.21. Runtime metadata signature and byte size are reported independently and may change for unselected candidate inventory.' };
  const deliveryPath = 'asserts/ViralInvasion_BladeMotion_v022/delivery.json', delivery = await json(deliveryPath), motionFolder = dirname(absolute(deliveryPath));
  const motion = await verifyFile(join(motionFolder, delivery.module.path), delivery.module.sha256);
  assert.equal(motion.sha256, metadata.sourceManifest['asserts/ViralInvasion_BladeMotion_v022/bladeMotion.ts']);
  const rig = await verifyFile(join(motionFolder, delivery.rig.source), delivery.rig.sha256);
  assert.equal(rig.sha256, metadata.player3D.sha256); assert.equal(delivery.rig.joints, 53);
  for (const clip of delivery.clips) assert(metadata.player3D.authoredBladeClips.includes(clip.name), 'New authored animation missing from build metadata: ' + clip.name);
  assert.equal(delivery.qa.numeric.status, 'passed'); assert.deepEqual(delivery.qa.numeric.failures, []);
  await verifyFile(join(motionFolder, delivery.qa.numeric.path), delivery.qa.numeric.sha256);
  const portable = delivery.artifacts.portableClipJson;
  await verifyFile(join(motionFolder, portable.path), portable.sha256, portable.bytes);
  result.animation = { delivery: await receipt(deliveryPath), module: motion, rig, joints: 53,
    authoredClips: metadata.player3D.authoredBladeClips, newClips: delivery.clips.map(clip => ({ name: clip.name, duration: clip.duration })),
    numericQa: 'passed', eyeCloseupScope: delivery.rig.eyes.statement };
  check('unchangedSelectedRasterAndVerifiedV022SkeletonSources');

  // Re-read every attested source at the end, so evidence collection itself
  // cannot silently straddle a skill-source edit. Only the two named external
  // UI files may move, and their final bytes are disclosed separately.
  const finalSources = await validateManifest(metadata.sourceManifest, 'Final packaged source check', { externalUi: true });
  result.sources.externalUiDifferences = finalSources.differences;
  result.sources.allAttestedSourcesMatchCurrentWorkspace = finalSources.differences.length === 0;
  result.sources.statement = finalSources.differences.length ? 'The immutable release matches all attested sources except the explicitly listed external equipment UI work. Current workspace is not identical to the release.'
    : 'Every source attested by the build metadata matches the current workspace; untracked or unattested files are outside this statement.';
  result.sources.skillSourcesStableDuringCollection = true;
  for (const item of result.typeOnlySourcesEvidence) await verifyFile(item.path, item.sha256, item.bytes);
  for (const [name, path] of Object.entries(input)) await verifyFile(path, result.evidence[name].sha256, result.evidence[name].bytes);
  for (const [path, expected] of frozen) await verifyFile(path, expected);
  await verifyFile(metadataPath, metadataReceipt.sha256); await verifyFile(desktop.zip, desktopZip.sha256); await verifyFile(mobile.zip, phoneZip.sha256); await verifyFile(mobile.html, phoneHtml.sha256);
  result.limits = ['Touch input uses desktop Chromium CDP emulation; no physical iPhone/Sitecase validation is claimed.',
    'Browser trial starts with an authorized owned-blade profile and its visible energy-fill control; a separate 844px battle earns the full meter naturally.',
    'Pressure uses 47 durable elite fixtures, one real three-bar boss, durable player/tissue/legion HP and periodic supplied energy. It does not establish human difficulty, ordinary progression, natural charging or mission duration.',
    'Pressure p95 and per-phase intervals describe desktop headless Chrome with capture/diagnostic overhead. There is no FPS threshold or physical-device performance claim; memory excludes GPU and RSS.',
    'The hero rig has no eye or eyelid bones/morphs. Programmable screen artwork supplies eye closing/opening; the actual 53-bone model supplies body/head/hand animation.',
    'Any explicitly listed current equipment UI differences belong to external workspace work and are absent from the immutable v0.22.0 package.'];
  result.pass = true;
} catch (error) {
  result.failures.push(String(error.stack ?? error)); process.exitCode = 1;
} finally {
  result.completedAt = new Date().toISOString(); await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ pass: result.pass, output: local(destination), checks: Object.keys(result.checks), failures: result.failures.map(value => value.split('\n')[0]) }));
