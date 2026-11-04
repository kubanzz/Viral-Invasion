/** Reusable natural-input comparison capture. No supplied game state or clock writes. */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const build = resolve(process.argv[2] ?? ''), output = resolve(process.argv[3] ?? ''), role = process.argv[4];
if (!process.argv[2] || !process.argv[3] || !['old-reference', 'new-native'].includes(role)) throw Error('Usage: node capture-training-comparison.mjs <frozen-build-directory> <new-output-directory> old-reference|new-native');
try { if ((await readdir(output)).length) throw Error('Preserve prior evidence: output must be new/empty'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const fileSha = async path => sha(await readFile(path));
const names = ['index.html', 'game.js', 'build-meta.json'];
const before = Object.fromEntries(await Promise.all(names.map(async name => [name, await fileSha(join(build, name))])));
const metadata = JSON.parse(await readFile(join(build, 'build-meta.json'), 'utf8'));
if (role === 'old-reference' && (metadata.version !== '0.10.0' || before['game.js'] !== 'c440ca6bf74d40377677538e6c39a552b54c6c8af7a5ab8ddc12c2b51af7a170')) throw Error('The old reference must be the preserved actual v0.10.0 release c440ca6b, not a procedural supplied-state fixture');
const script = await readFile(fileURLToPath(import.meta.url));
await writeFile(join(output, 'measurement-script.mjs'), script, { flag: 'wx' });
await writeFile(join(output, 'build-meta-copy.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' });
const url = new URL(pathToFileURL(join(build, 'index.html')).href); url.searchParams.set('scenario', 'training'); url.searchParams.set('seed', '71');
const report = { schemaVersion: 1, role, build, entry: url.href, metadataVersion: metadata.version, before, metadataArtSignature: metadata.art?.inputSignature,
  measurementScriptSha256: sha(script), viewport: { width: 1366, height: 768 }, dpr: 1, minimumTick: 60,
  inputPolicy: 'Real start click, real mouse move to player+(260,120), no movement/fire/tools, real Escape pause after at least tick60; __viral only read.',
  scope: 'Natural old/new comparison capture, not gameplay/art acceptance. Same training route/seed, viewport and reachable stationary pose; actual ticks/visual frames are recorded, not assumed equal.',
  writesToGameState: false, errors: [], remoteRequests: [], screenshots: [], complete: false };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.remoteRequests.push(request.url()); });
  await page.goto(url.href); await page.waitForFunction(() => window.__viral?.diagnostics().phaser?.ready === true);
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing');
  report.aim = await page.evaluate(() => {
    const state = window.__viral.snapshot(), world = { x: state.player.x + 260, y: state.player.y + 120 };
    return { world, screen: window.__viral.toScreen(world) };
  });
  await page.mouse.move(report.aim.screen.x, report.aim.screen.y);
  await page.waitForFunction(minimumTick => {
    const state = window.__viral.snapshot(), art = window.__viral.diagnostics().art;
    const frame = art.heroAnimation?.frame;
    return state.phase === 'playing' && state.tick >= minimumTick && frame?.index === 0 && frame?.clip === 'idle';
  }, report.minimumTick);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__viral.snapshot().phase === 'paused');
  const read = () => page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics(),
    cameraProjection: { origin: window.__viral.toScreen({ x: 0, y: 0 }), unitX: window.__viral.toScreen({ x: 1, y: 0 }), unitY: window.__viral.toScreen({ x: 0, y: 1 }) } }));
  report.beforeCapture = await read();
  if (report.beforeCapture.diagnostics.art.signature !== metadata.art?.inputSignature) throw Error('Actual browser art signature differs from the selected build metadata');
  const actors = report.beforeCapture.diagnostics.art.actorFrames ?? [];
  if (role === 'new-native') {
    const contract = report.beforeCapture.diagnostics.art.actorContract;
    if (contract?.version !== 2 || !contract.ready || contract.preview || contract.animationPreview || contract.oldSourceIds.length) throw Error('New comparison needs fully approved formal actor groups and no old-source entries');
    for (const id of ['player', ...report.beforeCapture.state.targets.filter(target => target.hp > 0).map(target => target.id)]) {
      if (!actors.some(actor => actor.actorId === id && actor.native && actor.groupReady && !actor.fallback)) throw Error(`New comparison actor is not an actual formal native body: ${id}`);
    }
  }
  const capture = async name => {
    const bytes = await page.screenshot(); await writeFile(join(output, name), bytes, { flag: 'wx' });
    report.screenshots.push({ path: join(output, name), sha256: sha(bytes), bytes: bytes.length });
  };
  await capture('training-paused-raw.png');
  await page.locator('#overlay-host').evaluate(element => { element.style.visibility = 'hidden'; });
  await page.waitForTimeout(50); await capture('training-actor-inspection.png');
  report.afterCapture = await read();
  report.stateUnchangedDuringCapture = JSON.stringify(report.beforeCapture.state) === JSON.stringify(report.afterCapture.state);
  report.nativeActors = report.beforeCapture.diagnostics.phaser.nativeSprites.filter(sprite => sprite.visible &&
    ['player', 'player:tool', ...report.beforeCapture.state.targets.map(target => target.id)].includes(sprite.id));
  const s = report.beforeCapture.state;
  report.comparablePose = { player: { x: s.player.x, y: s.player.y, radius: s.player.radius, hp: s.player.hp, facing: s.player.facing },
    tissue: s.tissue, targets: s.targets.map(target => ({ id: target.id, kind: target.kind, x: target.x, y: target.y, radius: target.radius, hp: target.hp, maxHp: target.maxHp })),
    tool: s.tool, shots: s.shots, hits: s.hits, scans: s.scans, dashes: s.dashes };
  report.comparablePoseSha256 = sha(JSON.stringify(report.comparablePose));
  report.actualTick = s.tick; report.actualElapsed = s.elapsed;
  report.normalizedCameraScale = report.beforeCapture.cameraProjection.unitX.x - report.beforeCapture.cameraProjection.origin.x;
  report.pauseUiNote = 'Second screenshot hides only the pause overlay DOM; both snapshots remain paused and the complete game state must be identical.';
  report.after = Object.fromEntries(await Promise.all(names.map(async name => [name, await fileSha(join(build, name))])));
  report.buildUnchanged = JSON.stringify(before) === JSON.stringify(report.after);
  report.measurementScriptUnchanged = await fileSha(fileURLToPath(import.meta.url)) === report.measurementScriptSha256;
  report.complete = report.buildUnchanged && report.measurementScriptUnchanged && report.stateUnchangedDuringCapture && !report.errors.length && !report.remoteRequests.length;
  await context.close();
} catch (error) { report.error = error instanceof Error ? error.stack : String(error); }
finally { if (browser) await browser.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); }
console.log(JSON.stringify({ report: join(output, 'report.json'), complete: report.complete, role, actualTick: report.actualTick,
  actualElapsed: report.actualElapsed, scale: report.normalizedCameraScale, comparablePoseSha256: report.comparablePoseSha256, error: report.error ?? null }));
if (!report.complete) process.exitCode = 1;
