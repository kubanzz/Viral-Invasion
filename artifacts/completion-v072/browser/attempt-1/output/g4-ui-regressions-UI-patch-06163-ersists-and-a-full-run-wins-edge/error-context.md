# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g4-ui-regressions.spec.ts >> UI patch: old two-trait archive still gets unacknowledged guide, confirmation persists and a full run wins
- Location: tests\e2e\g4-ui-regressions.spec.ts:116:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "playing"
Received: "paused"
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic "病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互" [ref=f2e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●HEART / 01
        - button "声音开关" [ref=f2e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=f2e4] [cursor=pointer]
        - button "暂停 Esc" [ref=f2e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅲ · 跨器官危机
        - heading "在迁移前作出抉择" [level=2]
        - paragraph: 12 秒迁移抉择：出口 E 追击；隔离闸 E 停留 2 秒封锁；放任会在肺部立源。
        - generic: 感染源 2 / 2 进化精英 1 / 2
        - paragraph: 靠近装置按 E · Q 扫描诊断
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 87%
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
          - text: ≋ 冲流 0.4s
          - generic: E 冲流就绪
      - generic:
        - generic "Q 扫描显形 5 秒；基础射击仍有效；3 修复组织同时清除附近潜伏体": ◌ 潜伏
        - generic "2 范围裂解；群体保持聚集时一并清除": ⋈ 裂殖
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
                - strong: 87%
          - generic:
            - generic: ◖◗
            - generic:
              - generic:
                - generic: 肺部
                - strong: 76%
        - paragraph: 迁移正在发生，先作出抉择。
      - status "迁移抉择":
        - generic:
          - strong: △ 病毒向肺部迁移
          - generic: 12.0s
        - paragraph: 追击进入肺部；封锁使病毒滞留心脏；放任会新增肺部感染源。
        - generic:
          - button "追击 器官出口（见小地图） E · 肺部拦截" [disabled] [ref=f2e6]:
            - strong [ref=f2e7]: 追击
            - generic [ref=f2e8]: 器官出口（见小地图） E · 肺部拦截
          - button "封锁 隔离闸（见小地图） E · 停留 2s" [disabled] [ref=f2e9]:
            - strong [ref=f2e10]: 封锁
            - generic [ref=f2e11]: 隔离闸（见小地图） E · 停留 2s
          - button "放任 肺部新增感染源" [disabled] [ref=f2e12]:
            - strong [ref=f2e13]: 放任
            - generic [ref=f2e14]: 肺部新增感染源
        - paragraph: 封锁耗时 2s、心脏承压；放任使肺部 −10 完整度、感染 +8。
      - generic: 病毒向肺部迁移：12 秒。出口 E 追击；心脏隔离闸 E 保持 2 秒封锁；不响应则肺部建立新源。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [ref=f2e15] [cursor=pointer]:
            - generic [ref=f2e16]: "1"
            - strong [ref=f2e17]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 范围裂解" [pressed] [ref=f2e19] [cursor=pointer]:
            - generic [ref=f2e20]: "2"
            - strong [ref=f2e21]: 范围裂解
            - text: 群体 · 击退打断
          - button "3 组织修复" [ref=f2e23] [cursor=pointer]:
            - generic [ref=f2e24]: "3"
            - strong [ref=f2e25]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 1.5s
      - generic: G4 · 器官联防 / 架空生物幻想
      - generic: SEED 130026 / 00:20
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 样本 7
        - generic: 进化 Lv.2 · 经验 84 / 95
        - generic:
          - generic "靠近节律装置，在冲流相位用基础工具命中。距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。 需要接近装置并配合节律；无时机时不追加。 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。":
            - generic: ◇
            - generic: 共振裂解 Ⅰ
            - generic: 共振 0
          - generic "基础工具清除感染体或感染源。清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。":
            - generic: ⌁
            - generic: 连锁净化 Ⅰ
            - generic: 链 0 · 折 0
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=f2e27] [cursor=pointer]
        - paragraph: 免疫侦巡 1 体 · 2.0s
    - dialog "首次迁移指引" [ref=f2e29]:
      - generic [ref=f2e30]: THE NEXT CHAMBER / 首次迁移
      - heading "病毒要去另一个器官了。" [level=2] [ref=f2e31]
      - paragraph [ref=f2e32]: 倒数已暂停。你可以去器官出口（见小地图）按 E 追击，或在隔离闸（见小地图）按 E 留守 2 秒封锁。放任会让肺部新增感染源，仍可补救。
      - paragraph [ref=f2e33]: 追击后清掉迁移小体，或关闭肺部气道；器官图会显示心脏残留风险，出口可双向返回。此说明之后可在作战手册回看。
      - button "明白了，继续作战" [ref=f2e35] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { resolve } from 'node:path';
  3   | import { pathToFileURL } from 'node:url';
  4   | import { writeFileSync } from 'node:fs';
  5   | import { readFileSync } from 'node:fs';
  6   | import { emptyProfile, PROFILE_STORAGE_KEY } from '../../src/meta/profile';
  7   | import { readState, aim, chooseDraftInput } from './campaignDriver';
  8   | import { fullRun } from './fullRunDriver';
  9   | import { g3Input } from '../helpers/g3Driver';
  10  | import { HeldMovement } from './heldMovement';
  11  | 
  12  | const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  13  | test.use({ video: 'off', trace: 'off' });
  14  | test.beforeEach(async ({ context }) => { await context.setOffline(true); });
  15  | 
  16  | async function tabTo(page: Page, selector: string) {
  17  |   for (let count = 0; count < 30; count++) {
  18  |     await page.keyboard.press('Tab');
  19  |     if (await page.locator(selector).evaluateAll(nodes => nodes.some(node => node === document.activeElement))) return;
  20  |   }
  21  |   throw new Error(`Keyboard focus could not reach ${selector}`);
  22  | }
  23  | 
  24  | // Read-only snapshots plan ordinary key/mouse input. This helper stops before
  25  | // acknowledging the guide so persistence can be checked independently.
  26  | async function reachMigration(page: Page) {
  27  |   const deadline = Date.now() + 65000;
  28  |   let lastScan = -10, lastInteract = -10;
  29  |   const movement = new HeldMovement(page);
  30  |   try {
  31  |   while (Date.now() < deadline) {
  32  |     if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
  33  |       await movement.release(); await page.mouse.up(); return 'guide';
  34  |     }
  35  |     const s = await readState(page);
  36  |     await movement.syncOrgan(s.battle!.organId);
  37  |     if (s.growth?.draft) { await movement.release(); await page.mouse.up(); await chooseDraftInput(page); continue; }
  38  |     if (s.phase === 'playing' && s.campaign!.migration.status === 'warning') {
  39  |       await movement.release(); await page.mouse.up();
  40  |       await page.waitForTimeout(100);
  41  |       return await page.locator('[data-action="close-migration-guide"]').isVisible() ? 'guide' : 'warning';
  42  |     }
> 43  |     expect(s.phase).toBe('playing');
      |                     ^ Error: expect(received).toBe(expected) // Object.is equality
  44  |     const input = g3Input(s, 'ignore');
  45  |     if (s.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
  46  |     await aim(page, input.aim);
  47  |     if (input.fire) await page.mouse.down(); else await page.mouse.up();
  48  |     if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
  49  |     if (input.interact && s.elapsed - lastInteract > .25) { await page.keyboard.press('KeyE'); lastInteract = s.elapsed; }
  50  |     await movement.move(input.moveX, input.moveY);
  51  |     await page.waitForTimeout(85);
  52  |   }
  53  |   } finally { await movement.release(); await page.mouse.up(); }
  54  |   throw new Error('Migration warning did not arrive through public input');
  55  | }
  56  | 
  57  | test('UI patch: Tab reaches archive, arrows scroll it, and paused input does not leak', async ({ page }, info) => {
  58  |   await page.setViewportSize({ width: 850, height: 560 });
  59  |   await page.goto(entry);
  60  |   await tabTo(page, '[data-action="profile"]');
  61  |   await page.keyboard.press('Enter');
  62  |   await expect(page.locator('.profile-dialog')).toBeVisible();
  63  |   await expect(page.locator('.topbar')).toHaveAttribute('inert', '');
  64  |   await tabTo(page, '.profile-scroll');
  65  |   const scroll = page.locator('.profile-scroll');
  66  |   const before = await scroll.evaluate(node => node.scrollTop);
  67  |   await page.keyboard.press('ArrowDown');
  68  |   await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
  69  |   await page.screenshot({ path: info.outputPath('keyboard-archive.png') });
  70  |   await page.keyboard.press('Escape');
  71  |   await page.locator('[data-action="start"]').click();
  72  |   await page.keyboard.press('Escape');
  73  |   const paused = await readState(page);
  74  |   await page.keyboard.press('Digit3');
  75  |   await page.keyboard.down('KeyD'); await page.waitForTimeout(150); await page.keyboard.up('KeyD');
  76  |   await page.keyboard.press('KeyQ');
  77  |   expect((await readState(page)).tick).toBe(paused.tick);
  78  |   await page.locator('[data-action="continue"]').click();
  79  |   await page.waitForTimeout(180);
  80  |   const resumed = await readState(page);
  81  |   expect(resumed.player.x).toBe(paused.player.x); expect(resumed.tool).toBe(paused.tool); expect(resumed.scans).toBe(paused.scans);
  82  |   await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  83  |   expect((await readState(page)).player.x).toBeGreaterThan(resumed.player.x);
  84  |   await page.keyboard.press('Space');
  85  |   await expect.poll(async () => (await readState(page)).dashes).toBeGreaterThan(resumed.dashes);
  86  |   await page.keyboard.press('Escape');
  87  |   await page.locator('#overlay-host [data-action="help"]').click();
  88  |   const helpTick = (await readState(page)).tick;
  89  |   await tabTo(page, '[data-action="close-help"]');
  90  |   await page.keyboard.press('Shift+Tab');
  91  |   expect(await page.locator('.topbar').evaluate(node => node.contains(document.activeElement))).toBe(false);
  92  |   await tabTo(page, '[data-action="close-help"]');
  93  |   await page.keyboard.press('Space');
  94  |   await expect(page.locator('[data-action="close-help"]')).toHaveCount(0);
  95  |   expect((await readState(page)).tick).toBe(helpTick); expect((await readState(page)).phase).toBe('paused');
  96  |   await page.locator('#overlay-host [data-action="history"]').click();
  97  |   await tabTo(page, '[data-action="close-history"]'); await page.keyboard.press('Enter');
  98  |   expect((await readState(page)).phase).toBe('paused');
  99  |   await tabTo(page, '[data-action="continue"]'); await page.keyboard.press('Enter');
  100 |   await expect(page.locator('.topbar')).not.toHaveAttribute('inert', '');
  101 |   expect((await readState(page)).phase).toBe('playing');
  102 | });
  103 | 
  104 | test('UI patch: URL accepts uint32 seed zero and rejects malformed or out of range values', async ({ page }) => {
  105 |   for (const [query, expected] of [['?seed=0', 0], ['?seed=4294967295', 4294967295], ['', 130026], ['?seed=', 130026], ['?seed=-1', 130026], ['?seed=1.5', 130026], ['?seed=4294967296', 130026], ['?seed=NaN', 130026]] as const) {
  106 |     await page.goto(entry + query);
  107 |     expect(await page.evaluate(() => window.__viral.version)).toBe(`${JSON.parse(readFileSync('package.json','utf8')).version}-G4`);
  108 |     expect((await readState(page)).seed).toBe(expected);
  109 |   }
  110 |   await page.goto(entry + '?scenario=training&seed=0');
  111 |   expect((await readState(page)).battle).toBeUndefined(); expect((await readState(page)).seed).toBe(0);
  112 |   await page.goto(entry + '?fixture=G1&trait=MIMIC&seed=0');
  113 |   expect((await readState(page)).battle!.milestone).toBe('G1'); expect((await readState(page)).seed).toBe(0);
  114 | });
  115 | 
  116 | test('UI patch: old two-trait archive still gets unacknowledged guide, confirmation persists and a full run wins', async ({ page }, info) => {
  117 |   test.setTimeout(240000);
  118 |   const errors: string[] = [], remote: string[] = [];
  119 |   page.on('pageerror', error => errors.push(error.message));
  120 |   page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  121 |   const oldProfile = JSON.parse(JSON.stringify(emptyProfile()));
  122 |   delete oldProfile.onboarding;
  123 |   oldProfile.discoveredTraits = ['CARAPACE', 'FISSION'];
  124 |   await page.goto(entry);
  125 |   // This is explicitly an old-storage fixture; combat state is never written.
  126 |   await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: PROFILE_STORAGE_KEY, data: oldProfile });
  127 |   await page.reload(); await page.locator('[data-action="start"]').click();
  128 |   expect(await reachMigration(page)).toBe('guide');
  129 |   const first = await readState(page); expect(first.phase).toBe('paused');
  130 |   await expect(page.locator('.topbar')).toHaveAttribute('inert', '');
  131 |   await page.waitForTimeout(200); expect((await readState(page)).tick).toBe(first.tick);
  132 |   await page.screenshot({ path: info.outputPath('old-profile-first-guide.png') });
  133 |   await page.reload(); await page.locator('[data-action="start"]').click();
  134 |   expect(await reachMigration(page)).toBe('guide');
  135 |   if (info.project.name === 'chrome') await page.keyboard.press('Escape');
  136 |   else await page.locator('[data-action="close-migration-guide"]').click();
  137 |   await expect(page.locator('[data-action="close-migration-guide"]')).toHaveCount(0);
  138 |   expect((await readState(page)).phase).toBe('playing');
  139 |   const confirmed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
  140 |   expect(confirmed.onboarding.migrationGuideAcknowledged).toBe(true);
  141 |   await fullRun(page, 'ignore');
  142 |   const final = await readState(page); expect(final.result?.success).toBe(true);
  143 |   await page.screenshot({ path: info.outputPath('result.png') });
```