# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: formal-failure-lifecycle.spec.ts >> Formal lifecycle: natural collapse, paused warning, one loss and clean held-input menu/retry
- Location: tests\e2e\formal-failure-lifecycle.spec.ts:12:61

# Error details

```
TimeoutError: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('[data-action="start"]')

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic "病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互" [ref=f1e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●HEART / 01
        - button "声音开关" [ref=f1e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=f1e4] [cursor=pointer]
        - button "暂停 Esc" [ref=f1e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅰ · 建立防线
        - heading "守住这道生命防线" [level=2]
        - paragraph: Q 诊断感染，1 精确净化首个感染源；组织受损时用 3 修复。首次清源后进入真实变异反制。
        - generic: 感染源 0 / 2 进化精英 0 / 2
        - paragraph: 靠近装置按 E · Q 扫描诊断
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 62%
          - paragraph: 按 3 瞄准十字节点抢修
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 27%
          - paragraph: 净化感染源 / 关闭隔离闸可降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: △ 蓄力 1.7s
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
        - paragraph: 第二次变异后，器官通道开放。
      - generic: 感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=f1e6] [cursor=pointer]:
            - generic [ref=f1e7]: "1"
            - strong [ref=f1e8]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 范围裂解" [ref=f1e10] [cursor=pointer]:
            - generic [ref=f1e11]: "2"
            - strong [ref=f1e12]: 范围裂解
            - text: 群体 · 击退打断
          - button "3 组织修复" [ref=f1e14] [cursor=pointer]:
            - generic [ref=f1e15]: "3"
            - strong [ref=f1e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 就绪
      - generic: G4 · 器官联防 / 架空生物幻想
      - generic: SEED 13 / 00:00
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 0
        - generic: 进化 Lv.0 · 经验 0 / 20
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
        - button "当前配装详情" [ref=f1e18] [cursor=pointer]
        - paragraph: Q 诊断 · E 研究（诊断后可定向）
    - dialog "战斗已暂停" [ref=f1e20]:
      - generic [ref=f1e21]: VIRAL INVASION / 病毒入侵
      - heading "让心跳，等你片刻。" [level=2] [ref=f1e22]
      - paragraph [ref=f1e23]: 战斗、器官气流、传播和迁移倒数都已暂停。
      - generic [ref=f1e24]:
        - generic [ref=f1e25]:
          - generic [ref=f1e26]: ♥
          - strong [ref=f1e27]: 心脏 62%
          - generic [ref=f1e28]: 完整度达标
        - generic [ref=f1e29]:
          - generic [ref=f1e30]: ◖◗
          - strong [ref=f1e31]: 肺部 76%
          - generic [ref=f1e32]: 未激活，不计入复测
      - generic [ref=f1e33]: SEED 13 · 00:00 · 当前心脏
      - generic [ref=f1e34]:
        - button "继续战斗" [ref=f1e35] [cursor=pointer]
        - button "同种子重试" [ref=f1e36] [cursor=pointer]
        - button "战术记录" [ref=f1e37] [cursor=pointer]
        - button "作战手册" [ref=f1e38] [cursor=pointer]
        - button "返回主菜单" [ref=f1e39] [cursor=pointer]
        - button "当前配装详情" [ref=f1e40] [cursor=pointer]
      - generic [ref=f1e41]:
        - button "特效：标准" [ref=f1e42] [cursor=pointer]
        - button "声音 开" [ref=f1e43] [cursor=pointer]
```

# Test source

```ts
  1  | import{test,expect,type Page}from'@playwright/test';
  2  | import{writeFileSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
  3  | import{readState,aim}from'./campaignDriver';
  4  | import{failureRouteInput,type FailureRoute}from'../helpers/failureDriver';
  5  | import{PROFILE_STORAGE_KEY}from'../../src/meta/profile';
  6  | import{type GameEvent,type InputFrame}from'../../src/game/types';
  7  | 
  8  | test.use({trace:'off',video:'off'});
  9  | const entry=pathToFileURL(resolve(process.env.VI_ENTRY??'dist/index.html')).href;
  10 | const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
  11 | const readProfile=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);
  12 | for(const route of['collapse','infection']as FailureRoute[])test(`Formal lifecycle: natural ${route}, paused warning, one loss and clean held-input menu/retry`,async({page,context},info)=>{
  13 |   test.setTimeout(390000);await context.setOffline(true);
  14 |   const errors:string[]=[],remote:string[]=[],failedRequests:string[]=[],events=new Map<string,GameEvent>(),samples:unknown[]=[],inputs:unknown[]=[],checkpoints:Record<string,unknown>={};
  15 |   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text());});
  16 |   page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});page.on('requestfailed',request=>failedRequests.push(request.url()));
  17 |   const held=new Set<string>();let firing=false,lastAimAt=0;
  18 |   const release=async()=>{for(const key of held)await page.keyboard.up(key);held.clear();await page.mouse.up();firing=false;};
  19 |   const apply=async(input:InputFrame)=>{
  20 |     const keys=new Set([input.moveX&&input.moveX<0?'KeyA':input.moveX&&input.moveX>0?'KeyD':'',input.moveY&&input.moveY<0?'KeyW':input.moveY&&input.moveY>0?'KeyS':''].filter(Boolean));
  21 |     if([...held].some(key=>!keys.has(key))||[...keys].some(key=>!held.has(key))||!!input.fire!==firing)inputs.push({atTick:(await readState(page)).tick,keys:[...keys],fire:!!input.fire,aim:input.aim});
  22 |     for(const key of held)if(!keys.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of keys)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
  23 |     if(input.fire||Date.now()-lastAimAt>1000){await aim(page,input.aim!);lastAimAt=Date.now();}
  24 |     if(!!input.fire!==firing){if(input.fire)await page.mouse.down();else await page.mouse.up();firing=!!input.fire;}
  25 |   };
  26 |   const snapshot=async()=>{const state=await readState(page);for(const event of state.events)events.set(JSON.stringify(event),event);return state;};
  27 |   try{
  28 |     // Acknowledge onboarding with its real button, then start a new adaptive case.
  29 |     // No profile, time, actor or HP is injected, including during this bootstrap.
  30 |     await page.goto(entry+'?seed=13');await page.locator('[data-action="start"]').click();await page.locator('[data-action="skip-counter-guide"]').click();
  31 |     await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();
  32 |     await page.goto(entry+'?seed=13&trait='+(route==='collapse'?'MIMIC':'CARAPACE'));
  33 |     await page.locator('[data-action="start"]').click();await page.keyboard.press('Digit3');
  34 |     const initial=await snapshot();checkpoints.initial=initial;expect(initial.battle!.encounter!.configId).toBe('campaign-1');expect(initial.battle!.encounter!.guideVariant).toBe('adaptive');expect(initial.world!.width).toBe(2400);
  35 |     expect((await readProfile(page)).stats.runs).toBe(0);
  36 |     let corner=0,paused=false,nextSample=0;const deadline=Date.now()+340000;
  37 |     while(Date.now()<deadline){
  38 |       const state=await snapshot();if(state.phase==='result')break;
  39 |       if(state.phase==='paused'&&state.growth?.draft){await release();await page.locator('[data-action="draft-discard"]').click();continue;}
  40 |       expect(state.phase).toBe('playing');
  41 |       if(state.elapsed>=nextSample){samples.push({tick:state.tick,elapsed:state.elapsed,hp:state.player.hp,tissue:state.tissue.hp,infection:state.battle!.pressure.infection,vitality:state.battle!.pressure.vitality,criticalSince:state.battle!.pressure.criticalSince});nextSample=state.elapsed+5;}
  42 |       if(!paused&&(route==='collapse'?state.battle!.pressure.organAlarm:state.battle!.pressure.criticalSince!==null)){
  43 |         checkpoints.warning=state;await page.screenshot({path:info.outputPath('warning.png')});
  44 |         await page.keyboard.press('Escape');const before=await snapshot();await release();await page.waitForTimeout(350);const after=await snapshot();
  45 |         expect(before.phase).toBe('paused');expect(after).toEqual(before);checkpoints.paused={before,after};
  46 |         await page.locator('[data-action="continue"]').click();paused=true;
  47 |       }
  48 |       const planned=failureRouteInput(await snapshot(),route,corner);corner=planned.corner;await apply(planned.input);await page.waitForTimeout(90);
  49 |     }
  50 |     await release();const final=await snapshot();checkpoints.final=final;expect(paused).toBe(true);expect(final.phase).toBe('result');expect(final.result?.success).toBe(false);expect(final.player.hp).toBeGreaterThan(0);
  51 |     expect(final.events.filter(event=>event.type==='RUN_ENDED')).toHaveLength(1);
  52 |     if(route==='collapse'){expect(final.result!.reason).toContain('身体崩溃');expect(final.battle!.pressure.vitality).toBe(0);expect(final.battle!.pressure.infection).toBeLessThan(100);}
  53 |     else{expect(final.result!.reason).toContain('感染失控');expect(final.battle!.pressure.vitality).toBeGreaterThan(0);expect(final.battle!.pressure.infection).toBe(100);expect(final.elapsed-final.battle!.pressure.criticalSince!).toBeCloseTo(15,5);}
  54 |     await expect(page.locator('.campaign-modal')).toBeVisible();await expect.poll(async()=>(await readProfile(page)).stats.losses).toBe(1);
  55 |     const saved=await readProfile(page);checkpoints.saved=saved;expect(saved.stats.runs).toBe(1);expect(saved.recentRuns).toHaveLength(1);expect(saved.recentRuns[0].reason).toBe(final.result!.reason);
  56 |     await page.screenshot({path:info.outputPath('real-failure.png')});
  57 |     await page.mouse.move(5,5);await page.mouse.down();await page.keyboard.down('KeyD');await page.waitForTimeout(300);
  58 |     expect(await snapshot()).toEqual(final);expect(await readProfile(page)).toEqual(saved);
  59 |     await page.locator('[data-action="retry"]').click();await page.waitForTimeout(220);const retry=await snapshot();checkpoints.retry=retry;
  60 |     expect(retry.phase).toBe('playing');expect(retry.player.hp).toBe(100);expect(retry.growth!.xp).toBe(0);expect(retry.growth!.equipped).toEqual([]);expect(retry.battle!.pressure.criticalSince).toBeNull();expect(retry.shots).toBe(0);expect(retry.battle!.stats.sourceClears).toBe(0);expect((await readProfile(page)).stats).toEqual(saved.stats);
  61 |     await page.keyboard.up('KeyD');await page.mouse.up();
  62 |     await page.keyboard.down('KeyD');await page.mouse.move(5,5);await page.mouse.down();await page.keyboard.press('Escape');const pause=await snapshot();await page.waitForTimeout(200);expect((await snapshot()).tick).toBe(pause.tick);
> 63 |     await page.locator('[data-action="menu"]').click();await page.locator('[data-action="start"]').click();await page.waitForTimeout(220);const fresh=await snapshot();checkpoints.afterMenu=fresh;
     |                                                                                                    ^ TimeoutError: locator.click: Timeout 8000ms exceeded.
  64 |     expect(fresh.player.hp).toBe(100);expect(fresh.growth!.xp).toBe(0);expect(fresh.growth!.equipped).toEqual([]);expect(fresh.shots).toBe(0);expect(fresh.player.x).toBe(initial.player.x);expect(fresh.player.y).toBe(initial.player.y);
  65 |     await page.keyboard.up('KeyD');await page.mouse.up();await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();await page.reload();
  66 |     const persisted=await readProfile(page);checkpoints.persisted=persisted;expect(persisted.stats).toEqual(saved.stats);expect(persisted.recordedRunIds).toEqual(saved.recordedRunIds);expect(persisted.achievements).toEqual(saved.achievements);expect(persisted.recentRuns).toEqual(saved.recentRuns);
  67 |     expect(errors).toEqual([]);expect(remote).toEqual([]);expect(failedRequests).toEqual([]);
  68 |   }finally{
  69 |     await release();await page.keyboard.up('KeyD');
  70 |     writeFileSync(info.outputPath('natural-failure-lifecycle.json'),JSON.stringify({route,browser:info.project.name,build:JSON.parse(readFileSync('dist/build-meta.json','utf8')),bundleSha256:hash('dist/game.js'),method:'Normal formal campaign with actual onboarding skip, new case and real DOM input. No game/profile/time/HP/position writes. Input changes and read snapshots recorded. Not human or performance evidence.',checkpoints,samples,inputs,events:[...events.values()],errors,remote,failedRequests,last:await snapshot()},null,2));
  71 |   }
  72 | });
  73 | 
```