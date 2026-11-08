import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const entry = process.env.VI_BLADE_ENTRY ?? 'http://127.0.0.1:57120/';
const output = resolve('artifacts/blade-v020/browser'); await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const profile = model.emptyCampProfile();
Object.assign(profile, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready', materials: 100,
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure', 'farm', 'house'], unlockedLegendaryWeapons: ['redblade'], equipped: 'redblade' });
profile.weapons.redblade = { repaired: 'gold', pending: null, upgrade: 0 };
profile.inventory.push({ id: 'blade-v020-collection', templateId: 'redblade', rarity: 'gold', kind: 'weapon', repaired: true });
const report = { scope: 'Authorized initial owned-gold-blade collection fixture only; real production camp walking and actual trusted mouse/touch input in isolated trial. Read-only __viral diagnostics; no live HP, energy, clock or actor injection. Desktop browser emulation is not a physical-phone playtest.', entry, cases: [], pass: false };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const wait = async (read, accept, label, timeout = 10000) => {
  const start = Date.now(); let value;
  while (Date.now() - start < timeout) { value = await read(); if (accept(value)) return value; await new Promise(done => setTimeout(done, 15)); }
  throw Error(label + ': ' + JSON.stringify(value).slice(0, 800));
};
try {
  for (const [width, height, touch] of [[1366, 768, false], [844, 390, true], [667, 320, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    await context.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: model.CAMP_PROFILE_STORAGE_KEY, profile });
    const page = await context.newPage(), errors = [], item = { width, height, touch, errors, screenshots: [], pass: false };
    report.cases.push(item); page.on('pageerror', error => errors.push(String(error)));
    const read = () => page.evaluate(() => window.__viral.snapshot()), trial = () => page.evaluate(() => window.__viral.diagnostics().campTrial);
    const click = async selector => {
      item.action = selector;
      for (let attempt = 0; ; attempt++) try {
        const control = page.locator(selector).filter({ visible: true }).first();
        await control.scrollIntoViewIfNeeded(); if (touch) await control.tap(); else await control.click(); await page.waitForTimeout(35); return;
      } catch (error) { if (attempt >= 3 || !String(error).includes('not attached')) throw error; await page.waitForTimeout(80); }
    };
    const capture = async name => { const path = `${width}-${name}.png`; await page.screenshot({ path: join(output, path) }); item.screenshots.push(path); };
    const cdp = await context.newCDPSession(page);
    const touchEvent = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ id: 7, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }] });
    await page.goto(entry + '?seed=200071' + (touch ? '&mobile=1' : ''), { waitUntil: 'load' }); await page.bringToFront();
    await wait(() => page.evaluate(() => !!window.__viral), Boolean, 'runtime ready', 60000);
    await click('[data-action="camp-open"]'); await wait(read, state => !!state.camp, 'camp');
    const origin = model.campLayout(await read()).origin;
    for (const point of [{ x: 0, y: 100 }, { x: -205, y: 100 }, { x: -205, y: -20 }, { x: -386, y: -20 }]) {
      const target = { x: origin.x + point.x, y: origin.y + point.y }, start = Date.now();
      while (true) {
        const state = await read(), dx = target.x - state.player.x, dy = target.y - state.player.y, gap = Math.hypot(dx, dy);
        if (gap <= 11) break;
        assert(Date.now() - start < 16000, 'camp walk deadline');
        // Keyboard walking is trusted even in a touch-enabled browser; drawing below uses CDP touch.
        const keys = [...(dx < -8 ? ['a'] : dx > 8 ? ['d'] : []), ...(dy < -8 ? ['w'] : dy > 8 ? ['s'] : [])];
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(Math.min(80, Math.max(20, (gap - 8) / 235 * 1000)));
        for (const key of keys) await page.keyboard.up(key);
      }
    }
    await page.keyboard.press('e'); await wait(() => page.locator('#camp-title').textContent().catch(() => ''), value => value === '装备仓库', 'warehouse');
    await click('[data-action="camp-trial"][data-weapon="redblade"]'); await wait(trial, value => value?.loadout.weaponId === 'redblade', 'blade trial');
    const canvas = page.locator('#camp-trial-canvas'); await canvas.scrollIntoViewIfNeeded();
    const projection = () => canvas.evaluate(element => {
      const rect=element.getBoundingClientRect(), p=JSON.parse(element.dataset.trialProjection);
      return {...p,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},pixelWidth:element.width,pixelHeight:element.height,
        expandedClass:element.closest('.camp-panel').classList.contains('camp-trial-trace-expanded')};
    });
    const screen = point => canvas.evaluate((element, point) => {
      const box=element.getBoundingClientRect(), p=JSON.parse(element.dataset.trialProjection);
      return {x:box.x+element.clientLeft+(p.offsetX+point.x*p.scale)*(box.width-element.clientLeft*2)/p.width,
        y:box.y+element.clientTop+(p.offsetY+point.y*p.scale)*(box.height-element.clientTop*2)/p.height};
    }, point);
    item.normalCanvas=await projection();
    const activate = async () => { await click('[data-action="camp-trial-reset"]'); await click('[data-action="camp-trial-layout"][data-layout="melee"]');
      await click('[data-action="camp-trial-fill"]'); await click('[data-action="camp-trial-ultimate"]');
      const state=await wait(trial, value => value?.bladeTrace?.phase === 'drawing', 'four marks');
      await wait(projection,value=>value.expanded&&value.expandedClass,'Focused canvas expanded');return state; };
    let value = await activate(); assert.equal(value.bladeTrace.marks.length, 4); await canvas.scrollIntoViewIfNeeded(); await capture('four-points');
    const focused=await projection(); item.focusedCanvas=focused;
    assert(focused.rect.width>=width-40,'Drawing surface uses the available viewport width');
    assert(focused.rect.height>=height*.5,'Drawing surface uses at least half the available screen height');
    assert(focused.scale>item.normalCanvas.scale*1.8,'Points and actors are magnified by the same focused camera');
    assert(Math.abs(focused.pixelWidth-focused.width*focused.dpr)<=1&&Math.abs(focused.pixelHeight-focused.height*focused.dpr)<=1,'True DPR backing pixels');
    const stableCanvas=await canvas.elementHandle();
    const marks = value.bladeTrace.marks.map(mark => ({ x: mark.x, y: mark.y }));
    let at = await screen(marks[0]);
    if (touch) await touchEvent('touchStart', at); else { await page.mouse.move(at.x, at.y); await page.mouse.down(); }
    at = await screen(marks[1]); if (touch) await touchEvent('touchMove', at); else await page.mouse.move(at.x, at.y, { steps: 3 });
    const during=await projection();assert.deepEqual(during,focused,'Canvas and camera stay fixed during the drag');
    assert(await stableCanvas.evaluate(element=>element===document.getElementById('camp-trial-canvas')),'The gesture never replaces the canvas node');
    await capture('partial-route');
    for (const mark of marks.slice(2)) { at = await screen(mark); if (touch) await touchEvent('touchMove', at); else await page.mouse.move(at.x, at.y, { steps: 2 }); }
    await capture('piercing'); if (touch) await touchEvent('touchEnd'); else await page.mouse.up();
    value = await wait(trial, state => !state.bladeTrace, 'manual finished'); assert(value.totalDamage > 0); item.manualDamage = value.totalDamage;
    await wait(projection,state=>!state.expanded&&!state.expandedClass,'Original range layout restored');
    item.restoredCanvas=await projection();assert(Math.abs(item.restoredCanvas.rect.width-item.normalCanvas.rect.width)<2&&Math.abs(item.restoredCanvas.rect.height-item.normalCanvas.rect.height)<2,'Original canvas dimensions restored');
    assert(value.events.some(event => event.type === 'BLADE_TRACE_FINISHED' && event.data.manual)); await capture('manual-final');
    value = await activate(); const cancelAt = await screen(value.bladeTrace.marks[0]);
    if (touch) { await touchEvent('touchStart', cancelAt); await touchEvent('touchCancel'); }
    else { await page.mouse.move(cancelAt.x, cancelAt.y); await page.mouse.down(); await page.mouse.up(); }
    // Minimize the controlled headless window to deliver actual focus/visibility
    // changes; foreground pages ignore Page.setWebLifecycleState('frozen').
    const windowInfo = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId: windowInfo.windowId, bounds: { windowState: 'minimized' } });
    const frozen = await trial(); await page.waitForTimeout(600);
    const background = await trial();
    await cdp.send('Browser.setWindowBounds', { windowId: windowInfo.windowId, bounds: { windowState: 'normal' } }); await page.bringToFront();
    item.pause = { before: frozen.elapsed, after: background.elapsed, method: 'CDP controlled window minimized/restored' };
    assert(Math.abs(background.elapsed - frozen.elapsed) < .15, 'resume replayed hidden time debt');
    value = await wait(trial, state => !state.bladeTrace && state.totalDamage > 0, 'timeout finished', 6000);
    assert(value.events.some(event => event.type === 'BLADE_TRACE_FINISHED' && !event.data.manual)); item.timeoutDamage = value.totalDamage;
    await capture('timeout-final');
    await click('[data-action="camp-trial-reset"]'); await click('[data-action="camp-trial-skill"][data-slot="2"]');
    value = await wait(trial, state => state.events.some(event => event.type === 'BLADE_PARRIED' && event.data.perfect), 'real practice counter');
    item.counterDamage = value.totalDamage; await capture('counter');
    await activate();await click('[data-action="camp-trial-return"]');
    await wait(()=>page.locator('#camp-title').textContent().catch(()=>''),value=>value==='装备仓库','Expanded trial can be canceled with return');
    assert.equal(await page.locator('#camp-trial-canvas').count(),0);await capture('canceled-return');
    assert.deepEqual(errors, []); item.pass = true;
    await context.close();
  }
  report.pass = true;
} catch (error) { report.failure = String(error); process.exitCode = 1; }
finally { await browser.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ pass: report.pass, failure: report.failure, cases: report.cases.map(item => ({ width: item.width, pass: item.pass, errors: item.errors })), output }));
