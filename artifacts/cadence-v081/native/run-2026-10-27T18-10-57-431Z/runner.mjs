import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { build } from '../../node_modules/esbuild/lib/main.js';

// Deliberately gated: preparing/checking this file never launches a browser.
const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
if (!process.argv.includes('--run')) throw new Error('Preparation only: explicit --run is required after coordinator hash/GPU authorization.');
const expected = process.env.VI_NATIVE_BUILD_SHA256?.toLowerCase();
if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('Set the coordinator-provided VI_NATIVE_BUILD_SHA256 before running.');
if (process.env.VI_NATIVE_GPU_WINDOW !== 'granted') throw new Error('No reserved GPU window: VI_NATIVE_GPU_WINDOW must be explicitly granted by the coordinator.');
const entryPath = resolve(project, process.env.VI_NATIVE_ENTRY ?? 'dist/index.html');
const gamePath = join(dirname(entryPath), 'game.js');
const sha = value => createHash('sha256').update(value).digest('hex');
const bundleHash = () => sha(readFileSync(gamePath));
assert.equal(bundleHash(), expected, 'Frozen game.js identity differs; no browser has been started.');
const metaPath = join(dirname(entryPath), 'build-meta.json');
const metadata = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
const root = resolve(project, 'artifacts/cadence-v081/native');
mkdirSync(root, { recursive: true });
const output = join(root, `run-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`);
mkdirSync(output); // A prior result directory must never be reused.
const profiles = resolve(project, '.tools/native-qualification-feasibility', `profiles-${Date.now()}`);
mkdirSync(profiles);
const json = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const stateHash = state => sha(JSON.stringify(state));
const state = page => page.evaluate(() => window.__viral.snapshot());
const entry = new URL(pathToFileURL(entryPath));
const urlFor = parameters => { const url = new URL(entry); for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value)); return url.href; };
const report = { startedAt: new Date().toISOString(), status: 'running', expectedBuildSha256: expected, entry: entry.href,
  metadata, scope: 'Finite automated browser acceptance through real DOM input and CDP native browser window operations; not human hardware input, human readability or universal gameplay acceptance.',
  channels: [], limitations: ['document.hidden and visibilitychange are recorded as observed; no hidden-state assertion or synthetic fallback.',
    'Zoom shooting/repair use the real training fixture and do not establish every campaign/layout hit case.',
    'One naturally earned campaign XP draft per browser; not every protocol, replacement or research flow.'] };
writeFileSync(join(output, 'runner.mjs'), readFileSync(fileURLToPath(import.meta.url)), { flag: 'wx' });
const helpers = await build({ stdin: { contents: "export { fullRun } from './tests/e2e/fullRunDriver.ts';", resolveDir: project, sourcefile: 'native-helper-entry.mjs' },
  bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, metafile: true });
const helperPath = join(profiles, 'helpers.mjs');
writeFileSync(helperPath, helpers.outputFiles[0].contents, { flag: 'wx' });
writeFileSync(join(output, 'helpers.mjs'), helpers.outputFiles[0].contents, { flag: 'wx' });
report.helperInputs = Object.fromEntries(Object.keys(helpers.metafile.inputs).filter(path => !path.startsWith('<') && existsSync(resolve(project, path))).map(path => [path, sha(readFileSync(resolve(project, path)))]));
const { fullRun } = await import(pathToFileURL(helperPath));

async function poll(reader, condition, label, timeout = 8000) {
  const until = Date.now() + timeout; let value;
  while (Date.now() < until) { value = await reader(); if (condition(value)) return value; await wait(40); }
  throw new Error(`${label}; last=${JSON.stringify(value)}`);
}
async function screenshot(page, name) { writeFileSync(join(output, name), await page.screenshot(), { flag: 'wx' }); }
async function observe(page) {
  await page.addInitScript(() => {
    globalThis.__qualificationEvents = [];
    for (const type of ['blur', 'focus']) window.addEventListener(type, event => {
      if (event.target === window) globalThis.__qualificationEvents.push({ type: event.type, target: 'window', isTrusted: event.isTrusted, wall: Date.now(), hidden: document.hidden, hasFocus: document.hasFocus() });
    });
    document.addEventListener('visibilitychange', event => globalThis.__qualificationEvents.push({ type: event.type, target: 'document', isTrusted: event.isTrusted, wall: Date.now(), hidden: document.hidden, hasFocus: document.hasFocus() }));
    for (const type of ['pointerdown', 'pointerup']) window.addEventListener(type, event => globalThis.__qualificationEvents.push({ type: event.type, target: event.target?.tagName, isTrusted: event.isTrusted, wall: Date.now(), x: event.clientX, y: event.clientY }), true);
  });
}
async function nativePage(context, item, parameters) {
  const page = await context.newPage(); await observe(page);
  page.on('pageerror', error => item.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') item.consoleErrors.push(message.text()); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) item.remoteRequests.push(request.url()); });
  await page.goto(urlFor(parameters)); await page.waitForFunction(() => !!window.__viral);
  const cdp = await context.newCDPSession(page);
  // Playwright's default true override prevents native focus provenance. Disable it.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const handle = { page, cdp, windowId };
  await cdp.send('Page.bringToFront');
  await poll(() => page.evaluate(() => document.hasFocus()), Boolean, 'Game window did not gain actual focus');
  return handle;
}
async function browserFacts(handle) {
  const { page, cdp, windowId } = handle;
  return { bounds: (await cdp.send('Browser.getWindowBounds', { windowId })).bounds, layout: await cdp.send('Page.getLayoutMetrics'),
    page: await page.evaluate(() => ({ hidden: document.hidden, visibilityState: document.visibilityState, hasFocus: document.hasFocus(), innerWidth, innerHeight, outerWidth, outerHeight,
      devicePixelRatio, visualViewportScale: visualViewport.scale, events: globalThis.__qualificationEvents })) };
}
async function minimizeFreeze(handle, label, seconds, requirePlaying) {
  const { page, cdp, windowId } = handle; const before = await state(page), factsBefore = await browserFacts(handle);
  assert.equal(before.phase, requirePlaying ? 'playing' : 'paused');
  assert.equal(factsBefore.page.hasFocus, true);
  const eventOffset = factsBefore.page.events.length, issuedAt = Date.now();
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  const minimized = await poll(() => browserFacts(handle), facts => facts.bounds.windowState === 'minimized' && !facts.page.hasFocus, 'No actual minimized/unfocused browser state');
  assert(minimized.page.events.slice(eventOffset).some(event => event.type === 'blur' && event.target === 'window' && event.isTrusted), 'Missing trusted native window blur');
  const frozen = await poll(() => state(page), s => s.phase === 'paused', 'Game did not auto-pause on native blur');
  const baselineHash = stateHash(frozen); json(`${label}-paused-full-state.json`, frozen);
  const began = Date.now(), samples = [];
  while (Date.now() - began < seconds * 1000) {
    await wait(Math.min(1000, seconds * 1000 - (Date.now() - began)));
    const sample = await state(page); const hash = stateHash(sample);
    samples.push({ wallSinceBaselineMs: Date.now() - began, tick: sample.tick, elapsed: sample.elapsed, gameStateSha256: hash });
    assert.deepEqual(sample, frozen, 'A full GameState field changed while minimized/paused');
  }
  const beforeRestore = await browserFacts(handle);
  assert.equal(beforeRestore.bounds.windowState, 'minimized');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await cdp.send('Page.bringToFront');
  const restored = await poll(() => browserFacts(handle), facts => facts.bounds.windowState === 'normal' && facts.page.hasFocus, 'Native window did not restore/focus');
  const afterRestore = await state(page); assert.deepEqual(afterRestore, frozen, 'Restoring must preserve the complete paused GameState');
  const receipt = { passed: true, secondsRequested: seconds, wallFrozenMs: Date.now() - began, issuedAt, eventOffset, before, factsBefore, minimized, baselineHash, samples, beforeRestore, restored, afterRestore };
  json(`${label}-freeze.json`, receipt); return receipt;
}
async function hitAccessible(locator, page) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox(); assert(box && box.width > 0 && box.height > 0, 'Control has no visible box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const result = await locator.evaluate((el, point) => ({ inside: point.x >= 0 && point.y >= 0 && point.x < innerWidth && point.y < innerHeight,
    hit: el === document.elementFromPoint(point.x, point.y) || el.contains(document.elementFromPoint(point.x, point.y)), disabled: el.disabled === true }), point);
  assert(result.inside && result.hit && !result.disabled, `Control is unreachable: ${JSON.stringify({ box, result })}`);
  return { box, point, ...result };
}
async function setZoom(context, handle, channel, factor, label) {
  const previous = await browserFacts(handle), windowSize = [previous.bounds.width, previous.bounds.height];
  const settings = await context.newPage(); let control;
  try {
    await settings.goto(channel === 'chrome' ? 'chrome://settings/appearance' : 'edge://settings/appearance');
    if (channel === 'chrome') {
      const select = settings.locator('select#zoomLevel'); await select.waitFor({ state: 'visible' });
      const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, text: node.textContent.trim() })));
      const index = options.findIndex(option => Math.abs(Number(option.value) - factor) < 1e-8);
      assert(index >= 0, `Official Chrome settings contain no ${factor} page zoom option`);
      const initial = await select.inputValue();
      if (Math.abs(Number(initial) - factor) > 1e-8) { await select.focus(); await select.press('Home'); for (let i = 0; i < index; i++) await select.press('ArrowDown'); await select.press('Enter'); }
      control = { method: 'Official settings select through CDP keyboard input', initial, selected: await select.inputValue(), options };
      assert(Math.abs(Number(control.selected) - factor) < 1e-8);
    } else {
      await settings.getByText('页面缩放', { exact: true }).first().click();
      const dropdown = settings.getByLabel(/^页面缩放 \d+%$/);
      const initial = await dropdown.getAttribute('aria-label');
      const target = `${Math.round(factor * 100)}%`;
      if (!initial?.endsWith(` ${target}`)) { await dropdown.click(); await settings.getByText(target, { exact: true }).click({ timeout: 4000 }); }
      control = { method: 'Official Edge page zoom dropdown through public UI clicks', initial, selected: await settings.getByLabel(`页面缩放 ${target}`, { exact: true }).getAttribute('aria-label') };
    }
    await handle.cdp.send('Page.bringToFront');
    const after = await poll(() => browserFacts(handle), facts => Math.abs((facts.layout.cssVisualViewport.zoom ?? -1) - factor) < 1e-6, 'Browser page zoom did not actually change');
    assert.deepEqual([after.bounds.width, after.bounds.height], windowSize, 'Browser native window bounds changed during zoom');
    assert.equal(after.layout.cssVisualViewport.scale, 1, 'Unexpected pinch/page-scale emulation');
    const receipt = { passed: true, factor, previous, after, control };
    json(`${label}-zoom.json`, receipt); return receipt;
  } finally { await settings.close(); await handle.cdp.send('Page.bringToFront'); }
}
async function captureCandidates(handle, draft, label) {
  const { page } = handle; const controls = [];
  for (const option of draft.options) controls.push({ optionId: option.id, accessible: await hitAccessible(page.locator(`[data-action="draft-option"][data-draft="${draft.id}"][data-option="${option.id}"]`), page) });
  const current = await state(page); assert.deepEqual(current.growth.draft, draft, 'Zoom must not reroll or change a frozen draft');
  await screenshot(page, `${label}-candidates.png`); json(`${label}-candidates.json`, { draft, controls, actualState: current, browser: await browserFacts(handle) });
  return { passed: true, controls };
}
async function projectInput(page, point) {
  return page.evaluate(point => { const screen = window.__viral.toScreen(point), back = window.__viral.toWorld(screen), canvas = document.querySelector('#game').getBoundingClientRect();
    const x = canvas.left + screen.x, y = canvas.top + screen.y, hit = document.elementFromPoint(x, y);
    return { screen, back, x, y, canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height }, hitsCanvas: hit?.id === 'game', innerWidth, innerHeight }; }, point);
}
async function mouseToolHit(handle, tool, target, label) {
  const { page } = handle;
  await hitAccessible(page.locator(`[data-action="tool-${tool}"]`), page);
  await page.keyboard.press(`Digit${tool}`);
  await poll(() => state(page), s => s.tool === tool && s.elapsed >= s.cooldowns[tool], 'Tool selection/cooldown unavailable');
  const before = await state(page), position = await projectInput(page, target);
  assert(position.x >= 0 && position.y >= 0 && position.x < position.innerWidth && position.y < position.innerHeight && position.hitsCanvas, 'Projected real input point is blocked/outside the canvas');
  assert(Math.hypot(position.back.x - target.x, position.back.y - target.y) < 1e-6, 'Projection inverse mismatch');
  await page.mouse.click(position.x, position.y);
  const after = await poll(() => state(page), s => tool === 1 ? s.targets.find(t => t.id === target.id)?.hp < before.targets.find(t => t.id === target.id).hp : s.tissue.hp > before.tissue.hp, 'Actual mouse tool did not cause HP change');
  const fired = after.events.filter(e => e.type === 'TOOL_FIRED' && e.tick > before.tick && e.data.tool === tool);
  assert.equal(fired.length, 1, 'One public click must produce exactly one tool activation');
  const actual = tool === 1 ? after.events.filter(e => e.type === 'TARGET_HIT' && e.tick > before.tick && e.data.id === target.id && Number(e.data.damage) > 0)
    : after.events.filter(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.tick > before.tick && e.data.reason === 'repair' && Number(e.data.after) > Number(e.data.before));
  assert.equal(actual.length, 1, 'Missing unique accepted damage/repair receipt');
  await wait(250); const settled = await state(page);
  assert.equal(settled.events.filter(e => e.type === 'TOOL_FIRED' && e.tick > before.tick && e.data.tool === tool).length, 1, 'Mouse click leaked a held fire state');
  json(`${label}-accepted-hit.json`, { passed: true, tool, target, position, before, after, settled, fired, actual });
}

for (const channel of ['chrome', 'msedge']) {
  assert.equal(bundleHash(), expected); const item = { channel, cases: {}, pageErrors: [], consoleErrors: [], remoteRequests: [] }; report.channels.push(item); let context;
  try {
    context = await chromium.launchPersistentContext(join(profiles, `${channel}-profile`), { channel, headless: false, viewport: null, args: ['--window-size=1366,900'] });
    await context.setOffline(true);
    const native = await nativePage(context, item, { seed: 7 }); item.version = await native.cdp.send('Browser.getVersion');
    await native.page.locator('[data-action="start"]').click(); await poll(() => state(native.page), s => s.phase === 'playing', 'Campaign did not start');
    await native.page.keyboard.down('KeyD'); const beginning = await state(native.page);
    const empty = await projectInput(native.page, { x: beginning.player.x + 220, y: beginning.player.y + 40 });
    await native.page.mouse.move(empty.x, empty.y); await native.page.mouse.down(); await wait(140);
    const freeze = await minimizeFreeze(native, `${channel}-campaign`, 30, true);
    // Keep the original browser-held D/mouse down through resume. A repeat D
    // stays an OS-repeat-style CDP key event; it cannot restore cleared input.
    await native.page.keyboard.press('Escape'); await native.page.keyboard.down('KeyD');
    const resumedAt = Date.now(), resumed = await state(native.page); await wait(500); const stable = await state(native.page);
    assert.equal(resumed.phase, 'playing'); assert.equal(stable.phase, 'playing');
    assert.equal(stable.player.x, freeze.afterRestore.player.x); assert.equal(stable.player.y, freeze.afterRestore.player.y);
    assert.equal(stable.shots, freeze.afterRestore.shots);
    assert(stable.elapsed - freeze.afterRestore.elapsed > 0 && stable.elapsed - freeze.afterRestore.elapsed < (Date.now() - resumedAt) / 1000 + .3, 'Background time caught up on resume');
    json(`${channel}-resume-no-held-input.json`, { passed: true, browserHeldInputReleasedOnlyAfterObservation: true, resumed, stable, paused: freeze.afterRestore, wallResumeMs: Date.now() - resumedAt });
    await native.page.keyboard.up('KeyD'); await native.page.mouse.up(); item.cases.nativeThirtySecondFreeze = { passed: true, fullStateSha256: freeze.baselineHash, hiddenObserved: freeze.minimized.page.hidden, visibilityEvents: freeze.restored.page.events.filter(e => e.type === 'visibilitychange') };
    await native.page.close();

    const campaign = await nativePage(context, item, { seed: 13 }); await campaign.page.locator('[data-action="start"]').click();
    let qualifiedDraft = false; const stop = new Error('STOP_AFTER_QUALIFIED_XP_DRAFT');
    try {
      await fullRun(campaign.page, 'ignore', undefined, true, async earned => {
        const draft = earned.growth?.draft; if (!draft) throw new Error('Draft callback had no draft');
        if (draft.source !== 'xp') { await campaign.page.locator(`[data-action="draft-discard"][data-draft="${draft.id}"]`).click(); return; }
        assert.equal(earned.campaign != null, true); assert.equal(earned.phase, 'paused');
        json(`${channel}-earned-xp-draft.json`, { provenance: 'Actual campaign public input driver, no game/storage/clock assignment', state: earned, rewardEvents: earned.events.filter(e => ['GROWTH_REWARD', 'GROWTH_LEVEL_GAINED', 'PROTOCOL_DRAFT_OPENED'].includes(e.type)) });
        await minimizeFreeze(campaign, `${channel}-xp-draft`, 2, false);
        assert.deepEqual((await state(campaign.page)).growth.draft, draft);
        const zooms = [];
        for (const factor of [1.25, 1.5]) {
          try { await setZoom(context, campaign, channel, factor, `${channel}-draft-${factor}`); await captureCandidates(campaign, draft, `${channel}-draft-${factor}`); zooms.push({ factor, passed: true }); }
          catch (error) { zooms.push({ factor, passed: false, error: String(error) }); json(`${channel}-draft-${factor}-uncovered.json`, zooms.at(-1)); }
        }
        const beforeChoice = await state(campaign.page), chosen = draft.options[0];
        await campaign.page.locator(`[data-action="draft-option"][data-draft="${draft.id}"][data-option="${chosen.id}"]`).click();
        const afterChoice = await poll(() => state(campaign.page), s => s.growth.consumedDraftIds.includes(draft.id), 'Public draft choice did not commit');
        await wait(250); const settled = await state(campaign.page);
        for (const s of [afterChoice, settled]) { assert.equal(s.growth.consumedDraftIds.filter(id => id === draft.id).length, 1); assert.equal(s.events.filter(e => e.type === 'PROTOCOL_DRAFT_COMMITTED' && e.data.draftId === draft.id).length, 1); }
        json(`${channel}-single-draft-commit.json`, { passed: true, publicClicks: 1, draftId: draft.id, chosen, beforeChoice, afterChoice, settled });
        await setZoom(context, campaign, channel, 1, `${channel}-draft-restored-100`);
        item.cases.naturalCampaignXpDraft = { passed: true, draftId: draft.id, source: draft.source, zooms };
        qualifiedDraft = true; throw stop;
      }, undefined, { timeoutMs: 100000 });
    } catch (error) { if (error !== stop) throw error; }
    assert(qualifiedDraft, 'No natural campaign XP draft was reached within the finite public-input route'); await campaign.page.close();

    const training = await nativePage(context, item, { scenario: 'training', seed: 7 }); item.cases.trainingZoom = [];
    for (const factor of [1.25, 1.5, 1]) {
      const label = `${channel}-training-${factor}`;
      try {
        await setZoom(context, training, channel, factor, label);
        await training.page.goto(urlFor({ scenario: 'training', seed: 7 })); await training.page.waitForFunction(() => !!window.__viral);
        await training.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await training.cdp.send('Page.bringToFront');
        await training.page.locator('[data-action="start"]').click(); await poll(() => state(training.page), s => s.phase === 'playing', 'Training start failed at real zoom');
        const actual = await browserFacts(training); assert(Math.abs(actual.layout.cssVisualViewport.zoom - factor) < 1e-6, 'Reload lost the actual selected browser zoom');
        const hud = {}; for (const selector of ['[data-action="tool-1"]', '[data-action="tool-3"]']) hud[selector] = await hitAccessible(training.page.locator(selector), training.page);
        const hpLabel = training.page.locator('#hp-label'); assert(await hpLabel.isVisible(), 'HP readout is hidden');
        hud['#hp-label'] = await hpLabel.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, fullyInside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5, text: el.textContent, pointerEvents: getComputedStyle(el).pointerEvents }; });
        assert(hud['#hp-label'].fullyInside, 'HP readout lies outside the actual zoomed viewport');
        const initial = await state(training.page), target = initial.targets.find(t => t.kind === 'single'); assert(target); assert(initial.tissue.hp < initial.tissue.maxHp);
        await mouseToolHit(training, 1, target, `${label}-shot`); await mouseToolHit(training, 3, initial.tissue, `${label}-repair`);
        await screenshot(training.page, `${label}-real-shot-repair.png`); json(`${label}-hud.json`, { passed: true, hud, browser: actual, scope: 'Real training fixture, not all campaign layouts' });
        item.cases.trainingZoom.push({ factor, passed: true });
      } catch (error) { item.cases.trainingZoom.push({ factor, passed: false, error: String(error) }); json(`${label}-uncovered.json`, item.cases.trainingZoom.at(-1)); }
    }
    await training.page.close(); item.passed = item.cases.trainingZoom.every(c => c.passed) && item.cases.naturalCampaignXpDraft.zooms.every(c => c.passed) && !item.pageErrors.length && !item.consoleErrors.length && !item.remoteRequests.length;
  } catch (error) { item.fatal = error.stack ?? String(error); item.passed = false; }
  finally { if (context) await context.close().catch(error => item.closeError = String(error)); item.closedAt = new Date().toISOString(); item.buildAfterSha256 = bundleHash(); assert.equal(item.buildAfterSha256, expected); json(`${channel}-summary.json`, item); }
}
report.finishedAt = new Date().toISOString(); report.actualBuildAfterSha256 = bundleHash(); report.status = report.channels.every(channel => channel.passed) ? 'passed-finite-scope' : 'partial-or-failed-see-raw-results';
json('report.json', report); console.log(JSON.stringify({ output, status: report.status, channels: report.channels.map(c => ({ channel: c.channel, passed: c.passed, fatal: c.fatal })) }, null, 2));
if (!report.channels.every(channel => channel.passed)) process.exitCode = 1;
