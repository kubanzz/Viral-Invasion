import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';

// Explicit collection fixture, followed by real UI/keyboard/touch actions in the
// complete production application. This is not a naturally earned reward,
// complete expedition, physical-phone test, performance test or human playtest.
const output = resolve(process.env.VI_IDENTITY_OUTPUT ?? 'artifacts/weapon-identity-v017/qa');
const version = process.env.VI_IDENTITY_VERSION ?? '0.17.0';
const scenario = process.env.VI_IDENTITY_SCENARIO ?? 'camp-trial';
assert.ok(['camp-trial', 'multitouch-only'].includes(scenario));
const campKey = 'viral-invasion:1:camp-profile';
const fixture = {
  game: 'viral-invasion', mode: 'camp', schemaVersion: 1,
  campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
  blueprints: ['launch-pod'], materials: 40, victories: 0,
  weapons: { steady: { repaired: 'white', pending: null, upgrade: 0 }, piercing: { repaired: 'white', pending: null, upgrade: 0 } },
  equipped: 'steady', extraAntibodyStock: 0, claimedRewardIds: [],
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  scope: 'Explicit unlocked two-weapon collection fixture; production app with real camp switching and real click, keyboard, and touch trial inputs. No natural victory or reward claim.',
  fixture, version, scenario, startedAt: new Date().toISOString(), cases: [], errors: [], pass: false,
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, scenario === 'camp-trial' ? 'harness.mjs' : 'multitouch-harness.mjs'), await readFile(new URL(import.meta.url)));
report.harnessSha256 = sha(await readFile(new URL(import.meta.url)));
const persist = () => writeFile(resolve(output, scenario === 'camp-trial' ? 'report.json' : 'multitouch-report.json'), JSON.stringify(report, null, 2));
let served, browser;

async function attest(metadata) {
  const mismatches = [];
  for (const [path, expected] of Object.entries(metadata.sourceManifest ?? {})) {
    try { if (sha(await readFile(path)) !== expected) mismatches.push(path); }
    catch { mismatches.push(path); }
  }
  return { count: Object.keys(metadata.sourceManifest ?? {}).length, mismatches };
}
const snapshot = page => page.evaluate(() => window.__viral.snapshot());
const diagnostics = page => page.evaluate(() => window.__viral.diagnostics());
const trialView = page => page.evaluate(() => window.__viral.diagnostics().campTrial);
const profile = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), campKey);

async function until(read, accept, label, timeout = 3500) {
  const started = Date.now(); let value;
  while (Date.now() - started < timeout) {
    value = await read(); if (accept(value)) return value;
    await new Promise(done => setTimeout(done, 20));
  }
  throw Error(`${label}: ${JSON.stringify(value).slice(0, 1400)}`);
}

function summary(view) {
  if (!view) return null;
  return { elapsed: view.elapsed, shots: view.shots, hits: view.hits, totalDamage: view.totalDamage,
    loadout: view.loadout, skillCasts: view.skillCasts, projectiles: view.projectiles,
    effects: view.effects, events: view.events, overdriveRemaining: view.overdriveRemaining,
    weaponState: view.weaponState, anchors: view.anchors, rings: view.rings,
    returning: view.returning, weaponAssetId: view.weaponAssetId };
}

function assertMechanic(weaponId, slot, samples) {
  const projectiles = samples.flatMap(view => view.projectiles ?? []), effects = samples.flatMap(view => view.effects ?? []);
  const validEvents = samples.flatMap(view => (view.events ?? []).filter(event => {
    const age = view.elapsed - event.tick / 60; return age >= -1e-7 && age <= .5;
  }));
  if (weaponId === 'steady') {
    if (slot === 0) assert.ok(projectiles.some(shot => shot.visual === 'hive-needle'), 'Steady primary uses its hive needle visual');
    if (slot === 1) {
      assert.ok(projectiles.some(shot => shot.visual === 'swarm-needle'), 'Swarm uses its distinct guided needle visual');
      const directions = new Map();
      for (const view of samples) for (const shot of view.projectiles ?? []) {
        if (shot.visual !== 'swarm-needle') continue;
        const values = directions.get(shot.id) ?? []; values.push(Math.atan2(shot.direction.y, shot.direction.x)); directions.set(shot.id, values);
      }
      assert.ok([...directions.values()].some(values => values.length > 1 && Math.abs(values.at(-1) - values[0]) > .015), 'At least one real guided needle turns toward the target');
    }
    if (slot === 2) {
      assert.ok(validEvents.some(event => event.type === 'PLAYER_CANNON_EXPLODED' && event.data.visual === 'pulse-ring' && event.data.radius === 155), 'Repulsion creates a currently visible real 155-radius pulse ring');
    }
    if (slot === 3) {
      assert.ok(samples.some(view => view.overdriveRemaining > 0), 'Overdrive has an active real duration');
      assert.ok(samples.some(view => view.projectiles?.filter(shot => shot.visual === 'hive-needle').length === 3), 'Overdrive primary adds exactly two visible side needles');
    }
  } else {
    if (slot === 0 || slot === 3) {
      const visual = slot === 0 ? 'crescent' : 'storm-crescent';
      assert.ok(projectiles.some(shot => shot.visual === visual), `${visual} is a real projectile`);
      assert.ok(projectiles.some(shot => shot.visual === visual && shot.flightPhase === 'outbound'), `${visual} flies outbound`);
      assert.ok(projectiles.some(shot => shot.visual === visual && shot.flightPhase === 'returning'), `${visual} really enters its returning phase`);
    }
    if (slot === 1) assert.ok(projectiles.some(shot => shot.visual === 'heavy-blade'), 'Prepared attack launches its real heavy blade');
    if (slot === 2) assert.ok(projectiles.some(shot => shot.visual === 'anchor' && Number.isFinite(shot.detonateAt)), 'Anchor remains on ground until its real detonation time');
  }
}

async function runCase(width, height) {
  const touch = width < 1000;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch,
    isMobile: touch, deviceScaleFactor: 1, recordVideo: { dir: resolve(output, 'video'), size: { width, height } } });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: campKey, value: fixture });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const item = { width, height, input: touch ? 'trusted browser touchscreen taps' : 'mouse clicks and keyboard', pageErrors: [], responseHashes: {}, errors: [], weapons: [], screenshots: [], pass: false };
  report.cases.push(item);
  page.on('pageerror', error => item.pageErrors.push(String(error)));
  page.on('request', request => { if (!['data:', 'blob:'].some(prefix => request.url().startsWith(prefix)) && new URL(request.url()).origin !== new URL(served.entry).origin) item.errors.push(`Unexpected remote request ${request.url()}`); });
  const drain = await observeServedResponses(cdp, item, new URL(served.entry).origin);
  const screenshot = async name => {
    const file = `${width}-${name}.png`; await page.screenshot({ path: resolve(output, file) });
    item.screenshots.push(file); return file;
  };
  const activate = async selector => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const node = page.locator(selector).filter({ visible: true }).first();
      try {
        await node.waitFor({ state: 'visible', timeout: 5000 }); await node.scrollIntoViewIfNeeded();
        if (touch) await node.tap(); else await node.click();
        // Changing the trial layout rebuilds its overlay on the next RAF. Wait
        // for that public UI transition before resolving the following control.
        await page.waitForTimeout(45); return;
      } catch (error) {
        if (attempt === 2 || !String(error).includes('not attached')) throw error;
        await page.waitForTimeout(60);
      }
    }
  };
  const warehouse = async () => {
    await page.waitForTimeout(70);
    for (let attempt = 0; await page.locator('#camp-toolbar').isVisible() && attempt < 3; attempt++) {
      await activate('#camp-toolbar [data-action="camp-section"][data-section="overview"]');
      await page.waitForTimeout(80);
    }
    await activate('.camp-nav [data-action="camp-section"][data-section="warehouse"]');
    await page.locator('[data-camp-weapon="piercing"]').waitFor();
  };
  try {
    await page.goto(`${served.entry}?seed=170071${touch ? '&mobile=1' : ''}`, { waitUntil: 'load' });
    await page.bringToFront();
    await until(() => page.evaluate(() => window.__viral?.version), value => value?.startsWith(version), 'Candidate runtime version');
    await activate('[data-action="camp-open"]');
    await until(() => snapshot(page), value => !!value.camp, 'Entered production camp');
    await warehouse();
    assert.equal(await page.locator('[data-camp-skill]').count(), 6);
    await screenshot('warehouse-both-kits');
    for (const weaponId of ['steady', 'piercing']) {
      const weapon = { weaponId, assetId: null, held: null, trial: [], pass: false }; item.weapons.push(weapon);
      const equip = page.locator(`[data-action="camp-equip"][data-weapon="${weaponId}"]`).first();
      if (await equip.isEnabled()) await activate(`[data-action="camp-equip"][data-weapon="${weaponId}"]`);
      assert.equal((await profile(page)).equipped, weaponId);
      await activate('[data-action="camp-close"]');
      await until(() => snapshot(page), value => value.phase === 'playing' && !!value.camp, 'Closed camp overlay');
      await page.mouse.move(width * .72, height * .55);
      await page.waitForTimeout(150);
      weapon.held = { state: await snapshot(page), diagnostics: await diagnostics(page) };
      weapon.assetId = weapon.held.diagnostics.art.weapon.assetId;
      assert.ok(weapon.assetId, `${weaponId} has a real held weapon asset`);
      weapon.heldScreenshot = await screenshot(`${weaponId}-held`);
      await warehouse();
      await activate(`[data-action="camp-trial"][data-weapon="${weaponId}"]`);
      await page.locator('#camp-trial-canvas').waitFor({ state: 'visible' });
      assert.equal((await trialView(page)).loadout.weaponId, weaponId);
      assert.equal((await trialView(page)).weaponAssetId, weapon.assetId, 'Practice and camp use the same distinct weapon identity');
      const beforeTrial = await profile(page);
      for (const method of touch ? ['tap'] : ['click', 'keyboard']) {
        for (const slot of [0, 1, 2, 3]) {
          await activate(`[data-action="camp-trial-layout"][data-layout="${weaponId === 'steady' && slot === 2 ? 'line' : 'single'}"]`);
          await activate('[data-action="camp-trial-reset"]');
          await activate('[data-action="camp-trial-cooldowns"]');
          const action = { method, slot, samples: [], screenshots: [], pass: false }; weapon.trial.push(action);
          const began = Date.now();
          if (method === 'keyboard') await page.keyboard.press(`Digit${slot}`);
          else await activate(slot === 0 ? '[data-action="camp-trial-fire"]' : `[data-action="camp-trial-skill"][data-slot="${slot}"]`);
          await until(() => trialView(page), view => slot === 0 ? view?.shots > 0 : view?.skillCasts[slot] > 0, `${weaponId} ${method} ${slot} accepted`, 1500);
          if (weaponId === 'steady' && slot === 3) {
            action.samples.push(summary(await trialView(page)));
            if (method === 'keyboard') await page.keyboard.press('Digit0');
            else await activate('[data-action="camp-trial-fire"]');
          }
          let first = true, late = false, mechanic = false;
          let simulated = 0;
          while (Date.now() - began < 6000 && simulated < 1.7) {
            const view = await trialView(page); action.samples.push(summary(view));
            simulated = view.elapsed;
            const elapsed = Date.now() - began;
            if (first) { action.screenshots.push(await screenshot(`${weaponId}-${method}-${slot}-cast`)); first = false; }
            if (!late && elapsed > (slot === 3 ? 450 : 520)) { action.screenshots.push(await screenshot(`${weaponId}-${method}-${slot}-active`)); late = true; }
            const hasMoment = view.projectiles?.some(shot => shot.flightPhase === 'returning' || shot.visual === 'anchor' && Number.isFinite(shot.detonateAt));
            if (!mechanic && hasMoment) { action.screenshots.push(await screenshot(`${weaponId}-${method}-${slot}-mechanic`)); mechanic = true; }
            await page.waitForTimeout(20);
          }
          const final = await trialView(page); action.final = summary(final);
          if (!(weaponId === 'steady' && slot === 3)) assert.ok(final.totalDamage > 0, `${weaponId} ${method} ${slot} deals actual trial damage`);
          else assert.ok(action.samples.some(view => view.overdriveRemaining > 0), 'Overdrive has real remaining duration');
          assertMechanic(weaponId, slot, action.samples);
          action.pass = true;
        }
      }
      assert.deepEqual(await profile(page), beforeTrial, 'Practice never changes collection, materials or reward ledger');
      weapon.layout = await page.evaluate(() => {
        const panel = document.querySelector('.camp-panel'), content = document.querySelector('.camp-content');
        const c = document.getElementById('camp-trial-canvas').getBoundingClientRect(), clip = content.getBoundingClientRect();
        const buttons = [...panel.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0).map(b => {
          const r = b.getBoundingClientRect(); return { action: b.dataset.action, slot: b.dataset.slot, x: r.x, y: r.y, width: r.width, height: r.height };
        });
        return { panelOverflow: panel.scrollWidth > panel.clientWidth, canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
          canvasInside: c.left >= clip.left - .5 && c.right <= clip.right + .5 && c.top >= clip.top - .5 && c.bottom <= clip.bottom + .5,
          buttons, viewport: { width: innerWidth, height: innerHeight } };
      });
      assert.equal(weapon.layout.panelOverflow, false, 'No horizontal camp overflow');
      assert.equal(weapon.layout.canvasInside, true, 'Entire practice canvas stays inside content');
      assert.ok(weapon.layout.canvas.height >= 85, 'Visible practice canvas');
      assert.ok(weapon.layout.buttons.every(button => button.width >= 48 && button.height >= 48), 'All camp buttons meet 48px minimum');
      await screenshot(`${weaponId}-trial-layout`); weapon.pass = true;
      await activate('[data-action="camp-section"][data-section="warehouse"]');
    }
    assert.notEqual(item.weapons[0].assetId, item.weapons[1].assetId, 'Camp equip must change the real held weapon asset');
    assert.deepEqual(item.pageErrors, []); assert.deepEqual(item.errors, []);
    item.pass = true;
  } catch (error) {
    item.error = String(error.stack ?? error); report.errors.push(`${width}x${height}: ${item.error}`);
    await screenshot('failure').catch(() => {});
    item.failureState = await snapshot(page).catch(() => null);
    item.failureDiagnostics = await diagnostics(page).catch(() => null);
  } finally {
    await drain(); const video = page.video(); await context.close(); if (video) item.video = await video.path(); await persist();
  }
}

async function runMultiTouch() {
  const width = 667, height = 320;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 1, recordVideo: { dir: resolve(output, 'video'), size: { width, height } } });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: campKey, value: fixture });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), touches = new Map();
  const item = { width, height, input: 'trusted CDP three-pointer production challenge after explicit collection fixture', pageErrors: [], errors: [], responseHashes: {}, assertions: [], screenshots: [], pass: false };
  report.cases.push(item); page.on('pageerror', error => item.pageErrors.push(String(error)));
  const drain = await observeServedResponses(cdp, item, new URL(served.entry).origin);
  const center = async selector => {
    const node = page.locator(selector).filter({ visible: true }).first(); await node.waitFor({ state: 'visible' });
    const b = await node.boundingBox(); assert.ok(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height };
  };
  const touch = async (type, id, point) => {
    if (type === 'touchEnd') {
      const ended = touches.get(id); if (!ended) return;
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [ended] }); touches.delete(id);
    } else if (type === 'touchCancel') {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [] }); touches.clear();
    } else {
      touches.set(id, { id, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
    }
  };
  const tap = async selector => { const node = page.locator(selector).filter({ visible: true }).first(); await node.tap(); await page.waitForTimeout(100); };
  const screenshot = async name => { const file = `667-live-${name}.png`; await page.screenshot({ path: resolve(output, file) }); item.screenshots.push(file); };
  try {
    await page.goto(`${served.entry}?seed=170071&mobile=1`, { waitUntil: 'load' }); await page.bringToFront();
    await until(() => page.evaluate(() => window.__viral?.version), value => value?.startsWith(version), 'Candidate ready');
    await tap('[data-action="camp-open"]'); await until(() => snapshot(page), state => !!state.camp, 'Entered fixture-unlocked camp');
    await page.waitForTimeout(100); await tap('#camp-toolbar [data-action="camp-section"][data-section="overview"]');
    await tap('.camp-nav [data-action="camp-section"][data-section="warehouse"]');
    await tap('[data-action="camp-equip"][data-weapon="piercing"]');
    item.preparedProfile = await until(() => profile(page), value => value.equipped === 'piercing', 'Actual camp equip persistence');
    await tap('.camp-nav [data-action="camp-section"][data-section="departure"]'); await tap('[data-action="camp-deploy"]');
    await until(() => snapshot(page), state => !state.camp && state.phase === 'playing', 'Actual challenge deployment');
    assert.equal((await snapshot(page)).weaponCombat.loadout.weaponId, 'piercing');
    const controls = await Promise.all(['[data-stick="move"]', '[data-stick="attack"]', '[data-weapon-skill="3"]'].map(selector => center(`#mobile-controls ${selector}`)));
    const [move, attack, fan] = controls; item.controls = controls;
    assert.ok(controls.every(control => control.width >= 48 && control.height >= 48));
    await touch('touchStart', 1, { x: move.x + 26, y: move.y });
    await touch('touchStart', 2, attack); await touch('touchMove', 2, { x: attack.x + 20, y: attack.y - 4 });
    await until(() => snapshot(page), state => state.shots >= 2, 'Held two-pointer primary');
    const before = await snapshot(page); item.before = before;
    await touch('touchStart', 3, fan);
    await until(() => diagnostics(page), view => view.touch.preview?.weaponSlot === 3, 'Third pointer fan preview');
    await touch('touchMove', 3, { x: fan.x + 21, y: fan.y - 6 });
    const during = await diagnostics(page); item.preview = during.touch;
    await screenshot('three-pointer-preview'); await touch('touchEnd', 3);
    await until(() => snapshot(page), state => state.weaponCombat.cooldowns[3] > state.elapsed, 'Third-pointer storm accepted');
    const seen = []; const deadline = Date.now() + 1800;
    while (Date.now() < deadline) { const state = await snapshot(page); seen.push({ elapsed: state.elapsed, shots: state.shots, player: state.player, projectiles: state.playerProjectiles }); await page.waitForTimeout(25); }
    item.samples = seen; const after = await snapshot(page); item.after = after;
    assert.ok(after.shots > before.shots, 'Original fire finger keeps firing after third-pointer release');
    assert.ok(Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 10, 'Original move finger keeps moving after third-pointer release');
    assert.equal(after.events.filter(event => event.type === 'WEAPON_SKILL_CAST' && event.data.skillId === 'piercing-fan').length, 1, 'Third pointer casts one real storm');
    assert.ok(seen.some(state => state.projectiles.some(shot => shot.visual === 'storm-crescent' && shot.flightPhase === 'returning')), 'Production battle storm actually returns while the player moves');
    await screenshot('three-pointer-storm');
    item.assertions.push('667x320 production deployment with fixture-earned collection', 'two original fingers preserve movement and primary fire', 'third pointer previews and releases exactly one actual storm', 'real storm reaches return phase while the player moves');
    await touch('touchEnd', 2); await touch('touchEnd', 1); await page.keyboard.press('Escape');
    await until(() => snapshot(page), state => state.phase === 'paused', 'Pause after releasing all fingers');
    const paused = await snapshot(page); await page.waitForTimeout(150); assert.equal((await snapshot(page)).tick, paused.tick);
    assert.deepEqual(item.pageErrors, []); item.pass = true;
  } catch (error) {
    item.error = String(error.stack ?? error); report.errors.push(item.error);
    item.failureState = await snapshot(page).catch(() => null); item.failureDiagnostics = await diagnostics(page).catch(() => null);
    await screenshot('multitouch-failure').catch(() => {});
  } finally {
    await touch('touchCancel', 0).catch(() => {}); await drain(); const video = page.video(); await context.close(); if (video) item.video = await video.path(); await persist();
  }
}

try {
  served = await startServedCandidate({ metadataPath: process.env.VI_BUILD_META, expectedVersion: version });
  report.candidate = served.snapshot(); report.sourceBefore = await attest(served.metadata);
  assert.ok(report.sourceBefore.count > 0); assert.deepEqual(report.sourceBefore.mismatches, []);
  report.outputBefore = await served.diskHashes();
  browser = await chromium.launch({ channel: process.env.VI_BROWSER_CHANNEL ?? 'chrome', headless: true });
  if (scenario === 'camp-trial') for (const [width, height] of [[1366, 768], [667, 320]]) await runCase(width, height);
  else await runMultiTouch();
  report.sourceAfter = await attest(served.metadata); assert.deepEqual(report.sourceAfter, report.sourceBefore);
  report.outputAfter = await served.diskHashes(); assert.deepEqual(report.outputAfter, report.outputBefore);
  report.pass = report.cases.length === (scenario === 'camp-trial' ? 2 : 1) && report.cases.every(item => item.pass) && report.errors.length === 0;
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally {
  await browser?.close(); if (served) { report.transport = served.snapshot(); await served.close(); }
  report.finishedAt = new Date().toISOString(); await persist();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(item => ({ width: item.width, pass: item.pass, error: item.error })), errors: report.errors }, null, 2));
if (!report.pass) process.exitCode = 1;
