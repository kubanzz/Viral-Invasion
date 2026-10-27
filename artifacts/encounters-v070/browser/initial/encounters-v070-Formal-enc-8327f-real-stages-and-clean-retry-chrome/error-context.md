# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: encounters-v070.spec.ts >> Formal encounters: ignore, immune build, five real stages and clean retry
- Location: tests\e2e\encounters-v070.spec.ts:57:29

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
        - generic: ●LUNG / 02
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
    - text: · 当前
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: ✧
      - generic [ref=e8]: VIRAL INVASION / LIFE STABILIZED
      - heading "让生命，再次有力地呼吸。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 母巢已清除，所有激活器官完整度 ≥50%，感染负荷 <35%，主动复测通过。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 83%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 82%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:10
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "15"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 41 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳 → 裂殖放任迁移 · 肺部新增感染源。母巢：已净化 · 离场损伤 0.0本局放任迁移，肺部建立了额外感染源。下次可试试出口追击或隔离闸封锁。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
        - button "当前配装详情" [ref=e34] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e35]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e36] [cursor=pointer]
```

# Test source

```ts
  19  |   { choice: 'ignore', seed: 41, project: 'chrome', build: 'immune' },
  20  | ];
  21  | const readProfile = (page: Page): Promise<ProfileData> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
  22  | const selectedEvents = (event: GameEvent) => /CAMPAIGN_STAGE_|ORGAN_CRISIS_|COUNTER_|PULSE_TRIGGERED|AIRWAY_CHANGED|CORE_LOCATED|INFECTION_SOURCE_CLEARED|RETEST_COMPLETED/.test(event.type);
  23  | 
  24  | type Frame = { at: number; delta: number };
  25  | type Observer = { active: boolean; previous: number | null; frames: Frame[]; drain(): Frame[] };
  26  | type ObserverWindow = Window & { __encounterFrames?: Observer };
  27  | async function frameObserver(page: Page) {
  28  |   await page.addInitScript(() => {
  29  |     const observer: Observer = { active: false, previous: null, frames: [], drain() { const frames = this.frames; this.frames = []; this.previous = null; return frames; } };
  30  |     (window as ObserverWindow).__encounterFrames = observer;
  31  |     const frame = (at: number) => {
  32  |       const eligible = observer.active && !document.hidden && !document.querySelector('#overlay-host .overlay');
  33  |       if (eligible && observer.previous !== null && observer.frames.length < 60000) observer.frames.push({ at, delta: at - observer.previous });
  34  |       observer.previous = eligible ? at : null; requestAnimationFrame(frame);
  35  |     };
  36  |     requestAnimationFrame(frame);
  37  |   });
  38  | }
  39  | async function drainFrames(page: Page) { return page.evaluate(() => (window as ObserverWindow).__encounterFrames!.drain()); }
  40  | function frameStats(frames: Frame[]) {
  41  |   const intervals = frames.map(frame => frame.delta).filter(delta => delta > 0).sort((a, b) => a - b);
  42  |   const total = intervals.reduce((sum, delta) => sum + delta, 0), mean = total / (intervals.length || 1);
  43  |   return { frames: intervals.length, measuredSeconds: total / 1000, averageFps: intervals.length ? 1000 / mean : 0,
  44  |     p95FrameMs: intervals[Math.max(0, Math.ceil(intervals.length * .95) - 1)] ?? 0 };
  45  | }
  46  | 
  47  | function crisisInput(state: GameState, planned: InputFrame): InputFrame {
  48  |   const crisis = state.campaign!.encounters!.crisis;
  49  |   const scan = state.elapsed < 1 || crisis.interruptions > 0;
  50  |   if (state.campaign!.encounters!.stage !== 'IV' || crisis.status !== 'charging' || crisis.interruptions > 0 || state.battle!.organId !== crisis.organId) return { ...planned, scan };
  51  |   const device = state.battle!.graph.nodes.find(node => crisis.organId === 'heart' ? node.kind === 'valve' : node.id === 'airway')!;
  52  |   const next = waypoint(state, device), movement = distance(state.player, device) > 20 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
  53  |   const ready = crisis.organId === 'heart' ? state.battle!.pulse.readyAt <= state.elapsed : state.elapsed - state.campaign!.arenas.lung.flow!.changedAt >= 1;
  54  |   return { moveX: movement.x, moveY: movement.y, aim: crisis.position, tool: 1, fire: false, scan: false, interact: ready && distance(state.player, device) < 85 };
  55  | }
  56  | 
  57  | for (const route of routes) test(`Formal encounters: ${route.choice}, ${route.build} build, five real stages and clean retry`, async ({ page, context }, info) => {
  58  |   test.skip(info.project.name !== route.project, 'Three complete formal routes are split across the installed browsers.');
  59  |   test.setTimeout(300000);
  60  |   const errors: string[] = [], remote: string[] = [], eventMap = new Map<string, GameEvent>(), milestones: Record<string, GameState> = {}, drafts: unknown[] = [];
  61  |   let final: GameState | undefined, profile: ProfileData | undefined, low = false;
  62  |   const performance: Record<string, unknown> = {};
  63  |   page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  64  |   await context.setOffline(true); await frameObserver(page); await page.goto(`${entry}?seed=${route.seed}`);
  65  |   await page.locator('[data-action="start"]').click();
  66  |   const opening = await readState(page); expect(opening.battle!.encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided' });
  67  |   const priorities: ProtocolId[] = route.build === 'chain' ? ['PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE', 'IMMUNE_BEACON'] : ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK'];
  68  |   try {
  69  |     await fullRun(page, route.choice, undefined, true, async state => {
  70  |       drafts.push({ tick: state.tick, draft: state.growth!.draft, equipped: state.growth!.equipped });
  71  |       if (state.growth!.draft!.status === 'replacing') {
  72  |         const slots = state.growth!.equipped.map((slot, index) => ({ index, priority: priorities.indexOf(slot.id) })).sort((a, b) => b.priority - a.priority);
  73  |         await page.locator('[data-action="draft-replace"]').nth(slots[0].index).click();
  74  |       } else await chooseDraftInput(page, priorities);
  75  |     }, async state => {
  76  |       await page.evaluate(active => { (window as ObserverWindow).__encounterFrames!.active = active; }, state.phase === 'playing');
  77  |       for (const event of state.events.filter(selectedEvents)) eventMap.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
  78  |       const encounter = state.campaign!.encounters!, crisis = encounter.crisis;
  79  |       if (encounter.stage === 'IV' && crisis.interruptions === 0) await page.mouse.up();
  80  |       if (!milestones[encounter.stage]) { milestones[encounter.stage] = state; if (encounter.stage !== 'IV') await page.screenshot({ path: info.outputPath(`stage-${encounter.stage}.png`) }); }
  81  |       if (state.battle!.encounter!.firstCounter.counterHit && !milestones.counter) { milestones.counter = state; await page.screenshot({ path: info.outputPath('counter-accepted.png') }); }
  82  |       if (state.campaign!.core.status === 'active' && !milestones.core) { milestones.core = state; await page.screenshot({ path: info.outputPath('core-active.png') }); }
  83  |       if (route.choice === 'block' && encounter.stage === 'III' && !low) {
  84  |         await page.mouse.up(); await page.keyboard.press('Escape');
  85  |         performance.standard = frameStats(await drainFrames(page));
  86  |         await page.locator('#overlay-host [data-action="effects"]').click(); await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低');
  87  |         await page.locator('[data-action="continue"]').click(); low = true; return true;
  88  |       }
  89  |       if (crisis.interruptions > 0 && !milestones.window) {
  90  |         milestones.window = state; await page.mouse.up();
  91  |         expect(state.targets.find(target => target.id === crisis.sourceId)!.hp).toBeGreaterThan(0);
  92  |         expect(encounter.stages.IV.completedAt).toBeNull(); await expect(page.locator('#encounter-hud')).toBeVisible();
  93  |         if (route.choice === 'block') {
  94  |           await page.setViewportSize({ width: 1100, height: 560 }); await page.screenshot({ path: info.outputPath('crisis-window-1100.png') });
  95  |           const bounds = await page.evaluate(() => {
  96  |             const a = document.querySelector('#encounter-hud')!.getBoundingClientRect(), b = document.querySelector('.growth-panel')!.getBoundingClientRect();
  97  |             return { encounter: { left: a.left, right: a.right, top: a.top, bottom: a.bottom }, growth: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, width: innerWidth, height: innerHeight };
  98  |           });
  99  |           expect(bounds.encounter.left).toBeGreaterThanOrEqual(0); expect(bounds.encounter.right).toBeLessThanOrEqual(bounds.width);
  100 |           expect(bounds.encounter.bottom).toBeLessThanOrEqual(bounds.height);
  101 |           expect(bounds.encounter.right <= bounds.growth.left || bounds.growth.right <= bounds.encounter.left || bounds.encounter.bottom <= bounds.growth.top || bounds.growth.bottom <= bounds.encounter.top).toBe(true);
  102 |           await page.setViewportSize({ width: 1366, height: 768 });
  103 |         } else await page.screenshot({ path: info.outputPath('crisis-window.png') });
  104 |       }
  105 |     }, { automaticScan: false, inputOverride: crisisInput, timeoutMs: 240000 });
  106 |     final = await readState(page); for (const event of final.events.filter(selectedEvents)) eventMap.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
  107 |     performance[low ? 'low' : 'standard'] = frameStats(await drainFrames(page));
  108 |     if (route.choice === 'block') for (const mode of ['standard', 'low']) expect((performance[mode] as ReturnType<typeof frameStats>).measuredSeconds).toBeGreaterThan(1);
  109 |     expect(final.result).toMatchObject({ success: true }); expect(final.campaign!.migration.choice).toBe(route.choice);
  110 |     const encounter = final.campaign!.encounters!, counter = final.battle!.encounter!.firstCounter;
  111 |     for (const stage of ['I', 'II', 'III', 'IV', 'V'] as const) { expect(encounter.stages[stage].enteredAt).not.toBeNull(); expect(encounter.stages[stage].completedAt).not.toBeNull(); }
  112 |     for (const [before, after] of [['I', 'II'], ['II', 'III'], ['III', 'IV'], ['IV', 'V']] as const) expect(encounter.stages[before].completedAt!).toBeLessThanOrEqual(encounter.stages[after].enteredAt!);
  113 |     expect(counter.counterHit).not.toBeNull(); expect(counter.guideStatus).toBe('completed'); expect(counter.status).toBe('resolved');
  114 |     expect(encounter.crisis.status).toBe('cleared'); expect(encounter.crisis.interruptions).toBeGreaterThan(0);
  115 |     expect(eventMap.size).toBeGreaterThan(10);
  116 |     expect([...eventMap.values()].filter(event => event.type === 'CORE_LOCATED')).toHaveLength(1);
  117 |     expect([...eventMap.values()].some(event => event.type === 'ORGAN_CRISIS_INTERRUPTED')).toBe(true);
  118 |     expect(final.growth!.equipped.some(slot => slot.id === (route.build === 'chain' ? 'PURIFY_CHAIN' : 'IMMUNE_BEACON'))).toBe(true);
> 119 |     expect(final.growth!.activations?.[route.build === 'chain' ? 'PURIFY_CHAIN' : 'IMMUNE_BEACON'] ?? 0).toBeGreaterThan(0);
      |                                                                                                          ^ Error: expect(received).toBeGreaterThan(expected)
  120 |     profile = await readProfile(page); expect(profile.stats.wins).toBe(1); expect(profile.recentRuns[0].encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided', guideCompleted: true, counterMethod: counter.counterHit!.method });
  121 |     await page.screenshot({ path: info.outputPath('result.png') });
  122 |     await page.locator('[data-action="retry"]').click(); const retry = await readState(page);
  123 |     expect(retry.seed).toBe(route.seed); expect(retry.battle!.encounter!.guideVariant).toBe('guided'); expect(retry.battle!.encounter!.firstCounter.counterHit).toBeNull();
  124 |     expect(retry.player.hp).toBe(100); expect(retry.growth!.xp).toBe(0); expect(retry.campaign!.encounters!.crisis.status).toBe('locked');
  125 |     expect(retry.campaign!.encounters!.stages.IV.enteredAt).toBeNull(); expect((await readProfile(page)).stats.runs).toBe(1);
  126 |     if (route.choice === 'block') {
  127 |       await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="start"]').click();
  128 |       expect((await readState(page)).battle!.encounter!.guideVariant).toBe('adaptive');
  129 |       await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="profile"]').click();
  130 |       await page.locator(`[data-action="replay-record"][data-seed="${route.seed}"]`).first().click();
  131 |       const replay = await readState(page); expect(replay.seed).toBe(route.seed); expect(replay.battle!.encounter!.guideVariant).toBe('guided');
  132 |       expect(replay.elapsed).toBeLessThan(2); expect(replay.growth!.xp).toBe(0); expect(replay.campaign!.encounters!.stage).toBe('I');
  133 |     }
  134 |     expect(errors).toEqual([]); expect(remote).toEqual([]);
  135 |   } finally {
  136 |     writeFileSync(info.outputPath('formal-evidence.json'), JSON.stringify({ route, opening, final, profile, milestones, events: [...eventMap.values()], drafts, performance, errors, remote, lastState: await readState(page).catch(() => null) }, null, 2));
  137 |   }
  138 | });
  139 | 
  140 | test('Formal encounters: skip is cosmetic, help preserves explanation, retry keeps guided and a new case becomes adaptive', async ({ page, context }, info) => {
  141 |   await context.setOffline(true); await page.goto(`${entry}?seed=73`); await page.locator('[data-action="start"]').click();
  142 |   await expect(page.locator('[data-action="skip-counter-guide"]')).toBeVisible(); const before = await readState(page);
  143 |   await page.locator('[data-action="skip-counter-guide"]').click(); const skipped = await readState(page);
  144 |   expect(skipped.battle!.encounter!.firstCounter.guideStatus).toBe('skipped'); expect(skipped.battle!.encounter!.firstCounter.status).toBe('opening');
  145 |   expect(skipped.battle!.stats.kills).toBe(before.battle!.stats.kills); expect(skipped.growth!.xp).toBe(0); expect(skipped.battle!.encounter!.firstCounter.counterHit).toBeNull();
  146 |   await page.locator('.top-actions [data-action="help"]').click(); await expect(page.locator('.encounter-help')).toContainText('提示已跳过');
  147 |   await expect(page.locator('.encounter-help')).toContainText('绕后净化'); await expect(page.locator('.encounter-help')).toContainText('借阀门破壳');
  148 |   const paused = await readState(page); await page.waitForTimeout(250); expect((await readState(page)).tick).toBe(paused.tick);
  149 |   await page.screenshot({ path: info.outputPath('skipped-help.png') }); await page.locator('[data-action="close-help"]').click();
  150 |   await page.keyboard.press('Escape'); await page.locator('[data-action="retry"]').click();
  151 |   const retry = await readState(page); expect(retry.seed).toBe(73); expect(retry.battle!.encounter!.guideVariant).toBe('guided'); expect(retry.battle!.encounter!.firstCounter.guideStatus).toBe('active');
  152 |   await page.locator('.top-actions [data-action="help"]').click(); const helpBefore = await readState(page);
  153 |   await page.locator('.encounter-help [data-action="skip-counter-guide"]').click();
  154 |   await expect(page.locator('.encounter-help')).toBeVisible(); await expect(page.locator('.encounter-help')).toContainText('提示已跳过');
  155 |   const helpSkipped = await readState(page); expect(helpSkipped.phase).toBe('paused'); expect(helpSkipped.tick).toBe(helpBefore.tick); expect(helpSkipped.growth!.xp).toBe(helpBefore.growth!.xp);
  156 |   await page.waitForTimeout(250); expect((await readState(page)).tick).toBe(helpBefore.tick);
  157 |   await page.screenshot({ path: info.outputPath('skip-inside-help.png') }); await page.locator('[data-action="close-help"]').click();
  158 |   await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="start"]').click();
  159 |   const next = await readState(page); expect(next.battle!.encounter!.guideVariant).toBe('adaptive'); expect((await readProfile(page)).stats.runs).toBe(0);
  160 |   writeFileSync(info.outputPath('skip-help-retry.json'), JSON.stringify({ before, skipped, paused, retry, helpBefore, helpSkipped, next, profile: await readProfile(page) }, null, 2));
  161 | });
  162 | 
  163 | for (const sample of [{ trait: 'FISSION', name: '裂殖', project: 'chrome' }, { trait: 'MIMIC', name: '潜伏', project: 'edge' }] as const) test(`Formal encounters: explicit ${sample.trait} case keeps adaptive help truthful`, async ({ page, context }, info) => {
  164 |   test.skip(info.project.name !== sample.project, 'One non-carapace trait case per browser.');
  165 |   await context.setOffline(true); await page.goto(`${entry}?seed=97`); await page.locator('[data-action="start"]').click();
  166 |   await page.locator('[data-action="skip-counter-guide"]').click();
  167 |   // Onboarding was acknowledged through the actual button. The URL then selects
  168 |   // a real explicit trait; neither profile storage nor simulation is injected.
  169 |   await page.goto(`${entry}?seed=97&trait=${sample.trait}`); await page.locator('[data-action="start"]').click();
  170 |   const state = await readState(page); expect(state.battle!.encounter!.guideVariant).toBe('adaptive');
  171 |   expect(state.battle!.firstTrait).toBe(sample.trait); expect(state.battle!.forcedFirstTrait).toBe(sample.trait);
  172 |   await expect.poll(async () => (await readState(page)).battle!.warning?.trait, { timeout: 20000 }).toBe(sample.trait);
  173 |   const observed = await readState(page);
  174 |   await page.locator('.top-actions [data-action="help"]').click();
  175 |   await expect(page.locator('.encounter-help')).toContainText(sample.name);
  176 |   await expect(page.locator('.encounter-help')).not.toContainText('晶壳反制 · 两条基础路线');
  177 |   await expect(page.locator('.encounter-help')).toContainText('自主应对');
  178 |   await page.screenshot({ path: info.outputPath(`adaptive-${sample.trait.toLowerCase()}-help.png`) });
  179 |   writeFileSync(info.outputPath('explicit-trait.json'), JSON.stringify({ state, observed, profile: await readProfile(page), help: await page.locator('.encounter-help').innerText() }, null, 2));
  180 | });
  181 | 
```