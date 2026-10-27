import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { aim, readState, walk } from './campaignDriver';
import { describeProtocol, protocolAction, protocolRank, TUNING_NAMES } from '../../src/game/protocols';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

async function tabTo(page: Page, selector: string) {
  for (let count = 0; count < 32; count++) {
    if (await page.locator(selector).evaluateAll(nodes => nodes.includes(document.activeElement!))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${selector}`);
}

test('Feedback 0.6.1: current build details expose real evolved effects, freeze input and return to their origin', async ({ page, context }, info) => {
  test.setTimeout(100000);
  await context.setOffline(true);
  await page.setViewportSize({ width: 850, height: 560 });
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  expect((await readState(page)).world!.width).toBe(2400);

  // The static HUD button remains keyboard focused across frequent slot refreshes.
  const hudEntry = '.growth-panel [data-action="growth-details"]';
  await tabTo(page, hudEntry);
  await page.waitForTimeout(250);
  await expect(page.locator(hudEntry)).toBeFocused();
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: '当前配装详情' });
  await expect(details).toBeVisible();
  await expect(details.locator('.growth-detail-card.empty')).toHaveCount(3);
  await expect(details.locator('.growth-detail-patrol')).toContainText('不占协议槽');
  await expect(details.locator('.growth-detail-patrol')).toContainText('一只免疫细胞');
  const empty = await readState(page);
  expect(empty.phase).toBe('paused');
  await page.keyboard.press('Digit3');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(250);
  expect(await readState(page)).toEqual(empty);
  await expect(page.locator('.topbar')).toHaveAttribute('inert', '');
  await tabTo(page, '.growth-details-scroll');
  const scroll = page.locator('.growth-details-scroll');
  const scrollTop = await scroll.evaluate(node => node.scrollTop);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(scrollTop);
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(page.locator(hudEntry)).toBeFocused();
  await page.waitForTimeout(180);
  const resumed = await readState(page);
  expect(resumed.phase).toBe('playing');
  expect(resumed.player.x).toBe(empty.player.x);
  expect(resumed.player.y).toBe(empty.player.y);
  expect(resumed.tool).toBe(empty.tool);
  expect(resumed.scans).toBe(empty.scans);
  await page.keyboard.up('KeyD');

  // Ordinary campaign input: diagnose and clear the first source, then spend
  // the earned samples at the actual research station to evolve the same route.
  const initial = await readState(page), source = initial.targets.find(target => target.id === 'source-a')!;
  await walk(page, { x: source.x - 140, y: source.y + 100 }, 40);
  await aim(page, source);
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('Digit1');
  await page.mouse.down();
  try {
    await expect.poll(async () => !!(await readState(page)).growth?.draft, { timeout: 15000 }).toBe(true);
  } finally { await page.mouse.up(); }
  const firstDraft = (await readState(page)).growth!.draft!;
  const firstBeacon = firstDraft.options.find(option => option.protocolId === 'IMMUNE_BEACON')!;
  expect(firstBeacon).toBeDefined();
  await page.locator(`[data-action="draft-option"][data-option="${firstBeacon.id}"]`).click();
  const beforeResearch = await readState(page);
  expect(beforeResearch.growth!.research).toBeGreaterThanOrEqual(3);
  const station = beforeResearch.battle!.graph.nodes.find(node => node.kind === 'research')!;
  await walk(page, station, 35);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await readState(page)).growth?.draft?.source).toBe('research');
  const secondDraft = (await readState(page)).growth!.draft!;
  const advancedBeacon = secondDraft.options.find(option => option.protocolId === 'IMMUNE_BEACON' && option.rank === 2)!;
  expect(advancedBeacon).toBeDefined();
  await page.locator(`[data-action="draft-option"][data-option="${advancedBeacon.id}"]`).click();
  const acquired = await readState(page);
  expect(protocolRank(acquired.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON'))).toBe(2);
  const target = acquired.targets.filter(candidate => candidate.hp > 0).sort((a, b) => Math.hypot(a.x - acquired.player.x, a.y - acquired.player.y) - Math.hypot(b.x - acquired.player.x, b.y - acquired.player.y))[0];
  expect(target).toBeDefined();
  await walk(page, { x: target.x - 100, y: target.y + 90 }, 45);
  const liveTarget = (await readState(page)).targets.find(candidate => candidate.id === target.id && candidate.hp > 0)!;
  expect(liveTarget).toBeDefined();
  await aim(page, liveTarget);
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await readState(page)).growth!.activations?.IMMUNE_BEACON ?? 0, { timeout: 8000 }).toBeGreaterThan(0);

  await page.locator(hudEntry).click();
  await expect(details).toBeVisible();
  const paused = await readState(page), equipped = paused.growth!.equipped.find(slot => slot.id === 'IMMUNE_BEACON')!;
  const rank = protocolRank(equipped), description = describeProtocol(equipped.id, equipped.tuning, rank);
  const count = paused.growth!.activations!.IMMUNE_BEACON!;
  const card = details.locator('[data-protocol="IMMUNE_BEACON"]');
  await expect(card).toHaveAttribute('data-rank', String(rank));
  await expect(card).toHaveAttribute('data-tuning', equipped.tuning);
  await expect(card.locator('h3')).toContainText(`免疫灯塔 Ⅱ`);
  await expect(card.locator('h3')).toContainText(TUNING_NAMES[equipped.tuning]);
  await expect(card.locator('.growth-detail-effect')).toHaveText(description.effect);
  await expect(card.locator('.growth-detail-cost')).toHaveText(description.cost);
  await expect(card.locator('.growth-detail-action')).toHaveText(protocolAction(equipped.id, rank));
  await expect(card.locator('[data-activation-count]')).toHaveAttribute('data-activation-count', String(count));
  await expect(card.locator('[data-activation-count]')).toHaveText(String(count));
  expect(count).toBeGreaterThan(0);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Digit3');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  expect(await readState(page)).toEqual(paused);
  await page.screenshot({ path: info.outputPath('advanced-build-details.png') });
  await page.keyboard.press('Escape');
  expect((await readState(page)).phase).toBe('playing');
  await expect(page.locator(hudEntry)).toBeFocused();

  // Nested details return to the existing pause/help/history screen, preserving
  // pause ownership instead of resuming a fight behind the parent screen.
  await page.keyboard.press('Escape');
  const pauseTick = (await readState(page)).tick;
  const overlayEntry = '#overlay-host [data-action="growth-details"]';
  await tabTo(page, overlayEntry);
  await page.keyboard.press('Space');
  await expect(details).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '战斗已暂停' })).toBeVisible();
  await expect(page.locator(overlayEntry)).toBeFocused();
  expect((await readState(page)).tick).toBe(pauseTick);
  await page.locator('#overlay-host [data-action="help"]').click();
  await page.locator(overlayEntry).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '操作指南' })).toBeVisible();
  await expect(page.locator(overlayEntry)).toBeFocused();
  await page.keyboard.press('Escape');
  expect((await readState(page)).phase).toBe('paused');
  await page.locator('#overlay-host [data-action="history"]').click();
  await page.locator(overlayEntry).click();
  await tabTo(page, '[data-action="close-growth-details"]');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '战术记录' })).toBeVisible();
  await expect(page.locator(overlayEntry)).toBeFocused();
  await page.keyboard.press('Escape');
  expect((await readState(page)).phase).toBe('paused');
  expect((await readState(page)).tick).toBe(pauseTick);

  await page.locator('[data-action="retry"]').click();
  const retry = await readState(page);
  expect(retry.seed).toBe(paused.seed);
  expect(retry.growth!.runId).not.toBe(paused.growth!.runId);
  expect(retry.growth!.equipped).toEqual([]);
  expect(retry.growth!.activations).toEqual({});
  expect(retry.growth!.cells).toEqual([]);
  expect(retry.growth!.xp).toBe(0);
  expect(retry.player.hp).toBe(100);
  await page.locator(hudEntry).click();
  await expect(details.locator('.growth-detail-card.empty')).toHaveCount(3);
  await expect(details.locator('[data-protocol]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
  writeFileSync(info.outputPath('growth-details-evidence.json'), JSON.stringify({ empty, firstDraft, secondDraft, acquired, paused, retry, errors, remote, build: JSON.parse(readFileSync('dist/build-meta.json', 'utf8')) }, null, 2));
});
