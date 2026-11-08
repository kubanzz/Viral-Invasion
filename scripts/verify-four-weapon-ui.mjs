import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';

// An explicit initial collection fixture, followed by real production controls.
// No live simulation, energy, clock, player position or user profile is injected.
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const output = resolve(option('--out') ?? 'artifacts/weapon-ultimates-20261106/ui');
const version = option('--version') ?? '0.19.0';
await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile'; export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready', materials: 100,
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], unlockedLegendaryWeapons: ['thunder', 'redblade'], equipped: 'thunder' });
for (const id of ['steady', 'piercing', 'thunder', 'redblade']) {
  const rarity = id === 'steady' || id === 'piercing' ? 'purple' : 'gold';
  fixture.weapons[id] = { repaired: rarity, pending: null, upgrade: 0 };
  if (!fixture.inventory.some(item => item.templateId === id)) fixture.inventory.push({ id: `ui-fixture:${id}`, templateId: id, rarity, kind: 'weapon', repaired: true });
}
const report = { scope: 'Explicit schema4 four-weapon collection fixture, then actual production camp inputs, isolated trial combat and live combat charge earned by real firing. Not a naturally earned collection, completed expedition, human playtest or physical-phone test.',
  fixture, startedAt: new Date().toISOString(), cases: [], errors: [], pass: false };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
report.harnessSha256 = sha(await readFile(new URL(import.meta.url)));
await writeFile(join(output, 'harness.mjs'), await readFile(new URL(import.meta.url)));
const persist = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
let served, browser;
const snapshot = page => page.evaluate(() => window.__viral.snapshot());
const diagnostics = page => page.evaluate(() => window.__viral.diagnostics());
const trial = page => page.evaluate(() => window.__viral.diagnostics().campTrial);
const profile = page => page.evaluate(() => window.__viral.campProfile().data);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function until(read, accept, label, timeout = 8000) {
  const started = Date.now(); let value;
  while (Date.now() - started < timeout) { value = await read(); if (accept(value)) return value; await new Promise(done => setTimeout(done, 30)); }
  throw Error(`${label}: ${JSON.stringify(value).slice(0, 1200)}`);
}

async function run(width, height, touchMode) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touchMode, isMobile: touchMode, deviceScaleFactor: 1,
    recordVideo: { dir: join(output, 'video'), size: { width, height } } });
  await context.addInitScript(({ key, value }) => { if (!sessionStorage.getItem('four-weapon-fixture')) {
    localStorage.setItem(key, JSON.stringify(value)); sessionStorage.setItem('four-weapon-fixture', 'installed');
  } }, { key: model.CAMP_PROFILE_STORAGE_KEY, value: fixture });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), touches = new Map(), held = new Set();
  const item = { width, height, touchMode, pageErrors: [], errors: [], responseHashes: {}, screenshots: [], weapons: [], walks: [], pass: false };
  report.cases.push(item); page.on('pageerror', error => item.pageErrors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(served.entry).origin) item.errors.push(`Remote request ${request.url()}`); });
  const drain = await observeServedResponses(cdp, item, new URL(served.entry).origin);
  const capture = async name => { const file = `${width}-${name}.png`; await page.screenshot({ path: join(output, file) }); item.screenshots.push(file); };
  const activate = async selector => {
    const locator = page.locator(selector).filter({ visible: true }).first(); await locator.waitFor({ state: 'visible' });
    await locator.scrollIntoViewIfNeeded(); if (touchMode) await locator.tap(); else await locator.click(); await page.waitForTimeout(65);
  };
  const center = async selector => { const box = await page.locator(selector).filter({ visible: true }).first().boundingBox(); assert.ok(box, selector);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height }; };
  const touch = async (type, id, point) => {
    if (type === 'touchEnd') { const ended = touches.get(id); if (!ended) return; await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [ended] }); touches.delete(id); }
    else if (type === 'touchCancel') { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [] }); touches.clear(); }
    else { touches.set(id, { id, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 }); await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] }); }
  };
  const release = async () => { if (touchMode) await touch('touchCancel', 0); for (const key of held) await page.keyboard.up(key); held.clear(); };
  const move = async (dx, dy) => {
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    if (touchMode) { const stick = await center('[data-stick=move]'); await touch(touches.has(1) ? 'touchMove' : 'touchStart', 1, { x: stick.x + dx * 30, y: stick.y + dy * 30 }); }
    else { const wanted = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]);
      for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); } }
  };
  const walk = async points => {
    const origin = model.campLayout(await snapshot(page)).origin;
    for (const point of points) {
      const destination = { x: origin.x + point.x, y: origin.y + point.y }, began = Date.now(); let state = await snapshot(page), stalled = 0;
      while (gap(state.player, destination) > 10) {
        assert.ok(Date.now() - began < 15000, `Walking deadline ${JSON.stringify({ point, player: state.player })}`);
        await move(destination.x - state.player.x, destination.y - state.player.y);
        await page.waitForTimeout(Math.min(90, Math.max(24, (gap(state.player, destination) - 5) / 235 * 1000)));
        const next = await snapshot(page); stalled = gap(next.player, state.player) < .15 ? stalled + 1 : 0;
        assert.ok(stalled < 20, `Blocked camp route ${JSON.stringify(point)}`);
        assert.ok(model.isCampPositionLegal(next.player, next.player.radius, model.campLayout(next)));
        state = next;
      }
      await release(); item.walks.push({ point, player: state.player });
    }
    await page.waitForTimeout(100);
  };
  const openStation = async id => {
    await page.keyboard.press('e');
    await until(() => page.locator('#camp-title').textContent().catch(() => ''), title => !!title && (id !== 'warehouse' || title === '装备仓库'), `Opened ${id}`);
  };
  try {
    await page.goto(`${served.entry}?seed=190071${touchMode ? '&mobile=1' : ''}`, { waitUntil: 'load' }); await page.bringToFront();
    await until(() => page.evaluate(() => window.__viral?.version), value => value?.startsWith(version), 'Production candidate ready', 60000);
    await activate('[data-action="camp-open"]'); await until(() => snapshot(page), state => !!state.camp && state.phase === 'playing', 'Entered camp');
    await walk([{ x: 0, y: 100 }, { x: -205, y: 100 }, { x: -205, y: -20 }, { x: -386, y: -20 }]); await openStation('warehouse');
    assert.equal(await page.locator('[data-camp-skill]').count(), 0, 'Weapon descriptions are secondary to selection');
    await capture('warehouse-selection');
    item.pngSkillIcons = [];
    const kitsOnly = option('--kits-only') === 'true';
    for (const weaponId of ['steady', 'piercing', 'thunder', 'redblade']) {
      const weapon = { weaponId, actions: [], layout: null, pass: false }; item.weapons.push(weapon);
      await activate(`[data-action="eq-select-weapon"][data-weapon="${weaponId}"]`);
      await activate('[data-action="eq-detail"][data-detail="skills"]');
      assert.equal(await page.locator('[data-camp-skill]').count(), 4, 'Only the selected weapon kit is displayed');
      if (report.expectedPngSkillIcons) {
        const icons = await page.evaluate(() => [...document.querySelectorAll('[data-camp-skill]')].map(row => {
          const id = row.dataset.campSkill, icon = row.querySelector(`[data-camp-art="skill-${id}"]`), svg = icon?.querySelector('svg');
          const style = icon && getComputedStyle(icon), svgStyle = svg && getComputedStyle(svg), rect = icon?.getBoundingClientRect();
          return { id, exists: !!icon, backgroundImage: !!style && style.backgroundImage !== 'none', width: rect?.width ?? 0, height: rect?.height ?? 0,
            fallbackHidden: !!svgStyle && (svgStyle.visibility === 'hidden' || svgStyle.display === 'none') };
        }));
        assert.equal(icons.length, 4);
        assert.ok(icons.every(icon => icon.exists && icon.backgroundImage && icon.fallbackHidden && icon.width >= 20 && icon.height >= 20),
          `Selected AI PNG skill icons replace the SVG fallback: ${JSON.stringify(icons)}`);
        item.pngSkillIcons.push(...icons);
      }
      await capture(`${weaponId}-kit`);
      if (kitsOnly) {
        for (const row of await page.locator('[data-camp-skill]').all()) {
          const id = await row.getAttribute('data-camp-skill');
          await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(40); await capture(`icon-${id}`);
        }
        weapon.pass = true; continue;
      }
      await activate(`[data-action="camp-trial"][data-weapon="${weaponId}"]`);
      await until(() => trial(page), value => value?.loadout.weaponId === weaponId, `Trial ${weaponId}`);
      const before = await profile(page);
      for (const slot of [0, 1, 2, 3, 4]) {
        await activate('[data-action="camp-trial-reset"]');
        await activate(`[data-action="camp-trial-layout"][data-layout="${weaponId === 'redblade' || slot === 2 ? 'melee' : 'single'}"]`);
        if (slot === 4) await activate('[data-action="camp-trial-fill"]');
        const initial = await trial(page);
        if (slot === 0) await activate('[data-action="camp-trial-fire"]');
        else if (slot === 4 && !touchMode) await page.keyboard.press('Digit4');
        else await activate(slot === 4 ? '[data-action="camp-trial-ultimate"]' : `[data-action="camp-trial-skill"][data-slot="${slot}"]`);
        await until(() => trial(page), value => slot === 0 ? value.shots > initial.shots : slot === 4 ? value.ultimateCasts === 1 : value.skillCasts[slot] === 1, `Accepted ${weaponId}/${slot}`);
        if (slot === 3 && weaponId !== 'piercing' && weaponId !== 'redblade') await activate('[data-action="camp-trial-fire"]');
        await until(() => trial(page), value => value.totalDamage > 0, `Actual damage ${weaponId}/${slot}`, 7000);
        await capture(`${weaponId}-${slot}-active`);
        const final = await trial(page); weapon.actions.push({ slot, hits: final.hits, damage: final.totalDamage, player: final.player, energy: final.ultimate?.energy, ultimateCasts: final.ultimateCasts });
      }
      assert.deepEqual(await profile(page), before, 'Trial cannot mutate collection or wallet');
      weapon.layout = await page.evaluate(() => {
        const panel = document.querySelector('.camp-panel'), canvas = document.getElementById('camp-trial-canvas'), content = document.querySelector('.camp-content');
        const c = canvas.getBoundingClientRect(), clip = content.getBoundingClientRect();
        return { overflow: panel.scrollWidth > panel.clientWidth, canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
          inside: c.left >= clip.left - 1 && c.right <= clip.right + 1 && c.top >= clip.top - 1 && c.bottom <= clip.bottom + 1,
          utilityInside: [...panel.querySelectorAll('.camp-trial-utility button')].every(button => { const r = button.getBoundingClientRect(); return r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1; }),
          buttons: [...panel.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width > 0).map(button => { const r = button.getBoundingClientRect(); return { action: button.dataset.action, x: r.x, y: r.y, width: r.width, height: r.height }; }) };
      });
      assert.equal(weapon.layout.overflow, false); assert.equal(weapon.layout.inside, true); assert.equal(weapon.layout.utilityInside, true, 'Whole utility hit targets stay inside the visible content clip');
      assert.ok(weapon.layout.canvas.height >= 75, 'Visible trial canvas');
      assert.ok(weapon.layout.buttons.every(button => button.width >= 48 && button.height >= 48), '48px trial hit targets');
      await capture(`${weaponId}-layout`); weapon.pass = true;
      await activate('[data-action="camp-trial-return"]');
    }
    if (report.expectedPngSkillIcons) assert.equal(new Set(item.pngSkillIcons.map(icon => icon.id)).size, 16, 'All sixteen PNG skill icons are discoverable through selection');
    if (kitsOnly) {
      item.scope = 'Supplemental per-weapon skill detail PNG inspection; actual combat and trials are attested in the main UI report.';
      assert.deepEqual(item.pageErrors, []); item.pass = true; return;
    }
    await activate('[data-action="eq-select-weapon"][data-weapon="thunder"]');
    const equipThunder = page.locator('[data-action="camp-equip"][data-weapon="thunder"]');
    if (await equipThunder.count() && await equipThunder.isEnabled()) await activate('[data-action="camp-equip"][data-weapon="thunder"]');
    await activate('.camp-close[data-action="camp-close"]');
    await walk([{ x: -205, y: -20 }, { x: -205, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }]);
    await openStation('departure'); await activate('[data-action="camp-deploy"]');
    await until(() => snapshot(page), state => !state.camp && state.phase === 'playing', 'Production deployment');
    if (touchMode) {
      item.battle = { initial: await snapshot(page), controls: [], samples: [], pass: false };
      const selectors = ['[data-stick=move]', '[data-stick=attack]', '[data-weapon-skill="1"]', '[data-weapon-skill="2"]', '[data-weapon-skill="3"]', '[data-weapon-ultimate]', '[data-touch-action=dash]'];
      item.battle.controls = await Promise.all(selectors.map(async selector => ({ selector, ...await center(selector) })));
      assert.ok(item.battle.controls.every(control => control.width >= 48 && control.height >= 48));
      const buttons = item.battle.controls.slice(1);
      for (let a = 0; a < buttons.length; a++) for (let b = a + 1; b < buttons.length; b++) {
        const x = Math.abs(buttons[a].x - buttons[b].x) - (buttons[a].width + buttons[b].width) / 2;
        const y = Math.abs(buttons[a].y - buttons[b].y) - (buttons[a].height + buttons[b].height) / 2;
        assert.ok(x >= 7.5 || y >= 7.5, `Control gaps ${buttons[a].selector}/${buttons[b].selector}`);
      }
      const attack = await center('[data-stick=attack]'); await touch('touchStart', 2, attack);
      const began = Date.now();
      while (Date.now() - began < 100000) {
        const state = await snapshot(page);
        if (state.weaponCombat?.ultimateEnergy >= 100) break;
        assert.equal(state.phase, 'playing', 'First meter earned before a result'); assert.ok(state.player.hp > 0);
        const enemy = state.targets.filter(target => target.hp > 0 && (target.role === 'virus' || target.role === 'elite')).sort((a, b) => gap(a, state.player) - gap(b, state.player))[0];
        if (enemy) { const dx = enemy.x - state.player.x, dy = (enemy.y - state.player.y) * .72, length = Math.hypot(dx, dy) || 1;
          await touch('touchMove', 2, { x: attack.x + dx / length * 30, y: attack.y + dy / length * 30 }); }
        await page.waitForTimeout(90);
      }
      const before = await snapshot(page); assert.equal(before.weaponCombat.ultimateEnergy, 100, 'Meter earned only from actual production kills'); item.battle.charged = before;
      await capture('battle-earned-charge');
      const movement = await center('[data-stick=move]'), ultimate = await center('[data-weapon-ultimate]');
      await touch('touchStart', 1, { x: movement.x + 26, y: movement.y });
      await touch('touchStart', 3, ultimate);
      await until(() => diagnostics(page), value => value.touch.preview?.weaponUltimate, 'Third-finger ultimate preview');
      await capture('battle-three-finger-preview'); await touch('touchEnd', 3);
      await until(() => snapshot(page), state => state.events.some(event => event.type === 'WEAPON_ULTIMATE_CAST'), 'Production ultimate accepted');
      await page.waitForTimeout(700); const after = await snapshot(page); item.battle.after = after;
      assert.ok(after.shots > before.shots); assert.ok(gap(after.player, before.player) > 10);
      assert.equal(after.events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST').length, 1);
      assert.ok(after.weaponCombat.ultimateEnergy < 100); await capture('battle-ultimate');
      await release(); await page.keyboard.press('Escape'); const paused = await snapshot(page); await page.waitForTimeout(120); assert.equal((await snapshot(page)).tick, paused.tick);
      item.battle.pass = true;
    }
    assert.deepEqual(item.pageErrors, []); assert.deepEqual(item.errors, []); item.pass = true;
  } catch (error) { item.error = String(error.stack ?? error); report.errors.push(item.error); item.failure = { state: await snapshot(page).catch(() => null), diagnostics: await diagnostics(page).catch(() => null) }; await capture('failure').catch(() => {}); }
  finally { await release().catch(() => {}); await drain(); const video = page.video(); await context.close(); if (video) item.video = await video.path(); await persist(); }
}

try {
  served = await startServedCandidate({ metadataPath: option('--meta') ?? process.env.VI_BUILD_META, expectedVersion: version });
  report.candidate = served.snapshot(); report.outputBefore = await served.diskHashes();
  report.expectedPngSkillIcons = Object.keys(served.metadata.sourceManifest ?? {}).some(path => /ViralInvasion_WeaponUltimates_v1[\\/]icons[\\/]/.test(path));
  browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true });
  for (const [width, height, touch] of [[1366, 768, false], [667, 320, true]]) {
    if (!option('--width') || Number(option('--width')) === width) await run(width, height, touch);
  }
  report.outputAfter = await served.diskHashes(); assert.deepEqual(report.outputAfter, report.outputBefore);
  report.pass = report.cases.length > 0 && report.cases.every(item => item.pass) && report.errors.length === 0;
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally { await browser?.close(); if (served) { report.transport = served.snapshot(); await served.close(); } report.finishedAt = new Date().toISOString(); await persist(); }
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(({ width, pass, error }) => ({ width, pass, error })), errors: report.errors }, null, 2));
if (!report.pass) process.exitCode = 1;
