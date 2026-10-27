import { chromium, expect, type Locator, type Page, type Browser } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fullRun } from '../tests/e2e/fullRunDriver';
import { readState } from '../tests/e2e/campaignDriver';

// Standalone qualification probe. Preparation/compilation does not launch it.
// Execution uses only actual browser inputs and read-only DOM/game snapshots.
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const output = 'artifacts/completion-v073/result-layout';
if (existsSync(output)) throw new Error('Preserve existing result-layout output; refusing to overwrite.');
mkdirSync(output, { recursive: false });
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = (directory: string): string[] => readdirSync(directory).sort().flatMap(name => {
  const path = directory + '/' + name;
  return statSync(path).isDirectory() ? files(path) : [path];
});
const manifest = () => Object.fromEntries([
  ...files('src'), ...files('tests'), 'index.html', 'playwright.config.ts',
  'package.json', 'package-lock.json', 'scripts/build-offline.mjs',
].map(path => [path, sha(path)]));
const built = () => Object.fromEntries(['dist/game.js', 'dist/index.html', 'dist/build-meta.json'].map(path => [path, sha(path)]));
const expectedBundle = '71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54';
const beforeSource = manifest(), beforeBuild = built();
const build = JSON.parse(readFileSync('dist/build-meta.json', 'utf8'));
const buildInputChecks = Object.entries(build.sourceManifest as Record<string, string>).map(([path, expectedSha256]) => ({ path, expectedSha256, actualSha256: sha(path), match: sha(path) === expectedSha256 }));
const compilerMeta = JSON.parse(readFileSync('.tools/result-layout-v073-meta.json', 'utf8'));
const driverSourceManifest = Object.fromEntries(Object.keys(compilerMeta.inputs).sort().map(path => [path, sha(path)]));
const pageErrors: unknown[] = [], consoleErrors: unknown[] = [], requests: unknown[] = [], remoteRequests: unknown[] = [], requestFailures: unknown[] = [];
const report: any = {
  schemaVersion: 1, version: '0.7.3', status: 'running', pass: false,
  startedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: ['node', '.tools/result-layout-v073.mjs'], browser: 'installed Chrome, headless, fresh isolated context',
  method: 'One seed1 pursue victory through the existing fullRun/campaignDriver and real DOM inputs. Same frozen result inspected at four viewport sizes. Wheel scrolling, actual recap/archive clicks and main-action trial clicks; no game, clock, HP, position, profile or DOM writes, and no screenshot-derived geometry claim.',
  scope: 'Main retry/new/history/menu buttons are checked for viewport/clipping/hit target and Playwright actionability without activating navigation. Recap and archive are actually opened. Compact windows require real-scroll reachability; 1920x1080 and 1366x768 also require the collapsed recap on the initial screen. This is not Ctrl zoom, native OS focus, human readability or FPS evidence.',
  sourceManifestBefore: beforeSource, buildFilesBefore: beforeBuild, driverSourceManifest,
  probeSha256: sha('.tools/result-layout-v073.mjs'), compilerMetafileSha256: sha('.tools/result-layout-v073-meta.json'),
  buildInputChecks, pageErrors, consoleErrors, requests, remoteRequests, requestFailures,
  viewports: [], failures: [],
};
const save = () => writeFileSync(output + '/report.json', JSON.stringify(report, null, 2));
save();

async function settled(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function geometry(locator: Locator) {
  return locator.evaluate(element => {
    const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const own = rect(element), chain: any[] = [];
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node), r = rect(node);
      const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX), clipsY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (clipsX) { left = Math.max(left, r.left + node.clientLeft); right = Math.min(right, r.left + node.clientLeft + node.clientWidth); }
      if (clipsY) { top = Math.max(top, r.top + node.clientTop); bottom = Math.min(bottom, r.top + node.clientTop + node.clientHeight); }
      if (clipsX || clipsY) chain.push({ tag: node.tagName, className: node.className, rect: r, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowX: style.overflowX, overflowY: style.overflowY });
    }
    const clipped = { left: Math.max(left, own.left), right: Math.min(right, own.right), top: Math.max(top, own.top), bottom: Math.min(bottom, own.bottom) };
    const visibleWidth = Math.max(0, clipped.right - clipped.left), visibleHeight = Math.max(0, clipped.bottom - clipped.top);
    const fullyVisible = own.width > 0 && own.height > 0 && visibleWidth >= own.width - 1 && visibleHeight >= own.height - 1;
    const cx = (own.left + own.right) / 2, cy = (own.top + own.bottom) / 2, hit = document.elementFromPoint(cx, cy);
    const style = getComputedStyle(element);
    return { rect: own, clip: { left, top, right, bottom }, clipped, fullyVisible, visibleWidth, visibleHeight,
      centerHit: !!hit && (hit === element || element.contains(hit)), hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.slice(0, 120) } : null,
      display: style.display, visibility: style.visibility, opacity: style.opacity, scrollAncestors: chain, viewport: { width: innerWidth, height: innerHeight } };
  });
}

async function wheelAtModal(page: Page, deltaY: number) {
  const box = await page.locator('.campaign-modal:has(> .profile-recap)').boundingBox();
  if (!box) throw new Error('Missing result modal during real wheel input.');
  const viewport = page.viewportSize()!;
  await page.mouse.move(Math.max(10, Math.min(viewport.width - 10, box.x + box.width * .72)), Math.max(10, Math.min(viewport.height - 10, box.y + box.height * .45)));
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(80);
  await settled(page);
}

async function topByWheel(page: Page) {
  const observations = [];
  for (let i = 0; i < 4; i++) {
    await wheelAtModal(page, -5000);
    const g = await geometry(page.locator('.profile-recap > summary'));
    observations.push(g);
    if (g.scrollAncestors.every((item: any) => item.scrollTop <= 1)) break;
  }
  return observations;
}

async function reachByWheel(page: Page, locator: Locator) {
  const observations = [];
  for (let i = 0; i < 18; i++) {
    const g = await geometry(locator);
    observations.push(g);
    if (g.fullyVisible && g.centerHit && g.display !== 'none' && g.visibility === 'visible') return { pass: true, observations, final: g };
    const delta = g.rect.bottom > g.clip.bottom + 1 ? 260 : g.rect.top < g.clip.top - 1 ? -260 : 160;
    await wheelAtModal(page, delta);
  }
  return { pass: false, observations, final: await geometry(locator) };
}

let browser: Browser | undefined;
try {
  if (build.version !== '0.7.3' || beforeBuild['dist/game.js'] !== expectedBundle || buildInputChecks.some(check => !check.match)) throw new Error('Expected frozen v0.7.3 bundle and matching build inputs.');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  report.browserVersion = browser.version();
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => { pageErrors.push({ at: new Date().toISOString(), message: error.message, stack: error.stack }); });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ at: new Date().toISOString(), text: message.text(), location: message.location() }); });
  page.on('request', request => { const item = { at: new Date().toISOString(), method: request.method(), url: request.url(), resourceType: request.resourceType() }; requests.push(item); if (/^https?:/.test(item.url)) remoteRequests.push(item); });
  page.on('requestfailed', request => requestFailures.push({ at: new Date().toISOString(), url: request.url(), failure: request.failure() }));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?seed=1');
  report.initialProfile = await page.evaluate(() => localStorage.getItem('viral-invasion:1:profile'));
  await page.locator('[data-action="start"]').click();
  report.start = await readState(page);
  if (report.start.growth.equipped.length !== 0) throw new Error('Fresh first run must start with empty field preparation.');
  await fullRun(page, 'pursue', undefined, true);
  const final = await readState(page);
  if (!final.result?.success || final.phase !== 'result') throw new Error('Normal public-input seed1 did not win.');
  report.victory = final;
  writeFileSync(output + '/victory.json', JSON.stringify(final, null, 2));

  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1100, height: 560 }, { width: 800, height: 600 }]) {
    const label = size.width + 'x' + size.height;
    const record: any = { ...size, pass: false, firstScreenRequired: size.height >= 768, actions: [], failures: [] };
    report.viewports.push(record);
    try {
      await page.setViewportSize(size);
      await settled(page);
      const recap = page.locator('details.profile-recap'), summary = recap.locator('summary');
      if (await recap.getAttribute('open') !== null) {
        const reach = await reachByWheel(page, summary);
        if (!reach.pass) throw new Error('Cannot reach open recap summary to collapse through input.');
        await summary.click();
      }
      await expect(recap).not.toHaveAttribute('open');
      record.topReset = await topByWheel(page);
      record.collapsedInitial = await geometry(summary);
      await page.screenshot({ path: output + '/' + label + '-collapsed-initial.png' });
      if (record.firstScreenRequired && !record.collapsedInitial.fullyVisible) throw new Error('Collapsed recap is outside the required initial screen.');
      for (const action of ['retry', 'new', 'history', 'menu']) {
        const locator = page.locator('.campaign-modal > .actions [data-action="' + action + '"]');
        const reach = await reachByWheel(page, locator);
        const item: any = { action, reach, enabled: await locator.isEnabled(), pass: false };
        record.actions.push(item);
        if (!reach.pass || !item.enabled) throw new Error('Unreachable or disabled main action: ' + action);
        await locator.click({ trial: true });
        item.afterTrial = await geometry(locator);
        item.pass = item.afterTrial.fullyVisible && item.afterTrial.centerHit;
        if (!item.pass) throw new Error('Main action lost visible hit area: ' + action);
      }
      await page.screenshot({ path: output + '/' + label + '-main-actions.png' });
      record.summaryReach = await reachByWheel(page, summary);
      if (!record.summaryReach.pass) throw new Error('Collapsed recap cannot be reached by real wheel input.');
      await page.screenshot({ path: output + '/' + label + '-collapsed-reached.png' });
      await summary.click();
      await expect(recap).toHaveAttribute('open');
      record.expandedSummary = await geometry(summary);
      const archive = page.locator('.profile-result-link');
      record.expandedTailReach = await reachByWheel(page, archive);
      if (!record.expandedTailReach.pass) throw new Error('Expanded recap archive entry cannot be reached by real wheel input.');
      record.expandedText = await page.locator('.profile-recap-content').innerText();
      await page.screenshot({ path: output + '/' + label + '-expanded-tail.png' });
      await archive.click();
      await expect(page.locator('.profile-dialog')).toBeVisible();
      await page.screenshot({ path: output + '/' + label + '-archive-open.png' });
      await page.locator('.profile-dialog [data-action="close-profile"]').last().click();
      await expect(page.locator('details.profile-recap')).toBeVisible();
      record.resultAfter = await readState(page);
      record.resultFrozen = JSON.stringify(record.resultAfter) === JSON.stringify(final);
      if (!record.resultFrozen) throw new Error('Viewing/scaling the result changed the finished game snapshot.');
      record.pass = true;
    } catch (error) {
      record.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : undefined });
      await page.screenshot({ path: output + '/' + label + '-failed.png' }).catch(() => undefined);
    }
    save();
  }
  await context.close();
} catch (error) {
  report.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : undefined });
} finally {
  await browser?.close().catch(error => report.failures.push({ browserClose: String(error) }));
  report.sourceManifestAfter = manifest();
  report.buildFilesAfter = built();
  report.sourceMismatches = [...new Set([...Object.keys(beforeSource), ...Object.keys(report.sourceManifestAfter)])].filter(path => beforeSource[path] !== report.sourceManifestAfter[path]);
  report.buildMismatches = Object.keys(beforeBuild).filter(path => beforeBuild[path] !== report.buildFilesAfter[path]);
  report.sourceUnchanged = report.sourceMismatches.length === 0;
  report.bundleUnchanged = report.buildMismatches.length === 0;
  report.pass = report.failures.length === 0 && report.viewports.length === 4 && report.viewports.every((item: any) => item.pass)
    && report.sourceUnchanged && report.bundleUnchanged && pageErrors.length === 0 && consoleErrors.length === 0 && remoteRequests.length === 0 && requestFailures.length === 0;
  report.status = report.pass ? 'passed' : 'failed';
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ pass: report.pass, status: report.status, viewports: report.viewports.map((item: any) => ({ width: item.width, height: item.height, pass: item.pass })), sourceUnchanged: report.sourceUnchanged, bundleUnchanged: report.bundleUnchanged, report: output + '/report.json' }));
  process.exitCode = report.pass ? 0 : 1;
}
