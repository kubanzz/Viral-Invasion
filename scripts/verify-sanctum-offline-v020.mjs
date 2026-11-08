import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const output = resolve(option('--out') ?? 'artifacts/sanctum-v020/offline'); await mkdir(output, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = JSON.parse(await readFile(join(option('--build') ?? 'dist', 'build-meta.json'), 'utf8'));
const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
assert.equal(metadata.version, packageVersion);
assert.equal(metadata.player3D.heldWeapons.length, 4);
const desktop = resolve(option('--desktop') ?? `.tools/release-v${metadata.version}-verified/index.html`);
const mobile = resolve(option('--mobile') ?? 'releases/Viral-Invasion-Mobile.html');
const artifactHashes = {};
for (const path of [desktop, join(dirname(desktop), 'game.js'), mobile]) artifactHashes[path] = sha(await readFile(path));
const helper = await build({ stdin: { contents: "export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure', 'farm', 'house'],
  ownedLegions: ['phagocyte', 'ranger', 'seraph'], legionLoadout: ['seraph', 'ranger'],
  farmPlots: [{ planted: true, growth: 0, grownSeconds: 0, watered: false, pestsCleared: false },
    { planted: true, growth: 1, grownSeconds: 75, watered: true, pestsCleared: false },
    { planted: true, growth: 2, grownSeconds: 150, watered: true, pestsCleared: true }] });
assert.deepEqual(model.parseCampProfile(fixture), fixture, 'Offline fixture must be a valid current-schema save');
const report = { version: metadata.version, pass: false, artifactHashes, cases: [],
  scope: 'Chrome and Edge with network disabled before navigating to actual independently extracted desktop ZIP files and packaged mobile single HTML. Explicit initial ready-camp/collection/crop fixture; production startup and real keyboard movement. Separate battle/camp reports verify mouse and CDP touch actions. Not physical iPhone/Sitecase validation.' };
try {
  for (const channel of ['chrome', 'msedge']) {
    const browser = await chromium.launch({ channel, headless: true, args: ['--allow-file-access-from-files'] });
    try {
      for (const viewport of [{ width: 1366, height: 768 }, { width: 844, height: 390 }, { width: 667, height: 320 }]) {
        const touch = viewport.width !== 1366;
        const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
        await context.addInitScript(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key: model.CAMP_PROFILE_STORAGE_KEY, fixture });
        await context.setOffline(true);
        const page = await context.newPage(), errors = [], externalRequests = [];
        page.on('pageerror', error => errors.push(String(error)));
        page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
        await page.goto(pathToFileURL(touch ? mobile : desktop).href);
        await page.waitForFunction(version => window.__viral?.version.startsWith(version), metadata.version, { timeout: 60000 });
        await page.locator('[data-action="camp-open"]').first().click();
        await page.waitForFunction(() => window.__viral.snapshot().camp && window.__viral.snapshot().phase === 'playing');
        await page.waitForFunction(() => window.__viral.diagnostics().art.player3D?.ready, null, { timeout: 60000 });
        const before = await page.evaluate(() => window.__viral.snapshot());
        const saved = await page.evaluate(() => window.__viral.campProfile().data);
        assert.equal(before.camp.prologue, 'ready'); assert.equal(saved.schemaVersion, fixture.schemaVersion);
        assert.deepEqual(before.camp.builtFacilities, fixture.builtFacilities);
        assert.deepEqual(saved.ownedLegions, fixture.ownedLegions); assert.deepEqual(saved.legionLoadout, fixture.legionLoadout);
        assert.deepEqual(saved.farmPlots.map(plot => plot.planted), [true, true, true]);
        await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
        const after = await page.evaluate(() => window.__viral.snapshot());
        const diagnostics = await page.evaluate(() => window.__viral.diagnostics());
        assert(after.tick > before.tick);
        assert(Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 0);
        assert.equal(diagnostics.art.player3D.error, null);
        for (const clip of metadata.player3D.authoredBladeClips ?? ['Blade_Ready','Blade_FourfoldDash_v020'])
          assert(diagnostics.art.player3D.authoredBladeClips.includes(clip), 'Missing authored blade animation: ' + clip);
        assert.equal(diagnostics.art.signature, metadata.art.inputSignature);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.mobile === 'true'), touch);
        assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
        await page.screenshot({ path: join(output, `${channel}-${viewport.width}.png`) });
        report.cases.push({ channel, viewport, packagedMobile: touch, errors, externalRequests, ticks: after.tick - before.tick,
          artSignature: diagnostics.art.signature, clips: diagnostics.art.player3D.authoredBladeClips,
          campFixture: { schema: saved.schemaVersion, prologue: before.camp.prologue, farmPlots: saved.farmPlots, legions: saved.legionLoadout }, pass: true });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  for (const [path, hash] of Object.entries(artifactHashes)) assert.equal(sha(await readFile(path)), hash, 'Package changed during offline verification');
  report.pass = true;
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, failure: report.failure, output }));
