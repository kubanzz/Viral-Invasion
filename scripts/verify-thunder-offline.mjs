import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeMobileHtml, readVerifiedMobileBuild } from './package-mobile.mjs';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const output = resolve(option('--out') ?? 'artifacts/thunder-rework-v025/offline');
const directory = resolve(option('--dist') ?? 'dist');
const channels = (option('--channels') ?? 'chrome,msedge').split(',');
await mkdir(output, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const verified = await readVerifiedMobileBuild({ workspaceRoot: process.cwd(), distDirectory: option('--dist') ?? 'dist' });
const metadata = verified.metadata;
const javascript = verified.outputs.get('game.js').toString('utf8');
const mobilePath = join(output, 'Viral-Invasion-Thunder-Mobile.html');
const mobileBytes = Buffer.from(composeMobileHtml(verified.outputs.get('index.html').toString('utf8'), javascript));
await writeFile(mobilePath, mobileBytes);
await writeFile(join(output, 'harness.mjs'), await readFile(new URL(import.meta.url)));

const helper = await build({ stdin: { contents: "export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], unlockedLegendaryWeapons: ['thunder'], equipped: 'thunder' });
fixture.weapons.thunder = { repaired: 'gold', pending: null, upgrade: 0 };
fixture.inventory.push({ id: 'offline-thunder-owned', templateId: 'thunder', kind: 'weapon', rarity: 'gold', repaired: true });
assert(model.parseCampProfile(fixture), 'The supplied camp collection must be a legal current-schema save');

const selectionBytes = await readFile('asserts/art-selection.json');
const selection = JSON.parse(selectionBytes), runtime = JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8'));
assert.equal(metadata.art.selectionSha256, sha(selectionBytes));
assert.equal(metadata.sourceManifest['asserts/art-selection.json'], sha(selectionBytes));
assert.equal(metadata.art.inputSignature, runtime.inputSignature);
const semantics = ['rod', 'mark', 'trail', 'crown', 'pillar'];
const assets = [];
for (const name of semantics) {
  const id = 'fantasy.weapon.fx.thunder-' + name, selected = selection.sprites.find(sprite => sprite.id === id);
  assert(selected, 'Missing semantic selection ' + id);
  const source = 'asserts/' + selected.source, sourceSha256 = sha(await readFile(source)), asset = runtime.assets[id];
  assert.equal(metadata.sourceManifest[source], sourceSha256, 'Build metadata attests the selected PNG ' + id);
  assert.equal(selected.expectedSha256, sourceSha256);
  assert.equal(asset?.sourceSha256, sourceSha256, 'Atlas semantic source matches selected PNG ' + id);
  assert(metadata.art.atlases.some(atlas => atlas.key === asset?.atlas), 'Runtime atlas is in current build ' + id);
  assert(javascript.includes(id), 'Semantic ID is embedded in this exact classic game.js ' + id);
  assets.push({ id, source, sha256: sourceSha256, atlas: asset.atlas, frame: asset.frame });
}
const before = Object.fromEntries(await Promise.all(['index.html', 'game.js', 'game.css', 'build-meta.json'].map(async name => {
  const bytes = await readFile(join(directory, name)); return [name, { bytes: bytes.length, sha256: sha(bytes) }];
})));
const report = { version: metadata.version, stage: metadata.stage, startedAt: new Date().toISOString(),
  scope: 'Cold local file navigation with browser offline set before navigation. Each fresh isolated context receives one legal owned-thunder ready-camp save before first startup. All subsequent camp walking, opening warehouse and isolated trial actions use trusted keyboard/mouse or CDP touchscreen input. Read-only __viral snapshots/diagnostics; no live state, HP, time, position or energy injection. Trial fill is its visible production button. Browser touch emulation is not a physical-phone test.',
  dist: directory, buildBefore: before, sourceManifestCount: Object.keys(metadata.sourceManifest).length,
  sourceValidationBefore: true, assets, fixture, mobile: { path: mobilePath, bytes: mobileBytes.length, sha256: sha(mobileBytes) },
  harnessSha256: sha(await readFile(new URL(import.meta.url))), cases: [], skippedChannels: [], pass: false };
const persist = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
const pause = ms => new Promise(done => setTimeout(done, ms));
async function until(read, accept, label, timeout = 10000) {
  const began = Date.now(); let value;
  while (Date.now() - began < timeout) { value = await read(); if (accept(value)) return value; await pause(20); }
  throw Error(label + ': ' + JSON.stringify(value).slice(0, 1600));
}
const read = page => page.evaluate(() => window.__viral.snapshot());
const trial = page => page.evaluate(() => window.__viral.diagnostics().campTrial);
let browser;
try {
  for (const channel of channels) {
    try { browser = await chromium.launch({ channel, headless: true, args: ['--allow-file-access-from-files'] }); }
    catch (error) {
      if (channel !== 'msedge' || !/executable.*doesn.t exist|distribution.*not found|ENOENT/i.test(String(error))) throw error;
      report.skippedChannels.push({ channel, reason: String(error) }); continue;
    }
    try {
      for (const mobile of [false, true]) {
        const width = mobile ? 667 : 1366, height = mobile ? 320 : 768;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
        await context.addInitScript(({ fixture, key }) => {
          if (!sessionStorage.getItem('thunder-offline-fixture')) {
            localStorage.setItem(key, JSON.stringify(fixture)); sessionStorage.setItem('thunder-offline-fixture', 'installed-once');
          }
        }, { fixture, key: model.CAMP_PROFILE_STORAGE_KEY });
        const page = await context.newPage(), cdp = await context.newCDPSession(page), touches = new Map(), keys = new Set();
        const item = { channel, browserVersion: browser.version(), mobile, width, height, pageErrors: [], httpRequests: [],
          screenshots: [], walks: [], checkpoints: [], pass: false }; report.cases.push(item);
        page.on('pageerror', error => item.pageErrors.push(String(error)));
        page.on('request', request => { if (/^https?:/i.test(request.url())) item.httpRequests.push(request.url()); });
        const capture = async label => {
          const name = channel + '-' + width + '-' + label + '.png'; await page.screenshot({ path: join(output, name) }); item.screenshots.push(name);
        };
        const touch = async (type, id, point) => {
          if (type === 'touchEnd') {
            const ending = touches.get(id); if (!ending) return;
            await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [ending] }); touches.delete(id); return;
          }
          if (type === 'touchCancel') touches.clear();
          else touches.set(id, { id, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 });
          await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
        };
        const center = async selector => {
          const control = page.locator(selector).filter({ visible: true }).first(); await control.scrollIntoViewIfNeeded();
          const box = await control.boundingBox(); assert(box, 'Visible production control ' + selector);
          const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          assert(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height, 'Control inside viewport ' + selector);
          return point;
        };
        const activate = async selector => {
          for (let attempt = 0; ; attempt++) try {
            if (mobile) { await touch('touchStart', 7, await center(selector)); await page.waitForTimeout(40); await touch('touchEnd', 7); }
            else await page.locator(selector).filter({ visible: true }).first().click();
            await page.waitForTimeout(65); return;
          } catch (error) {
            if (attempt >= 3 || !/not attached|detached/.test(String(error))) throw error;
            await page.waitForTimeout(80);
          }
        };
        const release = async () => {
          if (touches.size) await touch('touchCancel', 0);
          for (const key of keys) await page.keyboard.up(key); keys.clear(); await page.mouse.up().catch(() => {});
        };
        const auditLayout = async label => {
          const layout = await page.evaluate(() => {
            const panel = document.querySelector('.camp-trial-panel'), canvas = document.getElementById('camp-trial-canvas');
            const rect = element => {
              const r = element.getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            const viewport = r => r.left >= -.5 && r.right <= innerWidth + .5 && r.top >= -.5 && r.bottom <= innerHeight + .5;
            const panelRect = rect(panel), canvasRect = rect(canvas);
            const buttons = [...panel.querySelectorAll('.camp-footer-actions button,.camp-trial-utility button,.camp-close')].map(button => {
              const r = rect(button), at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
              const style = getComputedStyle(button);
              return { action: button.dataset.action, slot: button.dataset.slot, layout: button.dataset.layout, text: button.textContent.trim(),
                ...r, visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
                insideViewport: viewport(r), insidePanel: r.left >= panelRect.left - .5 && r.right <= panelRect.right + .5
                  && r.top >= panelRect.top - .5 && r.bottom <= panelRect.bottom + .5,
                unobscuredCenter: !!at && (at === button || button.contains(at)) };
            });
            const overlaps = [];
            for (let a = 0; a < buttons.length; a++) for (let b = a + 1; b < buttons.length; b++) {
              const x = buttons[a], y = buttons[b];
              if (x.visible && y.visible && Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1
                && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) overlaps.push([x.action + (x.slot ?? ''), y.action + (y.slot ?? '')]);
            }
            return { width: innerWidth, height: innerHeight, panel: panelRect, canvas: canvasRect,
              canvasInsideViewport: viewport(canvasRect), panelOverflowX: panel.scrollWidth > panel.clientWidth + 1,
              buttons, overlaps, projection: JSON.parse(canvas.dataset.trialProjection ?? '{}') };
          });
          (item.layoutAudits ??= []).push({ label, ...layout });
          assert(layout.canvasInsideViewport && !layout.panelOverflowX, 'Trial canvas/panel fits actual offline viewport: ' + label);
          assert(layout.buttons.length >= 12, 'Primary, skills, ultimate, utility and return controls remain present');
          assert(layout.buttons.every(button => button.visible && button.height >= 43.5 && button.width >= 43.5
            && button.insideViewport && button.insidePanel && button.unobscuredCenter), 'Major trial controls remain visible, reachable and at least44px: ' + JSON.stringify(layout.buttons));
          assert.deepEqual(layout.overlaps, [], 'Major trial controls do not overlap');
          if (mobile && width === 667) {
            assert(layout.canvas.width >= 350, '667 thunder trial canvas width must be at least350px: ' + layout.canvas.width);
            assert(layout.canvas.height >= 150, '667 thunder trial canvas height must be at least150px: ' + layout.canvas.height);
          }
          return layout;
        };
        try {
          await context.setOffline(true); item.offlineBeforeNavigation = true;
          const entry = pathToFileURL(mobile ? mobilePath : join(directory, 'index.html'));
          entry.searchParams.set('seed', '250071'); if (mobile) entry.searchParams.set('mobile', '1'); item.entry = entry.href;
          await page.goto(entry.href, { waitUntil: 'load' }); await page.bringToFront();
          await until(() => page.evaluate(() => window.__viral?.version), value => value?.startsWith(metadata.version), 'Current production runtime cold starts', 60000);
          item.version = await page.evaluate(() => window.__viral.version);
          if (mobile) assert.equal(await page.evaluate(() => document.documentElement.dataset.mobile), 'true');
          await activate('[data-action="camp-open"]');
          await until(() => read(page), state => !!state.camp && state.phase === 'playing', 'Production camp opens');
          const modelState = await until(() => page.evaluate(() => window.__viral.diagnostics().art.player3D), value => value?.ready && value.weapon3D?.id === 'thunder', 'Embedded held thunder model ready', 60000);
          assert.equal(modelState.error ?? null, null); assert.equal(modelState.weapon3D.error ?? null, null);
          const beforeMove = await read(page);
          if (mobile) {
            const move = await center('[data-stick="move"]');
            await touch('touchStart', 1, { x: move.x, y: move.y + 32 }); await page.waitForTimeout(240); await touch('touchEnd', 1);
          } else { await page.keyboard.down('s'); await page.waitForTimeout(240); await page.keyboard.up('s'); }
          const afterMove = await read(page);
          item.initialMovement = { input: mobile ? 'CDP touchscreen move stick' : 'keyboard S', ticks: afterMove.tick - beforeMove.tick,
            distance: Math.hypot(afterMove.player.x - beforeMove.player.x, afterMove.player.y - beforeMove.player.y), before: beforeMove.player, after: afterMove.player };
          assert(item.initialMovement.ticks > 0 && item.initialMovement.distance > 10, 'Offline actual movement advances simulation');
          item.weapon3D = await page.evaluate(() => window.__viral.diagnostics().art.player3D.weapon3D);
          await capture('camp-held');
          const origin = model.campLayout(await read(page)).origin;
          // Trusted keyboard walking reaches the same known legal warehouse route
          // in both browser layouts. Mobile startup movement/trial use touch.
          for (const relative of [{ x: 0, y: 100 }, { x: -205, y: 100 }, { x: -205, y: -20 }, { x: -386, y: -20 }]) {
            const destination = { x: origin.x + relative.x, y: origin.y + relative.y }, began = Date.now();
            while (true) {
              const state = await read(page), dx = destination.x - state.player.x, dy = destination.y - state.player.y, gap = Math.hypot(dx, dy);
              if (gap < 10) break;
              assert(Date.now() - began < 16000, 'Real camp warehouse walking deadline ' + JSON.stringify({ destination, player: state.player }));
              const wanted = [...(dx < -7 ? ['a'] : dx > 7 ? ['d'] : []), ...(dy < -7 ? ['w'] : dy > 7 ? ['s'] : [])];
              for (const key of wanted) { await page.keyboard.down(key); keys.add(key); }
              await page.waitForTimeout(Math.min(70, Math.max(20, (gap - 8) / 235 * 1000)));
              for (const key of keys) await page.keyboard.up(key); keys.clear();
            }
            item.walks.push({ destination, player: (await read(page)).player });
          }
          if (mobile) await activate('[data-action="camp-interact"][data-station="warehouse"]'); else await page.keyboard.press('e');
          await until(() => page.locator('#camp-title').textContent().catch(() => ''), value => value === '装备仓库', 'Actual warehouse opened');
          if (await page.locator('[data-action="eq-select-weapon"][data-weapon="thunder"]').count()) await activate('[data-action="eq-select-weapon"][data-weapon="thunder"]');
          await activate('[data-action="camp-trial"][data-weapon="thunder"]');
          await until(() => trial(page), value => value?.loadout.weaponId === 'thunder', 'Actual isolated thunder trial opens');
          await auditLayout('trial-open');
          const profileBefore = await page.evaluate(() => window.__viral.campProfile().data);
          await activate('[data-action="camp-trial-reset"]'); await activate('[data-action="camp-trial-layout"][data-layout="single"]');
          const attack = await center('[data-action="camp-trial-fire"]');
          if (mobile) await touch('touchStart', 2, attack); else { await page.mouse.move(attack.x, attack.y); await page.mouse.down(); }
          await until(() => trial(page), value => value?.primaryHeld && value.totalDamage > 0, 'Trial button genuinely holds electric channel');
          await page.waitForTimeout(600); item.checkpoints.push({ label: 'held-primary', ...await trial(page) }); await auditLayout('held-primary'); await capture('trial-held');
          if (mobile) await touch('touchEnd', 2); else await page.mouse.up();
          await until(() => trial(page), value => !value?.primaryHeld, 'Physical release clears trial held intent');
          await page.waitForTimeout(100); const released = await trial(page); await page.waitForTimeout(350); const afterRelease = await trial(page);
          item.release = { at: released.totalDamage, after350ms: afterRelease.totalDamage, primaryHeld: afterRelease.primaryHeld };
          assert.equal(item.release.after350ms, item.release.at, 'Released trial channel cannot continue damage');
          await activate('[data-action="camp-trial-reset"]'); await activate('[data-action="camp-trial-layout"][data-layout="melee"]');
          await activate('[data-action="camp-trial-fill"]');
          await until(() => trial(page), value => value?.ultimate?.ready && value.ultimate.energy === 100, 'Visible fill button supplies disposable trial energy');
          if (mobile) await activate('[data-action="camp-trial-ultimate"]'); else await page.keyboard.press('Digit4');
          await until(() => trial(page), value => value?.ultimate?.active && value.ultimateCasts === 1, 'Offline production 4 starts storm');
          const active = await until(() => trial(page), value => value?.ultimate?.canRecast, 'Trial exposes early convergence after initial guard');
          assert.equal(active.ultimate.energy, 0); item.checkpoints.push({ label: 'storm-ready-to-converge', ...active }); await auditLayout('storm-ready-to-converge'); await capture('trial-storm');
          if (mobile) await activate('[data-action="camp-trial-ultimate"]'); else await page.keyboard.press('Digit4');
          const collapsed = await until(() => trial(page), value => !value?.ultimate?.active, 'Second real 4 converges the storm');
          assert.equal(collapsed.ultimateCasts, 1); assert.equal(collapsed.ultimate.energy, 0); assert(collapsed.totalDamage > 0);
          item.checkpoints.push({ label: 'manual-convergence', ...collapsed });
          assert.equal(collapsed.events.filter(event => event.type === 'WEAPON_ULTIMATE_PULSE' && event.data.final).length, 1, 'Exactly one offline trial final transaction');
          await auditLayout('manual-convergence'); await capture('trial-convergence');
          assert.deepEqual(await page.evaluate(() => window.__viral.campProfile().data), profileBefore, 'Disposable trial cannot mutate collection or wallet');
          assert.deepEqual(item.pageErrors, []); assert.deepEqual(item.httpRequests, []);
          item.pass = true;
          console.log(JSON.stringify({ channel, mobile, pass: true, version: item.version, output }));
        } finally { await release().catch(() => {}); await context.close(); await persist(); }
      }
    } finally { await browser.close(); browser = undefined; }
  }
  assert(report.cases.some(item => item.channel === 'chrome' && !item.mobile && item.pass));
  assert(report.cases.some(item => item.channel === 'chrome' && item.mobile && item.pass));
  report.pass = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  report.buildAfter = Object.fromEntries(await Promise.all(Object.keys(before).map(async name => {
    const bytes = await readFile(join(directory, name)); return [name, { bytes: bytes.length, sha256: sha(bytes) }];
  })));
  report.buildUnchanged = JSON.stringify(before) === JSON.stringify(report.buildAfter);
  report.changedSources = [];
  for (const [path, expected] of Object.entries(metadata.sourceManifest)) if (sha(await readFile(path)) !== expected) report.changedSources.push(path);
  report.sourcesUnchanged = report.changedSources.length === 0;
  report.mobileUnchanged = sha(await readFile(mobilePath)) === report.mobile.sha256;
  if (!report.buildUnchanged || !report.sourcesUnchanged || !report.mobileUnchanged) { report.pass = false; process.exitCode = 1; }
  await persist();
}
console.log(JSON.stringify({ pass: report.pass, error: report.error, cases: report.cases.length, skippedChannels: report.skippedChannels,
  sourcesUnchanged: report.sourcesUnchanged, buildUnchanged: report.buildUnchanged, mobile: report.mobile.path, output }));
