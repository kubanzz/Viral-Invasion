# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g3.spec.ts >> G3: offline pursue migration, fused mother core and active retest through real input
- Location: tests\e2e\g3.spec.ts:15:3

# Error details

```
Error: {"phase":"result","organ":"lung","core":"locked","migration":{"id":"migration:91:1","status":"resolved","from":"heart","to":"lung","warnedAt":33.85,"deadline":45.85,"choice":"pursue","resolvedAt":42.15,"blockStartedAt":null,"carrierIds":["migration-carrier-0","migration-carrier-1","migration-carrier-2"],"clearedCarrierIds":["migration-carrier-0","migration-carrier-1","migration-carrier-2"],"interceptUntil":54.15,"interceptSucceeded":true,"interceptResolvedAt":42.71666666666667},"player":0}

expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "success": true,
+   "success": false,
  }
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
      - navigation:
        - generic: ●LUNG / 02
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: △
      - generic [ref=e8]: VIRAL INVASION / CASE ENDED
      - heading "这次防线，没能守住。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 救援体耐久耗尽：避开带齿轮廓的攻击预警，利用冲刺脱离。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 100%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 100%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:00
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "8"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 91 · 感染 1% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳 → 裂殖追击成功 · 已阻止额外感染源。母巢：尚未清除 · 离场损伤 0.0看看本局战术记录，尝试另一条迁移路线或抗体联动。
      - generic [ref=e29]:
        - generic [ref=e30]:
          - button "连续挑战 · 一波接一波 ↗" [ref=e31] [cursor=pointer]
          - paragraph [ref=e32]: 顶住压力，进化后收割，再迎接下一轮挑战。每波三选一，每5波精英与协议联动重配；赢下精英后，所选成长最多连升两阶。从第 1 波起步，打造这一局的抗体构筑。
          - status [ref=e33]: 连续挑战战绩将独立保存在此浏览器。
        - button "同种子重试" [ref=e34] [cursor=pointer]
        - button "新病例" [ref=e35] [cursor=pointer]
        - button "战术记录" [ref=e36] [cursor=pointer]
        - button "返回主菜单" [ref=e37] [cursor=pointer]
        - button "当前配装详情" [ref=e38] [cursor=pointer]
      - generic "本局两维事实说明" [ref=e40]:
        - article [ref=e41]:
          - heading "治疗质量" [level=4] [ref=e42]
          - paragraph [ref=e43]: 有效修复 85.8 点 · 5 次；受击 100 点
        - article [ref=e44]:
          - heading "系统掌控" [level=4] [ref=e45]
          - paragraph [ref=e46]: 连锁 0 次 / 0 跳；折射 0 次
      - generic [ref=e47]:
        - generic [ref=e48]: 下一病例 · 现场应答
        - button "准备下一病例 ↗" [ref=e49] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e50]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e51] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { resolve } from 'node:path';
  3  | import { pathToFileURL } from 'node:url';
  4  | import { writeFileSync } from 'node:fs';
  5  | import { aim, readState } from './campaignDriver';
  6  | import { g3Input, g3EnduranceInput, waypoint } from '../helpers/g3Driver';
  7  | import type { MigrationChoice } from '../../src/game/campaignTypes';
  8  | import { HeldMovement } from './heldMovement';
  9  | 
  10 | const entry=pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  11 | // Full snapshots already have explicit JSON evidence; tracing every clone can
  12 | // produce gigabytes of redundant diagnostic data during the 180-second run.
  13 | test.use({ video: 'off', trace: 'off' });
  14 | for(const choice of ['pursue','block','ignore'] as MigrationChoice[]){
  15 |   test(`G3: offline ${choice} migration, fused mother core and active retest through real input`,async({page,context},info)=>{
  16 |     test.setTimeout(180000);
  17 |     const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  18 |     await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  19 |     await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
  20 |     const captured=new Set<string>(),seenEvents=new Map<string,unknown>(),inputs:unknown[]=[],deadline=Date.now()+150000;
  21 |     let lastScan=-10,lastInteract=-10;
  22 |     const movement=new HeldMovement(page);
  23 |     try {
  24 |     while(Date.now()<deadline){
  25 |       const s=await readState(page);
  26 |       await movement.syncOrgan(s.battle!.organId);
  27 |       for(const event of s.events)seenEvents.set(JSON.stringify(event),event);
  28 |       if(s.phase==='result')break;
  29 |       if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await movement.release();await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
  30 |       if(s.growth?.draft){await movement.release();await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
  31 |       expect(s.phase).toBe('playing');
  32 |       const capture=async(name:string)=>{if(!captured.has(name)){captured.add(name);await page.screenshot({path:info.outputPath(`${name}.png`)});}};
  33 |       if(s.campaign!.migration.status==='warning')await capture('migration-warning');
  34 |       if(s.battle!.organId==='lung')await capture('lung-first-arrival');
  35 |       if(s.campaign!.core.combat?.attack)await capture(`mother-${s.campaign!.core.combat.activeTrait}`);
  36 |       if(s.campaign!.core.combat?.membrane.remaining===0)await capture('mother-membranes-open');
  37 |       const input=g3Input(s,choice);
  38 |       inputs.push({tick:s.tick,player:{x:s.player.x,y:s.player.y},input});
  39 |       if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);
  40 |       await aim(page,input.aim);
  41 |       if(input.fire)await page.mouse.down();else await page.mouse.up();
  42 |       if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  43 |       // Discrete DOM events read the same nearby device used by keyboard users.
  44 |       if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
  45 |       await movement.move(input.moveX,input.moveY);
  46 |       await page.waitForTimeout(85);
  47 |     }
  48 |     } finally { await movement.release();await page.mouse.up(); }
  49 |     const final=await readState(page);
  50 |     writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,errors,remote,inputs,events:[...seenEvents.values()],final},null,2));
  51 |     await page.screenshot({path:info.outputPath('result.png')});
> 52 |     expect(final.result,JSON.stringify({phase:final.phase,organ:final.battle!.organId,core:final.campaign!.core.status,migration:final.campaign!.migration,player:final.player.hp})).toMatchObject({success:true});
     |                                                                                                                                                                                      ^ Error: {"phase":"result","organ":"lung","core":"locked","migration":{"id":"migration:91:1","status":"resolved","from":"heart","to":"lung","warnedAt":33.85,"deadline":45.85,"choice":"pursue","resolvedAt":42.15,"blockStartedAt":null,"carrierIds":["migration-carrier-0","migration-carrier-1","migration-carrier-2"],"clearedCarrierIds":["migration-carrier-0","migration-carrier-1","migration-carrier-2"],"interceptUntil":54.15,"interceptSucceeded":true,"interceptResolvedAt":42.71666666666667},"player":0}
  53 |     expect(final.campaign!.stats.migrationChoice).toBe(choice);
  54 |     expect(final.campaign!.core.combat!.seenTraits).toHaveLength(2);
  55 |     expect(final.campaign!.core.combat!.membrane.remaining).toBe(0);
  56 |     expect(final.campaign!.progress.organConditions).toBe(true);
  57 |     expect(final.campaign!.progress.infectionCondition).toBe(true);
  58 |     if(choice!=='block')expect(final.campaign!.stats.airwayUses).toBeGreaterThanOrEqual(1);
  59 |     expect(errors).toEqual([]);expect(remote).toEqual([]);
  60 |   });
  61 | }
  62 | 
  63 | test('G3: 180 seconds under a live lung source, breath cycles, repair and legal retreat',async({page,context},info)=>{
  64 |   test.setTimeout(360000);
  65 |   await context.setOffline(true);await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
  66 |   let began:number|null=null,lastScan=-10,lastInteract=-10;
  67 |   const phases=new Set<string>(),spawned=new Set<string>(),deadline=Date.now()+330000;
  68 |   const movement=new HeldMovement(page);
  69 |   try {
  70 |   while(Date.now()<deadline){
  71 |     const s=await readState(page);
  72 |     await movement.syncOrgan(s.battle!.organId);
  73 |     if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await movement.release();await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
  74 |     if(s.growth?.draft){await movement.release();await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
  75 |     expect(s.phase).toBe('playing');
  76 |     if(s.battle!.organId==='lung'&&began===null){began=s.elapsed;await page.screenshot({path:info.outputPath('lung-pressure-start.png')});}
  77 |     if(began!==null&&s.battle!.organId==='heart'){
  78 |       writeFileSync(info.outputPath('lung-pressure.json'),JSON.stringify({duration:s.elapsed-began,phases:[...phases],spawned:[...spawned],final:s},null,2));
  79 |       expect(s.elapsed-began).toBeGreaterThanOrEqual(180);expect(phases.size).toBe(2);expect(spawned.size).toBeGreaterThan(15);
  80 |       expect(s.campaign!.arenas.lung.targets.some(t=>t.role==='source'&&t.hp>0)).toBe(true);
  81 |       await page.screenshot({path:info.outputPath('retreated-heart.png')});return;
  82 |     }
  83 |     const input=began===null?g3Input(s,'pursue'):g3EnduranceInput(s);
  84 |     if(began!==null){
  85 |       phases.add(s.campaign!.arenas.lung.flow!.phase);
  86 |       for(const event of s.events)if(event.type==='ACTOR_SPAWNED'&&event.tick/60>=began)spawned.add(String(event.data.id));
  87 |       if(s.elapsed-began>=180){const exit=s.battle!.graph.nodes.find(n=>n.kind==='exit')!,next=waypoint(s,exit);input.moveX=next.x-s.player.x;input.moveY=next.y-s.player.y;input.interact=Math.hypot(exit.x-s.player.x,exit.y-s.player.y)<85;}
  88 |     }
  89 |     if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);await aim(page,input.aim);
  90 |     if(input.fire)await page.mouse.down();else await page.mouse.up();
  91 |     if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  92 |     if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
  93 |     await movement.move(input.moveX,input.moveY);await page.waitForTimeout(85);
  94 |   }
  95 |   } finally { await movement.release();await page.mouse.up(); }
  96 |   throw new Error('Lung pressure driver did not retreat before its deadline');
  97 | });
  98 | 
```