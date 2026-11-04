import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const production = dirname(fileURLToPath(import.meta.url)), root = dirname(production);
const originalPath = join(root, 'raw/fantasy.actor.hero.front_right.master/ad1fb31d-2823-4b85-82e6-78974145e195.png');
const outputPath = join(root, 'raw/fantasy.actor.hero.front_right.master/ad1fb31d-2823-4b85-82e6-78974145e195-cross-v02.png');
const original = await readFile(originalPath), sha = b => createHash('sha256').update(b).digest('hex');
if (sha(original) !== 'b61a2baab9f21735090872af7030b6bb87cdb8e17c5b7bcd49158ccbaaed6d15')
  throw new Error('Original hero source hash differs');
const { data, info: { width, height, channels } } = await sharp(original).raw().toBuffer({ resolveWithObject: true });
if (width !== 2048 || height !== 2048 || channels !== 3) throw new Error('Unexpected hero source canvas');
const roi = [1334, 432, 98, 120], target = [80, 127, 139], grayReference = 205;
const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
const candidate = i => {
  const x = i % width, y = Math.floor(i / width);
  if (x < roi[0] || x >= roi[0] + roi[2] || y < roi[1] || y >= roi[1] + roi[3]) return false;
  const values = [...data.subarray(i * 3, i * 3 + 3)];
  // The closed dark outline separates the inspected cross interior from cream shell.
  // Include its bright texture grains so they receive the same hue shift, without touching the outline.
  return Math.min(...values) >= 170;
};
let head = 0, tail = 0;
const enqueue = i => { if (!seen[i] && candidate(i)) { seen[i] = 1; queue[tail++] = i; } };
enqueue(490 * width + 1390);
let left = width, top = height, right = -1, bottom = -1;
while (head < tail) {
  const i = queue[head++], x = i % width, y = Math.floor(i / width);
  left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  enqueue(i - 1); enqueue(i + 1); enqueue(i - width); enqueue(i + width);
}
if (tail < 3000 || tail > 5000 || left <= roi[0] || top <= roi[1]
  || right >= roi[0] + roi[2] - 1 || bottom >= roi[1] + roi[3] - 1)
  throw new Error('Cross fill segmentation did not stay within the inspected cross');
const output = Buffer.from(data), mask = Buffer.alloc(width * height);
for (let n = 0; n < tail; n++) {
  const i = queue[n]; mask[i] = 255;
  for (let c = 0; c < 3; c++) output[i * 3 + c] = Math.max(0, Math.min(255, data[i * 3 + c] + target[c] - grayReference));
}
let changed = 0, outsideRoiDifference = 0, outsideMaskDifference = 0;
for (let i = 0; i < width * height; i++) {
  const difference = [0, 1, 2].some(c => data[i * 3 + c] !== output[i * 3 + c]);
  if (!difference) continue;
  changed++;
  const x = i % width, y = Math.floor(i / width);
  if (x < roi[0] || x >= roi[0] + roi[2] || y < roi[1] || y >= roi[1] + roi[3]) outsideRoiDifference++;
  if (!mask[i]) outsideMaskDifference++;
}
if (outsideRoiDifference || outsideMaskDifference) throw new Error('Unexpected pixels outside cross mask changed');
const png = await sharp(output, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
await writeFile(outputPath, png);
const qaRoot = join(production, 'qa'); await mkdir(qaRoot, { recursive: true });
const crop = { left: 1290, top: 390, width: 200, height: 200 };
const before = await sharp(original).extract(crop).png().toBuffer(), after = await sharp(png).extract(crop).png().toBuffer();
await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } })
  .composite([{ input: before, left: 0, top: 0 }, { input: after, left: 200, top: 0 }])
  .png().toFile(join(qaRoot, 'hero-cross-v02-before-after.png'));
await sharp(mask, { raw: { width, height, channels: 1 } }).extract(crop).png().toFile(join(qaRoot, 'hero-cross-v02-mask.png'));
const report = { originalPath, originalSha256: sha(original), outputPath, outputSha256: sha(png),
  roi, seedSourcePx: [1390, 490], selectedFillBbox: [left, top, right + 1, bottom + 1], selectedFillPixels: tail,
  targetRgb: target, method: 'connected-cross-interior-bounded-by-dark-outline-additive-channel-shift',
  changedPixels: changed, outsideRoiDifference, outsideMaskDifference,
  preserved: ['all pixels outside selected cross fill', 'original dark outline', 'fill texture and per-channel variations',
    'pose', 'helmet', 'face', 'eyes', 'body', 'raw dimensions'],
  alphaStatus: 'unchanged RGB original remains RGB; transparency is a later separate step' };
await writeFile(join(qaRoot, 'hero-cross-v02-revision.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));

