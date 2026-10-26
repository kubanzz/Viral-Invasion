import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {fullRun} from './fullRunDriver';
import {readState,walk} from './campaignDriver';
import type {MigrationChoice} from '../../src/game/campaignTypes';
import {PROFILE_STORAGE_KEY} from '../../src/meta/profile';

const entry=pathToFileURL(resolve(process.env.VI_ENTRY??'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });
const seeds=[1,7,13,29,41,57,73,91,127,233];
for(const [index,seed]of seeds.entries())test(`G4: complete browser seed ${seed}, archive persistence and clean seed replay`,async({page,context},info)=>{
  test.skip(info.project.name!==(index<5?'chrome':'edge'),'Ten distinct seeds are split across Chrome and Edge.');test.setTimeout(180000);
  const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
  await context.setOffline(true);if(index===0)await page.setViewportSize({width:1920,height:1080});
  await page.goto(`${entry}?seed=${seed}`);
  if(index===0)await page.locator('.profile-menu [data-action="sound"]').click();
  await page.locator('[data-action="start"]').click();
  const choice=(['pursue','block','ignore'] as MigrationChoice[])[index%3];
  await fullRun(page,choice,async name=>{
    await page.screenshot({path:info.outputPath(`${name}.png`)});
    if(index===0&&name==='core'){
      await page.setViewportSize({width:1366,height:768});await page.screenshot({path:info.outputPath('core-1366.png')});
      await page.setViewportSize({width:1100,height:560});await page.screenshot({path:info.outputPath('core-compact.png')});
      await expect(page.locator('#mother-core-panel')).toBeVisible();await expect(page.locator('#hp-label')).toBeVisible();await expect(page.locator('.tool').first()).toBeVisible();
      await page.setViewportSize({width:1366,height:768});
    }
  },index%2===0);
  const final=await readState(page);expect(final.result).toMatchObject({success:true});expect(final.campaign!.stats.migrationChoice).toBe(choice);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);
  expect(saved.stats.runs).toBe(1);expect(saved.stats.wins).toBe(1);expect(saved.recentRuns[0].seed).toBe(seed);expect(saved.discoveredTraits).toHaveLength(2);
  await page.screenshot({path:info.outputPath('result.png')});writeFileSync(info.outputPath('win.json'),JSON.stringify({seed,choice,final,saved,errors,remote},null,2));
  await page.locator('[data-action="new"]').click();expect((await readState(page)).seed).not.toBe(seed);
  await page.reload();expect((await readState(page)).phase).toBe('menu');
  if(index===0)await expect(page.locator('.profile-menu [data-action="sound"]')).toContainText('关');
  await page.locator('[data-action="profile"]').click();await expect(page.locator('.profile-dialog')).toBeVisible();
  await page.screenshot({path:info.outputPath('archive.png')});
  await page.locator(`[data-action="replay-record"][data-seed="${seed}"]`).first().click();
  const replay=await readState(page);expect(replay.seed).toBe(seed);expect(replay.player.hp).toBe(100);expect(replay.growth!.xp).toBe(0);expect(replay.campaign!.stats.travels).toBe(0);expect(replay.battle!.traits).toEqual([]);expect(replay.elapsed).toBeLessThan(2);
  const again=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(again.stats.runs).toBe(1);
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

for(const [index,seed]of [17,31,59,83,97].entries())test(`G4: real defeat seed ${seed}, one saved loss and independent retry`,async({page,context},info)=>{
  test.skip(info.project.name!==(index<3?'chrome':'edge'),'Five failure seeds are split across Chrome and Edge.');test.setTimeout(100000);
  await context.setOffline(true);await page.goto(`${entry}?seed=${seed}`);await page.locator('[data-action="start"]').click();
  await walk(page,{x:610,y:420},25);
  const deadline=Date.now()+75000;
  while(Date.now()<deadline){const s=await readState(page);if(s.phase==='result')break;if(s.growth?.draft)await page.locator('[data-action="draft-discard"]').click();await page.waitForTimeout(250);}
  const failed=await readState(page);expect(failed.result).toMatchObject({success:false});expect(failed.player.hp).toBe(0);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(saved.stats.runs).toBe(1);expect(saved.stats.losses).toBe(1);
  writeFileSync(info.outputPath('defeat.json'),JSON.stringify({seed,failed,saved},null,2));await page.screenshot({path:info.outputPath('defeat.png')});
  await page.locator('[data-action="retry"]').click();const retry=await readState(page);expect(retry.seed).toBe(seed);expect(retry.player.hp).toBe(100);expect(retry.growth!.xp).toBe(0);expect(retry.campaign!.migration.status).toBe('locked');
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(after.stats.runs).toBe(1);
});

test('G4: corrupt, old and unavailable storage fault fixtures still boot with a visible explanation',async({browser},info)=>{
  for(const kind of ['corrupt','old','unavailable']){
    const context=await browser.newContext({offline:true,viewport:{width:1100,height:700}});
    await context.addInitScript(({kind,key})=>{if(kind==='unavailable')Object.defineProperty(window,'localStorage',{get(){throw new Error('storage-disabled-fixture');}});else localStorage.setItem(key,kind==='corrupt'?'{broken':JSON.stringify({schemaVersion:0}));},{kind,key:PROFILE_STORAGE_KEY});
    const page=await context.newPage();await page.goto(entry);
    await expect(page.locator('.profile-storage')).toContainText(kind==='unavailable'?'无法保存':kind==='old'?'旧档案暂时无法读取':'档案损坏');
    await page.locator('[data-action="profile"]').click();await expect(page.locator('.profile-dialog')).toBeVisible();await page.screenshot({path:info.outputPath(`${kind}.png`)});
    await page.locator('[data-action="close-profile"]').last().click();await page.locator('[data-action="start"]').click();expect((await readState(page)).phase).toBe('playing');await context.close();
  }
});
