# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v064-obstacle-visibility.spec.ts >> Feedback 0.6.4: real cells remain readable behind a raised fold in both quality modes, then win and retry cleanly
- Location: tests\e2e\feedback-v064-obstacle-visibility.spec.ts:73:1

# Error details

```
Error: Unreachable waypoint {"x":1675,"y":1075}
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
        - paragraph: 净化主要感染源 2/2，变异精英 0/2；保护所有激活器官。
        - generic: 感染源 2 / 2 进化精英 0 / 2
        - paragraph: 靠近装置按 E · Q 扫描诊断
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 65 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 84%
          - paragraph: 按 3 瞄准十字节点抢修
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 0%
          - paragraph: 净化感染源 / 关闭隔离闸可降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: △ 蓄力 0.2s
          - generic: E 冲流就绪
      - status:
        - generic:
          - strong: △ 变异前兆 · 潜伏
          - generic: 2.2s
        - paragraph: 拟态组织，优先侵蚀组织
        - generic: 代价移动速度降低 50%；每 6 秒扰动 1.2 秒
        - generic: 反制Q 扫描显形 5 秒；基础射击仍有效；3 修复组织同时清除附近潜伏体
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
                - strong: 84%
          - generic:
            - generic: ◖◗
            - generic:
              - generic:
                - generic: 肺部
                - strong: 76%
        - paragraph: 第二次变异后，器官通道开放。
      - generic: 变异预警 · 潜伏：拟态组织，优先侵蚀组织。代价：移动速度降低 50%；每 6 秒扰动 1.2 秒。反制：Q 扫描显形 5 秒；基础射击仍有效；3 修复组织同时清除附近潜伏体
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
            - text: 群体 · 击退打断
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 就绪
      - generic: G4 · 器官联防 / 架空生物幻想
      - generic: SEED 13 / 00:19
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 5
        - generic: 进化 Lv.2 · 经验 56 / 95
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。显影联动优先围猎标记体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 待触发
          - generic "Q 扫描当前范围内活跃感染体。标记与显形 9 秒，前 3 秒移动速度 ×0.7；免疫小队优先追踪标记目标。 占用一个协议槽位，没有直接伤害。 现在按 Q，让敌群显形并减速；搭配免疫细胞优先围猎标记体。":
            - generic: ◌
            - generic: 异常显影 Ⅰ
            - generic: 待触发
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
        - paragraph: Q 召集三只免疫细胞 · 研究台 E
```

# Test source

```ts
  1   | import type { Page } from '@playwright/test';
  2   | import type { GameState, Vec, WorldGeometry } from '../../src/game/types';
  3   | import { activeWorld, WORLD } from '../../src/game/types';
  4   | import { normalized, wallHit } from '../../src/actors/collision';
  5   | import type { ProtocolId } from '../../src/game/growthTypes';
  6   | 
  7   | export const readState = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
  8   | export async function aim(page: Page, target: Vec): Promise<void> {
  9   |   const p = await page.evaluate(point => {
  10  |     const target = window.__viral.toScreen(point), player = window.__viral.toScreen(window.__viral.snapshot().player);
  11  |     const dx=target.x-player.x,dy=target.y-player.y;
  12  |     const ratio=Math.min(1,dx>0?(innerWidth-24-player.x)/dx:dx<0?(24-player.x)/dx:1,dy>0?(innerHeight-108-player.y)/dy:dy<0?(85-player.y)/dy:1);
  13  |     return {x:player.x+dx*Math.max(0,ratio),y:player.y+dy*Math.max(0,ratio)};
  14  |   }, target);
  15  |   await page.mouse.move(p.x, p.y);
  16  | }
  17  | export async function keyMove(page: Page, from: Vec, to: Vec, duration = 100): Promise<void> {
  18  |   const dx = to.x - from.x, dy = to.y - from.y;
  19  |   const keys = [Math.abs(dx) > 10 ? dx > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(dy) > 10 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
  20  |   for (const key of keys) await page.keyboard.down(key);
  21  |   await page.waitForTimeout(duration);
  22  |   for (const key of keys) await page.keyboard.up(key);
  23  | }
  24  | 
  25  | // Navigation is test-side planning around the game's visible collision footprints.
  26  | // It issues only real key holds; no simulation or player state is written.
  27  | function route(from: Vec, target: Vec, geometry: WorldGeometry = WORLD): Vec {
  28  |   const clear = (a: Vec, b: Vec) => geometry.obstacles.every(o => {
  29  |     const dx=b.x-a.x,dy=b.y-a.y, length=dx*dx+dy*dy;
  30  |     const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(length||1)));
  31  |     return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y)>o.radius+28;
  32  |   });
  33  |   if(clear(from,target)) return target;
  34  |   const nodes: Vec[]=[from,target,...geometry.obstacles.flatMap(o=>Array.from({length:12},(_,i)=>({x:o.x+Math.cos(i*Math.PI/6)*(o.radius+65),y:o.y+Math.sin(i*Math.PI/6)*(o.radius+65)})))];
  35  |   const costs=nodes.map(()=>Infinity), previous=nodes.map(()=>-1), visited=new Set<number>(); costs[0]=0;
  36  |   for(let n=0;n<nodes.length;n++) {
  37  |     let current=-1; for(let i=0;i<nodes.length;i++) if(!visited.has(i)&&(current<0||costs[i]<costs[current])) current=i;
  38  |     if(current<0||!Number.isFinite(costs[current])||current===1) break;
  39  |     visited.add(current);
  40  |     for(let i=0;i<nodes.length;i++) if(!visited.has(i)&&clear(nodes[current],nodes[i])) { const cost=costs[current]+Math.hypot(nodes[current].x-nodes[i].x,nodes[current].y-nodes[i].y);if(cost<costs[i]){costs[i]=cost;previous[i]=current;} }
  41  |   }
  42  |   let index=1;while(previous[index]>0) index=previous[index];
  43  |   return previous[index]===0?nodes[index]:target;
  44  | }
  45  | export async function walk(page: Page, target: Vec, tolerance=30): Promise<void> {
  46  |   const deadline=Date.now()+12000;
  47  |   while(Date.now()<deadline){const s=await readState(page);if(s.phase==='paused'&&s.growth?.draft){await chooseDraftInput(page);continue;}if(s.phase!=='playing')throw new Error(`Walk interrupted: ${s.phase}`);if(Math.hypot(s.player.x-target.x,s.player.y-target.y)<tolerance)return;await keyMove(page,s.player,route(s.player,target,activeWorld(s)));}
> 48  |   throw new Error(`Unreachable waypoint ${JSON.stringify(target)}`);
      |         ^ Error: Unreachable waypoint {"x":1675,"y":1075}
  49  | }
  50  | export async function chooseDraftInput(page: Page, priorities: readonly ProtocolId[] = ['PULSE_BREAK','PURIFY_CHAIN','EXPOSE_TRACE','IMMUNE_BEACON']): Promise<void> {
  51  |   const state=await readState(page), draft=state.growth?.draft;if(!draft)return;
  52  |   if(draft.status==='replacing') {await page.locator('[data-action="draft-replace"]').first().click();return;}
  53  |   const options=draft.options.slice().sort((a,b)=>Number(a.kind==='retune')-Number(b.kind==='retune')||priorities.indexOf(a.protocolId)-priorities.indexOf(b.protocolId));
  54  |   await page.locator(`[data-action="draft-option"][data-option="${options[0].id}"]`).click();
  55  | }
  56  | 
  57  | export interface DriveEvidence { states: GameState[]; pulses: number; warningSeen: boolean; revealed: boolean }
  58  | export async function completeHeart(page: Page, onWarning?: (state: GameState)=>Promise<void>, onPulse?: (state: GameState)=>Promise<void>, onDraft?: (state: GameState)=>Promise<void>): Promise<DriveEvidence> {
  59  |   const evidence:DriveEvidence={states:[],pulses:0,warningSeen:false,revealed:false};
  60  |   const deadline=Date.now()+100000;
  61  |   let lastScan=-9, lastPulse=-9, warned=false;
  62  |   while(Date.now()<deadline) {
  63  |     const s=await readState(page), b=s.battle!;
  64  |     if(s.phase==='result') { if(!s.result?.success) throw new Error(`Campaign failed: ${s.result?.reason}`);return evidence; }
  65  |     if(s.phase==='paused'&&s.growth?.draft){await page.mouse.up();if(onDraft)await onDraft(s);await chooseDraftInput(page);continue;}
  66  |     if(s.phase!=='playing')throw new Error(`Unexpected phase: ${s.phase}`);
  67  |     if(b.warning&&!warned) { warned=true;evidence.warningSeen=true;evidence.states.push(s);if(onWarning)await onWarning(s); }
  68  |     if(s.elapsed-lastScan>3.3){await page.keyboard.press('KeyQ');lastScan=s.elapsed;evidence.revealed=true;}
  69  |     const valve=b.graph.nodes.find(n=>n.kind==='valve')!;
  70  |     const live=s.targets.filter(t=>t.hp>0);
  71  |     const elite=live.find(t=>t.role==='elite');
  72  |     if(elite&&s.elapsed-lastPulse>8.2&&b.pulse.readyAt<=s.elapsed) {
  73  |       await page.mouse.up();
  74  |       await walk(page,valve,80);
  75  |       const fresh=(await readState(page)).targets.find(t=>t.id===elite.id&&t.hp>0);
  76  |       if(!fresh)continue; // A legal beacon may finish this enemy during travel.
  77  |       await aim(page,fresh);await page.keyboard.press('KeyE');lastPulse=s.elapsed;evidence.pulses++;
  78  |       await page.waitForTimeout(100);
  79  |       const afterPulse=await readState(page);evidence.states.push(afterPulse);if(onPulse)await onPulse(afterPulse);
  80  |     }
  81  |     const fresh=await readState(page), battle=fresh.battle!;
  82  |     if(fresh.phase==='result')continue;
  83  |     if(fresh.tissue.hp<55) {
  84  |       await page.mouse.up();await walk(page,{x:690,y:540},65);await page.keyboard.press('Digit3');await aim(page,fresh.tissue);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();continue;
  85  |     }
  86  |     const targets=fresh.targets.filter(t=>t.hp>0);
  87  |     const target=targets.filter(t=>t.role==='source').sort((a,b)=>Math.hypot(a.x-fresh.player.x,a.y-fresh.player.y)-Math.hypot(b.x-fresh.player.x,b.y-fresh.player.y))[0] ?? targets.find(t=>t.role==='elite') ?? targets[0];
  88  |     if(target) {
  89  |       const distance=Math.hypot(target.x-fresh.player.x,target.y-fresh.player.y);
  90  |       const blocked=wallHit(fresh.player,normalized(target.x-fresh.player.x,target.y-fresh.player.y),distance);
  91  |       if(distance>410||(blocked!==null&&blocked<distance-target.radius)) {await page.mouse.up();await keyMove(page,fresh.player,route(fresh.player,target),200);continue;}
  92  |       const close=targets.filter(t=>Math.hypot(t.x-target.x,t.y-target.y)<90).length;
  93  |       const tool=close>1&&fresh.cooldowns[2]<=fresh.elapsed?2:1;
  94  |       if(fresh.tool!==tool)await page.keyboard.press(`Digit${tool}`);
  95  |       await aim(page,target);await page.mouse.down();
  96  |       // Move away from a telegraphed strike without interrupting aim/fire.
  97  |       const danger=targets.find(t=>t.attackAt&&Math.hypot(t.x-fresh.player.x,t.y-fresh.player.y)<100);
  98  |       if(danger)await keyMove(page,fresh.player,{x:fresh.player.x+(fresh.player.x-danger.x)*2,y:fresh.player.y+(fresh.player.y-danger.y)*2},100);
  99  |       else await page.waitForTimeout(100);
  100 |     } else {
  101 |       await page.mouse.up();
  102 |       if(battle.readyToRetest) {await walk(page,fresh.terminal,65);await page.keyboard.press('KeyE');await page.waitForTimeout(100);}
  103 |       else if(Math.hypot(fresh.player.x-valve.x,fresh.player.y-valve.y)>80)await keyMove(page,fresh.player,route(fresh.player,valve),100);
  104 |       else await page.waitForTimeout(100);
  105 |     }
  106 |   }
  107 |   throw new Error(`Campaign input driver timeout: ${JSON.stringify(await readState(page))}`);
  108 | }
  109 | 
```