import { expect, test as base, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { aim, readState, walk } from './campaignDriver';
import { startHostEventHttpServer } from '../helpers/hostEventHttpServer';

const test = base.extend<{}, { entryURL: string }>({
  entryURL: [async ({}, use) => {
    const server = await startHostEventHttpServer();
    try { await use(server.entryURL); }
    finally { await server.close(); }
  }, { scope: 'worker' }],
});

test.use({ video: 'off', trace: 'off' });

async function start(page: Page, entryURL: string, query: string, seed = 41) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entryURL}?seed=${seed}&${query}`);
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  return errors;
}

test('medication card uses a passive side rail, freezes on Escape and restarts cleanly through real input', async ({ page, entryURL }, info) => {
  const errors = await start(page, entryURL, 'hostEvent=MEDICATION');
  const card = page.locator('#host-event-card');
  await expect(card).toBeVisible(); await expect(card).toHaveAttribute('data-event', 'MEDICATION');
  await expect(page.locator('#host-event-category')).toContainText('绿色');
  await expect(page.locator('#host-event-description')).toContainText('0、8、16');
  await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase).toBe('active');
  const layout = await card.evaluate(node => ({ pointerEvents: getComputedStyle(node).pointerEvents,
    rect: node.getBoundingClientRect().toJSON(), text: node.textContent }));
  expect(layout.pointerEvents).toBe('none'); expect(layout.rect.width).toBeLessThan(240);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  await page.screenshot({ path: info.outputPath('medication-playing.png') });
  await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  const paused = await readState(page), countdown = await page.locator('#host-event-time').textContent();
  await page.waitForTimeout(400);
  expect((await readState(page)).tick).toBe(paused.tick);
  expect((await readState(page)).hostEvents).toEqual(paused.hostEvents);
  expect(await page.locator('#host-event-time').textContent()).toBe(countdown);
  await page.locator('[data-action="continue"]').click();
  await expect.poll(async () => (await readState(page)).tick).toBeGreaterThan(paused.tick);
  await page.keyboard.press('Escape'); await page.locator('[data-action="retry"]').click();
  const retried = await readState(page);
  expect(retried.hostEvents!.usedIds).toEqual(['MEDICATION']);
  expect(retried.hostEvents!.serial).toBe(1);
  expect(retried.hostEvents!.active?.phase).toBe('warning');
  expect(errors).toEqual([]);
  writeFileSync(info.outputPath('medication-evidence.json'), JSON.stringify({ entryURL, paused, retried, layout, errors }, null, 2));
});

test('explicit lung smoke can be cleared with ordinary precision shots and ends when all three targets are destroyed', async ({ page, entryURL }, info) => {
  test.setTimeout(60_000);
  const errors = await start(page, entryURL, 'hostEvent=SMOKE&hostEventOrgan=lung');
  await expect(page.locator('#host-event-category')).toContainText('红色');
  await expect(page.locator('#host-event-phase')).toHaveText('预警');
  await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase, { timeout: 12_000 }).toBe('active');
  let state = await readState(page); expect(state.battle!.organId).toBe('lung');
  const ids = state.hostEvents!.active!.targetIds; expect(ids).toHaveLength(3);
  const xp = state.growth!.xp, research = state.growth!.research;
  await page.screenshot({ path: info.outputPath('smoke-three-sources.png') });
  const shots: unknown[] = [];
  for (const id of ids) {
    state = await readState(page); const target = state.targets.find(target => target.id === id)!;
    await walk(page, target, 95); await aim(page, target); await page.keyboard.press('Digit1');
    await page.mouse.down();
    try {
      await expect.poll(async () => (await readState(page)).targets.find(target => target.id === id)?.hp ?? 0,
        { timeout: 4000, intervals: [100] }).toBe(0);
    } finally { await page.mouse.up(); }
    state = await readState(page); shots.push({ id, state });
    expect(state.hostEvents?.active?.zones.some(zone => zone.targetId === id) ?? false).toBe(false);
  }
  state = await readState(page);
  expect(state.hostEvents!.active).toBeNull(); expect(state.hostEvents!.sources).toEqual({});
  expect(state.growth!.xp).toBe(xp); expect(state.growth!.research).toBe(research);
  expect(state.events.filter(event => event.type === 'HOST_EVENT_TARGET_CLEARED')).toHaveLength(3);
  expect(state.elapsed).toBeLessThan(43); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('smoke-cleared.png') });
  writeFileSync(info.outputPath('smoke-evidence.json'), JSON.stringify({ entryURL, scope: 'Explicit URL organ/card fixture; all movement, aim and fire use real mouse/keyboard. Snapshots are read-only.', shots, final: state, errors }, null, 2));
});

test('exercise reveals its eight-second warning and applies current heart movement/pulse modifiers', async ({ page, entryURL }, info) => {
  const errors = await start(page, entryURL, 'hostEvent=EXERCISE');
  await expect(page.locator('#host-event-category')).toContainText('黄色');
  let state = await readState(page); expect(state.hostEvents!.active!.startsAt - state.hostEvents!.active!.warningStartedAt).toBe(8);
  await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase, { timeout: 12_000 }).toBe('active');
  state = await readState(page); expect(Object.keys(state.hostEvents!.sources)).toHaveLength(1);
  await expect(page.locator('#host-event-description')).toContainText('30%');
  await expect(page.locator('#host-event-description')).toContainText('15%');
  await page.screenshot({ path: info.outputPath('exercise-active.png') });
  expect(errors).toEqual([]);
  writeFileSync(info.outputPath('exercise-evidence.json'), JSON.stringify({ entryURL, state, errors }, null, 2));
});

test('compact event card keeps its full description visible and missing alcohol tissues are explicitly reported', async ({ page, entryURL }, info) => {
  await page.setViewportSize({ width: 480, height: 600 });
  const errors = await start(page, entryURL, 'hostEvent=REST');
  const card = page.locator('#host-event-card'); await expect(card).toBeVisible();
  await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase).toBe('active');
  const layout = await card.evaluate(node => {
    const element = node as HTMLElement, rect = node.getBoundingClientRect();
    const description = node.querySelector('p')!.getBoundingClientRect();
    return { rect: rect.toJSON(), description: description.toJSON(), scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight, pointerEvents: getComputedStyle(node).pointerEvents, width: innerWidth, height: innerHeight };
  });
  expect(layout.rect.left).toBeGreaterThanOrEqual(0); expect(layout.rect.right).toBeLessThanOrEqual(480);
  expect(layout.rect.bottom).toBeLessThan(520);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
  expect(layout.description.bottom).toBeLessThanOrEqual(layout.rect.bottom);
  expect(layout.pointerEvents).toBe('none');
  await page.screenshot({ path: info.outputPath('rest-480x600.png') });
  await page.goto(`${entryURL}?seed=41&hostEvent=ALCOHOL`); await page.locator('[data-action="start"]').click();
  await expect(page.locator('#host-event-card')).toHaveAttribute('data-phase', 'disabled');
  await expect(page.locator('#host-event-description')).toContainText('只有一个可修复组织');
  expect((await readState(page)).hostEvents!.active).toBeNull(); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('alcohol-disabled-480x600.png') });
  writeFileSync(info.outputPath('compact-evidence.json'), JSON.stringify({ entryURL, layout, errors }, null, 2));
});

test('a real gate closure skips a later medication round and keeps its reason visible in compact viewports', async ({ page, entryURL }, info) => {
  const errors = await start(page, entryURL, 'hostEvent=MEDICATION', 4);
  let state = await readState(page);
  const gate = state.battle!.graph.nodes.find(node => node.id === 'gate')!;
  await walk(page, gate, 80); await page.keyboard.press('KeyE');
  await expect.poll(async () => (await readState(page)).battle!.graph.nodes.find(node => node.id === 'gate')!.active).toBe(false);
  await expect.poll(async () => (await readState(page)).hostEvents!.active?.zones.filter(zone => zone.medicationState === 'skipped').length ?? 0,
    { timeout: 12_000, intervals: [100] }).toBeGreaterThan(0);
  await expect(page.locator('#host-event-card')).toHaveAttribute('data-skipped', 'true');
  await expect(page.locator('#host-event-objectives')).toContainText('跳过');
  await expect(page.locator('#host-event-status')).toHaveText('血流路径失效');
  const layouts = [];
  for (const viewport of [{ width: 480, height: 600 }, { width: 1100, height: 560 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('#host-event-card').getAttribute('data-compact')).toBe(String(viewport.width <= 650));
    const layout = await page.locator('#host-event-card').evaluate(node => {
      const card = node as HTMLElement, rect = card.getBoundingClientRect();
      const status = card.querySelector<HTMLElement>('#host-event-status')!;
      const statusRect = status.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll<HTMLElement>('.battle-objective,.battle-telemetry,.growth-panel,.organ-overview,.dock-wrap')]
        .filter(panel => !panel.hidden && getComputedStyle(panel).display !== 'none')
        .filter(panel => { const other = panel.getBoundingClientRect(); return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top; })
        .map(panel => panel.className);
      return { rect: rect.toJSON(), status: statusRect.toJSON(), statusText: status.textContent,
        display: getComputedStyle(status).display, scroll: card.scrollHeight, client: card.clientHeight, overlaps };
    });
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
    expect(layout.overlaps).toEqual([]);
    expect(layout.display).not.toBe('none'); expect(layout.statusText).toBe('血流路径失效');
    expect(layout.status.right).toBeLessThanOrEqual(layout.rect.right + 1);
    expect(layout.status.bottom).toBeLessThanOrEqual(layout.rect.bottom + 1);
    expect(layout.rect.left).toBeGreaterThanOrEqual(0); expect(layout.rect.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.rect.bottom).toBeLessThan(viewport.height - 70);
    layouts.push({ viewport, ...layout });
    await page.screenshot({ path: info.outputPath(`medication-skipped-${viewport.width}x${viewport.height}.png`) });
  }
  state = await readState(page); expect(errors).toEqual([]);
  expect(state.events.some(event => event.type === 'HOST_EVENT_ZONE_SKIPPED')).toBe(true);
  writeFileSync(info.outputPath('medication-skipped-evidence.json'), JSON.stringify({ entryURL, layouts, state, errors }, null, 2));
});
