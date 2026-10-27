# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v064-obstacle-visibility.spec.ts >> Feedback 0.6.4: real cells remain readable behind a raised fold in both quality modes, then win and retry cleanly
- Location: tests\e2e\feedback-v064-obstacle-visibility.spec.ts:73:1

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
          - strong [ref=e22]: 01:29
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
  105 |     if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`raised-fold-${quality}-actual.png`)); }
  106 |   };
  107 |   const demonstrateAfterDraft = async () => {
  108 |     const before = await readState(page);
  109 |     if (selected || before.phase !== 'playing' || !pair.every(id => before.growth!.equipped.some(slot => slot.id === id))) return;
  110 |     const fold = activeWorld(before).obstacles.find(obstacle => obstacle.id === 'fold-b');
  111 |     if (!fold || !before.targets.some(target => target.hp > 0 && target.role === 'virus')) {
  112 |       demonstrations.push({ before, skipped: 'The current arena has no fold-b or live virus to lure through public movement.' });
  113 |       return;
  114 |     }
  115 | 
  116 |     // The old driver happened to summon too far north in some runs. Physically
  117 |     // stage northeast of the fold's circular footprint so a pursuing virus can
  118 |     // enter the raised sprite's projected area. The offset matters: enemies
  119 |     // stop 69 units from this player, rather than walking all the way to them.
  120 |     const stagingPoint = { x: fold.x + fold.radius * .5, y: fold.y - fold.radius - before.player.radius - 6 };
  121 |     const collisionMargin = Math.hypot(stagingPoint.x - fold.x, stagingPoint.y - fold.y) - fold.radius - before.player.radius;
  122 |     expect(collisionMargin).toBeGreaterThan(13);
  123 |     const preparation = { fold, stagingPoint, collisionMargin, input: 'mouse.up → real WASD walk → observe live pursuers and real Q/squad cooldowns', afterWalk: null as GameState | null, observations: [] as unknown[] };
  124 |     const demonstration = { before, preparation, target: null as GameState['targets'][number] | null, input: 'legal northeast staging → wait for a real live virus north of fold-b → aim/Q → stop firing/moving for at most three seconds', observations: [] as unknown[], skipped: null as string | null, after: null as GameState | null };
  125 |     demonstrations.push(demonstration);
  126 |     await page.mouse.up();
  127 |     try {
  128 |       // onDraft starts with fullRun's keys released; walk also releases each
  129 |       // real key hold. No position, enemy, HP, clock or equipment is written.
  130 |       await walk(page, stagingPoint, 6);
  131 |       preparation.afterWalk = await readState(page);
  132 |       const lureDeadline = Date.now() + 10000;
  133 |       let target: GameState['targets'][number] | undefined;
  134 |       while (Date.now() < lureDeadline) {
  135 |         const state = await readState(page);
  136 |         preparation.observations.push({ tick: state.tick, phase: state.phase, player: state.player, scanReady: state.scanReady, beaconReadyAt: state.growth!.beaconReadyAt, targets: state.targets.filter(item => item.hp > 0).map(item => ({ id: item.id, role: item.role, x: item.x, y: item.y, hp: item.hp, attackAt: item.attackAt })), cells: state.growth!.cells });
  137 |         if (state.phase !== 'playing' || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id))) break;
  138 |         const candidates = state.targets.filter(candidate => {
  139 |           if (candidate.hp <= 0 || candidate.role !== 'virus' || candidate.y < fold.y - 180 || Math.abs(candidate.x - fold.x) > fold.radius * .8) return false;
  140 |           const distance = Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y);
  141 |           // Let the pursuer actually reach its attack standoff before Q. An
  142 |           // early summon at y≈1010 can leave only the enlarged bite pose
  143 |           // touching the fold, then lose the overlap during the screenshot.
  144 |           const stoppingRange = BATTLE_BALANCE.attackRadius + state.player.radius - 8;
  145 |           if (distance > stoppingRange + 2) return false;
  146 |           const wall = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), distance, activeWorld(state));
  147 |           return wall === null || wall >= distance - 1;
  148 |         }).sort((a, b) => b.hp - a.hp || b.y - a.y);
  149 |         if (candidates.length && state.scanReady <= state.elapsed && state.growth!.beaconReadyAt <= state.elapsed) { target = candidates[0]; break; }
  150 |         if (!state.targets.some(candidate => candidate.hp > 0 && candidate.role === 'virus')) break;
  151 |         await page.waitForTimeout(60);
  152 |       }
  153 |       if (!target) { demonstration.skipped = 'No surviving virus reached the measured north-side window with both actual cooldowns ready; no target was fabricated.'; return; }
  154 |       demonstration.target = target;
  155 |       await aim(page, target); await page.keyboard.press('KeyQ');
  156 |       const deadline = Date.now() + 3000;
  157 |       while (Date.now() < deadline && !selected) {
  158 |         const state = await readState(page);
  159 |         demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, occlusion: activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, ...getRaisedObstacleOcclusion(state, obstacle) })), cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
  160 |         if (state.phase !== 'playing') break;
  161 |         await capture(state); await page.waitForTimeout(40);
  162 |       }
  163 |     } finally { await page.mouse.up(); demonstration.after = await readState(page); }
  164 |   };
  165 |   try {
  166 |     expect(build.version).toBe(expectedVersion);
  167 |     for (const [path, hash] of Object.entries(sourceHashes)) expect(build.sourceManifest[path], `Bundle must contain the audited source: ${path}`).toBe(hash);
  168 |     await page.goto(`${entry}?seed=13`);
  169 |     const effects = page.locator('.profile-menu [data-action="effects"]');
  170 |     await expect(effects).toContainText('标准');
  171 |     if (low) await effects.click();
  172 |     await expect(effects).toContainText(low ? '低' : '标准');
  173 |     const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
  174 |     expect(storedQuality ?? false).toBe(low);
  175 |     qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality };
  176 |     await page.locator('[data-action="start"]').click();
  177 |     expect((await readState(page)).world!.width).toBe(2400);
  178 |     await fullRun(page, 'ignore', undefined, true, async state => {
  179 |       const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
  180 |       const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
  181 |       const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
  182 |         ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
  183 |         ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
  184 |         ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
  185 |       await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  186 |       const pending = await readState(page);
  187 |       let replacementSlot: number | undefined;
  188 |       if (pending.growth!.draft?.status === 'replacing') {
  189 |         replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
  190 |         expect(replacementSlot).toBeGreaterThanOrEqual(0);
  191 |         await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
  192 |       }
  193 |       drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
  194 |       await demonstrateAfterDraft();
  195 |     }, async state => {
  196 |       // Observe only: pausing would invalidate fullRun's held-key bookkeeping.
  197 |       await capture(state);
  198 |     });
  199 |     final = await readState(page);
  200 |     expect(final.result?.success).toBe(true);
  201 |     expect(final.campaign!.migration.choice).toBe('ignore');
  202 |     expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
  203 |     expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
  204 |     expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
> 205 |     expect(selected, 'No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite').toBeDefined();
      |                                                                                                                                     ^ Error: No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite
  206 |     expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
  207 |     expect(selected!.commonOcclusionPairs.length).toBeGreaterThan(0);
  208 |     await page.screenshot({ path: info.outputPath('result.png') });
  209 |     await page.locator('[data-action="retry"]').click();
  210 |     retry = await readState(page);
  211 |     expect(retry.seed).toBe(final.seed);
  212 |     expect(retry.growth!.runId).not.toBe(final.growth!.runId);
  213 |     expect(retry.player.hp).toBe(100);
  214 |     expect(retry.growth!.xp).toBe(0);
  215 |     expect(retry.growth!.equipped).toEqual([]);
  216 |     expect(retry.growth!.cells).toEqual([]);
  217 |     expect(retry.growth!.marks).toEqual([]);
  218 |     expect(retry.growth!.beacon).toBeNull();
  219 |     expect(retry.growth!.activations).toEqual({});
  220 |     expect(retry.campaign!.migration.status).toBe('locked');
  221 |     expect(selectImmuneTraceCues(retry)).toEqual([]);
  222 |     expect(errors).toEqual([]); expect(remote).toEqual([]);
  223 |   } finally {
  224 |     writeFileSync(info.outputPath('obstacle-visibility-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, sourceHashes, fadedUpperOpacity: RAISED_OBSTACLE_FADED_OPACITY, captureScope: 'Actual public-input screenshot bracket. Both endpoints contain the same fold/current-cell body overlap and a common fresh marked-bite root. Body/silhouette intersection is the renderer helper result; spacing alone is never sufficient. The bite cell and occluded cell need not be identical. Endpoints are not claimed to equal the PNG tick. Pixel readability still needs human inspection; no same-tick cross-browser A/B or universal no-occlusion claim.', projectionScope: 'Sprite-plane (x=worldX,y=.72*worldY+spriteY) shapes converted with the real sampled camera; these are body bounds and obstacle upper silhouette, excluding beacon cross, labels, marks, hit rings and trails.', drafts, demonstrations, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  225 |   }
  226 | });
  227 | 
```