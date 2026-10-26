import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A render-only comparison, deliberately separate from gameplay evidence.
// It calls the shipped drawing paths; it does not start or alter a live run.
const directory = resolve('.tools/silhouette-capture');
await mkdir(directory, { recursive: true });
await mkdir(resolve('artifacts/g1-visual'), { recursive: true });
await build({
  stdin: { contents: `
    import { Renderer } from './src/render/renderer';
    import { drawBattleTarget, traceVirusOutline } from './src/render/battleVisuals';
    import { GameSession } from './src/game/session';
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const source = new GameSession(130026).snapshot();
    const state = {...source, elapsed: 8, player: {...source.player, x: 0, y: 0, moving: false}};
    const render = new Renderer(document.createElement('canvas'));
    const names = ['医疗战士', '普通病毒', '晶壳 CARAPACE', '裂殖 FISSION', '潜伏 MIMIC'];
    const traits = [undefined, undefined, 'CARAPACE', 'FISSION', 'MIMIC'];
    ctx.fillStyle = '#e9e5db'; ctx.fillRect(0, 0, 1020, 490);
    ctx.textAlign = 'left'; ctx.fillStyle = '#293a3d'; ctx.font = '600 24px Microsoft YaHei';
    ctx.fillText('实战尺度 · 实际绘制路径', 36, 44);
    ctx.font = '14px Microsoft YaHei'; ctx.fillStyle = '#687270';
    ctx.fillText('同一世界尺度；病毒半径均为 22，不按外观单独放大。', 36, 72);
    for (let i = 0; i < 5; i++) {
      const x = 118 + i * 194;
      const target = { id: 'sample', role: 'virus', x: 0, y: 0, kind: 'single', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: traits[i] ? [traits[i]] : [], facing: .3, born: 0 };
      ctx.save(); ctx.translate(x, 218); ctx.scale(1, .72);
      if (i === 0) render.drawPlayer(ctx, state); else drawBattleTarget(ctx, target, state);
      ctx.restore();
      const mask = document.createElement('canvas'); mask.width = 150; mask.height = 135;
      const m = mask.getContext('2d'); m.translate(75, 115);
      if (i === 0) { m.scale(1, .72); render.drawPlayer(m, state); }
      else { m.translate(0, -22 * .8); traceVirusOutline(m, traits[i], 22); m.fillStyle = '#111'; m.fill(); }
      m.setTransform(1,0,0,1,0,0); m.globalCompositeOperation = 'source-in'; m.fillStyle = '#11191b'; m.fillRect(0,0,150,135);
      ctx.drawImage(mask, x-75, 255);
      ctx.textAlign = 'center'; ctx.font = '600 13px Microsoft YaHei'; ctx.fillStyle = '#293a3d'; ctx.fillText(names[i], x, 422);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#687270'; ctx.font = '12px Microsoft YaHei';
    ctx.fillText('绘制代码派生对照，非战斗实机截图。黑色病毒轮廓直接调用 traceVirusOutline；玩家直接调用实机 drawPlayer。', 36, 467);
    window.captureComplete = true;
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', outfile: resolve(directory, 'capture.js'), platform: 'browser',
});
await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><meta charset="UTF-8"><style>body{margin:0}canvas{display:block}</style><canvas width="1020" height="490"></canvas><script src="capture.js"></script></html>');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1020, height: 490 }, deviceScaleFactor: 2 });
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(directory, 'index.html')).href);
  await page.waitForFunction(() => window.captureComplete === true);
  await page.screenshot({ path: resolve('artifacts/g1-visual/silhouettes.png') });
} finally { await browser.close(); }
console.log('artifacts/g1-visual/silhouettes.png (render-code comparison, not a gameplay screenshot)');
