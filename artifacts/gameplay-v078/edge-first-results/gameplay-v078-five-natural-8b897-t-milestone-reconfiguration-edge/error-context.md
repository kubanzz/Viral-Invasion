# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gameplay-v078.spec.ts >> five natural waves expose support and elite tells, redirect the same squad, and grant milestone reconfiguration
- Location: tests\e2e\gameplay-v078.spec.ts:13:1

# Error details

```
TypeError: Cannot read properties of null (reading 'until')
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
        - generic: ●连续挑战 / 1
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: 第 1 波 · 正面双潮。清场获得成长；注意多方向来袭。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 1 束 · 贯穿 +0
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
          - text: 扫描
          - emphasis: 2.8s
      - generic: v0.7.8 · 连续进化挑战 / 架空生物幻想
      - generic: SEED 71 / 00:02
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 清波获得协议经验
        - generic: 协议 Lv.0 · 0 / 20 XP
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。显影联动优先围猎标记体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 咬击 0
          - generic:
            - generic: "2"
            - text: 空协议槽
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
      - status:
        - strong: 进化完成 · 免疫灯塔 Ⅰ · 初始预装
        - generic: 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。已预支首份成长，20 XP 仅结清；下一份草案 55 XP。
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 1 波
            - generic: 已清 0 波
          - generic:
            - generic: "8"
            - generic:
              - text: 敌群剩余
              - generic: 场上 3 · 待入场 5
          - heading "本波编队 · 正面双潮" [level=3]
          - paragraph: 1 按住净化 · 2 清群打断 · Q 召集或指挥小队。
          - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
          - generic:
            - generic: 得分 0
            - generic: 连击 0 · 最高 0
        - region "救援体和组织状态":
          - generic:
            - generic: 救援体耐久
            - generic: 100 / 100
          - generic:
            - generic: 组织完整度
            - generic: 97%
          - paragraph: 感染 0% · 全身稳定 100%
          - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
        - generic:
          - strong: 战斗进化 Lv.0
          - generic:
            - paragraph: 1 · 1 束 × 34伤害 · 贯穿 +0 · 0.18s
            - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
            - paragraph: Space · 冲刺斩未解锁 Q · 免疫小队
            - paragraph: 细胞伤害 ×1 · 寿命 +0s · Q 3s
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"
          - paragraph: △ 你 ＋ 组织 ◇ 阀门 ● 敌群
          - paragraph: 组织在南东侧 · 141m
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { resolve } from 'node:path';
  3   | import { pathToFileURL } from 'node:url';
  4   | import { writeFileSync } from 'node:fs';
  5   | import { readState, aim, chooseDraftInput } from './campaignDriver';
  6   | import { HeldMovement } from './heldMovement';
  7   | import { distance, normalized, wallHit } from '../../src/actors/collision';
  8   | import { activeWorld, type GameState } from '../../src/game/types';
  9   | 
  10  | test.use({ video: 'off', trace: 'off' });
  11  | const entry = pathToFileURL(resolve('dist/index.html')).href;
  12  | 
  13  | test('five natural waves expose support and elite tells, redirect the same squad, and grant milestone reconfiguration', async ({ page, context }, info) => {
  14  |   test.setTimeout(240000); await context.setOffline(true);
  15  |   if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  16  |   const errors: string[] = [], remote: string[] = [], observations: unknown[] = [], accepted: unknown[] = [];
  17  |   const seen = new Set<string>();
  18  |   page.on('pageerror', error => errors.push(error.message));
  19  |   page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  20  |   await page.goto(`${entry}?seed=71`); await page.locator('[data-action="endless-start"]').click();
  21  |   const movement = new HeldMovement(page), deadline = Date.now() + 205000;
  22  |   let state = await readState(page), samples = 0, deployedAt = -100, redirected = false;
  23  |   let initialIds: string[] = [], initialUntil = 0, sawMilestone = false, picked = false;
  24  |   const captured = new Set<string>();
  25  |   try {
  26  |     while (Date.now() < deadline) {
  27  |       state = await readState(page);
  28  |       for (const event of state.events) {
  29  |         const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
  30  |         if (seen.has(key)) continue; seen.add(key);
  31  |         if (['ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED', 'IMMUNE_SQUAD_REDIRECTED', 'ENDLESS_WAVE_CLEARED', 'PLAYER_HURT'].includes(event.type)) accepted.push(event);
  32  |       }
  33  |       if (++samples % 15 === 0) observations.push({ tick: state.tick, elapsed: state.elapsed, wave: state.endless,
  34  |         hp: state.player.hp, tissue: state.tissue.hp, ranks: state.endlessGrowth?.ranks, metrics: state.runMetrics?.summary });
  35  |       expect(state.phase, `Natural input run failed: ${state.result?.reason}`).not.toBe('result');
  36  |       if (state.growth?.draft) {
  37  |         await movement.release(); await page.mouse.up();
  38  |         if (state.growth.draft.source === 'endless') {
  39  |           sawMilestone = true; await page.screenshot({ path: info.outputPath('five-wave-protocol-reconfiguration.png') });
  40  |           observations.push({ milestoneDraft: state.growth.draft, combatDraft: state.endlessGrowth?.draft, tick: state.tick });
  41  |         }
  42  |         await chooseDraftInput(page, ['EXPOSE_TRACE', 'IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
  43  |       }
  44  |       if (state.endlessGrowth?.draft) {
  45  |         await movement.release(); await page.mouse.up();
  46  |         const priority = ['multishot', 'immune', 'scan', 'nova', 'power', 'haste', 'pierce', 'dash', 'vitality'];
  47  |         const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
  48  |         await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); picked = true; continue;
  49  |       }
  50  |       if (state.endless!.clearedWaves >= 5 && sawMilestone) break;
  51  |       if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  52  |       const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player));
  53  |       const special = live.find(target => target.tactic && target.tactic !== 'melee' && !captured.has(target.role === 'elite' ? 'elite' : 'support'));
  54  |       if (special?.attackPlan) {
  55  |         await page.mouse.up(); await movement.release(); await page.keyboard.press('Escape');
  56  |         const paused = await readState(page), kind = special.role === 'elite' ? 'elite' : 'support';
  57  |         expect(paused.phase).toBe('paused'); await page.waitForTimeout(250);
  58  |         expect((await readState(page)).tick).toBe(paused.tick);
  59  |         await page.screenshot({ path: info.outputPath(`${kind}-${special.tactic}-telegraph.png`) });
  60  |         observations.push({ telegraphPause: paused }); captured.add(kind);
  61  |         await page.locator('[data-action="continue"]').click();
  62  |         const dx = special.attackPlan.aim.x - special.x, dy = special.attackPlan.aim.y - special.y;
  63  |         await movement.move(-dy || 1, dx); await page.keyboard.press('Space');
  64  |         await page.waitForTimeout(800); continue;
  65  |       }
  66  |       const visible = live.find(target => {
  67  |         const length = distance(state.player, target), hit = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), length, activeWorld(state));
  68  |         return hit === null || hit >= length - target.radius;
  69  |       });
  70  |       if (visible && deployedAt < 0) {
  71  |         await aim(page, visible); await page.keyboard.press('KeyQ'); deployedAt = state.elapsed;
> 72  |         const deployed = await readState(page); initialIds = deployed.growth!.cells!.map(cell => cell.id); initialUntil = deployed.growth!.beacon!.until;
      |                                                                                                                                                    ^ TypeError: Cannot read properties of null (reading 'until')
  73  |         observations.push({ initialSquad: deployed.growth });
  74  |       } else if (!redirected && state.elapsed - deployedAt > 3.15 && state.growth?.beacon && state.growth.cells?.length) {
  75  |         await aim(page, { x: state.player.x + 220, y: state.player.y - 180 }); await page.keyboard.press('KeyQ');
  76  |         const after = await readState(page);
  77  |         expect(after.events.some(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
  78  |         expect(after.growth!.cells!.map(cell => cell.id)).toEqual(initialIds);
  79  |         expect(after.growth!.beacon!.until).toBe(initialUntil); redirected = true;
  80  |         observations.push({ redirectedSquad: after.growth });
  81  |         await page.screenshot({ path: info.outputPath('same-squad-redirect.png') });
  82  |       } else if (visible && redirected && state.scanReady <= state.elapsed) {
  83  |         await aim(page, visible); await page.keyboard.press('KeyQ');
  84  |       }
  85  |       if (special) { // Allow one naturally spawned support and elite to show their complete public tell.
  86  |         await page.mouse.up(); await movement.release(); await page.waitForTimeout(75); continue;
  87  |       }
  88  |       if (visible) {
  89  |         await aim(page, visible);
  90  |         const clustered = live.filter(target => distance(target, visible) < 110).length;
  91  |         await page.keyboard.press(clustered > 2 && state.cooldowns[2] <= state.elapsed ? 'Digit2' : 'Digit1'); await page.mouse.down();
  92  |         const gap = distance(visible, state.player);
  93  |         await movement.move(gap < 155 ? state.player.x - visible.x : gap > 480 ? visible.x - state.player.x : 0,
  94  |           gap < 155 ? state.player.y - visible.y : gap > 480 ? visible.y - state.player.y : 0);
  95  |       } else {
  96  |         await page.mouse.up(); const target = live[0];
  97  |         await movement.move(target ? target.x - state.player.x : 0, target ? target.y - state.player.y : 0);
  98  |       }
  99  |       await page.waitForTimeout(100);
  100 |     }
  101 |   } finally {
  102 |     await movement.release(); await page.mouse.up();
  103 |     state = await readState(page);
  104 |     writeFileSync(info.outputPath('natural-five-wave-run.json'), JSON.stringify({ scope: 'Offline real DOM input and read-only snapshots; no simulation/profile injection.',
  105 |       redirected, initialIds, sawMilestone, captured: [...captured], picked, observations, accepted, final: state, errors, remote }, null, 2));
  106 |   }
  107 |   expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(5);
  108 |   expect(redirected && picked && sawMilestone).toBe(true); expect([...captured].sort()).toEqual(['elite', 'support']);
  109 |   expect(state.runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
  110 |   expect(errors).toEqual([]); expect(remote).toEqual([]);
  111 |   await page.screenshot({ path: info.outputPath('five-wave-evolved-build.png') });
  112 | });
  113 | 
```