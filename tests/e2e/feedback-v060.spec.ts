import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
import {readState,walk,aim} from './campaignDriver';
import {fullRun} from './fullRunDriver';
import type {MigrationChoice} from '../../src/game/campaignTypes';
import type {ProtocolId} from '../../src/game/growthTypes';
import {protocolRank} from '../../src/game/protocols';

const entry=pathToFileURL(resolve('dist/index.html')).href;
test.use({video:'off',trace:'off'});
test.beforeEach(async({context})=>{await context.setOffline(true);});

test('Feedback: spacious arena, follow camera, visible native cell patrol and paused freeze',async({page},info)=>{
 test.setTimeout(65000);if(info.project.name==='edge')await page.setViewportSize({width:1100,height:560});
 await page.goto(`${entry}?seed=7`);await page.locator('[data-action="start"]').click();
 const start=await readState(page);expect(start.world!.width).toBe(2400);expect(start.world!.height).toBe(1500);
 const before=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
 await expect(page.locator('#tactical-map')).toBeVisible();await page.screenshot({path:info.outputPath('entry-district.png')});
 const source=start.targets.find(t=>t.id==='source-a')!;
 await walk(page,{x:source.x-140,y:source.y+100},45);await aim(page,source);await page.keyboard.press('KeyQ');
 await expect.poll(async()=>(await readState(page)).growth?.cells?.length).toBe(1);
 const summoned=await readState(page),cell=summoned.growth!.cells![0];expect(summoned.growth!.beacon!.mode).toBe('patrol');expect(summoned.growth!.equipped).toHaveLength(0);
 await expect.poll(async()=>{const s=await readState(page);return s.events.some(e=>e.type==='IMMUNE_PATROL_HIT');},{timeout:7000}).toBe(true);
 const attacked=await readState(page);expect(attacked.events.some(e=>e.type==='IMMUNE_PATROL_HIT'&&Number(e.data.damage)>0)).toBe(true);
 await page.screenshot({path:info.outputPath('cell-patrol-bite.png')});
 const after=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
 expect(Math.hypot(after.origin.x-before.origin.x,after.origin.y-before.origin.y)).toBeGreaterThan(200);
 const moved=attacked.growth!.cells![0];expect(Math.hypot(moved.x-cell.x,moved.y-cell.y)).toBeGreaterThan(5);
 const roundTrip=await page.evaluate(()=>{const p=window.__viral.snapshot().player;const world={x:p.x+60,y:p.y-40};return{world,back:window.__viral.toWorld(window.__viral.toScreen(world))};});
 expect(roundTrip.back.x).toBeCloseTo(roundTrip.world.x,8);expect(roundTrip.back.y).toBeCloseTo(roundTrip.world.y,8);
 const nearest=attacked.targets.filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-attacked.player.x,a.y-attacked.player.y)-Math.hypot(b.x-attacked.player.x,b.y-attacked.player.y))[0];
 await page.keyboard.press('Digit1');await aim(page,nearest);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();
 await expect.poll(async()=>{const s=await readState(page);return s.events.some(e=>e.tick>=attacked.tick&&e.type==='TARGET_HIT'&&e.data.cause==='basic');}).toBe(true);
 await page.keyboard.press('Escape');const paused=await readState(page);await page.waitForTimeout(350);expect(await readState(page)).toEqual(paused);
 writeFileSync(info.outputPath('spatial-cell-evidence.json'),JSON.stringify({start,before,summoned,attacked,after,paused,build:JSON.parse(readFileSync('dist/build-meta.json','utf8'))},null,2));
});

for(const [index,choice]of (['block','pursue','ignore'] as MigrationChoice[]).entries())test(`Feedback: ${choice} route wins through a visible advanced build`,async({page},info)=>{
 test.skip(info.project.name!==(index===1?'edge':'chrome'),'Three migration routes are allocated across the two browsers.');test.setTimeout(220000);
 const primary:ProtocolId=index===1?'PURIFY_CHAIN':'IMMUNE_BEACON';
 const errors:string[]=[],remote:string[]=[],drafts:unknown[]=[],captured=new Set<string>();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
 await page.goto(`${entry}?seed=${[1,91,13][index]}`);await page.locator('[data-action="start"]').click();
 await fullRun(page,choice,async scene=>{await page.screenshot({path:info.outputPath(`${scene}.png`)});},true,async s=>{
  const draft=s.growth!.draft!,current=s.growth!.equipped.find(p=>p.id===primary);
  const option=draft.options.find(o=>o.protocolId===primary&&(!current||(o.rank??1)>protocolRank(current)))??draft.options.find(o=>o.kind==='equip')??draft.options[0];
  drafts.push({elapsed:s.elapsed,equipped:s.growth!.equipped,options:draft.options,selected:option});
  await expect(page.locator('.draft-change').first()).toBeVisible();await expect(page.locator('.draft-action').first()).toBeVisible();
  await page.screenshot({path:info.outputPath(`draft-${draft.serial}.png`)});
  await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  if((await readState(page)).growth?.draft?.status==='replacing')await page.locator('[data-action="draft-replace"]').last().click();
  await expect(page.locator('#evolution-feedback')).toContainText('进化完成');
 },async s=>{
  const event=s.events.find(e=>s.tick-e.tick<=25&&['PROTOCOL_BEACON_HIT','PROTOCOL_RICOCHET_HIT'].includes(e.type));
  const cells=s.growth!.cells??[];
  const visible=await (event&&!captured.has(event.type)?page.evaluate(points=>points.every(p=>{const v=window.__viral.toScreen(p);return v.x>0&&v.x<innerWidth&&v.y>80&&v.y<innerHeight-110;}),cells):Promise.resolve(false));
  if(event&&!captured.has(event.type)&&(event.type!=='PROTOCOL_BEACON_HIT'||cells.length===3&&visible)){
   captured.add(event.type);await page.screenshot({path:info.outputPath(`${event.type.toLowerCase()}-live.png`)});
   const after=await readState(page);writeFileSync(info.outputPath(`${event.type.toLowerCase()}-live.json`),JSON.stringify({before:s,after,scope:'Actual live screenshot bracket, not guaranteed same tick.'},null,2));
  }
 });
 const final=await readState(page);writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,final,errors,remote},null,2));
 expect(final.result?.success).toBe(true);expect(final.campaign!.migration.choice).toBe(choice);
 expect(final.growth!.equipped.some(p=>protocolRank(p)>=2)).toBe(true);expect(final.growth!.activations?.[primary]??0).toBeGreaterThan(0);
 expect(final.growth!.cells).toEqual([]);expect(errors).toEqual([]);expect(remote).toEqual([]);
 await page.screenshot({path:info.outputPath('result.png')});writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,final,errors,remote},null,2));
 await page.locator('[data-action="retry"]').click();const retry=await readState(page);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.cells).toEqual([]);expect(retry.player.hp).toBe(100);expect(retry.world!.width).toBe(2400);
});
