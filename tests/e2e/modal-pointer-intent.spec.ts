import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('modal submits require the same pressed element while mouse, touch and keyboard remain usable', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 667, height: 320 }, hasTouch: true });
  const page = await context.newPage();
  const bundle = await build({ stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    import { ModalPointerIntent } from './src/ui/modalPointerIntent';
    const app = document.querySelector('#app'), intent = new ModalPointerIntent();
    let accepted = 0;
    addEventListener('pointerdown', event => {
      const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      intent.pointerDown(event.pointerId, button && app.contains(button) && !button.disabled ? button : null, event.pointerType);
    }, { capture: true });
    addEventListener('pointerup', event => {
      const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      intent.pointerUp(event.pointerId, button && app.contains(button) && !button.disabled ? button : null);
    }, { capture: true });
    addEventListener('pointercancel', event => intent.pointerCancel(event.pointerId), { capture: true });
    app.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      if (!intent.acceptsClick(event, button, !!button.closest('.overlay'))) { event.preventDefault(); return; }
      accepted++;
    });
    window.fixture = { count: () => accepted, clear: () => { accepted = 0; document.querySelector('#host').innerHTML = ''; },
      show: () => { document.querySelector('#host').innerHTML = '<div class="overlay"><button data-action="endless-upgrade">选择强化</button></div>'; } };
  ` }, bundle: true, write: false, format: 'iife', target: ['chrome110'] });
  await page.setContent(`<style>body{margin:0}canvas{width:667px;height:320px;background:#d7b5a2}.overlay{position:absolute;inset:0}button{position:absolute;left:40px;top:40px;width:200px;height:100px}</style><canvas id="game"></canvas><div id="app"><div id="host"></div></div><script>${bundle.outputFiles[0].text}</script>`);
  const count = () => page.evaluate(() => (window as unknown as { fixture: { count(): number } }).fixture.count());
  const show = () => page.evaluate(() => (window as unknown as { fixture: { show(): void } }).fixture.show());
  const clear = () => page.evaluate(() => (window as unknown as { fixture: { clear(): void } }).fixture.clear());

  // Real held mouse input crosses the newly created modal. A compatibility
  // click with a real pointer detail also must not turn this release into intent.
  await page.mouse.move(100, 90); await page.mouse.down(); await show(); await page.mouse.up();
  await page.locator('button').dispatchEvent('click', { bubbles: true, detail: 1 });
  expect(await count()).toBe(0);
  await page.locator('button').click(); expect(await count()).toBe(1);
  await page.locator('button').focus(); await page.keyboard.press('Enter'); expect(await count()).toBe(2);
  await page.keyboard.press('Space'); expect(await count()).toBe(3);

  // Matching an action string is insufficient: replacement draft buttons are
  // different DOM elements and need their own press.
  await clear(); await show(); await page.mouse.move(100, 90); await page.mouse.down();
  await show(); await page.mouse.up(); await page.locator('button').dispatchEvent('click', { bubbles: true, detail: 1 });
  expect(await count()).toBe(0);

  await clear();
  await page.locator('#game').dispatchEvent('pointerdown', { bubbles: true, pointerId: 17, pointerType: 'touch' });
  await show();
  await page.evaluate(() => document.querySelector('button')!.dispatchEvent(new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 17, pointerType: 'touch' })));
  expect(await count()).toBe(0);
  await page.locator('button').tap(); expect(await count()).toBe(1);

  await clear();
  await page.locator('#game').dispatchEvent('pointerdown', { bubbles: true, pointerId: 0, pointerType: 'touch' }); await show();
  await page.locator('button').dispatchEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch' });
  await page.locator('#game').dispatchEvent('pointerup', { bubbles: true, pointerId: 0, pointerType: 'touch' });
  await page.evaluate(() => document.querySelector('button')!.dispatchEvent(new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1, pointerType: 'mouse' })));
  expect(await count()).toBe(0);
  await page.locator('button').dispatchEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' });
  await page.evaluate(() => document.querySelector('button')!.dispatchEvent(new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1, pointerType: 'mouse' })));
  expect(await count()).toBe(1);

  // Keyboard and assistive synthetic clicks have detail 0 and remain available.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('button')!.click()); expect(await count()).toBe(2);
  await info.attach('scope', { body: 'DOM event fixture of the production ModalPointerIntent helper. Covers cross-modal mouse/touch release, replacement button identity, normal mouse/touch input, keyboard Enter/Space and detail-zero activation; not a natural combat run.', contentType: 'text/plain' });
  await context.close();
});
