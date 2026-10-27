# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g3.spec.ts >> G3: offline pursue migration, fused mother core and active retest through real input
- Location: tests\e2e\g3.spec.ts:14:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "pursue"
Received: "ignore"
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
    - text: · 当前
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: ✧
      - generic [ref=e8]: VIRAL INVASION / LIFE STABILIZED
      - heading "让生命，再次有力地呼吸。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 母巢已清除，所有激活器官完整度 ≥50%，感染负荷 <35%，主动复测通过。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 87%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 84%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:41
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "11"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 91 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：潜伏 → 晶壳放任迁移 · 肺部新增感染源。母巢：已净化 · 离场损伤 0.0本局放任迁移，肺部建立了额外感染源。下次可试试出口追击或隔离闸封锁。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
        - button "当前配装详情" [ref=e34] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e35]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e36] [cursor=pointer]
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
  8  | 
  9  | const entry=pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  10 | // Full snapshots already have explicit JSON evidence; tracing every clone can
  11 | // produce gigabytes of redundant diagnostic data during the 180-second run.
  12 | test.use({ video: 'off', trace: 'off' });
  13 | for(const choice of ['pursue','block','ignore'] as MigrationChoice[]){
  14 |   test(`G3: offline ${choice} migration, fused mother core and active retest through real input`,async({page,context},info)=>{
  15 |     test.setTimeout(180000);
  16 |     const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  17 |     await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  18 |     await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
  19 |     const captured=new Set<string>(),seenEvents=new Map<string,unknown>(),inputs:unknown[]=[],deadline=Date.now()+150000;
  20 |     let lastScan=-10,lastInteract=-10;
  21 |     while(Date.now()<deadline){
  22 |       const s=await readState(page);
  23 |       for(const event of s.events)seenEvents.set(JSON.stringify(event),event);
  24 |       if(s.phase==='result')break;
  25 |       if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
  26 |       if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
  27 |       expect(s.phase).toBe('playing');
  28 |       const capture=async(name:string)=>{if(!captured.has(name)){captured.add(name);await page.screenshot({path:info.outputPath(`${name}.png`)});}};
  29 |       if(s.campaign!.migration.status==='warning')await capture('migration-warning');
  30 |       if(s.battle!.organId==='lung')await capture('lung-first-arrival');
  31 |       if(s.campaign!.core.combat?.attack)await capture(`mother-${s.campaign!.core.combat.activeTrait}`);
  32 |       if(s.campaign!.core.combat?.membrane.remaining===0)await capture('mother-membranes-open');
  33 |       const input=g3Input(s,choice);
  34 |       inputs.push({tick:s.tick,player:{x:s.player.x,y:s.player.y},input});
  35 |       if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);
  36 |       await aim(page,input.aim);
  37 |       if(input.fire)await page.mouse.down();else await page.mouse.up();
  38 |       if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  39 |       // Discrete DOM events read the same nearby device used by keyboard users.
  40 |       if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
  41 |       const keys=[Math.abs(input.moveX)>.383?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY)>.383?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
  42 |       for(const key of keys)await page.keyboard.down(key);
  43 |       await page.waitForTimeout(85);
  44 |       for(const key of keys)await page.keyboard.up(key);
  45 |     }
  46 |     await page.mouse.up();
  47 |     const final=await readState(page);
  48 |     writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,errors,remote,inputs,events:[...seenEvents.values()],final},null,2));
  49 |     await page.screenshot({path:info.outputPath('result.png')});
  50 |     expect(final.result,JSON.stringify({phase:final.phase,organ:final.battle!.organId,core:final.campaign!.core.status,migration:final.campaign!.migration,player:final.player.hp})).toMatchObject({success:true});
> 51 |     expect(final.campaign!.stats.migrationChoice).toBe(choice);
     |                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  52 |     expect(final.campaign!.core.combat!.seenTraits).toHaveLength(2);
  53 |     expect(final.campaign!.core.combat!.membrane.remaining).toBe(0);
  54 |     expect(final.campaign!.progress.organConditions).toBe(true);
  55 |     expect(final.campaign!.progress.infectionCondition).toBe(true);
  56 |     if(choice!=='block')expect(final.campaign!.stats.airwayUses).toBeGreaterThanOrEqual(1);
  57 |     expect(errors).toEqual([]);expect(remote).toEqual([]);
  58 |   });
  59 | }
  60 | 
  61 | test('G3: 180 seconds under a live lung source, breath cycles, repair and legal retreat',async({page,context},info)=>{
  62 |   test.setTimeout(360000);
  63 |   await context.setOffline(true);await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
  64 |   let began:number|null=null,lastScan=-10,lastInteract=-10;
  65 |   const phases=new Set<string>(),spawned=new Set<string>(),deadline=Date.now()+330000;
  66 |   while(Date.now()<deadline){
  67 |     const s=await readState(page);
  68 |     if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
  69 |     if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
  70 |     expect(s.phase).toBe('playing');
  71 |     if(s.battle!.organId==='lung'&&began===null){began=s.elapsed;await page.screenshot({path:info.outputPath('lung-pressure-start.png')});}
  72 |     if(began!==null&&s.battle!.organId==='heart'){
  73 |       writeFileSync(info.outputPath('lung-pressure.json'),JSON.stringify({duration:s.elapsed-began,phases:[...phases],spawned:[...spawned],final:s},null,2));
  74 |       expect(s.elapsed-began).toBeGreaterThanOrEqual(180);expect(phases.size).toBe(2);expect(spawned.size).toBeGreaterThan(15);
  75 |       expect(s.campaign!.arenas.lung.targets.some(t=>t.role==='source'&&t.hp>0)).toBe(true);
  76 |       await page.screenshot({path:info.outputPath('retreated-heart.png')});return;
  77 |     }
  78 |     const input=began===null?g3Input(s,'pursue'):g3EnduranceInput(s);
  79 |     if(began!==null){
  80 |       phases.add(s.campaign!.arenas.lung.flow!.phase);
  81 |       for(const event of s.events)if(event.type==='ACTOR_SPAWNED'&&event.tick/60>=began)spawned.add(String(event.data.id));
  82 |       if(s.elapsed-began>=180){const exit=s.battle!.graph.nodes.find(n=>n.kind==='exit')!,next=waypoint(s,exit);input.moveX=next.x-s.player.x;input.moveY=next.y-s.player.y;input.interact=Math.hypot(exit.x-s.player.x,exit.y-s.player.y)<85;}
  83 |     }
  84 |     if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);await aim(page,input.aim);
  85 |     if(input.fire)await page.mouse.down();else await page.mouse.up();
  86 |     if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  87 |     if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
  88 |     const length=Math.hypot(input.moveX,input.moveY)||1;
  89 |     const keys=[Math.abs(input.moveX/length)>.383?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY/length)>.383?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
  90 |     for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(85);for(const key of keys)await page.keyboard.up(key);
  91 |   }
  92 |   throw new Error('Lung pressure driver did not retreat before its deadline');
  93 | });
  94 | 
```