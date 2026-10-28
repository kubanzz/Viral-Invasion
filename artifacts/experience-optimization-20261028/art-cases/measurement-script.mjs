/** Derived, read-only actual-Renderer art compositions. Never opens or edits the player release. */
import { build as bundle } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Derived actual-Renderer art compositions; no simulation or natural-gameplay claim.\n'
    + 'node scripts/check-runtime-completion-art.mjs --build <frozen-build-directory> --output <new-directory>\n'
    + '  [--input <actual-G3-snapshot.json>] [--require fission,immune,bite,beacon,mother|all]\n'
    + '  [--channel chrome|msedge] [--width 1920] [--height 1080] [--dpr 1|2] [--effects both|normal|low]\n'
    + 'Without --input, the fixture serializes an actual GameSession.start() snapshot at tick 0; all displayed cases are explicitly derived clones.\n'
    + 'Every production source-manifest entry and every fixture production input must match the supplied build. Output must not exist and must stay outside the build/dist.\n'
    + 'Missing native layers are recorded as fallback/missing. --require makes the requested native category completeness an exit-status gate.\n'
    + 'Screenshots, native sprite identities and full state JSON/SHA pairs are saved; the checker does not accept visual quality, animation continuity, reachability or performance.');
  process.exit(0);
}
const options = { build: 'dist', output: '', input: '', require: '', channel: 'chrome', width: 1920, height: 1080, dpr: 1, effects: 'both' };
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.replace(/^--/, '');
  if (!args[index]?.startsWith('--') || !Object.hasOwn(options, key) || args[index + 1] === undefined) throw new Error(`Invalid option ${args[index]}. Use --help.`);
  options[key] = ['width', 'height', 'dpr'].includes(key) ? Number(args[index + 1]) : args[index + 1];
}
if (!options.output) throw new Error('--output must name a new directory.');
for (const key of ['width', 'height']) if (!Number.isSafeInteger(options[key]) || options[key] < 600) throw new Error(`${key} must be an integer >=600.`);
if (![1, 2].includes(options.dpr) || !['chrome', 'msedge'].includes(options.channel) || !['both', 'normal', 'low'].includes(options.effects)) throw new Error('Invalid dpr, channel or effects. Use --help.');
const coverageCategories = ['fission', 'immune', 'bite', 'beacon', 'mother'];
const required = options.require === 'all' ? coverageCategories : [...new Set(options.require.split(',').map(value => value.trim()).filter(Boolean))];
if (required.some(value => !coverageCategories.includes(value))) throw new Error(`--require supports ${coverageCategories.join(',')}, or all.`);
const buildDirectory = resolve(root, options.build.endsWith('build-meta.json') ? dirname(options.build) : options.build), output = resolve(root, options.output);
const inside = (parent, path) => { const rest = relative(parent, path); return rest === '' || !isAbsolute(rest) && rest.split(/[\\/]/)[0] !== '..'; };
if (inside(buildDirectory, output) || inside(resolve(root, 'dist'), output)) throw new Error('Output must be outside the frozen build and dist/.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = async path => hash(await readFile(path));
const label = path => relative(root, path).replaceAll('\\', '/');
const metaPath = join(buildDirectory, 'build-meta.json'), gamePath = join(buildDirectory, 'game.js');
const [metaBytes, gameBytes] = await Promise.all([readFile(metaPath), readFile(gamePath)]);
const meta = JSON.parse(metaBytes.toString('utf8').replace(/^\uFEFF/, ''));
if (meta.game !== 'viral-invasion' || !meta.sourceManifest || !Object.keys(meta.sourceManifest).length) throw new Error('Expected a frozen Viral Invasion build with a nonempty sourceManifest.');
for (const [path, sha] of Object.entries(meta.sourceManifest)) if (isAbsolute(path) || !inside(root, resolve(root, path)) || !/^[a-f0-9]{64}$/.test(sha)) throw new Error(`Invalid production source manifest entry ${path}.`);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // EEXIST intentionally rejects even an empty prior evidence folder.

const errors = [], remoteRequests = [];
let browser, sourcePaths = [], initialSourceManifest;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), complete: false, pass: false, technicalPass: false, nativeComplete: false,
  scope: [
    'DERIVED ART COMPOSITIONS: actual current Renderer and embedded art, using detached clones of a serialized GameSession state.',
    'No GameSession.step(), simulation progression, live main.ts instance, damage/kill acceptance, gameplay input replay or player release state writes.',
    'A small inspection world, actor positions and selected state fields are explicitly derived and recorded. They are not naturally reached gameplay states.',
    'Actual browser screenshots and native sprite IDs/frames establish selected presentation. Full before/after JSON and independent SHA-256 checks establish state invariance.',
    'Technical pass does not accept visual style, readability, continuous animation, organic state transitions, collision reachability, gameplay completion or performance.',
    'Missing native assets or rejected layer registration stay visible as fallback/missing results. Only --require categories impose completeness gates; optional fallbacks never count as native verification.',
  ], options, requiredCategories: required, build: { directory: label(buildDirectory), version: meta.version, stage: meta.stage,
    metadataSha256: hash(metaBytes), gameJsSha256: hash(gameBytes), artSignature: meta.art?.inputSignature },
  cases: [], errors, remoteRequests };
async function artifact(filename, bytes) {
  const path = join(output, filename); await writeFile(path, bytes, { flag: 'wx' });
  return { path: label(path), sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
}
async function currentManifest(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await fileHash(resolve(root, path))])));
}
async function capture(page, stem) {
  const canvasBytes = await page.locator('#probe').screenshot();
  const { data, info } = await sharp(canvasBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = new Set(); let samples = 0, nonClear = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 17) {
    const offset = pixel * info.channels, [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
    colors.add((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3)); samples++;
    if (Math.abs(r - 18) + Math.abs(g - 13) + Math.abs(b - 27) > 24) nonClear++;
  }
  const meaningful = colors.size >= 32 && nonClear / samples >= .1;
  const canvas = await artifact(`${stem}-canvas.png`, canvasBytes);
  const labelledPage = await artifact(`${stem}.png`, await page.screenshot());
  return { canvas, labelledPage, meaningful, pixels: { width: info.width, height: info.height, samples, quantizedColors: colors.size, nonClearFraction: nonClear / samples },
    method: 'Actual installed-browser canvas-element and labelled-page screenshots. WebGL canvas is never acquired as 2D or exported with toDataURL/getImageData.' };
}

try {
  const productionPaths = Object.keys(meta.sourceManifest).sort();
  const productionBefore = await currentManifest(productionPaths);
  const mismatches = productionPaths.filter(path => productionBefore[path] !== meta.sourceManifest[path]);
  report.productionSourceComparison = { checked: productionPaths.length, mismatches,
    method: 'Every frozen-build sourceManifest entry is independently rehashed from the current workspace, including main, renderer, original selected art, selection and pipeline.' };
  if (mismatches.length) throw new Error(`Frozen build does not match current production sources (${mismatches.length} mismatches).`);
  const fixture = await bundle({ absWorkingDir: root, entryPoints: ['tests/fixtures/runtimeCompletionArtProbe.ts'], bundle: true,
    format: 'iife', target: ['chrome110', 'edge110'], outfile: join(output, 'fixture.js'), metafile: true, legalComments: 'none', minify: false });
  sourcePaths = Object.keys(fixture.metafile.inputs).map(path => path.replaceAll('\\', '/')).sort();
  initialSourceManifest = await currentManifest(sourcePaths); report.fixtureSourceManifest = initialSourceManifest;
  report.fixtureSourceManifestSha256 = hash(JSON.stringify(initialSourceManifest));
  const productionInputs = sourcePaths.filter(path => /^(src\/|\.art-generated\/|node_modules\/)/.test(path));
  const missingOrChanged = productionInputs.filter(path => meta.sourceManifest[path] !== initialSourceManifest[path]);
  report.fixtureProductionInputComparison = { checked: productionInputs.length, missingOrChanged,
    method: 'Every src/, .art-generated/ and node_modules/ input imported by the fixture must exist and match in the supplied production build manifest; fixture harness inputs are independent.' };
  if (!productionInputs.length || missingOrChanged.length) throw new Error(`Fixture production inputs do not match the frozen build (${missingOrChanged.length} mismatches).`);
  const runtime = JSON.parse(await readFile(join(root, '.art-generated/art-runtime.json'), 'utf8'));
  if (runtime.inputSignature !== meta.art?.inputSignature) throw new Error('Runtime art signature differs from the supplied frozen build.');
  report.art = { inputSignature: runtime.inputSignature, runtimeSha256: initialSourceManifest['.art-generated/art-runtime.json'],
    spriteIdCount: Object.keys(runtime.assets).length, base64ContentPrinted: false };
  report.fixtureBundleSha256 = await fileHash(join(output, 'fixture.js'));
  report.measurementScript = await artifact('measurement-script.mjs', await readFile(fileURLToPath(import.meta.url)));
  await artifact('fixture.html', '<!doctype html><html lang="en"><meta charset="utf-8"><title>DERIVED runtime-completion art probe</title>'
    + '<style>html,body{margin:0;background:#120d1b;color:#e9ead8;font:13px system-ui}header{box-sizing:border-box;height:68px;padding:7px 12px;background:#173c42}h1{font-size:13px;margin:0 0 6px}select{max-width:55vw}canvas{display:block;width:100vw;height:calc(100vh - 68px)}#case-title{font-weight:bold}</style>'
    + '<header><h1 id="case-title">DERIVED · actual Renderer · no simulation advance or natural-gameplay claim</h1>'
    + '<select id="case-selector" aria-label="Derived art composition"></select> <label><input id="low-effects" type="checkbox">Low effects</label> <button id="render-case">Render derived case</button></header>'
    + '<canvas id="probe" aria-label="Actual Renderer canvas for derived inspection"></canvas><script src="./fixture.js"></script></html>');
  let snapshot;
  if (options.input) {
    const inputPath = resolve(root, options.input), bytes = await readFile(inputPath), parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    snapshot = parsed?.game === 'viral-invasion' ? parsed : parsed?.state;
    if (snapshot?.game !== 'viral-invasion') throw new Error('--input must be a serialized GameState or {state:GameState}.');
    report.input = { path: label(inputPath), sha256: hash(bytes), role: 'Actual source snapshot only; every pictured composition is explicitly derived.' };
  }
  browser = await chromium.launch({ channel: options.channel, headless: true });
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: options.dpr, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  await page.goto(pathToFileURL(join(output, 'fixture.html')).href);
  await page.waitForFunction(() => typeof window.__runtimeCompletionArtProbe?.prepare === 'function');
  const preparation = await page.evaluate(snapshot => window.__runtimeCompletionArtProbe.prepare(snapshot), snapshot);
  const { sourceJson, ...sourceDetails } = preparation;
  if (hash(sourceJson) !== preparation.sourceSha256) throw new Error('Independent source JSON hash differs from the fixture.');
  report.source = { ...sourceDetails, file: await artifact('source-state.json', sourceJson) };
  if (preparation.artSignature !== meta.art.inputSignature) throw new Error('Browser fixture uses a different art signature.');
  const cases = await page.evaluate(() => window.__runtimeCompletionArtProbe.cases());
  const modes = options.effects === 'both' ? [false, true] : [options.effects === 'low'];
  for (const spec of cases) for (const lowEffects of modes) {
    const result = await page.evaluate(({ id, lowEffects }) => window.__runtimeCompletionArtProbe.renderCase(id, lowEffects), { id: spec.id, lowEffects });
    const stem = `${spec.id}-${lowEffects ? 'low' : 'normal'}`;
    const { beforeJson, afterJson, ...checks } = result.state;
    const beforeHash = hash(beforeJson), afterHash = hash(afterJson);
    const independentStateEquality = beforeJson === afterJson && beforeHash === afterHash && beforeHash === checks.beforeSha256 && afterHash === checks.afterSha256
      && checks.sourceBeforeSha256 === preparation.sourceSha256 && checks.sourceAfterSha256 === preparation.sourceSha256 && checks.sourceUnchanged;
    if (!independentStateEquality) throw new Error(`Full derived/source state invariance failed for ${stem}.`);
    const stateFiles = { before: await artifact(`${stem}-state-before.json`, beforeJson), after: await artifact(`${stem}-state-after.json`, afterJson) };
    const screenshot = await capture(page, stem);
    const entry = { ...result, state: { ...checks, independentStateEquality, stateFiles }, screenshots: screenshot };
    await artifact(`${stem}-diagnostics.json`, JSON.stringify(entry, null, 2));
    report.cases.push(entry);
    if (!screenshot.meaningful) throw new Error(`Actual renderer screenshot is blank or insufficiently painted for ${stem}.`);
    console.log(`${stem}: ${result.coverage.map(item => `${item.category}=${item.status}`).join(', ')}`);
  }
  await page.evaluate(() => window.__runtimeCompletionArtProbe.destroy());
  report.browser = { channel: options.channel, version: await browser.version(), headless: true, offline: true };
  report.coverage = Object.fromEntries(coverageCategories.map(category => {
    const observations = report.cases.flatMap(entry => entry.coverage.filter(item => item.category === category).map(item => ({ case: entry.id, lowEffects: entry.lowEffects, ...item })));
    return [category, { required: required.includes(category), checkedCases: observations.length,
      complete: observations.length > 0 && observations.every(item => item.nativeVerified),
      missingOrFallbackCases: observations.filter(item => !item.nativeVerified).map(item => ({ case: item.case, lowEffects: item.lowEffects, status: item.status,
        missingAssets: item.missingAssets, invalidRegistration: item.invalidRegistration, missingLabels: item.missingLabels })), observations }];
  }));
  report.nativeComplete = coverageCategories.every(category => report.coverage[category].complete);
  report.requiredCoverageComplete = required.every(category => report.coverage[category].complete);
  const finalProductionManifest = await currentManifest(productionPaths), finalFixtureManifest = await currentManifest(sourcePaths);
  report.productionSourcesUnchanged = JSON.stringify(finalProductionManifest) === JSON.stringify(productionBefore);
  report.fixtureSourcesUnchanged = JSON.stringify(finalFixtureManifest) === JSON.stringify(initialSourceManifest);
  report.buildUnchanged = await fileHash(metaPath) === report.build.metadataSha256 && await fileHash(gamePath) === report.build.gameJsSha256;
  report.fixtureBundleUnchanged = await fileHash(join(output, 'fixture.js')) === report.fixtureBundleSha256;
  report.measurementScriptUnchanged = await fileHash(fileURLToPath(import.meta.url)) === report.measurementScript.sha256;
  report.inputUnchanged = !report.input || await fileHash(resolve(root, options.input)) === report.input.sha256;
  report.technicalPass = report.cases.length === cases.length * modes.length && report.cases.every(entry => entry.state.independentStateEquality && entry.screenshots.meaningful)
    && report.productionSourcesUnchanged && report.fixtureSourcesUnchanged && report.buildUnchanged && report.fixtureBundleUnchanged && report.measurementScriptUnchanged && report.inputUnchanged && !errors.length && !remoteRequests.length;
  report.complete = true; report.pass = report.technicalPass && report.requiredCoverageComplete;
  report.acceptanceStatus = !report.technicalPass ? 'technical-failure' : !report.requiredCoverageComplete ? 'required-native-coverage-incomplete'
    : report.nativeComplete ? 'all-requested-native-stills-verified-human-review-pending' : 'technical-captures-complete-optional-native-fallbacks-recorded';
  report.automaticPassScope = 'Complete state/source/build identity, meaningful actual-renderer captures and explicitly required native sprite categories only. Visual quality, natural progression and continuous animation remain unassessed.';
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error); console.error(report.error);
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
}
console.log(JSON.stringify({ report: label(join(output, 'report.json')), pass: report.pass, technicalPass: report.technicalPass,
  nativeComplete: report.nativeComplete, cases: report.cases.length, required }));
if (!report.pass) process.exitCode = 1;
