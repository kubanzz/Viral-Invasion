# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-v064-obstacle-visibility.spec.ts >> Feedback 0.6.4: real cells remain readable behind a raised fold in both quality modes, then win and retry cleanly
- Location: tests\e2e\feedback-v064-obstacle-visibility.spec.ts:80:1

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
          - strong [ref=e14]: 心脏 71%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 67%
          - generic [ref=e19]: 完整度达标
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 01:10
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "17"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "1"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 13 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳 → 裂殖放任迁移 · 肺部承担新增感染源风险。母巢：已净化 · 离场损伤 0.0本局选择放任迁移。下次可试试出口追击或隔离闸封锁，比较器官压力。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
        - button "当前配装详情" [ref=e34] [cursor=pointer]
      - generic "本局两维事实说明" [ref=e36]:
        - article [ref=e37]:
          - heading "治疗质量" [level=4] [ref=e38]
          - paragraph [ref=e39]: 有效修复 50 点 · 2 次；受击 0 点
        - article [ref=e40]:
          - heading "系统掌控" [level=4] [ref=e41]
          - paragraph [ref=e42]: 连锁 0 次 / 0 跳；折射 0 次
      - generic [ref=e43]:
        - generic [ref=e44]: 下一病例 · 现场应答
        - button "准备下一病例 ↗" [ref=e45] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e46]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e47] [cursor=pointer]
```

# Test source

```ts
  128 |     const stagingPoint = { x: fold.x + fold.radius * .5, y: fold.y - fold.radius - before.player.radius - 6 };
  129 |     const collisionMargin = Math.hypot(stagingPoint.x - fold.x, stagingPoint.y - fold.y) - fold.radius - before.player.radius;
  130 |     expect(collisionMargin).toBeGreaterThan(13);
  131 |     const beaconGround = { x: fold.x, y: fold.y - 150 };
  132 |     expect(Math.hypot(beaconGround.x - fold.x, beaconGround.y - fold.y) - fold.radius).toBeGreaterThan(12);
  133 |     const preparation = { fold, stagingPoint, collisionMargin, beaconGround, input: 'mouse.up → real WASD walk → observe nearby live virus and real Q/squad cooldowns', afterWalk: null as GameState | null, observations: [] as unknown[] };
  134 |     const demonstration = { before, preparation, target: null as GameState['targets'][number] | null, qBefore: null as GameState | null, squad: null as { beaconId: string; cellIds: string[] } | null, acceptedBites: [] as BiteEvidence[], input: 'coarse legal walk → aim at actual north-side ground/Q → observe bodies and independently accepted bites', observations: [] as unknown[], skipped: null as string | null, after: null as GameState | null };
  135 |     demonstrations.push(demonstration);
  136 |     const collect = (state: GameState) => {
  137 |       const qBefore = demonstration.qBefore, beacon = state.growth?.beacon;
  138 |       if (!qBefore) return;
  139 |       if (!demonstration.squad && beacon && beacon.id !== qBefore.growth?.beacon?.id && beacon.born >= qBefore.elapsed && beacon.mode === 'protocol') {
  140 |         const cells = (state.growth?.cells ?? []).filter(cell => cell.beaconId === beacon.id && cell.organId === state.battle?.organId && cell.until > state.elapsed);
  141 |         if (cells.length === 3) { demonstration.squad = { beaconId: beacon.id, cellIds: cells.map(cell => cell.id) }; demonstratedSquads.add(beacon.id); }
  142 |       }
  143 |       const squad = demonstration.squad;
  144 |       if (!squad) return;
  145 |       for (const event of state.events) {
  146 |         const cellId = String(event.data.cellId);
  147 |         if (event.type !== 'PROTOCOL_BEACON_HIT' || event.tick < qBefore.tick || event.tick > state.tick || event.data.protocolId !== 'IMMUNE_BEACON' || event.data.prioritizedTrace !== true || !(Number(event.data.damage) > 0) || !squad.cellIds.includes(cellId) || event.data.rootId !== `${cellId}:bite:${event.tick}` || demonstration.acceptedBites.some(item => item.event.data.rootId === event.data.rootId)) continue;
  148 |         const target = state.targets.find(item => item.id === event.data.targetId) ?? null;
  149 |         const evidence: BiteEvidence = { beaconId: squad.beaconId, cellId, event, observedTick: state.tick, target, targetResult: target ? target.hp <= 0 ? 'cleared' : 'alive' : 'already-removed' };
  150 |         demonstration.acceptedBites.push(evidence); acceptedBites.push(evidence);
  151 |       }
  152 |     };
  153 |     await page.mouse.up();
  154 |     try {
  155 |       // onDraft starts with fullRun's keys released; walk also releases each
  156 |       // real key hold. No position, enemy, HP, clock or equipment is written.
  157 |       await walk(page, stagingPoint, 18);
  158 |       preparation.afterWalk = await readState(page);
  159 |       const lureDeadline = Date.now() + 10000;
  160 |       let target: GameState['targets'][number] | undefined;
  161 |       while (Date.now() < lureDeadline) {
  162 |         const state = await readState(page);
  163 |         preparation.observations.push({ tick: state.tick, phase: state.phase, player: state.player, scanReady: state.scanReady, beaconReadyAt: state.growth!.beaconReadyAt, targets: state.targets.filter(item => item.hp > 0).map(item => ({ id: item.id, role: item.role, x: item.x, y: item.y, hp: item.hp, attackAt: item.attackAt })), cells: state.growth!.cells });
  164 |         if (state.phase !== 'playing' || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id))) break;
  165 |         const candidates = state.targets.filter(candidate => {
  166 |           if (candidate.hp <= 0 || candidate.role !== 'virus' || Math.hypot(candidate.x - beaconGround.x, candidate.y - beaconGround.y) > 150) return false;
  167 |           const distance = Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y);
  168 |           if (distance > 400) return false;
  169 |           const wall = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), distance, activeWorld(state));
  170 |           return wall === null || wall >= distance - 1;
  171 |         }).sort((a, b) => b.hp - a.hp || b.y - a.y);
  172 |         if (candidates.length && state.scanReady <= state.elapsed && state.growth!.beaconReadyAt <= state.elapsed) { target = candidates[0]; break; }
  173 |         if (!state.targets.some(candidate => candidate.hp > 0 && candidate.role === 'virus')) break;
  174 |         await page.waitForTimeout(60);
  175 |       }
  176 |       if (!target) { demonstration.skipped = 'No surviving virus remained near the actual ground beacon point with both cooldowns ready; no target was fabricated.'; return; }
  177 |       demonstration.target = target;
  178 |       demonstration.qBefore = await readState(page);
  179 |       await aim(page, beaconGround); await page.keyboard.press('KeyQ');
  180 |       const deadline = Date.now() + 3000;
  181 |       while (Date.now() < deadline && (!selected || !demonstration.acceptedBites.length)) {
  182 |         const state = await readState(page);
  183 |         collect(state);
  184 |         demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, occlusion: activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, ...getRaisedObstacleOcclusion(state, obstacle) })), cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
  185 |         if (state.phase !== 'playing') break;
  186 |         await capture(state, collect); await page.waitForTimeout(40);
  187 |       }
  188 |     } finally { await page.mouse.up(); demonstration.after = await readState(page); collect(demonstration.after); }
  189 |   };
  190 |   try {
  191 |     expect(build.version).toBe(expectedVersion);
  192 |     for (const [path, hash] of Object.entries(sourceHashes)) expect(build.sourceManifest[path], `Bundle must contain the audited source: ${path}`).toBe(hash);
  193 |     await page.goto(`${entry}?seed=13`);
  194 |     const effects = page.locator('.profile-menu [data-action="effects"]');
  195 |     await expect(effects).toContainText('标准');
  196 |     if (low) await effects.click();
  197 |     await expect(effects).toContainText(low ? '低' : '标准');
  198 |     const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
  199 |     expect(storedQuality ?? false).toBe(low);
  200 |     qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality };
  201 |     await page.locator('[data-action="start"]').click();
  202 |     expect((await readState(page)).world!.width).toBe(2400);
  203 |     await fullRun(page, 'ignore', undefined, true, async state => {
  204 |       const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
  205 |       const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
  206 |       const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
  207 |         ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
  208 |         ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
  209 |         ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
  210 |       await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  211 |       const pending = await readState(page);
  212 |       let replacementSlot: number | undefined;
  213 |       if (pending.growth!.draft?.status === 'replacing') {
  214 |         replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
  215 |         expect(replacementSlot).toBeGreaterThanOrEqual(0);
  216 |         await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
  217 |       }
  218 |       drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
  219 |       await demonstrateAfterDraft();
  220 |     }, async state => {
  221 |       // Observe only: pausing would invalidate fullRun's held-key bookkeeping.
  222 |       await capture(state);
  223 |     });
  224 |     final = await readState(page);
  225 |     expect(final.result?.success).toBe(true);
  226 |     expect(final.campaign!.migration.choice).toBe('ignore');
  227 |     expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
> 228 |     expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
      |                                                           ^ Error: expect(received).toBeGreaterThan(expected)
  229 |     expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
  230 |     expect(selected, 'No real screenshot bracket preserved the same raised-fold/cell-body overlap for three fully visible current cells').toBeDefined();
  231 |     expect(selected!.commonOcclusionPairs.length).toBeGreaterThan(0);
  232 |     expect(acceptedBites.filter(item => item.beaconId === selected!.before.projection.state.growth!.beacon!.id), 'The screenshot squad must also have a real accepted positive marked bite; its target may legitimately be cleared').not.toHaveLength(0);
  233 |     await page.screenshot({ path: info.outputPath('result.png') });
  234 |     await page.locator('[data-action="retry"]').click();
  235 |     retry = await readState(page);
  236 |     expect(retry.seed).toBe(final.seed);
  237 |     expect(retry.growth!.runId).not.toBe(final.growth!.runId);
  238 |     expect(retry.player.hp).toBe(100);
  239 |     expect(retry.growth!.xp).toBe(0);
  240 |     expect(retry.growth!.equipped).toEqual([]);
  241 |     expect(retry.growth!.cells).toEqual([]);
  242 |     expect(retry.growth!.marks).toEqual([]);
  243 |     expect(retry.growth!.beacon).toBeNull();
  244 |     expect(retry.growth!.activations).toEqual({});
  245 |     expect(retry.campaign!.migration.status).toBe('locked');
  246 |     expect(selectImmuneTraceCues(retry)).toEqual([]);
  247 |     expect(errors).toEqual([]); expect(remote).toEqual([]);
  248 |   } finally {
  249 |     writeFileSync(info.outputPath('obstacle-visibility-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, sourceHashes, fadedUpperOpacity: RAISED_OBSTACLE_FADED_OPACITY, lowerBodyOpacityContract: { value: 1, scope: 'drawRaisedBodyLayers keeps its lower pass at the incoming alpha; separately covered by the pure renderer unit tests, not measured from this PNG.' }, captureScope: 'Actual public-input body screenshot bracket. Both endpoints contain the same fold/current-cell body overlap and same beacon/three living cells, all with actual draw alpha 1 (age >= .2s, lifetime remaining >= .35s). Body/silhouette intersection is the renderer helper result; spacing alone is never sufficient. Accepted marked bites from this Q/squad are collected independently, including snapshot endpoints and finally state; a legitimately cleared target is allowed. A fresh cue is not required in the body PNG and same-frame body/cue evidence is not claimed; the unchanged v062 regression covers fresh cue screenshots. Endpoints are not claimed to equal the PNG tick. Pixel readability still needs human inspection; no cross-browser same-tick A/B or universal no-occlusion claim.', projectionScope: 'Sprite-plane (x=worldX,y=.72*worldY+spriteY) shapes converted with the real sampled camera; these are body bounds and obstacle upper silhouette, excluding beacon cross, labels, marks, hit rings and trails.', drafts, demonstrations, acceptedBites, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  250 |   }
  251 | });
  252 | 
```