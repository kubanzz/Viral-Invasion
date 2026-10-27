import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fullRun } from './fullRunDriver';
import { aim, readState, walk } from './campaignDriver';
import { PROTOCOL_IDS, protocolRank } from '../../src/game/protocols';
import { formatRunMetrics } from '../../src/game/runMetrics';
import { PROFILE_STORAGE_KEY, type ProfileData } from '../../src/meta/profile';
import type { DraftOption, ProtocolId } from '../../src/game/growthTypes';
import type { GameEvent, GameState } from '../../src/game/types';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const viewportSizes = [{ width: 1366, height: 768 }, { width: 1100, height: 560 }, { width: 800, height: 600 }];
test.use({ video: 'off', trace: 'retain-on-failure' });

const readSaved = (page: Page): Promise<ProfileData | null> => page.evaluate(key => {
  const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null;
}, PROFILE_STORAGE_KEY);

async function release(page: Page): Promise<void> {
  await page.mouse.up();
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key);
}

/** This selects real draft buttons; no controller or mutable diagnostic surface is used. */
async function chooseBeaconBuild(page: Page, state: GameState): Promise<void> {
  const growth = state.growth!, draft = growth.draft!;
  if (draft.status === 'replacing') {
    const index = growth.equipped.findIndex(slot => slot.id !== 'IMMUNE_BEACON');
    expect(index).toBeGreaterThanOrEqual(0);
    await page.locator(`[data-action="draft-replace"][data-slot="${index}"]`).click();
    return;
  }
  const order: ProtocolId[] = ['IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE'];
  const score = (option: DraftOption): number => {
    if (option.protocolId === 'IMMUNE_BEACON' && !growth.equipped.some(slot => slot.id === 'IMMUNE_BEACON')) return -100;
    if (option.protocolId === 'IMMUNE_BEACON' && option.kind === 'retune' && (option.rank ?? 1) > protocolRank(growth.equipped.find(slot => slot.id === option.protocolId))) return -80;
    if (option.kind === 'equip' && growth.equipped.length < 3) return order.indexOf(option.protocolId);
    if (option.kind === 'retune') return 10 + order.indexOf(option.protocolId);
    return 30 + order.indexOf(option.protocolId);
  };
  const option = draft.options.slice().sort((a, b) => score(a) - score(b))[0];
  await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
}

function expectFreshPreparation(state: GameState, protocolId: ProtocolId | null): void {
  expect(state.phase).toBe('playing');
  expect(state.growth!.preparation).toEqual({ version: 1, starterProtocolId: protocolId });
  expect(state.growth!.starterDebt).toBe(protocolId ? 1 : 0);
  expect(state.growth!.equipped).toEqual(protocolId ? [{ id: protocolId, tuning: 'balanced' }] : []);
  expect(state.growth!.xp).toBe(0); expect(state.growth!.research).toBe(0); expect(state.growth!.level).toBe(0);
  expect(state.growth!.draft).toBeNull(); expect(state.growth!.pendingResearch).toBeNull();
  expect(state.growth!.cells).toEqual([]); expect(state.growth!.beacon).toBeNull(); expect(state.growth!.marks).toEqual([]);
  expect(state.growth!.activations).toEqual({}); expect(state.growth!.rewardedKeys).toEqual([]);
}

async function planViewportEvidence(page: Page, info: TestInfo, label: string): Promise<unknown[]> {
  const evidence: unknown[] = [], frozen = await readState(page);
  for (const viewport of viewportSizes) {
    await page.setViewportSize(viewport);
    const dialog = page.locator('.starting-plan-dialog'), footer = dialog.locator('.starting-plan-footer');
    await expect(dialog).toBeVisible();
    const controls: Record<string, unknown> = {};
    for (const [name, button] of [
      ['header-close', dialog.locator('.starting-plan-header [data-action="close-starting-plan"]')],
      ['footer-return', footer.locator('[data-action="close-starting-plan"]')],
    ] as const) {
      await expect(button).toBeVisible(); await button.click({ trial: true });
      const box = await button.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      controls[name] = box;
    }
    const last = dialog.locator('.starting-plan-card').last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox(), scroll = await dialog.locator('.starting-plan-scroll').boundingBox();
    expect(box).not.toBeNull(); expect(scroll).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(scroll!.y - 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(scroll!.y + scroll!.height + 1);
    const extent = await dialog.locator('.starting-plan-scroll').evaluate(element => ({
      scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
    }));
    expect(extent.scrollHeight).toBeGreaterThan(extent.clientHeight); expect(extent.scrollTop).toBeGreaterThan(0);
    const after = await readState(page); expect(after.tick).toBe(frozen.tick); expect(after.phase).toBe(frozen.phase);
    await dialog.screenshot({ path: info.outputPath(`${label}-${viewport.width}x${viewport.height}.png`) });
    evidence.push({ viewport, controls, finalCard: box, scroll, extent, tick: after.tick });
  }
  await page.setViewportSize(viewportSizes[0]);
  return evidence;
}

async function selectPlan(page: Page, id: 'field' | ProtocolId): Promise<void> {
  await page.locator(`[data-action="plan-select"][data-plan="${id}"]`).click();
  await expect(page.locator('.starting-plan-dialog')).toHaveCount(0);
  expect((await readSaved(page))!.startingPlan).toBe(id);
}

async function compareResultReview(page: Page, state: GameState, info: TestInfo, label: string) {
  const summary = state.runMetrics!.summary, formatted = formatRunMetrics(summary);
  expect(summary.control.coreCleared).toBe(true);
  // Carrying unlocks the option; a fast field victory may honestly record zero bites.
  // The prepared case separately earns a witnessed positive-damage bite before its full run.
  if (state.growth!.preparation?.starterProtocolId === 'IMMUNE_BEACON') expect(summary.control.beaconBites).toBeGreaterThan(0);
  const facts = page.locator('.profile-result-facts .profile-review-dimensions');
  await facts.scrollIntoViewIfNeeded(); await expect(facts).toBeVisible();
  await expect(facts.locator('article').nth(0).locator('p')).toHaveText(formatted.care);
  await expect(facts.locator('article').nth(1).locator('p')).toHaveText(formatted.control);
  await facts.screenshot({ path: info.outputPath(`${label}-result-facts.png`) });
  await page.locator('.profile-recap > summary').click();
  const basis = page.locator('.profile-recap .profile-review-basis');
  await basis.scrollIntoViewIfNeeded(); await expect(basis).toBeVisible();
  await expect(basis.locator('li')).toHaveText(formatted.details);
  await expect(basis).toContainText(formatted.chainDefinition);
  const saved = (await readSaved(page))!, record = saved.recentRuns.find(run => run.seed === state.seed)!;
  expect(record.review).toEqual(summary);
  expect(record.encounter!.preparation).toEqual(state.growth!.preparation);
  await basis.screenshot({ path: info.outputPath(`${label}-result-basis.png`) });
  return { summary, displayed: { care: await facts.locator('article').nth(0).locator('p').textContent(), control: await facts.locator('article').nth(1).locator('p').textContent(), details: await basis.locator('li').allTextContents() }, record };
}

/** Each project gets a fresh browser context and earns its own unlock through two real victories. */
test('Initial preparation: earned unlock, prepaid growth, honest review, retry and saved replay', async ({ page, context }, info) => {
  test.setTimeout(540000);
  const seed = info.project.name === 'edge' ? 97 : 13;
  const errors: string[] = [], consoleErrors: string[] = [], remote: string[] = [], failedRequests: unknown[] = [];
  const checkpoints: Record<string, GameState> = {}, eventMap = new Map<string, GameEvent>();
  const drafts: unknown[] = [], viewportChecks: unknown[] = [], reviews: unknown[] = [];
  let firstChosen = false, repaymentObserved = false, nextDraftObserved = false;
  const observe = (state: GameState) => {
    for (const event of state.events) eventMap.set(`${state.growth?.runId}:${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
  };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
  await context.setOffline(true);
  try {
    await page.goto(`${entry}?seed=${seed}`);
    const menu = checkpoints.emptyArchive = await readState(page);
    expect(menu.phase).toBe('menu'); expect(menu.growth!.equipped).toEqual([]);
    expect((await readSaved(page))?.unlockedProtocols ?? []).toEqual([]);
    await page.locator('[data-action="starting-plan"]').click();
    await expect(page.locator('[data-action="plan-select"]')).toHaveCount(1);
    await expect(page.locator('[data-action="plan-select"][data-plan="field"]')).toHaveAttribute('aria-pressed', 'true');
    for (const id of PROTOCOL_IDS) {
      const card = page.locator(`[data-starting-plan="${id}"]`);
      await expect(card.locator('[data-action="plan-select"]')).toHaveCount(0);
      await expect(card.locator('.starting-plan-locked')).toContainText('已结束病例');
    }
    viewportChecks.push(...await planViewportEvidence(page, info, 'empty-locked-plans'));
    await page.locator('[data-starting-plan="IMMUNE_BEACON"] h3').click();
    expect((await readSaved(page))?.startingPlan ?? 'field').toBe('field');
    await page.locator('.starting-plan-footer [data-action="close-starting-plan"]').click();
    await page.locator('[data-action="start"]').click();
    const field = checkpoints.firstFieldStart = await readState(page); expectFreshPreparation(field, null); observe(field);

    await fullRun(page, 'block', undefined, true, async state => {
      observe(state); drafts.push({ run: 'field', tick: state.tick, draft: state.growth!.draft });
      if (!firstChosen) {
        checkpoints.fieldFirstXp = state;
        expect(state.growth!.draft!.source).toBe('xp'); expect(state.growth!.draft!.level).toBe(1);
        expect(state.growth!.draft!.options.some(option => option.protocolId === 'IMMUNE_BEACON')).toBe(true);
        await page.screenshot({ path: info.outputPath('field-first-xp-beacon.png') });
        firstChosen = true;
      }
      await chooseBeaconBuild(page, state);
    }, async state => { observe(state); return false; });
    const firstWin = checkpoints.fieldVictory = await readState(page); observe(firstWin);
    expect(firstChosen).toBe(true); expect(firstWin.result).toMatchObject({ success: true });
    let saved = (await readSaved(page))!;
    expect(saved.stats.runs).toBe(1); expect(saved.stats.wins).toBe(1); expect(saved.unlockedProtocols).toContain('IMMUNE_BEACON');
    reviews.push(await compareResultReview(page, firstWin, info, 'field'));
    await page.locator('[data-action="starting-plan"]').click();
    await expect(page.locator('[data-action="plan-select"][data-plan="IMMUNE_BEACON"]')).toHaveCount(1);
    viewportChecks.push(...await planViewportEvidence(page, info, 'earned-plans'));
    await selectPlan(page, 'IMMUNE_BEACON');
    await page.locator('[data-action="new"]').click();
    const prepared = checkpoints.preparedStart = await readState(page); observe(prepared);
    expectFreshPreparation(prepared, 'IMMUNE_BEACON'); expect(prepared.seed).toBe((seed + 2654435761) >>> 0);
    expect(prepared.seed).not.toBe(firstWin.seed);

    // Walk and scan through public inputs; the first squad must deliver real positive damage.
    const source = prepared.targets.find(target => target.id === 'source-a')!;
    await walk(page, { x: source.x - 160, y: source.y + 190 }, 25);
    await aim(page, source); await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await readState(page)).growth!.cells!.length).toBe(3);
    checkpoints.firstSquad = await readState(page); observe(checkpoints.firstSquad);
    await expect.poll(async () => (await readState(page)).runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
    const bitten = checkpoints.firstBite = await readState(page); observe(bitten);
    expect(bitten.events.some(event => event.type === 'PROTOCOL_BEACON_HIT' && Number(event.data.damage) > 0)).toBe(true);
    expect(bitten.growth!.starterDebt).toBe(1);
    await page.screenshot({ path: info.outputPath('prepared-real-three-cell-bite.png') });

    await fullRun(page, 'block', undefined, true, async state => {
      observe(state); drafts.push({ run: 'prepared', tick: state.tick, draft: state.growth!.draft });
      expect(state.growth!.draft!.source).toBe('xp'); expect(state.growth!.draft!.level).toBeGreaterThanOrEqual(2);
      if (!nextDraftObserved) {
        expect(state.growth!.draft!.level).toBe(2); expect(state.growth!.xp).toBeGreaterThanOrEqual(55);
        expect(state.growth!.starterDebt).toBe(0); checkpoints.preparedNextXp = state; nextDraftObserved = true;
        await page.screenshot({ path: info.outputPath('prepared-normal-55xp-draft.png') });
      }
      await chooseBeaconBuild(page, state);
    }, async state => {
      observe(state);
      if (!repaymentObserved && state.growth!.starterDebt === 0) {
        expect(state.growth!.xp).toBeGreaterThanOrEqual(20); expect(state.growth!.level).toBe(1);
        expect(state.growth!.draft).toBeNull(); expect(state.growth!.pendingLevels).toEqual([]);
        expect(state.growth!.nextXp).toBe(55);
        expect(state.events.some(event => event.type === 'PREPARATION_REPAID' && event.data.level === 1)).toBe(true);
        checkpoints.repaymentWithoutDraft = state; repaymentObserved = true;
        await page.screenshot({ path: info.outputPath('prepared-20xp-repayment.png') });
      }
      return false;
    });
    const secondWin = checkpoints.preparedVictory = await readState(page); observe(secondWin);
    expect(secondWin.result).toMatchObject({ success: true });
    expect(repaymentObserved).toBe(true); expect(nextDraftObserved).toBe(true);
    expect(secondWin.growth!.equipped.some(slot => protocolRank(slot) > 1)).toBe(true);
    expect(secondWin.growth!.protocolHistory.filter(entry => entry.type === 'PREPARATION_REPAID')).toHaveLength(1);
    reviews.push(await compareResultReview(page, secondWin, info, 'prepared'));
    saved = (await readSaved(page))!; expect(saved.stats.runs).toBe(2); expect(saved.stats.wins).toBe(2);
    const preparedRecord = saved.recentRuns.find(run => run.seed === secondWin.seed)!;

    await page.locator('[data-action="starting-plan"]').click(); await selectPlan(page, 'field');
    expect((await readState(page)).growth!.preparation?.starterProtocolId).toBe('IMMUNE_BEACON');
    await page.locator('[data-action="retry"]').click();
    const retry = checkpoints.currentRetry = await readState(page); observe(retry);
    expectFreshPreparation(retry, 'IMMUNE_BEACON'); expect(retry.seed).toBe(secondWin.seed);
    expect(retry.growth!.runId).not.toBe(secondWin.growth!.runId);

    // Reload uses the saved preference for new cases, but a recorded replay owns its original plan.
    await page.reload(); await page.locator('[data-action="profile"]').click();
    const replay = page.locator(`.profile-recent-runs [data-action="replay-record"][data-run-id="${preparedRecord.runId}"]`);
    await replay.scrollIntoViewIfNeeded(); await replay.click();
    const recordedReplay = checkpoints.savedRecordReplay = await readState(page); observe(recordedReplay);
    expectFreshPreparation(recordedReplay, 'IMMUNE_BEACON'); expect(recordedReplay.seed).toBe(secondWin.seed);
    expect((await readSaved(page))!.startingPlan).toBe('field');
    await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
    await page.locator('[data-action="start"]').click();
    const freshField = checkpoints.newFieldCase = await readState(page); observe(freshField); expectFreshPreparation(freshField, null);

    // Stop after the next ordinary first draft; leaving to the menu above was not counted as a defeat.
    const firstSource = freshField.targets.find(target => target.id === 'source-a')!;
    await walk(page, { x: firstSource.x - 160, y: firstSource.y + 190 }, 25);
    await page.keyboard.press('Digit1'); await aim(page, firstSource); await page.mouse.down();
    await expect.poll(async () => (await readState(page)).growth!.draft?.level, { timeout: 15000 }).toBe(1);
    await release(page);
    const finalFieldDraft = checkpoints.newFieldFirstXp = await readState(page); observe(finalFieldDraft);
    expect(finalFieldDraft.growth!.draft!.source).toBe('xp'); expect(finalFieldDraft.growth!.draft!.options).toHaveLength(3);
    expect(finalFieldDraft.growth!.starterDebt).toBe(0);
    expect((await readSaved(page))!.stats).toMatchObject({ runs: 2, wins: 2, losses: 0 });
    await page.screenshot({ path: info.outputPath('new-field-normal-first-xp.png') });
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); expect(remote).toEqual([]); expect(failedRequests).toEqual([]);
  } finally {
    await release(page).catch(() => {});
    writeFileSync(info.outputPath('preparation-evidence.json'), JSON.stringify({ project: info.project.name, seed, checkpoints, drafts, viewportChecks, reviews,
      firstChosen, repaymentObserved, nextDraftObserved, events: [...eventMap.values()], errors, consoleErrors, remote, failedRequests,
      saved: await readSaved(page).catch(() => null), lastState: await readState(page).catch(() => null) }, null, 2));
  }
});
