# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hero-idle-production.spec.ts >> new production hero freezes its actual frame on pause and resets its new idle group on retry
- Location: tests\e2e\hero-idle-production.spec.ts:135:1

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /^fantasy\.actor\.hero\.front_right\.idle\.\d{2}$/
Received string:  "fantasy.actor.hero.back_right.idle.00"

Call Log:
- Timeout 8000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "心脏训练场，WASD移动，鼠标瞄准，左键使用工具" [ref=e2]
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
        - generic: TRAINING / 心脏训练场
        - heading "清除感染体训练靶" [level=2]
        - list:
          - listitem:
            - generic: "1"
            - generic: 净化两类靶标 0 / 4
          - listitem:
            - generic: "2"
            - generic: 修复组织至完整
          - listitem:
            - generic: "3"
            - generic: 靠近复测终端，按 E
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
          - paragraph: 训练靶不会攻击 · 自由练习
        - generic:
          - generic:
            - text: 心脏组织
            - generic: 25%
          - paragraph: 使用 3 修复组织节点净化工具不能修复组织
      - generic: 按 Q 扫描 · 按 1 或 2 净化靶标底部的瞄准环
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 牵引裂解" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 牵引裂解
            - text: 聚拢 · 延迟爆发
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描
          - emphasis: 就绪
      - generic: v0.11.0 · 基础训练 / 奇幻生态
      - generic: SEED 71 / 00:08
```

# Test source

```ts
  38  |   });
  39  | }
  40  | async function beginTrace(page: Page, durationMs: number) {
  41  |   await page.evaluate(durationMs => {
  42  |     const buffer = { samples: [] as Sample[], done: false, started: performance.now() };
  43  |     (window as unknown as { __heroProductionTrace: typeof buffer }).__heroProductionTrace = buffer;
  44  |     const observe = (now: number) => {
  45  |       const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics() as unknown as ProductionDiagnostics;
  46  |       const hurt = state.player.hurtUntil > state.elapsed && state.events.some(event => event.type === 'PLAYER_HURT' && Number(event.data.damage) > 0 && event.tick <= state.tick
  47  |         && state.elapsed - event.tick / 60 >= -1e-8 && state.elapsed - event.tick / 60 + 1e-8 < .15);
  48  |       buffer.samples.push({ phase: state.phase, tick: state.tick, elapsed: state.elapsed, moving: state.player.moving,
  49  |         facing: state.player.facing, runId: state.runMetrics?.runId,
  50  |         expectedClip: state.player.dashUntil > state.elapsed ? 'dash' : hurt ? 'hurt' : state.player.moving ? 'walk' : 'idle',
  51  |         expectedDirection: Math.cos(state.player.facing) >= 0 ? Math.sin(state.player.facing) >= 0 ? 'front_right' : 'back_right'
  52  |           : Math.sin(state.player.facing) >= 0 ? 'front_left' : 'back_left',
  53  |         actor: diagnostics.art.actorFrames?.find(actor => actor.actorId === 'player'),
  54  |         sprite: diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player') });
  55  |       if (now - buffer.started < durationMs) requestAnimationFrame(observe); else buffer.done = true;
  56  |     };
  57  |     requestAnimationFrame(observe);
  58  |   }, durationMs);
  59  | }
  60  | async function finishTrace(page: Page): Promise<Sample[]> {
  61  |   await page.waitForFunction(() => (window as unknown as { __heroProductionTrace?: { done: boolean } }).__heroProductionTrace?.done === true);
  62  |   return page.evaluate(() => (window as unknown as { __heroProductionTrace: { samples: Sample[] } }).__heroProductionTrace.samples);
  63  | }
  64  | async function aimQuadrant(page: Page, x: number, y: number) {
  65  |   const target = await page.evaluate(({ x, y }) => {
  66  |     const state = window.__viral.snapshot(); return window.__viral.toScreen({ x: state.player.x + x * 240, y: state.player.y + y * 220 });
  67  |   }, { x, y });
  68  |   await page.mouse.move(target.x, target.y);
  69  |   await expect.poll(async () => (await presentation(page)).expectedDirection).toBe(`${y < 0 ? 'back' : 'front'}_${x < 0 ? 'left' : 'right'}`);
  70  | }
  71  | function verifySamples(samples: Sample[], clip: Clip, authoredDirection: 'front_right' | 'back_right') {
  72  |   const matching = samples.filter(sample => sample.phase === 'playing' && sample.expectedClip === clip);
  73  |   expect(matching.length, `A real ${clip} window must be sampled`).toBeGreaterThanOrEqual(2);
  74  |   const displayed = new Set<string>();
  75  |   for (const sample of matching) {
  76  |     const actor = sample.actor, sprite = sample.sprite;
  77  |     expect(actor, 'Production diagnostics must identify the displayed hero').toBeDefined();
  78  |     expect(actor!.native && actor!.groupReady && actor!.visible && !actor!.fallback).toBe(true);
  79  |     expect(actor!.clip).toBe(clip); expect(actor!.direction).toBe(sample.expectedDirection);
  80  |     expect(actor!.authoredDirection).toBe(authoredDirection);
  81  |     expect(actor!.semanticId).toMatch(new RegExp(`^fantasy\\.actor\\.hero\\.${authoredDirection}\\.${clip}\\.\\d{2}$`));
  82  |     expect(sprite?.frame).toBe(actor!.frame);
  83  |     expect(sprite?.frame).toBe(actor!.semanticId);
  84  |     expect(sprite?.flipX).toBe(sample.expectedDirection.endsWith('_left'));
  85  |     expect(sprite?.articulated, 'New authored frames must be actual sprites, not the old idle Mesh2D gait').toBe(false);
  86  |     expect(actor!.source.path.replaceAll('\\', '/').includes('ViralInvasion_Art_v1/')).toBe(false);
  87  |     displayed.add(sprite!.frame);
  88  |   }
  89  |   expect(displayed.size, `Actual ${authoredDirection}.${clip} native frames must advance`).toBeGreaterThanOrEqual(2);
  90  |   return { clip, authoredDirection, samples: matching.length, actualFrames: [...displayed] };
  91  | }
  92  | 
  93  | test('offline production displays all four new hero clips in both authored views and mirrors them honestly', async ({ page, context }, info) => {
  94  |   test.setTimeout(45_000); await context.setOffline(true);
  95  |   const errors: string[] = [], remote: string[] = [], traces: unknown[] = [], coverage: unknown[] = [];
  96  |   page.on('pageerror', error => errors.push(error.message));
  97  |   page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  98  |   await page.goto(entry); await page.locator('[data-action="start"]').click();
  99  |   await expect.poll(async () => page.evaluate(() => {
  100 |     const diagnostics = window.__viral.diagnostics() as unknown as ProductionDiagnostics;
  101 |     return diagnostics.art.actorContract?.version === 2 && !diagnostics.art.actorContract.preview && !diagnostics.art.actorContract.animationPreview && diagnostics.art.actorContract.ready
  102 |       && diagnostics.art.actorContract.oldSourceIds.length === 0;
  103 |   })).toBe(true);
  104 | 
  105 |   for (const [direction, y] of [['front_right', 1], ['back_right', -1]] as const) {
  106 |     await aimQuadrant(page, 1, y); await beginTrace(page, 1400); const idle = await finishTrace(page);
  107 |     coverage.push(verifySamples(idle, 'idle', direction)); traces.push({ direction, action: 'idle', samples: idle });
  108 |     await beginTrace(page, 1000); await page.keyboard.down(direction === 'front_right' ? 'KeyD' : 'KeyA');
  109 |     const walk = await finishTrace(page); await page.keyboard.up(direction === 'front_right' ? 'KeyD' : 'KeyA');
  110 |     coverage.push(verifySamples(walk, 'walk', direction)); traces.push({ direction, action: 'walk', samples: walk });
  111 |     await aimQuadrant(page, 1, y);
  112 |     await expect.poll(async () => {
  113 |       const state = await page.evaluate(() => window.__viral.snapshot()); return state.player.dashReady <= state.elapsed;
  114 |     }).toBe(true);
  115 |     await beginTrace(page, 500); await page.keyboard.press('Space'); const dash = await finishTrace(page);
  116 |     coverage.push(verifySamples(dash, 'dash', direction)); traces.push({ direction, action: 'dash', samples: dash });
  117 |     await aimQuadrant(page, 1, y); await page.keyboard.press('Escape'); await page.locator('#overlay-host [data-action="help"]').click();
  118 |     await beginTrace(page, 650); await page.locator('[data-action="practice-hit"]').click(); const hurt = await finishTrace(page);
  119 |     coverage.push(verifySamples(hurt, 'hurt', direction)); traces.push({ direction, action: 'hurt', samples: hurt });
  120 |   }
  121 |   for (const y of [1, -1]) {
  122 |     await aimQuadrant(page, -1, y);
  123 |     await expect.poll(async () => {
  124 |       const sample = await presentation(page);
  125 |       return sample.actor?.direction === sample.expectedDirection && sample.sprite?.flipX === true
  126 |         && sample.actor?.authoredDirection === (y < 0 ? 'back_right' : 'front_right');
  127 |     }).toBe(true);
  128 |   }
  129 |   await page.screenshot({ path: info.outputPath('new-hero-production.png') });
  130 |   writeFileSync(info.outputPath('new-hero-production-frames.json'), JSON.stringify({ evidenceLevel: 'natural-dom-input-rAF', entry, coverage, traces, errors, remote,
  131 |     boundary: 'Only idle/walk/hurt/dash are authored body groups. Fire/charge/heal/scan require separate accepted-action/tool-effect evidence in verify-actor-art.mjs.' }, null, 2));
  132 |   expect(errors).toEqual([]); expect(remote).toEqual([]);
  133 | });
  134 | 
  135 | test('new production hero freezes its actual frame on pause and resets its new idle group on retry', async ({ page, context }) => {
  136 |   await context.setOffline(true); await page.goto(entry); await page.locator('[data-action="start"]').click();
  137 |   await aimQuadrant(page, 1, 1);
> 138 |   await expect.poll(async () => (await presentation(page)).actor?.semanticId).toMatch(/^fantasy\.actor\.hero\.front_right\.idle\.\d{2}$/);
      |                                                                               ^ Error: expect(received).toMatch(expected)
  139 |   await page.keyboard.press('Escape'); await expect.poll(async () => (await presentation(page)).phase).toBe('paused');
  140 |   const paused = await presentation(page); await page.waitForTimeout(700); const after = await presentation(page);
  141 |   expect(after.tick).toBe(paused.tick); expect(after.actor?.semanticId).toBe(paused.actor?.semanticId);
  142 |   expect(after.sprite?.frame).toBe(paused.sprite?.frame); expect(after.sprite?.x).toBe(paused.sprite?.x); expect(after.sprite?.y).toBe(paused.sprite?.y);
  143 |   await page.locator('[data-action="retry"]').click();
  144 |   await expect.poll(async () => {
  145 |     const sample=await presentation(page);
  146 |     return sample.phase==='playing'&&sample.tick>=1&&sample.runId!==paused.runId
  147 |       &&sample.actor?.semanticId==='fantasy.actor.hero.front_right.idle.00'&&sample.sprite?.frame===sample.actor.frame;
  148 |   },{intervals:[10,20,30]}).toBe(true);
  149 |   const retried = await presentation(page);
  150 |   expect(retried.phase).toBe('playing'); expect(retried.runId).not.toBe(paused.runId);
  151 |   expect(retried.actor?.clip).toBe('idle'); expect(retried.actor?.semanticId).toBe('fantasy.actor.hero.front_right.idle.00');
  152 |   expect(retried.sprite?.frame).toBe(retried.actor?.frame); expect(retried.actor?.native && retried.actor.groupReady && !retried.actor.fallback).toBe(true);
  153 | });
  154 | 
```