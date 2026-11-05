import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('artifacts/weapon-identity-v017/file-cold-start'); await mkdir(output, { recursive: true });
const cases = [], metadata = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
assert.equal(metadata.version, '0.17.0');
for (const channel of ['chrome', 'msedge']) for (const mobile of [false, true]) {
  const row = { channel, mobile, offlineBeforeNavigation: true, pageErrors: [], remoteRequests: [], pass: false };
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const context = await browser.newContext({ offline: true, viewport: mobile ? { width: 667, height: 320 } : { width: 1366, height: 768 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    page.on('pageerror', error => row.pageErrors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) row.remoteRequests.push(request.url()); });
    const path = mobile ? 'releases/Viral-Invasion-Mobile.html' : '.tools/release-v0.17.0-verified/index.html';
    row.entry = pathToFileURL(resolve(path)).href;
    await page.goto(row.entry + '?seed=71');
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true', { timeout: 30000 });
    assert.match(await page.evaluate(() => window.__viral.version), /^0\.17\.0/);
    const start = page.locator('[data-action="endless-start"]').filter({ visible: true }).first();
    if (mobile) await start.tap(); else await start.click();
    await expect.poll(async () => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
    await page.waitForTimeout(250);
    row.snapshot = await page.evaluate(() => ({ version: window.__viral.version,
      phase: window.__viral.snapshot().phase, elapsed: window.__viral.snapshot().elapsed,
      weaponId: window.__viral.snapshot().weaponCombat.loadout.weaponId }));
    assert.ok(row.snapshot.elapsed > 0); assert.equal(row.snapshot.weaponId, 'steady');
    assert.deepEqual(row.pageErrors, []); assert.deepEqual(row.remoteRequests, []);
    await page.screenshot({ path: join(output, `${channel}-${mobile ? 'mobile' : 'desktop'}.png`) }); row.pass = true;
  } catch (error) { row.failure = error.stack ?? String(error); }
  finally { await browser.close(); cases.push(row); await writeFile(join(output, 'report.json'), JSON.stringify({ pass: false, cases }, null, 2)); }
}
const report = { pass: cases.every(row => row.pass), version: metadata.version,
  scope: 'Cold file:// boot with network offline before navigation; verified decoded desktop ZIP and delivered single mobile HTML. Real start input and rendered simulation; no profile or battle injection. Not physical-phone evidence.', cases };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report)); if (!report.pass) process.exitCode = 1;
