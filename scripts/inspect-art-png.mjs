import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

/** Reads PNG identity/alpha only. It never edits, derives or selects artwork. */
export async function inspectArtPng(path, { threshold = 8 } = {}) {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) throw new Error('Alpha threshold must be an integer from 1 to 255.');
  const absolutePath = resolve(path), bytes = await readFile(absolutePath), metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png') throw new Error(`Expected a PNG image: ${path}`);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  let transparentPixels = 0, opaquePixels = 0, belowThreshold = 0, visiblePixels = 0;
  let alphaSum = 0, visibleAlphaSum = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * info.channels + info.channels - 1];
    alphaSum += alpha;
    if (alpha === 0) transparentPixels++;
    if (alpha === 255) opaquePixels++;
    if (alpha > 0 && alpha < threshold) belowThreshold++;
    if (alpha < threshold) continue;
    visiblePixels++; visibleAlphaSum += alpha;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const nonempty = visiblePixels > 0;
  return {
    path: absolutePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    canvas: { width: info.width, height: info.height, format: metadata.format, colorSpace: metadata.space,
      channels: metadata.channels, hasAlpha: metadata.hasAlpha ?? false, bitsPerChannel: metadata.bitsPerSample ?? null },
    alpha: {
      threshold, boundsConvention: 'half-open',
      bounds: nonempty ? { left, top, right: right + 1, bottom: bottom + 1, width: right - left + 1, height: bottom - top + 1 } : null,
      paddingPixels: nonempty ? { left, top, right: info.width - right - 1, bottom: info.height - bottom - 1 } : null,
      transparentPixels, opaquePixels, nonzeroPixelsBelowThreshold: belowThreshold, visiblePixels,
      transparentFraction: transparentPixels / (info.width * info.height),
      meanAlpha: alphaSum / (info.width * info.height), meanVisibleAlpha: nonempty ? visibleAlphaSum / visiblePixels : null,
      touchesCanvasEdge: nonempty && (left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1),
    },
    scope: 'Read-only identity, canvas and alpha inspection. Does not prove single-object content, visual quality, correct anchors or animation continuity.',
  };
}

async function main() {
  const args = process.argv.slice(2), paths = [];
  let threshold = 8;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold') { threshold = Number(args[++i]); continue; }
    if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
    paths.push(args[i]);
  }
  if (!paths.length) throw new Error('Usage: node scripts/inspect-art-png.mjs <image.png> [more.png ...] [--threshold 8]');
  const images = [];
  for (const path of paths) images.push(await inspectArtPng(path, { threshold }));
  console.log(JSON.stringify({ schemaVersion: 1, readOnly: true, images }, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(`PNG inspection failed: ${error.message}`); process.exitCode = 1;
});
