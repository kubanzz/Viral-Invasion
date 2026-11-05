/**
 * Expedition v1 source processing only. Does not submit generation or touch frozen art.
 * Run from the repository root:
 *   node asserts/ViralInvasion_Expedition_v1/production/process-expedition-sources.mjs
 * Optional first argument: a spec JSON inside Expedition_v1 (default production/source-spec.json).
 *
 * Spec: { sources: [{ key, rawPath, crop?, sourceGround?, targetHeightPx?,
 *                    whiteMin?, chromaMax?, holes?, runId?, prompt?, sourceVersion? }] }
 * rawPath is absolute or relative to Expedition_v1. crop uses original image pixels.
 * sourceGround and holes use CROPPED image coordinates (original coordinates if no crop).
 * Actors keep512 square/.5,.85 foot. Icons use contract canvas256 square/.5,.5 center.
 * Existing output PNGs are never overwritten. Sources and QA carry zero runtime credit.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeReviewedSourceCutout } from '../../ViralInvasion_Fantasy_Actors_v2/production/process-source-masters.mjs';
import { inspectImage } from '../../ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs';

const PRODUCTION = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(PRODUCTION);
const CANVAS = [512, 512], GROUND = [256, 435.2];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rootRelative = file => relative(ROOT, file).replaceAll('\\', '/');
const png = image => sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
  .png({ compressionLevel: 9 }).toBuffer();
function sourceNames(entry) {
  const version = entry.sourceVersion ?? 'v01';
  if (!/^v[0-9]{2,}$/.test(version)) throw new Error('sourceVersion must be vNN: ' + version);
  return { version, master: 'sources/' + entry.key + '/master_' + version + '.png',
    qaStem: entry.key.replaceAll('/', '.') + (entry.sourceVersion ? '.' + version : '') };
}

function pair(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(n => !Number.isFinite(n)))
    throw new Error(label + ' must contain two finite numbers');
  return value;
}
async function guarded(file) {
  const absolute = resolve(ROOT, file), rel = relative(ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('All outputs must stay inside Expedition_v1');
  let cursor = absolute;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Output symlinks or junctions are unsupported'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === ROOT) break;
    cursor = dirname(cursor);
  }
  return absolute;
}
async function assertAbsent(file) {
  const absolute = await guarded(file);
  try { await lstat(absolute); }
  catch (error) { if (error.code === 'ENOENT') return absolute; throw error; }
  throw new Error('Refusing to overwrite existing output: ' + rootRelative(absolute));
}
async function writePng(file, buffer) {
  const absolute = await assertAbsent(file);
  await mkdir(await guarded(dirname(absolute)), { recursive: true });
  await writeFile(absolute, buffer, { flag: 'wx' });
  return { path: rootRelative(absolute), sha256: sha(buffer), bytes: buffer.length };
}
async function writeReport(file, object) {
  const absolute = await guarded(file), temp = await guarded(file + '.' + randomUUID() + '.tmp');
  await mkdir(await guarded(dirname(absolute)), { recursive: true });
  await writeFile(temp, JSON.stringify(object, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  await rename(temp, absolute);
}
async function rgba(buffer) {
  const { data, info } = await sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) if (!data[p + 3]) data.fill(0, p, p + 3);
  return { data, width: info.width, height: info.height };
}
function alphaSummary(image) {
  let transparent = 0, partial = 0, opaque = 0, hiddenRgb = 0, borderVisible = 0;
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const p = (y * image.width + x) * 4, a = image.data[p + 3];
    if (a === 0) { transparent++; if (image.data[p] || image.data[p + 1] || image.data[p + 2]) hiddenRgb++; }
    else if (a === 255) opaque++; else partial++;
    if (a < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) borderVisible++;
  }
  return { transparent, partial, opaque, hiddenRgb, borderVisible,
    visible: opaque + partial, bbox: right < 0 ? null : [left, top, right + 1, bottom + 1] };
}

/**
 * Reviewed low-threshold neutral matte branch, local to Expedition_v1.
 * Only edge/seed-connected neutral pixels are removed. A closed warm-brown outline
 * protects enclosed cream paint; an open/light outline can still leak and needs review.
 * No shadow/body semantics are inferred from colour alone.
 */
export async function neutralBackgroundCutout(buffer, options = {}) {
  const source = await rgba(buffer), { width, height } = source;
  const whiteMin = options.whiteMin ?? 185, chromaMax = options.chromaMax ?? 27;
  if (!Number.isFinite(whiteMin) || whiteMin < 0 || whiteMin > 255 || !Number.isFinite(chromaMax) || chromaMax < 0 || chromaMax > 255)
    throw new Error('Neutral matte thresholds must be in [0,255]');
  const count = width * height, seen = new Uint8Array(count), queue = new Uint32Array(count);
  const output = Buffer.from(source.data); let head = 0, tail = 0;
  const neutral = i => {
    const p = i * 4, r = source.data[p], g = source.data[p + 1], b = source.data[p + 2];
    return source.data[p + 3] < 8 || Math.min(r, g, b) >= whiteMin && Math.max(r, g, b) - Math.min(r, g, b) <= chromaMax;
  };
  const add = i => { if (!seen[i] && neutral(i)) { seen[i] = 1; queue[tail++] = i; } };
  const neighbours = (i, fn) => {
    const x = i % width; if (x) fn(i - 1); if (x + 1 < width) fn(i + 1);
    if (i >= width) fn(i - width); if (i + width < count) fn(i + width);
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) neighbours(queue[head++], add);
  const edgeConnectedPixels = tail, holes = [];
  for (const seed of options.holes ?? []) {
    const [sx, sy] = pair(seed, 'hole seed').map(Math.round);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height || !neutral(sy * width + sx))
      throw new Error('Hole seed must identify a neutral pixel inside the cropped image: ' + seed);
    const before = tail; add(sy * width + sx); while (head < tail) neighbours(queue[head++], add);
    holes.push({ seed, newlyRemovedPixels: tail - before });
  }
  for (let i = 0; i < count; i++) if (seen[i]) output.fill(0, i * 4, i * 4 + 4);
  let unmattedPixels = 0;
  if (options.edgeUnmatte !== false) {
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x, p = i * 4;
      if (seen[i] || source.data[p + 3] < 240) continue;
      let boundary = false; neighbours(i, j => { if (seen[j]) boundary = true; });
      if (!boundary) continue;
      const colour = [source.data[p], source.data[p + 1], source.data[p + 2]];
      const luma = colour.reduce((a, b) => a + b, 0) / 3;
      if (luma < 100 || luma > 250) continue;
      let foreground = null, bestLuma = luma - 12;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx, q = j * 4;
        if (seen[j] || source.data[q + 3] < 240) continue;
        let touchesMatte = false; neighbours(j, n => { if (seen[n]) touchesMatte = true; });
        if (touchesMatte) continue;
        const value = [source.data[q], source.data[q + 1], source.data[q + 2]], mean = value.reduce((a, b) => a + b, 0) / 3;
        if (mean < bestLuma) { bestLuma = mean; foreground = value; }
      }
      if (!foreground) continue;
      const delta = foreground.map(v => v - 255), denominator = delta.reduce((sum, v) => sum + v * v, 0);
      const alpha = Math.max(.2, Math.min(1, colour.reduce((sum, v, c) => sum + (v - 255) * delta[c], 0) / denominator));
      if (alpha > .96) continue;
      // Undo a white matte at the immediate contour only; never recolour interior pixels.
      output[p + 3] = Math.round(source.data[p + 3] * alpha);
      for (let c = 0; c < 3; c++) output[p + c] = Math.max(0, Math.min(255, Math.round((colour[c] - 255 * (1 - alpha)) / alpha)));
      unmattedPixels++;
    }
  }
  return { buffer: await png({ ...source, data: output }), report: {
    method: 'Expedition_v1-border-and-explicit-hole-connected-neutral-background-key', whiteMin, chromaMax,
    candidateRule: 'min(R,G,B)>=whiteMin && max(R,G,B)-min(R,G,B)<=chromaMax',
    edgeConnectedPixels, totalRemovedPixels: tail, holes, edgeUnmatte: options.edgeUnmatte !== false, unmattedPixels,
    limitations: ['Neutral shadow and neutral body paint are not semantically distinguished.',
      'Closed warm contour protects enclosed cream; an open or threshold-neutral contour may leak and requires actual image review.',
      'One-pixel boundary white-unmatte estimates foreground from nearby opaque interior; disable edgeUnmatte if it alters authored contour paint.'],
  } };
}

// Inverse affine sampling uses premultiplied alpha, preserving soft contours without white/black halos.
function registerRgba(source, scale, translation, canvas = CANVAS) {
  const data = Buffer.alloc(canvas[0] * canvas[1] * 4);
  for (let y = 0; y < canvas[1]; y++) for (let x = 0; x < canvas[0]; x++) {
    const sx = (x + .5 - translation[0]) / scale - .5;
    const sy = (y + .5 - translation[1]) / scale - .5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0; const rgb = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x0 + dx, yy = y0 + dy;
      if (xx < 0 || yy < 0 || xx >= source.width || yy >= source.height) continue;
      const from = (yy * source.width + xx) * 4;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), a = source.data[from + 3] / 255;
      alpha += a * weight;
      for (let c = 0; c < 3; c++) rgb[c] += source.data[from + c] * a * weight;
    }
    const to = (y * canvas[0] + x) * 4;
    data[to + 3] = Math.round(alpha * 255);
    if (data[to + 3]) for (let c = 0; c < 3; c++) data[to + c] = Math.max(0, Math.min(255, Math.round(rgb[c] / alpha)));
  }
  return { data, width: canvas[0], height: canvas[1] };
}
async function qaBuffers(buffer) {
  const metadata = await sharp(buffer).metadata(), width = metadata.width, height = metadata.height;
  const black = await sharp(buffer).flatten({ background: '#161c20' }).png().toBuffer();
  const white = await sharp(buffer).flatten({ background: '#ffffff' }).png().toBuffer();
  const alpha = await sharp(buffer).extractChannel('alpha').png().toBuffer();
  const blackWhite = await sharp({ create: { width: width * 2, height, channels: 3, background: '#ffffff' } })
    .composite([{ input: black, left: 0, top: 0 }, { input: white, left: width, top: 0 }]).png().toBuffer();
  const small64 = await sharp(buffer).resize(64, 64, { kernel: 'lanczos3' }).png().toBuffer();
  const small32 = await sharp(buffer).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer();
  const preview = await sharp({ create: { width: 640, height: 384, channels: 3, background: '#b9c6c0' } })
    .composite([
      { input: small64, left: 16, top: 16 }, { input: small32, left: 100, top: 16 },
      { input: await sharp(small64).resize(256, 256, { kernel: 'nearest' }).png().toBuffer(), left: 16, top: 112 },
      { input: await sharp(small32).resize(256, 256, { kernel: 'nearest' }).png().toBuffer(), left: 352, top: 112 },
    ]).png().toBuffer();
  return { 'black-white': blackWhite, alpha, '64px': small64, '32px': small32, 'small-preview': preview };
}

export async function processExpeditionSources(specFile = join(PRODUCTION, 'source-spec.json')) {
  const specPath = await guarded(specFile);
  const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^\uFEFF/, ''));
  const contract = JSON.parse((await readFile(join(PRODUCTION, 'asset-contract.json'), 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(spec.sources) || !spec.sources.length) throw new Error('source-spec.json requires nonempty sources');
  const keys = new Set();
  const qaNames = ['black-white', 'alpha', '64px', '32px', 'small-preview'];
  for (const entry of spec.sources) {
    if (typeof entry.key !== 'string' || !entry.key.split('/').every(p => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && !p.includes('..')) || keys.has(entry.key))
      throw new Error('Invalid or duplicate source key: ' + entry.key);
    if (typeof entry.rawPath !== 'string' || !entry.rawPath.trim()) throw new Error(entry.key + ': rawPath is required');
    keys.add(entry.key);
    const names = sourceNames(entry);
    await assertAbsent(names.master);
    for (const name of qaNames) await assertAbsent('production/qa/sources/' + names.qaStem + '.' + name + '.png');
  }
  const reportPath = join(PRODUCTION, 'source-processing.json');
  let previous = { schemaVersion: 1, scope: 'Expedition_v1-source-processing-only', sources: [] };
  try {
    previous = JSON.parse((await readFile(await guarded(reportPath), 'utf8')).replace(/^\uFEFF/, ''));
    if (previous.scope !== 'Expedition_v1-source-processing-only' || !Array.isArray(previous.sources))
      throw new Error('Refusing to replace an unrelated source-processing report');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const processed = [];
  for (const entry of spec.sources) {
    const names = sourceNames(entry);
    const entity = contract.entities.find(e => e.key === (entry.entity ?? entry.key.split('/')[0]));
    if (!entity) throw new Error('Unknown source entity in contract: ' + entry.key);
    const icon = entity.kind === 'icon', canvas = entry.targetCanvas ?? entry.canvas ?? entity.canvas ?? CANVAS;
    if (!Array.isArray(canvas) || canvas.length !== 2 || canvas[0] !== canvas[1] || !(icon ? [256,512] : [512]).includes(canvas[0]))
      throw new Error(entry.key + ': actor canvas must be512²; icon canvas256² or512²');
    const pivot = entry.pivot ?? entity.pivot ?? (icon ? [.5,.5] : [.5,.85]);
    if (JSON.stringify(pivot) !== JSON.stringify(icon ? [.5,.5] : [.5,.85])) throw new Error(entry.key + ': unexpected pivot');
    const targetAnchor = entry.targetAnchorPx ?? pivot.map((v, i) => v * canvas[i]);
    const rawPath = isAbsolute(entry.rawPath) ? resolve(entry.rawPath) : resolve(ROOT, entry.rawPath);
    const original = await readFile(rawPath), metadata = await sharp(original).metadata();
    if ((metadata.orientation ?? 1) !== 1) throw new Error(entry.key + ': source orientation must be baked first');
    if (entry.rawSha256 && entry.rawSha256 !== sha(original)) throw new Error(entry.key + ': original SHA256 mismatch');
    const crop = entry.crop ?? { left: 0, top: 0, width: metadata.width, height: metadata.height };
    if (!['left', 'top', 'width', 'height'].every(k => Number.isInteger(crop[k])) || crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1 ||
      crop.left + crop.width > metadata.width || crop.top + crop.height > metadata.height) throw new Error(entry.key + ': crop is outside raw image');
    const cropped = await sharp(original).extract(crop).ensureAlpha().png().toBuffer();
    const croppedRgba = await rgba(cropped), croppedAlpha = alphaSummary(croppedRgba);
    const actualAlpha = croppedAlpha.transparent > 0 || croppedAlpha.partial > 0;
    const holes = entry.holes ?? [];
    if (!Array.isArray(holes)) throw new Error(entry.key + ': holes must be an array of [x,y] seeds');
    holes.forEach(p => pair(p, entry.key + ' hole seed'));
    let cutout, removal;
    if (actualAlpha) {
      if (holes.length) throw new Error(entry.key + ': authored alpha is preserved; remove holes from spec or supply a flattened matte source');
      cutout = await png(croppedRgba);
      removal = { method: 'preserve-authored-alpha', existingTransparency: croppedAlpha };
    } else {
      const result = (entry.whiteMin ?? 242) < 220
        ? await neutralBackgroundCutout(cropped, { whiteMin: entry.whiteMin, chromaMax: entry.chromaMax ?? 18, holes, edgeUnmatte: entry.edgeUnmatte })
        : await makeReviewedSourceCutout(cropped, { whiteMin: entry.whiteMin ?? 242, chromaMax: entry.chromaMax ?? 18,
          edgeWidth: 2, matteCleanup: true, negativeSpaceSeeds: holes });
      cutout = result.buffer; removal = result.report;
    }
    const source = await rgba(cutout), alpha = alphaSummary(source), box = alpha.bbox;
    if (!box) throw new Error(entry.key + ': no visible subject after transparency processing');
    const explicitAnchor = entry.sourceAnchor ?? entry.sourceCenter ?? entry.sourceGround;
    const sourceGround = explicitAnchor ? pair(explicitAnchor, entry.key + ' source anchor') : [(box[0] + box[2]) / 2, icon ? (box[1] + box[3]) / 2 : box[3]];
    if (sourceGround[0] < 0 || sourceGround[1] < 0 || sourceGround[0] > source.width || sourceGround[1] > source.height)
      throw new Error(entry.key + ': sourceGround is outside cropped image');
    const defaultHeight = icon ? Math.min(canvas[1] * .76, canvas[0] * .84 * (box[3] - box[1]) / (box[2] - box[0])) : 330;
    const targetHeight = entry.targetHeightPx ?? defaultHeight;
    if (!Number.isFinite(targetHeight) || targetHeight <= 0 || targetHeight > canvas[1] - 4) throw new Error(entry.key + ': targetHeightPx exceeds canvas');
    const scale = entry.uniformScale ?? targetHeight / (box[3] - box[1]);
    if (!Number.isFinite(scale) || scale <= 0) throw new Error(entry.key + ': uniformScale must be positive');
    const translation = [targetAnchor[0] - sourceGround[0] * scale, targetAnchor[1] - sourceGround[1] * scale];
    const projected = [box[0] * scale + translation[0], box[1] * scale + translation[1], box[2] * scale + translation[0], box[3] * scale + translation[1]];
    if (projected[0] < 2 || projected[1] < 2 || projected[2] > canvas[0] - 2 || projected[3] > canvas[1] - 2)
      throw new Error(entry.key + ': requested uniform registration would clip; reduce targetHeightPx or correct sourceGround');
    const registered = registerRgba(source, scale, translation, canvas), finalAlpha = alphaSummary(registered);
    if (!finalAlpha.transparent || finalAlpha.borderVisible || finalAlpha.hiddenRgb) throw new Error(entry.key + ': output alpha/margin self-check failed');
    const buffer = await png(registered), image = await inspectImage(buffer);
    if (image.width !== canvas[0] || image.height !== canvas[1] || !image.hasAlphaChannel) throw new Error(entry.key + ': output canvas self-check failed');
    const qa = await qaBuffers(buffer);
    // Precompute and validate everything before this source's first write.
    const output = await writePng(names.master, buffer), qaOutputs = {};
    for (const [name, bytes] of Object.entries(qa)) qaOutputs[name] = await writePng('production/qa/sources/' + names.qaStem + '.' + name + '.png', bytes);
    const rawTranslation = [translation[0] - crop.left * scale, translation[1] - crop.top * scale];
    const old = previous.sources.find(s => s.key === entry.key);
    const { history: oldHistory, ...oldRecord } = old ?? {};
    const record = { key: entry.key, sourceVersion: names.version, entity: entity.key, phase: entity.phase, kind: 'source-master-only', runtime: false, runtimeFrameCredit: 0,
      ...(old ? { history: [...(oldHistory ?? []), oldRecord], revisionOf: old.output } : {}),
      status: 'processed-awaiting-actual-image-review', runId: entry.runId ?? null, prompt: entry.prompt ?? null,
      sourceMethod: entry.sourceMethod ?? 'Maliang-generated source for this batch',
      generationOccurredThisBatch: entry.generationOccurredThisBatch ?? true,
      parentRunId: entry.parentRunId ?? entry.originalParentRunId ?? null,
      provenanceRecord: entry.provenanceRecord ?? null,
      sourceProvenance: entry.sourceProvenance ?? entry.provenance ?? null,
      raw: { path: rawPath, sha256: sha(original), bytes: original.length, dimensions: [metadata.width, metadata.height] },
      crop, sourceGround, sourceGroundOriginal: [sourceGround[0] + crop.left, sourceGround[1] + crop.top],
      sourceAnchor: sourceGround, sourceAnchorOriginal: [sourceGround[0] + crop.left, sourceGround[1] + crop.top], anchorKind: icon ? 'center' : 'foot',
      groundMethod: explicitAnchor ? 'explicit-cropped-source-point' : icon ? 'first-source-visible-bbox-center' : 'first-source-visible-bbox-bottom-center',
      transparency: { authoredAlphaPreserved: actualAlpha, whiteMin: actualAlpha ? null : entry.whiteMin ?? 242,
        chromaMax: actualAlpha ? null : entry.chromaMax ?? 18, holes, removal },
      registration: { method: 'one-uniform-full-canvas-transform-from-reviewed-source', targetCanvas: canvas,
        sourceAnchor: sourceGround, targetGround: targetAnchor, targetAnchor, anchorKind: icon ? 'center' : 'foot', pivot, trim: false, scale, targetHeightPx: targetHeight,
        scaleMethod: entry.uniformScale !== undefined ? 'explicit-group-uniform-scale' : 'first-reviewed-source-target-height',
        croppedCanvas: [source.width, source.height], sourceBbox: box, projectedBbox: projected,
        matrixCroppedToRegistered: [[scale, 0, translation[0]], [0, scale, translation[1]], [0, 0, 1]],
        matrixOriginalToRegistered: [[scale, 0, rawTranslation[0]], [0, scale, rawTranslation[1]], [0, 0, 1]],
        sameGroupPolicy: 'Lock this transform after visual review; animation frames reuse the complete registered canvas.' },
      output: { ...output, dimensions: canvas, alpha: finalAlpha }, qa: qaOutputs,
      selfChecks: { trueRgba: true, transparentBackground: true, borderClear: true, hiddenRgbClear: true, uniformScale: true,
        existingPngOverwritten: false, actualVisualReview: false } };
    processed.push(record);
    previous.sources = [...previous.sources.filter(s => s.key !== entry.key), record];
    previous.updatedAt = new Date().toISOString(); previous.runtimeFrameCredit = 0;
    await writeReport(reportPath, previous);
    console.log(JSON.stringify({ key: entry.key, output: output.path, sha256: output.sha256, dimensions: canvas, status: record.status }));
  }
  return { processed: processed.map(s => s.key), report: rootRelative(reportPath), runtimeFrameCredit: 0 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await processExpeditionSources(process.argv[2] ? resolve(process.argv[2]) : undefined))); }
  catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }
}
