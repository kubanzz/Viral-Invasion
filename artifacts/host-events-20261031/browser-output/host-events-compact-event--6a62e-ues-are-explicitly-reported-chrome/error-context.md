# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: host-events.spec.ts >> compact event card keeps its full description visible and missing alcohol tissues are explicitly reported
- Location: tests\e2e\host-events.spec.ts:90:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 109
Received:    112
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
        - text: ●
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅰ · 建立防线
        - heading "守住这道生命防线" [level=2]
        - status:
          - generic:
            - strong: 先诊断，再根治
            - button "跳过本次提示" [ref=e6] [cursor=pointer]
          - generic: 先 Q 诊断感染源，用 1 / 2 净化它。
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 62%
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 27%
          - paragraph: 净化感染源 / 抢修降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: ≋ 冲流 0.8s
          - generic: E 冲流就绪
      - complementary "器官状态图":
        - generic:
          - text: 器官导航
          - generic: 白点为你 · ＋治疗
        - generic "当前器官小地图：感染源、研究、抢修、出口和两个治疗点，红色加号为已占领"
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
              - generic: 尚未激活
        - paragraph: 第二次变异后，器官通道开放。
      - generic: 感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e7] [cursor=pointer]:
            - generic [ref=e8]: "1"
            - strong [ref=e9]: 精确净化
            - generic [ref=e10]: 单点 · 快速冷却
          - button "2 牵引裂解" [ref=e12] [cursor=pointer]:
            - generic [ref=e13]: "2"
            - strong [ref=e14]: 牵引裂解
            - generic [ref=e15]: 聚拢 · 延迟爆发
          - button "3 组织修复" [ref=e17] [cursor=pointer]:
            - generic [ref=e18]: "3"
            - strong [ref=e19]: 组织修复
            - generic [ref=e20]: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.9.0 · 器官联防 / 微观绘本
      - generic: SEED 41 / 00:02
      - complementary "宿主活动事件":
        - generic:
          - generic: 绿色 · 有利
          - generic: 生效中
        - generic:
          - strong: ☾ 安稳休息
          - generic: 29.8s
        - paragraph: 每秒恢复最大耐久 1%，本次最多 20%；满血不储存。玩家主动组织修复 +25%。战斗与感染继续。
        - generic: 当前器官
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
        - generic:
          - button "R 注射抗体 2" [disabled] [ref=e22]:
            - generic [ref=e23]: R
            - text: 注射抗体
            - generic [ref=e24]: "2"
          - generic: 裂变 · 扣血 1/3 · 强化 8 秒
        - button "当前配装详情" [ref=e25] [cursor=pointer]
```

# Test source

```ts
  3   | import { aim, readState, walk } from './campaignDriver';
  4   | 
  5   | test.use({ video: 'off', trace: 'off' });
  6   | const entry = 'http://127.0.0.1:4173/';
  7   | 
  8   | async function start(page: Page, query: string) {
  9   |   const errors: string[] = [];
  10  |   page.on('pageerror', error => errors.push(error.message));
  11  |   await page.goto(`${entry}?seed=41&${query}`);
  12  |   await page.locator('[data-action="start"]').click();
  13  |   await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  14  |   return errors;
  15  | }
  16  | 
  17  | test('medication card uses a passive side rail, freezes on Escape and restarts cleanly through real input', async ({ page }, info) => {
  18  |   const errors = await start(page, 'hostEvent=MEDICATION');
  19  |   const card = page.locator('#host-event-card');
  20  |   await expect(card).toBeVisible(); await expect(card).toHaveAttribute('data-event', 'MEDICATION');
  21  |   await expect(page.locator('#host-event-category')).toContainText('绿色');
  22  |   await expect(page.locator('#host-event-description')).toContainText('0、8、16');
  23  |   await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase).toBe('active');
  24  |   const layout = await card.evaluate(node => ({ pointerEvents: getComputedStyle(node).pointerEvents,
  25  |     rect: node.getBoundingClientRect().toJSON(), text: node.textContent }));
  26  |   expect(layout.pointerEvents).toBe('none'); expect(layout.rect.width).toBeLessThan(240);
  27  |   await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  28  |   await page.screenshot({ path: info.outputPath('medication-playing.png') });
  29  |   await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  30  |   const paused = await readState(page), countdown = await page.locator('#host-event-time').textContent();
  31  |   await page.waitForTimeout(400);
  32  |   expect((await readState(page)).tick).toBe(paused.tick);
  33  |   expect((await readState(page)).hostEvents).toEqual(paused.hostEvents);
  34  |   expect(await page.locator('#host-event-time').textContent()).toBe(countdown);
  35  |   await page.locator('[data-action="continue"]').click();
  36  |   await expect.poll(async () => (await readState(page)).tick).toBeGreaterThan(paused.tick);
  37  |   await page.keyboard.press('Escape'); await page.locator('[data-action="retry"]').click();
  38  |   const retried = await readState(page);
  39  |   expect(retried.hostEvents!.usedIds).toEqual(['MEDICATION']);
  40  |   expect(retried.hostEvents!.serial).toBe(1);
  41  |   expect(retried.hostEvents!.active?.phase).toBe('warning');
  42  |   expect(errors).toEqual([]);
  43  |   writeFileSync(info.outputPath('medication-evidence.json'), JSON.stringify({ paused, retried, layout, errors }, null, 2));
  44  | });
  45  | 
  46  | test('explicit lung smoke can be cleared with ordinary precision shots and ends when all three targets are destroyed', async ({ page }, info) => {
  47  |   test.setTimeout(60_000);
  48  |   const errors = await start(page, 'hostEvent=SMOKE&hostEventOrgan=lung');
  49  |   await expect(page.locator('#host-event-category')).toContainText('红色');
  50  |   await expect(page.locator('#host-event-phase')).toHaveText('预警');
  51  |   await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase, { timeout: 12_000 }).toBe('active');
  52  |   let state = await readState(page); expect(state.battle!.organId).toBe('lung');
  53  |   const ids = state.hostEvents!.active!.targetIds; expect(ids).toHaveLength(3);
  54  |   const xp = state.growth!.xp, research = state.growth!.research;
  55  |   await page.screenshot({ path: info.outputPath('smoke-three-sources.png') });
  56  |   const shots: unknown[] = [];
  57  |   for (const id of ids) {
  58  |     state = await readState(page); const target = state.targets.find(target => target.id === id)!;
  59  |     await walk(page, target, 95); await aim(page, target); await page.keyboard.press('Digit1');
  60  |     await page.mouse.down();
  61  |     try {
  62  |       await expect.poll(async () => (await readState(page)).targets.find(target => target.id === id)?.hp ?? 0,
  63  |         { timeout: 4000, intervals: [100] }).toBe(0);
  64  |     } finally { await page.mouse.up(); }
  65  |     state = await readState(page); shots.push({ id, state });
  66  |     expect(state.hostEvents?.active?.zones.some(zone => zone.targetId === id) ?? false).toBe(false);
  67  |   }
  68  |   state = await readState(page);
  69  |   expect(state.hostEvents!.active).toBeNull(); expect(state.hostEvents!.sources).toEqual({});
  70  |   expect(state.growth!.xp).toBe(xp); expect(state.growth!.research).toBe(research);
  71  |   expect(state.events.filter(event => event.type === 'HOST_EVENT_TARGET_CLEARED')).toHaveLength(3);
  72  |   expect(state.elapsed).toBeLessThan(43); expect(errors).toEqual([]);
  73  |   await page.screenshot({ path: info.outputPath('smoke-cleared.png') });
  74  |   writeFileSync(info.outputPath('smoke-evidence.json'), JSON.stringify({ scope: 'Explicit URL organ/card fixture; all movement, aim and fire use real mouse/keyboard. Snapshots are read-only.', shots, final: state, errors }, null, 2));
  75  | });
  76  | 
  77  | test('exercise reveals its eight-second warning and applies current heart movement/pulse modifiers', async ({ page }, info) => {
  78  |   const errors = await start(page, 'hostEvent=EXERCISE');
  79  |   await expect(page.locator('#host-event-category')).toContainText('黄色');
  80  |   let state = await readState(page); expect(state.hostEvents!.active!.startsAt - state.hostEvents!.active!.warningStartedAt).toBe(8);
  81  |   await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase, { timeout: 12_000 }).toBe('active');
  82  |   state = await readState(page); expect(Object.keys(state.hostEvents!.sources)).toHaveLength(1);
  83  |   await expect(page.locator('#host-event-description')).toContainText('30%');
  84  |   await expect(page.locator('#host-event-description')).toContainText('15%');
  85  |   await page.screenshot({ path: info.outputPath('exercise-active.png') });
  86  |   expect(errors).toEqual([]);
  87  |   writeFileSync(info.outputPath('exercise-evidence.json'), JSON.stringify({ state, errors }, null, 2));
  88  | });
  89  | 
  90  | test('compact event card keeps its full description visible and missing alcohol tissues are explicitly reported', async ({ page }, info) => {
  91  |   await page.setViewportSize({ width: 480, height: 600 });
  92  |   const errors = await start(page, 'hostEvent=REST');
  93  |   const card = page.locator('#host-event-card'); await expect(card).toBeVisible();
  94  |   await expect.poll(async () => (await readState(page)).hostEvents?.active?.phase).toBe('active');
  95  |   const layout = await card.evaluate(node => {
  96  |     const element = node as HTMLElement, rect = node.getBoundingClientRect();
  97  |     const description = node.querySelector('p')!.getBoundingClientRect();
  98  |     return { rect: rect.toJSON(), description: description.toJSON(), scrollHeight: element.scrollHeight,
  99  |       clientHeight: element.clientHeight, pointerEvents: getComputedStyle(node).pointerEvents, width: innerWidth, height: innerHeight };
  100 |   });
  101 |   expect(layout.rect.left).toBeGreaterThanOrEqual(0); expect(layout.rect.right).toBeLessThanOrEqual(480);
  102 |   expect(layout.rect.bottom).toBeLessThan(520);
> 103 |   expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
      |                               ^ Error: expect(received).toBeLessThanOrEqual(expected)
  104 |   expect(layout.description.bottom).toBeLessThanOrEqual(layout.rect.bottom);
  105 |   expect(layout.pointerEvents).toBe('none');
  106 |   await page.screenshot({ path: info.outputPath('rest-480x600.png') });
  107 |   await page.goto(`${entry}?seed=41&hostEvent=ALCOHOL`); await page.locator('[data-action="start"]').click();
  108 |   await expect(page.locator('#host-event-card')).toHaveAttribute('data-phase', 'disabled');
  109 |   await expect(page.locator('#host-event-description')).toContainText('只有一个可修复组织');
  110 |   expect((await readState(page)).hostEvents!.active).toBeNull(); expect(errors).toEqual([]);
  111 |   await page.screenshot({ path: info.outputPath('alcohol-disabled-480x600.png') });
  112 |   writeFileSync(info.outputPath('compact-evidence.json'), JSON.stringify({ layout, errors }, null, 2));
  113 | });
  114 | 
```