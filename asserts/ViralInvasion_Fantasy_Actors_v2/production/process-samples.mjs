import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { removeWhiteMatte, inspectImage, alphaPreviews } from '../../ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs';

// The imported helpers only return buffers/reports. Never call their old-root writers or CLI.
export const PRODUCTION_ROOT = dirname(fileURLToPath(import.meta.url));
const TARGET = [512, 512], FOOT = [256, 435.2];
const SAMPLE_IDS = Object.freeze([
  'fantasy.actor.hero.front_right.master',
  'fantasy.actor.enemy.basic.master',
  'fantasy.actor.immune.front_right.master',
]);
const hash = b => createHash('sha256').update(b).digest('hex');
const png = (data, width, height, channels = 4) => sharp(data, { raw: { width, height, channels } })
  .png({ compressionLevel: 9 }).toBuffer();
async function rgba(input) {
  return sharp(input).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function point(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(n => !Number.isFinite(n)))
    throw new Error(label + ' must be two finite numbers');
  return value;
}
async function guarded(path) {
  const absolute = resolve(PRODUCTION_ROOT, path), rel = relative(PRODUCTION_ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Output must stay inside new Actors_v2 production');
  let current = absolute;
  for (;;) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Output symlinks or junctions are unsupported'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (current === PRODUCTION_ROOT) break;
    current = dirname(current);
  }
  return absolute;
}
async function writeLocal(path, buffer) {
  const absolute = await guarded(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);
  return { path: relative(PRODUCTION_ROOT, absolute).replaceAll('\\', '/'), sha256: hash(buffer), bytes: buffer.length };
}
async function writeJson(path, value) {
  return writeLocal(path, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
}
function contains(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function adjacent(i, width, height, visit) {
  const x = i % width;
  if (x) visit(i - 1); if (x + 1 < width) visit(i + 1);
  if (i >= width) visit(i - width); if (i + width < width * height) visit(i + width);
}

/**
 * Border-connected keying comes from the old read-only helper.
 * Enclosed white voids require explicit, visually annotated seeds.
 * Enclosed cream body/visor/cross pixels are never inferred to be holes.
 */
export async function makeCutout(source, options = {}) {
  const raw = await rgba(source), { width, height } = raw.info;
  const protection = options.protectedPolygons ?? [];
  for (const polygon of protection) {
    if (!Array.isArray(polygon) || polygon.length < 3) throw new Error('A protected polygon needs at least 3 points');
    polygon.forEach(p => point(p, 'protected vertex'));
  }
  const keyed = options.preserveAlpha === true
    ? { buffer: await sharp(source).ensureAlpha().png().toBuffer(), report: { processing: { method: 'preserve-authored-alpha' } } }
    : await removeWhiteMatte(source, {
      whiteMin: options.whiteMin ?? 247, chromaMax: options.chromaMax ?? 12,
      edgeWidth: options.edgeWidth ?? 1, matteCleanup: options.matteCleanup ?? true,
    });
  const cut = await rgba(keyed.buffer), output = Buffer.from(cut.data), protectedMask = new Uint8Array(width * height);
  let restoredPixels = 0;
  if (protection.length) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!protection.some(p => contains(p, x + .5, y + .5))) continue;
    protectedMask[i] = 1;
    if (output[i * 4 + 3] !== raw.data[i * 4 + 3]) restoredPixels++;
    raw.data.copy(output, i * 4, i * 4, i * 4 + 4);
  }
  const whiteMin = options.holeWhiteMin ?? options.whiteMin ?? 247;
  const chromaMax = options.holeChromaMax ?? options.chromaMax ?? 12;
  const visited = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let removedHolePixels = 0;
  const holeReports = [];
  const whiteCandidate = i => {
    if (protectedMask[i]) return false;
    const at = i * 4, values = [raw.data[at], raw.data[at + 1], raw.data[at + 2]];
    return raw.data[at + 3] < 8 || Math.min(...values) >= whiteMin && Math.max(...values) - Math.min(...values) <= chromaMax;
  };
  for (const seed of options.negativeSpaceSeeds ?? []) {
    point(seed, 'negative-space seed');
    const [x, y] = seed.map(Math.round);
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('Negative-space seed outside source canvas');
    const first = y * width + x;
    if (!whiteCandidate(first)) throw new Error('Negative-space seed is not near-white: ' + seed);
    let head = 0, tail = 0, removed = 0;
    const enqueue = i => { if (!visited[i] && whiteCandidate(i)) { visited[i] = 1; queue[tail++] = i; } };
    enqueue(first);
    while (head < tail) {
      const i = queue[head++];
      if (output[i * 4 + 3]) removed++;
      output.fill(0, i * 4, i * 4 + 4);
      adjacent(i, width, height, enqueue);
    }
    removedHolePixels += removed;
    holeReports.push({ sourceSeed: seed, componentPixels: tail, newlyRemovedPixels: removed });
  }
  let shadowCleanup = null;
  if (options.removeShadowBelowContour) {
    const { roi, darkMax = [190, 100, 85] } = options.removeShadowBelowContour;
    if (!Array.isArray(roi) || roi.length !== 4) throw new Error('Shadow cleanup requires an inspected ROI');
    const [left, top, roiWidth, roiHeight] = roi;
    if (![left, top, roiWidth, roiHeight].every(Number.isInteger) || left < 0 || top < 0
      || left + roiWidth > width || top + roiHeight > height) throw new Error('Invalid shadow ROI');
    const dark = i => raw.data[i * 4] < darkMax[0] && raw.data[i * 4 + 1] < darkMax[1] && raw.data[i * 4 + 2] < darkMax[2];
    let removedPixels = 0, retainedDarkContourPixels = 0, lostDarkContourPixels = 0;
    const columnBottoms = [];
    for (let x = left; x < left + roiWidth; x++) {
      let bottom = -1;
      for (let y = top; y < top + roiHeight; y++) if (dark(y * width + x)) bottom = y;
      if (bottom < 0) continue;
      columnBottoms.push([x, bottom]);
      for (let y = bottom + 1; y < top + roiHeight; y++) {
        const i = y * width + x;
        if (output[i * 4 + 3]) removedPixels++;
        output.fill(0, i * 4, i * 4 + 4);
      }
    }
    for (let x = left; x < left + roiWidth; x++) for (let y = top; y < top + roiHeight; y++) {
      const i = y * width + x;
      if (!dark(i)) continue;
      if (output[i * 4 + 3]) retainedDarkContourPixels++; else lostDarkContourPixels++;
    }
    if (lostDarkContourPixels) throw new Error('Shadow cleanup lost a dark body contour pixel');
    shadowCleanup = { method: 'inspected-ROI-only-clear-below-each-column-dark-body-contour', roi, darkMax,
      removedPixels, retainedDarkContourPixels, lostDarkContourPixels, columnBottoms,
      outsideRoiTouchedByThisOperation: false, shadowUsedAsFootAnchor: false };
  }
  // These reviewed source masters are each one connected subject. White-paper texture can
  // leave isolated one-pixel islands; discard only explicitly opted-in detached components.
  let componentCleanup = null;
  if (options.keepLargestComponent === true) {
    const seen = new Uint8Array(width * height), labels = new Uint32Array(width * height), components = [];
    for (let start = 0; start < width * height; start++) {
      if (seen[start] || output[start * 4 + 3] < 8) continue;
      const label = components.length + 1; let head = 0, tail = 0;
      const enqueue = i => {
        if (!seen[i] && output[i * 4 + 3] >= 8) { seen[i] = 1; labels[i] = label; queue[tail++] = i; }
      };
      enqueue(start);
      while (head < tail) adjacent(queue[head++], width, height, enqueue);
      components.push({ label, pixels: tail });
    }
    components.sort((a, b) => b.pixels - a.pixels);
    if (!components.length) throw new Error('No connected subject remains');
    const keep = components[0].label; let discardedPixels = 0;
    for (let i = 0; i < width * height; i++) if (labels[i] !== keep && output[i * 4 + 3]) {
      output.fill(0, i * 4, i * 4 + 4); discardedPixels++;
    }
    componentCleanup = { method: 'reviewed-single-subject-keep-largest-connected-component',
      components: components.length, keptPixels: components[0].pixels, discardedPixels,
      discardedComponentSizes: components.slice(1).map(c => c.pixels) };
  }
  const probes = [];
  for (const probe of options.preservationProbes ?? []) {
    const [x, y] = point(probe.point, 'preservation probe').map(Math.round), at = (y * width + x) * 4;
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('Probe outside source canvas');
    const before = [...raw.data.subarray(at, at + 4)], after = [...output.subarray(at, at + 4)];
    if (probe.expect === 'opaque' && after[3] < (probe.minimumAlpha ?? 240))
      throw new Error('Preserved foreground probe became transparent: ' + probe.label);
    if (probe.expect === 'clear' && after[3] > 7)
      throw new Error('Negative-space probe remains opaque: ' + probe.label);
    probes.push({ label: probe.label, point: probe.point, expect: probe.expect, before, after });
  }
  const buffer = await png(output, width, height);
  return { buffer, report: {
    ...keyed.report, protectedPolygons: protection, restoredPixels, removedHolePixels, holeReports,
    shadowCleanup, componentCleanup, preservationProbes: probes, finalCutoutImage: await inspectImage(buffer),
    caution: 'White foreground versus white background is resolved by actual image review and explicit seed/protection annotations, not by global white deletion.',
  } };
}

/** Translate a resampled full canvas with fractional offsets using premultiplied bilinear interpolation. */
async function translateFullCanvas(buffer, width, height, tx, ty) {
  const decoded = await rgba(buffer), source = decoded.data, output = Buffer.alloc(TARGET[0] * TARGET[1] * 4);
  if (decoded.info.width !== width || decoded.info.height !== height) throw new Error('Resample dimensions differ');
  for (let y = 0; y < TARGET[1]; y++) for (let x = 0; x < TARGET[0]; x++) {
    const sx = x - tx, sy = y - ty, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0; const rgb = [0, 0, 0];
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const xx = x0 + dx, yy = y0 + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const at = (yy * width + xx) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const a = source[at + 3] / 255;
      alpha += a * weight;
      for (let c = 0; c < 3; c++) rgb[c] += source[at + c] * a * weight;
    }
    const to = (y * TARGET[0] + x) * 4;
    output[to + 3] = Math.round(alpha * 255);
    if (alpha) for (let c = 0; c < 3; c++) output[to + c] = Math.max(0, Math.min(255, Math.round(rgb[c] / alpha)));
  }
  return png(output, TARGET[0], TARGET[1]);
}

export async function registerSample(cutout, sourceCanvas, registration) {
  const sourceFoot = point(registration?.sourceFootPx, 'sourceFootPx');
  const requestedScale = registration.uniformScale ?? TARGET[0] / sourceCanvas[0];
  if (!Number.isFinite(requestedScale) || requestedScale <= 0 || requestedScale > 8) throw new Error('Invalid uniform scale');
  if (sourceCanvas[0] !== sourceCanvas[1]) throw new Error('Sample sources must use a square authored canvas');
  const width = Math.round(sourceCanvas[0] * requestedScale), height = Math.round(sourceCanvas[1] * requestedScale);
  const effectiveScale = width / sourceCanvas[0];
  if (effectiveScale !== height / sourceCanvas[1]) throw new Error('Resampling must be uniform');
  const tx = FOOT[0] - sourceFoot[0] * effectiveScale, ty = FOOT[1] - sourceFoot[1] * effectiveScale;
  const sourceImage = await inspectImage(cutout), box = sourceImage.bbox;
  if (!box) throw new Error('No source foreground remains');
  const projected = [box[0] * effectiveScale + tx, box[1] * effectiveScale + ty,
    box[2] * effectiveScale + tx, box[3] * effectiveScale + ty];
  if (projected[0] < 1 || projected[1] < 1 || projected[2] > 511 || projected[3] > 511)
    throw new Error('The full-canvas transform would clip foreground or leave no safe margin');
  const resized = await sharp(cutout).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const buffer = await translateFullCanvas(resized, width, height, tx, ty);
  return { buffer, transform: {
    method: 'first-reviewed-identity-full-canvas-uniform-scale-and-foot-translation',
    sourceCanvas, sourceFootPx: sourceFoot, requestedUniformScale: requestedScale, uniformScale: effectiveScale,
    resampledCanvas: [width, height], translationPx: [tx, ty],
    matrixSourceToRegistered: [[effectiveScale, 0, tx], [0, effectiveScale, ty], [0, 0, 1]],
    targetCanvas: TARGET, targetAnchorPx: FOOT, pivot: [.5, .85],
    mappedSourceFootPx: [sourceFoot[0] * effectiveScale + tx, sourceFoot[1] * effectiveScale + ty],
    sourceBbox: box, projectedBbox: projected, alphaBoundsUsedForScaling: false,
    alphaCropUsed: false, futureGroupPolicy: 'Lock this transform for the identity/direction group after approval; never independently fit animation frames.',
    footAnnotation: registration.footAnnotation ?? 'Manually inspected ground contact; pixel boundary antialiasing does not change the declared anchor.',
  } };
}
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function label(text, width = 700, height = 28) {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height
    + '"><text x="8" y="19" fill="#d4d4d4" font-family="Arial" font-size="13">' + escape(text) + '</text></svg>');
}
async function recognitionPreviews(buffer, image) {
  const [l, t, r, b] = image.bbox, crop = { left: l, top: t, width: r - l, height: b - t }, outputs = {}, report = [];
  const layers = [], panelWidth = 700, panelHeight = 240;
  for (const [index, height] of [24, 32].entries()) {
    const small = await sharp(buffer).extract(crop).resize({ height, kernel: 'lanczos3' }).png().toBuffer();
    const meta = await sharp(small).metadata();
    const large = await sharp(small).resize(meta.width * 5, height * 5, { kernel: 'nearest' }).png().toBuffer();
    outputs[height + 'px-1x'] = small; outputs[height + 'px-5x-nearest'] = large;
    const top = index * panelHeight;
    layers.push({ input: label(height + 'px BODY HEIGHT: actual 1x at left; exact 5x nearest at right', panelWidth), left: 0, top });
    layers.push({ input: small, left: 12, top: top + 46 }, { input: large, left: 160, top: top + 42 });
    report.push({ bodyHeightPx: height, oneXCanvas: [meta.width, height], fiveXCanvas: [meta.width * 5, height * 5],
      diagnosticCrop: crop, productionPngUncropped: true, scaling: '1x body-height sample plus exact 5x nearest comparison' });
  }
  outputs['recognition-sheet'] = await sharp({ create: { width: panelWidth, height: panelHeight * 2, channels: 3, background: '#343434' } })
    .composite(layers).png().toBuffer();
  return { outputs, report };
}

export async function processSamples(spec) {
  if (!Array.isArray(spec.samples) || !spec.samples.length || spec.samples.length > 3 || spec.samples.some(s => !SAMPLE_IDS.includes(s.id)))
    throw new Error('This script only accepts the declared source master IDs');
  if (new Set(spec.samples.map(s => s.id)).size !== spec.samples.length) throw new Error('Duplicate sample IDs');
  const sources = [];
  for (const entry of spec.samples) {
    const stem = entry.outputStem ?? entry.id;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stem) || stem.includes('..')) throw new Error('Invalid output stem');
    if (entry.identityReview?.status !== 'accepted-for-processing')
      throw new Error('Actual source identity review is required before processing ' + entry.id);
    const rawPath = resolve(entry.rawPath), source = await readFile(rawPath), sourceMeta = await sharp(source).metadata();
    if ((sourceMeta.orientation ?? 1) !== 1) throw new Error('Source must have baked orientation');
    const sourceImage = await inspectImage(source), cutout = await makeCutout(source, entry.matte);
    const registered = await registerSample(cutout.buffer, [sourceMeta.width, sourceMeta.height], entry.registration);
    const image = await inspectImage(registered.buffer);
    if (image.width !== 512 || image.height !== 512 || image.channels !== 4 || !image.hasAlphaChannel
      || !image.alpha.transparent || image.alpha.borderVisible) throw new Error('Registered sample failed RGBA/margin check');
    const output = await writeLocal('processed/' + stem + '.png', registered.buffer);
    const views = await alphaPreviews(registered.buffer), qa = {};
    for (const [name, bytes] of Object.entries(views)) qa[name] = await writeLocal('qa/' + stem + '.' + name + '.png', bytes);
    const recognition = await recognitionPreviews(registered.buffer, image);
    for (const [name, bytes] of Object.entries(recognition.outputs)) qa[name] = await writeLocal('qa/' + stem + '.' + name + '.png', bytes);
    const handGrips = entry.handGrips ? Object.fromEntries(Object.entries(entry.handGrips).map(([side, value]) => {
      const sourcePoint = point(value.sourcePoint, 'hand grip');
      const s = registered.transform.uniformScale, [tx, ty] = registered.transform.translationPx;
      return [side, { ...value, sourcePoint, registeredPoint: [sourcePoint[0] * s + tx, sourcePoint[1] * s + ty] }];
    })) : null;
    const report = { id: entry.id, kind: 'source-master-only', runtime: false, runtimeFrameCredit: 0,
      runId: entry.runId ?? null, source: { path: rawPath, image: sourceImage }, identityReview: entry.identityReview,
      removal: cutout.report, transform: registered.transform, output, image, qa, recognition: recognition.report,
      handGrips, primaryHand: entry.primaryHand ?? null, sourceLandmarks: entry.sourceLandmarks ?? null,
      revision: entry.revision ?? null, visualQa: { status: 'requires-actual-view', accepted: false },
      approvalStatus: 'awaiting-parent-and-user-review', sourceGroupTransformLocked: false };
    const reportFile = await writeJson('qa/' + stem + '.report.json', report);
    sources.push({ ...report, reportFile });
  }
  const fragment = { schemaVersion: 1, scope: 'Fantasy_Actors_v2-source-samples-only',
    status: 'processed-awaiting-visual-review', runtimeCompletedCount: 0, expectedRuntimeCount: 115,
    sourceCount: sources.length, expectedSourceCount: 3, pendingSourceIds: SAMPLE_IDS.filter(id => !sources.some(s => s.id === id)),
    sources, runtimeAssets: [], registrationPolicy: 'Independent first source drafts establish proposed identity transforms; lock each after approval and reuse for every frame in its group.',
    frozenEnvironmentWritten: false, runtimeIntegrationPerformed: false };
  const fragmentFile = await writeJson(spec.fragmentFile ?? 'samples.fragment.json', fragment);
  return { fragment: fragmentFile, sources: sources.map(s => ({ id: s.id, output: s.output, image: s.image, handGrips: s.handGrips })) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [command, path] = process.argv.slice(2);
  if (command === 'inspect' && path) console.log(JSON.stringify(await inspectImage(resolve(path)), null, 2));
  else if (command === 'process' && path) console.log(JSON.stringify(await processSamples(JSON.parse(await readFile(resolve(path), 'utf8'))), null, 2));
  else throw new Error('Usage: node process-samples.mjs inspect <image> | process <reviewed-spec.json>');
}

