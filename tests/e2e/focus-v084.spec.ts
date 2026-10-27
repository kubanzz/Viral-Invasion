import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { distance } from '../../src/actors/collision';
import { readState } from './campaignDriver';

test.use({ video: 'off', trace: 'off' });
test('natural Q focus accepts real bites, freezes on pause, and empty ground redirects the same squad', async ({ page, context }, info) => {
  test.setTimeout(90000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 560 });
  const errors: string[] = [], remote: string[] = [], observations: unknown[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  let state = await readState(page), commandedId = '', firstUntil = 0, firstBeacon = '', firstIds: string[] = [];
  try {
    const deadline = Date.now() + 35000;
    while (!commandedId && Date.now() < deadline) {
      state = await readState(page); expect(state.phase).toBe('playing');
      const candidates = await page.evaluate(() => {
        const s = window.__viral.snapshot();
        return s.targets.filter(t => t.hp > 0).map(t => ({ id: t.id, hp: t.hp, radius: t.radius, world: { x: t.x, y: t.y }, screen: window.__viral.toScreen(t) }))
          .filter(t => t.screen.x > 260 && t.screen.x < innerWidth - 250 && t.screen.y > 110 && t.screen.y < innerHeight - 150)
          .sort((a, b) => b.world.x - a.world.x || a.id.localeCompare(b.id));
      });
      if (candidates.length && state.targets.filter(t => t.hp > 0).length >= 2) {
        const target = candidates[0];
        await page.mouse.move(target.screen.x, target.screen.y); await page.keyboard.press('KeyQ');
        await expect.poll(async () => (await readState(page)).growth?.beacon?.focus?.targetId, { timeout: 1500 }).toBe(target.id);
        state = await readState(page); commandedId = target.id;
        firstBeacon = state.growth!.beacon!.id; firstUntil = state.growth!.beacon!.until;
        firstIds = state.growth!.cells!.map(c => c.id);
        observations.push({ acceptedOrder: state, intendedTarget: target });
        const status = page.locator('#immune-focus-status'); await expect(status).toBeVisible(); await expect(status).toContainText('围猎');
        const bounds = await status.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.width); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
        await page.screenshot({ path: info.outputPath('natural-focus-order.png') });
        await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
        const paused = await readState(page), text = await status.textContent(); await page.waitForTimeout(350);
        expect((await readState(page)).tick).toBe(paused.tick); expect(await status.textContent()).toBe(text);
        observations.push({ paused }); await page.locator('[data-action="continue"]').click();
      } else await page.waitForTimeout(75);
    }
    expect(commandedId).not.toBe('');
    await expect.poll(async () => {
      state = await readState(page);
      return state.events.some(e => e.type === 'TARGET_HIT' && e.data.id === commandedId && e.data.protocolId === 'IMMUNE_BEACON' && Number(e.data.damage) > 0);
    }, { timeout: 5000 }).toBe(true);
    observations.push({ afterRealBite: state });
    const actual = state.events.filter(e => e.type === 'TARGET_HIT' && e.data.id === commandedId && e.data.protocolId === 'IMMUNE_BEACON' && Number(e.data.damage) > 0);
    expect(actual.some(hit => state.events.some(e => e.type === 'PROTOCOL_BEACON_HIT' && e.data.rootId === hit.data.rootId && e.data.prioritizedFocus === true))).toBe(true);
    await expect.poll(async () => { state = await readState(page); return state.elapsed >= state.scanReady; }, { timeout: 5000 }).toBe(true);
    expect(state.growth!.beacon!.id).toBe(firstBeacon); expect(state.elapsed).toBeLessThan(firstUntil);
    const empty = await page.evaluate(() => {
      const s = window.__viral.snapshot();
      for (const dx of [0, -100, 100]) for (const dy of [-100, 100, 0]) {
        const p = { x: s.player.x + dx, y: s.player.y + dy }, q = window.__viral.toScreen(p);
        if (q.x < 260 || q.x > innerWidth - 250 || q.y < 110 || q.y > innerHeight - 150) continue;
        if (s.targets.every(t => t.hp <= 0 || Math.hypot(t.x - p.x, t.y - p.y) > t.radius + 80)) return { world: p, screen: q };
      }
      return null;
    });
    expect(empty).not.toBeNull();
    const beforeRedirect = await readState(page);
    await page.mouse.move(empty!.screen.x, empty!.screen.y); await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await readState(page)).events.some(e => e.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
    state = await readState(page); observations.push({ beforeRedirect, empty, redirected: state });
    expect(state.growth!.beacon!.id).toBe(firstBeacon); expect(state.growth!.beacon!.until).toBe(firstUntil);
    expect(state.growth!.beacon!.focus).toBeUndefined(); expect(state.growth!.cells!.map(c => c.id)).toEqual(firstIds);
    expect(state.growth!.beaconReadyAt).toBe(beforeRedirect.growth!.beaconReadyAt);
    for (const cell of state.growth!.cells!) {
      const previous = beforeRedirect.growth!.cells!.find(c => c.id === cell.id)!;
      expect(cell.until).toBe(previous.until);
      expect(distance(cell, previous)).toBeLessThanOrEqual(190 * (state.elapsed - beforeRedirect.elapsed) + 1e-6);
    }
    await expect(page.locator('#immune-focus-status')).toBeHidden();
    expect(state.events.filter(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'protocol-pressure')).toHaveLength(1);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    state = await readState(page);
    writeFileSync(info.outputPath('natural-focus.json'), JSON.stringify({ scope: 'Real production offline DOM/keyboard/mouse, natural first-wave targets, no state injection.', commandedId, observations, final: state, errors, remote }, null, 2));
  }
});
