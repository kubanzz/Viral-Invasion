# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: duet-v087.spec.ts >> naturally reach the twentieth warning and observe one unmodified elite alternate its real committed tactics
- Location: tests\e2e\duet-v087.spec.ts:44:1

# Error details

```
Error: 核心组织失守：潜伏体优先侵蚀组织，用 Q 定位、2 清群、3 抢修。

expect(received).not.toBe(expected) // Object.is equality

Expected: not "result"
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
        - generic: ●连续挑战 / 20
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前
    - dialog "连续挑战结算" [ref=e6]:
      - generic [ref=e7]: ENDLESS / RUN ENDED
      - heading "这一轮结束，再换一种构筑。" [level=2] [ref=e8]
      - paragraph [ref=e9]: 核心组织失守：潜伏体优先侵蚀组织，用 Q 定位、2 清群、3 抢修。
      - generic [ref=e10]:
        - generic [ref=e11]:
          - strong [ref=e12]: "19"
          - text: 完全清除波次
        - generic [ref=e13]:
          - strong [ref=e14]: "22406"
          - text: 本局得分
        - generic [ref=e15]:
          - strong [ref=e16]: "66"
          - text: 最高连击
      - paragraph [ref=e17]: 到达第 20 波 · 净化 710 体 · 04:59 · SEED 71
      - paragraph [ref=e18]: 个人纪录 · 通关 19 波 / 22406 分 / 连击 66 · 已结算 1 局
      - generic [ref=e19]:
        - heading "本局战斗进化 · Lv.19" [level=3] [ref=e20]
        - paragraph [ref=e21]: 净化突破 7阶 · 扇形抗体 2阶 · 贯穿净化 3阶 · 裂解新星 2阶 · 生命扩容 3阶 · 急速净化 1阶 · 免疫军团 1阶
        - generic [ref=e22]:
          - term [ref=e23]: 精确净化
          - definition [ref=e24]: 5束 × 76.8伤害 · 每束额外贯穿3体 · 间隔0.167s
          - term [ref=e25]: 范围裂解
          - definition [ref=e26]: 半径122 · 191伤害 · 冷却1s
          - term [ref=e27]: 冲刺 / Q爆发
          - definition [ref=e28]: 0 / 0伤害（0表示未解锁）
          - term [ref=e29]: 免疫与耐久
          - definition [ref=e30]: 细胞伤害×2.71 · 寿命+1.25s · 小队冷却×0.87 · Q 2.68s · 最大耐久160
        - paragraph [ref=e31]: 最近获得 · 生命扩容：最大耐久 140 → 160；本次补给按新的耐久上限结算。
      - status [ref=e32]: 连续挑战战绩已独立保存到此浏览器；清理浏览器数据可能丢失记录。
      - generic [ref=e33]:
        - button "同种子再战" [ref=e34] [cursor=pointer]
        - button "换个种子再战" [ref=e35] [cursor=pointer]
        - button "主菜单" [ref=e36] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { resolve } from 'node:path';
  3   | import { pathToFileURL } from 'node:url';
  4   | import { writeFileSync } from 'node:fs';
  5   | import { distance, normalized, wallHit } from '../../src/actors/collision';
  6   | import { activeWorld, type GameState, type GameEvent, type Vec } from '../../src/game/types';
  7   | import { enemyAttackHits, segmentDistance } from '../../src/game/enemyTactics';
  8   | import { TRAITS } from '../../src/game/battleConfig';
  9   | import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
  10  | import { waypoint } from '../helpers/g3Driver';
  11  | import { readState, aim } from './campaignDriver';
  12  | import { HeldMovement } from './heldMovement';
  13  | 
  14  | function danger(s: GameState, p: Vec): boolean {
  15  |   const world = activeWorld(s);
  16  |   return s.targets.some(t => t.hp > 0 && (t.attackPlan ? t.attackPlan.kind === 'crystal-charge' && t.attackPlan.chargeEnd
  17  |     ? segmentDistance(p, t.attackPlan.origin, t.attackPlan.chargeEnd) <= t.attackPlan.radius + s.player.radius + 20
  18  |     : enemyAttackHits(t.attackPlan, p, s.player.radius + 20, world)
  19  |     : t.charge ? segmentDistance(p, t, t.charge.to) <= t.charge.radius + s.player.radius + 20
  20  |       : t.attackAt !== undefined && t.attackTarget === 'player' && !!t.attackAim && distance(p, t.attackAim) <= (t.attackRadius ?? 58) + s.player.radius + 20));
  21  | }
  22  | function motion(s: GameState, destination: Vec) {
  23  |   if (danger(s, s.player)) {
  24  |     const safe = Array.from({ length: 16 }, (_, i) => ({ x: s.player.x + Math.cos(i * Math.PI / 8) * 170,
  25  |       y: s.player.y + Math.sin(i * Math.PI / 8) * 170 })).find(p => !danger(s, p));
  26  |     if (safe) destination = safe;
  27  |   }
  28  |   const next = waypoint(s, destination);
  29  |   return distance(s.player, destination) > 10 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  30  | }
  31  | function warm(s: GameState) {
  32  |   const world = activeWorld(s), live = s.targets.filter(t => t.hp > 0);
  33  |   const visible = (t: typeof live[number]) => { const gap = distance(s.player, t), hit = wallHit(s.player, normalized(t.x - s.player.x, t.y - s.player.y), gap, world); return hit === null || hit >= gap - t.radius; };
  34  |   const target = live.slice().sort((a, b) => Number(b.tacticPosture === 'standoff') - Number(a.tacticPosture === 'standoff') || distance(s.player, a) - distance(s.player, b)).find(visible) ?? live[0];
  35  |   let destination: Vec = { ...s.player };
  36  |   if (target && (!visible(target) || distance(s.player, target) > 420)) {
  37  |     const back = normalized(s.player.x - target.x, s.player.y - target.y);
  38  |     destination = visible(target) ? { x: target.x + back.x * 420, y: target.y + back.y * 420 } : target;
  39  |   }
  40  |   return { target, move: motion(s, destination) };
  41  | }
  42  | 
  43  | test.use({ video: 'off', trace: 'off' });
  44  | test('naturally reach the twentieth warning and observe one unmodified elite alternate its real committed tactics', async ({ page, context }, info) => {
  45  |   test.setTimeout(610000); await context.setOffline(true);
  46  |   const viewport = info.project.name === 'edge' ? { width: 1100, height: 560 } : { width: 1366, height: 768 }; await page.setViewportSize(viewport);
  47  |   const errors: string[] = [], remote: string[] = [], events: GameEvent[] = [], observations: unknown[] = [], gaps: unknown[] = [];
  48  |   const capturedTactics = new Set<string>();
  49  |   let previous: string[] = [], warningChecked = false, eliteId = '', lastWave = 0, complete = false, observationBegan = 0;
  50  |   page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  51  |   const collect = (s: GameState) => {
  52  |     const keys = s.events.map(e => JSON.stringify(e)); let overlap = Math.min(previous.length, keys.length);
  53  |     while (overlap && !previous.slice(-overlap).every((key, i) => key === keys[i])) overlap--;
  54  |     if (previous.length && !overlap) gaps.push({ tick: s.tick, last: previous.at(-1), first: keys[0] });
  55  |     events.push(...s.events.slice(overlap)); previous = keys;
  56  |   };
  57  |   await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`); await page.locator('[data-action="endless-start"]').click();
  58  |   const movement = new HeldMovement(page), deadline = Date.now() + 570000; let s = await readState(page);
  59  |   try {
  60  |     while (Date.now() < deadline && s.elapsed < 900) {
> 61  |       s = await readState(page); collect(s); expect(s.phase, s.result?.reason).not.toBe('result');
      |                                                                                    ^ Error: 核心组织失守：潜伏体优先侵蚀组织，用 Q 定位、2 清群、3 抢修。
  62  |       if (s.endless!.wave !== lastWave) { lastWave = s.endless!.wave; console.info('DUET_BROWSER_WAVE', JSON.stringify({ project: info.project.name, wave: lastWave, elapsed: s.elapsed, hp: s.player.hp })); }
  63  |       if (s.growth?.draft) { await movement.release(); await page.mouse.up(); await page.locator('[data-action="draft-discard"]').click(); continue; }
  64  |       if (s.endlessGrowth?.draft) {
  65  |         await movement.release(); await page.mouse.up();
  66  |         const priority = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];
  67  |         const option = s.endlessGrowth.draft.options.filter(o => o.id !== 'catalysis').slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
  68  |         await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
  69  |       }
  70  |       if (s.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  71  |       if (s.endless!.wave >= 20) {
  72  |         await page.mouse.up();
  73  |         if (s.endless!.phase === 'warning' && !warningChecked) {
  74  |           await movement.release(); const pending = s.endless!.evolution!.pending!; expect(pending.decision.traits).toHaveLength(2);
  75  |           const card = page.locator('#endless-evolution-warning'); await expect(card).toBeVisible(); await expect(card).toContainText('首只精英双招');
  76  |           for (const tactic of ['crystal-charge', 'fission-burst', 'mimic-corrosion'] as const) if (s.endless!.evolution!.pending!.decision.traits.some(id => ({ CARAPACE: 'crystal-charge', FISSION: 'fission-burst', MIMIC: 'mimic-corrosion' })[id] === tactic)) await expect(card).toContainText(ENEMY_TACTIC_INFO[tactic].counter);
  77  |           for (const id of pending.decision.traits) { await expect(card).toContainText(TRAITS[id].ability); await expect(card).toContainText(TRAITS[id].cost); await expect(card).toContainText(TRAITS[id].counter); }
  78  |           const box = await card.boundingBox(); expect(box).not.toBeNull();
  79  |           expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  80  |           expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  81  |           expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  82  |           const layout = await card.evaluate(node => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
  83  |             overflowY: getComputedStyle(node).overflowY, scrollTop: node.scrollTop }));
  84  |           await page.screenshot({ path: info.outputPath('natural-duet-warning.png') }); observations.push({ warning: s, box, layout });
  85  |           if (layout.scrollHeight > layout.clientHeight) {
  86  |             await card.hover(); await page.mouse.wheel(0, 600);
  87  |             await expect.poll(() => card.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  88  |             observations.push({ scrolledWarning: await card.evaluate(node => ({ scrollTop: node.scrollTop,
  89  |               clientHeight: node.clientHeight, scrollHeight: node.scrollHeight })) });
  90  |             await page.screenshot({ path: info.outputPath('natural-duet-warning-scrolled.png') });
  91  |           }
  92  |           await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  93  |           const paused = await readState(page), text = await card.textContent(); await page.waitForTimeout(350);
  94  |           expect((await readState(page)).tick).toBe(paused.tick); expect(await card.textContent()).toBe(text);
  95  |           observations.push({ pausedWarning: paused }); await page.locator('[data-action="continue"]').click(); warningChecked = true; continue;
  96  |         }
  97  |         // Public observation policy: no shooting, Q, E or dash from wave20. Move
  98  |         // around the actual tissue so both player- and tissue-directed tactics can
  99  |         // occur. No HP, birth, pose, clock or protocol state is changed by the test.
  100 |         const angle = s.elapsed * .45, destination = { x: s.tissue.x + Math.cos(angle) * 320, y: s.tissue.y + Math.sin(angle) * 320 };
  101 |         const move = motion(s, destination); await movement.move(move.x, move.y);
  102 |         const elite = s.targets.find(t => t.eliteCycle && t.hp > 0);
  103 |         if (!eliteId && elite) { eliteId = elite.id; observationBegan = s.elapsed; observations.push({ actualBirth: s, eliteId }); }
  104 |         if (eliteId) {
  105 |           const actor = s.targets.find(t => t.id === eliteId); expect(actor?.hp, 'Observed elite must survive ordinary unmodified progression until its two actions are seen').toBeGreaterThan(0);
  106 |           if (actor?.attackPlan && !capturedTactics.has(actor.attackPlan.kind)) {
  107 |             capturedTactics.add(actor.attackPlan.kind); observations.push({ actualWindup: s, tactic: actor.attackPlan.kind });
  108 |             await page.screenshot({ path: info.outputPath(`natural-duet-${actor.attackPlan.kind}.png`) });
  109 |           }
  110 |           const commits = events.filter(e => e.type === 'ELITE_TACTIC_COMMITTED' && e.data.actorId === eliteId);
  111 |           const advances = events.filter(e => e.type === 'ELITE_TACTIC_ADVANCED' && e.data.actorId === eliteId);
  112 |           if (commits.length >= 2 && advances.length >= 2) {
  113 |             expect(commits[0].data.tactic).not.toBe(commits[1].data.tactic);
  114 |             for (const commit of commits.slice(0, 2)) {
  115 |               expect(events.some(e => e.type === 'ENEMY_TACTIC_COMMITTED' && e.tick === commit.tick && e.data.actorId === eliteId && e.data.tactic === commit.data.tactic)).toBe(true);
  116 |               expect(advances.filter(e => e.data.committedTick === commit.data.committedTick)).toHaveLength(1);
  117 |             }
  118 |             expect(Number(commits[1].tick) / 60 + 1e-7).toBeGreaterThanOrEqual(Number(advances[0].data.recoverUntil));
  119 |             const warning = events.find(e => e.type === 'ENDLESS_EVOLUTION_WARNING' && e.data.wave === 20)!, applied = events.find(e => e.type === 'ENDLESS_EVOLUTION_APPLIED' && e.data.wave === 20)!;
  120 |             expect(applied.tick - warning.tick).toBe(480);
  121 |             observations.push({ twoCompletedActions: s, commits, advances });
  122 |             await page.screenshot({ path: info.outputPath('natural-duet-active-recovery.png') }); await page.keyboard.press('Escape');
  123 |             await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  124 |             await page.screenshot({ path: info.outputPath('natural-duet-recovery.png') }); complete = true; break;
  125 |           }
  126 |           expect(s.elapsed - observationBegan, 'Disclosed observation window is90 simulation seconds; no reseed or forced cast').toBeLessThan(90);
  127 |         }
  128 |         await page.waitForTimeout(70); continue;
  129 |       }
  130 |       const action = warm(s);
  131 |       if (action.target) { await aim(page, action.target); await page.keyboard.press('Digit1'); await page.mouse.down(); if (s.endless!.wave < 18 && s.scanReady <= s.elapsed) await page.keyboard.press('KeyQ'); }
  132 |       else await page.mouse.up();
  133 |       await movement.move(action.move.x, action.move.y); await page.waitForTimeout(90);
  134 |     }
  135 |     expect(warningChecked && complete).toBe(true); expect(gaps).toEqual([]); expect(errors).toEqual([]); expect(remote).toEqual([]);
  136 |   } finally {
  137 |     await movement.release(); await page.mouse.up(); s = await readState(page);
  138 |     writeFileSync(info.outputPath('natural-duet.json'), JSON.stringify({ scope: 'Natural seed71 production offline public-input run; wave20 hold-fire observation policy explicitly disclosed. No rank, HP, position, birth, clock or tactic injection; no retry/reseed.',
  139 |       viewport, warningChecked, eliteId, complete, observations, events, gaps, final: s, errors, remote }, null, 2));
  140 |   }
  141 | });
  142 | 
```