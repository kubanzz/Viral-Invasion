/**
 * Independent, explicitly derived visual boundary evidence. Does not load main.ts,
 * construct GameSession, advance simulation, or change dist/. Run only when the
 * production build is frozen and exclusive performance measurements have ended.
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = fileURLToPath(import.meta.url), args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Derived technical art evidence from a real captured snapshot; no simulation advance or human readability claim.\n'
    + 'node scripts/check-art-readability.mjs [--input artifacts/art-v080/performance/dense-standard-state.json]\n'
    + '  [--output artifacts/art-v081/readability-derived] [--width 1920] [--height 1080] [--dpr 1] [--channel chrome|msedge]\n'
    + 'Records actual native obstacle alpha at original-world legal behind/front positions with mirrored action poses, four real enemyAttackPlan danger types in normal/low modes,\n'
    + 'and black alpha silhouettes from selected runtime atlas frames plus the actual procedural FISSION fallback.\n'
    + 'The default historical captured snapshot is a state source only; the current Renderer/build supplies presentation. Use --input to select another real capture.\n'
    + 'Output must be a new/empty directory, outside dist/. All shared production source hashes, including Phaser, must match dist/build-meta.json.');
  process.exit(0);
}
const options = { input: 'artifacts/art-v080/performance/dense-standard-state.json', output: 'artifacts/art-v081/readability-derived',
  width: 1920, height: 1080, dpr: 1, channel: 'chrome' };
for (let index = 0; index < args.length; index += 2) {
  const name = args[index]?.replace(/^--/, '');
  if (!args[index]?.startsWith('--') || !Object.hasOwn(options, name) || args[index + 1] === undefined) throw new Error(`Invalid option ${args[index]}. Use --help.`);
  options[name] = ['width', 'height', 'dpr'].includes(name) ? Number(args[index + 1]) : args[index + 1];
}
for (const name of ['width', 'height']) if (!Number.isSafeInteger(options[name]) || options[name] < 400) throw new Error(`${name} must be an integer >=400.`);
if (![1, 2].includes(options.dpr)) throw new Error('dpr must be 1 or 2 (actual host cap).');
if (!['chrome', 'msedge'].includes(options.channel)) throw new Error('channel must be chrome or msedge.');
const input = resolve(root, options.input), output = resolve(root, options.output), dist = resolve(root, 'dist');
const inDist = relative(dist, output);
if (inDist === '' || !isAbsolute(inDist) && inDist.split(/[\\/]/)[0] !== '..') throw new Error('Probe output must be outside dist/.');
try { if ((await readdir(output)).length) throw new Error('Probe output must be a new/empty directory to preserve prior evidence.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hashFile = async path => sha256(await readFile(path));
const label = path => relative(root, path).replaceAll('\\', '/');
const errors = [], remoteRequests = [];
let browser;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), complete: false, pass: false, options,
  passScope: 'Technical source identity, legal-footprint occlusion alpha, real directed danger plan/caption placement, alpha silhouette integrity, and complete state invariance only. Automatic pass does not accept human recognition or hazard geometric visibility/readability.',
  humanVisualAcceptance: 'Unassessed by automation; manually inspect all8 directed danger screenshots, the4 legal occlusion screenshots, and silhouette contact sheet.',
  scope: [
    'Artificially positioned clones of a real captured dense state. No simulation advance; positions are not proven reachable through gameplay.',
    'Isolated fixture imports the current actual Renderer. No main.ts, GameSession, public DOM gameplay input, or live release state changes.',
    'Actual native Sprite alpha at original-world legal player footprints verifies behind/front obstacle fading, including both mirrored action poses. Behind requires native selected-frame alpha intersection>=24px; front reports actual intersection without inventing overlap.',
    'Four directed enemyAttackPlan samples search legal original-world footprints and use real planned hit geometry. Automatic pass checks real plan, expected non-conflicted essential caption placements, and state invariance only; actual hazard geometric visibility/readability requires manual inspection of all eight screenshots. These pictures do not prove natural commitment timing, cooldowns, or gameplay reachability.',
    'Complete derived and source state JSON equality and SHA-256 checked around rendering. Source input file and production source hashes checked unchanged.',
    'Equal 64px alpha-height silhouettes are a technical comparison artifact. Human distinction/readability is deliberately not automatically accepted.',
    'Screenshots have the actual renderer canvas and no production HUD. No performance or human playtest claim.',
  ], input: { path: label(input) }, errors, remoteRequests };
await mkdir(output, { recursive: true });
async function artifact(filename, bytes) {
  const path = join(output, filename); await writeFile(path, bytes);
  return { path: label(path), sha256: sha256(bytes), bytes: bytes.length };
}
async function meaningfulScreenshot(page, name) {
  const bytes = await page.locator('#probe').screenshot({ path: join(output, `${name}.png`) });
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = new Set(); let samples = 0, nonClear = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 13) {
    const offset = pixel * info.channels, [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
    samples++; if (Math.abs(r - 18) + Math.abs(g - 13) + Math.abs(b - 27) > 24) nonClear++;
    colors.add((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3));
  }
  if (colors.size < 32 || nonClear / samples < .1) throw new Error(`Empty renderer screenshot ${name}.`);
  return { path: label(join(output, `${name}.png`)), sha256: sha256(bytes), bytes: bytes.length,
    pixels: { width: info.width, height: info.height, sampled: samples, quantizedColors: colors.size, nonClearFraction: nonClear / samples },
    method: 'Actual browser canvas element screenshot; WebGL canvas is never acquired as 2D or exported by getImageData/toDataURL.' };
}
function alphaBounds(data, width, height, channels, threshold = 32) {
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * channels + channels - 1] >= threshold) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
  }
  if (!count) throw new Error('Cannot normalize empty silhouette.');
  return { left, top, width: right - left + 1, height: bottom - top + 1, alphaPixels: count, threshold };
}
async function silhouette(assetId, png, provenance) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const body = alphaBounds(data, info.width, info.height, info.channels), rgba = Buffer.alloc(info.width * info.height * 4);
  for (let pixel = 0; pixel < info.width * info.height; pixel++) rgba[pixel * 4 + 3] = data[pixel * info.channels + info.channels - 1] >= 32 ? 255 : 0;
  const mask = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: body.left, top: body.top, width: body.width, height: body.height }).resize({ height: 64, kernel: 'nearest' }).png().toBuffer();
  const normalized = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const normalizedBounds = alphaBounds(normalized.data, normalized.info.width, normalized.info.height, normalized.info.channels);
  if (normalizedBounds.height !== 64) throw new Error(`${assetId} visible alpha height is not 64px.`);
  const file = await artifact(`silhouette-${assetId.replaceAll('.', '-')}.png`, mask);
  return { ...file, assetId, sourcePixels: { width: info.width, height: info.height }, alphaBounds: body,
    normalizedAlphaBounds: normalizedBounds, normalization: 'Black binary alpha >=32; actual visible-alpha crop; nearest-neighbor scaling to exactly64px height; transparent background.',
    humanRecognition: 'Not assessed automatically.', provenance, contactImage: mask };
}
try {
  const [raw, buildRaw, productionGame, measurementScript] = await Promise.all([
    readFile(input), readFile(join(dist, 'build-meta.json')), readFile(join(dist, 'game.js')), readFile(script),
  ]);
  report.input.fileSha256 = sha256(raw);
  const parsed = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')), snapshot = parsed?.game === 'viral-invasion' ? parsed : parsed?.state;
  if (snapshot?.game !== 'viral-invasion') throw new Error('Input must be a real serialized GameState or {state: GameState}.');
  report.input.shape = parsed === snapshot ? 'GameState' : '{state: GameState}';
  report.input.role = 'Historical captured state used only as the source for derived clones. It is not asserted to have been captured by the current production build. Presentation comes from the current frozen Renderer/art and production bundle identified separately.';
  report.input.sourceTick = snapshot.tick; report.input.sourceElapsed = snapshot.elapsed;
  const buildMeta = JSON.parse(buildRaw);
  report.production = { version: buildMeta.version, gameJsSha256: sha256(productionGame), buildMetaSha256: sha256(buildRaw), artSignature: buildMeta.art?.inputSignature };
  report.measurementScript = await artifact('measurement-script.mjs', measurementScript);
  const fixture = await build({ absWorkingDir: root, entryPoints: ['tests/fixtures/artReadabilityProbe.ts'], bundle: true,
    format: 'iife', target: ['chrome110', 'edge110'], outfile: join(output, 'fixture.js'), metafile: true, legalComments: 'none', minify: false });
  const sourcePaths = Object.keys(fixture.metafile.inputs).sort();
  report.sourceManifest = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path.replaceAll('\\', '/'), await hashFile(resolve(root, path))])));
  report.sourceManifestSha256 = sha256(JSON.stringify(report.sourceManifest));
  const productionManifest = buildMeta.sourceManifest ?? {};
  report.sharedProductionSources = Object.entries(report.sourceManifest).filter(([path]) => Object.hasOwn(productionManifest, path))
    .map(([path, sha]) => ({ path, sha256: sha, productionSha256: buildMeta.sourceManifest?.[path], match: sha === buildMeta.sourceManifest?.[path] }));
  report.requiredProductionSources = Object.entries(report.sourceManifest).filter(([path]) => path.startsWith('src/') || path.startsWith('.art-generated/') || path.startsWith('node_modules/'))
    .map(([path, sha]) => ({ path, sha256: sha, productionSha256: productionManifest[path], exists: Object.hasOwn(productionManifest, path), match: sha === productionManifest[path] }));
  report.productionSourceComparison = 'Every fixture/build source-manifest intersection entry is compared. Every src/, .art-generated/ and node_modules/ fixture input must additionally exist and match in the production manifest; independent tests/ fixture inputs are exempt from that existence requirement.';
  if (!report.sharedProductionSources.length || report.sharedProductionSources.some(source => !source.match)
    || !report.requiredProductionSources.length || report.requiredProductionSources.some(source => !source.exists || !source.match)) throw new Error('Frozen production build does not match current shared fixture sources, or a required production source is missing. Rebuild/freeze before running.');
  report.fixtureBundleSha256 = await hashFile(join(output, 'fixture.js'));
  await writeFile(join(output, 'fixture.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Derived read-only art boundary probe</title>'
    + '<style>html,body{margin:0;background:#120d1b}canvas{display:block;width:100vw;height:100vh}</style><canvas id="probe"></canvas><script src="./fixture.js"></script></html>');
  const runtimeRaw = await readFile(join(root, '.art-generated/art-runtime.json')), runtime = JSON.parse(runtimeRaw);
  report.artRuntimeSha256 = sha256(runtimeRaw);
  browser = await chromium.launch({ channel: options.channel, headless: true });
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: options.dpr, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  await page.goto(pathToFileURL(join(output, 'fixture.html')).href);
  await page.waitForFunction(() => typeof window.__artReadabilityProbe?.prepare === 'function');
  report.preparation = await page.evaluate(snapshot => window.__artReadabilityProbe.prepare(snapshot), snapshot);
  report.occlusion = [];
  for (const position of ['behind', 'front']) for (const mirrored of [false, true]) {
    const result = await page.evaluate(({ position, mirrored }) => window.__artReadabilityProbe.occlusion(position, mirrored), { position, mirrored });
    result.image = await meaningfulScreenshot(page, result.name); report.occlusion.push(result);
  }
  report.dangers = [];
  try {
    for (const kind of ['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion']) for (const lowEffects of [false, true]) {
      const result = await page.evaluate(({ kind, lowEffects }) => window.__artReadabilityProbe.danger(kind, lowEffects), { kind, lowEffects });
      result.image = await meaningfulScreenshot(page, result.name); report.dangers.push(result);
    }
  } catch (error) { report.dangerError = error instanceof Error ? error.stack ?? error.message : String(error); }
  // Normal/low samples must derive exactly the same complete state, including real hit plan.
  report.dangerModeStateEqual = report.dangers.length === 8 && report.dangers.filter(d => !d.lowEffects).every(d => report.dangers.some(other => other.kind === d.kind && other.lowEffects && other.beforeSha256 === d.beforeSha256));
  const silhouettes = [];
  for (const assetId of ['hero.idle', 'enemy.basic', 'enemy.carapace', 'enemy.mimic']) {
    const asset = runtime.assets[assetId], atlas = runtime.atlases.find(atlas => atlas.key === asset.atlas), frame = atlas?.data.frames[asset.frame];
    if (!frame || frame.rotated || frame.trimmed) throw new Error(`Unsupported selected runtime frame ${assetId}.`);
    const atlasBytes = Buffer.from(atlas.dataUri.split(',')[1], 'base64'), rect = frame.frame;
    const png = await sharp(atlasBytes).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).png().toBuffer();
    silhouettes.push(await silhouette(assetId, png, { selectedAssetId: assetId, frame: asset.frame, atlas: asset.atlas,
      atlasSha256: sha256(atlasBytes), runtimeSha256: report.artRuntimeSha256, source: asset.source, sourceSha256: asset.sourceSha256,
      method: 'Crop actual selected embedded runtime atlas frame. No arbitrary source/candidate PNG is loaded.' }));
  }
  const { rawPng, png, bodyMaskPng, ...fission } = await page.evaluate(() => window.__artReadabilityProbe.fissionSample());
  const proceduralBytes = Buffer.from(png.split(',')[1], 'base64'), rawBytes = Buffer.from(rawPng.split(',')[1], 'base64');
  fission.rawProductionDraw = await artifact('fission-production-draw.png', rawBytes);
  fission.bodyPixels = await artifact('fission-body-extracted.png', proceduralBytes);
  fission.traceBodyMask = await artifact('fission-trace-body-mask.png', Buffer.from(bodyMaskPng.split(',')[1], 'base64'));
  fission.sourceSha256 = report.sourceManifest['src/render/battleVisuals.ts'];
  report.fission = fission;
  silhouettes.push(await silhouette('procedural.FISSION', proceduralBytes, { productionSource: fission.productionSource,
    productionSourceSha256: fission.sourceSha256, renderedPngSha256: sha256(rawBytes), bodyPngSha256: sha256(proceduralBytes),
    traceBodyMaskSha256: fission.traceBodyMask.sha256, coverage: fission.coverage, method: fission.bodyExtraction }));
  const cellWidth = 150, cellHeight = 116, sheet = [];
  for (const [index, item] of silhouettes.entries()) {
    const metadata = await sharp(item.contactImage).metadata();
    sheet.push({ input: item.contactImage, left: index * cellWidth + Math.floor((cellWidth - metadata.width) / 2), top: 12 });
    sheet.push({ input: Buffer.from(`<svg width="${cellWidth}" height="30"><text x="75" y="17" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#202020">${item.assetId}</text></svg>`), left: index * cellWidth, top: 82 });
  }
  report.silhouetteContactSheet = await artifact('silhouettes-64px-alpha.png', await sharp({ create: { width: cellWidth * silhouettes.length, height: cellHeight, channels: 4, background: '#fff' } }).composite(sheet).png().toBuffer());
  report.silhouettes = silhouettes.map(({ contactImage, ...item }) => item);
  report.browser = { channel: options.channel, version: await browser.version(), headless: true, offline: true, cssViewport: { width: options.width, height: options.height }, dpr: options.dpr };
  report.input.unchanged = await hashFile(input) === report.input.fileSha256;
  const finalManifest = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path.replaceAll('\\', '/'), await hashFile(resolve(root, path))])));
  report.sourceUnchanged = JSON.stringify(finalManifest) === JSON.stringify(report.sourceManifest);
  report.measurementScriptUnchanged = await hashFile(script) === report.measurementScript.sha256;
  report.productionUnchanged = await hashFile(join(dist, 'game.js')) === report.production.gameJsSha256 && await hashFile(join(dist, 'build-meta.json')) === report.production.buildMetaSha256;
  report.complete = true;
  report.pass = report.occlusion.every(x => x.pass) && report.dangers.every(x => x.pass) && report.dangerModeStateEqual && fission.completeJsonEqual
    && report.input.unchanged && report.sourceUnchanged && report.measurementScriptUnchanged && report.productionUnchanged && !report.dangerError && !errors.length && !remoteRequests.length;
} catch (error) {
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  if (browser) try { await browser.close(); } catch (error) { errors.push(`browser.close: ${String(error)}`); report.pass = false; }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ complete: report.complete, pass: report.pass, report: label(join(output, 'report.json')), occlusionCases: report.occlusion?.length, dangerCases: report.dangers?.length, silhouettes: report.silhouettes?.length, errors, error: report.error }));
if (!report.pass) process.exitCode = 1;
