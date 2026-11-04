// Synthetic RGBA and in-memory PNG only. Does not read production art or write any files.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  prepareParts, loadRgba, transformPoint, bakeLayeredFrame, warpRgbaLocal,
  makeSquashField, sampleTimeline, analyzeFrame, renderClip,
} from './actor-animation-baker.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function image(width, height, fill = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 4; c++) data[i + c] = fill[c];
  return { width, height, data };
}
function pixel(im, x, y, rgba) {
  const i = (y * im.width + x) * 4;
  if (rgba) rgba.forEach((n, c) => { im.data[i + c] = n; });
  return [...im.data.subarray(i, i + 4)];
}
const close = (actual, expected, tolerance = 1e-7) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) <= tolerance, `${actual} != ${expected}`));
};
const sourceRect = { left: 2, top: 3, width: 2, height: 1 };

test('Sharp PNG decode stays in memory and canonicalizes transparent RGB', async () => {
  const src = image(2, 1); pixel(src, 0, 0, [255, 50, 60, 0]); pixel(src, 1, 0, [10, 20, 30, 255]);
  const png = await sharp(src.data, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const decoded = await loadRgba(png);
  assert.deepEqual(pixel(decoded, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(decoded, 1, 0), [10, 20, 30, 255]);
});

test('Nonzero sourceRect preserves full-source joint coordinates and 90 degree rotation', async () => {
  const src = image(8, 8); pixel(src, 2, 3, [255, 0, 0, 255]); pixel(src, 3, 3, [0, 255, 0, 255]);
  const parts = await prepareParts([{ id: 'test', image: src, sourceRect, sourceJoint: [2.5, 3.5], targetJoint: 'origin' }]);
  const frame = bakeLayeredFrame(parts, { origin: [100.5, 200.5] }, { parts: { test: { rotationDeg: 90 } } });
  close(frame.landmarks['test.joint'], [100.5, 200.5]);
  assert.deepEqual(pixel(frame, 100, 200), [255, 0, 0, 255]);
  assert.deepEqual(pixel(frame, 100, 201), [0, 255, 0, 255]);
  const scaled = bakeLayeredFrame(parts, { origin: [100.5, 200.5] }, { parts: { test: { rotationDeg: 90, scale: [2, 3] } } });
  close(transformPoint(scaled.transforms.test, [3.5, 3.5]), [100.5, 202.5]);
  close(scaled.landmarks['test.joint'], [100.5, 200.5]);
});

test('Hierarchy inherits parent affine and attachment position; cycles are rejected', async () => {
  const parts = await prepareParts([
    { id: 'parent', image: image(1, 1, [255, 0, 0, 255]), sourceJoint: [0.5, 0.5], targetJoint: [128.5, 128.5], rotationDeg: 90 },
    { id: 'child', image: image(1, 1, [0, 255, 0, 255]), sourceJoint: [0.5, 0.5], parent: 'parent', attachJoint: [1.5, 0.5], z: 1 },
  ]);
  const frame = bakeLayeredFrame(parts);
  close(frame.landmarks['child.joint'], [128.5, 129.5]);
  assert.deepEqual(pixel(frame, 128, 129), [0, 255, 0, 255]);
  const bad = parts.map((p) => ({ ...p, parent: p.id === 'parent' ? 'child' : 'parent', attachJoint: [0.5, 0.5] }));
  assert.throws(() => bakeLayeredFrame(bad), /Cyclic/);
});

test('Masks multiply alpha; source-over respects z and partial transparency', async () => {
  const masked = await prepareParts([{ id: 'masked', image: image(1, 1, [255, 0, 0, 128]), mask: image(1, 1, [0, 0, 0, 128]),
    sourceJoint: [0.5, 0.5], targetJoint: [10.5, 10.5] }]);
  assert.equal(pixel(bakeLayeredFrame(masked), 10, 10)[3], 64);
  const parts = await prepareParts([
    { id: 'top', image: image(1, 1, [255, 0, 0, 128]), sourceJoint: [0.5, 0.5], targetJoint: [10.5, 10.5], z: 1 },
    { id: 'bottom', image: image(1, 1, [0, 0, 255, 128]), sourceJoint: [0.5, 0.5], targetJoint: [10.5, 10.5], z: 0 },
  ]);
  close(pixel(bakeLayeredFrame(parts), 10, 10), [170, 0, 85, 192], 1);
});

test('Premultiplied bilinear sampling has no hidden RGB halo; out-of-bounds is transparent', () => {
  const src = image(2, 1); pixel(src, 0, 0, [0, 255, 0, 0]); pixel(src, 1, 0, [255, 0, 0, 255]);
  const field = { rect: { left: 0, top: 0, width: 2, height: 1 }, displacement: [0.5, 0] };
  const warped = warpRgbaLocal(src, [field], { jacobianStep: 1 });
  close(pixel(warped, 0, 0), [255, 0, 0, 128], 1);
  close(pixel(warped, 1, 0), [255, 0, 0, 128], 1);
  const outside = warpRgbaLocal(src, [{ ...field, displacement: [10, 0] }]);
  assert.ok(outside.data.every((n) => n === 0));
});

test('Zero deformation preserves canonical pixels, and pinned foot ROI stays byte-identical', () => {
  const src = image(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pixel(src, x, y, [x * 12, y * 12, 40, 255]);
  assert.deepEqual(warpRgbaLocal(src, []).data, src.data);
  const fields = [{ rect: { left: 0, top: 0, width: 16, height: 16 }, displacement: [2, 1] }];
  const out = warpRgbaLocal(src, fields, { pinnedRects: [{ left: 0, top: 12, width: 16, height: 4 }], pinFeather: 2 });
  assert.notDeepEqual(pixel(out, 4, 4), pixel(src, 4, 4));
  for (let y = 12; y < 16; y++) for (let x = 0; x < 16; x++) assert.deepEqual(pixel(out, x, y), pixel(src, x, y));
});

test('Inverse compression fields and sampled Jacobian detect fold risks', () => {
  const src = image(16, 16, [255, 100, 30, 255]);
  const squash = makeSquashField({ rect: { left: 0, top: 0, width: 16, height: 16 }, anchor: [8, 16], scale: [1.1, 0.8] });
  close(squash.vectors[0], [8 - 8 / 1.1, -4]);
  const folded = { rect: { left: 0, top: 0, width: 16, height: 16 }, columns: 2, rows: 2,
    vectors: [[16, 0], [-16, 0], [16, 0], [-16, 0]] };
  const qa = warpRgbaLocal(src, [folded], { jacobianStep: 1 }).warpQA;
  assert.ok(qa.foldedSamples > 0); assert.ok(qa.minJacobian < 0);
  assert.throws(() => warpRgbaLocal(src, [{ ...folded, vectors: [[NaN, 0]] }]), /Invalid reverse-displacement grid/);
});

test('Timeline interpolation supports alternating limbs, holds, and rejects unsafe paths', () => {
  const clip = { tracks: [
    { path: 'parts.left.rotationDeg', keys: [{ t: 0, value: -10 }, { t: 1, value: 10 }] },
    { path: 'parts.right.rotationDeg', keys: [{ t: 0, value: 10 }, { t: 1, value: -10 }] },
    { path: 'contacts.left.foot', interpolation: 'step', keys: [{ t: 0, value: 0 }, { t: 0.5, value: 1 }] },
  ] };
  assert.equal(sampleTimeline(clip, 0.25).parts.left.rotationDeg, -5);
  assert.equal(sampleTimeline(clip, 0.25).parts.right.rotationDeg, 5);
  assert.equal(sampleTimeline(clip, 0.5).contacts.left.foot, 1);
  assert.throws(() => sampleTimeline({ tracks: [{ path: '__proto__.x', keys: [{ t: 0, value: 1 }] }] }, 0), /Unsafe/);
  assert.throws(() => sampleTimeline({ tracks: [{ path: 'x', keys: [{ t: 1, value: 0 }, { t: 0, value: 1 }] }] }, 0), /strictly/);
});

let rig;
async function sampleRig() {
  rig ??= await prepareParts([
    { id: 'torso', image: image(4, 4, [100, 180, 60, 255]), sourceJoint: [2, 2], targetJoint: [250, 250], landmarks: { foot: [2, 4] } },
    { id: 'left', image: image(2, 8, [230, 100, 40, 255]), sourceJoint: [1, 1], parent: 'torso', attachJoint: [1, 4], z: -1 },
    { id: 'right', image: image(2, 8, [40, 100, 230, 255]), sourceJoint: [1, 1], parent: 'torso', attachJoint: [3, 4], z: -1 },
  ]);
  return rig;
}
const loopClip = {
  kind: 'rig-baked-sequence', frameCount: 8, durationMs: 800, loop: true,
  tracks: ['left', 'right'].map((id, i) => ({ path: `parts.${id}.rotationDeg`, interpolation: 'smoothstep', keys: [
    { t: 0, value: 0 }, { t: 0.25, value: i ? -20 : 20 }, { t: 0.5, value: 0 },
    { t: 0.75, value: i ? 20 : -20 }, { t: 1, value: 0 },
  ] })),
};

test('Rig clip produces actual relative limb motion, fixed 512 frames and virtual-end loop QA', async () => {
  const result = renderClip(await sampleRig(), {}, loopClip, { footTargets: [{ landmark: 'torso.foot', target: [250, 252] }] });
  assert.equal(result.report.passes, true, JSON.stringify(result.report.errors));
  assert.equal(result.report.localGeometryChanged, true); assert.ok(result.report.uniqueFrames > 1);
  assert.equal(result.report.frameSize, 512); assert.equal(result.report.maxFootDrift, 0);
  assert.equal(result.report.loop.endpointPixelDistance, 0);
  assert.equal(result.frames.length, 8); // t=1 is QA-only, never a duplicated ninth frame.
  assert.ok(result.report.loop.lastToFirstPixelDistance > 0);
});

test('Repeated static, shared whole-body motion, and opacity-only changes cannot pass as rig sequences', async () => {
  const parts = await sampleRig();
  const flat = { kind: 'rig-baked-sequence', frameCount: 2, durationMs: 100 };
  assert.ok(renderClip(parts, {}, flat).report.errors.includes('no-local-geometric-animation'));
  const bounce = { ...flat, tracks: [{ path: 'parts.torso.translate', keys: [{ t: 0, value: [0, 0] }, { t: 1, value: [0, 2] }] }] };
  const bounced = renderClip(parts, {}, bounce);
  assert.equal(bounced.report.uniqueFrames, 2); assert.equal(bounced.report.localGeometryChanged, false);
  assert.ok(bounced.report.errors.includes('no-local-geometric-animation'));
  const faded = renderClip(parts, {}, { ...flat, tracks: [{ path: 'parts.left.opacity', keys: [{ t: 0, value: 1 }, { t: 1, value: 0.5 }] }] });
  assert.equal(faded.report.uniqueFrames, 2); assert.equal(faded.report.localGeometryChanged, false);
  assert.ok(faded.report.errors.includes('no-local-geometric-animation'));
  const hidden = await prepareParts([
    { id: 'body', image: image(6, 6, [200, 100, 50, 255]), sourceJoint: [3, 3], targetJoint: [100, 100] },
    { id: 'hidden', image: image(2, 2, [100, 50, 200, 255]), sourceJoint: [1, 1], targetJoint: [100, 100], opacity: 0 },
  ]);
  const hiddenMotion = renderClip(hidden, {}, { ...flat, tracks: [
    { path: 'parts.body.opacity', keys: [{ t: 0, value: 1 }, { t: 1, value: 0.5 }] },
    { path: 'parts.hidden.rotationDeg', keys: [{ t: 0, value: 0 }, { t: 1, value: 20 }] },
  ] });
  assert.equal(hiddenMotion.report.uniqueFrames, 2); assert.equal(hiddenMotion.report.localGeometryChanged, false);
  assert.throws(() => renderClip(parts, {}, { ...flat, kind: 'static' }), /one frame/);
});

test('Feet use explicit landmarks/contact phases, never bbox bottom; loop seams are reported', async () => {
  const parts = await sampleRig();
  const base = bakeLayeredFrame(parts);
  const off = analyzeFrame(base, { footTargets: [{ landmark: 'torso.foot', target: [250, 251] }] });
  assert.equal(off.feet[0].drift, 1);
  const lifted = bakeLayeredFrame(parts, {}, { contacts: { 'torso.foot': 0 } });
  assert.equal(analyzeFrame(lifted, { footTargets: [{ landmark: 'torso.foot', target: [250, 251] }] }).feet[0].drift, null);
  const nestedContact = sampleTimeline({ tracks: [{ path: 'contacts.torso.foot', keys: [{ t: 0, value: 0 }] }] }, 0);
  const liftedByTrack = bakeLayeredFrame(parts, {}, nestedContact);
  assert.equal(analyzeFrame(liftedByTrack, { footTargets: [{ landmark: 'torso.foot', target: [250, 251] }] }).feet[0].drift, null);
  const invalid = renderClip(parts, {}, { ...loopClip, tracks: [{ path: 'parts.left.rotationDeg', keys: [{ t: 0, value: 0 }, { t: 1, value: 30 }] }] });
  assert.ok(invalid.report.errors.includes('loop-position-seam'));
  const velocity = renderClip(parts, {}, { ...loopClip, tracks: [{ path: 'parts.left.rotationDeg', keys: [
    { t: 0, value: 0 }, { t: 0.5, value: 20 }, { t: 1, value: 0 },
  ] }] });
  assert.ok(velocity.report.errors.includes('loop-velocity-seam'));
});

test('Small visible local fields are detected; uniform or off-actor fields do not count as local motion', async () => {
  const parts = await prepareParts([{ id: 'body', image: image(16, 16, [230, 100, 50, 255]),
    sourceJoint: [0, 0], targetJoint: [96, 96] }]);
  const smallField = { rect: { left: 96, top: 96, width: 16, height: 16 }, displacement: [0.5, 0], feather: 4, strength: 0 };
  const clip = { kind: 'rig-baked-sequence', frameCount: 2, durationMs: 100, basePose: { fields: [smallField] },
    tracks: [{ path: 'fields.0.strength', keys: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }] };
  const small = renderClip(parts, {}, clip);
  assert.equal(small.report.uniqueFrames, 2); assert.equal(small.report.localGeometryChanged, true);
  assert.equal(small.report.passes, true);
  const uniform = renderClip(parts, {}, { ...clip, basePose: { fields: [{ ...smallField, rect: { left: 0, top: 0, width: 512, height: 512 }, feather: 0 }] } });
  assert.equal(uniform.report.uniqueFrames, 2); assert.equal(uniform.report.localGeometryChanged, false);
  const offActor = renderClip(parts, {}, { ...clip, basePose: { fields: [{ ...smallField, rect: { left: 20, top: 20, width: 16, height: 16 } }] },
    tracks: [...clip.tracks, { path: 'parts.body.opacity', keys: [{ t: 0, value: 1 }, { t: 1, value: 0.5 }] }] });
  assert.equal(offActor.report.uniqueFrames, 2); assert.equal(offActor.report.localGeometryChanged, false);
});

test('Damped Newton landmark inversion handles valid half-width compression', async () => {
  const parts = await prepareParts([{ id: 'body', image: image(16, 16, [230, 100, 50, 255]), sourceJoint: [0, 0], targetJoint: [250, 250] }]);
  const field = makeSquashField({ rect: { left: 0, top: 0, width: 512, height: 512 }, anchor: [256, 256], scale: [0.5, 1] });
  const out = bakeLayeredFrame(parts, {}, { fields: [field] });
  close(out.landmarks['body.joint'], [253, 250], 1e-5);
  assert.equal(out.warpQA.foldedSamples, 0);
});

test('Canvas contract keeps mother 1024 and rejects custom frame dimensions or singular scales', async () => {
  const parts = await sampleRig();
  const frame = bakeLayeredFrame(parts, {}, {}, { actorType: 'mother' });
  assert.equal(frame.width, 1024); assert.equal(frame.height, 1024);
  assert.throws(() => bakeLayeredFrame(parts, {}, {}, { width: 256 }), /Fixed canvas/);
  assert.throws(() => bakeLayeredFrame(parts, {}, { parts: { torso: { scale: [0, 1] } } }), /positive/);
});

let passed = 0;
for (const { name, fn } of tests) {
  try { await fn(); passed++; process.stdout.write(`ok ${passed} - ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL - ${name}\n${error.stack}\n`); process.exitCode = 1; break; }
}
if (!process.exitCode) process.stdout.write(JSON.stringify({ passed, total: tests.length, imageFilesWritten: 0, mode: 'synthetic-memory-only' }) + '\n');
