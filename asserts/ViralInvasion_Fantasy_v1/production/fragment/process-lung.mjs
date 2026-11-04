import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { raw, removeReviewedWhiteHoles, save } from './process-first-four.mjs';
import { makeSeamlessGround, removeWhiteMatte, registerStateGroup, outputPath, tiledPreview, inspectSeams } from '../fantasy-art-process.mjs';

const crop = { left: 768, top: 704, width: 512, height: 512 };
const png = (data, width, height, channels = 4) => sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
async function largestBody(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = width * height, seen = new Uint8Array(count), labels = new Int32Array(count), queue = new Uint32Array(count);
  let label = 0, largestLabel = 0, largest = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (seen[i] || data[i * 4 + 3] < 8) continue;
    let head = 0, tail = 1; label++; seen[i] = 1; queue[0] = i;
    while (head < tail) { const p = queue[head++], x = p % width, y = Math.floor(p / width); labels[p] = label;
      for (const n of [x ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (n >= 0 && !seen[n] && data[n * 4 + 3] >= 8) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    total += tail; if (tail > largest) { largest = tail; largestLabel = label; }
  }
  const out = Buffer.from(data); for (let i = 0; i < count; i++) if (labels[i] !== largestLabel) out.fill(0, i * 4, i * 4 + 4);
  return { buffer: await png(out, width, height), report: { method: 'retain-single-connected-plant', componentCount: label, retainedPixels: largest,
    detachedPaperPixelsRemoved: total - largest, creamRimPreserved: true } };
}
async function stemFoot(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let bottom = -1; for (let y = 1500; y < height; y++) for (let x = 800; x < 1250; x++) if (data[(y * width + x) * 4 + 3] >= 192) bottom = Math.max(bottom, y);
  let sx = 0, count = 0; for (let y = bottom - 7; y <= bottom; y++) for (let x = 800; x < 1250; x++) if (data[(y * width + x) * 4 + 3] >= 192) { sx += x; count++; }
  return { point: [sx / count, bottom], method: 'lowest opaque cut-stem support; x centroid of its last eight rows in x800..1250', alphaThreshold: 192 };
}
async function shift(input, delta) {
  return sharp({ create: { width: 2048, height: 2048, channels: 4, background: '#00000000' } })
    .composite([{ input, left: delta[0], top: delta[1] }]).png().toBuffer();
}
async function alignStem(aBuffer, bBuffer) {
  const a = await sharp(aBuffer).ensureAlpha().raw().toBuffer(), b = await sharp(bBuffer).ensureAlpha().raw().toBuffer();
  const roi = [850, 1530, 370, 310], width = 2048;
  function dice(dx, dy) { let aa = 0, bb = 0, both = 0;
    for (let y = roi[1]; y < roi[1] + roi[3]; y += 2) for (let x = roi[0]; x < roi[0] + roi[2]; x += 2) {
      const av = a[(y * width + x) * 4 + 3] >= 192, bv = b[((y - dy) * width + x - dx) * 4 + 3] >= 192;
      aa += av; bb += bv; both += av && bv;
    } return 2 * both / (aa + bb);
  }
  let best = { dx: 0, dy: 0, dice: dice(0, 0) }; const before = best.dice;
  for (let dy = -24; dy <= 24; dy++) for (let dx = -24; dx <= 24; dx++) {
    const score = dice(dx, dy); if (score > best.dice + 1e-10 || Math.abs(score - best.dice) < 1e-10 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy)) best = { dx, dy, dice: score };
  }
  const ha = await stemFoot(aBuffer), ib = await stemFoot(bBuffer);
  const delta = ha.point.map((v, n) => Math.round(v - ib.point[n]));
  return { buffer: await shift(bBuffer, delta), report: { sourceRoi: roi, sampleStride: 2, alphaThreshold: 192,
    sourceTranslation: delta, logicalTranslation: delta.map(v => v / 2), diceBefore: before, diceAfter: dice(...delta),
    alternativeBestRoiTranslation: [best.dx, best.dy], alternativeBestRoiDice: best.dice,
    selectionReason: 'Align the corresponding cut-stem foot directly. Broader stem shape changed, so optimizing its whole silhouette alone leaves a foot offset.' } };
}
async function cleanHealthyBackLeafBleed(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let removed = 0;
  for (let y = 900; y < 1100; y++) for (let x = 1415; x < 1600; x++) { const at = (y * width + x) * 4;
    if (data[at + 3] && Math.min(data[at], data[at + 1], data[at + 2]) >= 225
        && Math.max(data[at], data[at + 1], data[at + 2]) - Math.min(data[at], data[at + 1], data[at + 2]) <= 25) {
      data.fill(0, at, at + 4); removed++;
    }
  }
  return { buffer: await png(data, width, height), report: { region: [1415, 900, 185, 200], removedPixels: removed,
    reason: 'Original close-up confirms pale pigment bleed outside the dark back-leaf outline; cream-yellow rim and mint leaf remain foreground.' } };
}
async function restoreInfectedPaleBackLeaf(input, original) {
  const trace = 'M1268 581 C1334 580 1409 612 1427 669 C1450 731 1423 790 1370 825 L1280 882 L1246 782 Z';
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"><rect width="2048" height="2048" fill="black"/><path d="${trace}" fill="white"/></svg>`)).extractChannel(0).raw().toBuffer();
  const rgb = await sharp(original).removeAlpha().raw().toBuffer(), pixels = Buffer.alloc(2048 * 2048 * 4);
  for (let i = 0; i < 2048 * 2048; i++) { for (let c = 0; c < 3; c++) pixels[i * 4 + c] = rgb[i * 3 + c]; pixels[i * 4 + 3] = mask[i]; }
  const patch = await png(pixels, 2048, 2048);
  const buffer = await sharp(input).composite([{ input: patch, left: 0, top: 0 }]).png().toBuffer();
  return { buffer, report: { method: 'original-pixel-restoration-inside-visually-traced-pale-back-leaf', sourcePixelColoursUnchanged: true,
    alphaTraceSourceCoordinates: trace, reason: 'Original close-up shows a real pale necrotic back leaf bounded by a faint cream contour. Restore its original pixels instead of leaving threshold-eaten ragged white fragments.' } };
}
async function overlay50(a, b) {
  const aa = await sharp(a).ensureAlpha().raw().toBuffer(), bb = await sharp(b).ensureAlpha().raw().toBuffer(), data = Buffer.alloc(aa.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.round((aa[i] + bb[i]) / 2);
  return png(data, 1024, 1024);
}
const ids = ['lung.ground.healthy', 'lung.ground.infected', 'lung.plant.healthy', 'lung.plant.infected'];
const sources = Object.fromEntries(await Promise.all(ids.map(async id => [id, await raw(id)])));
const hq = await sharp(sources[ids[0]].input).extract(crop).removeAlpha().png().toBuffer();
const iq = await sharp(sources[ids[1]].input).extract(crop).removeAlpha().png().toBuffer();
const healthyGroundResult = await makeSeamlessGround(hq, { contrast: 1, saturation: 1 });
healthyGroundResult.report.sourceSha256 = sources[ids[0]].provenance.rawSha256;
healthyGroundResult.report.processing.sourceCrop = crop;
healthyGroundResult.report.processing.cropReason = 'Central alveolar field with no purple lesion pixels; minimize coarse vessel junctions without colour or Y compression';
const healthyGround = await save(healthyGroundResult, ids[0], { ...sources[ids[0]].provenance, technical: healthyGroundResult.report,
  processing: healthyGroundResult.report.processing, visualReview: { state: 'awaiting-3x3-review', colourGrade: 'none; contrast=1 saturation=1; no Y compression' } });

// The lung AI infected image is not a fully infected material. Use its fungal detail
// plus the already approved heart infected material palette, preserving one lung base.
const heartMaterial = await raw('heart.ground.infected');
const paletteCrop = { left: 512, top: 512, width: 1024, height: 1024 };
const palette = await sharp(heartMaterial.input).extract(paletteCrop).resize(512, 512).removeAlpha().png().toBuffer();
const hs = await sharp(hq).stats(), ps = await sharp(palette).stats();
const h = await sharp(hq).raw().toBuffer(), i = await sharp(iq).raw().toBuffer(), blurred = await sharp(iq).blur(6).raw().toBuffer();
const meanH = hs.channels.map(c => c.mean), meanP = ps.channels.map(c => c.mean), gains = hs.channels.map((c, n) => Math.min(1, ps.channels[n].stdev / c.stdev));
const data = Buffer.alloc(h.length);
for (let n = 0; n < 512 * 512; n++) {
  const j = n * 3, detailLuma = .2126 * (i[j] - blurred[j]) + .7152 * (i[j + 1] - blurred[j + 1]) + .0722 * (i[j + 2] - blurred[j + 2]);
  const detail = Math.max(-3, Math.min(3, detailLuma * .12));
  for (let c = 0; c < 3; c++) data[j + c] = Math.round(Math.max(0, Math.min(255, meanP[c] + (h[j + c] - meanH[c]) * gains[c] + detail)));
}
const infectedGroundResult = await makeSeamlessGround(await png(data, 512, 512, 3), { contrast: 1, saturation: 1 });
const derivation = { method: 'shared-lung-alveolar-base-approved-grey-purple-palette-plus-weak-lung-fungal-detail', aiFramesClaimedPixelRegistered: false,
  lungHealthyBase: sources[ids[0]].provenance, lungInfectedDetail: sources[ids[1]].provenance, approvedGreyPurpleMaterial: heartMaterial.provenance,
  baseAndDetailCrop: crop, paletteCrop, paletteRgb: meanP, healthyMeanRgb: meanH, channelGains: gains,
  formula: 'paletteMean[c]+(healthyPixel[c]-healthyMean[c])*min(1,paletteStd[c]/healthyStd[c])+clamp(.12*(lungInfectedY-Gaussian6(lungInfectedY)),-3,3)',
  detailStrength: .12, detailClampRgb: 3, baseCoordinateDelta: [0, 0], legacyGlobalToneUsed: false,
  reason: 'Lung infected raw contains isolated grey/purple lesions on a healthy cream base; not accepted as a complete infected floor. Authorized shared-base fallback uses approved heart r02 material palette and lung infection detail.' };
const infectedGround = await save(infectedGroundResult, ids[1], { ...sources[ids[1]].provenance, technical: infectedGroundResult.report,
  processing: derivation, visualReview: { state: 'awaiting-3x3-review', sourceStateSemantic: 'derived-fallback-fully-grey-purple' } });
const floorOverlay = await overlay50(healthyGroundResult.buffer, infectedGroundResult.buffer), floorOverlayPath = join(outputPath('qa'), 'lung.ground.pair.overlay50.png');
await writeFile(floorOverlayPath, floorOverlay);
const floorOverlayRepeat = join(outputPath('qa'), 'lung.ground.pair.overlay50.3x3.png'); await writeFile(floorOverlayRepeat, await tiledPreview(floorOverlay));
healthyGround.registration = infectedGround.registration = { group: 'lung.ground', state: 'algorithmically-shared-base', baseCoordinateDelta: [0, 0], independentAiFrameRegistrationClaimed: false };
healthyGround.pairQa = infectedGround.pairQa = { overlay50: floorOverlayPath, overlay50Repeat3x3: floorOverlayRepeat };

const hp = await removeWhiteMatte(sources[ids[2]].input, { whiteMin: 238, chromaMax: 18, edgeWidth: 2 });
const hh = await removeReviewedWhiteHoles(hp.buffer, [[1017, 1314], [1302, 1406], [1265, 1253]], { whiteMin: 238, rootCleanup: false,
  reviewLabel: 'three-reviewed-branch-air-gaps-cream-leaf-rim-preserved' });
const healthyBleed = await cleanHealthyBackLeafBleed(hh.buffer), hb = await largestBody(healthyBleed.buffer);
const ip = await removeWhiteMatte(sources[ids[3]].input, { whiteMin: 238, chromaMax: 18, edgeWidth: 2 });
const ih = await removeReviewedWhiteHoles(ip.buffer, [[1380, 1158]], { whiteMin: 238, rootCleanup: false,
  reviewLabel: 'one-reviewed-branch-air-gap-cream-leaf-rim-preserved' });
const restoredBackLeaf = await restoreInfectedPaleBackLeaf(ih.buffer, sources[ids[3]].input);
const ib = await largestBody(restoredBackLeaf.buffer), alignment = await alignStem(hb.buffer, ib.buffer);
const healthyFoot = await stemFoot(hb.buffer), target = [1024, 1740.8];
const sharedPlacement = target.map((v, n) => Math.round(v - healthyFoot.point[n]));
const alignedHealthy = await shift(hb.buffer, sharedPlacement), alignedInfected = await shift(alignment.buffer, sharedPlacement);
const hf = await stemFoot(alignedHealthy), inf = await stemFoot(alignedInfected);
const residual = inf.point.map((v, n) => (v - hf.point[n]) / 2), anchorError = hf.point.map((v, n) => (v - target[n]) / 2);
const registration = { groupScale: .5, noIndependentAlphaHeightScaling: true, transformMethod: 'corresponding-cut-stem-only-translation-then-shared-full-canvas-resize',
  healthyOriginalFoot: healthyFoot, targetSourceAnchor: target, sharedSourcePlacement: sharedPlacement,
  infectedCorrespondence: alignment.report, alignedHealthyFoot: hf, alignedInfectedFoot: inf,
  healthyAnchorResidualLogicalPx: anchorError, pairFootResidualLogicalPx: residual, pairFootResidualEuclideanLogicalPx: Math.hypot(...residual),
  crownChangeIsIntentionalSourceGeometry: true, limitation: 'Changed leaves are not forced into a common alpha height. Measurement is restricted to corresponding stem/base.' };
const plants = await registerStateGroup([{ id: ids[2], input: alignedHealthy }, { id: ids[3], input: alignedInfected }], { removeWhite: false, scale: .5, sourceAnchor: [.5, .85] });
const plantRecords = [];
for (let n = 0; n < 2; n++) {
  const id = ids[n + 2], outer = n ? ip : hp, holes = n ? ih : hh, body = n ? ib : hb;
  plantRecords.push(await save(plants.results[n], id, { ...sources[id].provenance, processing: { outer: outer.report.processing, holes: holes.report, body: body.report,
    backLeafQaCorrection: n ? restoredBackLeaf.report : healthyBleed.report },
    registration: { group: 'lung.plant', state: 'measured-cut-stem-pair', transform: plants.transform, measured: registration },
    visualReview: { state: 'awaiting-alpha-and-pair-review', creamRimIsSubject: true, noColourGrade: true } }));
}
const plantOverlay = await overlay50(plants.results[0].buffer, plants.results[1].buffer), plantOverlayPath = join(outputPath('qa'), 'lung.plant.pair.overlay50.png');
await writeFile(plantOverlayPath, plantOverlay);
const stemOverlayPath = join(outputPath('qa'), 'lung.plant.pair.stem-overlay50.png');
await writeFile(stemOverlayPath, await sharp(plantOverlay).extract({ left: 400, top: 730, width: 230, height: 180 }).resize(920, 720).flatten({ background: '#202020' }).png().toBuffer());
for (const record of plantRecords) record.pairQa = { overlay50: plantOverlayPath, stemOverlay50: stemOverlayPath };

const outputs = [healthyGround, infectedGround, ...plantRecords], plan = JSON.parse(await readFile(join(outputPath(''), 'asset-plan.json'), 'utf8'));
const entries = outputs.map(output => { const base = plan.assets.find(a => a.id === output.id);
  return { ...base, status: 'processed-awaiting-final-visual-qa', outputPath: output.outputPath, productionPath: output.outputPath,
    dimensions: [output.image.width, output.image.height], sha256: output.outputSha256, runId: output.runId,
    source: { type: output.id === ids[1] ? 'maliang-shared-lung-base-with-approved-heart-material-fallback' : 'maliang-generation-processed',
      rawPath: output.rawPath, rawSha256: output.rawSha256, runId: output.runId, nodeId: output.nodeId },
    processing: output.processing, measurements: output.image, registration: { ...base.registration, ...output.registration },
    tileability: output.id.startsWith('lung.ground.') ? { required: true, status: 'numeric-passed-awaiting-visual-review', seams: output.technical.seams } : undefined,
    qa: { ...output.qa, pair: output.pairQa }, visualReview: output.visualReview, fallback: output.id === ids[1] ? derivation : null };
});
await writeFile(join(outputPath('fragment'), 'batch04-lung-technical.json'), JSON.stringify({ schemaVersion: 1, outputs, floorDerivation: derivation, plantRegistration: registration,
  floorOverlaySeams: await inspectSeams(floorOverlay), deliveryModified: false }, null, 2) + '\n');
await writeFile(join(outputPath('fragment'), 'batch04-lung.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n');
console.log(JSON.stringify({ entries: entries.map(e => ({ id: e.id, path: e.outputPath, bbox: e.measurements.bbox, sha256: e.sha256, alpha: e.measurements.alpha.transparentFraction,
  lumaSd: e.measurements.luma.standardDeviation })), plantRegistration: registration, fragment: join(outputPath('fragment'), 'batch04-lung.json') }, null, 2));
