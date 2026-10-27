# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g2.spec.ts >> G2 RUN-06: legally acquire both pairs, trigger their real effects, research a fourth and replace
- Location: tests\e2e\g2.spec.ts:40:1

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
        - generic: ●HEART / 01
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅲ · 二次变异
        - heading "夺回这道生命防线" [level=2]
        - paragraph: 净化感染源 1/2；变异精英 1/2；保护组织 ≥50%。
        - generic: 感染源 1 / 2 进化精英 1 / 2
        - paragraph: E · 朝瞄准方向发动冲流
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 51 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 38%
          - paragraph: 按 3 瞄准十字节点抢修
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 13%
          - paragraph: 净化感染源 / 关闭隔离闸可降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: ◡ 舒缓 2.3s
          - generic: E 冲流就绪
          - generic: 阀门附近 E · 朝鼠标冲流击退 / 破壳 · 消耗组织完整度
      - generic:
        - generic "绕后射击；阀门 E 冲流使晶壳暴露 4 秒": ◇ 晶壳
        - generic "Q 扫描显形 5 秒；基础射击仍有效；3 修复组织同时清除附近潜伏体": ◌ 潜伏
      - generic: 净化感染源 1/2；变异精英 1/2；保护组织 ≥50%。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 范围裂解" [pressed] [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 范围裂解
            - text: 群体 · 94 范围
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 就绪
      - generic: G2 · 心脏防线 / 架空生物幻想
      - generic: SEED 130026 / 00:57
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 7
        - generic: 进化 Lv.2 · 经验 77 / 95
        - generic:
          - generic "靠近节律装置，在冲流相位用基础工具命中。距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。 需要接近装置并配合节律；无时机时不追加。 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。":
            - generic: ◇
            - generic: 共振裂解 Ⅰ
            - generic: 触发 2
          - generic "基础工具清除感染体或感染源。清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。":
            - generic: ⌁
            - generic: 连锁净化 Ⅰ
            - generic: 触发 4
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
        - paragraph: Q 召集免疫侦巡 · 研究台 E
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { resolve } from 'node:path';
  3   | import { pathToFileURL } from 'node:url';
  4   | import { aim, chooseDraftInput, completeHeart, readState, walk } from './campaignDriver';
  5   | 
  6   | const entry=pathToFileURL(resolve('dist/index.html')).href;
  7   | test('G2: seeded evolution, event-driven paused drafts, real build and clean retry',async({page,context},info)=>{
  8   |   test.setTimeout(150000);
  9   |   const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  10  |   await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  11  |   await page.goto(`${entry}?fixture=G2&seed=130026`);await page.locator('[data-action="start"]').click();
  12  |   let firstDraftSeen=false;
  13  |   await completeHeart(page,async()=>{await page.screenshot({path:info.outputPath('g2-warning.png')});},async()=>{await page.screenshot({path:info.outputPath('g2-pulse.png')});},async state=>{
  14  |     if(firstDraftSeen)return;firstDraftSeen=true;await page.screenshot({path:info.outputPath('g2-draft.png')});
  15  |     const tick=state.tick, draftId=state.growth!.draft!.id;
  16  |     await page.keyboard.press('Escape');await page.keyboard.press('Tab');
  17  |     await page.locator('[data-action="help"]').last().click();await expect(page.getByRole('dialog',{name:'操作指南'})).toBeVisible();
  18  |     await page.locator('[data-action="close-help"]').click();
  19  |     // Explicit synthetic focus-loss regression; this does not claim physical OS blur.
  20  |     await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  21  |     info.annotations.push({type:'focus-provenance',description:'Draft focus-loss event is synthetic. Physical OS blur remains unverified.'});
  22  |     await page.waitForTimeout(300);const frozen=await readState(page);expect(frozen.tick).toBe(tick);expect(frozen.growth!.draft!.id).toBe(draftId);expect(frozen.growth!.equipped).toEqual([]);
  23  |   });
  24  |   const result=await readState(page);
  25  |   expect(result.result?.success).toBe(true);
  26  |   expect(firstDraftSeen).toBe(true);
  27  |   expect(result.growth!.consumedDraftIds.length).toBeGreaterThanOrEqual(2);
  28  |   expect(result.growth!.equipped.length).toBeGreaterThanOrEqual(2);
  29  |   expect(result.growth!.equipped.length).toBeLessThanOrEqual(3);
  30  |   expect(result.battle!.evolutionDecisions).toHaveLength(2);
  31  |   for(const d of result.battle!.evolutionDecisions!){expect(d.kind).toBe('warn');if(d.kind==='warn')for(const c of d.candidates)expect(c.probability).toBeLessThanOrEqual(.55+1e-10);}
  32  |   await page.screenshot({path:info.outputPath('g2-success.png')});
  33  |   await info.attach('g2-result',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
  34  |   const runId=result.growth!.runId;
  35  |   await page.locator('[data-action="retry"]').click();const retry=await readState(page);
  36  |   expect(retry.seed).toBe(result.seed);expect(retry.growth!.runId).not.toBe(runId);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.xp).toBe(0);expect(retry.growth!.draft).toBeNull();
  37  |   expect(errors).toEqual([]);expect(remote).toEqual([]);
  38  | });
  39  | 
  40  | test('G2 RUN-06: legally acquire both pairs, trigger their real effects, research a fourth and replace',async({page,context},info)=>{
  41  |   test.setTimeout(180000);await context.setOffline(true);
  42  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  43  |   await page.goto(`${entry}?fixture=G2&seed=130026&trait=CARAPACE`);await page.locator('[data-action="start"]').click();
  44  |   await walk(page,{x:620,y:520},35);await page.keyboard.press('KeyQ');
  45  |   let lastScan=-9;const deadline=Date.now()+90000;
  46  |   const evolutionFrames:Record<string,Awaited<ReturnType<typeof readState>>>={};
  47  |   // Keep the second source alive until the first elite is cleared, so there are
  48  |   // genuine neighbors to chain through. This changes only target priorities.
  49  |   while(Date.now()<deadline){
  50  |     const s=await readState(page);if(s.phase==='paused'&&s.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
  51  |     if(s.phase!=='playing')throw new Error(`Opening failed: ${s.result?.reason}`);
  52  |     const frameName=s.battle!.traits.length?'after':s.battle!.warning?'warning':s.elapsed>=10?'before':null;
  53  |     if(frameName&&!evolutionFrames[frameName]){evolutionFrames[frameName]=s;await page.screenshot({path:info.outputPath(`g2-evolution-${frameName}.png`)});}
  54  |     if(s.battle!.stats.eliteClears>=1&&s.growth!.equipped.length>=2)break;
  55  |     if(s.elapsed-lastScan>3.2){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  56  |     const target=s.targets.find(t=>t.hp>0&&t.id==='source-a')??s.targets.find(t=>t.hp>0&&t.role==='elite')??s.targets.find(t=>t.hp>0&&t.role==='virus'&&Math.hypot(t.x-s.player.x,t.y-s.player.y)<150);
  57  |     const heal=s.tissue.hp<75;
  58  |     if(heal||target){await page.keyboard.press(heal?'Digit3':'Digit1');await aim(page,heal?s.tissue:target!);await page.mouse.down();}
  59  |     else await page.mouse.up();
  60  |     await page.waitForTimeout(120);
  61  |   }
  62  |   await page.mouse.up();let state=await readState(page);
  63  |   expect(state.battle!.stats.sourceClears).toBe(1);expect(state.battle!.stats.eliteClears).toBeGreaterThanOrEqual(1);
  64  |   expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['PULSE_BREAK','PURIFY_CHAIN']));
  65  |   await walk(page,state.battle!.pulse.origin,65);
  66  |   // A real source and its newborn bodies supply the chain. Wait for the visible
  67  |   // surge phase, then use the actual tools in that timing window.
  68  |   const chainDeadline=Date.now()+30000;
  69  |   while(Date.now()<chainDeadline){
  70  |     state=await readState(page);if(state.phase==='paused'&&state.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
  71  |     if(state.events.some(e=>e.type==='PROTOCOL_SYNERGY'&&e.data.pair==='PULSE_BREAK+PURIFY_CHAIN'))break;
  72  |     const source=state.targets.find(t=>t.hp>0&&t.id==='source-b');
  73  |     if(!source)throw new Error('The source cleared without the planned live chain');
  74  |     const newborn=state.targets.find(t=>t.hp>0&&t.role==='virus'&&t.sourceId==='source-b'&&Math.hypot(t.x-source.x,t.y-source.y)<125);
  75  |     if(state.battle!.pulse.phase!=='surge'||!newborn){await page.mouse.up();await page.waitForTimeout(80);continue;}
  76  |     await page.keyboard.press('Digit2');await aim(page,newborn);await page.mouse.down();await page.waitForTimeout(120);await page.mouse.up();
  77  |   }
> 78  |   state=await readState(page);expect(state.events.some(e=>e.type==='PROTOCOL_SYNERGY'&&e.data.pair==='PULSE_BREAK+PURIFY_CHAIN')).toBe(true);
      |                                                                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  79  |   await page.screenshot({path:info.outputPath('g2-pulse-chain-build.png')});
  80  |   await walk(page,{x:475,y:610},25);
  81  |   for(let i=0;i<2;i++){
  82  |     await page.keyboard.press('KeyE');await expect.poll(async()=>(await readState(page)).growth!.draft!==null).toBe(true);
  83  |     while((await readState(page)).growth!.draft)await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);
  84  |   }
  85  |   state=await readState(page);expect(state.growth!.equipped).toHaveLength(3);
  86  |   expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['EXPOSE_TRACE','IMMUNE_BEACON']));
  87  |   const traceDeadline=Date.now()+25000;
  88  |   while(Date.now()<traceDeadline){
  89  |     state=await readState(page);if(state.phase==='paused'&&state.growth?.draft){await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);continue;}
  90  |     const target=state.targets.find(t=>t.hp>0&&t.role!=='source');
  91  |     if(target&&state.scanReady<=state.elapsed){await aim(page,target);await page.keyboard.press('KeyQ');}
  92  |     if(state.events.some(e=>e.type==='PROTOCOL_SYNERGY'&&e.data.pair==='EXPOSE_TRACE+IMMUNE_BEACON'))break;
  93  |     await page.waitForTimeout(120);
  94  |   }
  95  |   state=await readState(page);expect(state.events.some(e=>e.type==='PROTOCOL_SYNERGY'&&e.data.pair==='EXPOSE_TRACE+IMMUNE_BEACON')).toBe(true);
  96  |   await page.screenshot({path:info.outputPath('g2-trace-beacon.png')});
  97  |   await info.attach('g2-both-synergy-events',{body:Buffer.from(JSON.stringify(state,null,2)),contentType:'application/json'});
  98  |   await info.attach('g2-evolution-frames',{body:Buffer.from(JSON.stringify(evolutionFrames,null,2)),contentType:'application/json'});
  99  |   await completeHeart(page);expect((await readState(page)).result?.success).toBe(true);expect(errors).toEqual([]);
  100 | });
  101 | 
```