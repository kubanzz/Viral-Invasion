# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: camera-pause-continuity.spec.ts >> moving camera holds its displayed view on pause and resumes smoothly
- Location: tests\e2e\camera-pause-continuity.spec.ts:8:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 5
Received:   5.231106929553704
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
        - generic: ●HEART / 01
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - generic:
        - generic: HEART / 心脏 · Ⅰ · 建立防线
        - heading "守住这道生命防线" [level=2]
        - generic: 感染源 0 / 2 进化精英 0 / 2
        - status:
          - generic:
            - strong: 先诊断，再根治
            - button "跳过本次提示" [ref=e6] [cursor=pointer]
          - generic: 先 Q 诊断感染源，用 1 / 2 净化它。
          - generic: 组织受损时按 3 瞄准十字节点修复。
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
        - generic:
          - generic:
            - generic: 心脏完整度
            - generic: 62%
          - paragraph: 3 · 瞄准十字节点抢修
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 27%
          - paragraph: 净化感染源 / 抢修降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: △ 蓄力 0.6s
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
            - text: 单点 · 快速冷却
          - button "2 牵引裂解" [ref=e11] [cursor=pointer]:
            - generic [ref=e12]: "2"
            - strong [ref=e13]: 牵引裂解
            - text: 聚拢 · 延迟爆发
          - button "3 组织修复" [ref=e15] [cursor=pointer]:
            - generic [ref=e16]: "3"
            - strong [ref=e17]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.9.0 · 器官联防 / 微观绘本
      - generic: SEED 130026 / 00:01
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
        - button "当前配装详情" [ref=e19] [cursor=pointer]
        - paragraph: Q召集1体侦巡 · E研究（诊断后可定向）
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { resolve } from 'node:path';
  3  | import { pathToFileURL } from 'node:url';
  4  | 
  5  | const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  6  | test.use({ video: 'off', trace: 'off' });
  7  | 
  8  | test('moving camera holds its displayed view on pause and resumes smoothly', async ({ page, context }) => {
  9  |   await context.setOffline(true);
  10 |   await page.setViewportSize({ width: 1366, height: 768 });
  11 |   await page.goto(`${entry}?seed=130026`);
  12 |   await page.locator('[data-action="start"]').click();
  13 |   await page.keyboard.down('KeyD');
  14 |   await page.waitForTimeout(700);
  15 |   await page.evaluate(() => {
  16 |     const sample = () => ({ screen: window.__viral.toScreen({ x: 0, y: 0 }), world: window.__viral.toWorld({ x: 683, y: 384 }),
  17 |       player: (window.__viral.diagnostics() as any).phaser.nativeSprites.find((sprite: { id: string }) => sprite.id === 'player') });
  18 |     (window as any).__cameraEventSamples = [];
  19 |     window.addEventListener('keydown', event => {
  20 |       if (event.code !== 'Escape') return;
  21 |       (window as any).__cameraEventSamples.push(sample());
  22 |       if ((window as any).__cameraEventSamples.length === 2) {
  23 |         const frames: { time: number; screen: { x: number; y: number }; phase: string }[] = [];
  24 |         (window as any).__cameraResumeFrames = frames;
  25 |         const collect = (time: number) => {
  26 |           frames.push({ time, screen: window.__viral.toScreen({ x: 0, y: 0 }), phase: window.__viral.snapshot().phase });
  27 |           if (frames.length < 8) requestAnimationFrame(collect);
  28 |         };
  29 |         requestAnimationFrame(collect);
  30 |       }
  31 |     }, { capture: true });
  32 |   });
  33 |   await page.keyboard.press('Escape');
  34 |   await page.keyboard.up('KeyD');
  35 |   await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('paused');
  36 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  37 |   const paused = await page.evaluate(() => ({ before: (window as any).__cameraEventSamples[0],
  38 |     screen: window.__viral.toScreen({ x: 0, y: 0 }), world: window.__viral.toWorld({ x: 683, y: 384 }),
  39 |     player: (window.__viral.diagnostics() as any).phaser.nativeSprites.find((sprite: { id: string }) => sprite.id === 'player') }));
  40 |   expect(paused.screen.x).toBeCloseTo(paused.before.screen.x, 5);
  41 |   expect(paused.screen.y).toBeCloseTo(paused.before.screen.y, 5);
  42 |   expect(paused.world.x).toBeCloseTo(paused.before.world.x, 5);
  43 |   expect(paused.world.y).toBeCloseTo(paused.before.world.y, 5);
  44 |   expect(paused.player).toBeDefined();
  45 |   expect(paused.player.x).toBeCloseTo(paused.before.player.x, 5);
  46 |   expect(paused.player.y).toBeCloseTo(paused.before.player.y, 5);
  47 | 
  48 |   await page.keyboard.press('Escape');
  49 |   await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
  50 |   await expect.poll(() => page.evaluate(() => (window as any).__cameraResumeFrames?.length ?? 0)).toBe(8);
  51 |   const resumed = await page.evaluate(() => ({ before: (window as any).__cameraEventSamples[1], frames: (window as any).__cameraResumeFrames as { time: number; screen: { x: number; y: number }; phase: string }[] }));
  52 |   expect(resumed.frames.every(frame => frame.phase === 'playing')).toBe(true);
  53 |   // Check individual consecutive rendered frames rather than a poll followed by
  54 |   // rAF: the latter can observe several frames of legitimate camera movement.
  55 |   const points = [resumed.before.screen, ...resumed.frames.map(frame => frame.screen)];
  56 |   for (let i = 1; i < points.length; i++) {
> 57 |     expect(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)).toBeLessThan(5);
     |                                                                                      ^ Error: expect(received).toBeLessThan(expected)
  58 |   }
  59 | });
  60 | 
```