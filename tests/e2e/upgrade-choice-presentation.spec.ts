import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A production-UI fixture, not a full campaign run. It uses the real markup,
// styles, art atlas and choice reducers without a writable production debug API.
const directory = resolve('artifacts/visual-polish-20261029/upgrade-ui/fixture');
const entry = pathToFileURL(resolve(directory, 'index.html')).href;
test.beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import './src/style.css';
    import { GameSession } from './src/game/session';
    import { GrowthController } from './src/game/growth';
    import { makeDraftOption } from './src/game/protocols';
    import { offerEndlessUpgrade, chooseEndlessUpgrade } from './src/game/endlessGrowth';
    import { draftOverlay } from './src/ui/growthHud';
    import { endlessOverlay } from './src/ui/endlessHud';
    import { installArtIcons } from './src/ui/artIcons';
    import './src/ui/endless.css';
    import './src/ui/artTheme.css';
    installArtIcons(document);
    const mode=new URL(location.href).searchParams.get('mode')??'protocol';
    const game=new GameSession(13,{mode:mode==='endless'?'endless':undefined,campaign:true,milestone:'G3'}); game.start();
    const state=game.state, growth=new GrowthController(13,'upgrade-fixture');
    state.growth=growth.state; state.phase='paused';
    if(mode==='endless') offerEndlessUpgrade(state.endlessGrowth,1);
    else {
      if(mode==='replacement') growth.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced'},{id:'PURIFY_CHAIN',tuning:'balanced'},{id:'IMMUNE_BEACON',tuning:'balanced'}];
      growth.state.draft={id:'fixture:protocol:1',serial:1,source:'xp',status:'choosing',options:['EXPOSE_TRACE','IMMUNE_BEACON','PURIFY_CHAIN'].map(id=>makeDraftOption(id,'balanced','equip'))};
    }
    const app=document.getElementById('app'), receipt=document.getElementById('fixture-state');
    let result=null;
    function render(){
      app.innerHTML=mode==='endless'?endlessOverlay(state,false,false)??'':draftOverlay(state)??'';
      receipt.textContent=JSON.stringify({draft:growth.state.draft,equipped:growth.state.equipped,endlessDraft:state.endlessGrowth?.draft,ranks:state.endlessGrowth?.ranks,result});
    }
    app.addEventListener('click',event=>{
      const button=event.target.closest('[data-action]'); if(!button)return;
      const action=button.dataset.action;
      if(action==='draft-option'||action==='draft-replace') result=growth.chooseDraft({runId:growth.state.runId,draftId:button.dataset.draft,optionId:button.dataset.option,...(action==='draft-replace'?{slotIndex:Number(button.dataset.slot),expectedPreviousProtocolId:button.dataset.previous}:{})});
      else if(action==='draft-back') growth.backToDraft(button.dataset.draft,growth.state.runId);
      else if(action==='endless-upgrade') result=chooseEndlessUpgrade(state.endlessGrowth,button.dataset.draft,button.dataset.upgrade);
      else return;
      render();
    });
    render();
  ` }, bundle: true, outfile: resolve(directory, 'fixture.js'), format: 'iife', logLevel: 'silent' });
  writeFileSync(resolve(directory, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>强化选择界面验证</title><link rel="stylesheet" href="fixture.css"><body><div id="app"></div><output id="fixture-state" hidden></output><script src="fixture.js"></script></body></html>');
});

for (const width of [1366, 390]) {
  test(`upgrade UI disclosure and choice controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${entry}?mode=protocol`);
    const receipt = page.locator('#fixture-state'), before = await receipt.textContent();
    await expect(page.locator('.choice-icon')).toHaveCount(3);
    await expect(page.locator('.upgrade-details[open]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`protocol-${width}.png`) });
    const disclosure = page.locator('.upgrade-details').first();
    await disclosure.locator('summary').click();
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(disclosure.locator('.draft-effect')).toBeVisible();
    expect(await receipt.textContent()).toBe(before);
    // Native summary is keyboard operable and cannot submit the adjacent card.
    await page.keyboard.press('Enter');
    await expect(disclosure).not.toHaveAttribute('open');
    expect(await receipt.textContent()).toBe(before);
    await page.reload();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-action="draft-option"]').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(receipt).toContainText('"kind":"committed"');
    await expect(page.locator('[data-action="draft-option"]')).toHaveCount(0);

    await page.goto(`${entry}?mode=replacement`);
    await page.locator('[data-action="draft-option"]').first().click();
    await expect(page.locator('[aria-label="替换抗体协议"]')).toBeVisible();
    await expect(page.locator('[data-action="draft-replace"]')).toHaveCount(3);
    await page.screenshot({ path: info.outputPath(`replacement-${width}.png`) });
    const replacementReceipt = await receipt.textContent();
    await page.locator('.upgrade-details summary').first().click();
    expect(await receipt.textContent()).toBe(replacementReceipt);
    await page.locator('[data-action="draft-replace"]').first().focus();
    await page.keyboard.press('Enter');
    await expect(receipt).toContainText('"kind":"committed"');

    await page.goto(`${entry}?mode=endless`);
    await expect(page.locator('[data-action="endless-upgrade"]')).toHaveCount(3);
    await page.screenshot({ path: info.outputPath(`endless-${width}.png`) });
    const endlessReceipt = await receipt.textContent();
    await page.locator('.upgrade-details summary').first().click();
    expect(await receipt.textContent()).toBe(endlessReceipt);
    const bounds = await page.evaluate(() => {
      const modal = document.querySelector('.choice-overlay')!.getBoundingClientRect();
      return { x: modal.left, right: modal.right, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
    await page.locator('[data-action="endless-upgrade"]').first().focus();
    await page.keyboard.press('Enter');
    await expect(receipt).toContainText('"result":true');
    await expect(page.locator('[data-action="endless-upgrade"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    writeFileSync(info.outputPath('verification-scope.json'), JSON.stringify({ scope: 'production UI fixture with real choice reducers; no full campaign timing or progression', width, checks: ['icons', 'disclosure does not commit', 'Tab and Enter', 'replacement', 'endless choice', 'horizontal bounds'], errors }, null, 2));
  });
}
