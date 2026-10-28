import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const dir = resolve('artifacts/experience-optimization-20261028/tool-feedback-visual-check-v2');
const { records } = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
for (const width of [1366, 360]) for (const low of [false, true]) {
  const subset = records.filter(r => r.viewport.width === width && r.low === low);
  const pieces = [];
  for (let i = 0; i < subset.length; i++) {
    const r = subset[i], size = width === 360 ? 80 : 140;
    const x = Math.max(0, Math.min(r.viewport.width - size, Math.round(r.playerScreen.x - size / 2)));
    const y = Math.max(0, Math.min(r.viewport.height - size, Math.round(r.playerScreen.y - size * .7)));
    const img = await sharp(join(dir, r.filename)).extract({ left:x, top:y, width:size, height:size }).resize(280, 280, { kernel:'nearest' }).png().toBuffer();
    pieces.push({ input:img, left:(i % 4) * 280, top:Math.floor(i / 4) * 280 });
  }
  const buffer = await sharp({ create:{ width:1120, height:840, channels:4, background:'#ffffff' } }).composite(pieces).png().toBuffer();
  await writeFile(join(dir, `contact-${width}-${low ? 'low' : 'standard'}.png`), buffer);
}
