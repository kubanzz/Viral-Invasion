/**
 * Run only after the exclusive device-performance test has finished.
 * This builds/opens a separate read-only renderer fixture; dist/ and main/__viral are untouched.
 * Usage: node scripts/check-render-invariance.mjs [--input <snapshot>] [--output <folder>]
 *        [--frames 12] [--width 1366] [--height 768] [--dpr 1] [--channel chrome|msedge]
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = promisify(execFile);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Read-only Canvas2D snapshot comparison, after exclusive performance measurement.\n'
    + 'node scripts/check-render-invariance.mjs [--input artifacts/G4/performance/dense-state.json]\n'
    + '  [--output artifacts/G4/render-invariance] [--frames 12] [--width 1366] [--height 768] [--dpr 1] [--channel chrome|msedge] [--revision <commit>]\n'
    + '--revision loads src/ verbatim from that Git commit into the isolated fixture, for an explicitly derived visual comparison.\n'
    + 'Not a gameplay-input replay, browser win, performance test, or human playtest.');
  process.exit(0);
}
const options = { input: 'artifacts/G4/performance/dense-state.json', output: 'artifacts/G4/render-invariance',
  frames: 12, width: 1366, height: 768, dpr: 1, channel: 'chrome', revision: '' };
for (let index = 0; index < args.length; index += 2) {
  const name = args[index]?.replace(/^--/, '');
  if (!args[index]?.startsWith('--') || !Object.hasOwn(options, name) || args[index + 1] === undefined) throw new Error(`Invalid option ${args[index]}. Use --help.`);
  options[name] = ['frames', 'width', 'height', 'dpr'].includes(name) ? Number(args[index + 1]) : args[index + 1];
}
for (const name of ['frames', 'width', 'height']) if (!Number.isSafeInteger(options[name]) || options[name] <= 0) throw new Error(`${name} must be a positive integer.`);
if (options.frames < 2 || options.frames > 120) throw new Error('frames must be 2–120.');
if (!Number.isFinite(options.dpr) || options.dpr < 1 || options.dpr > 3) throw new Error('dpr must be 1–3.');
if (!['chrome', 'msedge'].includes(options.channel)) throw new Error('channel must be chrome or msedge.');
const input = resolve(root, options.input), output = resolve(root, options.output);
// Keep the isolated fixture out of the player release, including accidental --output dist.
const playerDist = resolve(root, 'dist');
const relativeOutput = relative(playerDist, output);
if (relativeOutput === '' || !isAbsolute(relativeOutput) && relativeOutput.split(/[\\/]/)[0] !== '..') {
  throw new Error('The probe output must be outside dist/.');
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = async path => sha256(await readFile(path));
const pathLabel = path => relative(root, path).replaceAll('\\', '/');
const revision = options.revision ? (await git('git', ['rev-parse', '--verify', `${options.revision}^{commit}`], { cwd: root })).stdout.trim() : null;
async function sourceBytes(path) {
  const label = pathLabel(path);
  return revision && label.startsWith('src/')
    ? (await git('git', ['show', `${revision}:${label}`], { cwd: root, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })).stdout
    : readFile(path);
}
const errors = [], remoteRequests = [];
let browser;
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), complete: false, pass: false,
  method: 'Independent fixture imports the actual Renderer. One captured snapshot and two independent structuredClone states are checked after repeated real Canvas2D renders at a fixed source tick.',
  scope: [
    'Technical rendering comparison derived from a read-only snapshot; no main.ts, GameSession.step(), live release state writes, or game-time advancement.',
    'Complete JSON equality plus SHA-256 of full state, HP, damage records, and collision geometry are checked at render-call boundaries.',
    'Not a same-input gameplay replay, browser victory, ten-minute performance measurement, visual readability acceptance, or human playtest.',
    'This verifies rendering does not change gameplay state. Shared danger/collision geometry remains covered separately by existing coreVisuals and geometry unit tests.',
    'Images are Canvas2D backing stores only, with no HUD. Visual differences between normal/low effects are permitted.',
  ],
  options, sourceRevision: revision, sourceScope: revision ? 'src/ bytes from the recorded commit; current independent fixture harness. No live-game state is written.' : 'Current working-tree src/ and independent fixture harness.', input: { path: pathLabel(input) }, errors, remoteRequests,
};
await mkdir(output, { recursive: true });
try {
  const raw = await readFile(input);
  report.input.fileSha256 = sha256(raw);
  const parsed = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  // Accept a direct read-only snapshot, or a metadata envelope created by the performance observer.
  const snapshot = parsed?.game === 'viral-invasion' ? parsed : parsed?.state;
  if (snapshot?.game !== 'viral-invasion') throw new Error('Input must be a GameState snapshot, or {state: GameState}. No synthetic state is generated.');
  report.input.shape = parsed === snapshot ? 'GameState' : '{state: GameState}';
  const bundle = await build({ absWorkingDir: root, entryPoints: ['tests/fixtures/renderProbe.ts'], bundle: true,
    format: 'iife', target: ['chrome110', 'edge110'], outfile: join(output, 'fixture.js'), metafile: true,
    legalComments: 'none', minify: false,
    plugins: revision ? [{ name: 'recorded-src-revision', setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/].*\.[cm]?tsx?$/ }, async args => ({ contents: await sourceBytes(args.path), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(args.path) }));
    } }] : [] });
  const sourcePaths = Object.keys(bundle.metafile.inputs).sort();
  report.sourceManifest = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path.replaceAll('\\', '/'), sha256(await sourceBytes(resolve(root, path)))])));
  report.sourceManifestSha256 = sha256(JSON.stringify(report.sourceManifest));
  report.fixtureBundleSha256 = await fileHash(join(output, 'fixture.js'));
  await writeFile(join(output, 'fixture.html'), '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<title>Isolated read-only Renderer comparison</title><style>html,body{margin:0;background:#120d1b}canvas{display:block;width:100vw;height:100vh}</style>'
    + '<canvas id="normal" aria-label="Normal effects at captured tick"></canvas><canvas id="low" aria-label="Low effects at captured tick"></canvas><script src="./fixture.js"></script></html>');
  browser = await chromium.launch({ channel: options.channel, headless: true });
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: options.dpr, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  await page.goto(pathToFileURL(join(output, 'fixture.html')).href);
  await page.waitForFunction(() => typeof window.__renderProbe?.run === 'function');
  const result = await page.evaluate(({ snapshot, frames }) => window.__renderProbe.run(snapshot, { frames }), { snapshot, frames: options.frames });
  const { png, ...checks } = result;
  report.checks = checks;
  report.images = {};
  for (const mode of ['normal', 'low']) {
    if (!png[mode].startsWith('data:image/png;base64,')) throw new Error(`Invalid ${mode} Canvas2D PNG export.`);
    const bytes = Buffer.from(png[mode].slice('data:image/png;base64,'.length), 'base64');
    const filename = `same-tick-${mode}.png`;
    await writeFile(join(output, filename), bytes);
    report.images[mode] = { path: pathLabel(join(output, filename)), sha256: sha256(bytes), bytes: bytes.length, tick: result.tick, elapsed: result.elapsed };
  }
  report.browser = { channel: options.channel, version: await browser.version(), headless: true, offline: true };
  report.input.unchanged = await fileHash(input) === report.input.fileSha256;
  const finalManifest = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path.replaceAll('\\', '/'), sha256(await sourceBytes(resolve(root, path)))])));
  report.sourceUnchanged = JSON.stringify(finalManifest) === JSON.stringify(report.sourceManifest);
  report.complete = true;
  report.pass = result.pass && report.input.unchanged && report.sourceUnchanged && !errors.length && !remoteRequests.length;
} catch (error) {
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  if (browser) {
    try { await browser.close(); }
    catch (error) { errors.push(`browser.close: ${String(error)}`); report.pass = false; }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ complete: report.complete, pass: report.pass, report: pathLabel(join(output, 'report.json')),
  tick: report.checks?.tick, aliveActors: report.checks?.aliveActors, framesPerMode: report.checks?.framesPerMode, errors, error: report.error }));
if (!report.pass) process.exitCode = 1;
