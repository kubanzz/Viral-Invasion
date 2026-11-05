import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.'), base = resolve('artifacts/expedition-v015');
const out = resolve(process.env.VI_OFFLINE_OUTPUT ?? join(base, 'offline-final'));
const decoded = resolve(process.env.VI_OFFLINE_DECODED ?? '.tools/v015-offline-independent');
const candidate = resolve(process.env.VI_OFFLINE_CANDIDATE ?? join(base, 'candidate-1'));
const desktopZip = resolve('releases/Viral-Invasion-G4-v0.15.0.zip'), mobileZip = resolve('releases/Viral-Invasion-Mobile.zip');
const mobileHtml = resolve('releases/Viral-Invasion-Mobile.html');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async path => hash(await readFile(path));
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const require = createRequire(import.meta.url), { yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
await mkdir(out, { recursive: true }); await mkdir(decoded, { recursive: true });
const metadata = await json(join(candidate, 'build-meta.json'));
assert.equal(metadata.version, '0.15.0');
const sourceBefore = Object.fromEntries(await Promise.all(Object.keys(metadata.sourceManifest).map(async path => [path, await sha(path)])));
assert.deepEqual(sourceBefore, metadata.sourceManifest, 'Candidate inputs already drifted before offline smoke');
async function decode(path, folder) {
  const files = [];
  await new Promise((done, fail) => yauzl.open(path, { lazyEntries: true }, (error, archive) => {
    if (error) { fail(error); return; }
    archive.on('error', fail); archive.on('entry', entry => {
      (async () => {
        const output = resolve(folder, entry.fileName), local = relative(folder, output);
        assert.ok(local && !isAbsolute(local) && local !== '..' && !local.startsWith('..\\') && !local.startsWith('../'), `Unsafe ZIP entry ${entry.fileName}`);
        if (entry.fileName.endsWith('/')) { await mkdir(output, { recursive: true }); archive.readEntry(); return; }
        const bytes = await new Promise((finish, reject) => archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) { reject(streamError); return; }
          (async () => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); finish(Buffer.concat(chunks)); })().catch(reject);
        }));
        await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
        files.push({ name: entry.fileName, bytes: bytes.length, sha256: hash(bytes) }); archive.readEntry();
      })().catch(failure => { archive.close(); fail(failure); });
    }); archive.on('end', done); archive.readEntry();
  }));
  return { zip: path, sha256: await sha(path), output: folder, files };
}
const desktop = await decode(desktopZip, join(decoded, 'desktop')), mobile = await decode(mobileZip, join(decoded, 'mobile'));
for (const name of ['index.html', 'game.js', 'build-meta.json']) assert.ok((await readFile(join(desktop.output, name))).equals(await readFile(join(candidate, name))), `Decoded desktop ${name} differs`);
assert.ok((await readFile(join(mobile.output, 'Viral-Invasion-Mobile.html'))).equals(await readFile(mobileHtml)), 'Decoded mobile HTML differs from delivered HTML');
const report = { version: '0.15.0', scope: 'Independent released ZIP decoding followed by actual offline file loading, public start/pause/resume inputs and read-only diagnostics. No supplied battlefield/storage; touch layout is desktop emulation, not physical-phone evidence.',
  startedAt: new Date().toISOString(), sourceBefore, decoded: [desktop, mobile], cases: [], pass: false };
const cases = [
  { name: 'chrome-desktop-decoded', channel: 'chrome', path: join(desktop.output, 'index.html'), viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'edge-desktop-decoded', channel: 'msedge', path: join(desktop.output, 'index.html'), viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'chrome-mobile-decoded', channel: 'chrome', path: join(mobile.output, 'Viral-Invasion-Mobile.html'), viewport: { width: 667, height: 320 }, touch: true },
  { name: 'edge-mobile-delivered-html', channel: 'msedge', path: mobileHtml, viewport: { width: 844, height: 390 }, touch: true },
];
for (const config of cases) {
  const result = { ...config, sha256: await sha(config.path), errors: [], remoteRequests: [], pass: false }; let browser;
  try {
    browser = await chromium.launch({ channel: config.channel, headless: true });
    const context = await browser.newContext({ viewport: config.viewport, hasTouch: config.touch, isMobile: config.touch, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.on('pageerror', error => result.errors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) result.remoteRequests.push(request.url()); });
    const url = pathToFileURL(config.path); if (config.touch) url.searchParams.set('mobile', '1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__viral?.diagnostics().art.actorContract.ready, {}, { timeout: 60000 });
    result.menu = await page.evaluate(() => ({ version: window.__viral.version, phase: window.__viral.snapshot().phase, art: window.__viral.diagnostics().art.actorContract,
      selectedAssets: window.__viral.diagnostics().art.selectedAssets, phaseRoot: document.documentElement.dataset.mobile }));
    assert.equal(result.menu.version, '0.15.0-expedition'); assert.equal(result.menu.phase, 'menu'); assert.equal(result.menu.selectedAssets, 278);
    const start = page.locator('[data-action="endless-start"]').filter({ visible: true }).first();
    if (config.touch) await start.tap(); else await start.click();
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing' && window.__viral.snapshot().tick >= 90);
    result.play = await page.evaluate(() => { const s = window.__viral.snapshot(), d = window.__viral.diagnostics(); return { phase: s.phase, tick: s.tick, stage: s.territory?.stage,
      nodeCount: s.territory?.nodes.length, supplies: s.territory?.construction?.supplies, hasBuilding: !!s.territory?.construction?.building,
      loadout: s.expedition?.loadout, nativePlayer: d.art.actorFrames.find(actor => actor.actorId === 'player' && actor.native && !actor.fallback), errors: d.phaser.errors ?? [] }; });
    assert.equal(result.play.stage, 'rescue'); assert.equal(result.play.nodeCount, 7); assert.equal(result.play.supplies, 2); assert.equal(result.play.hasBuilding, false);
    assert.equal(result.play.loadout.weaponId, 'steady'); assert.ok(result.play.nativePlayer);
    await page.screenshot({ path: join(out, `${config.name}.png`) });
    if (config.touch) await page.locator('#mobile-controls [data-action="pause"]').tap(); else await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'paused'); result.pausedAt = await page.evaluate(() => window.__viral.snapshot().elapsed);
    await page.waitForTimeout(150); assert.equal(await page.evaluate(() => window.__viral.snapshot().elapsed), result.pausedAt);
    const resume = page.locator('[data-action="continue"]').filter({ visible: true }).first(); if (config.touch) await resume.tap(); else await resume.click();
    await page.waitForFunction(t => window.__viral.snapshot().phase === 'playing' && window.__viral.snapshot().elapsed > t, result.pausedAt);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.remoteRequests, []); result.pass = true; await context.close();
  } catch (error) { result.failure = error.stack ?? String(error); }
  finally { if (browser) await browser.close(); report.cases.push(result); await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); }
}
report.sourceAfter = Object.fromEntries(await Promise.all(Object.keys(metadata.sourceManifest).map(async path => [path, await sha(path)])));
report.sourcesUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); report.finishedAt = new Date().toISOString();
report.pass = report.cases.length === 4 && report.cases.every(item => item.pass) && report.sourcesUnchanged;
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(({ name, pass, errors, remoteRequests, failure }) => ({ name, pass, errors, remoteRequests, failure })), sourcesUnchanged: report.sourcesUnchanged }));
if (!report.pass) process.exitCode = 1;
