import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Fixtures are installed once before the initial document loads. Every subsequent
// change is made through production mouse/keyboard/touch input; __viral is read-only.
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const entry = process.env.VI_SANCTUM_ENTRY ?? 'http://127.0.0.1:57120/';
const output = resolve(option('--out') ?? process.env.VI_SANCTUM_OUT ?? 'artifacts/sanctum-v020/camp-browser');
await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: "export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const base = model.emptyCampProfile();
Object.assign(base, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready', coins: 5000, pity: 49,
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'] });
const legacy = { ...structuredClone(base), schemaVersion: 4 };
for (const key of ['ownedLegions', 'legionLoadout', 'legionPity', 'legionDrawSeed', 'food', 'farmPlots', 'starterFoodGrantVersion']) delete legacy[key];
const harvest = { ...structuredClone(base), builtFacilities: [...base.builtFacilities, 'farm', 'house'], food: 0, legionPity: 49,
  farmPlots: Array.from({ length: 3 }, () => ({ planted: true, growth: 2 })) };
assert.ok(model.parseCampProfile(legacy), 'The initial schema4 fixture is valid');
assert.ok(model.parseCampProfile(harvest), 'The explicit schema5 mature-crop/pity fixture is valid');
const sha = value => createHash('sha256').update(value).digest('hex');
const sources = ['src/meta/campProfile.ts', 'src/game/legionCatalog.ts', 'src/game/campProgression.ts', 'src/game/campLayout.ts', 'src/game/campScene.ts',
  'src/ui/campLifeHud.ts', 'src/ui/campSummonHud.ts', 'src/ui/campHud.ts', 'src/ui/camp.css', 'src/ui/campSummon.css', 'src/main.ts'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sources.map(async name => [name, sha(await readFile(name))])));
const report = { startedAt: new Date().toISOString(), entry, pass: false,
  scope: 'Schema4 migration and actual northern expansion, planting, quarters and roster controls; a separate explicitly seeded schema5 fixture verifies mature harvest, hunger, independent fifty-pull guarantee, ten-result disclosure, animation skipping and reload persistence. Desktop Chromium touch emulation is not a physical-phone or naturally earned collection/expedition playtest.',
  boundaries: { initialStorageFixturesOnly: true, liveSimulationWrites: false, diagnosticWrites: false, teleportation: false, clockAcceleration: false,
    completedExpeditions: false, physicalPhones: false, input: 'Desktop keyboard/mouse; touch viewports use actual CDP touch movement and touchscreen taps.' },
  fixtures: { legacySchema4: legacy, matureAndPitySchema5: harvest }, harnessSha256: sha(await readFile(new URL(import.meta.url))),
  sourceAtStart: await sourceHashes(), cases: [] };
await writeFile(join(output, 'harness.mjs'), await readFile(new URL(import.meta.url)));
const persist = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
const snapshot = page => page.evaluate(() => window.__viral.snapshot());
const profile = page => page.evaluate(() => window.__viral.campProfile().data);
const diagnostics = page => page.evaluate(() => window.__viral.diagnostics());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function until(read, accept, label, timeout = 10000) {
  const began = Date.now(); let value;
  while (Date.now() - began < timeout) { value = await read(); if (accept(value)) return value; await new Promise(done => setTimeout(done, 35)); }
  throw Error(`${label}: ${JSON.stringify(value).slice(0, 1200)}`);
}
const browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true });
async function run(config, kind) {
  const { width, height, touch } = config;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const fixture = kind === 'legacy-construction' ? legacy : harvest;
  await context.addInitScript(({ key, fixture, marker }) => {
    if (!sessionStorage.getItem(marker)) { localStorage.setItem(key, JSON.stringify(fixture)); sessionStorage.setItem(marker, 'installed'); }
  }, { key: model.CAMP_PROFILE_STORAGE_KEY, fixture, marker: `sanctum-camp-${kind}` });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), held = new Set();
  let touchHeld = false;
  const item = { width, height, touch, kind, fixtureSchema: fixture.schemaVersion, pageErrors: [], failedResponses: [],
    screenshots: [], layouts: [], walks: [], actions: [], pass: false };
  report.cases.push(item);
  page.on('pageerror', error => item.pageErrors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) item.failedResponses.push({ status: response.status(), url: response.url() }); });
  const capture = async name => { const file = `${width}x${height}-${kind}-${name}.png`; await page.screenshot({ path: join(output, file) }); item.screenshots.push(file); };
  const release = async () => {
    if (touchHeld) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); touchHeld = false; }
    for (const key of held) await page.keyboard.up(key); held.clear();
  };
  const activate = async selector => {
    item.actions.push(selector);
    for (let attempt = 0; ; attempt++) try {
      const control = page.locator(selector).filter({ visible: true }).first(); await control.waitFor({ state: 'visible', timeout: 10000 });
      await control.scrollIntoViewIfNeeded(); if (touch) await control.tap(); else await control.click(); await page.waitForTimeout(70); return;
    } catch (error) { if (attempt >= 3 || !/not attached|detached/.test(String(error))) throw error; await page.waitForTimeout(80); }
  };
  const move = async (dx, dy) => {
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    if (touch) {
      const stick = await page.locator('[data-stick="move"]').filter({ visible: true }).first().boundingBox(); assert.ok(stick, 'Production movement stick');
      const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
      if (!touchHeld) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...center, radiusX: 3, radiusY: 3, force: 1 }] }); touchHeld = true; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x + dx * 32, y: center.y + dy * 32, radiusX: 3, radiusY: 3, force: 1 }] });
    } else {
      const desired = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]);
      for (const key of held) if (!desired.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of desired) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
    }
  };
  const walk = async points => {
    const origin = model.campLayout(await snapshot(page)).origin;
    for (const point of points) {
      const target = { x: origin.x + point.x, y: origin.y + point.y }, began = Date.now(); let state = await snapshot(page), stalled = 0, recaptures = 0;
      while (distance(state.player, target) > 10) {
        assert.ok(Date.now() - began < 17000, `Real walking deadline: ${JSON.stringify({ point, player: state.player })}`);
        assert.equal(state.phase, 'playing'); assert.ok(state.camp);
        const dx = target.x - state.player.x, dy = target.y - state.player.y;
        await move(Math.abs(dx) > 4 ? dx : 0, Math.abs(dy) > 4 ? dy : 0);
        await page.waitForTimeout(Math.min(85, Math.max(25, (distance(state.player, target) - 5) / 235 * 1000)));
        const next = await snapshot(page); stalled = distance(next.player, state.player) < .2 ? stalled + 1 : 0;
        if (touch && stalled >= 3 && recaptures < 2) { await release(); stalled = 0; recaptures++; }
        assert.ok(stalled < 15, `Blocked real route: ${JSON.stringify({ point, player: next.player })}`);
        assert.ok(model.isCampPositionLegal(next.player, next.player.radius, model.campLayout(next)), 'Authoritative camp collision remains legal');
        state = next;
      }
      await release(); item.walks.push({ point, player: state.player, recaptures }); await page.waitForTimeout(50);
    }
    await page.waitForTimeout(150);
  };
  const clickStation = async id => {
    const target = await until(() => diagnostics(page), value => value.campTargets?.some(target => target.id === id && target.eligible), `Reachable ${id}`)
      .then(value => value.campTargets.find(target => target.id === id));
    let selected;
    for (const rect of [...target.labels.map(label => label.rect ?? label), target.body]) {
      if (!rect) continue;
      const point = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
      if (point.x < 5 || point.x > width - 5 || point.y < 5 || point.y > height - 5) continue;
      if (await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS', point)) { selected = point; break; }
    }
    if (selected) { if (touch) await page.touchscreen.tap(selected.x, selected.y); else await page.mouse.click(selected.x, selected.y); }
    else await activate(`[data-action="camp-interact"][data-station="${id}"]`);
    item.actions.push({ action: 'real-station-input', id, selected }); await page.waitForTimeout(80);
  };
  const open = async id => {
    await clickStation(id);
    const title = { farm: '营养农场', house: '免疫居所', summon: '血流接引' }[id];
    await until(() => page.locator('#camp-title').textContent().catch(() => ''), value => value === title, `Opened ${title}`);
  };
  const close = async () => { await activate('.camp-footer [data-action="camp-close"]'); await until(() => snapshot(page), state => state.phase === 'playing', 'Returned to the camp'); };
  const layout = async name => {
    const value = await page.evaluate(() => {
      const panel = document.querySelector('.camp-panel'), content = panel.querySelector('.camp-content'), footer = panel.querySelector('.camp-return'), close = panel.querySelector('.camp-close');
      const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { panel: box(panel), content: box(content), footer: box(footer), close: box(close), horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1 || content.scrollWidth > content.clientWidth + 1,
        viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1, viewport: { width: innerWidth, height: innerHeight } };
    });
    for (const [label, rect] of [['panel', value.panel], ['footer', value.footer], ['close', value.close]]) {
      assert.ok(rect.left >= -1 && rect.right <= width + 1 && rect.top >= -1 && rect.bottom <= height + 1, `${name} ${label} stays in viewport: ${JSON.stringify(value)}`);
    }
    assert.equal(value.horizontalOverflow, false, `${name} no horizontal clipping`); assert.equal(value.viewportOverflow, false);
    item.layouts.push({ name, ...value }); await capture(name);
  };
  const enter = async () => {
    await until(() => page.evaluate(() => window.__viral?.version), value => value?.startsWith('0.20.'), 'Sanctum runtime ready', 60000);
    await activate('[data-action="camp-open"]'); await until(() => snapshot(page), state => !!state.camp && state.phase === 'playing', 'Production camp entered');
  };
  const refreshAndCompare = async expected => {
    await release(); await page.reload({ waitUntil: 'load' });
    await until(() => page.evaluate(() => !!window.__viral), Boolean, 'Reloaded runtime', 60000);
    assert.deepEqual(await profile(page), expected, 'Actual local storage reload retains the exact camp snapshot');
    await enter(); await capture('reload-persisted');
  };
  try {
    const url = new URL(entry); url.searchParams.set('seed', '200071'); if (touch) url.searchParams.set('mobile', '1');
    await page.goto(url.href, { waitUntil: 'load', timeout: 60000 }); await page.bringToFront(); await enter();
    const initial = await profile(page); item.initial = initial;
    if (kind === 'legacy-construction') {
      assert.equal(initial.schemaVersion, 5); assert.equal(initial.coins, 5000); assert.equal(initial.pity, 49); assert.equal(initial.food, 6);
      assert.deepEqual(initial.builtFacilities, legacy.builtFacilities); await capture('legacy-migrated');
      await walk([{ x: 85, y: 270 }, { x: 85, y: -374 }, { x: -300, y: -374 }]);
      for (const id of ['farm', 'house']) {
        if (id === 'house') await walk([{ x: 300, y: -374 }]);
        await clickStation(id);
        if ((await profile(page)).activeConstruction !== id) await activate(`[data-action="camp-build"][data-station="${id}"]`);
        await until(() => profile(page), data => data.activeConstruction === id || data.builtFacilities.includes(id), `Started free ${id}`);
        await until(() => profile(page), data => data.builtFacilities.includes(id) && !data.activeConstruction, `Completed ${id}`, 10000);
        assert.equal((await profile(page)).coins, 5000); assert.equal((await profile(page)).prologue, 'ready'); await capture(`built-${id}`);
        await open(id);
        if (id === 'farm') {
          await layout('farm-empty');
          for (let plot = 0; plot < 3; plot++) await activate(`[data-action="camp-plant"][data-plot="${plot}"]`);
          assert.ok((await profile(page)).farmPlots.every(plot => plot.planted && plot.growth === 0)); await layout('farm-three-planted');
        } else {
          await layout('house-free-roster'); await activate('[data-action="camp-legion-assign"][data-slot="1"][data-legion=""]');
          assert.equal((await profile(page)).legionLoadout[1], null);
          await activate('[data-action="camp-legion-assign"][data-slot="1"][data-legion="phagocyte"]');
          assert.deepEqual((await profile(page)).legionLoadout, ['phagocyte', 'phagocyte']);
        }
        await close();
      }
      await refreshAndCompare(await profile(page));
    } else {
      await walk([{ x: 85, y: 270 }, { x: 85, y: 90 }, { x: 90, y: 90 }]); await open('summon');
      await activate('[data-action="camp-summon-pool"][data-pool="equipment"]'); await layout('equipment-pity-49');
      assert.equal((await profile(page)).pity, 49);
      await activate('[data-action="camp-summon-pool"][data-pool="legion"]'); await layout('legion-pity-49');
      await activate('[data-action="camp-legion-draw"][data-count="10"]');
      const drawn = await until(() => profile(page), data => data.transactions.some(tx => tx.kind === 'draw' && tx.receipt.pool === 'legion'), 'Ten actual legion draws settled');
      const receipt = drawn.transactions.find(tx => tx.kind === 'draw' && tx.receipt.pool === 'legion').receipt;
      assert.equal(receipt.results.length, 10); assert.equal(receipt.pityBefore, 49); assert.equal(receipt.results[0].legionId, 'seraph'); assert.equal(receipt.results[0].rarity, 'gold');
      assert.equal(drawn.coins, 4000); assert.equal(drawn.pity, 49); assert.ok(drawn.ownedLegions.includes('seraph')); item.receipt = receipt;
      await until(() => page.locator('.summon-cinematic').count(), value => value === 1, 'Skippable reveal appeared');
      await capture('ten-pull-cinematic'); await activate('[data-action="camp-summon-skip"]');
      await until(() => page.locator('.summon-cinematic').count(), value => value === 0, 'Skipped animation');
      assert.equal(await page.locator('.camp-draw-result').count(), 10); await layout('ten-results');
      await activate('[data-action="camp-summon-pool"][data-pool="equipment"]'); assert.equal((await profile(page)).pity, 49); await layout('equipment-pity-preserved'); await close();
      await walk([{ x: 85, y: 90 }, { x: 85, y: -374 }, { x: 300, y: -374 }]); await open('house');
      assert.ok(await page.locator('.camp-hungry').count() >= 1); await layout('house-hungry');
      await activate('[data-action="camp-legion-assign"][data-slot="0"][data-legion="seraph"]');
      assert.equal((await profile(page)).legionLoadout[0], 'seraph');
      assert.equal(await page.locator('[data-action="camp-legion-assign"][data-slot="1"][data-legion="seraph"]').isDisabled(), true); await layout('house-seraph-assigned'); await close();
      await walk([{ x: -300, y: -374 }]); await open('farm'); await layout('farm-ripe');
      await activate('[data-action="camp-harvest"][data-plot="0"]'); assert.equal((await profile(page)).food, 2);
      await activate('[data-action="camp-harvest-all"]'); assert.equal((await profile(page)).food, 6);
      await activate('[data-action="camp-plant-all"]'); assert.ok((await profile(page)).farmPlots.every(plot => plot.planted && plot.growth === 0));
      await layout('farm-harvested-replanted'); await close();
      await walk([{ x: 300, y: -374 }]); await open('house'); assert.equal(await page.locator('.camp-hungry').count(), 0); await layout('house-resupplied'); await close();
      item.beforeReload = await profile(page); await refreshAndCompare(item.beforeReload);
      const state = await snapshot(page); assert.ok(state.growth.cells.some(cell => cell.legionId === 'seraph' && cell.legionRole === 'leader'), 'Assigned legendary leader is physically stationed at home');
      assert.equal((await profile(page)).pity, 49); assert.equal((await profile(page)).coins, 4000);
    }
    assert.deepEqual(item.pageErrors, []); assert.deepEqual(item.failedResponses, []); item.final = await profile(page); item.pass = true;
  } catch (error) {
    item.error = String(error.stack ?? error); item.failure = { state: await snapshot(page).catch(() => null), profile: await profile(page).catch(() => null), diagnostics: await diagnostics(page).catch(() => null) };
    await capture('failure').catch(() => {});
  } finally { await release().catch(() => {}); await context.close(); await persist(); }
  console.log(JSON.stringify({ width, height, kind, pass: item.pass, error: item.error?.split('\n')[0] }));
}
try {
  for (const config of [{ width: 1366, height: 768, touch: false }, { width: 844, height: 390, touch: true }, { width: 667, height: 320, touch: true }]) {
    if (option('--width') && Number(option('--width')) !== config.width) continue;
    for (const kind of ['legacy-construction', 'mature-harvest-pity']) if (!option('--scenario') || option('--scenario') === kind) await run(config, kind);
  }
  assert.ok(report.cases.length > 0, 'At least one configured case'); report.pass = report.cases.every(item => item.pass);
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close(); report.sourceAtEnd = await sourceHashes(); report.sourcesStable = JSON.stringify(report.sourceAtStart) === JSON.stringify(report.sourceAtEnd);
  report.completedAt = new Date().toISOString(); await persist();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, output, sourcesStable: report.sourcesStable }));
