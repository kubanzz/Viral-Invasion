import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

// This probe only observes. Operate the real browser window with native inputs;
// stdin labels capture checkpoints, and `finish` saves the report and closes it.
const channel = process.argv[2] || 'chrome';
if (!['chrome', 'msedge'].includes(channel)) throw new Error('Use chrome or msedge');
const folder = `artifacts/native-${channel}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel, headless: false, args: ['--window-size=1440,1000'] });
const context = await browser.newContext({ viewport: null, recordVideo: { dir: folder } });
await context.setOffline(true);
const page = await context.newPage();
const report = { channel, version: browser.version(), method: 'OS-native mouse/keyboard actions, read-only Playwright observations', started: new Date().toISOString(), checkpoints: [], pageErrors: [], remoteRequests: [] };
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) report.remoteRequests.push(request.url()); });
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__viral);
async function checkpoint(label) {
  const observed = await page.evaluate(() => ({ at: new Date().toISOString(), focused: document.hasFocus(), hidden: document.hidden, dpr: devicePixelRatio, width: innerWidth, height: innerHeight, state: window.__viral.snapshot(), render: window.__viral.diagnostics() }));
  report.checkpoints.push({ label, ...observed });
  await page.screenshot({ path: `${folder}/${String(report.checkpoints.length).padStart(2,'0')}-${label.replace(/[^a-z0-9-]/gi,'-')}.png` });
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, focused: observed.focused, phase: observed.state.phase, tick: observed.state.tick, dpr: observed.dpr, width: observed.width, player: {x:observed.state.player.x,y:observed.state.player.y}, shots: observed.state.shots, targetHp: observed.state.targets.map(t=>t.hp) }));
}
await checkpoint('initial');
console.log(`Native probe ready: ${channel}. Enter checkpoint labels or finish.`);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  const label = line.trim();
  if (!label) continue;
  if (label === 'finish') break;
  await checkpoint(label);
}
await checkpoint('final');
await context.close();
await browser.close();
console.log(`Saved ${folder}/report.json`);
