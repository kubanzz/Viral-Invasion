import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { completeHeart, readState, walk } from './campaignDriver';

const entry=pathToFileURL(resolve('dist/index.html')).href;
for(const firstTrait of ['CARAPACE','MIMIC'] as const) test(`G1 ${firstTrait}: offline heart battle, warning, real pulse, both elites, recovery and active retest`,async({page,context},info)=>{
  test.setTimeout(140000);
  const errors:string[]=[], remote:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.setOffline(true);
  await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  await page.goto(`${entry}?seed=130026&trait=${firstTrait}`);
  await expect(page.getByRole('button',{name:'进入心脏防线'})).toBeVisible();
  await page.screenshot({path:info.outputPath('g1-menu.png')});
  await page.locator('[data-action="start"]').click();
  await expect.poll(async()=>(await readState(page)).phase).toBe('playing');
  // Gate closure is real E input at the visible device, then reopening.
  const gate=(await readState(page)).battle!.graph.nodes.find(n=>n.kind==='gate')!;
  await walk(page,gate,65);await page.keyboard.press('KeyE');
  await expect.poll(async()=>(await readState(page)).battle!.graph.edges.filter(e=>e.to==='gate'||e.from==='gate').every(e=>!e.open)).toBe(true);
  await page.screenshot({path:info.outputPath('g1-gate-closed.png')});
  // Pausing must freeze the actual battle, including propagation and enemies.
  await page.keyboard.press('Escape');const paused=await readState(page);
  await page.waitForTimeout(500);
  expect((await readState(page)).tick).toBe(paused.tick);
  await page.locator('[data-action="continue"]').click();
  let pulseCaptured=false;
  const evidence=await completeHeart(page,async state=>{
    expect(state.battle!.warning!.applyAt-state.battle!.warning!.startedAt).toBeGreaterThanOrEqual(8);
    await expect(page.locator('#evolution-card')).toContainText('反制');
    await page.screenshot({path:info.outputPath('g1-warning.png')});
  },async state=>{if(!pulseCaptured){pulseCaptured=true;await page.screenshot({path:info.outputPath('g1-pulse-active.png')});expect(state.events.filter(event=>event.type==='PULSE_TRIGGERED').at(-1)?.data.pushed).toBeGreaterThan(0);}});
  const result=await readState(page);
  expect(result.result?.success).toBe(true);
  expect(result.battle!.stats.sourceClears).toBe(2);expect(result.battle!.stats.eliteClears).toBe(2);
  expect(result.battle!.stats.pulses).toBeGreaterThan(0);
  expect(result.events.some(event=>event.type==='PULSE_TRIGGERED'&&Number(event.data.exposed)>0)).toBe(true);
  expect(result.battle!.traits).toHaveLength(2);
  expect(evidence.warningSeen).toBe(true);
  await page.screenshot({path:info.outputPath('g1-success.png')});
  await info.attach('g1-battle-evidence',{body:Buffer.from(JSON.stringify({result,evidence},null,2)),contentType:'application/json'});
  await page.locator('[data-action="history"]').click();
  await expect(page.getByRole('dialog',{name:'战术记录'})).toContainText(firstTrait==='CARAPACE'?'晶壳':'潜伏');
  await page.locator('[data-action="close-history"]').click();
  await page.locator('[data-action="retry"]').click();
  const retry=await readState(page);expect(retry.seed).toBe(result.seed);expect(retry.battle!.traits).toEqual([]);expect(retry.battle!.stats.pulses).toBe(0);
  expect(remote).toEqual([]);expect(errors).toEqual([]);
});
