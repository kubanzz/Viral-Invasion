import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const output = resolve(process.env.VI_FANTASY_SCENE_OUTPUT ?? 'artifacts/territory-20261103/fantasy-scenes');
const base = process.env.VI_FANTASY_SCENE_URL ?? 'http://127.0.0.1:5173/artifacts/territory-20261103/fantasy-art-scene.html';
const cases = [
  ['heart','initial','overview'],['heart','healthy','overview'],['heart','infected','overview'],
  ['heart','healthy','tree'],['heart','infected','tree'],['heart','healthy','rock'],['heart','infected','rock'],
  ['heart','healthy','healing'],['heart','infected','healing'],['heart','recovering','healing'],
  ['heart','initial','source'],['heart','initial','core'],['heart','closed','valve'],['heart','open','valve'],
  ['lung','infected','overview'],['lung','cleared','overview'],['lung','healthy','tree'],['lung','infected','tree'],
  ['lung','healthy','rock'],['lung','infected','rock'],['lung','closed','airway'],['lung','open','airway'],
  ['training','initial','overview'],['menu','initial','overview'],
];
const requested = process.env.VI_FANTASY_CASE?.split(',');
const selected = requested ? cases.filter(item => requested.includes(item.join('-'))) : cases;
const reports = [], browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir(output, { recursive: true });
const bytes = await readFile(resolve('.art-generated/art-runtime.json'));
const report = { scope: 'Controlled display states through actual production Renderer, art runtime and camera. Not natural gameplay or performance evidence.',
  runtimeSha256: createHash('sha256').update(bytes).digest('hex'), reports };
try {
  for (const [scene, variant, focus] of selected) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(base); url.searchParams.set('scene',scene); url.searchParams.set('variant',variant); url.searchParams.set('focus',focus);
    await page.goto(url.href); await page.waitForFunction(() => window.__fantasyArtProbe?.ready, undefined, { timeout: 30000 });
    const receipt = await page.evaluate(() => window.__fantasyArtProbe.inspect());
    const file = `${scene}-${variant}-${focus}.png`; await page.screenshot({ path: resolve(output,file) });
    reports.push({ file, errors, ...receipt }); await page.close();
    if (errors.length || !receipt.stateUnchanged) throw Error(`Art scene failed: ${file}`);
  }
} finally { await browser.close();
  report.runtimeSha256After = createHash('sha256').update(await readFile(resolve('.art-generated/art-runtime.json'))).digest('hex');
  report.sameRuntimeBytes = report.runtimeSha256 === report.runtimeSha256After;
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)); }
if (!report.sameRuntimeBytes) throw Error('Art runtime changed during capture; repeat these display cases.');
console.log(JSON.stringify({ output, cases: reports.length, errors: reports.flatMap(item => item.errors) }));
