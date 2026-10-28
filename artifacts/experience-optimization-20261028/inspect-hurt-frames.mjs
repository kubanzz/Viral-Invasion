import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/experience-optimization-20261028/hurt-preview-evidence-v2');
await mkdir(output);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page), captured = [], samples = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
cdp.on('Page.screencastFrame', async frame => {
  captured.push({ time: frame.metadata.timestamp * 1000, jpeg: frame.data });
  await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
});
let pauseTriggered = false;
await page.exposeFunction('onHurtFirstFrame', async () => {
  if (!pauseTriggered) { pauseTriggered = true; await page.keyboard.press('Escape'); }
});
const snap = () => page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() }));
const result = { pass: false, scope: 'Isolated real Renderer, actual 5-HP training action; Chromium screencast frames matched by wall-clock timestamp, not synthesized state.', errors };
try {
  await page.goto('http://127.0.0.1:4185/?scenario=training&seed=71');
  await page.locator('[data-action="start"]').click();
  await page.mouse.move(1000, 360);
  await page.locator('[data-action="help"]').first().click();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 100, everyNthFrame: 1 });
  await page.evaluate(() => {
    window.__hurtCollect = []; window.__hurtStop = false;
    const collect = () => {
      const s = window.__viral.snapshot(), d = window.__viral.diagnostics();
      window.__hurtCollect.push({ time: Date.now(), tick: s.tick, phase: s.phase, hp: s.player.hp, frame: d.art.heroAnimation.frame });
      if (!window.__hurtStop) requestAnimationFrame(collect);
    }; requestAnimationFrame(collect);
  });
  await page.locator('[data-action="practice-hit"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__hurtStop = true; });
  samples.push(...await page.evaluate(() => window.__hurtCollect));
  await cdp.send('Page.stopScreencast');
  for (const index of [0, 1]) {
    const interval = samples.filter(s => s.frame?.clip === 'hurt' && s.frame.index === index);
    if (!interval.length) throw Error(`Frame ${index} not observed`);
    const middle = (interval[0].time + interval.at(-1).time) / 2;
    const frame = captured.reduce((a, b) => Math.abs(b.time - middle) < Math.abs(a.time - middle) ? b : a);
    const offsetMs = frame.time - middle;
    if (Math.abs(offsetMs) > 60) throw Error(`Frame ${index} screenshot timing uncertainty ${offsetMs}ms`);
    const path = `${output}/hurt-${index}.jpg`;
    await writeFile(path, Buffer.from(frame.jpeg, 'base64'), { flag: 'wx' });
    result[`frame${index}`] = { first:interval[0], last:interval.at(-1), screenshotTime:frame.time, offsetMs, path };
  }
  // Trigger a second real hit and request Escape as soon as the first hurt
  // frame is observed; the key is sent by the browser, not by changing state.
  await page.waitForTimeout(700); await page.locator('[data-action="help"]').first().click();
  await page.evaluate(() => {
    const watch = () => {
      if (window.__viral.diagnostics().art.heroAnimation.frame?.clip === 'hurt') window.onHurtFirstFrame();
      else requestAnimationFrame(watch);
    }; requestAnimationFrame(watch);
  });
  await page.locator('[data-action="practice-hit"]').click();
  await page.waitForTimeout(300);
  const before = await snap(); await page.waitForTimeout(600); const after = await snap();
  result.pause = { before: { tick:before.state.tick, phase:before.state.phase, frame:before.diagnostics.art.heroAnimation.frame },
    after: { tick:after.state.tick, phase:after.state.phase, frame:after.diagnostics.art.heroAnimation.frame } };
  if (before.state.phase !== 'paused' || before.diagnostics.art.heroAnimation.frame?.clip !== 'hurt'
      || before.state.tick !== after.state.tick || JSON.stringify(before.diagnostics.art.heroAnimation.frame) !== JSON.stringify(after.diagnostics.art.heroAnimation.frame)) throw Error('Hurt-frame pause not observed or did not freeze');
  result.pass = true;
} catch (e) { result.error = String(e.stack ?? e); process.exitCode = 1; }
finally { await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2)); await browser.close(); }
console.log(JSON.stringify(result));
