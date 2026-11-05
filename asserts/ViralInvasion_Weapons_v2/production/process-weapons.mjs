/**
 * Weapons v2 technical alpha extraction and rigid registration only.
 * node asserts/ViralInvasion_Weapons_v2/production/process-weapons.mjs [spec.json] [--preview]
 * Default spec: production/source-spec.json. Relative spec/raw paths resolve inside Weapons_v2.
 * sourceGrip/sourceMuzzle/sourceAxisRear/holes use CROPPED source coordinates.
 * Final registration never fits or crops an image: uniformScale is explicit and the actual
 * sourceGrip maps exactly to targetGrip (default [160,300]). alignAxis:true rotates the whole
 * source by -atan2(muzzle-axisRear) before this uniform scale and translation.
 * --preview makes first-source drafts only, max400px span centered on512, with forward/inverse
 * matrices. A preview fit is never reused implicitly as final registration.
 * Existing image paths are immutable; increment sourceVersion to v02 etc for revisions.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeReviewedSourceCutout } from '../../ViralInvasion_Fantasy_Actors_v2/production/process-source-masters.mjs';
import { neutralBackgroundCutout } from '../../ViralInvasion_Expedition_v1/production/process-expedition-sources.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SIZE = 512, DEFAULT_GRIP = [160, 300], MIN_MARGIN = 8;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const local = absolute => relative(ROOT, absolute).replaceAll('\\', '/');
const png = image => sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
  .png({ compressionLevel: 9 }).toBuffer();
const pair = (value, name) => {
  if (!Array.isArray(value) || value.length !== 2 || value.some(n => !Number.isFinite(n)))
    throw new Error(name + ' must contain two finite numbers');
  return value;
};
const mapPoint = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const matrixRows = m => [[m[0], m[2], m[4]], [m[1], m[3], m[5]], [0, 0, 1]];
function inverse(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) throw new Error('Singular registration');
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
async function guarded(file) {
  const absolute = resolve(ROOT, file), rel = relative(ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Writes must remain inside Weapons_v2');
  let cursor = absolute;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Output links/junctions are unsupported'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === ROOT) break;
    cursor = dirname(cursor);
  }
  return absolute;
}
async function absent(file) {
  const absolute = await guarded(file);
  try { await lstat(absolute); } catch (error) { if (error.code === 'ENOENT') return absolute; throw error; }
  throw new Error('Refusing to overwrite image: ' + local(absolute));
}
async function writeImage(file, bytes) {
  const absolute = await absent(file);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: 'wx' });
  return { path: local(absolute), sha256: sha(bytes), bytes: bytes.length };
}
async function writeJson(file, value) {
  const absolute = await guarded(file), temp = await guarded(file + '.' + randomUUID() + '.tmp');
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, absolute);
}
async function rgba(input) {
  const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) if (!data[p + 3]) data.fill(0, p, p + 3);
  return { data, width: info.width, height: info.height };
}
function inspect(image) {
  let transparent = 0, partial = 0, opaque = 0, hiddenRgb = 0;
  let left = image.width, top = image.height, right = -1, bottom = -1;
  let thresholdLeft = image.width, thresholdTop = image.height, thresholdRight = -1, thresholdBottom = -1;
  const border = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const p = (y * image.width + x) * 4, a = image.data[p + 3];
    if (!a) { transparent++; if (image.data[p] || image.data[p + 1] || image.data[p + 2]) hiddenRgb++; continue; }
    if (a === 255) opaque++; else partial++;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (y === 0) border.top++; if (x === 0) border.left++;
    if (y === image.height - 1) border.bottom++; if (x === image.width - 1) border.right++;
    if (a >= 8) {
      thresholdLeft = Math.min(thresholdLeft, x); thresholdTop = Math.min(thresholdTop, y);
      thresholdRight = Math.max(thresholdRight, x); thresholdBottom = Math.max(thresholdBottom, y);
    }
  }
  const bbox = right < 0 ? null : [left, top, right + 1, bottom + 1];
  const margins = bbox ? { left, top, right: image.width - right - 1, bottom: image.height - bottom - 1 } : null;
  return { dimensions: [image.width, image.height], channels: 4, hasAlphaChannel: true,
    alpha: { transparent, partial, opaque, hiddenRgb, visible: partial + opaque,
      borderVisible: Object.values(border).reduce((a, b) => a + b, 0), border },
    bbox, bboxAlphaThreshold8: thresholdRight < 0 ? null : [thresholdLeft, thresholdTop, thresholdRight + 1, thresholdBottom + 1],
    margins, minimumMargin: margins ? Math.min(...Object.values(margins)) : null };
}
function projectedBounds(image, matrix) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const hx = (Math.abs(matrix[0]) + Math.abs(matrix[2])) / 2;
  const hy = (Math.abs(matrix[1]) + Math.abs(matrix[3])) / 2;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (!image.data[(y * image.width + x) * 4 + 3]) continue;
    const p = mapPoint(matrix, [x + .5, y + .5]);
    left = Math.min(left, p[0] - hx); top = Math.min(top, p[1] - hy);
    right = Math.max(right, p[0] + hx); bottom = Math.max(bottom, p[1] + hy);
  }
  if (!Number.isFinite(left)) throw new Error('No visible pixels');
  return [left, top, right, bottom];
}
/** Inverse bilinear sampling uses premultiplied colours, then restores straight RGBA. */
function transform(source, matrix) {
  const inv = inverse(matrix), data = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const p = mapPoint(inv, [x + .5, y + .5]), sx = p[0] - .5, sy = p[1] - .5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0, r = 0, g = 0, b = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const xx = x0 + dx, yy = y0 + dy;
      if (xx < 0 || yy < 0 || xx >= source.width || yy >= source.height) continue;
      const from = (yy * source.width + xx) * 4;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * source.data[from + 3] / 255;
      alpha += weight; r += source.data[from] * weight; g += source.data[from + 1] * weight; b += source.data[from + 2] * weight;
    }
    const to = (y * SIZE + x) * 4, a = Math.round(alpha * 255);
    if (!a || alpha < 1e-12) continue;
    data[to] = Math.round(r / alpha); data[to + 1] = Math.round(g / alpha); data[to + 2] = Math.round(b / alpha); data[to + 3] = a;
  }
  return { data, width: SIZE, height: SIZE };
}
function sourcePoint(value, label, image) {
  const p = pair(value, label);
  if (p[0] < 0 || p[1] < 0 || p[0] > image.width || p[1] > image.height) throw new Error(label + ' outside cropped source');
  return p;
}
function registration(entry, source, preview) {
  const grip = entry.sourceGrip ? sourcePoint(entry.sourceGrip, 'sourceGrip', source) : null;
  const muzzle = entry.sourceMuzzle ? sourcePoint(entry.sourceMuzzle, 'sourceMuzzle', source) : null;
  const rear = entry.sourceAxisRear ? sourcePoint(entry.sourceAxisRear, 'sourceAxisRear', source) : null;
  const targetGrip = pair(entry.targetGrip ?? DEFAULT_GRIP, 'targetGrip');
  if (!preview && (!grip || !muzzle || !rear)) throw new Error(entry.key + ': final output requires actual sourceGrip, sourceMuzzle and sourceAxisRear');
  const delta = muzzle && rear ? [muzzle[0] - rear[0], muzzle[1] - rear[1]] : null;
  if (delta && Math.hypot(...delta) < 1e-6) throw new Error('Muzzle and axis rear must differ');
  const originalAngle = delta ? Math.atan2(delta[1], delta[0]) * 180 / Math.PI : null;
  const align = entry.alignAxis === true || entry.alignAxisToX === true;
  if (align && entry.rotationDeg !== undefined) throw new Error('Choose alignAxis or explicit rotationDeg, not both');
  if (align && originalAngle === null && !preview) throw new Error('alignAxis requires the annotated actual source axis');
  const rotationDeg = align && originalAngle !== null ? -originalAngle : entry.rotationDeg ?? 0;
  if (!Number.isFinite(rotationDeg)) throw new Error('rotationDeg must be finite');
  const angle = rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  let scale, tx, ty;
  if (preview) {
    const bounds = projectedBounds(source, [c, s, -s, c, 0, 0]);
    const maxSize = pair(entry.previewMaxSize ?? [400, 400], 'previewMaxSize');
    if (maxSize.some(n => n < 32 || n > 480)) throw new Error('previewMaxSize must fit inside32..480');
    scale = Math.min(maxSize[0] / (bounds[2] - bounds[0]), maxSize[1] / (bounds[3] - bounds[1]));
    tx = SIZE / 2 - scale * (bounds[0] + bounds[2]) / 2;
    ty = SIZE / 2 - scale * (bounds[1] + bounds[3]) / 2;
  } else {
    scale = entry.uniformScale;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error(entry.key + ': final output requires explicit uniformScale');
    tx = targetGrip[0] - scale * (c * grip[0] - s * grip[1]);
    ty = targetGrip[1] - scale * (s * grip[0] + c * grip[1]);
  }
  const matrix = [scale * c, scale * s, -scale * s, scale * c, tx, ty];
  const projected = projectedBounds(source, matrix);
  if (projected[0] < MIN_MARGIN || projected[1] < MIN_MARGIN || projected[2] > SIZE - MIN_MARGIN || projected[3] > SIZE - MIN_MARGIN)
    throw new Error(entry.key + ': explicit transform clips required8px transparent margin; reduce uniformScale or revise targetGrip, never auto-fit final');
  const normalizedAxis = delta ? [c * delta[0] - s * delta[1], s * delta[0] + c * delta[1]].map(n => n / Math.hypot(...delta)) : null;
  return { preview, scale, uniformScale: scale, rotationDeg, originalAxisAngleDeg: originalAngle,
    alignAxisRequested: align, alignAxisApplied: align && originalAngle !== null,
    targetAxis: align && originalAngle !== null ? [1, 0] : null,
    sourceGrip: grip, sourceMuzzle: muzzle, sourceAxisRear: rear,
    grip: grip ? mapPoint(matrix, grip) : null, muzzle: muzzle ? mapPoint(matrix, muzzle) : null,
    axisRear: rear ? mapPoint(matrix, rear) : null, mappedAxis: normalizedAxis,
    axisDegrees: normalizedAxis ? Math.atan2(normalizedAxis[1], normalizedAxis[0]) * 180 / Math.PI : null,
    gripToMuzzleIsNotBarrelAxis: true, sourceToRegistered: matrix,
    matrixCroppedToRegistered: matrixRows(matrix), matrixRegisteredToCropped: matrixRows(inverse(matrix)),
    projectedAlphaBounds: projected, targetCanvas: [SIZE, SIZE], targetGrip: preview ? null : targetGrip,
    trim: false, method: preview ? 'first-source-preview-uniform-fit-only-not-final-registration' : 'rigid-axis-rotation-uniform-scale-and-exact-grip-translation',
    alphaBoundsUsedForFinalScaling: false };
}
async function qaBuffers(buffer, image) {
  const black = await sharp(buffer).flatten({ background: '#000000' }).png().toBuffer();
  const white = await sharp(buffer).flatten({ background: '#ffffff' }).png().toBuffer();
  const blackWhite = await sharp({ create: { width: SIZE * 2, height: SIZE, channels: 4, background: '#ffffff' } })
    .composite([{ input: black, left: 0, top: 0 }, { input: white, left: SIZE, top: 0 }]).png().toBuffer();
  const alpha = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  const outputs = { 'black-white': blackWhite, alpha: await sharp(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toBuffer() };
  const smallLayers = [];
  for (const [index, size] of [96, 64, 32].entries()) {
    outputs[size + 'px'] = await sharp(buffer).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
    const enlarged = await sharp(outputs[size + 'px']).resize(192, 192, { kernel: 'nearest' }).flatten({ background: index % 2 ? '#ffffff' : '#26362f' }).png().toBuffer();
    smallLayers.push({ input: enlarged, left: index * 192, top: 0 });
  }
  outputs['small-preview'] = await sharp({ create: { width: 576, height: 192, channels: 4, background: '#26362f' } }).composite(smallLayers).png().toBuffer();
  return outputs;
}
async function optionalReport(file, scope) {
  try {
    const report = JSON.parse(await readFile(await guarded(file), 'utf8'));
    if (report.scope !== scope || !Array.isArray(report.sources)) throw new Error('Existing unrelated report');
    return report;
  } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, scope, sources: [] }; throw error; }
}
export async function processWeapons(specPath, { preview = false } = {}) {
  const specAbsolute = await guarded(specPath ?? 'production/source-spec.json');
  const spec = JSON.parse((await readFile(specAbsolute, 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(spec.sources) || !spec.sources.length) throw new Error('Spec sources must be a nonempty array');
  const keys = new Set();
  for (const entry of spec.sources) {
    if (!/^[A-Za-z0-9_.-]+$/.test(entry.key ?? '') || entry.key === '.' || entry.key === '..' || keys.has(entry.key)) throw new Error('Unsafe or duplicate weapon key');
    keys.add(entry.key);
  }
  const reportPath = preview ? 'production/qa/drafts/draft-processing.json' : 'production/source-processing.json';
  const scope = preview ? 'Weapons_v2-first-source-preview-only' : 'Weapons_v2-registered-runtime-weapons-only';
  const report = await optionalReport(reportPath, scope);
  for (const entry of spec.sources) {
    const version = entry.sourceVersion ?? 'v01';
    if (!/^v[0-9]{2,}$/.test(version)) throw new Error('sourceVersion must be vNN');
    const rawPath = isAbsolute(entry.rawPath) ? resolve(entry.rawPath) : resolve(ROOT, entry.rawPath);
    const raw = await readFile(rawPath), metadata = await sharp(raw).metadata();
    if (entry.rawSha256 && sha(raw) !== entry.rawSha256) throw new Error('Source raw SHA changed: ' + entry.key);
    if ((metadata.orientation ?? 1) !== 1) throw new Error('Bake source orientation first');
    const crop = entry.crop ?? { left: 0, top: 0, width: metadata.width, height: metadata.height };
    if (!['left', 'top', 'width', 'height'].every(k => Number.isInteger(crop[k])) || crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1
      || crop.left + crop.width > metadata.width || crop.top + crop.height > metadata.height) throw new Error('Crop outside raw image: ' + entry.key);
    const cropped = await sharp(raw).extract(crop).ensureAlpha().png().toBuffer(), before = await rgba(cropped), initial = inspect(before);
    const authoredAlpha = initial.alpha.transparent > 0 || initial.alpha.partial > 0;
    const whiteMin = entry.whiteMin ?? 225, chromaMax = entry.chromaMax ?? 22, holes = entry.holes ?? [];
    let cutout, removal;
    if (authoredAlpha) {
      if (holes.length) throw new Error('Authored alpha is preserved; flatten explicitly before editing holes');
      cutout = await png(before); removal = { method: 'preserve-authored-alpha', initialAlpha: initial.alpha };
    } else if (whiteMin < 220) {
      const result = await neutralBackgroundCutout(cropped, { whiteMin, chromaMax, holes, edgeUnmatte: entry.edgeUnmatte });
      cutout = result.buffer; removal = result.report;
    } else {
      const result = await makeReviewedSourceCutout(cropped, { whiteMin, chromaMax, edgeWidth: 2,
        matteCleanup: true, negativeSpaceSeeds: holes, protectedPolygons: entry.protectedPolygons ?? [],
        preservationProbes: entry.preservationProbes ?? [], keepLargestComponent: entry.keepLargestComponent === true });
      cutout = result.buffer; removal = result.report;
    }
    const source = await rgba(cutout), sourceImage = inspect(source);
    if (!sourceImage.bbox || !sourceImage.alpha.transparent) throw new Error('Source lacks a visible subject or real transparent background');
    const registered = registration(entry, source, preview), image = transform(source, registered.sourceToRegistered), actual = inspect(image);
    if (!actual.bbox || !actual.alpha.transparent || actual.alpha.borderVisible || actual.alpha.hiddenRgb || actual.minimumMargin < MIN_MARGIN)
      throw new Error(entry.key + ': registered alpha/border/margin check failed');
    const output = await png(image), decoded = await rgba(output), saved = inspect(decoded), qas = await qaBuffers(output, decoded);
    const stem = entry.key + '_' + version, target = preview ? 'production/qa/drafts/' + stem + '.png' : 'weapons/' + stem + '.png';
    const qaDir = preview ? 'production/qa/drafts/' : 'production/qa/final/';
    const filenames = [target, ...Object.keys(qas).map(key => qaDir + stem + '.' + key + '.png')];
    // Validate all paths before this source's first image write.
    await Promise.all(filenames.map(absent));
    const written = await writeImage(target, output), qa = {};
    for (const [name, bytes] of Object.entries(qas)) qa[name] = await writeImage(qaDir + stem + '.' + name + '.png', bytes);
    const m = registered.sourceToRegistered, originalMatrix = [m[0], m[1], m[2], m[3], m[4] - m[0] * crop.left - m[2] * crop.top,
      m[5] - m[1] * crop.left - m[3] * crop.top];
    const probe = point => {
      if (!point) return null;
      const x = Math.min(SIZE - 1, Math.max(0, Math.floor(point[0]))), y = Math.min(SIZE - 1, Math.max(0, Math.floor(point[1])));
      return { point, nearestPixel: [x, y], rgba: [...decoded.data.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)] };
    };
    const record = { key: entry.key, sourceVersion: version, runtime: !preview, runtimeFrameCredit: preview ? 0 : 1,
      status: preview ? 'draft-for-real-point-annotation-not-runtime' : 'registered-awaiting-producer-image-review',
      runId: entry.runId ?? null, sourceRunId: entry.sourceRunId ?? entry.runId ?? null, prompt: entry.prompt ?? null,
      source: { rawPath: local(rawPath).startsWith('..') ? rawPath : local(rawPath), rawSha256: sha(raw), rawBytes: raw.length,
        rawDimensions: [metadata.width, metadata.height], crop, croppedSha256: sha(cropped), cutoutSha256: sha(cutout), image: sourceImage },
      transparency: { authoredAlphaPreserved: authoredAlpha, whiteMin: authoredAlpha ? null : whiteMin,
        chromaMax: authoredAlpha ? null : chromaMax, holes, removal },
      registration: { ...registered, matrixOriginalToRegistered: matrixRows(originalMatrix),
        matrixRegisteredToOriginal: matrixRows(inverse(originalMatrix)) },
      grip: registered.grip, muzzle: registered.muzzle, axisRear: registered.axisRear, axis: registered.mappedAxis,
      gripToMuzzleIsNotBarrelAxis: true, trim: false, sourceRect: { x: 0, y: 0, width: SIZE, height: SIZE },
      dimensions: [SIZE, SIZE], probes: { grip: probe(registered.grip), muzzle: probe(registered.muzzle), axisRear: probe(registered.axisRear) },
      output: { ...written, ...saved }, qa,
      selfChecks: { trueRgba: true, actualTransparency: true, fourBordersTransparent: true, minimumTransparentMargin: saved.minimumMargin,
        hiddenRgbClear: saved.alpha.hiddenRgb === 0, completeProjectedSourceInsideCanvas: true, explicitUniformFinalScale: !preview,
        exactGripMapping: preview ? null : Math.hypot(registered.grip[0] - registered.targetGrip[0], registered.grip[1] - registered.targetGrip[1]) < 1e-7,
        rigidRotationOnly: true, noImageOrWeaponAnatomySynthesizedByProcessing: true, reviewedExistingImageOverwritten: false, actualImageReview: false } };
    const previous = report.sources.find(s => s.key === entry.key);
    if (previous) record.history = [...(previous.history ?? []), { ...previous, history: undefined }];
    report.sources = [...report.sources.filter(s => s.key !== entry.key), record];
    report.updatedAt = new Date().toISOString();
    report.previewImagesCountAsRuntime = false;
    await writeJson(reportPath, report);
    await writeJson(qaDir + stem + '.metadata.json', record);
    process.stdout.write(JSON.stringify({ key: entry.key, preview, output: written.path, sha256: written.sha256,
      grip: registered.grip, muzzle: registered.muzzle, axis: registered.mappedAxis, rotationDeg: registered.rotationDeg, bbox: saved.bbox }) + '\n');
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), preview = args.includes('--preview');
  const fileArgs = args.filter(arg => arg !== '--preview');
  if (fileArgs.length > 1) throw new Error('At most one spec path is accepted');
  try { await processWeapons(fileArgs[0] ?? 'production/source-spec.json', { preview }); }
  catch (error) { process.stderr.write((error.stack ?? String(error)) + '\n'); process.exitCode = 1; }
}
