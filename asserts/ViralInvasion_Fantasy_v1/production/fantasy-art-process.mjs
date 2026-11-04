import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_ROOT = dirname(fileURLToPath(import.meta.url));
export const SOURCE_CONTRACT = Object.freeze({ canvas: [1024, 1024], anchor: [.5, .85] });
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const number = (value, fallback, min, max) => {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`Number outside ${min}..${max}`);
  return result;
};
async function bytes(input) { return Buffer.isBuffer(input) ? input : readFile(input); }
async function rgba(input) {
  return sharp(await bytes(input)).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
const png = (data, width, height, channels = 4) => sharp(data, { raw: { width, height, channels } })
  .png({ compressionLevel: 9 }).toBuffer();

export function outputPath(path) {
  const absolute = resolve(PRODUCTION_ROOT, path ?? 'output');
  const inside = relative(PRODUCTION_ROOT, absolute);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Outputs must remain inside the production directory');
  return absolute;
}

async function guardOutput(path) {
  const absolute = outputPath(path);
  let current = absolute;
  while (relative(PRODUCTION_ROOT, current) !== '') {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Output symlinks/junctions are not supported'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current);
    if (parent === current) throw new Error('Could not resolve an output inside production');
    current = parent;
  }
  return absolute;
}

/** Half-open alpha bbox; all measurements describe decoded pixels, never PNG metadata alone. */
export async function inspectImage(input) {
  const buffer = await bytes(input), metadata = await sharp(buffer).metadata();
  const { data, info: { width, height } } = await rgba(buffer);
  let left = width, top = height, right = -1, bottom = -1;
  let transparent = 0, partial = 0, opaque = 0, visible = 0, borderVisible = 0, whiteVisible = 0;
  let sum = 0, square = 0, lumaMin = 255, lumaMax = 0;
  for (let i = 0; i < width * height; i++) {
    const at = i * 4, a = data[at + 3], x = i % width, y = Math.floor(i / width);
    if (a === 0) transparent++; else if (a === 255) opaque++; else partial++;
    if (a < 8) continue;
    visible++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderVisible++;
    const r = data[at], g = data[at + 1], b = data[at + 2], luma = .2126 * r + .7152 * g + .0722 * b;
    if (Math.min(r, g, b) >= 247) whiteVisible++;
    sum += luma; square += luma * luma; lumaMin = Math.min(lumaMin, luma); lumaMax = Math.max(lumaMax, luma);
  }
  const mean = visible ? sum / visible : 0;
  return { sha256: hash(buffer), bytes: buffer.length, width, height, format: metadata.format,
    channels: metadata.channels, hasAlphaChannel: metadata.hasAlpha === true,
    alpha: { transparent, partial, opaque, transparentFraction: transparent / (width * height),
      visible, borderVisible, whiteVisible },
    bbox: right < 0 ? null : [left, top, right + 1, bottom + 1],
    margins: right < 0 ? null : { left, top, right: width - right - 1, bottom: height - bottom - 1,
      minimumFraction: Math.min(left / width, top / height, (width - right - 1) / width, (height - bottom - 1) / height) },
    luma: { mean, standardDeviation: visible ? Math.sqrt(Math.max(0, square / visible - mean * mean)) : 0,
      min: visible ? lumaMin : 0, max: visible ? lumaMax : 0 } };
}

/** Opposite-edge equality is the numeric periodicity check; it does not prove unobtrusive visual repetition. */
export async function inspectSeams(input) {
  const { data, info: { width, height } } = await rgba(input);
  const measure = (length, first, last) => {
    let sum = 0, max = 0;
    for (let i = 0; i < length; i++) for (let c = 0; c < 4; c++) {
      const difference = Math.abs(data[first(i) * 4 + c] - data[last(i) * 4 + c]);
      sum += difference * difference; max = Math.max(max, difference);
    }
    return { rms: Math.sqrt(sum / (length * 4)), maxDifference: max, samples: length * 4 };
  };
  const horizontal = measure(height, y => y * width, y => y * width + width - 1);
  const vertical = measure(width, x => x, x => (height - 1) * width + x);
  return { horizontal, vertical, exactlyPeriodic: horizontal.maxDifference === 0 && vertical.maxDifference === 0 };
}

export async function tiledPreview(input, tileSize = 512) {
  const tile = await sharp(await bytes(input)).resize(tileSize, tileSize).png().toBuffer();
  const layers = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) layers.push({ input: tile, left: x * tileSize, top: y * tileSize });
  return sharp({ create: { width: tileSize * 3, height: tileSize * 3, channels: 3, background: '#000000' } })
    .composite(layers).png().toBuffer();
}

export async function makeSeamlessGround(input, options = {}) {
  const source = await bytes(input), size = 1024, half = size / 2;
  const contrast = number(options.contrast, .76, .05, 1), saturation = number(options.saturation, .78, 0, 1);
  const originalSeams = await inspectSeams(source);
  // The full source is resized/cropped as one texture. No boundary, actor, path or signal is painted by this operation.
  const resized = await sharp(source).rotate().toColourspace('srgb').flatten({ background: options.background ?? '#dcb2a0' })
    .resize(half, half, { fit: 'cover', position: 'centre' }).modulate({ saturation }).png().toBuffer();
  const stats = await sharp(resized).stats();
  const offsets = stats.channels.slice(0, 3).map(channel => channel.mean * (1 - contrast));
  const quadrant = await sharp(resized).linear([contrast, contrast, contrast], offsets).png().toBuffer();
  const [right, lower, lowerRight] = await Promise.all([
    sharp(quadrant).flop().png().toBuffer(), sharp(quadrant).flip().png().toBuffer(),
    sharp(quadrant).flip().flop().png().toBuffer(),
  ]);
  const buffer = await sharp({ create: { width: size, height: size, channels: 3, background: '#000000' } })
    .composite([{ input: quadrant, left: 0, top: 0 }, { input: right, left: half, top: 0 },
      { input: lower, left: 0, top: half }, { input: lowerRight, left: half, top: half }]).png().toBuffer();
  const seams = await inspectSeams(buffer);
  if (!seams.exactlyPeriodic) throw new Error('Mirrored texture failed exact periodic-edge verification');
  return { buffer, report: { kind: 'ground', sourceSha256: hash(source),
    processing: { method: 'mirror-2x2', size, quadrantSize: half, fit: 'cover-centre', contrast, saturation,
      note: 'Opposite edges are pixel-identical. Mirror symmetry and 3x3 repetition still require visual review.' },
    originalSeams, seams, image: await inspectImage(buffer) }, previews: { '3x3': await tiledPreview(buffer) } };
}

function neighbours(index, width, height) {
  const x = index % width, result = [];
  if (x > 0) result.push(index - 1); if (x < width - 1) result.push(index + 1);
  if (index >= width) result.push(index - width); if (index < width * (height - 1)) result.push(index + width);
  return result;
}

function bakedCheckerboard(data, width, height) {
  // An opaque, neutral two-tone grid in both border directions is a baked transparency preview.
  // This is deliberately narrow: uncertain cases still go to black/white visual QA.
  const sample = (x, y) => {
    const at = (y * width + x) * 4, rgb = [data[at], data[at + 1], data[at + 2]];
    if (data[at + 3] !== 255 || Math.max(...rgb) - Math.min(...rgb) > 6 || Math.min(...rgb) < 130) return null;
    return (rgb[0] + rgb[1] + rgb[2]) / 3;
  };
  for (const size of [4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64]) {
    if (width < size * 6 || height < size * 6) continue;
    const rows = [], columns = [];
    for (let i = 0; i < 6; i++) { rows.push(sample(Math.floor(size * (i + .5)), 0)); columns.push(sample(0, Math.floor(size * (i + .5)))); }
    const alternating = values => values.every(v => v !== null) && Math.abs(values[0] - values[1]) >= 12
      && values.every((v, i) => Math.abs(v - values[i % 2]) <= 5);
    if (alternating(rows) && alternating(columns)) return true;
  }
  return false;
}

/** Remove only border-connected near-white pixels; enclosed white costume/highlights remain foreground. */
export async function removeWhiteMatte(input, options = {}) {
  const source = await bytes(input), { data, info: { width, height } } = await rgba(source);
  if (bakedCheckerboard(data, width, height)) throw new Error('Input contains an opaque baked checkerboard; it is not a true alpha image');
  const whiteMin = number(options.whiteMin, 247, 220, 255), chromaMax = number(options.chromaMax, 12, 0, 50);
  const edgeWidth = Math.round(number(options.edgeWidth, 2, 0, 6));
  const count = width * height, background = new Uint8Array(count), queue = new Uint32Array(count);
  const isBackground = i => {
    const at = i * 4, r = data[at], g = data[at + 1], b = data[at + 2];
    return data[at + 3] < 8 || (Math.min(r, g, b) >= whiteMin && Math.max(r, g, b) - Math.min(r, g, b) <= chromaMax);
  };
  let head = 0, tail = 0;
  const enqueue = i => { if (!background[i] && isBackground(i)) { background[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) for (const next of neighbours(queue[head++], width, height)) enqueue(next);
  const removed = tail, output = Buffer.from(data), distance = new Uint8Array(count);
  head = 0; tail = 0;
  for (let i = 0; i < count; i++) if (background[i]) {
    output.fill(0, i * 4, i * 4 + 4);
    for (const next of neighbours(i, width, height)) if (!background[next] && !distance[next]) {
      distance[next] = 1; queue[tail++] = next;
    }
  }
  while (head < tail) {
    const current = queue[head++];
    if (distance[current] >= edgeWidth + 3) continue;
    for (const next of neighbours(current, width, height)) if (!background[next] && !distance[next]) {
      distance[next] = distance[current] + 1; queue[tail++] = next;
    }
  }
  let cleaned = 0;
  if (options.matteCleanup !== false && edgeWidth) for (let i = 0; i < count; i++) {
    const at = i * 4, d = distance[i];
    // Existing semitransparent RGB is already straight-alpha; never unmatte it twice.
    if (!d || d > edgeWidth || data[at + 3] < 250 || Math.min(data[at], data[at + 1], data[at + 2]) < 175) continue;
    const x = i % width, y = Math.floor(i / width), foreground = [0, 0, 0]; let weight = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !dx && !dy) continue;
      const n = ny * width + nx;
      if (background[n] || distance[n] <= d || data[n * 4 + 3] < 250) continue;
      const w = 1 / (dx * dx + dy * dy); weight += w;
      for (let c = 0; c < 3; c++) foreground[c] += data[n * 4 + c] * w;
    }
    if (!weight) continue;
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) { foreground[c] /= weight; const delta = 255 - foreground[c];
      numerator += delta * (255 - data[at + c]); denominator += delta * delta; }
    if (denominator < 200) continue;
    const alpha = Math.max(0, Math.min(1, numerator / denominator));
    if (alpha < .04 || alpha >= .98) continue;
    output[at + 3] = Math.round(alpha * data[at + 3]);
    for (let c = 0; c < 3; c++) output[at + c] = Math.round(Math.max(0, Math.min(255, (data[at + c] - 255 * (1 - alpha)) / alpha)));
    cleaned++;
  }
  const buffer = await png(output, width, height), image = await inspectImage(buffer);
  if (!image.bbox) throw new Error('White-matte removal left an empty image');
  return { buffer, report: { sourceSha256: hash(source), processing: { method: 'border-connected-white-key', whiteMin, chromaMax,
    matteCleanup: options.matteCleanup !== false, edgeWidth, removedPixels: removed, cleanedEdgePixels: cleaned,
    limitations: 'White foreground connected directly to a white backdrop is ambiguous. Inspect both black/white QA views before acceptance.' }, image } };
}

async function placeFullCanvas(input, transform) {
  const { width, height, left, top } = transform;
  let buffer = await sharp(input).resize(width, height, { fit: 'fill' }).png().toBuffer();
  const crop = { left: Math.max(0, -left), top: Math.max(0, -top),
    width: Math.min(width, 1024 - left) - Math.max(0, -left),
    height: Math.min(height, 1024 - top) - Math.max(0, -top) };
  if (crop.width <= 0 || crop.height <= 0) throw new Error('Shared transform lies outside the logical canvas');
  if (crop.width !== width || crop.height !== height) buffer = await sharp(buffer).extract(crop).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input: buffer, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
}

export async function alphaPreviews(input) {
  const buffer = await bytes(input), { data, info: { width, height } } = await rgba(buffer);
  const [black, white] = await Promise.all(['#000000', '#ffffff'].map(background => sharp(buffer).flatten({ background }).png().toBuffer()));
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const alphaImage = await png(alpha, width, height, 1);
  const sideBySide = await sharp({ create: { width: width * 2, height, channels: 3, background: '#000000' } })
    .composite([{ input: black, left: 0, top: 0 }, { input: white, left: width, top: 0 }]).png().toBuffer();
  return { black, white, alpha: alphaImage, 'black-white': sideBySide };
}

export async function validateOverlayAlpha(input, options = {}) {
  const image = await inspectImage(input);
  if (!image.hasAlphaChannel || !image.alpha.transparent) throw new Error('Overlay requires actual transparent RGBA pixels');
  if (image.alpha.borderVisible) throw new Error('Overlay touches an outer canvas edge; inspect for baked background or clipping');
  const { data, info: { width, height } } = await rgba(input);
  const allowed = options.allowedRegion, forbidden = options.forbiddenRegions ?? [];
  let outsideAllowed = 0, insideForbidden = 0;
  const contains = (box, x, y) => x >= box[0] && y >= box[1] && x < box[0] + box[2] && y < box[1] + box[3];
  for (const box of [...(allowed ? [allowed] : []), ...forbidden]) {
    if (!Array.isArray(box) || box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[2] < 0 || box[3] < 0) throw new Error('Invalid overlay QA region');
  }
  for (let i = 0; i < width * height; i++) if (data[i * 4 + 3] >= 8) {
    const x = i % width, y = Math.floor(i / width);
    if (allowed && !contains(allowed, x, y)) outsideAllowed++;
    if (forbidden.some(box => contains(box, x, y))) insideForbidden++;
  }
  if (outsideAllowed || insideForbidden) throw new Error(`Overlay alpha violates registered regions: outside=${outsideAllowed}, forbidden=${insideForbidden}`);
  return { outsideAllowed, insideForbidden, allowedRegion: allowed ?? null, forbiddenRegions: forbidden,
    operationAddsFloor: false, operationAddsShadow: false,
    visualReviewRequired: 'Pixel tests cannot prove an organic shadow/floor is absent. Review black/white/alpha views; provide forbiddenRegions when known.' };
}

/** One transform per group, computed from full source canvases. Never size individual states by alpha bounds. */
export async function registerStateGroup(inputs, options = {}) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('A state group needs at least one input');
  const entries = [];
  for (const entry of inputs) {
    if (!entry.id || entries.some(e => e.id === entry.id)) throw new Error('State IDs must be present and unique');
    const source = await bytes(entry.input), meta = await sharp(source).metadata();
    if ((meta.orientation ?? 1) !== 1) throw new Error('Registered sources must have baked orientation');
    const cutout = options.removeWhite === false ? { buffer: await sharp(source).ensureAlpha().png().toBuffer(),
      report: { sourceSha256: hash(source), processing: { method: 'preserve-source-alpha' }, image: await inspectImage(source) } }
      : await removeWhiteMatte(source, options);
    entries.push({ id: entry.id, width: meta.width, height: meta.height, ...cutout });
  }
  const first = entries[0];
  if (entries.some(e => e.width !== first.width || e.height !== first.height)) throw new Error('State group source canvases differ; do not independently normalize states');
  const sourceAnchor = options.sourceAnchor ?? [.5, .85];
  if (!Array.isArray(sourceAnchor) || sourceAnchor.length !== 2 || sourceAnchor.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Invalid normalized source anchor');
  const scale = number(options.scale, 1024 / first.width, .01, 16);
  const width = Math.round(first.width * scale), height = Math.round(first.height * scale);
  const left = Math.round(512 - sourceAnchor[0] * width), top = Math.round(870.4 - sourceAnchor[1] * height);
  const transform = { sourceCanvas: [first.width, first.height], sourceAnchor, requestedScale: scale, width, height, left, top,
    targetCanvas: [1024, 1024], targetAnchor: [.5, .85], targetAnchorPixels: [512, 870.4],
    actualAnchorPixels: [left + sourceAnchor[0] * width, top + sourceAnchor[1] * height],
    method: 'shared-full-canvas-scale-and-translation', alphaBoundsUsedForScaling: false };
  const results = [];
  for (const entry of entries) {
    const bbox = entry.report.image.bbox;
    if (!bbox) throw new Error(`Empty source state: ${entry.id}`);
    const projected = [left + bbox[0] * width / first.width, top + bbox[1] * height / first.height,
      left + bbox[2] * width / first.width, top + bbox[3] * height / first.height];
    if (projected[0] < 0 || projected[1] < 0 || projected[2] > 1024 || projected[3] > 1024) throw new Error(`Shared transform would clip visible pixels in ${entry.id}`);
    const buffer = await placeFullCanvas(entry.buffer, transform), image = await inspectImage(buffer);
    if (!image.hasAlphaChannel || !image.alpha.transparent) throw new Error(`State has no actual transparency: ${entry.id}`);
    const report = { id: entry.id, kind: options.kind ?? 'cutout', sourceSha256: entry.report.sourceSha256,
      processing: entry.report.processing, transform, sourceBbox: bbox, image,
      registration: 'The anchor is a declared source-coordinate contract; inspect the actual ground contact visually.' };
    if (options.kind === 'overlay') report.overlay = await validateOverlayAlpha(buffer, options);
    results.push({ id: entry.id, buffer, report, previews: await alphaPreviews(buffer) });
  }
  return { transform, results };
}

export async function writeResult(result, id, directory = 'output') {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.includes('..')) throw new Error('Invalid output ID');
  const root = await guardOutput(directory); await mkdir(root, { recursive: true });
  const output = join(root, `${id}.png`);
  await writeFile(await guardOutput(output), result.buffer);
  const previews = {};
  for (const [name, buffer] of Object.entries(result.previews ?? {})) {
    const path = join(root, `${id}.qa-${name}.png`); await writeFile(await guardOutput(path), buffer);
    previews[name] = { path, sha256: hash(buffer), bytes: buffer.length };
  }
  const report = { ...result.report, output, previews };
  const reportPath = join(root, `${id}.report.json`);
  await writeFile(await guardOutput(reportPath), JSON.stringify(report, null, 2) + '\n');
  return { output, reportPath, sha256: hash(result.buffer) };
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--') || i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(`Expected --name value: ${key}`);
    result[key.slice(2)] = args[++i];
  }
  const allowed = new Set(['input', 'id', 'out', 'spec', 'contrast', 'saturation', 'white-min', 'chroma-max', 'edge-width', 'matte-cleanup', 'scale', 'remove-white', 'allowed-region']);
  for (const key of Object.keys(result)) if (!allowed.has(key)) throw new Error(`Unknown argument: --${key}`);
  return result;
}

export async function cli(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (command === 'self-test') {
    const { runSelfTests } = await import('./fantasy-art-process.self-test.mjs');
    return runSelfTests();
  }
  if (!['ground', 'cutout', 'overlay', 'group', 'inspect'].includes(command)) throw new Error('Commands: ground | cutout | overlay | group | inspect | self-test');
  const flags = parseArgs(rest), directory = flags.out ?? 'output'; outputPath(directory);
  const options = { contrast: flags.contrast, saturation: flags.saturation, whiteMin: flags['white-min'], chromaMax: flags['chroma-max'],
    edgeWidth: flags['edge-width'], matteCleanup: flags['matte-cleanup'] !== 'false', scale: flags.scale,
    removeWhite: flags['remove-white'] !== 'false', allowedRegion: flags['allowed-region']?.split(',').map(Number) };
  if (command === 'group') {
    if (!flags.spec) throw new Error('group requires --spec');
    const specPath = resolve(flags.spec), spec = JSON.parse(await readFile(specPath, 'utf8'));
    const group = await registerStateGroup(spec.inputs.map(entry => ({ id: entry.id, input: resolve(dirname(specPath), entry.input) })), spec.options ?? {});
    const written = [];
    for (const result of group.results) written.push(await writeResult(result, result.id, directory));
    return { transform: group.transform, outputs: written };
  }
  if (!flags.input || !flags.id) throw new Error(`${command} requires --input and --id`);
  if (command === 'ground') return writeResult(await makeSeamlessGround(flags.input, options), flags.id, directory);
  if (command === 'inspect') {
    const source = await bytes(flags.input), buffer = await sharp(source).rotate().png().toBuffer();
    return writeResult({ buffer, report: { kind: 'inspection-png-copy', sourceSha256: hash(source),
      image: await inspectImage(buffer), seams: await inspectSeams(buffer) }, previews: await alphaPreviews(buffer) }, flags.id, directory);
  }
  const group = await registerStateGroup([{ id: flags.id, input: flags.input }], { ...options, kind: command });
  return writeResult(group.results[0], flags.id, directory);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  cli().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Fantasy art processing failed: ${error.message}`); process.exitCode = 1;
  });
}
