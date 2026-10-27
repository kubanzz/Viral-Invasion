# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g4.spec.ts >> G4: complete browser seed 1, archive persistence and clean seed replay
- Location: tests\e2e\g4.spec.ts:13:42

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 768
Received:    794.140625
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互" [ref=e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●LUNG / 02
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 关
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: ✧
      - generic [ref=e8]: VIRAL INVASION / LIFE STABILIZED
      - heading "让生命，再次有力地呼吸。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 母巢已清除，所有激活器官完整度 ≥50%，感染负荷 <35%，主动复测通过。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 80%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 81%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 00:52
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "15"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 1 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳 → 裂殖追击成功 · 已阻止额外感染源。母巢：已净化 · 离场损伤 0.0看看本局战术记录，尝试另一条迁移路线或抗体联动。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
        - button "当前配装详情" [ref=e34] [cursor=pointer]
      - generic "本局两维事实说明" [ref=e36]:
        - article [ref=e37]:
          - heading "治疗质量" [level=4] [ref=e38]
          - paragraph [ref=e39]: 有效修复 75 点 · 3 次；受击 12 点
        - article [ref=e40]:
          - heading "系统掌控" [level=4] [ref=e41]
          - paragraph [ref=e42]: 连锁 5 次 / 7 跳；折射 0 次
      - generic [ref=e43]:
        - generic [ref=e44]: 下一病例 · 现场应答
        - button "准备下一病例 ↗" [ref=e45] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e46]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e47] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {resolve} from 'node:path';
  3  | import {pathToFileURL} from 'node:url';
  4  | import {writeFileSync} from 'node:fs';
  5  | import {fullRun} from './fullRunDriver';
  6  | import {readState,walk} from './campaignDriver';
  7  | import type {MigrationChoice} from '../../src/game/campaignTypes';
  8  | import {PROFILE_STORAGE_KEY} from '../../src/meta/profile';
  9  | 
  10 | const entry=pathToFileURL(resolve(process.env.VI_ENTRY??'dist/index.html')).href;
  11 | test.use({ video: 'off', trace: 'off' });
  12 | const seeds=[1,7,13,29,41,57,73,91,127,233];
  13 | for(const [index,seed]of seeds.entries())test(`G4: complete browser seed ${seed}, archive persistence and clean seed replay`,async({page,context},info)=>{
  14 |   test.skip(info.project.name!==(index<5?'chrome':'edge'),'Ten distinct seeds are split across Chrome and Edge.');test.setTimeout(180000);
  15 |   const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
  16 |   await context.setOffline(true);if(index===0)await page.setViewportSize({width:1920,height:1080});
  17 |   await page.goto(`${entry}?seed=${seed}`);
  18 |   if(index===0)await page.locator('.profile-menu [data-action="sound"]').click();
  19 |   await page.locator('[data-action="start"]').click();
  20 |   const choice=(['pursue','block','ignore'] as MigrationChoice[])[index%3];
  21 |   await fullRun(page,choice,async name=>{
  22 |     await page.screenshot({path:info.outputPath(`${name}.png`)});
  23 |     if(index===0&&name==='core'){
  24 |       await page.setViewportSize({width:1366,height:768});await page.screenshot({path:info.outputPath('core-1366.png')});
  25 |       await page.setViewportSize({width:1100,height:560});await page.screenshot({path:info.outputPath('core-compact.png')});
  26 |       await expect(page.locator('#mother-core-panel')).toBeVisible();await expect(page.locator('#hp-label')).toBeVisible();await expect(page.locator('.tool').first()).toBeVisible();
  27 |       await page.setViewportSize({width:1366,height:768});
  28 |     }
  29 |   },index%2===0);
  30 |   const final=await readState(page);expect(final.result).toMatchObject({success:true});expect(final.campaign!.stats.migrationChoice).toBe(choice);
  31 |   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);
  32 |   expect(saved.stats.runs).toBe(1);expect(saved.stats.wins).toBe(1);expect(saved.recentRuns[0].seed).toBe(seed);expect(saved.discoveredTraits).toHaveLength(2);
  33 |   if(index===0){
  34 |     const recap=page.locator('details.profile-recap');await expect(recap).not.toHaveAttribute('open');
> 35 |     const summary=recap.locator('summary'),box=await summary.boundingBox();expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
     |                                                                                                                                  ^ Error: expect(received).toBeLessThanOrEqual(expected)
  36 |     await page.screenshot({path:info.outputPath('result-collapsed.png')});await summary.click();await expect(recap).toHaveAttribute('open');
  37 |     await page.locator('.profile-result-link').click();await expect(page.locator('.profile-dialog')).toBeVisible();await page.locator('[data-action="close-profile"]').last().click();
  38 |   }
  39 |   await page.screenshot({path:info.outputPath('result.png')});writeFileSync(info.outputPath('win.json'),JSON.stringify({seed,choice,final,saved,errors,remote},null,2));
  40 |   await page.locator('[data-action="new"]').click();expect((await readState(page)).seed).not.toBe(seed);
  41 |   await page.reload();expect((await readState(page)).phase).toBe('menu');
  42 |   if(index===0)await expect(page.locator('.profile-menu [data-action="sound"]')).toContainText('关');
  43 |   await page.locator('[data-action="profile"]').click();await expect(page.locator('.profile-dialog')).toBeVisible();
  44 |   await page.screenshot({path:info.outputPath('archive.png')});
  45 |   await page.locator(`[data-action="replay-record"][data-seed="${seed}"]`).first().click();
  46 |   const replay=await readState(page);expect(replay.seed).toBe(seed);expect(replay.player.hp).toBe(100);expect(replay.growth!.xp).toBe(0);expect(replay.campaign!.stats.travels).toBe(0);expect(replay.battle!.traits).toEqual([]);expect(replay.elapsed).toBeLessThan(2);
  47 |   const again=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(again.stats.runs).toBe(1);
  48 |   expect(errors).toEqual([]);expect(remote).toEqual([]);
  49 | });
  50 | 
  51 | for(const [index,seed]of [17,31,59,83,97].entries())test(`G4: real defeat seed ${seed}, one saved loss and independent retry`,async({page,context},info)=>{
  52 |   test.skip(info.project.name!==(index<3?'chrome':'edge'),'Five failure seeds are split across Chrome and Edge.');test.setTimeout(100000);
  53 |   await context.setOffline(true);await page.goto(`${entry}?seed=${seed}`);await page.locator('[data-action="start"]').click();
  54 |   const opening=await readState(page);
  55 |   await walk(page,{x:opening.tissue.x-110,y:opening.tissue.y-70},25);
  56 |   const deadline=Date.now()+75000;
  57 |   while(Date.now()<deadline){const s=await readState(page);if(s.phase==='result')break;if(s.growth?.draft)await page.locator('[data-action="draft-discard"]').click();await page.waitForTimeout(250);}
  58 |   const failed=await readState(page);expect(failed.result).toMatchObject({success:false});expect(failed.player.hp).toBe(0);
  59 |   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(saved.stats.runs).toBe(1);expect(saved.stats.losses).toBe(1);
  60 |   writeFileSync(info.outputPath('defeat.json'),JSON.stringify({seed,failed,saved},null,2));await page.screenshot({path:info.outputPath('defeat.png')});
  61 |   await page.locator('[data-action="retry"]').click();const retry=await readState(page);expect(retry.seed).toBe(seed);expect(retry.player.hp).toBe(100);expect(retry.growth!.xp).toBe(0);expect(retry.campaign!.migration.status).toBe('locked');
  62 |   const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);expect(after.stats.runs).toBe(1);
  63 | });
  64 | 
  65 | test('G4: corrupt, old and unavailable storage fault fixtures still boot with a visible explanation',async({browser},info)=>{
  66 |   for(const kind of ['corrupt','old','unavailable']){
  67 |     const context=await browser.newContext({offline:true,viewport:{width:1100,height:700}});
  68 |     await context.addInitScript(({kind,key})=>{if(kind==='unavailable')Object.defineProperty(window,'localStorage',{get(){throw new Error('storage-disabled-fixture');}});else localStorage.setItem(key,kind==='corrupt'?'{broken':JSON.stringify({schemaVersion:0}));},{kind,key:PROFILE_STORAGE_KEY});
  69 |     const page=await context.newPage();await page.goto(entry);
  70 |     await expect(page.locator('.profile-storage')).toContainText(kind==='unavailable'?'无法保存':kind==='old'?'旧档案暂时无法读取':'档案损坏');
  71 |     await page.locator('[data-action="profile"]').click();await expect(page.locator('.profile-dialog')).toBeVisible();await page.screenshot({path:info.outputPath(`${kind}.png`)});
  72 |     await page.locator('[data-action="close-profile"]').last().click();await page.locator('[data-action="start"]').click();expect((await readState(page)).phase).toBe('playing');await context.close();
  73 |   }
  74 | });
  75 | 
```