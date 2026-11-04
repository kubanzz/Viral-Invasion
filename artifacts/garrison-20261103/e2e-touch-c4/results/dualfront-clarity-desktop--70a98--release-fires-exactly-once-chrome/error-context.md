# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dualfront-clarity.spec.ts >> desktop dual-front clarity >> real desktop E hold previews, pause cancels without ammo, and release fires exactly once
- Location: tests\e2e\dualfront-clarity.spec.ts:177:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 0.1
Received:   17.40087735237822
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
        - generic: ●心脏救援 / 1
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: WASD 移动 · 鼠标瞄准 · 按住左键持续射击。
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
          - generic: 长按蓄能剑气
        - generic:
          - button "1 粒子净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 粒子净化
            - text: 1 弹 · 贯穿 +0
          - button "2 净化能量炮" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 净化能量炮
            - text: 爆心 96 · 按住连发
          - button "3 附近净化或修复心核，不切换武器" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 附近净化
            - text: 靠近按3 · 保留当前武器
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.13.0 · 心脏双线救援 / 奇幻生态
      - generic: SEED 71 / 00:01
      - complementary:
        - generic: 我的进化 · 抗体构筑辅助配装
        - generic:
          - status: 军团 0/2 · 当前 0 体 · Q 部署 / 指挥
          - button "R 注射抗体 2" [disabled] [ref=e18]:
            - generic [ref=e19]: R
            - text: 注射抗体
            - generic [ref=e20]: "2"
          - generic: 裂变 · 扣血 1/3 · 强化 8 秒
        - button "当前配装详情" [ref=e21] [cursor=pointer]
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 1 波
            - generic: 已清 0 波
          - generic:
            - generic: "40"
            - generic: 敌群剩余
          - heading "下一波来袭 · 0.5s" [level=3]
          - paragraph: 将出现：普通病毒
          - generic:
            - generic: 得分 0
            - generic: 连击 0 · 最高 0
        - region "救援体和组织状态":
          - generic:
            - generic: 救援体耐久
            - generic: 100 / 100
        - generic:
          - strong: 战斗进化 Lv.0
          - generic:
            - paragraph: 1束射击 · 贯穿0 · 火力×1
            - paragraph: 清波后获得第一次强化
            - paragraph: 移动、射击，保持与敌群的距离
            - paragraph: 协议与完整数值可查看配装详情
          - paragraph: 首波三选一：扇射、扩大爆破或冲刺挥斩
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：白三角为你，橙三角为组织袭击者，加号为组织和治疗点，红色加号为已占领，菱形为阀门，方框为增援源，圆点为敌群"
          - paragraph: △ 你 ▲ 袭击者 ＋ 治疗 □ 源
          - paragraph: ＋ 生命泉可治疗 · ◇ 前线需先恢复同线生命泉 · □ 感染源
      - region "救援目标与领地状态":
        - generic:
          - generic: 心核 100 / 100
          - generic:
            - generic:
              - generic: 北线
              - generic: 前线待净化
            - generic:
              - generic: 南线
              - generic: 前线待净化
        - strong: 净化北线前沿，准备军团接防
        - paragraph: 军团I阶 · 北南各击退1队，成长至III阶
        - generic: 全域净化 00:00
```

# Test source

```ts
  101 |     if (distance(p, target) <= Math.max(70, stopRadius) && (stopRadius >= 70 || clear(p, target, radius, world))) { end = key; break; }
  102 |     const [x, y] = key.split(',').map(Number);
  103 |     for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
  104 |       if (!dx && !dy) continue;
  105 |       const next = `${x + dx},${y + dy}`, q = points.get(next);
  106 |       if (!q || visited.has(next) || !clear(p, q, radius, world)) continue;
  107 |       const nextCost = cost.get(key)! + distance(p, q);
  108 |       if (nextCost >= (cost.get(next) ?? Infinity)) continue;
  109 |       cost.set(next, nextCost); previous.set(next, key); open.push(next);
  110 |     }
  111 |   }
  112 |   if (!end) throw Error('Actual collision geometry has no route to the requested interaction range');
  113 |   const result = [points.get(end)!]; while (end !== start) { end = previous.get(end)!; result.unshift(points.get(end)!); }
  114 |   if (stopRadius < 70) result.push(target); return result;
  115 | }
  116 | class Keys {
  117 |   private held = new Set<string>();
  118 |   constructor(private page: Page) {}
  119 |   async move(dx: number, dy: number) {
  120 |     const length = Math.hypot(dx, dy) || 1;
  121 |     const next = [Math.abs(dx / length) > .38 ? dx > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(dy / length) > .38 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
  122 |     for (const key of this.held) if (!next.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
  123 |     for (const key of next) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  124 |   }
  125 |   async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
  126 | }
  127 | async function navigate(page: Page, target: Vec, range: number, move: (dx: number, dy: number) => Promise<void>, release: () => Promise<void>) {
  128 |   const trail: { tick: number; elapsed: number; player: Vec }[] = [], deadline = Date.now() + 20_000;
  129 |   let waypoints = plan(await snapshot(page), target, range);
  130 |   try {
  131 |     while (Date.now() < deadline) {
  132 |       const s = await snapshot(page); expect(s.phase, 'Natural navigation must not silently skip a pause, death or choice').toBe('playing');
  133 |       trail.push({ tick: s.tick, elapsed: s.elapsed, player: { x: s.player.x, y: s.player.y } });
  134 |       if (distance(s.player, target) <= range) return trail;
  135 |       while (waypoints.length > 1 && distance(s.player, waypoints[0]) < 22) waypoints.shift();
  136 |       const next = waypoints[0] ?? target; await move(next.x - s.player.x, next.y - s.player.y); await page.waitForTimeout(80);
  137 |     }
  138 |     throw Error(`Natural input navigation timed out at ${JSON.stringify((await snapshot(page)).player)}`);
  139 |   } finally { await release(); }
  140 | }
  141 | async function farAim(page: Page, s: GameState) {
  142 |   const aim = await page.evaluate(({ player, front }) => {
  143 |     const candidates = [{ x: player.x + 360, y: player.y }, { x: player.x - 360, y: player.y }, { x: player.x, y: player.y + 320 }];
  144 |     const point = candidates.map(world => ({ world, screen: window.__viral.toScreen(world) })).find(({ world, screen }) =>
  145 |       Math.hypot(world.x - front.x, world.y - front.y) > 230 && screen.x > 280 && screen.x < innerWidth - 250 && screen.y > 150 && screen.y < innerHeight - 160);
  146 |     if (!point) throw Error('No visible, collision-independent far reticle point for this actual camera'); return point;
  147 |   }, { player: s.player, front: north(s) });
  148 |   await page.mouse.move(aim.screen.x, aim.screen.y); return aim;
  149 | }
  150 | function realPauseReason(s: GameState): 'inactive' | 'healing-required' | 'out-of-range' | 'invader' | 'hurt' | undefined {
  151 |   const front = north(s), healing = s.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
  152 |   if (s.phase !== 'playing' || s.player.hp <= 0) return 'inactive';
  153 |   if (healing.owner !== 'healthy') return 'healing-required';
  154 |   if (distance(s.player, front) > 150 + 1e-7) return 'out-of-range';
  155 |   if (s.targets.some(t => t.hp > 0 && ['virus', 'elite'].includes(t.role ?? '') && t.territoryTask?.kind === 'invade'
  156 |     && (!t.territorySourceId || t.territorySourceId === 'source-west') && distance(t, front) <= 120 + 1e-7)) return 'invader';
  157 |   if (s.territory!.purificationInterruptedUntil > s.elapsed + 1e-7) return 'hurt';
  158 | }
  159 | async function assertPauseCopy(page: Page, s: GameState) {
  160 |   const reason = realPauseReason(s); expect(reason, 'A paused progress assertion must have a real rule cause').toBeDefined();
  161 |   const text = { inactive: '战斗已暂停', 'healing-required': '先夺回对应生命泉', 'out-of-range': '离开范围', invader: '清除侵染者继续', hurt: '躲开攻击后继续' }[reason!];
  162 |   await expect(page.locator('#territory-detail')).toContainText(text); return reason;
  163 | }
  164 | 
  165 | test.use({ video: 'off', trace: 'off' });
  166 | test.afterEach(async ({ page }, info) => {
  167 |   if (info.status === info.expectedStatus || page.isClosed()) return;
  168 |   const observed = await snapshot(page).catch(() => null);
  169 |   const path = evidencePath(info, 'failure-observation.json');
  170 |   writeFileSync(path, JSON.stringify({ entry: entry.href, status: info.status, expectedStatus: info.expectedStatus,
  171 |     method: 'Failure observation only; no retries, state repair or skipped blocker.',
  172 |     observed, actualNorthPauseReason: observed?.territory ? realPauseReason(observed) : null }, null, 2));
  173 |   await info.attach('failure-observation', { path, contentType: 'application/json' });
  174 | });
  175 | test.describe('desktop dual-front clarity', () => {
  176 |   test.use({ viewport: { width: 1366, height: 768 } });
  177 |   test('real desktop E hold previews, pause cancels without ammo, and release fires exactly once', async ({ page }, info) => {
  178 |     const opened = await open(page, info), keys = new Keys(page), origin = { x: 1200, y: 600 };
  179 |     const trail = await navigate(page, origin, 35, (x,y) => keys.move(x,y), () => keys.release());
  180 |     const target = { x: 1700, y: 600 }, aim = await page.evaluate(p => window.__viral.toScreen(p), target);
  181 |     await page.mouse.move(aim.x, aim.y); await page.mouse.down();
  182 |     try {
  183 |       await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
  184 |       const before = await snapshot(page), serial = before.territory!.cannon?.serial ?? 0;
  185 |       await page.keyboard.down('KeyE');
  186 |       await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as { touch: { preview?: { kind: string } } }).touch.preview?.kind)).toBe('cannon');
  187 |       // Pause is a real input barrier: it clears held E without firing or
  188 |       // consuming a shell. The browser key must release before a new action.
  189 |       await page.keyboard.press('Escape'); await page.keyboard.up('KeyE'); await page.mouse.up();
  190 |       await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  191 |       const canceled = await snapshot(page); expect(canceled.territory!.cannon?.serial ?? 0).toBe(serial);
  192 |       expect(canceled.events.some(event => event.tick > before.tick && event.type === 'TERRITORY_CANNON_FIRED')).toBe(false);
  193 |       await page.locator('[data-action="continue"]').click();
  194 |       await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  195 |       const aimed = await page.evaluate(p => window.__viral.toScreen(p), target); await page.mouse.move(aimed.x, aimed.y);
  196 |       await page.mouse.down(); await page.keyboard.down('KeyE');
  197 |       const preview = await page.evaluate(() => (window.__viral.diagnostics() as unknown as { touch: { preview?: { kind: string; aim: Vec } } }).touch.preview);
  198 |       expect(preview?.kind).toBe('cannon'); await page.keyboard.up('KeyE');
  199 |       await expect.poll(async () => (await snapshot(page)).territory!.cannon?.serial ?? 0).toBe(serial + 1);
  200 |       const after = await snapshot(page), receipt = after.events.filter(event => event.tick > canceled.tick && event.type === 'TERRITORY_CANNON_FIRED');
> 201 |       expect(receipt).toHaveLength(1); expect(distance({ x: Number(receipt[0].data.x), y: Number(receipt[0].data.y) }, preview!.aim)).toBeLessThan(.1);
      |                                                                                                                                       ^ Error: expect(received).toBeLessThan(expected)
  202 |       expect(after.tool).toBe(before.tool); expect(after.shots).toBeGreaterThan(before.shots);
  203 |       await finish(page, opened, { trail, before, canceled, preview, after, cancellation: 'Real Escape pause cleared held E; no shell consumed.' });
  204 |     } finally { await page.mouse.up(); await page.keyboard.up('KeyE'); await keys.release(); }
  205 |   });
  206 | 
  207 |   test('public 0.13 entry exposes seven nodes and only one core/two lanes/one goal HUD', async ({ page }, info) => {
  208 |     const opened = await open(page, info);
  209 |     await expect(page.locator('#territory-core')).toBeVisible(); await expect(page.locator('#territory-regions [data-line]')).toHaveCount(2);
  210 |     await expect(page.locator('#territory-line-north > b')).toHaveText('北线'); await expect(page.locator('#territory-line-south > b')).toHaveText('南线');
  211 |     await expect(page.locator('#territory-objective')).toHaveCount(1); await expect(page.locator('#territory-objective')).toContainText('净化');
  212 |     await expect(page.locator('#territory-regions [data-region]')).toHaveCount(0);
  213 |     await expect(page.locator('#endless-spawn-plan')).toBeHidden(); await expect(page.locator('#endless-spawn-plan')).toHaveText('');
  214 |     for (const copy of await page.locator('.endless-vitals .endless-core-copy').all()) await expect(copy).toBeHidden();
  215 |     await expect(page.locator('#endless-hp')).toBeVisible(); await expect(page.locator('#endless-ability-0')).toBeVisible();
  216 |     await expect(page.locator('#territory-regions [data-attacked="true"]')).toHaveCount(0);
  217 |     // Let the real first squad enter its four-second warning naturally. Read
  218 |     // its schedule and the visible lane at the same point; never inject a queue.
  219 |     await expect(page.locator('#territory-line-north')).toContainText(/进攻准备 \d+\.\ds/, { timeout: 8_000 });
  220 |     const incoming = await page.evaluate(() => {
  221 |       const state = window.__viral.snapshot(), line = document.querySelector<HTMLElement>('#territory-line-north')!;
  222 |       return { elapsed: state.elapsed, phaseStartedAt: state.endless!.phaseStartedAt,
  223 |         squad: state.endless!.territoryTasks!.squads.find(squad => squad.laneId === 'north' && squad.status === 'warning'),
  224 |         latestDeparture: Math.max(-Infinity, ...state.endless!.territoryTasks!.squads.map(squad => squad.bornAt ?? -Infinity)),
  225 |         line: line.innerText, attacked: line.dataset.attacked, detail: document.querySelector('#territory-detail')!.textContent };
  226 |     });
  227 |     expect(incoming.squad).toBeDefined(); expect(incoming.squad!.blocked).toBeUndefined(); expect(incoming.attacked).toBe('false');
  228 |     expect(incoming.line).not.toMatch(/受袭|失守|敌群集结/);
  229 |     expect(incoming.detail).not.toMatch(/受袭|秒失守|区域净化|净化\s*0%/);
  230 |     const remaining = Math.max(0, Math.max(incoming.phaseStartedAt + incoming.squad!.departureOffset,
  231 |       incoming.squad!.warnedAt! + 4, incoming.latestDeparture + 10) - incoming.elapsed);
  232 |     const shown = Number(incoming.line.match(/进攻准备 (\d+\.\d)s/)?.[1]);
  233 |     expect(Number.isFinite(shown)).toBe(true); expect(Math.abs(shown - remaining)).toBeLessThanOrEqual(.2);
  234 |     await finish(page, opened, { hud: await page.locator('#territory-hud').innerText(), incoming, independentlyExpectedSeconds: remaining });
  235 |   });
  236 | 
  237 |   test('real WASD reaches a front and distant reticle plus held cannon survive one-key purification', async ({ page }, info) => {
  238 |     const opened = await open(page, info), keys = new Keys(page), target = north(opened.initial);
  239 |     const trail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
  240 |     await page.keyboard.press('Digit2'); await expect.poll(async () => (await snapshot(page)).tool).toBe(2);
  241 |     const aim = await farAim(page, await snapshot(page)); await page.mouse.down();
  242 |     try {
  243 |       await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
  244 |       const before = await snapshot(page); await page.keyboard.press('Digit3');
  245 |       await expect.poll(async () => (await snapshot(page)).territory?.purification?.nodeId).toBe('front-north');
  246 |       const accepted = await snapshot(page); expect(accepted.tool).toBe(2);
  247 |       await expect(page.locator('#territory-objective')).toHaveText(`${realPauseReason(accepted) ? '恢复' : '保护'}${north(accepted).name}净化`);
  248 |       expect(distance(accepted.battle!.lastAim, north(accepted))).toBeGreaterThan(230);
  249 |       expect(accepted.events.some(e => e.type === 'TERRITORY_PURIFICATION_STARTED' && e.data.nodeId === 'front-north')).toBe(true);
  250 |       await expect.poll(async () => (await snapshot(page)).shots, { timeout: 4_000 }).toBeGreaterThan(before.shots);
  251 |       expect((await snapshot(page)).tool).toBe(2);
  252 |       await finish(page, opened, { trail, aim, before, accepted, heldFireAfter: await snapshot(page) });
  253 |     } finally { await page.mouse.up(); await keys.release(); }
  254 |   });
  255 | 
  256 |   test('leaving the real 150 range pauses accepted progress and returning resumes or exposes the actual blocker', async ({ page }, info) => {
  257 |     const opened = await open(page, info), keys = new Keys(page), target = north(opened.initial);
  258 |     const trail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
  259 |     const aim = await farAim(page, await snapshot(page)); await page.keyboard.press('Digit1'); await page.keyboard.press('Digit3');
  260 |     await expect.poll(async () => (await snapshot(page)).territory?.purification?.nodeId).toBe('front-north');
  261 |     await expect.poll(async () => north(await snapshot(page)).purificationProgress).toBeGreaterThan(0);
  262 |     const started = await snapshot(page); expect(started.tool).toBe(1);
  263 |     const outside = [...trail].reverse().find(sample => distance(sample.player, target) > 195 && distance(sample.player, target) < 330)?.player;
  264 |     expect(outside, 'A real, previously walked outside point must exist').toBeDefined();
  265 |     const exitTrail = await navigate(page, outside!, 18, (x, y) => keys.move(x, y), () => keys.release());
  266 |     const paused = await snapshot(page); expect(distance(paused.player, target)).toBeGreaterThan(150); expect(north(paused).owner).toBe('infected');
  267 |     await expect(page.locator('#territory-objective')).toHaveText(`恢复${north(paused).name}净化`);
  268 |     const reason = await assertPauseCopy(page, paused); await page.waitForTimeout(180); const held = await snapshot(page);
  269 |     expect(north(held).purificationProgress).toBeCloseTo(north(paused).purificationProgress, 6);
  270 |     const returnTrail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
  271 |     const returned = await snapshot(page), actualBlocker = realPauseReason(returned);
  272 |     await expect(page.locator('#territory-objective')).toHaveText(`${actualBlocker ? '恢复' : '保护'}${north(returned).name}净化`);
  273 |     if (actualBlocker) {
  274 |       await assertPauseCopy(page, returned);
  275 |       // No skip: verify the actual blocker holds progress, then use real fire
  276 |       // to remove nearby invaders or fail with this observed cause attached.
  277 |       if (actualBlocker !== 'invader' && actualBlocker !== 'hurt') throw Error(`Natural return has unresolved ${actualBlocker}; progress cannot be called resumed`);
  278 |       const invader = returned.targets.find(t => t.hp > 0 && t.territoryTask?.kind === 'invade' && distance(t, target) <= 120)
  279 |         ?? returned.targets.filter(t => t.hp > 0 && t.role === 'virus').sort((a,b) => distance(a,returned.player)-distance(b,returned.player))[0];
  280 |       if (invader) { const screen = await page.evaluate(p => window.__viral.toScreen(p), invader); await page.mouse.move(screen.x, screen.y); }
  281 |       await page.mouse.down();
  282 |       try { await expect.poll(async () => north(await snapshot(page)).owner === 'healthy' || north(await snapshot(page)).purificationProgress > north(returned).purificationProgress, { timeout: 6_000 }).toBe(true); }
  283 |       finally { await page.mouse.up(); }
  284 |     } else await expect.poll(async () => north(await snapshot(page)).owner === 'healthy' || north(await snapshot(page)).purificationProgress > north(returned).purificationProgress).toBe(true);
  285 |     expect((await snapshot(page)).tool).toBe(1);
  286 |     await finish(page, opened, { trail, aim, started, exitTrail, paused, pausedReason: reason, held, returnTrail, returned, actualBlocker });
  287 |   });
  288 | });
  289 | 
  290 | class Fingers {
  291 |   private points = new Map<number, Vec>();
  292 |   constructor(private cdp: CDPSession) {}
  293 |   async down(id: number, p: Vec) { this.points.set(id, p); await this.send('touchStart', [...this.points]); }
  294 |   async move(id: number, p: Vec) { this.points.set(id, p); await this.send('touchMove', [...this.points]); }
  295 |   async up(id: number) { const p = this.points.get(id); this.points.delete(id); if (p) await this.send('touchEnd', [[id, p]]); }
  296 |   async release() { if (this.points.size) { this.points.clear(); await this.send('touchEnd', []); } }
  297 |   private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
  298 |     await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 3, radiusY: 3, force: 1 })) });
  299 |   }
  300 | }
  301 | async function center(page: Page, selector: string) { const b = await page.locator(selector).boundingBox(); if (!b) throw Error(`Missing ${selector}`); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
```