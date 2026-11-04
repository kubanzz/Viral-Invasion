/** Shared exporter for source-specific, measured enemy rigs. No generation or runtime writes. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadRgba, warpRgbaLocal, makeSquashField, analyzeFrame } from './actor-animation-baker.mjs';

export const PRODUCTION = dirname(fileURLToPath(import.meta.url));
export const ACTORS = dirname(PRODUCTION), FOOT = [256, 435.2];
export const rect = (left, top, width, height) => ({ left, top, width, height });
export const round = (n) => Math.round(n * 1e10) / 1e10;
export const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const png = (f) => sharp(f.data, { raw: { width: 512, height: 512, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
export async function writeProduction(name, buffer) {
  const file = resolve(PRODUCTION, name), rel = relative(PRODUCTION, file);
  if (!rel || rel.startsWith('..')) throw new Error('Writes must remain in Actors_v2/production');
  await mkdir(dirname(file), { recursive: true }); await writeFile(file, buffer);
  return { path: relative(ACTORS, file).replaceAll('\\', '/'), sha256: sha(buffer), bytes: buffer.length };
}
export const writeJson = (name, object) => writeProduction(name, Buffer.from(JSON.stringify(object, null, 2) + '\n'));
export const translateField = (r, d, feather = 24) => ({ rect: r, displacement: d.map(round), feather });
export function rotateField(r, anchor, degrees, feather = 24) {
  const a = -degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), vectors = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const dx = r.left + x * r.width / 2 - anchor[0], dy = r.top + y * r.height / 2 - anchor[1];
    vectors.push([round(c * dx - s * dy - dx), round(s * dx + c * dy - dy)]);
  }
  return { rect: r, columns: 3, rows: 3, vectors, feather };
}
export function squashField(r, anchor, scale, feather = 32) {
  return makeSquashField({ rect: r, anchor, scale: scale.map(round), feather });
}
function pixelPin(before, after, r) {
  let changedPixels = 0, maxChannelDifference = 0;
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
    const p = (y * 512 + x) * 4; let changed = false;
    for (let c = 0; c < 4; c++) { const d = Math.abs(before.data[p + c] - after.data[p + c]); changed ||= d > 0; maxChannelDifference = Math.max(maxChannelDifference, d); }
    if (changed) changedPixels++;
  }
  return { rect: r, changedPixels, maxChannelDifference, exactPixelPin: !changedPixels };
}
function terminalPorosity(image, holes) {
  const data = Buffer.from(image.data);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const p = (y * 512 + x) * 4; if (!data[p + 3]) continue;
    let keep = .56;
    for (const [cx, cy, rx, ry] of holes) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      keep *= Math.max(0, Math.min(1, (d - .68) / .32));
    }
    data[p + 3] = Math.round(data[p + 3] * keep); if (!data[p + 3]) data.fill(0, p, p + 3);
  }
  return { ...image, data };
}
export async function loadFamilySource(family, explicitProvenance) {
  if (explicitProvenance) {
    const file=resolve(ACTORS,explicitProvenance.path), rel=relative(ACTORS,file);
    if(rel.startsWith('..')||!rel)throw new Error('Explicit source must remain in Actors_v2');
    if(!explicitProvenance.sourceRunId||!explicitProvenance.sourceRawSha256)throw new Error('Explicit source requires real source run/raw provenance');
    const bytes=await readFile(file);if(sha(bytes)!==explicitProvenance.sha256)throw new Error('Explicit source hash drift');
    const image=await loadRgba(bytes);if(image.width!==512||image.height!==512)throw new Error('Explicit family source must be512 RGBA');
    return{image,entry:null,provenance:{...explicitProvenance,id:`fantasy.actor.enemy.${family}.master`,sourceCanvas:[512,512]}};
  }
  const fragment = JSON.parse(await readFile(join(PRODUCTION, 'sources.fragment.json'), 'utf8'));
  const id = `fantasy.actor.enemy.${family}.master`, entry = fragment.sources.find((s) => s.id === id);
  if (!entry) throw new Error(`Source not ready: ${id}`);
  const file = resolve(PRODUCTION, entry.output.path), bytes = await readFile(file);
  if (sha(bytes) !== entry.output.sha256) throw new Error(`${id}: source hash drift`);
  const image = await loadRgba(bytes);
  if (image.width !== 512 || image.height !== 512) throw new Error(`${id}: source canvas must be512`);
  const runs = JSON.parse(await readFile(join(PRODUCTION, 'runs.json'), 'utf8'));
  const run = runs.runs[id];
  if (!run || run.runId !== entry.runId || run.status !== 'succeeded') throw new Error(`${id}: run provenance mismatch`);
  return { image, entry, provenance: {
    id, path: relative(ACTORS, file).replaceAll('\\', '/'), sha256: entry.output.sha256,
    sourceRunId: entry.runId, sourceNodeId: run.images[0].nodeId, sourceRawSha256: entry.source.sha256,
    sourceCanvas: [512, 512], registration: entry.transform, originalModel: run.images[0].model,
  } };
}
async function makeSheet(name, frames, columns = 4, prefix = '') {
  const rows = Math.ceil(frames.length / columns), layers = [];
  for (let i = 0; i < frames.length; i++) layers.push({ input: await png(frames[i].frame), left: i % columns * 512, top: Math.floor(i / columns) * 512 });
  return { ...await writeProduction(`${prefix}sheets/${name}.png`, await sharp({ create: { width: columns * 512, height: rows * 512, channels: 4, background: '#00000000' } }).composite(layers).png({ compressionLevel: 9 }).toBuffer()),
    dimensions: [columns * 512, rows * 512], frameSize: [512, 512], trim: false,
    frames: frames.map((f, i) => ({ id: f.id, rect: { x: i % columns * 512, y: Math.floor(i / columns) * 512, width: 512, height: 512 } })) };
}
async function makeGif(name, frames, duration, prefix = '') {
  const raw = [];
  for (const f of frames) raw.push(await sharp(f.frame.data, { raw: { width: 512, height: 512, channels: 4 } }).flatten({ background: '#b7c0be' }).ensureAlpha().raw().toBuffer());
  const delays = frames.map(() => duration);
  const buffer = await sharp(Buffer.concat(raw), { raw: { width: 512, height: 512 * frames.length, channels: 4, pageHeight: 512 } }).gif({ loop: 0, delay: delays, colours: 256, dither: .25 }).toBuffer();
  const metadata = await sharp(buffer, { animated: true }).metadata();
  if (metadata.pages !== frames.length || metadata.delay.some((d) => d <= 0)) throw new Error('GIF frame timing failed');
  return { ...await writeProduction(`${prefix}qa/${name}.gif`, buffer), pages: metadata.pages, delay: metadata.delay, pageHeight: metadata.pageHeight, background: 'QA only; runtime alpha remains transparent' };
}
async function makeMobileGif(name, frames, duration, prefix) {
  const maxBodyHeight = Math.max(...frames.map(f => analyzeFrame(f.frame).bbox.height));
  const sharedScale = 23 / maxBodyHeight, w = Math.round(512 * sharedScale), rows = [];
  for (const f of frames) rows.push(await sharp({ create: { width: 64, height: 64, channels: 4, background: '#b7c0be' } }).composite([
    { input: await sharp(await png(f.frame)).resize(w, w).png().toBuffer(), left: Math.floor((64-w)/2), top: Math.floor((64-w)/2) }
  ]).raw().toBuffer());
  return { ...await writeProduction(`${prefix}qa/${name}.mobile-1x.gif`, await sharp(Buffer.concat(rows), { raw: { width: 64, height: 64 * frames.length, channels: 4, pageHeight: 64 } }).gif({ loop: 0, delay: frames.map(() => duration), colours: 128 }).toBuffer()), canvas: [64,64], maxBodyHeight: 23, sharedScale };
}
async function makeContact(family, frames, prefix = '') {
  const layers = [];
  for (let i = 0; i < frames.length; i++) {
    const left = i % 4 * 256, top = Math.floor(i / 4) * 282;
    layers.push({ input: await sharp(await png(frames[i].frame)).resize(256, 256).flatten({ background: i % 2 ? '#d9ddda' : '#9ca9a7' }).png().toBuffer(), left, top });
    const label = frames[i].id.split('.').slice(-2).join('.');
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="26"><text x="8" y="18" fill="#eee" font-size="14" font-family="Arial">${label}</text></svg>`), left, top: top + 256 });
  }
  return writeProduction(`${prefix}qa/enemy.${family}.motion-contact.png`, await sharp({ create: { width: 1024, height: 564, channels: 4, background: '#252a2b' } }).composite(layers).png().toBuffer());
}
async function makeSmall(family, frames, prefix = '') {
  const layers = [], width = 384, height = 248, maxBodyHeight = Math.max(...frames.map(f => analyzeFrame(f.frame).bbox.height));
  for (let i = 0; i < frames.length; i++) {
    const left = i % 4 * width, top = Math.floor(i / 4) * height, bbox = analyzeFrame(frames[i].frame).bbox;
    for (const [j, h] of [24, 32].entries()) {
      const small = await sharp(await png(frames[i].frame)).extract(bbox).resize({ height: Math.max(1, Math.round(h * bbox.height / maxBodyHeight)) }).png().toBuffer();
      const md = await sharp(small).metadata();
      layers.push({ input: small, left: left + j * 192 + 80, top: top + 30 });
      layers.push({ input: await sharp(small).resize(md.width * 5, md.height * 5, { kernel: 'nearest' }).png().toBuffer(), left: left + j * 192 + Math.floor((192 - md.width * 5) / 2), top: top + 77 });
    }
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="24"><text x="8" y="17" fill="#20302c" font-size="12" font-family="Arial">${frames[i].id.split('.').slice(-2).join('.')} |24/32 body px +5x</text></svg>`), left, top });
  }
  return { ...await writeProduction(`${prefix}qa/enemy.${family}.24-32px.png`, await sharp({ create: { width: width * 4, height: height * 2, channels: 4, background: '#bcc8c4' } }).composite(layers).png().toBuffer()), bodyHeights: [24, 32], sharedGroupScale: true, enlargement: 5, diagnosticCropOnly: true, runtimePngsUncropped: true };
}
function flattenFields(fields) { return fields.flatMap((f) => [...(f.displacement ?? []), ...(f.vectors ?? []).flat()]); }
function loopVelocity(factory) {
  const e = 1e-5, a = flattenFields(factory(0, 'walk')), ae = flattenFields(factory(e, 'walk')),
    b = flattenFields(factory(1, 'walk')), be = flattenFields(factory(1 - e, 'walk'));
  return { epsilon: e, units: 'pixels per normalized cycle', maxParameterPositionSeam: Math.max(...a.map((n, i) => Math.abs(n - b[i]))),
    maxParameterVelocitySeam: Math.max(...a.map((n, i) => Math.abs((ae[i] - n) / e - (b[i] - be[i]) / e))) };
}

/** profile contains measured source points and a family-specific fieldsAt(phase,mode) function. */
export async function produceEnemyFamily(profile, explicitSourceProvenance) {
  const { family, fieldsAt, pins, contacts, holes, measurements, notes } = profile;
  const revision = profile.revision ?? 1, prefix = revision >= 2 ? `v${String(revision).padStart(2,'0')}/` : '';
  const walkFrameMs = profile.walkFrameMs ?? 140;
  const source = await loadFamilySource(family, explicitSourceProvenance), frames = [], assets = [];
  const specs = [0, 1, 2, 3].map((i) => ({ clip: 'walk', index: i, phase: i / 4, mode: 'walk', kind: 'rig-baked-sequence' }))
    .concat([{ clip: 'windup', index: 0, phase: 0, mode: 'windup0', kind: 'windup-keypose' }, { clip: 'windup', index: 1, phase: 0, mode: 'windup1', kind: 'windup-keypose' },
      { clip: 'hurt', index: 0, phase: 0, mode: 'hurt', kind: 'hurt-keypose' }, { clip: 'dissolve', index: 0, phase: 0, mode: 'dissolve', kind: 'dissolve-keypose' }]);
  function render(spec) {
    const fields = fieldsAt(spec.phase, spec.mode);
    let frame = warpRgbaLocal(source.image, fields, { pinnedRects: pins, pinFeather: 12, jacobianStep: 4 });
    if (frame.warpQA.foldedSamples) throw new Error(`${family}/${spec.mode}: mesh fold ${JSON.stringify(frame.warpQA)}`);
    const pinChecks = pins.map((r) => pixelPin(source.image, frame, r));
    if (pinChecks.some((p) => !p.exactPixelPin)) throw new Error('Foot pixel drift');
    frame.landmarks = Object.fromEntries(contacts.map((p, i) => [`support${i}`, p]));
    frame.contacts = Object.fromEntries(contacts.map((_, i) => [`support${i}`, spec.mode === 'dissolve' ? 0 : 1]));
    if (spec.mode === 'dissolve') frame = terminalPorosity(frame, holes);
    return { frame, fields, pinChecks };
  }
  for (const spec of specs) {
    const id = `fantasy.actor.enemy.${family}.${spec.clip}.${String(spec.index).padStart(2, '0')}`, result = render(spec);
    const qa = analyzeFrame(result.frame, { footTargets: contacts.map((p, i) => ({ landmark: `support${i}`, target: p })) });
    if (!qa.bbox || qa.borderPixels || qa.alpha.hiddenRgbPixels) throw new Error(`${id}: alpha/frame failure`);
    const output = await writeProduction(`${prefix}frames/${id}.png`, await png(result.frame));
    frames.push({ ...result, id });
    assets.push({ id, revision, family: 'enemy', subtype: family, clip: spec.clip, frameIndex: spec.index, kind: spec.kind, status: 'rendered-awaiting-self-visual-review',
      mode: 'pixel-derived-local-rig-animation', source: source.provenance, aiRequestSubmitted: false, actualImageReferenceToAI: false, generationRunId: null,
      ...output, dimensions: [512, 512], sourceFrame: { x: 0, y: 0, width: 512, height: 512 }, foot: FOOT, pivot: [.5, .85], trim: false,
      qa: { ...qa, exactContactPixelChecks: result.pinChecks }, animation: { clip: `enemy.${family}.${spec.clip}`, index: spec.index,
        frameCount: spec.clip === 'walk' ? 4 : spec.clip === 'windup' ? 2 : 1, durationMs: spec.clip === 'walk' ? walkFrameMs*4 : spec.clip === 'windup' ? 320 : 160,
        loop: spec.clip === 'walk', kind: spec.kind, isSequence: spec.clip === 'walk', completeAction: spec.clip === 'walk' } });
  }
  const walk = frames.slice(0, 4), windup = frames.slice(4, 6), end = render({ phase: 1, mode: 'walk' });
  const velocity = loopVelocity(fieldsAt), hashes = walk.map((f) => sha(f.frame.data)), uniqueFrames = new Set(hashes).size;
  const localGeometryChanged = new Set(walk.map((f) => f.frame.warpQA.localGeometryHash)).size > 1;
  const loopQA = { virtualEndMatchesFirst: sha(end.frame.data) === hashes[0], firstSha256: hashes[0], virtualEndSha256: sha(end.frame.data), velocity };
  if (uniqueFrames !== 4 || !localGeometryChanged || !loopQA.virtualEndMatchesFirst || velocity.maxParameterVelocitySeam > .05) throw new Error(`${family}: local motion/loop QA failed`);
  if (new Set(assets.map((a) => a.sha256)).size !== 8) throw new Error(`${family}: repeated frame file`);
  const clips = [
    { name: `enemy.${family}.walk`, kind: 'rig-baked-sequence', ids: walk.map((f) => f.id), frameCount: 4, durationMs: walkFrameMs*4, loop: true, uniqueFrames, localGeometryChanged, loopQA,
      sheet: await makeSheet(`enemy.${family}.walk`, walk, 4, prefix), preview: await makeGif(`enemy.${family}.walk`, walk, walkFrameMs, prefix), mobilePreview: await makeMobileGif(`enemy.${family}.walk`, walk, walkFrameMs, prefix) },
    { name: `enemy.${family}.windup`, kind: 'windup-keypose', ids: windup.map((f) => f.id), frameCount: 2, durationMs: 320, loop: false,
      sheet: await makeSheet(`enemy.${family}.windup`, windup, 2, prefix), preview: await makeGif(`enemy.${family}.windup`, windup, 160, prefix) },
    { name: `enemy.${family}.hurt`, kind: 'hurt-keypose', ids: [frames[6].id], frameCount: 1, durationMs: 160, loop: false },
    { name: `enemy.${family}.dissolve`, kind: 'dissolve-keypose', ids: [frames[7].id], frameCount: 1, durationMs: 160, loop: false, completeDissolve: false },
  ];
  const fragment = { schemaVersion: 2, revision, scope: `enemy.${family}`, status: 'rendered-awaiting-self-visual-review', mode: 'pixel-derived-local-rig-animation',
    expectedRuntimeCount: 8, candidateRuntimeCount: 0, approvedRuntimeCount: 0, sources: [source.provenance], assets, clips,
    sheets: [await makeSheet(`enemy.${family}.all`, frames, 4, prefix)], contactSheets: [await makeContact(family, frames, prefix)], smallSizeQa: await makeSmall(family, frames, prefix),
    mobileMotionValidation: { logicalBboxHeights: assets.slice(0,4).map(a => a.qa.bbox.height), logicalBboxLefts: assets.slice(0,4).map(a => a.qa.bbox.left), maxLogicalFieldDisplacement: Math.max(...assets.slice(0,4).map(a => a.qa.warp.maxDisplacement)) },
    measuredRig: { contacts, pins, measurements, notes, sourcePixelsMeasuredIndependently: true },
    visualReview: { status: 'pending-actual-view', approved: false }, aiGenerationCalls: 0, perFrameMaliangRunsInvented: false,
    limitations: ['Windup, hurt and dissolve are explicitly keyposes; no full dissolve animation is claimed.', 'Local deformation is baked from this exact family source; no AI request or identity-reference upload occurred.'] };
  await writeJson(`enemy.${family}${revision>=2?`.v${String(revision).padStart(2,'0')}`:''}.fragment.json`, fragment);
  return fragment;
}

export async function finalizeEnemyFamily(family, review, revision = 1) {
  const basename = `enemy.${family}${revision>=2?`.v${String(revision).padStart(2,'0')}`:''}.fragment.json`;
  const file = join(PRODUCTION, basename), fragment = JSON.parse(await readFile(file, 'utf8'));
  for (const a of fragment.assets) {
    if (sha(await readFile(resolve(ACTORS, a.path))) !== a.sha256) throw new Error('Frame changed after render');
    a.status = 'candidate-self-reviewed-pending-integration'; a.runtimeCandidate = true;
  }
  fragment.status = 'candidate-self-reviewed-pending-integration'; fragment.candidateRuntimeCount = 8;
  fragment.visualReview = { status: 'agent-actual-view-and-playback-complete', approved: false, reviewer: 'enemy_baseline_audit', reviewedAt: new Date().toISOString(), ...review };
  await writeJson(basename, fragment);
  return fragment;
}
