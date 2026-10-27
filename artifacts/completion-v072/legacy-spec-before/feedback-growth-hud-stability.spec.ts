import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, readState, walk } from './campaignDriver';
import { describeProtocol, protocolAction, protocolRank } from '../../src/game/protocols';

const entryPath = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = pathToFileURL(entryPath).href;
const beaconSlot = '#protocol-slots [data-protocol="IMMUNE_BEACON"]';
const detailsEntry = '.growth-panel [data-action="growth-details"]';
test.use({ video: 'off', trace: 'off' });

async function expectStableNode(page: Page, selector: string) {
  const node = await page.locator(selector).first().elementHandle();
  expect(node).not.toBeNull();
  try {
    // Several ordinary 50ms HUD updates must preserve this exact DOM node.
    await page.waitForTimeout(350);
    expect(await node!.evaluate((element, css) => element === document.querySelector(css), selector)).toBe(true);
  } finally { await node?.dispose(); }
}

test('Feedback: protocol HUD preserves DOM between real equips, upgrades and cell hits, then resets on retry', async ({ page, context }, info) => {
  test.setTimeout(100000);
  await context.setOffline(true);
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#protocol-slots .empty')).toHaveCount(3);
  await expectStableNode(page, '#protocol-slots .empty');
  await expectStableNode(page, detailsEntry);

  const start = await readState(page), source = start.targets.find(target => target.id === 'source-a')!;
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
  await expect(page.locator(`${beaconSlot} b`)).toHaveText('免疫灯塔 Ⅰ');
  await expect(page.locator(`${beaconSlot} small`)).toHaveText('待触发');
  await expect(page.locator('#evolution-feedback')).toBeVisible();
  await expectStableNode(page, beaconSlot);
  await expectStableNode(page, '#evolution-feedback strong');
  const equipped = await readState(page);

  expect(equipped.growth!.research).toBeGreaterThanOrEqual(3);
  const station = equipped.battle!.graph.nodes.find(node => node.kind === 'research')!;
  await walk(page, station, 35);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await readState(page)).growth?.draft?.source).toBe('research');
  const secondDraft = (await readState(page)).growth!.draft!;
  const advancedBeacon = secondDraft.options.find(option => option.protocolId === 'IMMUNE_BEACON' && option.rank === 2)!;
  expect(advancedBeacon).toBeDefined();
  await page.locator(`[data-action="draft-option"][data-option="${advancedBeacon.id}"]`).click();
  await expect(page.locator(`${beaconSlot} b`)).toHaveText('免疫灯塔 Ⅱ');
  const advanced = await readState(page), slot = advanced.growth!.equipped.find(item => item.id === 'IMMUNE_BEACON')!;
  expect(protocolRank(slot)).toBe(2);
  const description = describeProtocol(slot.id, slot.tuning, protocolRank(slot));
  expect(await page.locator(beaconSlot).getAttribute('title')).toContain(description.effect);
  await expectStableNode(page, beaconSlot);
  await expectStableNode(page, '#evolution-feedback strong');

  const target = advanced.targets.filter(candidate => candidate.hp > 0).sort((a, b) => Math.hypot(a.x - advanced.player.x, a.y - advanced.player.y) - Math.hypot(b.x - advanced.player.x, b.y - advanced.player.y))[0];
  expect(target).toBeDefined();
  await walk(page, { x: target.x - 100, y: target.y + 90 }, 45);
  const liveTarget = (await readState(page)).targets.find(candidate => candidate.id === target.id && candidate.hp > 0)!;
  expect(liveTarget).toBeDefined();
  const beforeHits = await readState(page), initialCount = beforeHits.growth!.activations?.IMMUNE_BEACON ?? 0;
  const slotNode = await page.locator(beaconSlot).elementHandle();
  const countNode = await page.locator(`${beaconSlot} small`).elementHandle();
  expect(slotNode).not.toBeNull(); expect(countNode).not.toBeNull();
  try {
    await aim(page, liveTarget);
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => {
      const state = await readState(page);
      return state.events.some(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= beforeHits.tick && Number(event.data.damage) > 0);
    }, { timeout: 8000 }).toBe(true);
    await page.locator(detailsEntry).click();
    const paused = await readState(page), count = paused.growth!.activations?.IMMUNE_BEACON ?? 0;
    expect(count).toBeGreaterThan(initialCount);
    await expect(page.locator(`${beaconSlot} small`)).toHaveText(`触发 ${count}`);
    expect(await slotNode!.evaluate((node, selector) => node === document.querySelector(selector), beaconSlot)).toBe(true);
    expect(await countNode!.evaluate((node, selector) => node === document.querySelector(selector), `${beaconSlot} small`)).toBe(true);
    const details = page.getByRole('dialog', { name: '当前配装详情' });
    await expect(details.locator('[data-protocol="IMMUNE_BEACON"] .growth-detail-action')).toHaveText(protocolAction(slot.id, 2));
    await expect(details.locator('[data-activation-count]')).toHaveText(String(count));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="retry"]').click();
    const retry = await readState(page);
    expect(retry.seed).toBe(start.seed);
    expect(retry.growth!.runId).not.toBe(paused.growth!.runId);
    expect(retry.growth!.equipped).toEqual([]);
    expect(retry.growth!.activations).toEqual({});
    await expect(page.locator('#protocol-slots .empty')).toHaveCount(3);
    await expect(page.locator('#protocol-slots [data-protocol]')).toHaveCount(0);
    await expect(page.locator('#evolution-feedback')).toBeHidden();
    await expectStableNode(page, '#protocol-slots .empty');
    await page.locator(detailsEntry).click();
    await expect(details.locator('.growth-detail-card.empty')).toHaveCount(3);
    await expect(details.locator('[data-protocol]')).toHaveCount(0);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    writeFileSync(info.outputPath('growth-hud-stability.json'), JSON.stringify({ start, firstDraft, equipped, secondDraft, advanced, beforeHits, paused, retry, errors, remote, build: JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8')) }, null, 2));
  } finally { await slotNode?.dispose(); await countNode?.dispose(); }
});
