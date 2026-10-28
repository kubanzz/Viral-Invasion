# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assault-v0811.spec.ts >> naturally unlocks tissue guard and leaves real cells to intercept an assault while approaching a source
- Location: tests\e2e\assault-v0811.spec.ts:12:1

# Error details

```
Error: Original guarded squad expired before the natural distant interception

expect(received).toBeLessThan(expected)

Expected: < 76.41666666666667
Received:   76.45
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
        - generic: ●连续挑战 / 6
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: 有限感染源已净化：截断 2 个尚未入场普通体；已入场敌群与裂殖仍需处理。
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 5 束 · 贯穿 +0
          - button "2 范围裂解" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 范围裂解
            - text: 范围 94 · 击退
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.8.11 · 连续进化挑战 / 微观绘本
      - generic: SEED 71 / 01:16
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 清波获得协议经验
        - generic: 协议 Lv.4 · 150 / 220 XP
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。Q 对准敌体可短时优先围猎；没有指定目标时优先显影体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 Q 就绪时，指敌体短时优先围猎；指空地部署区域，细胞实际移动咬击。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 咬击 48
          - generic "基础工具清除感染体或感染源。清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。":
            - generic: ⌁
            - generic: 连锁净化 Ⅰ
            - generic: 链 27 · 折 0
          - generic "靠近节律装置，在冲流相位用基础工具命中。距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。 需要接近装置并配合节律；无时机时不追加。 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。":
            - generic: ◇
            - generic: 共振裂解 Ⅰ
            - generic: 共振 0
        - button "当前配装详情" [ref=e18] [cursor=pointer]
        - paragraph: 朝敌群按 Q · 部署免疫小队
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 6 波
            - generic: 已清 5 波
          - generic:
            - generic: "14"
            - generic:
              - text: 敌群剩余
              - generic: 场上 14 · 待入场 0 · 已截断 2
          - heading "第2轮 · 压力推进 · 交叉夹击" [level=3]
          - paragraph: □ 源已击破 · 已截断2体待生增援。点射支援：窄线锁定后侧移；远距支援可接近射杀或朝它 Q 部署细胞，近处可用范围裂解打断。
          - paragraph: 当前变异：◇晶壳；□ 源已截断2体
          - generic:
            - generic: 得分 2050
            - generic: 连击 2 · 最高 18
        - region "救援体和组织状态":
          - generic:
            - generic: 救援体耐久
            - generic: 60 / 100
          - generic:
            - generic: 组织完整度
            - generic: 97%
          - paragraph: 感染 0% · 全身稳定 100%
          - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
        - generic:
          - strong: 战斗进化 Lv.5
          - generic:
            - paragraph: 1 · 5 束 × 34伤害 · 贯穿 +0 · 0.18s
            - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
            - paragraph: Space · 冲刺斩未解锁 Q · 免疫小队
            - paragraph: 细胞伤害 ×1.8 · Q 2.03s · 已记录咬击 48次 · Q点＋组织可驻防
          - paragraph: 最近获得 · 扇形抗体：精准净化 1 → 5 束；向左右同时发射更多抗体。
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：白三角为你，橙三角为组织袭击者，加号为组织，菱形为阀门，方框为增援源，圆点为敌群"
          - paragraph: △ 你 ▲ 袭击者 ＋ 组织 □ 源
          - paragraph: 组织在南西侧 · 481m
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { writeFileSync } from 'node:fs';
  3   | import { resolve } from 'node:path';
  4   | import { pathToFileURL } from 'node:url';
  5   | import { aim, chooseDraftInput, readState, walk } from './campaignDriver';
  6   | import { HeldMovement } from './heldMovement';
  7   | import { distance, normalized, wallHit } from '../../src/actors/collision';
  8   | import { activeWorld } from '../../src/game/types';
  9   | 
  10  | test.use({ video: 'off', trace: 'off' });
  11  | 
  12  | test('naturally unlocks tissue guard and leaves real cells to intercept an assault while approaching a source', async ({ page, context }, info) => {
  13  |   test.setTimeout(300_000); await context.setOffline(true);
  14  |   if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  15  |   const errors: string[] = [], remote: string[] = [], events: unknown[] = [], observations: unknown[] = [];
  16  |   const seen = new Set<string>(), raiders = new Set<string>();
  17  |   page.on('pageerror', error => errors.push(error.message));
  18  |   page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  19  |   await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  20  |   await page.locator('[data-action="endless-start"]').click();
  21  |   await page.evaluate(() => {
  22  |     // This observer only reads snapshots. Sample the current simulation tick,
  23  |     // so retained event history cannot move a near-player hit into a later trip.
  24  |     const records: unknown[] = [], roots = new Set<string>();
  25  |     (window as unknown as { __guardQa: unknown[] }).__guardQa = records;
  26  |     const observe = () => {
  27  |       const s = window.__viral.snapshot(), beacon = s.growth?.beacon;
  28  |       if (beacon?.guard && beacon.until > s.elapsed && Math.hypot(s.player.x - s.tissue.x, s.player.y - s.tissue.y) > 300) {
  29  |         for (const event of s.events) if (event.tick === s.tick && event.type === 'TARGET_HIT' && Number(event.data.damage) > 0 && event.data.immuneCellId) {
  30  |           const body = s.targets.find(target => target.id === event.data.id), root = String(event.data.rootId);
  31  |           if (body?.assaultObjective === 'tissue' && !roots.has(root) && records.length < 20) {
  32  |             roots.add(root); records.push({ event, player: { x: s.player.x, y: s.player.y }, tissue: { x: s.tissue.x, y: s.tissue.y },
  33  |               elapsed: s.elapsed, tick: s.tick, beacon: structuredClone(beacon), target: structuredClone(body),
  34  |               cells: structuredClone(s.growth?.cells ?? []) });
  35  |           }
  36  |         }
  37  |       }
  38  |       requestAnimationFrame(observe);
  39  |     };
  40  |     requestAnimationFrame(observe);
  41  |   });
  42  |   const movement = new HeldMovement(page), deadline = Date.now() + 270_000;
  43  |   let state = await readState(page), tool = 0, guarding = false, sourceCut = false, distantGuardBite = false;
  44  |   let guardWave = 0, guardUntil = 0;
  45  |   try {
  46  |     while (Date.now() < deadline) {
  47  |       state = await readState(page);
  48  |       const guardReceipts = await page.evaluate(() => (window as unknown as { __guardQa: unknown[] }).__guardQa);
  49  |       if (guarding && guardReceipts.length && !distantGuardBite) {
  50  |         distantGuardBite = true; observations.push({ distantGuardBites: guardReceipts });
  51  |       }
  52  |       for (const target of state.targets) if (target.assaultObjective === 'tissue') raiders.add(target.id);
  53  |       for (const event of state.events) {
  54  |         const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
  55  |         if (seen.has(key)) continue; seen.add(key);
  56  |         if (event.type === 'ACTOR_SPAWNED' && event.data.assaultObjective === 'tissue') raiders.add(String(event.data.id));
  57  |         if (event.type.startsWith('IMMUNE_') || event.type.startsWith('ENDLESS_SOURCE_') || event.type === 'COMBAT_UPGRADE_COMMITTED') events.push(event);
  58  |         if (event.type === 'TARGET_HIT' && raiders.has(String(event.data.id)) && Number(event.data.damage) > 0 && event.data.immuneCellId) {
  59  |           events.push(event);
  60  |         }
  61  |       }
  62  |       expect(state.phase, state.result?.reason).not.toBe('result');
  63  |       if (state.growth?.draft) {
  64  |         await movement.release(); await page.mouse.up(); tool = 0;
  65  |         await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
  66  |       }
  67  |       if (state.endlessGrowth?.draft) {
  68  |         await movement.release(); await page.mouse.up(); tool = 0;
  69  |         const priorities = ['immune', 'multishot', 'power', 'nova', 'pierce', 'haste', 'scan', 'dash', 'vitality', 'catalysis'];
  70  |         const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
  71  |         await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
  72  |       }
  73  |       if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  74  |       const source = state.endless!.source;
  75  |       if (!guarding && source?.status === 'active' && (state.endlessGrowth?.ranks.immune ?? 0) >= 3) {
  76  |         if (distance(state.player, state.tissue) > 180) {
  77  |           await movement.release(); await page.mouse.up(); tool = 0; await walk(page, { x: state.tissue.x - 90, y: state.tissue.y - 90 }, 120); continue;
  78  |         }
  79  |         if (state.endless!.phase === 'combat' && state.scanReady <= state.elapsed) {
  80  |           await movement.release(); await aim(page, state.tissue); await page.keyboard.press('KeyQ');
  81  |           const after = await readState(page);
  82  |           if (after.growth?.beacon?.guard) {
  83  |             guarding = true; guardWave = after.endless!.wave; guardUntil = after.growth.beacon.until;
  84  |             observations.push({ guardAccepted: after });
  85  |             await expect(page.locator('#endless-ability-3')).toContainText('正在驻防组织');
  86  |             await page.screenshot({ path: info.outputPath('guard-order-and-assault.png') });
  87  |             await page.mouse.up(); tool = 0; await walk(page, source.position, 280); continue;
  88  |           }
  89  |         }
  90  |       }
  91  |       if (guarding && state.endless!.wave === guardWave && source) {
  92  |         if (source.status === 'destroyed') sourceCut = true;
  93  |         if (distantGuardBite && sourceCut) {
  94  |           await movement.release(); await page.mouse.up();
  95  |           observations.push({ guardAndSource: state });
  96  |           await page.screenshot({ path: info.outputPath('cells-defend-player-clears-source.png') }); break;
  97  |         }
> 98  |         expect(state.elapsed, 'Original guarded squad expired before the natural distant interception').toBeLessThan(guardUntil);
      |                                                                                                         ^ Error: Original guarded squad expired before the natural distant interception
  99  |         const target = state.targets.find(target => target.id === source.id && target.hp > 0);
  100 |         if (target) {
  101 |           const gap = distance(state.player, target);
  102 |           if (gap > 510) { await movement.release(); await page.mouse.up(); await walk(page, target, 280); continue; }
  103 |           await aim(page, target);
  104 |           if (tool !== 1) { await page.keyboard.press('Digit1'); tool = 1; }
  105 |           await page.mouse.down();
  106 |         } else await page.mouse.up();
  107 |         // Keep the actual original order; a routine Q would redirect the guard.
  108 |         await page.waitForTimeout(70); continue;
  109 |       }
  110 |       const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(state.player, a) - distance(state.player, b));
  111 |       const target = live.find(target => {
  112 |         const gap = distance(state.player, target), block = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, activeWorld(state));
  113 |         return block === null || block >= gap - target.radius;
  114 |       });
  115 |       if (target) {
  116 |         await aim(page, target);
  117 |         if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
  118 |         const desiredTool = live.filter(other => distance(other, target) < 100).length >= 3 && state.cooldowns[2] <= state.elapsed ? 2 : 1;
  119 |         if (tool !== desiredTool) { await page.keyboard.press(`Digit${desiredTool}`); tool = desiredTool; }
  120 |         await page.mouse.down();
  121 |         const danger = live.find(enemy => enemy.attackPlan && enemy.tactic !== 'mimic-corrosion');
  122 |         if (danger?.attackPlan) {
  123 |           const line = normalized(danger.attackPlan.aim.x - danger.x, danger.attackPlan.aim.y - danger.y);
  124 |           await movement.move(-line.y, line.x);
  125 |           if (state.player.dashReady <= state.elapsed) await page.keyboard.press('Space');
  126 |         } else {
  127 |           const gap = distance(state.player, target), sign = gap < 180 ? -1 : gap > 440 ? 1 : 0;
  128 |           await movement.move((target.x - state.player.x) * sign, (target.y - state.player.y) * sign);
  129 |         }
  130 |       } else {
  131 |         await page.mouse.up(); tool = 0; await movement.move(0, 0);
  132 |       }
  133 |       await page.waitForTimeout(70);
  134 |     }
  135 |   } finally {
  136 |     await movement.release(); await page.mouse.up(); state = await readState(page);
  137 |     writeFileSync(info.outputPath('natural-tissue-guard.json'), JSON.stringify({ scope: 'Actual offline DOM input, ordinary offered upgrades, guard then deliberate source route; no state injection. Not a route-balance,16-wave browser or human-fun result.', guarding, guardWave, sourceCut, distantGuardBite, events, observations, final: state, errors, remote }, null, 2));
  138 |   }
  139 |   expect(guarding && sourceCut && distantGuardBite).toBe(true);
  140 |   expect(errors).toEqual([]); expect(remote).toEqual([]);
  141 | });
  142 | 
```