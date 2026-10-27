# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v060.spec.ts >> Feedback: spacious arena, follow camera, visible native cell patrol and paused freeze
- Location: tests\e2e\feedback-v060.spec.ts:15:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 5
Received:   0
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
        - generic: ●HEART / 01
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅰ · 建立防线
        - heading "守住这道生命防线" [level=2]
        - paragraph: Q 诊断感染，1 精确净化首个感染源；组织受损时用 3 修复。首次清源后进入真实变异反制。
        - status:
          - generic:
            - strong: 先诊断，再根治
            - button "跳过本次提示" [ref=e6] [cursor=pointer]
          - generic: 先 Q 诊断感染源，用 1 / 2 净化它。
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 93 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 62%
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 28%
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: ◡ 舒缓 2.5s
          - generic: E 冲流就绪
      - complementary "器官状态图":
        - generic:
          - text: 器官导航
          - generic: 白点为你 · 框为视野
        - generic "当前器官小地图：感染源、研究、抢修及出口"
        - generic:
          - generic:
            - generic: ♥
            - generic:
              - generic:
                - generic: 心脏 · 当前
                - strong: 62%
          - generic:
            - generic: ◖◗
            - generic:
              - generic:
                - generic: 肺部
                - strong: 76%
      - generic: 诊断 2 个感染体。◇ 晶壳绕后/冲流；⋈ 裂殖用 2；◌ 潜伏用 Q/组织修复。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e7] [cursor=pointer]:
            - generic [ref=e8]: "1"
            - strong [ref=e9]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 范围裂解" [ref=e11] [cursor=pointer]:
            - generic [ref=e12]: "2"
            - strong [ref=e13]: 范围裂解
            - text: 群体 · 击退打断
          - button "3 组织修复" [ref=e15] [cursor=pointer]:
            - generic [ref=e16]: "3"
            - strong [ref=e17]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 2.3s
      - generic: G4 · 器官联防 / 架空生物幻想
      - generic: SEED 7 / 00:03
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 1
        - generic: 进化 Lv.0 · 经验 6 / 20
        - generic:
          - generic:
            - generic: "1"
            - text: 空协议槽
          - generic:
            - generic: "2"
            - text: 空协议槽
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e19] [cursor=pointer]
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
> 30 |  const moved=attacked.growth!.cells![0];expect(Math.hypot(moved.x-cell.x,moved.y-cell.y)).toBeGreaterThan(5);
     |                                                                                           ^ Error: expect(received).toBeGreaterThan(expected)
  31 |  const roundTrip=await page.evaluate(()=>{const p=window.__viral.snapshot().player;const world={x:p.x+60,y:p.y-40};return{world,back:window.__viral.toWorld(window.__viral.toScreen(world))};});
  32 |  expect(roundTrip.back.x).toBeCloseTo(roundTrip.world.x,8);expect(roundTrip.back.y).toBeCloseTo(roundTrip.world.y,8);
  33 |  const nearest=attacked.targets.filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-attacked.player.x,a.y-attacked.player.y)-Math.hypot(b.x-attacked.player.x,b.y-attacked.player.y))[0];
  34 |  await page.keyboard.press('Digit1');await aim(page,nearest);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();
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
  57 |   const visible=await (event&&!captured.has(event.type)?page.evaluate(points=>points.every(p=>{const v=window.__viral.toScreen(p);return v.x>0&&v.x<innerWidth&&v.y>80&&v.y<innerHeight-110;}),cells):Promise.resolve(false));
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