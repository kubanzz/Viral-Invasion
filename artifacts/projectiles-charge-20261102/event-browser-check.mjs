import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/projectiles-charge-20261102');
await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
try {
  for (const [width, height, touch] of [[1366,768,false],[1100,560,false],[844,390,true],[667,320,true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = { width, height, touch, scope: 'Explicit campaign G2 EXERCISE URL fixture; real mouse/keyboard or touchscreen controls; no game-state writes.', errors };
    results.push(record);
    const read = () => page.evaluate(() => window.__viral.snapshot());
    const activate = async selector => {
      const node = page.locator(selector).first();
      await node.waitFor({ state: 'visible' });
      if (touch) { const box = await node.boundingBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); }
      else await node.click();
    };
    const layout = () => page.locator('#host-event-announcement').evaluate(node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      const elements = [...document.querySelectorAll('.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions,.mobile-map,.endless-upgrade')]
        .filter(element => !element.hidden && getComputedStyle(element).display !== 'none');
      return { rect: rect.toJSON(), client: node.clientHeight, scroll: node.scrollHeight,
        pointerEvents: style.pointerEvents, expanded: node.dataset.expanded,
        title: document.getElementById('host-announcement-title').textContent,
        description: document.getElementById('host-announcement-description').textContent,
        controls: elements.map(element => ({ selector: element.className, rect: element.getBoundingClientRect().toJSON() })) };
    });
    await page.goto(`http://127.0.0.1:5173/?seed=41&fixture=G2&hostEvent=EXERCISE${touch ? '&mobile=1' : ''}`);
    await activate('[data-action="start"]');
    record.actualLayout = await page.evaluate(() => document.body.classList.contains('touch-mode') ? 'touch' : 'desktop');
    await page.locator('#host-event-announcement[data-phase="warning"]').waitFor({ state: 'visible' });
    record.warning = await layout();
    assert(record.warning.title === '宿主准备运动', 'missing opening warning');
    assert(record.warning.rect.height <= (touch ? 64 : 90), 'warning exceeds height limit');
    assert(record.warning.scroll <= record.warning.client + 1, 'warning text clipped');
    assert(record.warning.rect.left >= 0 && record.warning.rect.right <= width, 'warning horizontal overflow');
    assert(record.warning.pointerEvents === 'none', 'announcement intercepts controls');
    assert(!record.warning.controls.some(control => overlap(record.warning.rect, control.rect)), 'warning overlaps control');
    await page.screenshot({ path: resolve(output, `event-warning-${width}x${height}.png`) });
    await page.waitForFunction(() => window.__viral.snapshot().elapsed >= 2.2);
    record.compactWarning = await layout();
    assert(record.compactWarning.expanded === 'false', 'warning did not shrink');
    if (touch) await activate('[data-action="mobile-details"]');
    else await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'paused');
    const paused = await read();
    await page.waitForTimeout(350);
    assert((await read()).tick === paused.tick, 'pause advanced simulation');
    assert(await page.locator('#host-event-announcement').isHidden(), 'announcement obstructs pause/details');
    if (touch) await activate('[data-action="mobile-close-details"]');
    else await activate('[data-action="continue"]');
    await page.locator('#host-event-announcement').waitFor({ state: 'visible' });
    record.resumed = await layout();
    assert(record.resumed.expanded === 'false', 'details replayed old warning reveal');
    await page.waitForFunction(() => window.__viral.snapshot().hostEvents?.active?.phase === 'active', { timeout: 15000 });
    await page.locator('#host-event-announcement[data-phase="active"][data-expanded="true"]').waitFor({ state: 'visible' });
    record.active = await layout();
    assert(record.active.title === '宿主开始运动', 'missing active announcement');
    assert(record.active.description.includes('−30%') && record.active.description.includes('+25%') && record.active.description.includes('+15%'), 'missing actual active effects');
    assert(record.active.rect.height <= (touch ? 64 : 90), 'active exceeds height limit');
    assert(record.active.scroll <= record.active.client + 1, 'active effects clipped');
    assert(!record.active.controls.some(control => overlap(record.active.rect, control.rect)), 'active overlaps control');
    await page.screenshot({ path: resolve(output, `event-active-${width}x${height}.png`) });
    const startsAt = (await read()).hostEvents.active.startsAt;
    await page.waitForFunction(starts => window.__viral.snapshot().elapsed >= starts + 3.1, startsAt, { timeout: 10000 });
    await page.locator('#host-event-announcement[data-phase="active"][data-expanded="false"]').waitFor({ state: 'visible' });
    record.compactActive = await layout();
    assert(record.compactActive.expanded === 'false', 'active did not shrink');
    assert(errors.length === 0, 'browser page error');
    record.passed = true;
    await context.close();
    await writeFile(resolve(output, 'event-browser-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: 'Chrome', source: 'http://127.0.0.1:5173 (source dev server)', physicalPhone: false, naturalWave3: false, results }, null, 2));
    console.log(`event announcement ${width}x${height} passed`);
  }
} catch (error) {
  results.at(-1).failure = error.stack;
  await writeFile(resolve(output, 'event-browser-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: 'Chrome', source: 'http://127.0.0.1:5173 (source dev server)', physicalPhone: false, naturalWave3: false, results }, null, 2));
  throw error;
} finally { await browser.close(); }
