/** Approved basic/immune masters only. Pixel-derived local animation; no AI requests. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { loadRgba, warpRgbaLocal, makeSquashField, analyzeFrame } from './actor-animation-baker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ACTORS = dirname(ROOT), SIZE = 512, FOOT = [256, 435.2];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const q = (n) => Math.round(n * 1e10) / 1e10;
const R = (left, top, width, height) => ({ left, top, width, height });
const BASIC_PIN = R(220, 430, 72, 9);
const NEAR_PIN = R(163, 430, 35, 9), FAR_PIN = R(319, 414, 30, 9);
const NEAR_CONTACT = [177, 435.2], FAR_CONTACT = [335, 418.5];
const png = (frame) => sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
async function write(name, buffer) {
  const dest = resolve(ROOT, name), rel = relative(ROOT, dest);
  if (rel.startsWith('..') || !rel) throw new Error('Output must be inside new Actors_v2/production');
  await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, buffer);
  return { path: relative(ACTORS, dest).replaceAll('\\', '/'), sha256: sha(buffer), bytes: buffer.length };
}
const json = (name, value) => write(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
function pushField(fields, rect, displacement, feather = 20) {
  fields.push({ rect, displacement: displacement.map(q), feather });
}
function rotationField(rect, anchor, angleDeg, feather = 8) {
  const angle = -angleDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), vectors = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const dx = rect.left + x * rect.width / 2 - anchor[0], dy = rect.top + y * rect.height / 2 - anchor[1];
    vectors.push([q(c * dx - s * dy - dx), q(s * dx + c * dy - dy)]);
  }
  return { rect, columns: 3, rows: 3, vectors, feather };
}
function contactDiff(before, after, rect) {
  let changedPixels = 0, maxChannelDifference = 0;
  for (let y = rect.top; y < rect.top + rect.height; y++) for (let x = rect.left; x < rect.left + rect.width; x++) {
    const p = (y * SIZE + x) * 4; let changed = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(before.data[p + c] - after.data[p + c]);
      maxChannelDifference = Math.max(maxChannelDifference, d); changed ||= d !== 0;
    }
    if (changed) changedPixels++;
  }
  return { rect, changedPixels, maxChannelDifference, exactPixelPin: changedPixels === 0 };
}
function regionHash(image, r) {
  const b = Buffer.alloc(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) image.data.copy(b, y * r.width * 4, ((r.top + y) * SIZE + r.left) * 4, ((r.top + y) * SIZE + r.left + r.width) * 4);
  return sha(b);
}
async function source(id, filename) {
  const full = resolve(ACTORS, filename), buffer = await readFile(full), image = await loadRgba(buffer);
  if (image.width !== 512 || image.height !== 512) throw new Error('Source must be registered full-canvas 512 RGBA');
  const runs = JSON.parse(await readFile(join(ROOT, 'runs.json'), 'utf8'));
  const run = runs.runs[id];
  if (!run || run.status !== 'succeeded') throw new Error('Missing completed source provenance');
  return { id, filename, image, provenance: {
    path: filename, sha256: sha(buffer), sourceRunId: run.runId,
    sourceNodeId: run.images[0].nodeId, sourceRawSha256: run.images[0].sha256,
    originalModel: run.images[0].model, sourceCanvas: [512, 512], foot: FOOT,
  } };
}

function basicFields(phase, mode = 'walk') {
  const a = phase * Math.PI * 2, c = q(Math.cos(a)), s = q(Math.sin(a));
  const fields = [];
  if (mode === 'walk') {
    fields.push(makeSquashField({ rect: R(99, 163, 314, 278), anchor: FOOT,
      scale: [q(1 + .034 * c), q(1 - .029 * c)], feather: 20 }));
    pushField(fields, R(219, 222, 181, 188), [-2.7 * s, -.6 * c], 36);
    pushField(fields, R(172, 165, 68, 83), [1.8 * s, -1.3 * c], 13);
    pushField(fields, R(266, 160, 68, 85), [-1.5 * s, 1.4 * c], 13);
    pushField(fields, R(340, 235, 72, 131), [-1.6 * c, 1.1 * s], 17);
    pushField(fields, R(102, 286, 91, 130), [1.6 * c, -1.4 * s], 18);
  } else if (mode.startsWith('windup')) {
    const tense = mode === 'windup1';
    fields.push(makeSquashField({ rect: R(99, 163, 314, 278), anchor: FOOT,
      scale: tense ? [1.018, 1.033] : [1.045, .955], feather: 20 }));
    pushField(fields, R(156, 183, 250, 225), [tense ? -4 : 4, tense ? 1 : -1.5], 40);
    pushField(fields, R(273, 163, 60, 78), [tense ? -2 : 1, tense ? -3 : 2], 14);
  } else if (mode === 'hurt') {
    fields.push(makeSquashField({ rect: R(99, 163, 314, 278), anchor: FOOT, scale: [1.035, .965], feather: 20 }));
    pushField(fields, R(134, 180, 275, 230), [4.5, -1.5], 42);
    fields.push(makeSquashField({ rect: R(225, 275, 147, 76), anchor: [303, 318], scale: [1, .89], feather: 17 }));
  } else if (mode === 'dissolve') {
    fields.push(makeSquashField({ rect: R(99, 163, 314, 278), anchor: FOOT, scale: [.98, .965], feather: 28 }));
  }
  return fields;
}
function dissolveKeypose(frame) {
  const data = Buffer.from(frame.data);
  const holes = [[198, 275, 12, 18], [222, 350, 11, 15], [281, 398, 14, 10], [352, 275, 9, 14], [331, 395, 9, 12], [165, 361, 10, 14]];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const p = (y * SIZE + x) * 4; if (!data[p + 3]) continue;
    let keep = .56;
    for (const [cx, cy, rx, ry] of holes) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      keep *= Math.max(0, Math.min(1, (d - .7) / .3));
    }
    data[p + 3] = Math.round(data[p + 3] * keep);
    if (!data[p + 3]) data.fill(0, p, p + 3);
  }
  return { ...frame, data };
}
function renderBasic(src, phase, mode = 'walk') {
  const fields = basicFields(phase, mode);
  let frame = warpRgbaLocal(src, fields, { pinnedRects: [BASIC_PIN], pinFeather: 9, jacobianStep: 4 });
  const pin = contactDiff(src, frame, BASIC_PIN);
  frame.landmarks = { contact: FOOT }; frame.contacts = { contact: mode !== 'dissolve' ? 1 : 0 };
  if (mode === 'dissolve') frame = dissolveKeypose(frame);
  return { frame, fields, pins: [pin], stage: mode };
}

const REPAIR = R(329, 300, 28, 16), EYE_BROW = [R(273, 241, 52, 64), R(360, 232, 34, 65)];
function repairMouth(src) {
  const data = Buffer.from(src.data), mask = new Uint8Array(SIZE * SIZE), seed = [];
  for (let y = REPAIR.top; y < REPAIR.top + REPAIR.height; y++) for (let x = REPAIR.left; x < REPAIR.left + REPAIR.width; x++) {
    const p = (y * SIZE + x) * 4;
    if (data[p + 1] < 192 && data[p] - data[p + 1] > 23) seed.push([x, y]);
  }
  for (const [x, y] of seed) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy;
    if (dx * dx + dy * dy <= 5 && xx >= REPAIR.left && xx < REPAIR.left + REPAIR.width && yy >= REPAIR.top && yy < REPAIR.top + REPAIR.height) mask[yy * SIZE + xx] = 1;
  }
  // Harmonic fill uses only this tiny source-mouth mask and fixed surrounding cream pixels.
  for (let pass = 0; pass < 120; pass++) for (let y = REPAIR.top; y < REPAIR.top + REPAIR.height; y++) for (let x = REPAIR.left; x < REPAIR.left + REPAIR.width; x++) {
    const i = y * SIZE + x; if (!mask[i]) continue;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((data[(i - 1) * 4 + c] + data[(i + 1) * 4 + c] + data[(i - SIZE) * 4 + c] + data[(i + SIZE) * 4 + c]) / 4);
  }
  return { image: { ...src, data }, repairedPixels: mask.reduce((a, b) => a + b, 0) };
}
export async function mouthSource(src, amount) {
  if (!amount) return { image: src, mouth: { state: 'original-closed', width: 0, height: 0 }, eyeBrowPreservedBeforeWarp: true };
  const repaired = repairMouth(src), w = amount < .5 ? 18 : 29, h = amount < .5 ? 8 : 20;
  const cx = 342.5, cy = 307.5;
  const p = `M${cx - w / 2},${cy} C${cx - w * .15},${cy - 2.3} ${cx + w * .2},${cy - 4} ${cx + w / 2},${cy - 4} C${cx + w * .49},${cy + h * .45} ${cx + w * .2},${cy + h} ${cx - w * .1},${cy + h} C${cx - w * .37},${cy + h * .9} ${cx - w * .53},${cy + h * .35} ${cx - w / 2},${cy} Z`;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="oral" x2="0" y2="1"><stop stop-color="#663d33"/><stop offset="1" stop-color="#8b5143"/></linearGradient><clipPath id="mouth"><path d="${p}"/></clipPath></defs><path d="${p}" fill="url(#oral)" stroke="#986148" stroke-width="1.35" stroke-linejoin="round"/><path d="M${cx-w*.4},${cy+h*.87} Q${cx},${cy+h*.46} ${cx+w*.38},${cy+h*.83} L${cx+w*.35},${cy+h*1.1} L${cx-w*.3},${cy+h*1.1}Z" fill="#b57360" opacity=".6" clip-path="url(#mouth)"/></svg>`);
  const data = await sharp(repaired.image.data, { raw: { width: SIZE, height: SIZE, channels: 4 } }).composite([{ input: svg }]).raw().toBuffer();
  // libvips composite may round premultiplied edge colours globally. Preserve every byte outside
  // the authored face patch, including the partially transparent leaf-foot contour.
  const authoredROI = R(326, 298, 36, 34);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (x >= authoredROI.left && x < authoredROI.left + authoredROI.width &&
        y >= authoredROI.top && y < authoredROI.top + authoredROI.height) continue;
    const p = (y * SIZE + x) * 4;
    src.data.copy(data, p, p, p + 4);
  }
  const image = { ...src, data };
  const unchanged = EYE_BROW.every((r) => regionHash(src, r) === regionHash(image, r));
  if (!unchanged) throw new Error('Authored mouth changed original eyes/brows');
  return { image, mouth: { state: amount < .5 ? 'small-open' : 'bite-open', width: w, height: h,
    repairROI: REPAIR, authoredROI, outsideAuthoredROIPreservedExactly: true, repairedPixels: repaired.repairedPixels, noAddedTeeth: true, paintedBeforeFaceWarp: true }, eyeBrowPreservedBeforeWarp: unchanged };
}
function immuneFields(phase, mode, biteStage = 0) {
  const a = phase * Math.PI * 2, c = q(Math.cos(a)), s = q(Math.sin(a)), fields = [];
  let pins, contacts;
  if (mode === 'crawl') {
    fields.push(makeSquashField({ rect: R(108, 135, 324, 279), anchor: [267, 402],
      scale: [q(1 + .011 * Math.cos(2 * a)), q(1 - .013 * Math.cos(2 * a))], feather: 27 }));
    pushField(fields, R(216, 205, 216, 185), [-2.4 * s, -.5 * c], 39);
    fields.push(rotationField(R(145, 367, 98, 85), [199, 394], 3 * (1 - c), 18));
    fields.push(rotationField(R(278, 366, 103, 78), [312, 393], -3 * (1 + c), 18));
    fields.push(rotationField(R(55, 138, 214, 187), [228, 161], 1.8 * s, 25));
    pushField(fields, R(186, 86, 169, 100), [-1.0 * s, .7 * c], 23);
    const near = phase < .5 || phase >= 1;
    pins = near ? [NEAR_PIN] : [FAR_PIN]; contacts = { near: near ? 1 : 0, far: near ? 0 : 1 };
  } else {
    const dx = [-2.2, 1.8, 10, 0][biteStage], compression = [.985, .977, 1.018, 1][biteStage];
    fields.push(makeSquashField({ rect: R(108, 135, 324, 279), anchor: [267, 402], scale: [1, compression], feather: 27 }));
    pushField(fields, R(103, 122, 340, 291), [-dx, biteStage === 2 ? 1.5 : 0], 49);
    pushField(fields, R(230, 218, 201, 167), [biteStage === 2 ? -1.5 : 0, 0], 38);
    fields.push(rotationField(R(55, 138, 214, 187), [228, 161], [0, -1.1, -2.5, .3][biteStage], 25));
    pushField(fields, R(286, 376, 81, 54), [biteStage === 2 ? -3.4 : 0, biteStage === 2 ? .8 : 0], 9);
    pins = [NEAR_PIN]; contacts = { near: 1, far: 0 };
  }
  return { fields, pins, contacts };
}
async function renderImmune(src, phase, mode = 'crawl', biteStage = 0) {
  const mouth = await mouthSource(src, mode === 'bite' ? [0, .35, 1, 0][biteStage] : 0);
  const rig = immuneFields(phase, mode, biteStage);
  const frame = warpRgbaLocal(mouth.image, rig.fields, { pinnedRects: rig.pins, pinFeather: 9, jacobianStep: 4 });
  frame.landmarks = { near: NEAR_CONTACT, far: FAR_CONTACT }; frame.contacts = rig.contacts;
  return { frame, fields: rig.fields, pins: rig.pins.map((r) => contactDiff(src, frame, r)),
    stage: mode === 'bite' ? ['anticipation', 'mouth-open-preload', 'open-mouth-lunge', 'closed-mouth-recovery'][biteStage] : 'alternating-leaf-foot-crawl',
    contacts: rig.contacts, mouth: mouth.mouth, eyeBrowPreservedBeforeWarp: mouth.eyeBrowPreservedBeforeWarp };
}

const records = [], clips = [];
async function saveFrame(source, id, rendered, kind) {
  if (rendered.frame.warpQA.foldedSamples) throw new Error(`${id}: folded mesh ${JSON.stringify(rendered.frame.warpQA)}`);
  if (rendered.pins.some((p) => !p.exactPixelPin)) throw new Error(`${id}: contact pixels drifted`);
  const targets = source.id.includes('enemy') ? [{ landmark: 'contact', target: FOOT }] :
    [{ landmark: 'near', target: NEAR_CONTACT }, { landmark: 'far', target: FAR_CONTACT }];
  const qa = analyzeFrame(rendered.frame, { footTargets: targets });
  if (!qa.bbox || qa.borderPixels || qa.alpha.hiddenRgbPixels) throw new Error(`${id}: bad alpha/frame bounds`);
  const output = await write(`frames/${id}.png`, await png(rendered.frame));
  const record = { id, kind, status: 'rendered-awaiting-self-visual-review', mode: 'pixel-derived-local-rig-animation',
    source: source.provenance, generationRunId: null, aiRequestSubmitted: false,
    actualImageReferenceToAI: false, derivedDirectlyFromApprovedSourcePixels: true,
    ...output, dimensions: [512, 512], pivot: [.5, .85], foot: FOOT, trim: false,
    sourceFrame: { x: 0, y: 0, width: 512, height: 512 }, stage: rendered.stage,
    mouth: rendered.mouth ?? null, eyeBrowPreservedBeforeWarp: rendered.eyeBrowPreservedBeforeWarp ?? null,
    qa: { ...qa, exactContactPixelChecks: rendered.pins } };
  records.push(record); return { ...rendered, id, output };
}
async function sheet(name, frames, columns = frames.length) {
  const rows = Math.ceil(frames.length / columns), layers = [];
  for (let i = 0; i < frames.length; i++) layers.push({ input: await png(frames[i].frame), left: (i % columns) * SIZE, top: Math.floor(i / columns) * SIZE });
  const buffer = await sharp({ create: { width: columns * SIZE, height: rows * SIZE, channels: 4, background: '#00000000' } }).composite(layers).png({ compressionLevel: 9 }).toBuffer();
  const output = await write(`sheets/${name}.png`, buffer);
  return { ...output, dimensions: [columns * SIZE, rows * SIZE], frameSize: [512, 512], trim: false,
    frames: frames.map((f, i) => ({ id: f.id, rect: { x: i % columns * SIZE, y: Math.floor(i / columns) * SIZE, width: SIZE, height: SIZE } })) };
}
async function preview(name, frames, delays = 140) {
  const flat = [];
  for (const f of frames) flat.push(await sharp(f.frame.data, { raw: { width: SIZE, height: SIZE, channels: 4 } }).flatten({ background: '#b7c0be' }).ensureAlpha().raw().toBuffer());
  const perFrameDelays = Array.isArray(delays) ? delays : frames.map(() => delays);
  const buffer = await sharp(Buffer.concat(flat), { raw: { width: SIZE, height: SIZE * frames.length, channels: 4, pageHeight: SIZE } })
    .gif({ loop: 0, delay: perFrameDelays, colours: 256, dither: .25 }).toBuffer();
  const metadata = await sharp(buffer, { animated: true }).metadata();
  if (metadata.pages !== frames.length) throw new Error('GIF lost frames');
  if (metadata.delay?.length !== frames.length || metadata.delay.some((n) => n <= 0)) throw new Error('GIF lost per-frame duration');
  return { ...await write(`qa/${name}.gif`, buffer), pages: metadata.pages, pageHeight: metadata.pageHeight, delay: metadata.delay,
    background: 'QA-only flat grey; runtime PNG and sprite sheets remain transparent' };
}
async function contactSheet(name, frames) {
  const tile = 256, rowHeight = 282, layers = [];
  for (let i = 0; i < frames.length; i++) {
    const x = i % 4 * tile, y = Math.floor(i / 4) * rowHeight;
    const pic = await sharp(await png(frames[i].frame)).resize(tile, tile).flatten({ background: i % 2 ? '#d9ddda' : '#9ca9a7' }).png().toBuffer();
    layers.push({ input: pic, left: x, top: y });
    const label = frames[i].id.split('.').slice(-2).join('.');
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="26"><text x="8" y="18" font-family="Arial" font-size="14" fill="#eee">${label}</text></svg>`);
    layers.push({ input: svg, left: x, top: y + tile });
  }
  return write(`qa/${name}.png`, await sharp({ create: { width: tile * 4, height: Math.ceil(frames.length / 4) * rowHeight, channels: 4, background: '#252a2b' } }).composite(layers).png().toBuffer());
}
function geometrySignature(fields) { return sha(Buffer.from(JSON.stringify(fields))); }
async function addClip(name, frames, { kind, durationMs, loop, virtualEnd, source, notes, velocityQA } = {}) {
  const hashes = frames.map((f) => sha(f.frame.data)), uniqueFrames = new Set(hashes).size;
  const localHashes = frames.map((f) => f.frame.warpQA.localGeometryHash);
  const localMotion = new Set(localHashes).size > 1 && localHashes.some(Boolean);
  const loopQA = loop ? { virtualEndMatchesFirst: sha(virtualEnd.frame.data) === hashes[0],
    firstSha256: hashes[0], virtualEndSha256: sha(virtualEnd.frame.data), velocity: velocityQA } : null;
  if (kind === 'rig-baked-sequence' && (uniqueFrames !== frames.length || !localMotion)) throw new Error(`${name}: not distinct local geometry`);
  if (loop && (!loopQA.virtualEndMatchesFirst || velocityQA.maxParameterVelocitySeam > .05)) throw new Error(`${name}: loop seam`);
  const result = { name, kind, frameCount: frames.length, durationMs, loop, ids: frames.map((f) => f.id),
    uniqueFrames, localGeometryChanged: localMotion, localFieldHashes: localHashes, parameterHashes: frames.map((f) => geometrySignature(f.fields)),
    loopQA, source: source.provenance, notes, sheet: await sheet(name, frames), preview: frames.length > 1 ? await preview(name, frames, name.endsWith('bite') ? [110, 100, 140, 170] : 140) : null };
  clips.push(result); return result;
}
function velocityQA(fieldFn) {
  const flatten = (f) => f.flatMap((field) => [...(field.displacement ?? []), ...(field.vectors ?? []).flat()]);
  const e = 1e-5, a = flatten(fieldFn(0)), ae = flatten(fieldFn(e)), b = flatten(fieldFn(1)), be = flatten(fieldFn(1 - e));
  return { epsilon: e, units: 'reverse-displacement pixels per normalized cycle',
    maxParameterPositionSeam: Math.max(...a.map((n, i) => Math.abs(n - b[i]))),
    maxParameterVelocitySeam: Math.max(...a.map((n, i) => Math.abs((ae[i] - n) / e - (b[i] - be[i]) / e))) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const basic = await source('fantasy.actor.enemy.basic.master', 'sources/enemy/basic/master_v02.png');
const immune = await source('fantasy.actor.immune.front_right.master', 'sources/immune/front_right/master_v01.png');
const basicWalk = [];
for (let i = 0; i < 4; i++) basicWalk.push(await saveFrame(basic, `fantasy.actor.enemy.basic.walk.${String(i).padStart(2, '0')}`, renderBasic(basic.image, i / 4), 'rig-baked-sequence'));
await addClip('enemy.basic.walk', basicWalk, { source: basic, kind: 'rig-baked-sequence', durationMs: 560, loop: true,
  virtualEnd: renderBasic(basic.image, 1), velocityQA: velocityQA((t) => basicFields(t)), notes: 'Ground-pinned membrane squash/extension, forward face wave and delayed individual protrusions. No whole-image bob.' });
const basicWind = [];
for (let i = 0; i < 2; i++) basicWind.push(await saveFrame(basic, `fantasy.actor.enemy.basic.windup.0${i}`, renderBasic(basic.image, 0, `windup${i}`), 'windup-keypose'));
await addClip('enemy.basic.windup', basicWind, { source: basic, kind: 'windup-keypose', durationMs: 280, loop: false, notes: 'Two authored windup keyposes; does not claim a complete attack sequence.' });
const basicHurt = await saveFrame(basic, 'fantasy.actor.enemy.basic.hurt.00', renderBasic(basic.image, 0, 'hurt'), 'hurt-keypose');
await addClip('enemy.basic.hurt', [basicHurt], { source: basic, kind: 'hurt-keypose', durationMs: 120, loop: false });
const basicDissolve = await saveFrame(basic, 'fantasy.actor.enemy.basic.dissolve.00', renderBasic(basic.image, 0, 'dissolve'), 'dissolve-keypose');
await addClip('enemy.basic.dissolve', [basicDissolve], { source: basic, kind: 'dissolve-keypose', durationMs: 180, loop: false, notes: 'Porous faded terminal keypose only, not a full dissolve animation.' });
const immuneCrawl = [];
for (let i = 0; i < 4; i++) immuneCrawl.push(await saveFrame(immune, `fantasy.actor.immune.front_right.crawl.0${i}`, await renderImmune(immune.image, i / 4), 'rig-baked-sequence'));
await addClip('immune.front_right.crawl', immuneCrawl, { source: immune, kind: 'rig-baked-sequence', durationMs: 560, loop: true,
  virtualEnd: await renderImmune(immune.image, 1), velocityQA: velocityQA((t) => immuneFields(t, 'crawl').fields), notes: 'Alternating elastic leaf feet; near sole pins phases0/1, far sole phases2/3, head leaves lag the body.' });
const immuneBite = [];
for (let i = 0; i < 4; i++) immuneBite.push(await saveFrame(immune, `fantasy.actor.immune.front_right.bite.0${i}`, await renderImmune(immune.image, 0, 'bite', i), 'rig-baked-sequence'));
await addClip('immune.front_right.bite', immuneBite, { source: immune, kind: 'rig-baked-sequence', durationMs: 520, loop: false,
  notes: 'Closed anticipation -> authored small opening ->29x20 mouth and forward lunge -> original closed-mouth recovery. Mouth is drawn in source coordinates before coherent face/body warp. No new teeth; original eyes/brows preserved.' });
const basicAll = [...basicWalk, ...basicWind, basicHurt, basicDissolve], immuneAll = [...immuneCrawl, ...immuneBite];
const combinedSheets = [await sheet('enemy.basic.all', basicAll, 4), await sheet('immune.front_right.all', immuneAll, 4)];
const contacts = [await contactSheet('enemy.basic.motion-contact', basicAll), await contactSheet('immune.front_right.motion-contact', immuneAll)];
const mouthDetails = [];
for (const f of immuneBite) mouthDetails.push({ input: await sharp(await png(f.frame)).extract({ left: 310, top: 287, width: 76, height: 70 }).resize(304, 280).flatten({ background: '#d9ddda' }).png().toBuffer(), left: mouthDetails.length * 304, top: 0 });
const mouthSheet = await write('qa/immune.front_right.bite-mouth-detail.png', await sharp({ create: { width: 1216, height: 280, channels: 4, background: '#d9ddda' } }).composite(mouthDetails).png().toBuffer());
const manifest = { schemaVersion: 1, scope: 'basic8-and-immune-front-right8-only', status: 'rendered-awaiting-self-visual-review',
  mode: 'pixel-derived-local-rig-animation', rootIdentityGate: 'source identities approved by main session; produced frames remain unapproved candidates',
  expectedCount: 16, renderedCount: records.length, approvedRuntimeCount: 0, sourceCanvas: [512, 512], logicalFoot: FOOT, trim: false,
  aiGenerationCalls: 0, perFrameMaliangRunsInvented: false, sources: [basic.provenance, immune.provenance],
  measuredRig: { basic: { contactPin: BASIC_PIN, contact: FOOT, face: R(231, 277, 133, 101) }, immune: { nearFootJoint: [199, 394], farFootJoint: [312, 393], nearContact: NEAR_CONTACT, farContact: FAR_CONTACT,
    nearContactPin: NEAR_PIN, farContactPin: FAR_PIN, topLeafJoint: [228, 161], originalMouthInkBbox: [333, 304, 352, 311], mouthRepairROI: REPAIR, protectedEyeBrowROIs: EYE_BROW } },
  assets: records, clips, combinedSheets, contactSheets: contacts, mouthDetail: mouthSheet,
  visualReview: { status: 'pending-actual-view', approved: false },
  limitations: ['Basic windup/hurt/dissolve are explicitly keyposes, not full action sequences.', 'All pixels are locally derived/authored from approved sources; no new Maliang or other AI image-reference request occurred.', 'Human/internal review still decides animation quality and runtime acceptance.'] };
await json('basic-immune-candidates.json', manifest);
process.stdout.write(JSON.stringify({ rendered: records.length, clips: clips.length, manifest: join(ROOT, 'basic-immune-candidates.json'), contacts, previews: clips.filter((c) => c.preview).map((c) => c.preview.path) }) + '\n');
}
