import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const entry = option('--url') ?? 'http://127.0.0.1:57123/';
const output = resolve(option('--out') ?? 'artifacts/camp-equipment-20261107/runtime');
await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: "export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const supplied = model.emptyCampProfile();
Object.assign(supplied, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], materials: 100, cores: 2,
  equippedModules: ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON'], unlockedLegendaryWeapons: ['thunder', 'redblade'],
  fragments: Object.fromEntries(['steady', 'piercing', 'thunder', 'redblade', 'PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'].map(id => [id, 25])) });
supplied.inventory.push(
  { id: 'fixture:duplicate', templateId: 'steady', kind: 'weapon', rarity: 'blue', repaired: true },
  { id: 'fixture:piercing', templateId: 'piercing', kind: 'weapon', rarity: 'purple', repaired: true },
  { id: 'fixture:thunder', templateId: 'thunder', kind: 'weapon', rarity: 'gold', repaired: true },
  { id: 'fixture:redblade', templateId: 'redblade', kind: 'weapon', rarity: 'gold', repaired: false },
  ...['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'].map(templateId => ({ id: 'fixture:' + templateId, templateId, kind: 'module', rarity: 'purple', repaired: true })));
const fixture = model.parseCampProfile(supplied); assert(fixture, 'Valid explicit owned-equipment save fixture');
const configurations = [{ width: 1366, height: 768, touch: false }, { width: 844, height: 390, touch: true }, { width: 667, height: 320, touch: true }]
  .filter(config => !option('--width') || config.width === Number(option('--width')));
const report = { entry, scope: 'Explicit initial owned-equipment save fixture. After page load every selection, equipment mutation, trial and building visit uses real DOM keyboard/mouse/touch input; game diagnostics are read only. Desktop touch emulation does not represent a physical phone.', cases: [], pass: false };
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Read-only route planning; movement below always uses the game's native inputs.
function route(layout, from, to, radius) {
  const legal = p => model.isCampPositionLegal(p, radius, layout), step = 22, b = layout.worldBounds;
  const clear = (a, c) => { const count = Math.max(1, Math.ceil(gap(a, c) / 5)); for (let n = 0; n <= count; n++) if (!legal({ x: a.x + (c.x - a.x) * n / count, y: a.y + (c.y - a.y) * n / count })) return false; return true; };
  assert(legal(from) && legal(to), 'Legal camp route endpoints'); if (clear(from, to)) return [to];
  const columns = Math.floor((b.right - b.left) / step) + 1, rows = Math.floor((b.bottom - b.top) / step) + 1;
  const nodes = new Map(), key = (x, y) => y * columns + x, pos = (x, y) => ({ x: b.left + x * step, y: b.top + y * step });
  const nearby = p => { const list = [], gx = Math.round((p.x - b.left) / step), gy = Math.round((p.y - b.top) / step);
    for (let y = Math.max(0, gy - 3); y <= Math.min(rows - 1, gy + 3); y++) for (let x = Math.max(0, gx - 3); x <= Math.min(columns - 1, gx + 3); x++) { const at = pos(x, y); if (legal(at) && clear(p, at)) list.push({ x, y, at }); } return list; };
  const ends = new Set(nearby(to).map(n => key(n.x, n.y))), open = new Set();
  for (const n of nearby(from)) { const id = key(n.x, n.y); nodes.set(id, { ...n, g: gap(from, n.at), f: gap(from, n.at) + gap(n.at, to), previous: null }); open.add(id); }
  const visited = new Set(); let finish;
  while (open.size) { let id; for (const candidate of open) if (id === undefined || nodes.get(candidate).f < nodes.get(id).f) id = candidate;
    const n = nodes.get(id); open.delete(id); if (ends.has(id)) { finish = id; break; } visited.add(id);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = n.x + dx, y = n.y + dy; if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
      const next = key(x, y), at = pos(x, y); if (visited.has(next) || !legal(at) || !clear(n.at, at)) continue;
      const g = n.g + gap(n.at, at), old = nodes.get(next); if (!old || g < old.g) { nodes.set(next, { x, y, at, g, f: g + gap(at, to), previous: id }); open.add(next); }
    }
  }
  assert(finish !== undefined, 'Camp destination reachable'); const path = [to];
  for (let id = finish; id !== null; id = nodes.get(id).previous) path.push(nodes.get(id).at); path.reverse();
  const smooth = []; let start = from;
  for (let index = 0; index < path.length;) { let far = index; for (let n = index + 1; n < path.length; n++) if (clear(start, path[n])) far = n; smooth.push(path[far]); start = path[far]; index = far + 1; }
  return smooth;
}

const browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true });
try {
  for (const config of configurations) {
    const item = { ...config, errors: [], checks: [], screenshots: [], pass: false }; report.cases.push(item);
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, hasTouch: config.touch, isMobile: config.touch, deviceScaleFactor: 1 });
    await context.addInitScript(({ key, value }) => { if (!sessionStorage.getItem('equipment-fixture')) { localStorage.setItem(key, JSON.stringify(value)); sessionStorage.setItem('equipment-fixture', 'installed'); } }, { key: model.CAMP_PROFILE_STORAGE_KEY, value: fixture });
    const page = await context.newPage(), cdp = await context.newCDPSession(page), held = new Set(); let touching = false;
    page.on('pageerror', error => item.errors.push(String(error)));
    const state = () => page.evaluate(() => window.__viral.snapshot()), profile = () => page.evaluate(() => window.__viral.campProfile().data);
    const wait = async (read, accept, label, timeout = 10000) => { const started = Date.now(); let result; while (Date.now() - started < timeout) { result = await read(); if (accept(result)) return result; await page.waitForTimeout(35); } throw Error(label + ': ' + JSON.stringify(result).slice(0, 400)); };
    const activate = async selector => { const control = page.locator(selector).filter({ visible: true }).first(); await control.waitFor({ state: 'visible' }); if (config.touch) await control.tap(); else await control.click(); await page.waitForTimeout(90); };
    const capture = async name => { const file = `${config.width}-${name}.png`; await page.screenshot({ path: join(output, file) }); item.screenshots.push(file); };
    const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); if (touching) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); touching = false; } };
    const move = async (dx, dy) => {
      const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
      if (config.touch) { const b = await page.locator('[data-stick="move"]').boundingBox(); assert(b, 'Movement stick visible'); await cdp.send('Input.dispatchTouchEvent', { type: touching ? 'touchMove' : 'touchStart', touchPoints: [{ id: 1, x: b.x + b.width / 2 + dx * 26, y: b.y + b.height / 2 + dy * 26, radiusX: 3, radiusY: 3, force: 1 }] }); touching = true; }
      else { const wanted = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]); for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); } for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); } }
    };
    const visit = async station => {
      const before = await state(), layout = model.campLayout(before), target = layout.facilities.find(facility => facility.id === station).interactionPosition;
      const path = route(layout, before.player, target, before.player.radius), started = Date.now();
      for (const point of path) while (true) { const s = await state(), distance = gap(s.player, point); if (distance < 9) break; assert(Date.now() - started < 30000, 'Native walk to ' + station); await move(point.x - s.player.x, point.y - s.player.y); await page.waitForTimeout(Math.min(70, Math.max(18, (distance - 4) / 235 * 1000))); }
      await release(); await page.waitForTimeout(80); await page.keyboard.press('e');
      await wait(() => page.locator('.eq-workspace').getAttribute('data-eq-section').catch(() => null), value => value === station, 'Opened nearby ' + station);
    };
    const geometry = async label => {
      const result = await page.evaluate(() => {
        const panel = document.querySelector('.camp-equipment-panel'), workspace = document.querySelector('.eq-workspace'), actions = document.querySelector('.eq-actions');
        const rect = element => { const b = element.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
        return { panel: rect(panel), workspace: rect(workspace), actions: rect(actions), overflow: panel.scrollWidth > panel.clientWidth + 1,
          controls: [...document.querySelectorAll('.eq-actions button,.eq-tabs button,.camp-equipment-panel .camp-close')].map(button => ({ action: button.dataset.action, ...rect(button) })) };
      });
      assert(!result.overflow, label + ' no horizontal overflow'); assert(result.actions.bottom <= config.height && result.actions.top >= 0, label + ' fixed actions inside viewport');
      for (const button of result.controls) { assert(button.height >= 43.5 && button.width >= 43.5, label + ' 44px touch target: ' + button.action); assert(button.right <= config.width + 1 && button.bottom <= config.height + 1, label + ' controls visible'); }
      item.checks.push({ label, geometry: result });
    };
    try {
      const url = new URL(entry); if (config.touch) url.searchParams.set('mobile', '1'); await page.goto(url.href, { waitUntil: 'load' }); await page.bringToFront();
      await wait(() => page.evaluate(() => !!window.__viral), Boolean, 'Game ready', 60000);
      await activate('[data-action="endless-start"],[data-action="camp-open"]'); await wait(state, value => value.camp && value.phase === 'playing', 'Camp ready');
      await visit('warehouse'); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'steady');
      assert.equal(await page.locator('.eq-detail [data-camp-skill]').count(), 0, 'Skills are secondary content'); await geometry('warehouse'); await capture('warehouse');
      await page.locator('[data-action="eq-tab"][data-tab="weapons"]').press('ArrowRight');
      await wait(() => page.locator('.eq-workspace').getAttribute('data-eq-tab'), value => value === 'modules', 'Keyboard selects next equipment tab');
      await page.keyboard.press('ArrowLeft');
      await wait(() => page.locator('.eq-workspace').getAttribute('data-eq-tab'), value => value === 'weapons', 'Keyboard returns to weapons');
      await activate('[data-action="eq-select-weapon"][data-weapon="piercing"]'); await activate('[data-action="camp-equip"][data-weapon="piercing"]'); assert.equal((await profile()).equipped, 'piercing');
      const unchanged = await profile(); await activate('[data-action="eq-detail"][data-detail="skills"]'); assert.equal(await page.locator('[data-camp-skill]').count(), 4); await capture('skills');
      await page.keyboard.press('Escape'); await wait(() => page.locator('.eq-workspace').getAttribute('data-eq-detail'), value => value === 'summary', 'Escape returns to weapon'); assert.deepEqual(await profile(), unchanged, 'Inspecting skills never mutates save');
      const beforeTrialScroll = await page.locator('.eq-detail-scroll').evaluate(element => element.scrollTop);
      await activate('[data-action="camp-trial"][data-weapon="piercing"]'); await page.locator('#camp-trial-canvas').waitFor({ state: 'visible' }); await activate('[data-action="camp-trial-fire"]');
      await activate('[data-action="camp-trial-return"]'); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'piercing'); assert.deepEqual(await profile(), unchanged, 'Trial preserves equipment and resources');
      assert.equal(await page.locator('.eq-detail-scroll').evaluate(element => element.scrollTop), beforeTrialScroll, 'Trial restores detail scroll position');
      await activate('[data-action="eq-tab"][data-tab="modules"]'); await activate('[data-action="eq-select-module"][data-module="EXPOSE_TRACE"]'); assert(await page.locator('[data-action="camp-module"]').isDisabled(), 'Full module slots explained');
      await activate('.eq-module-slots [data-action="eq-select-module"][data-module="PULSE_BREAK"]'); await activate('[data-action="camp-module"]');
      await activate('[data-action="eq-select-module"][data-module="EXPOSE_TRACE"]'); await activate('[data-action="camp-module"]'); assert((await profile()).equippedModules.includes('EXPOSE_TRACE')); await geometry('modules'); await capture('modules');
      await activate('[data-action="eq-tab"][data-tab="inventory"]'); await activate('[data-action="eq-select-inventory"][data-item="fixture:duplicate"]');
      const beforeDecompose = await profile(); await activate('[data-action="camp-decompose"]'); const afterDecompose = await profile(); assert.equal(afterDecompose.inventory.length, beforeDecompose.inventory.length - 1);
      assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'fixture:piercing', 'Selects next actual inventory item');
      await activate('[data-action="eq-select-inventory"][data-item="starter:steady"]'); assert(await page.locator('[data-action="camp-decompose"]').isDisabled(), 'Last starter weapon protected before click'); await geometry('inventory'); await capture('inventory-protected');
      await activate('[data-action="camp-close"]'); await visit('forge'); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'redblade');
      await geometry('repair'); await capture('repair'); const beforeRepair = await profile(); await activate('[data-action="camp-repair"]');
      assert.equal((await profile()).materials, beforeRepair.materials - 10); assert.equal((await profile()).weapons.redblade.repaired, 'gold');
      const beforeUpgrade = await profile(); await activate('[data-action="camp-upgrade"]'); assert.equal((await profile()).weapons.redblade.upgrade, 1); assert.equal((await profile()).materials, beforeUpgrade.materials - 8); await capture('upgraded');
      await activate('[data-action="camp-trial"][data-weapon="redblade"]'); await page.locator('#camp-trial-canvas').waitFor({ state: 'visible' }); await activate('[data-action="camp-trial-return"]');
      assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'redblade');
      await activate('[data-action="eq-tab"][data-tab="craft"]'); await activate('[data-action="eq-select-recipe"][data-template="steady"]'); await activate('[data-action="eq-rarity"][data-rarity="gold"]');
      assert.equal(await page.locator('[data-action="camp-craft"]').count(), 1, 'Single selected recipe'); await geometry('craft'); await capture('craft');
      const beforeCraft = await profile(); await activate('[data-action="camp-craft"]'); const crafted = await profile();
      assert.equal(crafted.materials, beforeCraft.materials - 40); assert.equal(crafted.cores, beforeCraft.cores - 1); assert.equal(crafted.fragments.steady, beforeCraft.fragments.steady - 20); assert.equal(crafted.inventory.length, beforeCraft.inventory.length + 1);
      assert.equal(await page.locator('[data-action="camp-craft"]').getAttribute('data-rarity'), 'gold'); await capture('crafted');
      await activate('[data-action="camp-close"]'); await page.keyboard.press('e'); await page.locator('.eq-workspace').waitFor({ state: 'visible' }); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-tab'), 'craft');
      await page.reload({ waitUntil: 'load' }); await wait(() => page.evaluate(() => !!window.__viral), Boolean, 'Reload ready', 60000); assert.deepEqual(await profile(), crafted, 'Real reload preserves all mutations');
      await activate('[data-action="endless-start"],[data-action="camp-open"]'); await visit('warehouse'); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-tab'), 'weapons', 'New camp visit resets presentation'); assert.equal(await page.locator('.eq-workspace').getAttribute('data-eq-selection'), 'piercing');
      assert.deepEqual(item.errors, []); item.pass = true;
    } catch (error) { item.error = String(error.stack ?? error); item.state = await state().catch(() => null); await capture('failure').catch(() => {}); }
    finally { await release().catch(() => {}); await context.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
  }
  report.pass = report.cases.length > 0 && report.cases.every(item => item.pass);
} finally { await browser.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ pass: report.pass, output, cases: report.cases.map(({ width, pass, error }) => ({ width, pass, error })) }, null, 2));
if (!report.pass) process.exitCode = 1;
