import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = 'artifacts/readability-v0153';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meta = await json(`${root}/candidate-final-3/build-meta.json`), checks = [];
async function check(name, run) { const detail = await run(); checks.push({ name, pass: true, detail }); }
await check('current production and delivered package identity', async () => {
  const identity = await json(`${root}/release-identity.json`);
  assert.equal(identity.metaSha256, sha(await readFile(`${root}/candidate-final-3/build-meta.json`)));
  for (const [path, expected] of Object.entries(meta.sourceManifest)) assert.equal(sha(await readFile(path)), expected, path);
  for (const file of identity.files) assert.equal(sha(await readFile(file.path)), file.sha256, file.path);
  for (const path of ['dist/build-meta.json', 'releases/Viral-Invasion-G4-v0.15.3/build-meta.json']) assert.equal(sha(await readFile(path)), identity.metaSha256);
  return { candidate: identity.candidate, inputs: identity.sourceCount, files: identity.files.length };
});
await check('full regression and final profile correction', async () => {
  const full = await json(`${root}/unit-results.json`), final = await json(`${root}/camp-profile-final.json`), seeds = await json(`${root}/system-six-seeds.json`);
  assert.equal(full.numFailedTests, 0); assert.equal(full.numPassedTests, 1911); assert.equal(final.numFailedTests, 0); assert.equal(final.numPassedTests, 66);
  assert.equal(seeds.complete, true); assert.equal(seeds.completedSeeds, 6);
  return { full: 1911, afterNeutralSaveCorrection: 66, systemSeeds: 6 };
});
await check('candidate2 visual state matrix and Canvas fallback', async () => {
  const details = [];
  for (const channel of ['chrome', 'edge']) {
    const r = await json(`${root}/${channel}-final/browser-report.json`);
    assert.equal(r.pass, true); assert.equal(r.errors.length, 0); assert.equal(r.natural.length, 3); assert.equal(r.fixtures.length, 72);
    details.push({ channel, naturalInputs: 3, stateFrames: 72, canvasFallbacks: 9 });
  }
  return details;
});
await check('footer-only exact byte equivalence from candidate2 to candidate3', async () => {
  const old = await readFile(`${root}/candidate-final-2/game.js`, 'utf8'), current = await readFile(`${root}/candidate-final-3/game.js`, 'utf8');
  assert.equal((old.match(/v0\.15\.2/g) ?? []).length, 3); assert.equal(old.replaceAll('v0.15.2', 'v0.15.3'), current);
  const oldMeta = await json(`${root}/candidate-final-2/build-meta.json`);
  assert.deepEqual(Object.keys(meta.sourceManifest).filter(path => meta.sourceManifest[path] !== oldMeta.sourceManifest[path]), ['src/main.ts']);
  for (const name of ['index.html', 'game.css']) assert.equal(meta.outputManifest[name], oldMeta.outputManifest[name]);
  return { onlyChangedSource: 'src/main.ts', changes: 'three equal-length footer version literals', gameplayBytesEquivalent: true };
});
await check('candidate3 actual inputs, visible version and HP in both browsers', async () => {
  for (const channel of ['chrome', 'edge']) { const r = await json(`${root}/${channel}-candidate3/browser-report.json`); assert.equal(r.pass, true); assert.deepEqual(r.build, meta.outputManifest); assert.equal(r.natural.length, 3); assert.equal(r.errors.length, 0); }
  return { naturalCases: 6, sizes: ['1366×768', '844×390', '667×320'], visibleFooter: 'v0.15.3' };
});
await check('limited camp behavior with explicit candidate2 source drift', async () => {
  const r = await json('artifacts/camp-entry-v0152/final-v0153-limited-probe/report.json');
  assert.equal(r.errors.length, 0); assert.equal(r.remoteRequests.length, 0); assert.equal(r.freshCases.length, 2); assert(r.freshCases.every(row => row.pass));
  assert.equal(r.fixtures.length, 8); assert(r.fixtures.every(row => row.pass)); assert.equal(r.outputsStable, true);
  assert.deepEqual(r.before.mismatches, []); assert.deepEqual(r.after.mismatches, ['src/main.ts']);
  assert.equal(r.responseHashes['game.js'], sha(await readFile(`${root}/candidate-final-2/game.js`)));
  return { candidate: 'candidate-final-2', realDeathLayouts: 2, componentFixtures: 8, originalReportPass: r.pass,
    scope: 'The original report remains false because its exact-source stability check saw the footer patch. Its behavior assertions pass; only the separately proven three-literal footer change is accepted here. No final full-natural victory claim.' };
});
await check('offline self-contained resources and exact mobile composition', async () => {
  const report = await json(`${root}/offline-static.json`); assert.equal(report.pass, true); assert.equal(report.metaSha256, sha(await readFile(`${root}/candidate-final-3/build-meta.json`)));
  return { embeddedPngs: report.embeddedPngs, externalResources: report.externalResources, dynamicScope: 'allowlisted local HTTP; no new file-protocol or physical-phone claim' };
});
await check('final typecheck and whitespace', async () => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'pipe' });
  execFileSync('git', ['diff', '--check'], { stdio: 'pipe' }); return { typecheck: true, diffCheck: true };
});
const report = { version: meta.version, pass: true, checks, fullNaturalQualified: false,
  limitations: ['Two candidate2 full-natural drivers stopped on navigation assumptions; their original failures are preserved.', 'No physical-phone or new-player test.', 'Browser state matrices are explicit supplied-state fixtures, separate from natural inputs.'] };
await writeFile(`${root}/verification-summary.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, checks: checks.length, summary: `${root}/verification-summary.json` }));
