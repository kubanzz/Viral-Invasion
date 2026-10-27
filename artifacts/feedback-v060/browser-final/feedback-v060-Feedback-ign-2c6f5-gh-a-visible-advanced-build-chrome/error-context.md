# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v060.spec.ts >> Feedback: ignore route wins through a visible advanced build
- Location: tests\e2e\feedback-v060.spec.ts:35:89

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前 △
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: △
      - generic [ref=e8]: VIRAL INVASION / CASE ENDED
      - heading "这次防线，没能守住。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 身体崩溃：激活器官长期濒危，全身稳定耗尽。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 69%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 0%
          - generic [ref=e19]: 需要抢修
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 02:32
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "6"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 13 · 感染 60% · 全身稳定 0%
      - paragraph [ref=e28]: 本局进化：潜伏 → 晶壳放任迁移 · 肺部新增感染源。母巢：尚未清除 · 离场损伤 0.0本局放任迁移，肺部建立了额外感染源。下次可试试出口追击或隔离闸封锁。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e34]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e35] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {resolve} from 'node:path';
  3  | import {pathToFileURL} from 'node:url';
  4  | import {writeFileSync,readFileSync} from 'node:fs';
  5  | import {readState,walk,aim} from './campaignDriver';
  6  | import {fullRun} from './fullRunDriver';
  7  | import type {MigrationChoice} from '../../src/game/campaignTypes';
  8  | import type {ProtocolId} from '../../src/game/growthTypes';
  9  | import {protocolRank} from '../../src/game/protocols';
  10 | 
  11 | const entry=pathToFileURL(resolve('dist/index.html')).href;
  12 | test.use({video:'off',trace:'off'});
  13 | test.beforeEach(async({context})=>{await context.setOffline(true);});
  14 | 
  15 | test('Feedback: spacious arena, follow camera, visible native cell patrol and paused freeze',async({page},info)=>{
  16 |  test.setTimeout(65000);if(info.project.name==='edge')await page.setViewportSize({width:1100,height:560});
  17 |  await page.goto(`${entry}?seed=7`);await page.locator('[data-action="start"]').click();
  18 |  const start=await readState(page);expect(start.world!.width).toBe(2400);expect(start.world!.height).toBe(1500);
  19 |  const before=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
  20 |  await expect(page.locator('#tactical-map')).toBeVisible();await page.screenshot({path:info.outputPath('entry-district.png')});
  21 |  const source=start.targets.find(t=>t.id==='source-a')!;
  22 |  await walk(page,{x:source.x-140,y:source.y+100},45);await aim(page,source);await page.keyboard.press('KeyQ');
  23 |  await expect.poll(async()=>(await readState(page)).growth?.cells?.length).toBe(1);
  24 |  const summoned=await readState(page),cell=summoned.growth!.cells![0];expect(summoned.growth!.beacon!.mode).toBe('patrol');expect(summoned.growth!.equipped).toHaveLength(0);
  25 |  await expect.poll(async()=>{const s=await readState(page);return s.events.some(e=>e.type==='IMMUNE_PATROL_HIT');},{timeout:7000}).toBe(true);
  26 |  const attacked=await readState(page);expect(attacked.events.some(e=>e.type==='IMMUNE_PATROL_HIT'&&Number(e.data.damage)>0)).toBe(true);
  27 |  await page.screenshot({path:info.outputPath('cell-patrol-bite.png')});
  28 |  const after=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
  29 |  expect(Math.hypot(after.origin.x-before.origin.x,after.origin.y-before.origin.y)).toBeGreaterThan(200);
  30 |  const moved=attacked.growth!.cells![0];expect(Math.hypot(moved.x-cell.x,moved.y-cell.y)).toBeGreaterThan(5);
  31 |  const roundTrip=await page.evaluate(()=>{const p=window.__viral.snapshot().player;const world={x:p.x+60,y:p.y-40};return{world,back:window.__viral.toWorld(window.__viral.toScreen(world))};});
  32 |  expect(roundTrip.back.x).toBeCloseTo(roundTrip.world.x,8);expect(roundTrip.back.y).toBeCloseTo(roundTrip.world.y,8);
  33 |  const nearest=attacked.targets.filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-attacked.player.x,a.y-attacked.player.y)-Math.hypot(b.x-attacked.player.x,b.y-attacked.player.y))[0];
  34 |  await page.keyboard.press('Digit1');await aim(page,nearest);await page.mouse.click((await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().battle!.lastAim))).x,(await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().battle!.lastAim))).y);
  35 |  await expect.poll(async()=>{const s=await readState(page);return s.events.some(e=>e.tick>=attacked.tick&&e.type==='TARGET_HIT'&&e.data.cause==='basic');}).toBe(true);
  36 |  await page.keyboard.press('Escape');const paused=await readState(page);await page.waitForTimeout(350);expect(await readState(page)).toEqual(paused);
  37 |  writeFileSync(info.outputPath('spatial-cell-evidence.json'),JSON.stringify({start,before,summoned,attacked,after,paused,build:JSON.parse(readFileSync('dist/build-meta.json','utf8'))},null,2));
  38 | });
  39 | 
  40 | for(const [index,choice]of (['block','pursue','ignore'] as MigrationChoice[]).entries())test(`Feedback: ${choice} route wins through a visible advanced build`,async({page},info)=>{
  41 |  test.skip(info.project.name!==(index===1?'edge':'chrome'),'Three migration routes are allocated across the two browsers.');test.setTimeout(220000);
  42 |  const primary:ProtocolId=index===1?'PURIFY_CHAIN':'IMMUNE_BEACON';
  43 |  const errors:string[]=[],remote:string[]=[],drafts:unknown[]=[],captured=new Set<string>();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
  44 |  await page.goto(`${entry}?seed=${[1,91,13][index]}`);await page.locator('[data-action="start"]').click();
  45 |  await fullRun(page,choice,async scene=>{await page.screenshot({path:info.outputPath(`${scene}.png`)});},true,async s=>{
  46 |   const draft=s.growth!.draft!,current=s.growth!.equipped.find(p=>p.id===primary);
  47 |   const option=draft.options.find(o=>o.protocolId===primary&&(!current||(o.rank??1)>protocolRank(current)))??draft.options.find(o=>o.kind==='equip')??draft.options[0];
  48 |   drafts.push({elapsed:s.elapsed,equipped:s.growth!.equipped,options:draft.options,selected:option});
  49 |   await expect(page.locator('.draft-change').first()).toBeVisible();await expect(page.locator('.draft-action').first()).toBeVisible();
  50 |   await page.screenshot({path:info.outputPath(`draft-${draft.serial}.png`)});
  51 |   await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  52 |   if((await readState(page)).growth?.draft?.status==='replacing')await page.locator('[data-action="draft-replace"]').last().click();
  53 |   await expect(page.locator('#evolution-feedback')).toContainText('进化完成');
  54 |  },async s=>{
  55 |   const event=s.events.find(e=>s.tick-e.tick<=25&&['PROTOCOL_BEACON_HIT','PROTOCOL_RICOCHET_HIT'].includes(e.type));
  56 |   const cells=s.growth!.cells??[];
> 57 |   const visible=await (event&&!captured.has(event.type)?page.evaluate(points=>points.every(p=>{const v=window.__viral.toScreen(p);return v.x>0&&v.x<innerWidth&&v.y>80&&v.y<innerHeight-110;}),cells):Promise.resolve(false));
     |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  58 |   if(event&&!captured.has(event.type)&&(event.type!=='PROTOCOL_BEACON_HIT'||cells.length===3&&visible)){
  59 |    captured.add(event.type);await page.screenshot({path:info.outputPath(`${event.type.toLowerCase()}-live.png`)});
  60 |    const after=await readState(page);writeFileSync(info.outputPath(`${event.type.toLowerCase()}-live.json`),JSON.stringify({before:s,after,scope:'Actual live screenshot bracket, not guaranteed same tick.'},null,2));
  61 |   }
  62 |  });
  63 |  const final=await readState(page);writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,final,errors,remote},null,2));
  64 |  expect(final.result?.success).toBe(true);expect(final.campaign!.migration.choice).toBe(choice);
  65 |  expect(final.growth!.equipped.some(p=>protocolRank(p)>=2)).toBe(true);expect(final.growth!.activations?.[primary]??0).toBeGreaterThan(0);
  66 |  expect(final.growth!.cells).toEqual([]);expect(errors).toEqual([]);expect(remote).toEqual([]);
  67 |  await page.screenshot({path:info.outputPath('result.png')});writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,final,errors,remote},null,2));
  68 |  await page.locator('[data-action="retry"]').click();const retry=await readState(page);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.cells).toEqual([]);expect(retry.player.hp).toBe(100);expect(retry.world!.width).toBe(2400);
  69 | });
  70 | 
```