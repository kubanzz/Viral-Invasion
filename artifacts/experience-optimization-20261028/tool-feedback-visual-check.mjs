import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = resolve('artifacts/experience-optimization-20261028/tool-feedback-build');
const out = resolve('artifacts/experience-optimization-20261028/tool-feedback-visual-check-v2');
await mkdir(out, { recursive: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [], errors = [];
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 360, height: 640 }]) {
    for (const low of [false, true]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, offline: true });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${pathToFileURL(join(build, 'index.html')).href}?scenario=training&seed=71`);
      await page.locator('[data-action="start"]').click();
      await page.keyboard.press('Escape');
      const effects = page.locator('#overlay-host [data-action="effects"]');
      await effects.waitFor({ state: 'visible' });
      if (low) await effects.click();
      await page.waitForFunction(expected => document.querySelector('#overlay-host [data-action="effects"]')?.textContent?.includes(expected), low ? '低' : '标准');
      const label = await effects.textContent();
      if (!label?.includes(low ? '低' : '标准')) throw new Error(`quality mismatch: ${label}`);
      await page.locator('[data-action="continue"]').click();
      for (const tool of [1, 2, 3]) {
        await page.keyboard.press(`Digit${tool}`);
        for (const [name, dx, dy] of [['right', 160, 0], ['left', -160, 0], ['up', 0, -160], ['down', 0, 160]]) {
          const before = await page.evaluate(({ dx, dy }) => { const state = window.__viral.snapshot();
            return { player: state.player, screen: window.__viral.toScreen({ x: state.player.x + dx, y: state.player.y + dy }) };
          }, { dx, dy });
          await page.mouse.move(before.screen.x, before.screen.y);
          await page.waitForTimeout(150);
          const observed = await page.evaluate(() => { const s = window.__viral.snapshot();
            return { tick: s.tick, phase: s.phase, tool: s.tool, facing: s.player.facing,
              playerScreen: window.__viral.toScreen(s.player), diagnostics: window.__viral.diagnostics() };
          });
          if (observed.phase !== 'playing' || observed.tool !== tool) throw new Error(`not playing or wrong tool: ${JSON.stringify(observed)}`);
          const expected = Math.atan2(dy, dx), difference = Math.abs(Math.atan2(Math.sin(observed.facing - expected), Math.cos(observed.facing - expected)));
          if (difference > .15) throw new Error(`unexpected ${name} facing ${observed.facing}`);
          const filename = `${viewport.width}-${low ? 'low' : 'standard'}-${tool}-${name}.png`;
          await page.screenshot({ path: join(out, filename) });
          records.push({ viewport, low, tool, direction: name, filename, pointer: before.screen,
            tick: observed.tick, facing: observed.facing, playerScreen: observed.playerScreen });
        }
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
const hash = createHash('sha256').update(await readFile(join(build, 'game.js'))).digest('hex');
await writeFile(join(out, 'report.json'), JSON.stringify({ hash, method: 'Offline headless Chrome, real UI and pointer, untouched training state; screenshots taken after input, so not an inner-browser or human playtest.', errors, records }, null, 2));
if (errors.length) throw Error(JSON.stringify(errors));
console.log(JSON.stringify({ screenshots: records.length, hash, errors }));
