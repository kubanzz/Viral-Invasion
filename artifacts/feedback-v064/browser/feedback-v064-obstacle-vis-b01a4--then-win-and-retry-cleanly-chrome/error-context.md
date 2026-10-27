# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v064-obstacle-visibility.spec.ts >> Feedback 0.6.4: real cells remain readable behind a raised fold in both quality modes, then win and retry cleanly
- Location: tests\e2e\feedback-v064-obstacle-visibility.spec.ts:72:1

# Error details

```
Error: No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite

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
          - strong [ref=e14]: 心脏 69%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 70%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:32
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
  76  |   const low = info.project.name === 'edge', quality = low ? 'low' : 'standard';
  77  |   const errors: string[] = [], remote: string[] = [], drafts: unknown[] = [], demonstrations: unknown[] = [];
  78  |   page.on('pageerror', error => errors.push(error.message));
  79  |   page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  80  |   const build = JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8'));
  81  |   const bundleSha256 = sha(readFileSync(resolve(dirname(entryPath), 'game.js')));
  82  |   const sourceHashes = Object.fromEntries(['src/render/raisedObstacleGeometry.ts', 'src/render/raisedObstacleOcclusion.ts', 'src/render/renderer.ts', 'src/render/lungVisuals.ts', 'src/render/immuneVisuals.ts', 'src/render/immuneTraceCues.ts'].map(path => [path, sha(readFileSync(path))]));
  83  |   interface Attempt { before: Analysis; after: Analysis; screenshot: string; screenshotStartedAt: string; screenshotFinishedAt: string; commonHitRoots: string[]; commonOcclusionPairs: string[]; passed: boolean }
  84  |   const attempts: Attempt[] = [];
  85  |   let selected: Attempt | undefined, final: GameState | undefined, retry: GameState | undefined;
  86  |   let qualityControl: unknown;
  87  |   const capture = async (state: GameState) => {
  88  |     if (selected || attempts.length >= 8 || (state.growth?.cells?.length ?? 0) !== 3 || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id)) || !selectImmuneTraceCues(state).length) return;
  89  |     const before = analyze(await projectedState(page));
  90  |     if (!adverseFrame(before) || !before.cues.some(cue => cue.progress <= .2)) return;
  91  |     const screenshot = info.outputPath(`raised-fold-${quality}-attempt-${attempts.length + 1}.png`);
  92  |     const screenshotStartedAt = new Date().toISOString();
  93  |     await page.screenshot({ path: screenshot });
  94  |     const screenshotFinishedAt = new Date().toISOString();
  95  |     const after = analyze(await projectedState(page));
  96  |     const beforeRoots = new Set(before.hits.map(event => String(event.data.rootId)));
  97  |     const commonHitRoots = after.hits.map(event => String(event.data.rootId)).filter(root => beforeRoots.has(root));
  98  |     const beforeOcclusions = new Set(before.adverseCells.map(actor => `${actor.obstacleId}:${actor.cellId}`));
  99  |     const commonOcclusionPairs = after.adverseCells.map(actor => `${actor.obstacleId}:${actor.cellId}`).filter(key => beforeOcclusions.has(key));
  100 |     const sameCells = before.projection.cells.map(cell => cell.id).sort().join('|') === after.projection.cells.map(cell => cell.id).sort().join('|');
  101 |     const passed = adverseFrame(after) && sameCells && before.projection.state.growth!.beacon!.id === after.projection.state.growth!.beacon!.id && commonHitRoots.length > 0 && commonOcclusionPairs.length > 0;
  102 |     const attempt = { before, after, screenshot, screenshotStartedAt, screenshotFinishedAt, commonHitRoots, commonOcclusionPairs, passed };
  103 |     attempts.push(attempt);
  104 |     if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`raised-fold-${quality}-actual.png`)); }
  105 |   };
  106 |   const demonstrateAfterDraft = async () => {
  107 |     const before = await readState(page);
  108 |     if (selected || before.phase !== 'playing' || !pair.every(id => before.growth!.equipped.some(slot => slot.id === id))) return;
  109 |     const targets = before.targets.filter(target => {
  110 |       if (target.hp <= 0 || target.role === 'core') return false;
  111 |       const distance = Math.hypot(target.x - before.player.x, target.y - before.player.y);
  112 |       if (distance > 400) return false;
  113 |       const wall = wallHit(before.player, normalized(target.x - before.player.x, target.y - before.player.y), distance, activeWorld(before));
  114 |       return wall === null || wall >= distance - 1;
  115 |     }).sort((a, b) => b.hp - a.hp || Math.hypot(a.x - before.player.x, a.y - before.player.y) - Math.hypot(b.x - before.player.x, b.y - before.player.y));
  116 |     const target = targets[0];
  117 |     if (!target || before.scanReady > before.elapsed || before.growth!.beaconReadyAt > before.elapsed) {
  118 |       demonstrations.push({ before, target: target ?? null, skipped: 'No live near target with clear sight or Q/squad cooldown not ready. Only public input is used.' });
  119 |       return;
  120 |     }
  121 |     // onDraft starts after fullRun releases its keys and mouse. This is a real
  122 |     // stop-fire window, preserving a live target for contact bites near folds.
  123 |     const demonstration = { before, target, input: 'mouse.up → aim at live target → Q → stop firing/moving for at most three seconds', observations: [] as unknown[], after: null as GameState | null };
  124 |     demonstrations.push(demonstration);
  125 |     await page.mouse.up(); await aim(page, target); await page.keyboard.press('KeyQ');
  126 |     const deadline = Date.now() + 3000;
  127 |     try {
  128 |       while (Date.now() < deadline && !selected) {
  129 |         const state = await readState(page);
  130 |         demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, occlusion: activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, ...getRaisedObstacleOcclusion(state, obstacle) })), cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
  131 |         if (state.phase !== 'playing') break;
  132 |         await capture(state); await page.waitForTimeout(40);
  133 |       }
  134 |     } finally { await page.mouse.up(); demonstration.after = await readState(page); }
  135 |   };
  136 |   try {
  137 |     expect(build.version).toBe(expectedVersion);
  138 |     for (const [path, hash] of Object.entries(sourceHashes)) expect(build.sourceManifest[path], `Bundle must contain the audited source: ${path}`).toBe(hash);
  139 |     await page.goto(`${entry}?seed=13`);
  140 |     const effects = page.locator('.profile-menu [data-action="effects"]');
  141 |     await expect(effects).toContainText('标准');
  142 |     if (low) await effects.click();
  143 |     await expect(effects).toContainText(low ? '低' : '标准');
  144 |     const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
  145 |     expect(storedQuality ?? false).toBe(low);
  146 |     qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality };
  147 |     await page.locator('[data-action="start"]').click();
  148 |     expect((await readState(page)).world!.width).toBe(2400);
  149 |     await fullRun(page, 'ignore', undefined, true, async state => {
  150 |       const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
  151 |       const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
  152 |       const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
  153 |         ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
  154 |         ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
  155 |         ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
  156 |       await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  157 |       const pending = await readState(page);
  158 |       let replacementSlot: number | undefined;
  159 |       if (pending.growth!.draft?.status === 'replacing') {
  160 |         replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
  161 |         expect(replacementSlot).toBeGreaterThanOrEqual(0);
  162 |         await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
  163 |       }
  164 |       drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
  165 |       await demonstrateAfterDraft();
  166 |     }, async state => {
  167 |       // Observe only: pausing would invalidate fullRun's held-key bookkeeping.
  168 |       await capture(state);
  169 |     });
  170 |     final = await readState(page);
  171 |     expect(final.result?.success).toBe(true);
  172 |     expect(final.campaign!.migration.choice).toBe('ignore');
  173 |     expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
  174 |     expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
  175 |     expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
> 176 |     expect(selected, 'No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite').toBeDefined();
      |                                                                                                                                     ^ Error: No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite
  177 |     expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
  178 |     expect(selected!.commonOcclusionPairs.length).toBeGreaterThan(0);
  179 |     await page.screenshot({ path: info.outputPath('result.png') });
  180 |     await page.locator('[data-action="retry"]').click();
  181 |     retry = await readState(page);
  182 |     expect(retry.seed).toBe(final.seed);
  183 |     expect(retry.growth!.runId).not.toBe(final.growth!.runId);
  184 |     expect(retry.player.hp).toBe(100);
  185 |     expect(retry.growth!.xp).toBe(0);
  186 |     expect(retry.growth!.equipped).toEqual([]);
  187 |     expect(retry.growth!.cells).toEqual([]);
  188 |     expect(retry.growth!.marks).toEqual([]);
  189 |     expect(retry.growth!.beacon).toBeNull();
  190 |     expect(retry.growth!.activations).toEqual({});
  191 |     expect(retry.campaign!.migration.status).toBe('locked');
  192 |     expect(selectImmuneTraceCues(retry)).toEqual([]);
  193 |     expect(errors).toEqual([]); expect(remote).toEqual([]);
  194 |   } finally {
  195 |     writeFileSync(info.outputPath('obstacle-visibility-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, sourceHashes, fadedUpperOpacity: RAISED_OBSTACLE_FADED_OPACITY, captureScope: 'Actual public-input screenshot bracket. Both endpoints contain the same fold/current-cell body overlap and a common fresh marked-bite root. Body/silhouette intersection is the renderer helper result; spacing alone is never sufficient. The bite cell and occluded cell need not be identical. Endpoints are not claimed to equal the PNG tick. Pixel readability still needs human inspection; no same-tick cross-browser A/B or universal no-occlusion claim.', projectionScope: 'Sprite-plane (x=worldX,y=.72*worldY+spriteY) shapes converted with the real sampled camera; these are body bounds and obstacle upper silhouette, excluding beacon cross, labels, marks, hit rings and trails.', drafts, demonstrations, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  196 |   }
  197 | });
  198 | 
```