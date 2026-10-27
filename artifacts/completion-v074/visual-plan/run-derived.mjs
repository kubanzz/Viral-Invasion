import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, freeze, hash, unchanged, json } from './guards.mjs';
const options = args(), frozen = freeze(options), output = options.output;
if (!options.snapshot) throw Error('Provide an actual saved GameState --snapshot; no gameplay state is fabricated by this harness.');
const parsed = json(options.snapshot), snapshot = parsed.game === 'viral-invasion' ? parsed : parsed.before?.game === 'viral-invasion' ? parsed.before : parsed.state;
if (snapshot?.game !== 'viral-invasion') throw Error('Expected a real saved snapshot or capture {before:GameState}.');
const report = { status: 'running', pass: false, startedAt: new Date().toISOString(), frozen,
  snapshot: { path: options.snapshot, sha256: hash(options.snapshot), tick: snapshot.tick },
  method: 'Independent actual drawing source imported in an isolated page. Synthetic equal-radius trait samples are explicitly labeled. The live release page is never loaded or mutated.',
  errors: [], remoteRequests: [], limitations: ['Not an actual gameplay screenshot.', 'Not one three-trait formal case.', 'Pixel-mask differences do not prove human recognition.'] };
const save = () => writeFileSync(output + '/report.json', JSON.stringify(report, null, 2));
save(); let browser;
try {
  const bundle = await build({ entryPoints: ['artifacts/completion-v074/visual-plan/render-fixture.ts'], bundle: true, format: 'iife', platform: 'browser', outfile: output + '/fixture.js', metafile: true });
  report.sourceManifest = Object.fromEntries(Object.keys(bundle.metafile.inputs).sort().map(path => [path, hash(path)]));
  writeFileSync(output + '/fixture.html', '<!doctype html><html lang="zh"><meta charset="UTF-8"><style>body{margin:0}canvas{display:block}</style><canvas></canvas><script src="fixture.js"></script></html>');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url())) report.remoteRequests.push(r.url()); });
  await page.goto(pathToFileURL(resolve(output, 'fixture.html')).href);
  await page.waitForFunction(() => typeof window.__visualFixture?.render === 'function');
  report.result = await page.evaluate(snapshot => window.__visualFixture.render(snapshot), snapshot);
  await page.screenshot({ path: output + '/same-scale-color-and-monochrome.png' });
  await context.close();
} catch (error) { report.error = String(error?.stack ?? error); }
finally {
  await browser?.close(); Object.assign(report, unchanged(frozen));
  report.pass = !report.error && report.sourceUnchanged && report.buildUnchanged && report.result?.snapshotUnchanged && !report.errors.length && !report.remoteRequests.length;
  report.status = report.pass ? 'passed' : 'failed'; report.finishedAt = new Date().toISOString(); save();
  process.exitCode = report.pass ? 0 : 1; console.log(JSON.stringify({ output, pass: report.pass, scope: report.method }));
}
