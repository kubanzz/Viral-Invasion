import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/verify-release.mjs <unpacked-release-directory>');
const mode = process.argv[3] ?? 'campaign';
if (!['campaign', 'endless'].includes(mode)) throw new Error('Expected campaign or endless mode');
const output = process.env.VI_RELEASE_REPORT ?? process.argv[4] ?? 'artifacts/G4/release-smoke';
await mkdir(output, { recursive: true });
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const report = { scope: 'Smoke test of the unpacked player release; offline file entry, real DOM keyboard/mouse, read-only diagnostics. Not a complete victory, performance or human playtest.',
  directory, mode, hashes: {}, browsers: [], pass: false };
for (const name of ['index.html', 'game.js', 'build-meta.json']) {
  const packaged = await hash(resolve(directory, name)), built = await hash(resolve('dist', name));
  report.hashes[name] = { packaged, built, match: packaged === built };
  if (packaged !== built) throw new Error(`Unpacked ${name} differs from the tested build.`);
}
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const errors = [], remoteRequests = [];
  try {
    const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
    await page.goto(pathToFileURL(resolve(directory, 'index.html')).href);
    const start = page.locator(`[data-action="${mode === 'endless' ? 'endless-start' : 'start'}"]`);
    await start.waitFor({ state: 'visible' });
    await page.screenshot({ path: `${output}/${channel}-menu.png` });
    await start.click();
    const before = await page.evaluate(() => window.__viral.snapshot());
    if ((mode === 'endless') !== !!before.endless || (mode === 'campaign') !== !!before.campaign) throw new Error(`${channel}: wrong release mode.`);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
    const moved = await page.evaluate(() => window.__viral.snapshot());
    if (moved.phase !== 'playing' || moved.player.x <= before.player.x || moved.tick <= before.tick) throw new Error(`${channel}: movement did not advance.`);
    await page.keyboard.press('Escape');
    const paused = await page.evaluate(() => window.__viral.snapshot());
    await page.waitForTimeout(250);
    const still = await page.evaluate(() => window.__viral.snapshot());
    if (paused.phase !== 'paused' || still.tick !== paused.tick) throw new Error(`${channel}: pause did not freeze the simulation.`);
    await page.locator('[data-action="continue"]').click(); await page.keyboard.press('KeyQ');
    await page.waitForTimeout(100);
    const final = await page.evaluate(() => window.__viral.snapshot());
    if (final.scans < 1 || errors.length || remoteRequests.length) throw new Error(`${channel}: scan/errors/network checks failed.`);
    await page.screenshot({ path: `${output}/${channel}-playing.png` });
    report.browsers.push({ channel, version: await browser.version(), pass: true, errors, remoteRequests,
      startTick: before.tick, finalTick: final.tick, scans: final.scans, pausedTick: paused.tick });
  } finally { await browser.close(); }
}
report.pass = report.browsers.length === 2 && report.browsers.every(item => item.pass);
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, browsers: report.browsers.map(item => item.channel), output }));
