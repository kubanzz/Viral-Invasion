# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v062-immune-readability.spec.ts >> Feedback 0.6.2: real marked-cell cooperation has readable live spacing and a clean full-run retry
- Location: tests\e2e\feedback-v062-immune-readability.spec.ts:56:1

# Error details

```
Error: No live, well-spaced three-cell screenshot bracket retained the same genuine marked bite on both sides

expect(received).toBeDefined()

Received: undefined
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
          - strong [ref=e14]: 心脏 72%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 67%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:30
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "11"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 13 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：潜伏 → 晶壳放任迁移 · 肺部新增感染源。母巢：已净化 · 离场损伤 0.0本局放任迁移，肺部建立了额外感染源。下次可试试出口追击或隔离闸封锁。
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
  31  | interface CaptureAnalysis {
  32  |   projection: ProjectedState;
  33  |   cues: ImmuneTraceCue[];
  34  |   hits: GameEvent[];
  35  |   spacing: Array<{ a: string; b: string; world: number; screen: number }>;
  36  | }
  37  | function analyze(projection: ProjectedState): CaptureAnalysis {
  38  |   const { state, cells } = projection, cues = selectImmuneTraceCues(state);
  39  |   const hits = cues.flatMap(cue => {
  40  |     const tick = state.tick - Math.round(cue.progress * IMMUNE_TRACE_CUE_TICKS);
  41  |     const event = state.events.find(item => item.type === 'PROTOCOL_BEACON_HIT' && item.tick === tick && item.data.cellId === cue.cellId && item.data.targetId === cue.targetId);
  42  |     return event ? [event] : [];
  43  |   });
  44  |   const spacing: CaptureAnalysis['spacing'] = [];
  45  |   for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) spacing.push({ a: cells[a].id, b: cells[b].id, world: Math.hypot(cells[a].world.x - cells[b].world.x, cells[a].world.y - cells[b].world.y), screen: Math.hypot(cells[a].screen.x - cells[b].screen.x, cells[a].screen.y - cells[b].screen.y) });
  46  |   return { projection, cues, hits, spacing };
  47  | }
  48  | function readable(analysis: CaptureAnalysis): boolean {
  49  |   const { state, cells, viewport } = analysis.projection;
  50  |   return state.phase === 'playing' && pair.every(id => state.growth!.equipped.some(slot => slot.id === id))
  51  |     && cells.length === 3 && analysis.cues.length > 0 && analysis.hits.some(event => event.data.prioritizedTrace === true && Number(event.data.damage) > 0)
  52  |     && analysis.spacing.length === 3 && analysis.spacing.every(distance => distance.world >= minimumWorldSpacing && distance.screen >= minimumScreenSpacing)
  53  |     && cells.every(cell => cell.screen.x >= 24 && cell.screen.x <= viewport.width - 24 && cell.screen.y >= 105 && cell.screen.y <= viewport.height - 118);
  54  | }
  55  | 
  56  | test('Feedback 0.6.2: real marked-cell cooperation has readable live spacing and a clean full-run retry', async ({ page, context }, info) => {
  57  |   test.setTimeout(230000);
  58  |   await context.setOffline(true);
  59  |   await page.setViewportSize({ width: 1366, height: 768 });
  60  |   const low = info.project.name === 'edge', quality = low ? 'low' : 'standard';
  61  |   const errors: string[] = [], remote: string[] = [], drafts: unknown[] = [];
  62  |   page.on('pageerror', error => errors.push(error.message));
  63  |   page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  64  |   const build = JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8'));
  65  |   const bundleSha256 = sha(readFileSync(resolve(dirname(entryPath), 'game.js')));
  66  |   const cueSourceSha256 = sha(readFileSync('src/render/immuneTraceCues.ts'));
  67  |   interface CaptureAttempt { before: CaptureAnalysis; after: CaptureAnalysis; screenshot: string; screenshotStartedAt: string; screenshotFinishedAt: string; commonHitRoots: string[]; passed: boolean }
  68  |   const attempts: CaptureAttempt[] = [];
  69  |   let selected: CaptureAttempt | undefined, final: GameState | undefined, retry: GameState | undefined;
  70  |   let qualityControl: unknown;
  71  |   try {
  72  |     // A current Node-side selector must never be used to claim an old bundle
  73  |     // displays the cue. The helper must be an input to this exact build.
  74  |     expect(build.version).toBe('0.6.2');
  75  |     expect(build.sourceManifest['src/render/immuneTraceCues.ts']).toBe(cueSourceSha256);
  76  |     await page.goto(`${entry}?seed=13`);
  77  |     const effects = page.locator('.profile-menu [data-action="effects"]');
  78  |     await expect(effects).toContainText('标准');
  79  |     if (low) await effects.click();
  80  |     await expect(effects).toContainText(low ? '低' : '标准');
  81  |     const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
  82  |     expect(storedQuality ?? false).toBe(low);
  83  |     qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality, storageScope: storedQuality === null ? 'Untouched default profile; standard is confirmed by the menu label.' : 'Persisted through the real menu control.' };
  84  |     await page.locator('[data-action="start"]').click();
  85  |     expect((await readState(page)).world!.width).toBe(2400);
  86  | 
  87  |     await fullRun(page, 'ignore', undefined, true, async state => {
  88  |       const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
  89  |       // Use only the offered cards. If the desired route is absent, evolve an
  90  |       // existing beacon or take another offered route; never write equipment.
  91  |       const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
  92  |       const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
  93  |         ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
  94  |         ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
  95  |         ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
  96  |       await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  97  |       const pending = await readState(page);
  98  |       let replacementSlot: number | undefined;
  99  |       if (pending.growth!.draft?.status === 'replacing') {
  100 |         replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
  101 |         expect(replacementSlot).toBeGreaterThanOrEqual(0);
  102 |         await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
  103 |       }
  104 |       drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
  105 |     }, async state => {
  106 |       // This callback only observes and screenshots. Pausing here would clear
  107 |       // the game's held keys without updating fullRun's held-key bookkeeping.
  108 |       if (selected || attempts.length >= 8 || (state.growth?.cells?.length ?? 0) !== 3 || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id)) || !selectImmuneTraceCues(state).length) return;
  109 |       const before = analyze(await projectedState(page));
  110 |       if (!readable(before) || !before.cues.some(cue => cue.progress <= .35)) return;
  111 |       const screenshot = info.outputPath(`immune-${quality}-attempt-${attempts.length + 1}.png`);
  112 |       const screenshotStartedAt = new Date().toISOString();
  113 |       await page.screenshot({ path: screenshot });
  114 |       const screenshotFinishedAt = new Date().toISOString();
  115 |       const after = analyze(await projectedState(page));
  116 |       const beforeRoots = new Set(before.hits.map(event => String(event.data.rootId)));
  117 |       const commonHitRoots = after.hits.map(event => String(event.data.rootId)).filter(root => beforeRoots.has(root));
  118 |       const sameCells = before.projection.cells.map(cell => cell.id).sort().join('|') === after.projection.cells.map(cell => cell.id).sort().join('|');
  119 |       const passed = readable(after) && sameCells && before.projection.state.growth!.beacon!.id === after.projection.state.growth!.beacon!.id && commonHitRoots.length > 0;
  120 |       const attempt = { before, after, screenshot, screenshotStartedAt, screenshotFinishedAt, commonHitRoots, passed };
  121 |       attempts.push(attempt);
  122 |       if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`immune-${quality}-readable.png`)); }
  123 |     });
  124 | 
  125 |     final = await readState(page);
  126 |     expect(final.result?.success).toBe(true);
  127 |     expect(final.campaign!.migration.choice).toBe('ignore');
  128 |     expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
  129 |     expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
  130 |     expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
> 131 |     expect(selected, 'No live, well-spaced three-cell screenshot bracket retained the same genuine marked bite on both sides').toBeDefined();
      |                                                                                                                                ^ Error: No live, well-spaced three-cell screenshot bracket retained the same genuine marked bite on both sides
  132 |     expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
  133 |     await page.screenshot({ path: info.outputPath('result.png') });
  134 |     await page.locator('[data-action="retry"]').click();
  135 |     retry = await readState(page);
  136 |     expect(retry.seed).toBe(final.seed);
  137 |     expect(retry.growth!.runId).not.toBe(final.growth!.runId);
  138 |     expect(retry.player.hp).toBe(100);
  139 |     expect(retry.growth!.xp).toBe(0);
  140 |     expect(retry.growth!.equipped).toEqual([]);
  141 |     expect(retry.growth!.cells).toEqual([]);
  142 |     expect(retry.growth!.marks).toEqual([]);
  143 |     expect(retry.growth!.beacon).toBeNull();
  144 |     expect(retry.growth!.activations).toEqual({});
  145 |     expect(retry.campaign!.migration.status).toBe('locked');
  146 |     expect(selectImmuneTraceCues(retry)).toEqual([]);
  147 |     expect(errors).toEqual([]);
  148 |     expect(remote).toEqual([]);
  149 |   } finally {
  150 |     writeFileSync(info.outputPath('immune-readability-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, cueSourceSha256, thresholds: { minimumWorldSpacing, minimumScreenSpacing, viewport: { width: 1366, height: 768 }, rationale: 'Momentary capture lower bounds, chosen against the observed near-coincident cells; permits some silhouette overlap and makes no all-frame occlusion guarantee.' }, captureScope: 'A real screenshot is bracketed by two separately acquired state/projection snapshots. The same current-squad marked bite must remain fresh on both sides; neither endpoint is claimed to be the exact screenshot tick. The PNG still requires manual readability review.', drafts, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  151 |   }
  152 | });
  153 | 
```