import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspectImage, makeSeamlessGround, removeWhiteMatte, registerStateGroup, validateOverlayAlpha, outputPath } from './fantasy-art-process.mjs';

async function syntheticState({ inset = 18, body = [180, 62, 68], whiteInset = true } = {}) {
  const width = 96, data = Buffer.alloc(width * width * 4, 255);
  for (let y = inset; y < 80; y++) for (let x = inset; x < 96 - inset; x++) {
    const at = (y * width + x) * 4;
    const alpha = x === inset || x === 95 - inset || y === inset || y === 79 ? .25 : 1;
    for (let c = 0; c < 3; c++) data[at + c] = Math.round(body[c] * alpha + 255 * (1 - alpha));
  }
  if (whiteInset) for (let y = 36; y < 50; y++) for (let x = 40; x < 56; x++) data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
  return sharp(data, { raw: { width, height: width, channels: 4 } }).png().toBuffer();
}

export async function runSelfTests() {
  const tests = [];
  const source = await syntheticState(), cutout = await removeWhiteMatte(source);
  assert(cutout.report.image.alpha.transparent > 1000);
  assert(cutout.report.image.alpha.partial > 0, 'Antialiased matte edges need genuine partial alpha');
  assert(cutout.report.processing.cleanedEdgePixels > 0);
  const raw = await sharp(cutout.buffer).raw().toBuffer();
  assert.equal(raw[(42 * 96 + 45) * 4 + 3], 255, 'Enclosed white area must stay opaque');
  assert.equal(raw[3], 0, 'Border must be really transparent, not white/checkerboard RGB');
  const edge = (18 * 96 + 30) * 4;
  assert(raw[edge] < 210 && raw[edge + 1] < 110, 'Recovered edge RGB must not retain a white matte');
  tests.push('connected-white-removal-preserves-enclosed-white-and-recovers-edge-alpha');

  const ground = await makeSeamlessGround(source);
  assert(ground.report.seams.exactlyPeriodic);
  assert.equal(ground.report.image.width, 1024); assert.equal(ground.report.image.height, 1024);
  assert(ground.report.image.luma.standardDeviation < (await inspectImage(source)).luma.standardDeviation);
  const preview = await sharp(ground.previews['3x3']).metadata();
  assert.equal(preview.width, 1536); assert.equal(preview.height, 1536);
  tests.push('1024-mirror-ground-has-exact-periodic-edges-and-3x3-preview');

  const second = await syntheticState({ inset: 27, body: [50, 120, 95] });
  const group = await registerStateGroup([{ id: 'closed', input: source }, { id: 'open', input: second }]);
  assert.deepEqual(group.results[0].report.transform, group.results[1].report.transform);
  assert.equal(group.transform.alphaBoundsUsedForScaling, false);
  assert.deepEqual(group.transform.targetAnchor, [.5, .85]);
  assert.equal(group.results[0].report.image.width, 1024);
  assert.notDeepEqual(group.results[0].report.image.bbox, group.results[1].report.image.bbox, 'Distinct poses must not be independently normalized');
  for (const result of group.results) {
    assert(result.report.image.alpha.transparent > 0);
    assert.deepEqual(Object.keys(result.previews).sort(), ['alpha', 'black', 'black-white', 'white']);
  }
  tests.push('state-pair-shares-full-canvas-transform-without-alpha-normalization');

  const different = await sharp(source).resize(100, 100).png().toBuffer();
  await assert.rejects(registerStateGroup([{ id: 'a', input: source }, { id: 'b', input: different }]), /source canvases differ/);
  assert.throws(() => outputPath('../references/forbidden'), /production directory/);
  tests.push('mismatched-state-canvases-and-output-path-escape-are-rejected');

  await validateOverlayAlpha(group.results[0].buffer, { allowedRegion: [0, 0, 1024, 1024] });
  await assert.rejects(validateOverlayAlpha(group.results[0].buffer, { allowedRegion: [0, 0, 10, 10] }), /violates registered regions/);
  await assert.rejects(validateOverlayAlpha(source), /actual transparent/);
  tests.push('overlay-validates-real-alpha-and-registered-allowed-regions');

  const alreadyAlpha = await removeWhiteMatte(cutout.buffer);
  const twice = await inspectImage(alreadyAlpha.buffer);
  assert.equal(twice.alpha.partial, cutout.report.image.alpha.partial, 'Existing alpha must not be unmatted again');
  tests.push('existing-semitransparent-colours-are-not-unmatted-twice');
  const checkerData = Buffer.alloc(96 * 96 * 4, 255);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 200 : 255;
    for (let c = 0; c < 3; c++) checkerData[(y * 96 + x) * 4 + c] = value;
  }
  const checker = await sharp(checkerData, { raw: { width: 96, height: 96, channels: 4 } }).png().toBuffer();
  await assert.rejects(removeWhiteMatte(checker), /opaque baked checkerboard/);
  tests.push('opaque-baked-checkerboard-is-rejected-as-fake-alpha');
  return { status: 'passed', tests, measurements: { groundSeams: ground.report.seams,
    groundLuma: ground.report.image.luma, cutoutAlpha: cutout.report.image.alpha,
    recoveredEdgeRgba: [...raw.subarray(edge, edge + 4)], groupTransform: group.transform },
    generatedAiContent: false, filesystemOutputs: false };
}
