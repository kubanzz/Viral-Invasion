import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Component fixtures exercise production markup, reducers and CSS. They do not
// represent naturally earned equipment, live game navigation or a phone playtest.
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const output = resolve(option('--out') ?? 'artifacts/camp-equipment-20261107/components');
await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: `
export { campOverlay } from './src/ui/campHud';
export { emptyCampProfile } from './src/meta/campProfile';
export { createCampEquipmentState, reduceCampEquipmentAction } from './src/ui/campEquipmentState';
export { expeditionIconStyles } from './src/render/expeditionArt';
export { TEMPLATE_IDS, MODULE_IDS } from './src/game/microfront';
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const cssFiles = ['src/style.css', 'src/ui/artTheme.css', 'src/ui/mobile.css', 'src/ui/camp.css', 'src/ui/campSummon.css', 'src/ui/microfront.css', 'src/ui/weaponSkills.css', 'src/ui/sanctum.css', 'src/ui/campEquipment.css'];
const css = (await Promise.all(cssFiles.map(name => readFile(name, 'utf8')))).join('\n');
const art = model.expeditionIconStyles(JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8')));
const sources = [...cssFiles, 'src/ui/campHud.ts', 'src/ui/campEquipmentHud.ts', 'src/ui/campEquipmentState.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async name => [name, createHash('sha256').update(await readFile(name)).digest('hex')])));
const owned = model.emptyCampProfile();
Object.assign(owned, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], materials: 90, cores: 3, equipped: 'steady', unlockedLegendaryWeapons: ['thunder', 'redblade'],
  fragments: Object.fromEntries(model.TEMPLATE_IDS.map(id => [id, 23])), equippedModules: model.MODULE_IDS.slice(0, 3) });
for (const id of ['steady', 'piercing', 'thunder', 'redblade']) {
  const rarity = ['steady', 'piercing'].includes(id) ? 'purple' : 'gold';
  owned.weapons[id] = { repaired: rarity, pending: null, upgrade: id === 'steady' ? 1 : 0 };
  if (!owned.inventory.some(item => item.templateId === id)) owned.inventory.push({ id: `component:${id}`, templateId: id, kind: 'weapon', rarity, repaired: true });
}
for (const id of model.MODULE_IDS) owned.inventory.push({ id: `component:${id}`, templateId: id, kind: 'module', rarity: 'purple', repaired: true });
owned.inventory.push({ id: 'component:duplicate', templateId: 'steady', kind: 'weapon', rarity: 'blue', repaired: true });
const pending = structuredClone(owned);
pending.materials = 5;
pending.weapons.piercing.pending = 'gold';
pending.inventory.push({ id: 'component:broken', templateId: 'piercing', kind: 'weapon', rarity: 'gold', repaired: false });
const fresh = model.emptyCampProfile();
Object.assign(fresh, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, builtFacilities: [...owned.builtFacilities] });
const maxed = structuredClone(owned); maxed.weapons.steady.upgrade = 3;
const empty = structuredClone(fresh); empty.inventory = []; empty.weapons.steady.repaired = null;
const snapshots = Object.fromEntries(Object.entries({ owned, pending, fresh, maxed, empty }).map(([name, data]) => [name, { data, status: { mode: 'persistent', code: 'saved', message: '营地已保存。' } }]));
snapshots.saveFailure = { data: structuredClone(owned), status: { mode: 'session', code: 'write-failed', message: '营地档案暂时无法写入本地存储，本次装备与材料改动保留于当前页面；请保持页面打开并重试保存。' } };
const report = { scope: 'Isolated production equipment component fixtures, production presentation reducer and real mouse/touch controls. Layout and rendering evidence only; not naturally earned inventory, live game routing, game combat or physical phones.', startedAt: new Date().toISOString(), sourceHashes, installedArt: art.installed, cases: [], errors: [], pass: false };
const browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true });
const testCases = [
  ['warehouse-weapons', 'owned', 'warehouse', { warehouseTab: 'weapons' }],
  ['warehouse-skills', 'owned', 'warehouse', { warehouseTab: 'weapons', detail: 'skills', weaponId: 'piercing' }],
  ['warehouse-locked', 'fresh', 'warehouse', { warehouseTab: 'weapons', weaponId: 'thunder' }],
  ['warehouse-modules', 'owned', 'warehouse', { warehouseTab: 'modules' }],
  ['warehouse-modules-unowned', 'fresh', 'warehouse', { warehouseTab: 'modules' }],
  ['warehouse-inventory', 'owned', 'warehouse', { warehouseTab: 'inventory', inventoryItemId: 'component:duplicate' }],
  ['warehouse-protected', 'fresh', 'warehouse', { warehouseTab: 'inventory' }],
  ['warehouse-empty', 'empty', 'warehouse', { warehouseTab: 'inventory' }],
  ['forge-repair', 'pending', 'forge', { forgeTab: 'maintenance' }],
  ['forge-upgrade', 'owned', 'forge', { forgeTab: 'maintenance', forgeWeaponId: 'steady', maintenanceMode: 'upgrade' }],
  ['forge-maxed', 'maxed', 'forge', { forgeTab: 'maintenance', forgeWeaponId: 'steady', maintenanceMode: 'upgrade' }],
  ['forge-craft', 'owned', 'forge', { forgeTab: 'craft', craftTemplateId: 'steady', craftRarities: { steady: 'gold' } }],
  ['forge-locked', 'fresh', 'forge', { forgeTab: 'craft', craftTemplateId: 'redblade' }],
  ['forge-sources', 'owned', 'forge', { forgeTab: 'craft', detail: 'sources' }],
  ['warehouse-save-failure', 'saveFailure', 'warehouse', { warehouseTab: 'weapons' }],
];
try {
  for (const [width, height] of [[1366, 768], [844, 390], [667, 320]]) {
    if (option('--width') && Number(option('--width')) !== width) continue;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>${art.css}</style><style>body{background:radial-gradient(ellipse at 30% 40%,#d8dfc9,#acc1af);}.overlay{pointer-events:auto}</style></head><body><div id="app"><div id="overlay-host"></div></div></body></html>`);
    await page.evaluate(() => document.addEventListener('click', event => { window.lastEquipmentClick = event.target.closest('button')?.dataset; }));
    for (const [name, fixture, section, overrides] of testCases) {
      const snapshot = snapshots[fixture];
      let state = { ...model.createCampEquipmentState(snapshot), ...overrides };
      const item = { width, height, name, fixture, pass: false, errors: [] }; report.cases.push(item);
      const render = async () => {
        const markup = model.campOverlay(snapshot, section, 1, '', { equipment: state });
        await page.locator('#overlay-host').evaluate((host, markup) => { host.innerHTML = markup; }, markup);
        await page.evaluate(() => document.fonts.ready);
      };
      try {
        await render();
        const measurements = await page.evaluate(() => {
          const panel = document.querySelector('.camp-equipment-panel');
          const bounds = element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }; };
          const scroll = document.querySelector('.eq-detail-scroll'), actions = document.querySelector('.eq-actions');
          const controls = [...panel.querySelectorAll('button')].map(button => ({ action: button.dataset.action, label: button.textContent.trim(), ...bounds(button) }));
          const fixedControls = [...panel.querySelectorAll('.camp-header button,.eq-actions button,.camp-storage button')].map(button => ({ action: button.dataset.action, label: button.textContent.trim(), ...bounds(button) }));
          const horizontalOverflows = [...panel.querySelectorAll('.eq-workspace,.eq-list,.eq-detail,.eq-detail-scroll,.eq-actions,.camp-header')].filter(element => element.scrollWidth > element.clientWidth + 2).map(element => ({ class: element.className, client: element.clientWidth, scroll: element.scrollWidth }));
          const smallText = [...panel.querySelectorAll('p,small,.eq-tag,.eq-item-state,.camp-quality,.eq-kicker')].filter(element => element.getClientRects().length && element.textContent.trim() && parseFloat(getComputedStyle(element).fontSize) < 12).map(element => ({ class: element.className, size: getComputedStyle(element).fontSize, text: element.textContent.slice(0, 50) }));
          const critical = [...panel.querySelectorAll('.eq-stats,.eq-costs,.eq-maintenance-result')].map(element => ({ class: element.className, ...bounds(element) }));
          return { panel: bounds(panel), scroll: bounds(scroll), actions: bounds(actions), controls, fixedControls, horizontalOverflows, smallText, critical, skillCount: panel.querySelectorAll('[data-camp-skill]').length, returnCount: panel.querySelectorAll('.camp-footer [data-action="camp-close"]').length };
        });
        item.measurements = measurements;
        assert.ok(measurements.panel.x >= -1 && measurements.panel.right <= width + 1 && measurements.panel.y >= -1 && measurements.panel.bottom <= height + 1, 'Panel remains in the viewport');
        assert.deepEqual(measurements.horizontalOverflows, [], 'Workspace has no horizontal overflow');
        assert.deepEqual(measurements.smallText, [], 'Supporting text remains at least12px');
        for (const control of measurements.controls) assert.ok(control.height >= 43.9 && control.width >= 43.9, `Touch target >=44px: ${control.label}`);
        for (const control of measurements.fixedControls) assert.ok(control.x >= 0 && control.right <= width && control.y >= 0 && control.bottom <= height, `Fixed action in viewport: ${control.label}`);
        assert.equal(measurements.returnCount, 0, 'No duplicated footer return button');
        assert.equal(measurements.skillCount, overrides.detail === 'skills' ? 4 : 0, 'Detailed skill text mounts only for the selected explicit detail');
        assert.ok(measurements.scroll.height >= 65, 'Detail retains a usable scroll area');
        if (name === 'warehouse-save-failure') assert.equal(await page.locator('[data-action="camp-retry-save"]').count(), 1, 'Save failures retain the visible retry action');
        if (['warehouse-weapons', 'forge-repair', 'forge-upgrade', 'forge-craft'].includes(name)) {
          for (const block of measurements.critical) assert.ok(block.y >= measurements.scroll.y - 1 && block.bottom <= measurements.scroll.bottom + 1, `Key attributes and material costs visible without scrolling: ${block.class}`);
        }
        if (name === 'warehouse-weapons') {
          const selector = '.eq-tabs [data-tab="modules"]';
          if (width < 1000) await page.locator(selector).tap(); else await page.locator(selector).click();
          const dataset = await page.evaluate(() => ({ ...window.lastEquipmentClick }));
          state = model.reduceCampEquipmentAction(snapshot, state, dataset.action, dataset);
          assert.equal(state.warehouseTab, 'modules'); await render();
          assert.equal(await page.locator('[data-eq-tab="modules"]').count(), 1);
          state = { ...model.createCampEquipmentState(snapshot), ...overrides }; await render();
        }
        const file = `${width}x${height}-${name}.png`; await page.screenshot({ path: join(output, file) }); item.screenshot = file; item.pass = true;
      } catch (error) {
        item.errors.push(String(error.stack ?? error));
        await page.screenshot({ path: join(output, `${width}x${height}-${name}-failure.png`) }).catch(() => {});
      }
    }
    await context.close();
  }
  report.pass = report.cases.length > 0 && report.cases.every(item => item.pass) && report.errors.length === 0;
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, failed: report.cases.filter(item => !item.pass).map(({ width, name, errors }) => ({ width, name, errors })), errors: report.errors }, null, 2));
if (!report.pass) process.exitCode = 1;
