# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g2.spec.ts >> G2 RUN-06: legally acquire both pairs, trigger their real effects, research a fourth and replace
- Location: tests\e2e\g2.spec.ts:42:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

Expected: ArrayContaining ["EXPOSE_TRACE", "IMMUNE_BEACON"]
Received: ["PULSE_BREAK", "PURIFY_CHAIN", "EXPOSE_TRACE"]
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
        - paragraph: 变异精英 1/2；预警时先读弱点，靠近阀门 E 冲流。
        - generic: 感染源 2 / 2 进化精英 1 / 2
        - paragraph: E · 查看抗体研究
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 65 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 22%
          - paragraph: 按 3 瞄准十字节点抢修
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 0%
          - paragraph: ⚠ 器官濒危：抢修可阻止全身稳定下降
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: ◡ 舒缓 0.2s
          - generic: E 冲流就绪
          - generic: 阀门附近 E · 朝鼠标冲流击退 / 破壳 · 消耗组织完整度
      - generic:
        - generic "绕后射击；阀门 E 冲流使晶壳暴露 4 秒": ◇ 晶壳
        - generic "Q 扫描显形 5 秒；基础射击仍有效；3 修复组织同时清除附近潜伏体": ◌ 潜伏
      - generic: 心脏低于 30%！8 秒后全身稳定开始下降，请及时抢修。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 范围裂解" [ref=e10] [cursor=pointer]:
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
      - generic: SEED 130026 / 00:53
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 3
        - generic: 进化 Lv.3 · 经验 97 / 150
        - generic:
          - generic "靠近节律装置，在冲流相位用基础工具命中。距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。 需要接近装置并配合节律；无时机时不追加。 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。":
            - generic: ◇
            - generic: 共振裂解 Ⅰ
            - generic: 触发 1
          - generic "基础工具清除感染体或感染源。清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。":
            - generic: ⌁
            - generic: 连锁净化 Ⅰ
            - generic: 触发 1
          - generic "Q 扫描当前范围内活跃感染体。标记与显形 9 秒，前 3 秒移动速度 ×0.7；免疫小队优先追踪标记目标。 占用一个协议槽位，没有直接伤害。 现在按 Q，让敌群显形并减速；搭配免疫细胞优先围猎标记体。":
            - generic: ◌
            - generic: 异常显影 Ⅰ
            - generic: 待触发
        - button "当前配装详情" [ref=e18] [cursor=pointer]
        - paragraph: Q 召集免疫侦巡 · 研究台 E
      - status:
        - strong: 进化完成 · 共振裂解 Ⅰ · 均衡
        - generic: 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。
```

# Test source

```ts
  9   | test('G2: seeded evolution, event-driven paused drafts, real build and clean retry',async({page,context},info)=>{
  10  |   test.setTimeout(150000);
  11  |   const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  12  |   await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  13  |   await page.goto(`${entry}?fixture=G2&seed=130026`);await page.locator('[data-action="start"]').click();
  14  |   let firstDraftSeen=false;
  15  |   await completeHeart(page,async()=>{await page.screenshot({path:info.outputPath('g2-warning.png')});},async()=>{await page.screenshot({path:info.outputPath('g2-pulse.png')});},async state=>{
  16  |     if(firstDraftSeen)return;firstDraftSeen=true;await page.screenshot({path:info.outputPath('g2-draft.png')});
  17  |     const tick=state.tick, draftId=state.growth!.draft!.id;
  18  |     await page.keyboard.press('Escape');await page.keyboard.press('Tab');
  19  |     await page.locator('[data-action="help"]').last().click();await expect(page.getByRole('dialog',{name:'操作指南'})).toBeVisible();
  20  |     await page.locator('[data-action="close-help"]').click();
  21  |     // Explicit synthetic focus-loss regression; this does not claim physical OS blur.
  22  |     await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  23  |     info.annotations.push({type:'focus-provenance',description:'Draft focus-loss event is synthetic. Physical OS blur remains unverified.'});
  24  |     await page.waitForTimeout(300);const frozen=await readState(page);expect(frozen.tick).toBe(tick);expect(frozen.growth!.draft!.id).toBe(draftId);expect(frozen.growth!.equipped).toEqual([]);
  25  |   });
  26  |   const result=await readState(page);
  27  |   expect(result.result?.success).toBe(true);
  28  |   expect(firstDraftSeen).toBe(true);
  29  |   expect(result.growth!.consumedDraftIds.length).toBeGreaterThanOrEqual(2);
  30  |   expect(result.growth!.equipped.length).toBeGreaterThanOrEqual(2);
  31  |   expect(result.growth!.equipped.length).toBeLessThanOrEqual(3);
  32  |   expect(result.battle!.evolutionDecisions).toHaveLength(2);
  33  |   for(const d of result.battle!.evolutionDecisions!){expect(d.kind).toBe('warn');if(d.kind==='warn')for(const c of d.candidates)expect(c.probability).toBeLessThanOrEqual(.55+1e-10);}
  34  |   await page.screenshot({path:info.outputPath('g2-success.png')});
  35  |   await info.attach('g2-result',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
  36  |   const runId=result.growth!.runId;
  37  |   await page.locator('[data-action="retry"]').click();const retry=await readState(page);
  38  |   expect(retry.seed).toBe(result.seed);expect(retry.growth!.runId).not.toBe(runId);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.xp).toBe(0);expect(retry.growth!.draft).toBeNull();
  39  |   expect(errors).toEqual([]);expect(remote).toEqual([]);
  40  | });
  41  | 
  42  | test('G2 RUN-06: legally acquire both pairs, trigger their real effects, research a fourth and replace',async({page,context},info)=>{
  43  |   test.setTimeout(180000);await context.setOffline(true);
  44  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  45  |   const observedEvents=new Map<string,Awaited<ReturnType<typeof readState>>['events'][number]>();
  46  |   const observe=(snapshot:Awaited<ReturnType<typeof readState>>)=>{for(const event of snapshot.events)observedEvents.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`,event);};
  47  |   const checkpoint=async(name:string,extra:Record<string,unknown>={})=>{const snapshot=await readState(page);observe(snapshot);writeFileSync(info.outputPath(`${name}.json`),JSON.stringify({snapshot,observedEvents:[...observedEvents.values()],...extra,build:JSON.parse(readFileSync('dist/build-meta.json','utf8'))},null,2));return snapshot;};
  48  |   const sawPair=(pair:string)=>[...observedEvents.values()].some(event=>event.type==='PROTOCOL_SYNERGY'&&event.data.pair===pair);
  49  |   await page.goto(`${entry}?fixture=G2&seed=130026&trait=CARAPACE`);await page.locator('[data-action="start"]').click();
  50  |   await walk(page,{x:620,y:520},35);await page.keyboard.press('KeyQ');
  51  |   let lastScan=-9;const deadline=Date.now()+90000;
  52  |   const evolutionFrames:Record<string,Awaited<ReturnType<typeof readState>>>={};
  53  |   // Keep the second source alive until the first elite is cleared, so there are
  54  |   // genuine neighbors to chain through. This changes only target priorities.
  55  |   while(Date.now()<deadline){
  56  |     const s=await readState(page);observe(s);if(s.phase==='paused'&&s.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
  57  |     if(s.phase!=='playing')throw new Error(`Opening failed: ${s.result?.reason}`);
  58  |     const frameName=s.battle!.traits.length?'after':s.battle!.warning?'warning':s.elapsed>=10?'before':null;
  59  |     if(frameName&&!evolutionFrames[frameName]){evolutionFrames[frameName]=s;await page.screenshot({path:info.outputPath(`g2-evolution-${frameName}.png`)});}
  60  |     if(s.battle!.stats.eliteClears>=1&&s.growth!.equipped.length>=2)break;
  61  |     if(s.elapsed-lastScan>3.2){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
  62  |     const target=s.targets.find(t=>t.hp>0&&t.id==='source-a')??s.targets.find(t=>t.hp>0&&t.role==='elite')??s.targets.find(t=>t.hp>0&&t.role==='virus'&&Math.hypot(t.x-s.player.x,t.y-s.player.y)<150);
  63  |     const heal=s.tissue.hp<75;
  64  |     if(heal||target){await page.keyboard.press(heal?'Digit3':'Digit1');await aim(page,heal?s.tissue:target!);await page.mouse.down();}
  65  |     else await page.mouse.up();
  66  |     await page.waitForTimeout(120);
  67  |   }
  68  |   await page.mouse.up();let state=await checkpoint('g2-opening-before-assert');
  69  |   expect(state.battle!.stats.sourceClears).toBe(1);expect(state.battle!.stats.eliteClears).toBeGreaterThanOrEqual(1);
  70  |   expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['PULSE_BREAK','PURIFY_CHAIN']));
  71  |   await walk(page,state.battle!.pulse.origin,65);
  72  |   // Start on a high-HP source with a genuine nearby body during surge. Keep
  73  |   // using precision fire after surge ends so the same 4-second exposure can
  74  |   // actually be finished. A lone area hit per six-second rhythm lets it expire;
  75  |   // a patrol-wounded 68-HP body may also die before area fire can mark it.
  76  |   const chainDeadline=Date.now()+30000;
  77  |   const pulseAttempts:unknown[]=[];
  78  |   let finishing:string|null=null,finishUntil=0;
  79  |   while(Date.now()<chainDeadline){
  80  |     state=await readState(page);observe(state);if(state.phase==='paused'&&state.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
  81  |     if(sawPair('PULSE_BREAK+PURIFY_CHAIN'))break;
  82  |     if(state.phase!=='playing')break;
  83  |     const source=state.targets.find(t=>t.hp>0&&t.id==='source-b');
  84  |     const chain=state.growth!.equipped.find(slot=>slot.id==='PURIFY_CHAIN')!;
  85  |     const range=getChainConfig(chain.tuning,protocolRank(chain)).range;
  86  |     let target=state.targets.find(t=>t.id===finishing&&t.hp>0);
  87  |     if(!target||state.elapsed>=finishUntil){target=undefined;finishing=null;}
  88  |     if(!target&&source&&state.battle!.pulse.phase==='surge'&&state.battle!.pulse.phaseRemaining>.18){
  89  |       const neighbors=state.targets.filter(t=>t.hp>0&&t.id!==source.id&&Math.hypot(t.x-source.x,t.y-source.y)<Math.min(range-20,125));
  90  |       if(neighbors.length){target=source;finishing=source.id;finishUntil=state.elapsed+3.8;pulseAttempts.push({kind:'start',tick:state.tick,elapsed:state.elapsed,player:state.player,target:source,neighbors});}
  91  |     }
  92  |     if(!target){await page.mouse.up();await page.waitForTimeout(60);continue;}
  93  |     // Read actual resonance hits: moving bodies can intercept a precision ray.
  94  |     // Finish the truly exposed target instead of assuming the aimed source hit.
  95  |     const exposed=state.targets.filter(t=>t.hp>0&&(t.exposedUntil??0)>state.elapsed&&state.events.some(e=>e.type==='PROTOCOL_RESONANCE_HIT'&&e.data.targetId===t.id&&e.tick>=state.tick-240)).sort((a,b)=>(a.exposedUntil??0)-(b.exposedUntil??0))[0];
  96  |     if(exposed){target=exposed;finishing=exposed.id;finishUntil=Math.min(finishUntil,exposed.exposedUntil!);}
  97  |     pulseAttempts.push({kind:'precision',tick:state.tick,elapsed:state.elapsed,phase:state.battle!.pulse.phase,target:{id:target.id,hp:target.hp,x:target.x,y:target.y,exposedUntil:target.exposedUntil},finishUntil});
  98  |     await page.keyboard.press('Digit1');await aim(page,target);await page.mouse.down();await page.waitForTimeout(70);
  99  |   }
  100 |   await page.mouse.up();state=await checkpoint('g2-pulse-chain-before-assert',{pulseAttempts});expect(sawPair('PULSE_BREAK+PURIFY_CHAIN')).toBe(true);
  101 |   await page.screenshot({path:info.outputPath('g2-pulse-chain-build.png')});
  102 |   await walk(page,{x:475,y:610},25);
  103 |   const researchSteps:unknown[]=[];
  104 |   for(let i=0;i<2;i++){
  105 |     await page.keyboard.press('KeyE');await expect.poll(async()=>(await readState(page)).growth!.draft!==null).toBe(true);
  106 |     while((await readState(page)).growth!.draft){const before=await readState(page);await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);const after=await readState(page);observe(after);researchSteps.push({before,after});}
  107 |   }
  108 |   state=await checkpoint('g2-fourth-protocol-before-assert',{researchSteps});expect(state.growth!.equipped).toHaveLength(3);
> 109 |   expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['EXPOSE_TRACE','IMMUNE_BEACON']));
      |                                               ^ Error: expect(received).toEqual(expected) // deep equality
  110 |   const traceDeadline=Date.now()+25000;
  111 |   while(Date.now()<traceDeadline){
  112 |     state=await readState(page);observe(state);if(state.phase==='paused'&&state.growth?.draft){await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);continue;}
  113 |     const target=state.targets.find(t=>t.hp>0&&t.role!=='source');
  114 |     if(target&&state.scanReady<=state.elapsed){await aim(page,target);await page.keyboard.press('KeyQ');}
  115 |     if(sawPair('EXPOSE_TRACE+IMMUNE_BEACON'))break;
  116 |     await page.waitForTimeout(120);
  117 |   }
  118 |   state=await checkpoint('g2-trace-beacon-before-assert');expect(sawPair('EXPOSE_TRACE+IMMUNE_BEACON')).toBe(true);
  119 |   await page.screenshot({path:info.outputPath('g2-trace-beacon.png')});
  120 |   await info.attach('g2-both-synergy-events',{body:Buffer.from(JSON.stringify(state,null,2)),contentType:'application/json'});
  121 |   await info.attach('g2-evolution-frames',{body:Buffer.from(JSON.stringify(evolutionFrames,null,2)),contentType:'application/json'});
  122 |   await completeHeart(page);const final=await checkpoint('g2-final-before-assert',{errors});expect(final.result?.success).toBe(true);expect(errors).toEqual([]);
  123 | });
  124 | 
```