import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), out = resolve(root, 'artifacts/duet-v087/release/offline-smoke-2');
const inspection = JSON.parse(await readFile('artifacts/duet-v087/release/inspection-2/inspection.json', 'utf8'));
if (!inspection.pass) throw new Error('Independent ZIP inspection has not passed');
await mkdir(out); const results = [];
const entry = pathToFileURL(resolve(root, 'artifacts/duet-v087/release/inspection-2/independently-decoded/index.html')).href;
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } }); await context.setOffline(true);
    const page = await context.newPage(), errors = [], remote = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
    await page.goto(`${entry}?seed=71`); await page.locator('[data-action="start"]').click();
    const sample = () => page.evaluate(() => { const s = window.__viral.snapshot(); return { version: window.__viral.version, phase: s.phase,
      campaign: !!s.campaign, endless: !!s.endless, worldWidth: s.world?.width, wave: s.endless?.wave, hp: s.player.hp, renderer: !!document.querySelector('canvas') }; });
    const campaign = await sample();
    if (!campaign.campaign || campaign.endless || campaign.phase !== 'playing' || campaign.version !== '0.8.7-G4' || !campaign.renderer) throw new Error('Extracted campaign boot differs');
    await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="endless-start"]').click();
    const endless = await sample();
    if (endless.campaign || !endless.endless || endless.phase !== 'playing' || endless.wave !== 1 || endless.worldWidth !== 2400) throw new Error('Extracted endless boot differs');
    if (errors.length || remote.length) throw new Error(JSON.stringify({ errors, remote }));
    results.push({ channel, campaign, endless, errors, remote, pass: true });
    await context.close();
  } finally { await browser.close(); }
}
await writeFile(resolve(out, 'report.json'), JSON.stringify({ entry, scope: 'Independently decoded ZIP, two installed browsers, offline campaign/endless boot and mode switch only.', results, pass: true }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ pass: true, browsers: results.length, modeGroups: results.length * 2 }));
