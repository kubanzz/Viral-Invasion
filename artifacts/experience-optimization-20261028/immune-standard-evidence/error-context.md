# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v062-immune-readability.spec.ts >> Feedback 0.6.2: real marked-cell cooperation has readable live spacing and a clean full-run retry
- Location: tests\e2e\feedback-v062-immune-readability.spec.ts:58:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
    - text: · 当前
    - dialog "病例结算" [ref=e6]:
      - generic [ref=e7]: △
      - generic [ref=e8]: VIRAL INVASION / CASE ENDED
      - heading "这次防线，没能守住。" [level=2] [ref=e9]
      - paragraph [ref=e10]: 救援体耐久耗尽：避开带齿轮廓的攻击预警，利用冲刺脱离。
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: ♥
          - strong [ref=e14]: 心脏 100%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 76%
          - generic [ref=e19]: 未激活，不计入复测
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 00:34
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "1"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "0"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 13 · 感染 17% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳第二次变异后，器官通道开放。母巢：尚未清除 · 离场损伤 0.0看看本局战术记录，尝试另一条迁移路线或抗体联动。
      - generic [ref=e29]:
        - generic [ref=e30]:
          - button "连续挑战 · 一波接一波 ↗" [ref=e31] [cursor=pointer]
          - paragraph [ref=e32]: 顶住压力，进化后收割，再迎接下一轮挑战。每波三选一，每5波精英与协议联动重配；赢下精英后，所选成长最多连升两阶。从第 1 波起步，打造这一局的抗体构筑。
          - status [ref=e33]: 连续挑战战绩将独立保存在此浏览器。
        - button "同种子重试" [ref=e34] [cursor=pointer]
        - button "新病例" [ref=e35] [cursor=pointer]
        - button "战术记录" [ref=e36] [cursor=pointer]
        - button "返回主菜单" [ref=e37] [cursor=pointer]
        - button "当前配装详情" [ref=e38] [cursor=pointer]
      - generic "本局两维事实说明" [ref=e40]:
        - article [ref=e41]:
          - heading "治疗质量" [level=4] [ref=e42]
          - paragraph [ref=e43]: 有效修复 53.2 点 · 3 次；受击 100 点
        - article [ref=e44]:
          - heading "系统掌控" [level=4] [ref=e45]
          - paragraph [ref=e46]: 连锁 0 次 / 0 跳；折射 0 次
      - generic [ref=e47]:
        - generic [ref=e48]: 下一病例 · 现场应答
        - button "准备下一病例 ↗" [ref=e49] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e50]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e51] [cursor=pointer]
```

# Test source

```ts
  68  |   const cueSourceSha256 = sha(readFileSync('src/render/immuneTraceCues.ts'));
  69  |   interface CaptureAttempt { before: CaptureAnalysis; after: CaptureAnalysis; screenshot: string; screenshotStartedAt: string; screenshotFinishedAt: string; commonHitRoots: string[]; passed: boolean }
  70  |   const attempts: CaptureAttempt[] = [];
  71  |   let selected: CaptureAttempt | undefined, final: GameState | undefined, retry: GameState | undefined;
  72  |   let qualityControl: unknown;
  73  |   const capture = async (state: GameState) => {
  74  |     if (selected || attempts.length >= 8 || (state.growth?.cells?.length ?? 0) !== 3 || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id)) || !selectImmuneTraceCues(state).length) return;
  75  |     const before = analyze(await projectedState(page));
  76  |     // Start early in the unchanged 24-tick fade to leave enough time for the
  77  |     // screenshot IPC; both endpoints must still retain the same actual bite.
  78  |     if (!readable(before) || !before.cues.some(cue => cue.progress <= .2)) return;
  79  |     const screenshot = info.outputPath(`immune-${quality}-attempt-${attempts.length + 1}.png`);
  80  |     const screenshotStartedAt = new Date().toISOString();
  81  |     await page.screenshot({ path: screenshot });
  82  |     const screenshotFinishedAt = new Date().toISOString();
  83  |     const after = analyze(await projectedState(page));
  84  |     const beforeRoots = new Set(before.hits.map(event => String(event.data.rootId)));
  85  |     const commonHitRoots = after.hits.map(event => String(event.data.rootId)).filter(root => beforeRoots.has(root));
  86  |     const sameCells = before.projection.cells.map(cell => cell.id).sort().join('|') === after.projection.cells.map(cell => cell.id).sort().join('|');
  87  |     const passed = readable(after) && sameCells && before.projection.state.growth!.beacon!.id === after.projection.state.growth!.beacon!.id && commonHitRoots.length > 0;
  88  |     const attempt = { before, after, screenshot, screenshotStartedAt, screenshotFinishedAt, commonHitRoots, passed };
  89  |     attempts.push(attempt);
  90  |     if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`immune-${quality}-readable.png`)); }
  91  |   };
  92  |   const demonstrateAfterDraft = async () => {
  93  |     const before = await readState(page);
  94  |     if (selected || before.phase !== 'playing' || !pair.every(id => before.growth!.equipped.some(slot => slot.id === id))) return;
  95  |     const targets = before.targets.filter(target => {
  96  |       if (target.hp <= 0 || target.role === 'core') return false;
  97  |       const distance = Math.hypot(target.x - before.player.x, target.y - before.player.y);
  98  |       if (distance > 400) return false;
  99  |       const wall = wallHit(before.player, normalized(target.x - before.player.x, target.y - before.player.y), distance, activeWorld(before));
  100 |       return wall === null || wall >= distance - 1;
  101 |     }).sort((a, b) => b.hp - a.hp || Math.hypot(a.x - before.player.x, a.y - before.player.y) - Math.hypot(b.x - before.player.x, b.y - before.player.y));
  102 |     const target = targets[0];
  103 |     if (!target || before.scanReady > before.elapsed || before.growth!.beaconReadyAt > before.elapsed) {
  104 |       demonstrations.push({ before, target: target ?? null, skipped: 'No live clear-path near target or Q/squad cooldown not ready; no combat state was written.' });
  105 |       return;
  106 |     }
  107 |     // fullRun releases movement and mouse before onDraft, then continues with a
  108 |     // fresh snapshot after it. A deliberate stop-fire here preserves this real
  109 |     // target long enough for the squad's 0.25-second first-bite delay.
  110 |     const demonstration = { before, target, input: 'mouse.up → aim at live target → Q → observe without firing or movement', observations: [] as unknown[], after: null as GameState | null };
  111 |     demonstrations.push(demonstration);
  112 |     await page.mouse.up();
  113 |     await aim(page, target);
  114 |     await page.keyboard.press('KeyQ');
  115 |     const deadline = Date.now() + 3000;
  116 |     try {
  117 |       while (Date.now() < deadline && !selected) {
  118 |         const state = await readState(page);
  119 |         demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
  120 |         if (state.phase !== 'playing') break;
  121 |         await capture(state);
  122 |         await page.waitForTimeout(40);
  123 |       }
  124 |     } finally { await page.mouse.up(); demonstration.after = await readState(page); }
  125 |   };
  126 |   try {
  127 |     // A current Node-side selector must never be used to claim an old bundle
  128 |     // displays the cue. The helper must be an input to this exact build.
  129 |     expect(build.version).toBe(expectedVersion);
  130 |     expect(build.sourceManifest['src/render/immuneTraceCues.ts']).toBe(cueSourceSha256);
  131 |     await page.goto(`${entry}?seed=13`);
  132 |     const effects = page.locator('.profile-menu [data-action="effects"]');
  133 |     await expect(effects).toContainText('标准');
  134 |     if (low) await effects.click();
  135 |     await expect(effects).toContainText(low ? '低' : '标准');
  136 |     const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
  137 |     expect(storedQuality ?? false).toBe(low);
  138 |     qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality, storageScope: storedQuality === null ? 'Untouched default profile; standard is confirmed by the menu label.' : 'Persisted through the real menu control.' };
  139 |     await page.locator('[data-action="start"]').click();
  140 |     expect((await readState(page)).world!.width).toBe(2400);
  141 | 
  142 |     await fullRun(page, 'ignore', undefined, true, async state => {
  143 |       const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
  144 |       // Use only the offered cards. If the desired route is absent, evolve an
  145 |       // existing beacon or take another offered route; never write equipment.
  146 |       const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
  147 |       const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
  148 |         ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
  149 |         ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
  150 |         ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
  151 |       await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  152 |       const pending = await readState(page);
  153 |       let replacementSlot: number | undefined;
  154 |       if (pending.growth!.draft?.status === 'replacing') {
  155 |         replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
  156 |         expect(replacementSlot).toBeGreaterThanOrEqual(0);
  157 |         await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
  158 |       }
  159 |       drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
  160 |       await demonstrateAfterDraft();
  161 |     }, async state => {
  162 |       // This callback only observes and screenshots. Pausing here would clear
  163 |       // the game's held keys without updating fullRun's held-key bookkeeping.
  164 |       await capture(state);
  165 |     });
  166 | 
  167 |     final = await readState(page);
> 168 |     expect(final.result?.success).toBe(true);
      |                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  169 |     expect(final.campaign!.migration.choice).toBe('ignore');
  170 |     expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
  171 |     expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
  172 |     expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
  173 |     expect(selected, 'No live, well-spaced three-cell screenshot bracket retained the same genuine marked bite on both sides').toBeDefined();
  174 |     expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
  175 |     await page.screenshot({ path: info.outputPath('result.png') });
  176 |     await page.locator('[data-action="retry"]').click();
  177 |     retry = await readState(page);
  178 |     expect(retry.seed).toBe(final.seed);
  179 |     expect(retry.growth!.runId).not.toBe(final.growth!.runId);
  180 |     expect(retry.player.hp).toBe(100);
  181 |     expect(retry.growth!.xp).toBe(0);
  182 |     expect(retry.growth!.equipped).toEqual([]);
  183 |     expect(retry.growth!.cells).toEqual([]);
  184 |     expect(retry.growth!.marks).toEqual([]);
  185 |     expect(retry.growth!.beacon).toBeNull();
  186 |     expect(retry.growth!.activations).toEqual({});
  187 |     expect(retry.campaign!.migration.status).toBe('locked');
  188 |     expect(selectImmuneTraceCues(retry)).toEqual([]);
  189 |     expect(errors).toEqual([]);
  190 |     expect(remote).toEqual([]);
  191 |   } finally {
  192 |     writeFileSync(info.outputPath('immune-readability-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, cueSourceSha256, thresholds: { minimumWorldSpacing, minimumScreenSpacing, viewport: { width: 1366, height: 768 }, rationale: 'Momentary capture lower bounds, chosen against the observed near-coincident cells; permits some silhouette overlap and makes no all-frame occlusion guarantee.' }, captureScope: 'A real screenshot is bracketed by two separately acquired state/projection snapshots. The same current-squad marked bite must remain fresh on both sides; neither endpoint is claimed to be the exact screenshot tick. The PNG still requires manual readability review.', drafts, demonstrations, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  193 |   }
  194 | });
  195 | 
```