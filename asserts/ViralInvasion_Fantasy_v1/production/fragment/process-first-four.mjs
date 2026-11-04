import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeSeamlessGround, removeWhiteMatte, registerStateGroup, inspectImage, alphaPreviews, outputPath } from '../fantasy-art-process.mjs';

const production = resolve(dirname(fileURLToPath(import.meta.url)), '..'), pack = resolve(production, '..');
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const healthyTreeHoles = [[864, 784], [1257, 963], [1321, 1077], [702, 916], [1092, 949], [789, 1109]];

/** Seeds identify visually reviewed negative spaces, not pale veins/highlights inside the foliage. */
export async function removeReviewedWhiteHoles(input, seeds, options = {}) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data), count = width * height, removed = new Uint8Array(count), queue = new Uint32Array(count), holes = [];
  const neighbours = i => { const x = i % width, result = []; if (x) result.push(i - 1); if (x < width - 1) result.push(i + 1);
    if (i >= width) result.push(i - width); if (i < width * (height - 1)) result.push(i + width); return result; };
  const nearWhite = i => { const p = i * 4; return data[p + 3] >= 8 && Math.min(data[p], data[p + 1], data[p + 2]) >= (options.whiteMin ?? 245)
    && Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) <= 16; };
  for (const [x, y] of seeds) {
    const start = y * width + x;
    if (!nearWhite(start)) throw new Error(`Reviewed white-hole seed no longer matches the source: ${x},${y}`);
    let head = 0, tail = 1, left = width, top = height, right = 0, bottom = 0;
    queue[0] = start; removed[start] = 1;
    while (head < tail) {
      const i = queue[head++], px = i % width, py = Math.floor(i / width);
      left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px + 1); bottom = Math.max(bottom, py + 1);
      for (const n of neighbours(i)) if (!removed[n] && nearWhite(n)) { removed[n] = 1; queue[tail++] = n; }
    }
    holes.push({ seed: [x, y], pixels: tail, bbox: [left, top, right, bottom] });
  }
  let allNearWhitePixels = 0;
  let preservedSmallNearWhitePixels = 0;
  if (options.allNearWhite) {
    const visited = new Uint8Array(count), minimumArea = options.minimumWhiteComponentArea ?? 1;
    for (let i = 0; i < count; i++) {
      if (removed[i] || visited[i] || !nearWhite(i)) continue;
      let head = 0, tail = 1; queue[0] = i; visited[i] = 1;
      while (head < tail) for (const n of neighbours(queue[head++])) {
        if (!removed[n] && !visited[n] && nearWhite(n)) { visited[n] = 1; queue[tail++] = n; }
      }
      if (tail >= minimumArea) for (let j = 0; j < tail; j++) { removed[queue[j]] = 1; allNearWhitePixels++; }
      else preservedSmallNearWhitePixels += tail;
    }
  }
  let rootGapPixels = 0;
  // Original-image QA confirms no white pigment on the coral roots. These small
  // near-white islands between outlined root toes are background, not highlights.
  if (options.rootCleanup !== false) for (let y = 1500; y < height; y++) for (let x = 700; x < Math.min(1350, width); x++) {
    const i = y * width + x, p = i * 4;
    if (!removed[i] && data[p + 3] >= 8 && Math.min(data[p], data[p + 1], data[p + 2]) >= 235
        && Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) <= 18) {
      removed[i] = 1; rootGapPixels++;
    }
  }
  for (let i = 0; i < count; i++) if (removed[i]) output.fill(0, i * 4, i * 4 + 4);
  // Decontaminate just the newly exposed inner-hole edges. Existing partial alpha is left untouched.
  const distance = new Uint8Array(count); let head = 0, tail = 0;
  for (let i = 0; i < count; i++) if (removed[i]) for (const n of neighbours(i)) {
    if (output[n * 4 + 3] >= 8 && !distance[n]) { distance[n] = 1; queue[tail++] = n; }
  }
  while (head < tail) { const i = queue[head++]; if (distance[i] >= 5) continue;
    for (const n of neighbours(i)) if (output[n * 4 + 3] >= 8 && !distance[n]) { distance[n] = distance[i] + 1; queue[tail++] = n; } }
  let cleaned = 0;
  for (let i = 0; i < count; i++) {
    const at = i * 4, d = distance[i];
    if (!d || d > 2 || data[at + 3] < 250 || Math.min(data[at], data[at + 1], data[at + 2]) < 175) continue;
    const x = i % width, y = Math.floor(i / width), foreground = [0, 0, 0]; let weight = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= width || ny < 0 || ny >= height || !dx && !dy) continue;
      const n = ny * width + nx; if (output[n * 4 + 3] < 250 || distance[n] <= d) continue;
      const w = 1 / (dx * dx + dy * dy); weight += w; for (let c = 0; c < 3; c++) foreground[c] += data[n * 4 + c] * w;
    }
    if (!weight) continue;
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) { foreground[c] /= weight; const delta = 255 - foreground[c]; numerator += delta * (255 - data[at + c]); denominator += delta * delta; }
    if (denominator < 200) continue;
    const alpha = Math.max(0, Math.min(1, numerator / denominator)); if (alpha < .04 || alpha >= .98) continue;
    output[at + 3] = Math.round(alpha * data[at + 3]);
    for (let c = 0; c < 3; c++) output[at + c] = Math.round(Math.max(0, Math.min(255, (data[at + c] - 255 * (1 - alpha)) / alpha)));
    cleaned++;
  }
  return { buffer: await sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer(),
    report: { method: options.reviewLabel ?? (options.allNearWhite ? 'reviewed-all-white-negative-space-on-purple-body' : 'six-original-reviewed-white-hole-components'),
      holes, allNearWhitePixels, preservedSmallNearWhitePixels, minimumWhiteComponentArea: options.minimumWhiteComponentArea ?? 1,
      cleanedInnerEdgePixels: cleaned,
      rootNegativeSpaceCleanup: { region: [700, 1500, 650, height - 1500], whiteMin: 235, chromaMax: 18, removedPixels: rootGapPixels,
        reason: 'Visually confirmed white backdrop between coral root toes; original roots contain no white pigment' } } };
}

export async function rootSupport(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let bottom = -1;
  for (let y = Math.floor(height * .65); y < height; y++) for (let x = Math.floor(width * .35); x < Math.floor(width * .65); x++) {
    if (data[(y * width + x) * 4 + 3] >= 192) bottom = Math.max(bottom, y);
  }
  let sum = 0, count = 0;
  for (let y = bottom - 3; y <= bottom; y++) for (let x = Math.floor(width * .35); x < Math.floor(width * .65); x++) {
    if (data[(y * width + x) * 4 + 3] >= 192) { sum += x; count++; }
  }
  const point = [sum / count, bottom], sourceAnchor = [width * .5, height * .85];
  return { definition: 'Opaque (alpha>=192) lowest root-toe support within central 35..65% canvas; x is centroid of its final four rows',
    sourcePoint: point, declaredSourceAnchor: sourceAnchor, sourceDelta: point.map((n, i) => n - sourceAnchor[i]),
    logical1024Point: point.map(n => n * 1024 / width), logical1024Delta: point.map((n, i) => (n - sourceAnchor[i]) * 1024 / width),
    note: 'Lowest asymmetric toe is a measured structural landmark, not proof of intended ground contact. Compare the same root structure in the infected state before claiming registered alignment.' };
}

export async function save(result, id, report) {
  const imageDirectory = outputPath('processed'), qaDirectory = outputPath('qa'), fragmentDirectory = outputPath('fragment');
  await Promise.all([imageDirectory, qaDirectory, fragmentDirectory].map(path => mkdir(path, { recursive: true })));
  const output = join(imageDirectory, `${id}.png`); await writeFile(output, result.buffer);
  const qa = {};
  for (const [name, buffer] of Object.entries(result.previews ?? {})) {
    const path = join(qaDirectory, `${id}.${name}.png`); await writeFile(path, buffer); qa[name] = { path, sha256: digest(buffer) };
  }
  return { id, outputPath: output, outputSha256: digest(result.buffer), ...report, image: await inspectImage(result.buffer), qa };
}

const registry = JSON.parse(await readFile(join(production, 'runs.json'), 'utf8'));
export async function raw(id) {
  const run = registry.runs[id], item = run.raw?.at(-1);
  if (!item) throw new Error(`Raw input unavailable: ${id}`);
  const path = join(pack, item.path), input = await readFile(path);
  if (digest(input) !== item.sha256) throw new Error(`Raw hash mismatch: ${id}`);
  return { input, provenance: { runId: run.runId, rawPath: path, rawSha256: item.sha256, nodeId: item.nodeId } };
}

export async function processHealthy() {
const groundRaw = await raw('heart.ground.healthy');
const sourceCrop = { left: 512, top: 512, width: 1024, height: 1024 };
const groundCrop = await sharp(groundRaw.input).extract(sourceCrop).png().toBuffer();
const ground = await makeSeamlessGround(groundCrop, { contrast: 1, saturation: 1 });
ground.report.sourceSha256 = groundRaw.provenance.rawSha256;
ground.report.processing.sourceCrop = sourceCrop;
ground.report.processing.sourceCropReason = 'Original large perimeter vessels produce conspicuous mirror medallions. The central tissue crop preserves original colours while avoiding this large motif.';
const groundRecord = await save(ground, 'heart.ground.healthy', { ...groundRaw.provenance, technical: ground.report,
  visualReview: { state: 'technical-passed-awaiting-3x3-review', colourTreatment: 'No saturation, contrast, brightness, hue, lift or white blending applied' } });

const treeRaw = await raw('scenery.pulseTree.healthy');
const outer = await removeWhiteMatte(treeRaw.input, { whiteMin: 245, chromaMax: 16, edgeWidth: 2 });
const holes = await removeReviewedWhiteHoles(outer.buffer, healthyTreeHoles);
const group = await registerStateGroup([{ id: 'scenery.pulseTree.healthy', input: holes.buffer }], { removeWhite: false,
  sourceAnchor: [.5, .85], scale: .5 });
const tree = group.results[0], support = await rootSupport(holes.buffer);
const treeRecord = await save(tree, tree.id, { ...treeRaw.provenance, processing: { outer: outer.report.processing, inner: holes.report },
  registration: { transform: group.transform, support,
    state: 'healthy-provisional-until-strong-infected-pair-is-available', perStateAlphaHeightNormalization: false },
  visualReview: { state: 'awaiting-black-white-alpha-review', sourceReviewed: 'Complete isolated fan-leaf tree; six enclosed white regions are confirmed branch gaps; leaf veins remain foreground',
    colourTreatment: 'No palette adjustment; only white-matte edge unmixing and half-size full-canvas registration' } });

const fragment = { schemaVersion: 1, scope: 'first-four', outputs: [groundRecord, treeRecord],
  pending: ['heart.ground.infected strong r02', 'scenery.pulseTree.infected strong r02'],
  weakInfectedR01Accepted: false, deliveryModified: false };
await writeFile(join(outputPath('fragment'), 'first-four-technical.json'), JSON.stringify(fragment, null, 2) + '\n');
console.log(JSON.stringify({ outputs: fragment.outputs.map(x => ({ id: x.id, path: x.outputPath, sha256: x.outputSha256, bbox: x.image.bbox,
  alpha: x.image.alpha, seams: x.technical?.seams, rootSupport: x.registration?.support })), fragmentPath: join(outputPath('fragment'), 'first-four-technical.json') }, null, 2));
return fragment;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  processHealthy().catch(error => { console.error(error); process.exitCode = 1; });
}
