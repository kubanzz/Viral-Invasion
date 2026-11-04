import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outputPath, makeSeamlessGround, removeWhiteMatte, registerStateGroup, inspectImage, inspectSeams, tiledPreview } from '../fantasy-art-process.mjs';
import { raw, removeReviewedWhiteHoles, rootSupport, save } from './process-first-four.mjs';

const crop = { left: 512, top: 512, width: 1024, height: 1024 };
const toPng = (data, width, height, channels = 4) => sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
const quadrant = input => sharp(input).extract(crop).resize(512, 512).removeAlpha().png().toBuffer();

async function keepLargestBody(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height), labels = new Int32Array(width * height);
  let label = 0, largestLabel = 0, largest = 0, total = 0, components = 0;
  for (let i = 0; i < width * height; i++) {
    if (seen[i] || data[i * 4 + 3] < 8) continue;
    let head = 0, tail = 1; label++; queue[0] = i; seen[i] = 1;
    while (head < tail) { const p = queue[head++], x = p % width, y = Math.floor(p / width); labels[p] = label;
      for (const n of [x ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (n >= 0 && !seen[n] && data[n * 4 + 3] >= 8) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    total += tail; components++; if (tail > largest) { largest = tail; largestLabel = label; }
  }
  const output = Buffer.from(data);
  for (let i = 0; i < width * height; i++) if (labels[i] !== largestLabel) output.fill(0, i * 4, i * 4 + 4);
  return { buffer: await toPng(output, width, height), report: { method: 'retain-connected-single-tree-body',
    inputComponentCount: components, retainedPixels: largest, removedDetachedPaperOrWhiteFragments: total - largest } };
}

async function alignRoot(healthy, infected) {
  const a = await sharp(healthy).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(infected).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error('Tree source canvases differ');
  const width = a.info.width, roi = [790, 1450, 460, 330];
  const score = (dx, dy) => { let countA = 0, countB = 0, both = 0;
    for (let y = roi[1]; y < roi[1] + roi[3]; y += 2) for (let x = roi[0]; x < roi[0] + roi[2]; x += 2) {
      const aa = a.data[(y * width + x) * 4 + 3] >= 192;
      const bb = b.data[((y - dy) * width + x - dx) * 4 + 3] >= 192;
      countA += aa; countB += bb; both += aa && bb;
    }
    return 2 * both / (countA + countB);
  };
  let best = { dx: 0, dy: 0, dice: score(0, 0) }; const before = best.dice;
  for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
    const dice = score(dx, dy);
    if (dice > best.dice + 1e-10 || Math.abs(dice - best.dice) < 1e-10 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy)) best = { dx, dy, dice };
  }
  const source = await sharp(infected).png().toBuffer();
  const shifted = await sharp({ create: { width, height: a.info.height, channels: 4, background: '#00000000' } })
    .composite([{ input: source, left: best.dx, top: best.dy }]).png().toBuffer();
  const ha = await rootSupport(healthy), ib = await rootSupport(shifted);
  const residual = ha.logical1024Point.map((v, i) => ib.logical1024Point[i] - v);
  return { buffer: shifted, report: { groupScale: .5, noIndependentAlphaHeightScaling: true, sourceRoi: roi,
    alphaThreshold: 192, sampleStride: 2, sourceTranslation: [best.dx, best.dy], logicalTranslation: [best.dx / 2, best.dy / 2],
    rootSilhouetteDiceBefore: before, rootSilhouetteDiceAfter: best.dice, healthySupport: ha, alignedInfectedSupport: ib,
    measuredRootToeResidualLogicalPx: residual, measuredRootToeResidualEuclideanLogicalPx: Math.hypot(...residual),
    limitation: 'Measured root silhouette and corresponding lowest toe support, not a promise that every changed fungal bump is identical.' } };
}

async function halfOverlay(a, b) {
  const aa = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bb = await sharp(b).ensureAlpha().raw().toBuffer(); const data = Buffer.alloc(aa.data.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.round((aa.data[i] + bb[i]) / 2);
  return toPng(data, aa.info.width, aa.info.height);
}

const previous = JSON.parse(await readFile(join(outputPath('fragment'), 'first-four-technical.json'), 'utf8'));
const healthyGround = previous.outputs.find(x => x.id === 'heart.ground.healthy');
const healthyTree = previous.outputs.find(x => x.id === 'scenery.pulseTree.healthy');
const hGroundRaw = await raw('heart.ground.healthy'), iGroundRaw = await raw('heart.ground.infected');
const hq = await quadrant(hGroundRaw.input), iq = await quadrant(iGroundRaw.input);
const hs = await sharp(hq).stats(), is = await sharp(iq).stats();
const h = await sharp(hq).raw().toBuffer(), ir = await sharp(iq).raw().toBuffer(), blur = await sharp(iq).blur(6).raw().toBuffer();
const gains = hs.channels.map((c, i) => Math.min(1, is.channels[i].stdev / c.stdev));
const meanH = hs.channels.map(c => c.mean), meanI = is.channels.map(c => c.mean), derived = Buffer.alloc(h.length);
for (let p = 0; p < 512 * 512; p++) {
  const j = p * 3;
  const residual = .2126 * (ir[j] - blur[j]) + .7152 * (ir[j + 1] - blur[j + 1]) + .0722 * (ir[j + 2] - blur[j + 2]);
  const detail = Math.max(-3, Math.min(3, residual * .12));
  for (let c = 0; c < 3; c++) derived[j + c] = Math.round(Math.max(0, Math.min(255, meanI[c] + (h[j + c] - meanH[c]) * gains[c] + detail)));
}
const derivedQuadrant = await toPng(derived, 512, 512, 3);
const infectedGroundResult = await makeSeamlessGround(derivedQuadrant, { contrast: 1, saturation: 1 });
const derivation = { method: 'shared-healthy-base-sampled-infected-material-and-weak-fungal-residual',
  aiPixelsClaimedRegistered: false, sharedBaseRawSha256: hGroundRaw.provenance.rawSha256, materialRawSha256: iGroundRaw.provenance.rawSha256,
  sourceCrop: crop, sharedBaseCoordinateDelta: [0, 0], paletteMeanHealthyRgb: meanH, paletteMeanInfectedRgb: meanI, channelGains: gains,
  formula: 'Imean[c] + (Hpixel[c]-Hmean[c])*min(1,Istd[c]/Hstd[c]) + clamp(.12*(I_luma-Gaussian6(I)_luma),-3,3)',
  fungalResidualStrength: .12, fungalResidualClampRgb: 3, oldGlobalToneUsed: false, colourSource: 'approved infected r02 same-coordinate centre crop',
  reason: 'Independent AI outputs are not asserted pixel-registered. Derive both states from the identical healthy tissue coordinate base; retain only weak infected material detail.' };
const infectedGround = await save(infectedGroundResult, 'heart.ground.infected', { ...iGroundRaw.provenance,
  processing: derivation, technical: infectedGroundResult.report,
  registration: { state: 'algorithmically-shared-base', group: 'heart.ground', sourceScaleEqual: true, sharedBaseCoordinateDelta: [0, 0] },
  visualReview: { state: 'awaiting-final-3x3-and-overlay-review', sourceStateSemanticAccepted: true } });
const hGroundBuffer = await readFile(healthyGround.outputPath);
const groundOverlay = await halfOverlay(hGroundBuffer, infectedGroundResult.buffer);
const groundOverlayPath = join(outputPath('qa'), 'heart.ground.pair.overlay50.png'); await writeFile(groundOverlayPath, groundOverlay);
const groundOverlayRepeatPath = join(outputPath('qa'), 'heart.ground.pair.overlay50.3x3.png'); await writeFile(groundOverlayRepeatPath, await tiledPreview(groundOverlay));

const hTreeRaw = await raw('scenery.pulseTree.healthy'), iTreeRaw = await raw('scenery.pulseTree.infected');
const outerH = await removeWhiteMatte(hTreeRaw.input, { whiteMin: 245, chromaMax: 16, edgeWidth: 2 });
const holeH = await removeReviewedWhiteHoles(outerH.buffer, [[864, 784], [1257, 963], [1321, 1077], [702, 916], [1092, 949], [789, 1109]]);
const outerI = await removeWhiteMatte(iTreeRaw.input, { whiteMin: 220, chromaMax: 16, edgeWidth: 2 });
const holeI = await removeReviewedWhiteHoles(outerI.buffer, [], { allNearWhite: true, whiteMin: 220, minimumWhiteComponentArea: 64 });
const bodyI = await keepLargestBody(holeI.buffer);
const alignment = await alignRoot(holeH.buffer, bodyI.buffer);
const trees = await registerStateGroup([{ id: 'scenery.pulseTree.healthy', input: holeH.buffer }, { id: 'scenery.pulseTree.infected', input: alignment.buffer }],
  { removeWhite: false, sourceAnchor: [.5, .85], scale: .5 });
const hTreeResult = trees.results[0], iTreeResult = trees.results[1];
const pairedHealthyTree = await save(hTreeResult, 'scenery.pulseTree.healthy', { ...hTreeRaw.provenance,
  processing: healthyTree.processing, registration: { state: 'root-structure-measured-pair', transform: trees.transform,
    sourceTranslation: [0, 0], pair: alignment.report, claimedAnchorMatchesLowestToe: false },
  visualReview: { state: 'healthy-passed-before-pair-awaiting-overlay-review', colourTreatment: 'No colour grade; preserved healthy source palette' } });
const infectedTree = await save(iTreeResult, 'scenery.pulseTree.infected', { ...iTreeRaw.provenance,
  processing: { outer: outerI.report.processing, negativeSpace: holeI.report, detachedNoise: bodyI.report },
  registration: { state: 'root-structure-measured-pair', transform: trees.transform, sourceTranslation: alignment.report.sourceTranslation,
    pair: alignment.report, perStateAlphaHeightNormalization: false, claimedAnchorMatchesLowestToe: false },
  visualReview: { state: 'awaiting-black-white-alpha-and-root-overlay-review', sourceStateSemanticAccepted: true,
    negativeSpaceRule: 'Original grey-purple body has no near-white pigment; near-white internal regions are confirmed sky gaps, not leaf highlights' } });
const treeOverlay = await halfOverlay(hTreeResult.buffer, iTreeResult.buffer);
const treeOverlayPath = join(outputPath('qa'), 'scenery.pulseTree.pair.overlay50.png'); await writeFile(treeOverlayPath, treeOverlay);
const treeRootOverlayPath = join(outputPath('qa'), 'scenery.pulseTree.pair.root-overlay50.png');
await writeFile(treeRootOverlayPath, await sharp(treeOverlay).extract({ left: 390, top: 720, width: 240, height: 175 }).resize(960, 700).flatten({ background: '#202020' }).png().toBuffer());

healthyGround.registration = { state: 'algorithmically-shared-base', group: 'heart.ground', sourceScaleEqual: true, sharedBaseCoordinateDelta: [0, 0] };
healthyGround.pairQa = infectedGround.pairQa = { overlay50: groundOverlayPath, overlay50Repeat3x3: groundOverlayRepeatPath,
  healthyRepeat3x3: healthyGround.qa['3x3'].path, infectedRepeat3x3: infectedGround.qa['3x3'].path };
pairedHealthyTree.pairQa = infectedTree.pairQa = { overlay50: treeOverlayPath, rootOverlay50: treeRootOverlayPath };
const outputs = [healthyGround, infectedGround, pairedHealthyTree, infectedTree];
const plan = JSON.parse(await readFile(join(outputPath(''), 'asset-plan.json'), 'utf8'));
const entries = outputs.map(output => {
  const original = plan.assets.find(x => x.id === output.id);
  return { ...original, status: 'processed-awaiting-root-visual-acceptance', productionPath: output.outputPath, outputPath: output.outputPath,
    dimensions: [output.image.width, output.image.height], runId: output.runId, sha256: output.outputSha256,
    source: { type: output.id === 'heart.ground.infected' ? 'maliang-approved-material-derived-on-shared-healthy-base' : 'maliang-generation-processed',
      rawPath: output.rawPath, runId: output.runId, rawSha256: output.rawSha256, nodeId: output.nodeId },
    registration: { ...original.registration, ...output.registration }, processing: output.processing ?? output.technical?.processing,
    measurements: output.image, tileability: output.id.startsWith('heart.ground.') ? { required: true, status: 'numeric-passed-awaiting-visual-acceptance',
      seams: output.technical?.seams ?? { horizontal: { rms: 0, maxDifference: 0 }, vertical: { rms: 0, maxDifference: 0 } } } : undefined,
    qa: { ...output.qa, pair: output.pairQa }, visualReview: output.visualReview,
    fallback: output.id === 'heart.ground.infected' ? derivation : null };
});
await writeFile(join(outputPath('fragment'), 'first-four-technical.json'), JSON.stringify({ schemaVersion: 1, scope: 'first-four-complete', outputs,
  groundDerivation: derivation, treeRegistration: alignment.report, weakInfectedR01Accepted: false, deliveryModified: false }, null, 2) + '\n');
await writeFile(join(outputPath('fragment'), 'first-four.fragment.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n');
console.log(JSON.stringify({ outputs: entries.map(x => ({ id: x.id, outputPath: x.outputPath, sha256: x.sha256, bbox: x.measurements.bbox,
  alpha: x.measurements.alpha })), rootRegistration: alignment.report, groundDerivation: derivation,
  overlaySeams: await inspectSeams(groundOverlay), fragment: join(outputPath('fragment'), 'first-four.fragment.json') }, null, 2));
