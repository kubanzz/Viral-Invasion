import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { emptyProfile, PROFILE_STORAGE_KEY } from '../../src/meta/profile';
import { readState, aim, chooseDraftInput } from './campaignDriver';
import { fullRun } from './fullRunDriver';
import { g3Input } from '../helpers/g3Driver';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });
test.beforeEach(async ({ context }) => { await context.setOffline(true); });

async function tabTo(page: Page, selector: string) {
  for (let count = 0; count < 30; count++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluateAll(nodes => nodes.some(node => node === document.activeElement))) return;
  }
  throw new Error(`Keyboard focus could not reach ${selector}`);
}

// Read-only snapshots plan ordinary key/mouse input. This helper stops before
// acknowledging the guide so persistence can be checked independently.
async function reachMigration(page: Page) {
  const deadline = Date.now() + 65000;
  let lastScan = -10, lastInteract = -10;
  while (Date.now() < deadline) {
    if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
      await page.mouse.up(); return 'guide';
    }
    const s = await readState(page);
    if (s.growth?.draft) { await page.mouse.up(); await chooseDraftInput(page); continue; }
    if (s.phase === 'playing' && s.campaign!.migration.status === 'warning') {
      await page.waitForTimeout(100);
      return await page.locator('[data-action="close-migration-guide"]').isVisible() ? 'guide' : 'warning';
    }
    expect(s.phase).toBe('playing');
    const input = g3Input(s, 'ignore');
    if (s.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
    await aim(page, input.aim);
    if (input.fire) await page.mouse.down(); else await page.mouse.up();
    if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    if (input.interact && s.elapsed - lastInteract > .25) { await page.keyboard.press('KeyE'); lastInteract = s.elapsed; }
    const keys = [Math.abs(input.moveX) > .383 ? input.moveX > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(input.moveY) > .383 ? input.moveY > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(85);
    for (const key of keys) await page.keyboard.up(key);
  }
  throw new Error('Migration warning did not arrive through public input');
}

test('UI patch: Tab reaches archive, arrows scroll it, and paused input does not leak', async ({ page }, info) => {
  await page.setViewportSize({ width: 850, height: 560 });
  await page.goto(entry);
  await tabTo(page, '[data-action="profile"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('.profile-dialog')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveAttribute('inert', '');
  await tabTo(page, '.profile-scroll');
  const scroll = page.locator('.profile-scroll');
  const before = await scroll.evaluate(node => node.scrollTop);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
  await page.screenshot({ path: info.outputPath('keyboard-archive.png') });
  await page.keyboard.press('Escape');
  await page.locator('[data-action="start"]').click();
  await page.keyboard.press('Escape');
  const paused = await readState(page);
  await page.keyboard.press('Digit3');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(150); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyQ');
  expect((await readState(page)).tick).toBe(paused.tick);
  await page.locator('[data-action="continue"]').click();
  await page.waitForTimeout(180);
  const resumed = await readState(page);
  expect(resumed.player.x).toBe(paused.player.x); expect(resumed.tool).toBe(paused.tool); expect(resumed.scans).toBe(paused.scans);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  expect((await readState(page)).player.x).toBeGreaterThan(resumed.player.x);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readState(page)).dashes).toBeGreaterThan(resumed.dashes);
  await page.keyboard.press('Escape');
  await page.locator('#overlay-host [data-action="help"]').click();
  const helpTick = (await readState(page)).tick;
  await tabTo(page, '[data-action="close-help"]');
  await page.keyboard.press('Shift+Tab');
  expect(await page.locator('.topbar').evaluate(node => node.contains(document.activeElement))).toBe(false);
  await tabTo(page, '[data-action="close-help"]');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-action="close-help"]')).toHaveCount(0);
  expect((await readState(page)).tick).toBe(helpTick); expect((await readState(page)).phase).toBe('paused');
  await page.locator('#overlay-host [data-action="history"]').click();
  await tabTo(page, '[data-action="close-history"]'); await page.keyboard.press('Enter');
  expect((await readState(page)).phase).toBe('paused');
  await tabTo(page, '[data-action="continue"]'); await page.keyboard.press('Enter');
  await expect(page.locator('.topbar')).not.toHaveAttribute('inert', '');
  expect((await readState(page)).phase).toBe('playing');
});

test('UI patch: URL accepts uint32 seed zero and rejects malformed or out of range values', async ({ page }) => {
  for (const [query, expected] of [['?seed=0', 0], ['?seed=4294967295', 4294967295], ['', 130026], ['?seed=', 130026], ['?seed=-1', 130026], ['?seed=1.5', 130026], ['?seed=4294967296', 130026], ['?seed=NaN', 130026]] as const) {
    await page.goto(entry + query);
    expect(await page.evaluate(() => window.__viral.version)).toBe('0.5.1-G4');
    expect((await readState(page)).seed).toBe(expected);
  }
  await page.goto(entry + '?scenario=training&seed=0');
  expect((await readState(page)).battle).toBeUndefined(); expect((await readState(page)).seed).toBe(0);
  await page.goto(entry + '?fixture=G1&trait=MIMIC&seed=0');
  expect((await readState(page)).battle!.milestone).toBe('G1'); expect((await readState(page)).seed).toBe(0);
});

test('UI patch: old two-trait archive still gets unacknowledged guide, confirmation persists and a full run wins', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  const oldProfile = JSON.parse(JSON.stringify(emptyProfile()));
  delete oldProfile.onboarding;
  oldProfile.discoveredTraits = ['CARAPACE', 'FISSION'];
  await page.goto(entry);
  // This is explicitly an old-storage fixture; combat state is never written.
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: PROFILE_STORAGE_KEY, data: oldProfile });
  await page.reload(); await page.locator('[data-action="start"]').click();
  expect(await reachMigration(page)).toBe('guide');
  const first = await readState(page); expect(first.phase).toBe('paused');
  await expect(page.locator('.topbar')).toHaveAttribute('inert', '');
  await page.waitForTimeout(200); expect((await readState(page)).tick).toBe(first.tick);
  await page.screenshot({ path: info.outputPath('old-profile-first-guide.png') });
  await page.reload(); await page.locator('[data-action="start"]').click();
  expect(await reachMigration(page)).toBe('guide');
  if (info.project.name === 'chrome') await page.keyboard.press('Escape');
  else await page.locator('[data-action="close-migration-guide"]').click();
  await expect(page.locator('[data-action="close-migration-guide"]')).toHaveCount(0);
  expect((await readState(page)).phase).toBe('playing');
  const confirmed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
  expect(confirmed.onboarding.migrationGuideAcknowledged).toBe(true);
  await fullRun(page, 'ignore');
  const final = await readState(page); expect(final.result?.success).toBe(true);
  await page.screenshot({ path: info.outputPath('result.png') });
  await page.locator('[data-action="retry"]').click();
  const retry = await readState(page); expect(retry.seed).toBe(final.seed); expect(retry.growth!.xp).toBe(0); expect(retry.player.hp).toBe(100);
  await page.reload(); await page.locator('[data-action="start"]').click();
  expect(await reachMigration(page)).toBe('warning');
  await page.keyboard.press('Escape');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
  expect(saved.onboarding.migrationGuideAcknowledged).toBe(true); expect(saved.stats.wins).toBe(1);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
  writeFileSync(info.outputPath('migration-guide-regression.json'), JSON.stringify({ first, confirmed, final, saved, errors, remote }, null, 2));
});
