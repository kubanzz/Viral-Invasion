# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assault-v0811.spec.ts >> naturally unlocks tissue guard and leaves real cells to intercept an assault while approaching a source
- Location: tests\e2e\assault-v0811.spec.ts:12:1

# Error details

```
Error: Walk interrupted: result
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
        - generic: ●连续挑战 / 11
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前
    - dialog "连续挑战结算" [ref=e6]:
      - generic [ref=e7]: ENDLESS / RUN ENDED
      - heading "这一轮结束，再换一种构筑。" [level=2] [ref=e8]
      - paragraph [ref=e9]: 救援体耐久耗尽：观察前摇，冲刺脱离危险区域。
      - generic [ref=e10]:
        - generic [ref=e11]:
          - strong [ref=e12]: "10"
          - text: 完全清除波次
        - generic [ref=e13]:
          - strong [ref=e14]: "7368"
          - text: 本局得分
        - generic [ref=e15]:
          - strong [ref=e16]: "66"
          - text: 最高连击
      - paragraph [ref=e17]: 到达第 11 波 · 净化 235 体 · 03:42 · SEED 71
      - paragraph [ref=e18]: 个人纪录 · 通关 10 波 / 7368 分 / 连击 66 · 已结算 1 局
      - generic [ref=e19]:
        - heading "本局战斗进化 · Lv.10" [level=3] [ref=e20]
        - paragraph [ref=e21]: 净化突破 2阶 · 扇形抗体 2阶 · 裂解新星 1阶 · 免疫军团 7阶
        - generic [ref=e22]:
          - term [ref=e23]: 精确净化
          - definition [ref=e24]: 5束 × 46.2伤害 · 每束额外贯穿0体 · 间隔0.18s
          - term [ref=e25]: 范围裂解
          - definition [ref=e26]: 半径108 · 101.7伤害 · 冷却1.1s
          - term [ref=e27]: 冲刺 / Q爆发
          - definition [ref=e28]: 0 / 0伤害（0表示未解锁）
          - term [ref=e29]: 免疫与耐久
          - definition [ref=e30]: 细胞伤害×3.26 · 寿命+8s · 小队冷却×0.5 · Q 1.63s · 最大耐久100
        - paragraph [ref=e31]: 最近获得 · 免疫军团：免疫细胞伤害倍率 2 → 2.4，额外寿命 6.25 → 8 秒；Q 冷却 1.875 → 1.63 秒，小队独立冷却倍率 0.571 → 0.5。组织驻防已解锁：650 范围内 Q 瞄准十字组织，小队守备 300 范围并优先拦截袭击者；你可离开，细胞仍须真实到达和接触。Q 指敌或空地改令，不续命、不重置咬击。
      - status [ref=e32]: 连续挑战战绩已独立保存到此浏览器；清理浏览器数据可能丢失记录。
      - generic [ref=e33]:
        - button "同种子再战" [ref=e34] [cursor=pointer]
        - button "换个种子再战" [ref=e35] [cursor=pointer]
        - button "主菜单" [ref=e36] [cursor=pointer]
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
> 47  |   while(Date.now()<deadline){const s=await readState(page);if(s.phase==='paused'&&s.growth?.draft){await chooseDraftInput(page);continue;}if(s.phase!=='playing')throw new Error(`Walk interrupted: ${s.phase}`);if(Math.hypot(s.player.x-target.x,s.player.y-target.y)<tolerance)return;await keyMove(page,s.player,route(s.player,target,activeWorld(s)));}
      |                                                                                                                                                                        ^ Error: Walk interrupted: result
  48  |   throw new Error(`Unreachable waypoint ${JSON.stringify(target)}`);
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