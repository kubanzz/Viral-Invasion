# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: preparation-v072.spec.ts >> Initial preparation: earned unlock, prepaid growth, honest review, retry and saved replay
- Location: tests\e2e\preparation-v072.spec.ts:122:1

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
        - generic: ●HEART / 01
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
          - strong [ref=e14]: 心脏 67%
          - generic [ref=e15]: 完整度达标
        - generic [ref=e16]:
          - generic [ref=e17]: ◖◗
          - strong [ref=e18]: 肺部 76%
          - generic [ref=e19]: 未激活，不计入复测
      - generic [ref=e20]:
        - generic [ref=e21]:
          - strong [ref=e22]: 00:51
          - text: 作战用时
        - generic [ref=e23]:
          - strong [ref=e24]: "7"
          - text: 净化感染体
        - generic [ref=e25]:
          - strong [ref=e26]: "0"
          - text: 跨器官旅行
      - generic [ref=e27]: SEED 13 · 感染 0% · 全身稳定 100%
      - paragraph [ref=e28]: 本局进化：晶壳 → 裂殖封锁完成 · 病毒滞留心脏，出口仍可通行。母巢：已净化 · 离场损伤 0.0看看本局战术记录，尝试另一条迁移路线或抗体联动。
      - generic [ref=e29]:
        - button "同种子重试" [ref=e30] [cursor=pointer]
        - button "新病例" [ref=e31] [cursor=pointer]
        - button "战术记录" [ref=e32] [cursor=pointer]
        - button "返回主菜单" [ref=e33] [cursor=pointer]
        - button "当前配装详情" [ref=e34] [cursor=pointer]
      - generic "本局两维事实说明" [ref=e36]:
        - article [ref=e37]:
          - heading "治疗质量" [level=4] [ref=e38]
          - paragraph [ref=e39]: 有效修复 25 点 · 1 次；受击 12 点
        - article [ref=e40]:
          - heading "系统掌控" [level=4] [ref=e41]
          - paragraph [ref=e42]: 连锁 1 次 / 1 跳；折射 0 次
      - generic [ref=e43]:
        - generic [ref=e44]: 下一病例 · 现场应答
        - button "准备下一病例 ↗" [ref=e45] [cursor=pointer]
      - group "本局进化与下次战术" [ref=e46]:
        - generic "展开病例复盘：抗体路线与下次战术" [ref=e47] [cursor=pointer]
```

# Test source

```ts
  3   | import { resolve } from 'node:path';
  4   | import { pathToFileURL } from 'node:url';
  5   | import { fullRun } from './fullRunDriver';
  6   | import { aim, readState, walk } from './campaignDriver';
  7   | import { PROTOCOL_IDS, protocolRank } from '../../src/game/protocols';
  8   | import { formatRunMetrics } from '../../src/game/runMetrics';
  9   | import { PROFILE_STORAGE_KEY, type ProfileData } from '../../src/meta/profile';
  10  | import type { DraftOption, ProtocolId } from '../../src/game/growthTypes';
  11  | import type { GameEvent, GameState } from '../../src/game/types';
  12  | 
  13  | const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  14  | const viewportSizes = [{ width: 1366, height: 768 }, { width: 1100, height: 560 }, { width: 800, height: 600 }];
  15  | test.use({ video: 'off', trace: 'retain-on-failure' });
  16  | 
  17  | const readSaved = (page: Page): Promise<ProfileData | null> => page.evaluate(key => {
  18  |   const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null;
  19  | }, PROFILE_STORAGE_KEY);
  20  | 
  21  | async function release(page: Page): Promise<void> {
  22  |   await page.mouse.up();
  23  |   for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key);
  24  | }
  25  | 
  26  | /** This selects real draft buttons; no controller or mutable diagnostic surface is used. */
  27  | async function chooseBeaconBuild(page: Page, state: GameState): Promise<void> {
  28  |   const growth = state.growth!, draft = growth.draft!;
  29  |   if (draft.status === 'replacing') {
  30  |     const index = growth.equipped.findIndex(slot => slot.id !== 'IMMUNE_BEACON');
  31  |     expect(index).toBeGreaterThanOrEqual(0);
  32  |     await page.locator(`[data-action="draft-replace"][data-slot="${index}"]`).click();
  33  |     return;
  34  |   }
  35  |   const order: ProtocolId[] = ['IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE'];
  36  |   const score = (option: DraftOption): number => {
  37  |     if (option.protocolId === 'IMMUNE_BEACON' && !growth.equipped.some(slot => slot.id === 'IMMUNE_BEACON')) return -100;
  38  |     if (option.protocolId === 'IMMUNE_BEACON' && option.kind === 'retune' && (option.rank ?? 1) > protocolRank(growth.equipped.find(slot => slot.id === option.protocolId))) return -80;
  39  |     if (option.kind === 'equip' && growth.equipped.length < 3) return order.indexOf(option.protocolId);
  40  |     if (option.kind === 'retune') return 10 + order.indexOf(option.protocolId);
  41  |     return 30 + order.indexOf(option.protocolId);
  42  |   };
  43  |   const option = draft.options.slice().sort((a, b) => score(a) - score(b))[0];
  44  |   await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  45  | }
  46  | 
  47  | function expectFreshPreparation(state: GameState, protocolId: ProtocolId | null): void {
  48  |   expect(state.phase).toBe('playing');
  49  |   expect(state.growth!.preparation).toEqual({ version: 1, starterProtocolId: protocolId });
  50  |   expect(state.growth!.starterDebt).toBe(protocolId ? 1 : 0);
  51  |   expect(state.growth!.equipped).toEqual(protocolId ? [{ id: protocolId, tuning: 'balanced' }] : []);
  52  |   expect(state.growth!.xp).toBe(0); expect(state.growth!.research).toBe(0); expect(state.growth!.level).toBe(0);
  53  |   expect(state.growth!.draft).toBeNull(); expect(state.growth!.pendingResearch).toBeNull();
  54  |   expect(state.growth!.cells).toEqual([]); expect(state.growth!.beacon).toBeNull(); expect(state.growth!.marks).toEqual([]);
  55  |   expect(state.growth!.activations).toEqual({}); expect(state.growth!.rewardedKeys).toEqual([]);
  56  | }
  57  | 
  58  | async function planViewportEvidence(page: Page, info: TestInfo, label: string): Promise<unknown[]> {
  59  |   const evidence: unknown[] = [], frozen = await readState(page);
  60  |   for (const viewport of viewportSizes) {
  61  |     await page.setViewportSize(viewport);
  62  |     const dialog = page.locator('.starting-plan-dialog'), footer = dialog.locator('.starting-plan-footer');
  63  |     await expect(dialog).toBeVisible();
  64  |     const controls: Record<string, unknown> = {};
  65  |     for (const [name, button] of [
  66  |       ['header-close', dialog.locator('.starting-plan-header [data-action="close-starting-plan"]')],
  67  |       ['footer-return', footer.locator('[data-action="close-starting-plan"]')],
  68  |     ] as const) {
  69  |       await expect(button).toBeVisible(); await button.click({ trial: true });
  70  |       const box = await button.boundingBox(); expect(box).not.toBeNull();
  71  |       expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  72  |       expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  73  |       expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  74  |       controls[name] = box;
  75  |     }
  76  |     const last = dialog.locator('.starting-plan-card').last();
  77  |     await last.scrollIntoViewIfNeeded();
  78  |     const box = await last.boundingBox(), scroll = await dialog.locator('.starting-plan-scroll').boundingBox();
  79  |     expect(box).not.toBeNull(); expect(scroll).not.toBeNull();
  80  |     expect(box!.y).toBeGreaterThanOrEqual(scroll!.y - 1);
  81  |     expect(box!.y + box!.height).toBeLessThanOrEqual(scroll!.y + scroll!.height + 1);
  82  |     const extent = await dialog.locator('.starting-plan-scroll').evaluate(element => ({
  83  |       scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
  84  |     }));
  85  |     expect(extent.scrollHeight).toBeGreaterThan(extent.clientHeight); expect(extent.scrollTop).toBeGreaterThan(0);
  86  |     const after = await readState(page); expect(after.tick).toBe(frozen.tick); expect(after.phase).toBe(frozen.phase);
  87  |     await dialog.screenshot({ path: info.outputPath(`${label}-${viewport.width}x${viewport.height}.png`) });
  88  |     evidence.push({ viewport, controls, finalCard: box, scroll, extent, tick: after.tick });
  89  |   }
  90  |   await page.setViewportSize(viewportSizes[0]);
  91  |   return evidence;
  92  | }
  93  | 
  94  | async function selectPlan(page: Page, id: 'field' | ProtocolId): Promise<void> {
  95  |   await page.locator(`[data-action="plan-select"][data-plan="${id}"]`).click();
  96  |   await expect(page.locator('.starting-plan-dialog')).toHaveCount(0);
  97  |   expect((await readSaved(page))!.startingPlan).toBe(id);
  98  | }
  99  | 
  100 | async function compareResultReview(page: Page, state: GameState, info: TestInfo, label: string) {
  101 |   const summary = state.runMetrics!.summary, formatted = formatRunMetrics(summary);
  102 |   expect(summary.control.coreCleared).toBe(true);
> 103 |   expect(summary.control.beaconBites).toBeGreaterThan(0);
      |                                       ^ Error: expect(received).toBeGreaterThan(expected)
  104 |   const facts = page.locator('.profile-result-facts .profile-review-dimensions');
  105 |   await facts.scrollIntoViewIfNeeded(); await expect(facts).toBeVisible();
  106 |   await expect(facts.locator('article').nth(0).locator('p')).toHaveText(formatted.care);
  107 |   await expect(facts.locator('article').nth(1).locator('p')).toHaveText(formatted.control);
  108 |   await facts.screenshot({ path: info.outputPath(`${label}-result-facts.png`) });
  109 |   await page.locator('.profile-recap > summary').click();
  110 |   const basis = page.locator('.profile-recap .profile-review-basis');
  111 |   await basis.scrollIntoViewIfNeeded(); await expect(basis).toBeVisible();
  112 |   await expect(basis.locator('li')).toHaveText(formatted.details);
  113 |   await expect(basis).toContainText(formatted.chainDefinition);
  114 |   const saved = (await readSaved(page))!, record = saved.recentRuns.find(run => run.seed === state.seed)!;
  115 |   expect(record.review).toEqual(summary);
  116 |   expect(record.encounter!.preparation).toEqual(state.growth!.preparation);
  117 |   await basis.screenshot({ path: info.outputPath(`${label}-result-basis.png`) });
  118 |   return { summary, displayed: { care: await facts.locator('article').nth(0).locator('p').textContent(), control: await facts.locator('article').nth(1).locator('p').textContent(), details: await basis.locator('li').allTextContents() }, record };
  119 | }
  120 | 
  121 | /** Each project gets a fresh browser context and earns its own unlock through two real victories. */
  122 | test('Initial preparation: earned unlock, prepaid growth, honest review, retry and saved replay', async ({ page, context }, info) => {
  123 |   test.setTimeout(540000);
  124 |   const seed = info.project.name === 'edge' ? 97 : 13;
  125 |   const errors: string[] = [], consoleErrors: string[] = [], remote: string[] = [], failedRequests: unknown[] = [];
  126 |   const checkpoints: Record<string, GameState> = {}, eventMap = new Map<string, GameEvent>();
  127 |   const drafts: unknown[] = [], viewportChecks: unknown[] = [], reviews: unknown[] = [];
  128 |   let firstChosen = false, repaymentObserved = false, nextDraftObserved = false;
  129 |   const observe = (state: GameState) => {
  130 |     for (const event of state.events) eventMap.set(`${state.growth?.runId}:${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
  131 |   };
  132 |   page.on('pageerror', error => errors.push(error.message));
  133 |   page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  134 |   page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  135 |   page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
  136 |   await context.setOffline(true);
  137 |   try {
  138 |     await page.goto(`${entry}?seed=${seed}`);
  139 |     const menu = checkpoints.emptyArchive = await readState(page);
  140 |     expect(menu.phase).toBe('menu'); expect(menu.growth!.equipped).toEqual([]);
  141 |     expect((await readSaved(page))?.unlockedProtocols ?? []).toEqual([]);
  142 |     await page.locator('[data-action="starting-plan"]').click();
  143 |     await expect(page.locator('[data-action="plan-select"]')).toHaveCount(1);
  144 |     await expect(page.locator('[data-action="plan-select"][data-plan="field"]')).toHaveAttribute('aria-pressed', 'true');
  145 |     for (const id of PROTOCOL_IDS) {
  146 |       const card = page.locator(`[data-starting-plan="${id}"]`);
  147 |       await expect(card.locator('[data-action="plan-select"]')).toHaveCount(0);
  148 |       await expect(card.locator('.starting-plan-locked')).toContainText('已结束病例');
  149 |     }
  150 |     viewportChecks.push(...await planViewportEvidence(page, info, 'empty-locked-plans'));
  151 |     await page.locator('[data-starting-plan="IMMUNE_BEACON"] h3').click();
  152 |     expect((await readSaved(page))?.startingPlan ?? 'field').toBe('field');
  153 |     await page.locator('.starting-plan-footer [data-action="close-starting-plan"]').click();
  154 |     await page.locator('[data-action="start"]').click();
  155 |     const field = checkpoints.firstFieldStart = await readState(page); expectFreshPreparation(field, null); observe(field);
  156 | 
  157 |     await fullRun(page, 'block', undefined, true, async state => {
  158 |       observe(state); drafts.push({ run: 'field', tick: state.tick, draft: state.growth!.draft });
  159 |       if (!firstChosen) {
  160 |         checkpoints.fieldFirstXp = state;
  161 |         expect(state.growth!.draft!.source).toBe('xp'); expect(state.growth!.draft!.level).toBe(1);
  162 |         expect(state.growth!.draft!.options.some(option => option.protocolId === 'IMMUNE_BEACON')).toBe(true);
  163 |         await page.screenshot({ path: info.outputPath('field-first-xp-beacon.png') });
  164 |         firstChosen = true;
  165 |       }
  166 |       await chooseBeaconBuild(page, state);
  167 |     }, async state => { observe(state); return false; });
  168 |     const firstWin = checkpoints.fieldVictory = await readState(page); observe(firstWin);
  169 |     expect(firstChosen).toBe(true); expect(firstWin.result).toMatchObject({ success: true });
  170 |     let saved = (await readSaved(page))!;
  171 |     expect(saved.stats.runs).toBe(1); expect(saved.stats.wins).toBe(1); expect(saved.unlockedProtocols).toContain('IMMUNE_BEACON');
  172 |     reviews.push(await compareResultReview(page, firstWin, info, 'field'));
  173 |     await page.locator('[data-action="starting-plan"]').click();
  174 |     await expect(page.locator('[data-action="plan-select"][data-plan="IMMUNE_BEACON"]')).toHaveCount(1);
  175 |     viewportChecks.push(...await planViewportEvidence(page, info, 'earned-plans'));
  176 |     await selectPlan(page, 'IMMUNE_BEACON');
  177 |     await page.locator('[data-action="new"]').click();
  178 |     const prepared = checkpoints.preparedStart = await readState(page); observe(prepared);
  179 |     expectFreshPreparation(prepared, 'IMMUNE_BEACON'); expect(prepared.seed).toBe((seed + 2654435761) >>> 0);
  180 |     expect(prepared.seed).not.toBe(firstWin.seed);
  181 | 
  182 |     // Walk and scan through public inputs; the first squad must deliver real positive damage.
  183 |     const source = prepared.targets.find(target => target.id === 'source-a')!;
  184 |     await walk(page, { x: source.x - 160, y: source.y + 190 }, 25);
  185 |     await aim(page, source); await page.keyboard.press('KeyQ');
  186 |     await expect.poll(async () => (await readState(page)).growth!.cells!.length).toBe(3);
  187 |     checkpoints.firstSquad = await readState(page); observe(checkpoints.firstSquad);
  188 |     await expect.poll(async () => (await readState(page)).runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
  189 |     const bitten = checkpoints.firstBite = await readState(page); observe(bitten);
  190 |     expect(bitten.events.some(event => event.type === 'PROTOCOL_BEACON_HIT' && Number(event.data.damage) > 0)).toBe(true);
  191 |     expect(bitten.growth!.starterDebt).toBe(1);
  192 |     await page.screenshot({ path: info.outputPath('prepared-real-three-cell-bite.png') });
  193 | 
  194 |     await fullRun(page, 'block', undefined, true, async state => {
  195 |       observe(state); drafts.push({ run: 'prepared', tick: state.tick, draft: state.growth!.draft });
  196 |       expect(state.growth!.draft!.source).toBe('xp'); expect(state.growth!.draft!.level).toBeGreaterThanOrEqual(2);
  197 |       if (!nextDraftObserved) {
  198 |         expect(state.growth!.draft!.level).toBe(2); expect(state.growth!.xp).toBeGreaterThanOrEqual(55);
  199 |         expect(state.growth!.starterDebt).toBe(0); checkpoints.preparedNextXp = state; nextDraftObserved = true;
  200 |         await page.screenshot({ path: info.outputPath('prepared-normal-55xp-draft.png') });
  201 |       }
  202 |       await chooseBeaconBuild(page, state);
  203 |     }, async state => {
```