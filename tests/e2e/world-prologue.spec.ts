import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CAMP_PROFILE_STORAGE_KEY, emptyCampProfile } from '../../src/meta/campProfile';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';

test.use({ video: 'off', trace: 'off' });
const entry = process.env.VI_ENTRY_URL ?? pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const storyKey = 'vi-world-prologue-v3';
const story = (page: Page) => page.locator('#world-prologue');
const snapshot = (page: Page) => page.evaluate(() => window.__viral.snapshot());

async function waitGameReady(page: Page) {
  await page.waitForFunction(() => !!window.__viral);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}

async function openMenu(page: Page, query = '') {
  const url = new URL(entry);
  if (query) for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
  await page.goto(url.href);
  await waitGameReady(page);
  await expect(page.locator('[data-action="endless-start"]')).toBeVisible();
}

async function startStory(page: Page) {
  await page.locator('[data-action="endless-start"]').click();
  await expect(story(page)).toBeVisible();
  await expect(story(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(story(page)).toHaveAttribute('data-load-errors', '0');
  await expect(story(page)).toHaveAttribute('data-media', 'video');
  await expect.poll(async () => Number(await story(page).getAttribute('data-decoded-frames'))).toBeGreaterThan(0);
}

test('first arrival can skip the story, clears held input and remembers the story independently', async ({ page }) => {
  await openMenu(page);
  await startStory(page);
  await expect(page.locator('#app')).toHaveJSProperty('inert', true);
  const before = await snapshot(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyW');
  await expect(story(page)).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).camp?.prologue).toBe('arrival');
  await expect(page.locator('#app')).toHaveJSProperty('inert', false);
  expect(await page.evaluate(key => localStorage.getItem(key), storyKey)).toBe('seen');
  const arrived = await snapshot(page);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).player.x).toBe(arrived.player.x);
  expect((await snapshot(page)).player.y).toBe(arrived.player.y);
  expect((await snapshot(page)).camp?.introComplete).toBe(false);

  await page.reload();
  await waitGameReady(page);
  await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => (await snapshot(page)).camp?.prologue).toBe('arrival');
  await expect(story(page)).toHaveCount(0);
});

test('replaying from an established save returns to the same menu without touching camp progression', async ({ page }) => {
  const saved = { ...emptyCampProfile(), campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
    prologue: 'ready' as const, builtFacilities: [...INTRO_FACILITY_IDS], coins: 12345, materials: 67 };
  await page.addInitScript(({ key, json }) => localStorage.setItem(key, json),
    { key: CAMP_PROFILE_STORAGE_KEY, json: JSON.stringify(saved) });
  await openMenu(page);
  const before = await snapshot(page);
  const savedBefore = await page.evaluate(key => localStorage.getItem(key), CAMP_PROFILE_STORAGE_KEY);
  await page.getByRole('button', { name: '重看序章' }).click();
  await expect(story(page)).toBeVisible();
  await expect(story(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-prologue-action="pause"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(story(page)).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-prologue-action="skip"]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(story(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重看序章' })).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(key => localStorage.getItem(key), CAMP_PROFILE_STORAGE_KEY)).toBe(savedBefore);
  await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => (await snapshot(page)).camp?.prologue).toBe('ready');
  expect((await snapshot(page)).camp?.introComplete).toBe(true);
  await expect(story(page)).toHaveCount(0);
});

test('manual pause survives orientation and browser focus changes', async ({ page }) => {
  await openMenu(page);
  await startStory(page);
  await page.keyboard.press('KeyP');
  await expect(story(page)).toHaveAttribute('data-paused', 'true');
  const elapsed = Number(await story(page).getAttribute('data-elapsed'));
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.waitForTimeout(250);
  expect(Number(await story(page).getAttribute('data-elapsed'))).toBeCloseTo(elapsed, 1);
  await page.setViewportSize({ width: 1200, height: 760 });
  await expect(story(page)).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('KeyP');
  await expect(story(page)).toHaveAttribute('data-paused', 'false');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(story(page)).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(story(page)).toHaveAttribute('data-paused', 'false');
  await page.locator('[data-prologue-action="skip"]').click();
  await expect(story(page)).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
});

test('a denied story storage write does not block entry or trap keyboard input', async ({ page }) => {
  await page.addInitScript(key => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name: string) {
      if (name === key) throw new DOMException('Story storage disabled', 'SecurityError');
      return read.call(this, name);
    };
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new DOMException('Story storage disabled', 'QuotaExceededError');
      return write.call(this, name, value);
    };
  }, storyKey);
  await openMenu(page);
  await startStory(page);
  await page.keyboard.press('Escape');
  await expect(story(page)).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).camp?.prologue).toBe('arrival');
  const before = await snapshot(page);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snapshot(page)).player.x).toBeGreaterThan(before.player.x + 10);
  await page.keyboard.up('KeyD');
});

test('a quick pause and resume while the play promise settles keeps the film moving', async ({ page }) => {
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return nativePlay.call(this).then(() => new Promise<void>(resolve => setTimeout(resolve, 350)));
    };
  });
  await openMenu(page);
  await page.locator('[data-action="endless-start"]').click();
  await expect(story(page)).toBeVisible();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyP');
  await expect(story(page)).toHaveAttribute('data-paused', 'false');
  await expect.poll(async () => Number(await story(page).getAttribute('data-elapsed'))).toBeGreaterThan(.5);
  expect(await story(page).locator('video').evaluate(video => (video as HTMLVideoElement).paused)).toBe(false);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).camp?.prologue).toBe('arrival');
});

test('explicit training and development fixtures retain their direct game entry', async ({ page }) => {
  const url = new URL(entry);
  url.searchParams.set('scenario', 'training');
  await page.goto(url.href);
  await waitGameReady(page);
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await expect(story(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), storyKey)).toBeNull();

  const fixture = new URL(entry);
  fixture.searchParams.set('fixture', 'G1');
  await page.goto(fixture.href);
  await waitGameReady(page);
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await expect(story(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), storyKey)).toBeNull();
});
