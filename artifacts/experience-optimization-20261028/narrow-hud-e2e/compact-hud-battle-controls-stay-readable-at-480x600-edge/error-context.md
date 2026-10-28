# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: compact-hud.spec.ts >> battle controls stay readable at 480x600
- Location: tests\e2e\compact-hud.spec.ts:8:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
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
        - generic:
          - generic:
            - text: 感染负荷
            - generic: 27%
          - paragraph: 净化感染源 / 抢修降低压力
          - generic:
            - text: 全身稳定
            - generic: 100%
        - generic:
          - text: △ 蓄力 1.8s
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
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - generic [ref=e9]: 单点 · 快速冷却
          - button "2 牵引裂解" [ref=e11] [cursor=pointer]:
            - generic [ref=e12]: "2"
            - strong [ref=e13]: 牵引裂解
            - generic [ref=e14]: 聚拢 · 延迟爆发
          - button "3 组织修复" [ref=e16] [cursor=pointer]:
            - generic [ref=e17]: "3"
            - strong [ref=e18]: 组织修复
            - generic [ref=e19]: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.9.0 · 器官联防 / 微观绘本
      - generic: SEED 130026 / 00:00
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
        - button "当前配装详情" [ref=e21] [cursor=pointer]
    - dialog "战斗已暂停" [ref=e23]:
      - generic [ref=e24]: VIRAL INVASION / 病毒入侵
      - heading "让心跳，等你片刻。" [level=2] [ref=e25]
      - paragraph [ref=e26]: 战斗、器官气流、传播和迁移倒数都已暂停。
      - generic [ref=e27]:
        - generic [ref=e28]:
          - generic [ref=e29]: ♥
          - strong [ref=e30]: 心脏 62%
          - generic [ref=e31]: 完整度达标
        - generic [ref=e32]:
          - generic [ref=e33]: ◖◗
          - strong [ref=e34]: 肺部 76%
          - generic [ref=e35]: 未激活，不计入复测
      - generic [ref=e36]: SEED 130026 · 00:00 · 当前心脏
      - generic [ref=e37]:
        - button "继续战斗" [ref=e38] [cursor=pointer]
        - button "同种子重试" [ref=e39] [cursor=pointer]
        - button "战术记录" [ref=e40] [cursor=pointer]
        - button "作战手册" [ref=e41] [cursor=pointer]
        - button "返回主菜单" [ref=e42] [cursor=pointer]
        - button "当前配装详情" [ref=e43] [cursor=pointer]
      - generic [ref=e44]:
        - button "特效：标准" [ref=e45] [cursor=pointer]
        - button "声音 开" [ref=e46] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { resolve } from 'node:path';
  3  | import { pathToFileURL } from 'node:url';
  4  | 
  5  | const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  6  | 
  7  | for (const size of [{ width: 360, height: 640 }, { width: 480, height: 600 }, { width: 684, height: 880 }, { width: 684, height: 600 }, { width: 1280, height: 720 }]) {
  8  |   test(`battle controls stay readable at ${size.width}x${size.height}`, async ({ page, context }) => {
  9  |     await page.setViewportSize(size);
  10 |     await context.setOffline(true);
  11 |     await page.goto(`${entry}?seed=130026`);
  12 |     await page.locator('[data-action="start"]').click();
  13 |     const selectors = ['.dock-wrap', '.growth-panel', '.organ-overview', '.message'];
  14 |     const boxes = await Promise.all(selectors.map(async selector => {
  15 |       const item = page.locator(selector);
  16 |       await expect(item).toBeVisible();
  17 |       return item.boundingBox();
  18 |     }));
  19 |     for (const box of boxes) {
  20 |       expect(box).not.toBeNull();
  21 |       expect(box!.x).toBeGreaterThanOrEqual(0);
  22 |       expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  23 |       expect(box!.y).toBeGreaterThanOrEqual(0);
  24 |       expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  25 |     }
  26 |     const overlap = (a: NonNullable<typeof boxes[number]>, b: NonNullable<typeof boxes[number]>) =>
  27 |       a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  28 |     if (size.width <= 800) {
  29 |       for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
  30 |     }
  31 |     for (const tool of [1, 2, 3]) {
  32 |       await expect(page.locator(`[data-action="tool-${tool}"]`)).toBeVisible();
  33 |       await expect(page.locator(`[data-action="tool-${tool}"] small`)).toBeVisible();
  34 |       const textFits = await page.locator(`[data-action="tool-${tool}"] small`).evaluate(node => node.scrollWidth <= node.clientWidth + 1);
  35 |       expect(textFits).toBe(true);
  36 |     }
  37 |     await expect(page.locator('#crisis-label')).toBeVisible();
  38 |     if (size.width <= 520) {
  39 |       const upper = await Promise.all(['.topbar', '.battle-objective', '.battle-telemetry'].map(selector => page.locator(selector).boundingBox()));
  40 |       expect(overlap(upper[0]!, upper[1]!)).toBe(false);
  41 |       expect(overlap(upper[0]!, upper[2]!)).toBe(false);
  42 |       expect(overlap(upper[1]!, upper[2]!)).toBe(false);
  43 |       // Exercise the longest actual crisis wording as a derived layout case;
  44 |       // it does not claim the game naturally reached a fatal crisis.
  45 |       await page.keyboard.press('Escape');
  46 |       await page.locator('#crisis-label').evaluate(node => { node.textContent = '⚠ 感染失控：3.0 秒 · 立即净化或抢修'; (node as HTMLElement).dataset.urgency = 'fatal'; });
  47 |       const crisisBox = await page.locator('#crisis-label').boundingBox();
  48 |       const telemetryBox = await page.locator('.battle-telemetry').boundingBox();
  49 |       const mapBox = await page.locator('.organ-overview').boundingBox();
  50 |       expect(crisisBox!.x).toBeGreaterThanOrEqual(0);
  51 |       expect(crisisBox!.x + crisisBox!.width).toBeLessThanOrEqual(size.width);
> 52 |       expect(overlap(telemetryBox!, mapBox!)).toBe(false);
     |                                               ^ Error: expect(received).toBe(expected) // Object.is equality
  53 |     }
  54 |   });
  55 | }
  56 | 
```