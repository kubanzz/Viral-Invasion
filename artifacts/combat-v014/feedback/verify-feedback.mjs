import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const folder = resolve('artifacts/combat-v014/feedback');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { method: 'Public development entry, real keyboard/mouse and trusted CDP touch; snapshots and projection read only. No session state, actors or clock injection.', entry: 'http://127.0.0.1:4190/?seed=71', physicalPhone: false, errors: [], desktop: {}, touch: {} };
const snap = page => page.evaluate(() => window.__viral.snapshot());
async function until(fn, predicate, label, limit = 10000) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) { const value = await fn(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 30)); }
  throw Error(`Timed out: ${label}`);
}
async function start(context) {
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(report.entry);
  await page.locator('[data-action="endless-start"]').click();
  await until(() => snap(page), s => s.phase === 'playing', 'playing');
  return page;
}
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await start(context), before = await snap(page);
  await page.mouse.move(1100, 240); await page.keyboard.press('KeyQ');
  const deployed = await until(() => snap(page), s => s.growth?.beacons?.length === 1, 'foot garrison');
  const beacon = deployed.growth.beacons[0];
  if (Math.hypot(beacon.x - before.player.x, beacon.y - before.player.y) > .1) throw Error('Q beacon is not at the player feet');
  if (deployed.growth.cells.some(c => Math.hypot(c.x - beacon.x, c.y - beacon.y) > 60)) throw Error('Q cell birth was remote');
  await page.screenshot({ path: `${folder}/desktop-foot-garrison.png` });
  await page.keyboard.press('Digit1'); await page.mouse.move(940, 430); await page.mouse.down();
  const primary = await until(() => snap(page), s => s.playerProjectiles?.some(p => p.kind === 'primary'), 'primary capsule');
  await page.screenshot({ path: `${folder}/desktop-primary-capsules.png` });
  await page.mouse.up(); await page.keyboard.press('Digit2'); await page.mouse.down();
  const cannon = await until(() => snap(page), s => s.playerProjectiles?.some(p => p.kind === 'cannon'), 'medicine energy glob');
  await page.screenshot({ path: `${folder}/desktop-energy-glob.png` }); await page.mouse.up();
  report.desktop = { before: { player: before.player, aim: before.battle.lastAim }, deployed: { player: deployed.player, beacon, cells: deployed.growth.cells }, primaryBodies: primary.playerProjectiles, cannonBodies: cannon.playerProjectiles };
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 1 });
  const touchPage = await start(mobile), cdp = await mobile.newCDPSession(touchPage), contacts = new Map();
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id,p]) => ({ id, ...p, radiusX: 3, radiusY: 3, force: 1 })) });
  const down = async (id,p) => { contacts.set(id,p); await send('touchStart', [...contacts]); };
  const up = async id => { const p = contacts.get(id); contacts.delete(id); await send('touchEnd', [[id,p]]); };
  const move = async (id,p) => { contacts.set(id,p); await send('touchMove', [...contacts]); };
  const center = async selector => { const r = await touchPage.locator(selector).boundingBox(); return { x:r.x+r.width/2, y:r.y+r.height/2 }; };
  const stick = await center('[data-stick="move"]'), attack = await center('.mobile-attack'), q = await center('[data-touch-skill="scan"]');
  await down(1, { x: stick.x+25, y: stick.y }); await down(2, attack);
  const active = await until(() => snap(touchPage), s => s.shots > 0 && s.player.moving, 'two live fingers');
  await down(3,q);
  const instant = await until(() => snap(touchPage), s => s.growth?.beacons?.length === 1, 'Q acts before release');
  const gesture = await touchPage.locator('#mobile-controls').getAttribute('data-gesture');
  if (gesture !== 'idle') throw Error(`Q opened a remote preview: ${gesture}`);
  if (!instant.player.moving || instant.shots < active.shots) throw Error('Q blocked movement or primary fire');
  await move(3,{x:q.x-80,y:q.y+35});
  const preview = await touchPage.evaluate(() => window.__viral.diagnostics().touch.preview);
  if (preview) throw Error('Dragging Q restored a remote placement preview');
  await up(3); await move(1,stick);
  await until(() => snap(touchPage), s => s.shots > instant.shots, 'held primary survives Q');
  await touchPage.screenshot({ path: `${folder}/mobile-immediate-foot-garrison.png` });
  await up(2); await up(1);
  report.touch = { active: { player: active.player, shots: active.shots }, acceptedBeforeRelease: { player: instant.player, shots: instant.shots, beacon: instant.growth.beacons[0], cells: instant.growth.cells }, gesture, remotePreview: preview ?? null, final: await snap(touchPage) };
  await mobile.close();
  const inputs = ['src/game/growth.ts','src/game/immuneFocus.ts','src/input/controller.ts','src/input/touchControls.ts','src/render/playerProjectileVisuals.ts','src/render/growthVisuals.ts'];
  report.sourceSha256 = Object.fromEntries(await Promise.all(inputs.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  if (report.errors.length) throw Error(report.errors.join('\n'));
  report.passed = true;
} catch (e) { report.passed = false; report.failure = e.stack ?? String(e); process.exitCode = 1; }
finally { await browser.close(); await writeFile(`${folder}/input-and-render-review.json`, JSON.stringify(report,null,2)); }
console.log(JSON.stringify({ passed: report.passed, errors: report.errors, failure: report.failure, folder }));
