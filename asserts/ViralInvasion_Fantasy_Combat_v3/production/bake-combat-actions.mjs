/**
 * Offline Combat v3 action baking. No generation, frozen-image writes or game integration.
 * node asserts/ViralInvasion_Fantasy_Combat_v3/production/bake-combat-actions.mjs [entity ...]
 * Default: all entities in asset-contract.json. Explicit entity arguments support staged delivery.
 * Reads each source-processing.json entry's current output.path (versioned registered master).
 * action-regions.json optionally overrides defaults:
 * {entities:{slimeMage:{strength:1,regions:{hat:[l,t,w,h]},directions:{back_right:{regions:{...}}}}}}
 * Region coordinates are normalized to the registered source's visible bbox. They identify
 * anatomy; they never change source scale, pivot or canvas. Inspect the defaults on real art.
 * Existing PNG/GIF outputs are refused, including QA. Change version/path for revisions.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRgba, warpRgbaLocal, makeSquashField, analyzeFrame } from '../../ViralInvasion_Fantasy_Actors_v2/production/actor-animation-baker.mjs';

const PRODUCTION = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(PRODUCTION);
const CANVAS = [512, 512], FOOT = [256, 435.2];
const WORLD_CANVAS_WIDTH = { slimeMage: 105.6, nestBuilder: 105.6, swiftLarva: 57.6, miniNest: 117.6, immuneCannon: 122 };
const METHOD = 'Maliang source art + offline action-specific continuous local soft-body deformation; not AI-generated individual frames';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = path => relative(ROOT, path).replaceAll('\\', '/');
const round = n => Math.round(n * 1e7) / 1e7;
const defaults = {
  immuneCannon: { pod: [.08, .0, .84, .73], leafLeft: [.03, .07, .5, .67], leafRight: [.47, .07, .5, .67], base: [.08, .7, .84, .3] },
  slimeMage: { hat: [.0, .0, 1, .37], head: [.2, .2, .65, .35], body: [.22, .3, .59, .58],
    arm: [.55, .34, .43, .43], staff: [.0, .26, .3, .65], footLeft: [.2, .79, .31, .21], footRight: [.5, .79, .31, .21] },
  nestBuilder: { sac: [.0, .0, .78, .72], body: [.2, .43, .69, .4], head: [.52, .36, .48, .47],
    footRearFar: [.12, .69, .25, .31], footRearNear: [.28, .72, .25, .28], footFrontFar: [.56, .7, .23, .3], footFrontNear: [.73, .68, .25, .32] },
  miniNest: { sac: [.06, .0, .88, .84], core: [.29, .19, .44, .56], petalLeft: [.0, .08, .53, .76], petalRight: [.47, .08, .53, .76], roots: [.1, .75, .8, .25] },
  swiftLarva: { head: [.55, .06, .45, .79], middle: [.25, .16, .5, .67], tail: [.0, .19, .39, .6],
    footRear: [.14, .65, .32, .35], footFront: [.58, .64, .32, .36] },
};
const timing = {
  ready: [360, true], idle: [400, true], walk: [130, true], run: [80, true], incubate: [380, true],
  load: [150, false], fire: [90, false], windup: [160, false], cast: [110, false], build: [180, false],
  construction: [180, false], depleted: [250, false], attack: [100, false],
};

async function guard(file) {
  const path = resolve(ROOT, file), inside = relative(ROOT, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Writes must stay inside Combat_v3');
  let cursor = path;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Output symlinks/junctions are unsupported'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (cursor === ROOT) break; cursor = dirname(cursor);
  }
  return path;
}
async function absent(file) {
  const path = await guard(file);
  try { await lstat(path); } catch (e) { if (e.code === 'ENOENT') return path; throw e; }
  throw new Error('Refusing to overwrite existing image: ' + rel(path));
}
async function writeImage(file, buffer) {
  const path = await absent(file); await mkdir(await guard(dirname(path)), { recursive: true });
  await writeFile(path, buffer, { flag: 'wx' }); return { path: rel(path), sha256: hash(buffer), bytes: buffer.length };
}
async function writeJson(file, object) {
  const path = await guard(file), temp = await guard(file + '.' + randomUUID() + '.tmp');
  await mkdir(await guard(dirname(path)), { recursive: true });
  await writeFile(temp, JSON.stringify(object, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); await rename(temp, path);
}
async function readJson(path, fallback) {
  try { return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
const png = (frame, size = 512) => {
  let pipeline = sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } });
  if (size !== 512) pipeline = pipeline.resize(size, size, { kernel: 'lanczos3' });
  return pipeline.png({ palette: true, colours: 256, dither: .35, effort: 10, compressionLevel: 9 }).toBuffer();
};
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function curve(values, t) {
  const position = Math.max(0, Math.min(1, t)) * (values.length - 1), index = Math.min(values.length - 2, Math.floor(position));
  return values[index] + (values[index + 1] - values[index]) * smooth(position - index);
}
function makeFields(entity, direction, bbox, overrides) {
  const global = overrides.entities?.[entity] ?? {}, specific = global.directions?.[direction] ?? {};
  const regions = { ...defaults[entity], ...(global.regions ?? {}), ...(specific.regions ?? {}) };
  const strength = (specific.strength ?? global.strength ?? 1) * (global._autoScale ?? 1);
  if (!Number.isFinite(strength) || strength <= 0 || strength > 2) throw new Error(entity + ': strength must be in (0,2]');
  const [left, top, right, bottom] = bbox, width = right - left, height = bottom - top;
  function region(name, pad = entity === 'immuneCannon' ? .12 : entity === 'miniNest' ? .085 : .09) {
    const r = regions[name];
    if (!Array.isArray(r) || r.length !== 4 || r.some(n => !Number.isFinite(n)) || r[2] <= 0 || r[3] <= 0)
      throw new Error(entity + '/' + direction + ': invalid region ' + name);
    const p = Math.min(width, height) * pad;
    const x = Math.max(0, left + r[0] * width - p), y = Math.max(0, top + r[1] * height - p);
    return { left: x, top: y, width: Math.min(512, left + (r[0] + r[2]) * width + p) - x,
      height: Math.min(512, top + (r[1] + r[3]) * height + p) - y };
  }
  const anchor = (name, position = [.5, .5]) => {
    const r = regions[name]; return [left + (r[0] + r[2] * position[0]) * width, top + (r[1] + r[3] * position[1]) * height];
  };
  const fields = [];
  const feather = r => {
    const explicit = specific.fieldFeatherPx ?? global.fieldFeatherPx ?? (entity === 'immuneCannon' ? 48 : entity === 'miniNest' ? 42 : 40);
    return explicit !== null ? Math.max(8, Math.min(explicit, r.width * .45, r.height * .45)) : Math.max(8, Math.min(32, r.width * .17, r.height * .22));
  };
  function add(name, field, operation) { fields.push({ ...field, strength, part: name, operation }); }
  return { fields, regions, strength,
    move(name, x, y) { const rect = region(name); add(name, { rect, displacement: [-x, -y].map(round), feather: feather(rect) }, 'local-translation'); },
    scale(name, x, y, at = [.5, .75]) { const rect = region(name); add(name, makeSquashField({ rect, anchor: anchor(name, at), scale: [x, y], feather: feather(rect) }), 'local-squash'); },
    rotate(name, degrees, at = [.5, .75]) {
      const rect = region(name), a = anchor(name, at), radians = -degrees * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians), vectors = [];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const dx = rect.left + x * rect.width / 2 - a[0], dy = rect.top + y * rect.height / 2 - a[1];
        vectors.push([round(c * dx - s * dy - dx), round(s * dx + c * dy - dy)]);
      }
      add(name, { rect, columns: 3, rows: 3, vectors, feather: feather(rect) }, 'local-rotation');
    },
    wholeScale(x, y) { add('registered-whole', makeSquashField({ rect: { left: 0, top: 0, width: 512, height: 512 }, anchor: FOOT, scale: [x, y], feather: 0 }), 'ground-anchored-construction-scale'); },
  };
}

/** All pose factories are continuous in normalized time; looping motions use sin/cos. */
function poseAt(entity, direction, state, t, bbox, overrides) {
  const f = makeFields(entity, direction, bbox, overrides), c = Math.cos(t * Math.PI * 2), s = Math.sin(t * Math.PI * 2);
  const forwardY = direction === 'back_right' ? -1 : 1;
  let desaturate = 0, darken = 0, pinStrategy = 'ground-ink-strip', description;
  if (entity === 'immuneCannon') {
    if (state === 'ready') { f.scale('pod', 1 + .022 * c, 1 - .032 * c); f.rotate('leafLeft', -1.8 * c); f.rotate('leafRight', 1.8 * c); description = 'pod breathing with opposing leaf flex; crystal base remains planted'; }
    else if (state === 'load') { const q = curve([.35, 1], t); f.scale('pod', 1 + .045 * q, 1 - .13 * q, [.5, 1]); f.move('pod', 0, 4 * q); f.rotate('leafLeft', 5 * q); f.rotate('leafRight', -5 * q); description = 'life pod compresses and leaves close for loading; no projectile'; }
    else if (state === 'fire') { const q = curve([-.7, 1, 0], t); f.scale('pod', 1 - .04 * q, 1 + .11 * q, [.5, 1]); f.rotate('leafLeft', -8 * q); f.rotate('leafRight', 8 * q); f.move('pod', 0, -3 * q); description = 'compressed release, opposed leaf opening, rebound to rest; no projectile'; }
  } else if (entity === 'slimeMage') {
    if (state === 'idle') { f.scale('body', 1 + .02 * c, 1 - .027 * c); f.move('hat', 0, -2.2 * c); f.rotate('hat', .8 * c + 1.5 * s); f.move('arm', 0, 1.5 * c); description = 'torso breathing, independent brim and forearm settling'; }
    else if (state === 'walk') { f.scale('body', 1 + .02 * c, 1 - .025 * c); f.move('body', -2.8 * s, -2 * c); f.rotate('hat', -2.7 * s); f.move('hat', 1.5 * s, -1.5 * c); f.move('footLeft', 5 * s, -4 * (1 + c) / 2); f.move('footRight', -5 * s, -4 * (1 - c) / 2); f.rotate('staff', 2.5 * s); description = 'alternating short feet, torso counter-sway, delayed hat and staff'; }
    else if (state === 'windup') { const q = curve([.3, 1], t); f.rotate('body', -4 * q, [.5, .95]); f.move('hat', -6 * q, -2 * q); f.rotate('hat', -3 * q); f.move('arm', -4 * q, -9 * q); f.rotate('arm', -14 * q); f.rotate('staff', -6 * q); description = 'rearward body lean and lifting forearm/staff anticipation'; }
    else if (state === 'cast') { const q = curve([-.4, 1, 0], t); f.rotate('body', 3.8 * q, [.5, .95]); f.move('arm', 15 * q, forwardY * 3.5 * q); f.rotate('arm', 7 * q); f.move('staff', 9 * q, forwardY * 2 * q); f.rotate('staff', 5 * q); f.move('hat', -3 * q, 0); description = 'anticipation, forward forearm and staff thrust, recovery'; }
  } else if (entity === 'nestBuilder') {
    if (state === 'idle') { f.scale('sac', 1 + .025 * c, 1 - .035 * c); f.move('head', 0, 1.5 * c); f.rotate('head', .8 * c); description = 'sac respiration with independent low head settling'; }
    else if (state === 'walk') { f.move('body', -2.2 * s, -1.8 * c); f.scale('sac', 1 - .025 * c, 1 + .04 * c); f.move('sac', 2.5 * s, 0); f.rotate('head', -2 * s); ['footRearFar', 'footRearNear', 'footFrontFar', 'footFrontNear'].forEach((name, i) => { const sign = [1, -1, -1, 1][i]; f.move(name, 5 * s * sign, -4 * (1 + c * sign) / 2); }); description = 'diagonal four-foot pairs alternate while rear sac counters the body'; }
    else if (state === 'build') { const q = curve([.1, 1, .2], t); f.move('head', 5 * q, 7 * q); f.rotate('head', 5 * q); f.move('footFrontFar', 6 * q, 4 * q); f.move('footFrontNear', 7 * q, 5 * q); f.rotate('body', 2 * q); f.scale('sac', 1 - .06 * q, 1 - .09 * q); f.move('sac', -2 * q, 1.5 * q); description = 'head and digging forelimbs lower as the carried hatch sac contracts'; }
  } else if (entity === 'swiftLarva') {
    if (state === 'idle') { f.scale('middle', 1 + .03 * c, 1 - .04 * c); f.move('head', 1.8 * c, -.8 * c); f.move('tail', -1.5 * c, 1.5 * c); description = 'independent head/tail breathing and middle segment volume'; }
    else if (state === 'run') { f.move('head', 3.8 * c, -2.5 * s); f.move('middle', -1.5 * s, 4 * c); f.move('tail', -3 * c, 6 * s); f.scale('middle', 1 + .035 * c, 1 - .04 * c); f.move('footRear', 5 * s, -4.5 * (1 + c) / 2); f.move('footFront', -5 * s, -4.5 * (1 - c) / 2); description = 'three-segment traveling wave and alternating webbed feet'; }
    else if (state === 'attack') { const q = curve([-.65, 1, 0], t), back = direction === 'back_right'; f.move('head', (back ? 12 : 16) * q, (back ? -10 : 3) * q); f.move('middle', (back ? 6 : 7.5) * q, (back ? -4 : -.7) * q); f.move('tail', (back ? -3 : -4) * q, 2 * q); f.scale('middle', 1 + .055 * q, 1 - .04 * q); f.move('footFront', (back ? 6 : 8) * q, (back ? -5 : -2) * Math.max(0, q)); f.move('footRear', -3 * q, 0); description = back ? 'rear compression, segmented upper-right pounce with head(+12,-10), recovery' : 'rear compression, segmented lower-right pounce, recovery'; }
  } else if (entity === 'miniNest') {
    if (state === 'construction') { const q = curve([.7, .85, 1], t); f.wholeScale(q, q); f.rotate('petalLeft', 8 * (1 - q)); f.rotate('petalRight', -8 * (1 - q)); f.scale('core', 1, .94 + .06 * q); pinStrategy = 'logical-anchor-only'; description = 'ground-anchored small-to-full growth with independent closing petals'; }
    else if (state === 'incubate') { f.scale('sac', 1 + .035 * c, 1 + .05 * c); f.scale('core', 1 - .025 * c, 1 + .025 * c); f.rotate('petalLeft', -1.8 * c); f.rotate('petalRight', 1.8 * c); description = 'closed hatch sac inflates against opposing petal motion; no egg entities'; }
    else if (state === 'depleted') { const q = curve([.45, 1], t); f.wholeScale(1 - .055 * q, 1 - .16 * q); f.scale('core', 1 - .015 * q, 1 - .025 * q); f.rotate('petalLeft', 4 * q); f.rotate('petalRight', -4 * q); desaturate = .35 + .35 * q; darken = .04 + .06 * q; pinStrategy = 'logical-anchor-only'; description = 'spent source contracts around the fixed logical root anchor while petals fold independently and pigment becomes grey'; }
  }
  if (!description || f.fields.length < 2) throw new Error('Missing action-specific multi-region pose: ' + entity + '/' + state);
  const pin = pinStrategy === 'logical-anchor-only' ? { left: 255.5, top: 434.7, width: 1, height: 1 }
    : { left: Math.max(0, bbox[0] - 2), top: 434, width: Math.min(512, bbox[2] + 2) - Math.max(0, bbox[0] - 2), height: 3 };
  const pins = pinStrategy === 'logical-anchor-only' ? [] : [pin];
  if (entity === 'immuneCannon') {
    const r = f.regions.base, width = bbox[2] - bbox[0], height = bbox[3] - bbox[1];
    pins.push({ left: bbox[0] + r[0] * width, top: bbox[1] + r[1] * height, width: r[2] * width, height: r[3] * height });
  }
  return { fields: f.fields, regions: f.regions, strength: f.strength, pinnedRects: pins, pinFeather: pinStrategy === 'logical-anchor-only' ? 0 : entity === 'immuneCannon' ? 72 : entity === 'miniNest' ? 8 : 24,
    desaturate, darken, pinStrategy, description };
}
function pigment(frame, amount, darken) {
  if (!amount && !darken) return frame;
  const data = Buffer.from(frame.data);
  for (let p = 0; p < data.length; p += 4) {
    if (!data[p + 3]) { data.fill(0, p, p + 3); continue; }
    const grey = .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
    for (let c = 0; c < 3; c++) data[p + c] = Math.round(((1 - amount) * data[p + c] + amount * grey) * (1 - darken));
  }
  return { ...frame, data };
}
function pinCheck(source, output, rects) {
  let changedPixels = 0;
  for (const r of rects) for (let y = Math.max(0, Math.ceil(r.top - .5)); y < 512 && y + .5 <= r.top + r.height; y++) for (let x = Math.max(0, Math.ceil(r.left - .5)); x < 512 && x + .5 <= r.left + r.width; x++) {
    const p = (y * 512 + x) * 4; if ([0, 1, 2, 3].some(c => source.data[p + c] !== output.data[p + c])) changedPixels++;
  }
  return { beforePigmentAndPaletteChangedPixels: changedPixels, exactGeometryPin: changedPixels === 0 };
}
function cannonFootprint(image, sourceBbox, baseRegion) {
  const top = sourceBbox[1] + baseRegion[1] * (sourceBbox[3] - sourceBbox[1]);
  let left = 512, right = -1;
  for (let y = Math.max(0, Math.floor(top)); y < 512; y++) for (let x = 0; x < 512; x++) {
    if (image.data[(y * 512 + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x);
  }
  if (right < left) throw new Error('Cannon base alpha band is empty');
  const baseAlphaWidthPx = right - left + 1, worldLogicalCanvasWidth = WORLD_CANVAS_WIDTH.immuneCannon;
  const worldDiameter = worldLogicalCanvasWidth * baseAlphaWidthPx / 512;
  return { baseAlphaWidthPx, worldLogicalCanvasWidth, worldDiameter, limit: 80, pass: worldDiameter <= 80,
    measurement: 'alpha>=8 across all columns from registered source bbox base-region top to canvas bottom', alphaThreshold: 8,
    baseRegionPx: [0, Math.max(0, Math.floor(top)), 512, 512 - Math.max(0, Math.floor(top))],
    bandTopPx: top, left, rightInclusive: right };
}
async function makeContact(frames) {
  const columns = 4, cell = 192, row = 214, layers = [];
  for (const [i, item] of frames.entries()) {
    const x = i % columns * cell, y = Math.floor(i / columns) * row;
    layers.push({ input: await sharp(item.buffer).resize(cell, cell).flatten({ background: i % 2 ? '#d9ded7' : '#aebfb7' }).png().toBuffer(), left: x, top: y });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="22"><text x="5" y="16" font-family="Arial" font-size="11" fill="#e7eeee">${item.asset.direction} ${item.asset.state} ${item.asset.frameIndex}</text></svg>`), left: x, top: y + cell });
  }
  return sharp({ create: { width: columns * cell, height: Math.ceil(frames.length / columns) * row, channels: 3, background: '#26332f' } }).composite(layers).png().toBuffer();
}
async function makeGif(frames, delays) {
  const buffers = [];
  for (const frame of frames) buffers.push(await sharp(frame.buffer).resize(192, 192).flatten({ background: '#b9c6c0' }).ensureAlpha().raw().toBuffer());
  return sharp(Buffer.concat(buffers), { raw: { width: 192, height: 192 * frames.length, channels: 4, pageHeight: 192 } })
    .gif({ loop: 0, delay: delays, colours: 128, dither: .3, effort: 5 }).toBuffer();
}

/** Resolve ONE multiplier for an entire entity, never silently attenuate separate frames. */
async function chooseEntityStrength(entity, sourceReport, overrides) {
  const sources = [];
  for (const direction of entity.directions) {
    const key = entity.key + '/' + direction, entry = sourceReport.sources.find(s => s.key === key);
    if (!entry) throw new Error('Missing source provenance for tuning: ' + key);
    const bytes = await readFile(await guard(entry.output.path));
    if (hash(bytes) !== entry.output.sha256) throw new Error('Tuning source SHA changed: ' + key);
    const image = await loadRgba(bytes), qa = analyzeFrame(image);
    if (!qa.bbox) throw new Error('Empty tuning source: ' + key);
    sources.push({ direction, image, bbox: [qa.bbox.left, qa.bbox.top, qa.bbox.left + qa.bbox.width, qa.bbox.top + qa.bbox.height] });
  }
  const attempts = [];
  for (const factor of [1, .9, .8, .7, .6]) {
    const tuned = structuredClone(overrides); tuned.entities ??= {}; tuned.entities[entity.key] ??= {}; tuned.entities[entity.key]._autoScale = factor;
    let firstFold = null, testedPoses = 0, maximumDisplacementPx = 0, minimumJacobian = Infinity;
    outer: for (const source of sources) for (const [state, count] of Object.entries(entity.states)) {
      const loop = timing[state][1];
      const samples = new Set(Array.from({ length: loop ? 8 : 9 }, (_, i) => i / 8));
      for (let i = 0; i < count; i++) samples.add(loop ? i / count : i / (count - 1));
      for (const t of [...samples].sort((a, b) => a - b)) {
        const pose = poseAt(entity.key, source.direction, state, t, source.bbox, tuned);
        const result = warpRgbaLocal(source.image, pose.fields, { pinnedRects: pose.pinnedRects, pinFeather: pose.pinFeather, jacobianStep: 4 });
        testedPoses++; maximumDisplacementPx = Math.max(maximumDisplacementPx, result.warpQA.maxDisplacement);
        minimumJacobian = Math.min(minimumJacobian, result.warpQA.minJacobian);
        if (result.warpQA.foldedSamples) { firstFold = { direction: source.direction, state, t, foldedSamples: result.warpQA.foldedSamples }; break outer; }
      }
    }
    attempts.push({ factor, testedPoses, minimumJacobian, maximumDisplacementPx, firstFold });
    if (!firstFold) return { overrides: tuned, report: { method: 'entity-wide strength selection against actual source and all actions at1/8 phase intervals',
      factor, effectiveStrength: (overrides.entities?.[entity.key]?.strength ?? 1) * factor, testedPoses, minimumJacobian, maximumDisplacementPx,
      allSampledPosesHaveZeroFolds: true, attempts, frameSpecificAttenuation: false } };
  }
  throw new Error(entity.key + ': no zero-fold solution at strength>=0.6; revise local feather/anchor before baking. ' + JSON.stringify(attempts));
}

export async function bakeCombatActions(requested = [], options = {}) {
  const contract = await readJson(resolve(PRODUCTION, 'asset-contract.json'));
  if (JSON.stringify(contract.canvas) !== JSON.stringify(CANVAS) || JSON.stringify(contract.foot) !== JSON.stringify(FOOT)) throw new Error('Unexpected canvas/foot contract');
  const entities = requested.length ? contract.entities.filter(e => requested.includes(e.key)) : contract.entities;
  if (!entities.length || requested.some(key => !entities.some(e => e.key === key))) throw new Error('Unknown requested entity');
  const allCount = contract.entities.reduce((sum, e) => sum + e.directions.length * Object.values(e.states).reduce((a, b) => a + b, 0), 0);
  if (allCount !== 72 || allCount !== contract.expectedRuntimeCount) throw new Error('Contract no longer matches72-frame delivery');
  const sourceReport = await readJson(resolve(PRODUCTION, 'source-processing.json'));
  const overrides = await readJson(resolve(PRODUCTION, 'action-regions.json'), {});
  const fragmentFile = resolve(PRODUCTION, 'animation-fragment.json');
  const fragment = await readJson(fragmentFile, { schemaVersion: 1, scope: 'Fantasy_Combat_v3-actions-only', assets: [], clips: [], qa: [], sourceGroups: [] });
  if (fragment.scope !== 'Fantasy_Combat_v3-actions-only') throw new Error('Refuse unrelated animation fragment');
  // Refuse every existing image before beginning a selected entity batch.
  for (const e of entities) {
    if (!defaults[e.key]) throw new Error('No anatomy profile for' + e.key);
    await absent('production/qa/' + e.key + '.contact.png');
    for (const d of e.directions) for (const [state, count] of Object.entries(e.states)) {
      if (!timing[state] || !Number.isInteger(count) || count < 2 || count > 4) throw new Error('Unsupported state contract');
      for (let i = 0; i < count; i++) await absent(`${e.key}/${d}/${state}/${String(i).padStart(2, '0')}.png`);
      await absent(`production/qa/animations/${e.key}.${d}.${state}.gif`);
    }
  }
  for (const entity of entities) {
    const tuning = await chooseEntityStrength(entity, sourceReport, overrides), entityOverrides = tuning.overrides;
    console.log(JSON.stringify({ entity: entity.key, validation: 'zero-fold-poses', ...tuning.report }));
    const staged = [], clips = [], groups = [];
    for (const direction of entity.directions) {
      const sourceId = entity.key + '/' + direction;
      const sourceEntry = sourceReport.sources.find(s => s.key === sourceId);
      if (!sourceEntry) throw new Error('Missing source-processing provenance: ' + sourceId);
      const sourcePath = await guard(sourceEntry.output.path);
      const sourceBytes = await readFile(sourcePath);
      if (hash(sourceBytes) !== sourceEntry.output.sha256) throw new Error('Source SHA changed: ' + sourceId);
      const source = await loadRgba(sourceBytes), sourceQa = analyzeFrame(source);
      if (source.width !== 512 || source.height !== 512 || !sourceQa.bbox || sourceQa.borderPixels) throw new Error('Invalid registered source: ' + sourceId);
      const bbox = [sourceQa.bbox.left, sourceQa.bbox.top, sourceQa.bbox.left + sourceQa.bbox.width, sourceQa.bbox.top + sourceQa.bbox.height];
      groups.push({ sourceId, registrationGroup: sourceId, sourcePath: rel(sourcePath), sourceSha256: hash(sourceBytes),
        runId: sourceEntry.runId, matrixOriginalToRegistered: sourceEntry.registration.matrixOriginalToRegistered, foot: FOOT, pivot: [.5, .85],
        regions: makeFields(entity.key, direction, bbox, entityOverrides).regions, strengthResolution: tuning.report });
      for (const [state, count] of Object.entries(entity.states)) {
        const [frameMs, loop] = timing[state], clipFrames = [];
        for (let i = 0; i < count; i++) {
          const t = loop ? i / count : i / (count - 1), pose = poseAt(entity.key, direction, state, t, bbox, entityOverrides);
          const warped = warpRgbaLocal(source, pose.fields, { pinnedRects: pose.pinnedRects, pinFeather: pose.pinFeather, jacobianStep: 4 });
          if (warped.warpQA.foldedSamples) throw new Error(`${sourceId}/${state}/${i}: reverse field folded (${warped.warpQA.foldedSamples})`);
          const pins = pinCheck(source, warped, pose.pinnedRects);
          if (!pins.exactGeometryPin) throw new Error(sourceId + '/' + state + ': ground pin changed');
          const frame = pigment(warped, pose.desaturate, pose.darken), geometryQa = analyzeFrame(frame);
          if (!geometryQa.bbox || geometryQa.borderPixels || geometryQa.alpha.hiddenRgbPixels || !geometryQa.alpha.transparentPixels)
            throw new Error(sourceId + '/' + state + ': geometry alpha/margin failed');
          const buffer = await png(frame), decoded = await loadRgba(buffer), qa = analyzeFrame(decoded);
          if (!qa.bbox || qa.borderPixels || qa.alpha.hiddenRgbPixels) throw new Error(sourceId + '/' + state + ': encoded alpha/margin failed');
          const groundFootprint = entity.key === 'immuneCannon' ? cannonFootprint(decoded, bbox, pose.regions.base) : null;
          if (groundFootprint && !groundFootprint.pass) throw new Error('Cannon base exceeds80 world units: ' + groundFootprint.worldDiameter);
          const id = `${entity.idPrefix}.${direction}.${state}.${String(i).padStart(2, '0')}`;
          const asset = { id, entity: entity.key, direction, state, frameIndex: i, sourceId: sourceEntry.key,
            registrationGroup: sourceEntry.key, runId: sourceEntry.runId ?? null, path: `${entity.key}/${direction}/${state}/${String(i).padStart(2, '0')}.png`,
            sha256: hash(buffer), bytes: buffer.length, dimensions: CANVAS, pivot: [.5, .85], foot: FOOT, trim: false,
            worldVisibleHeight: entity.suggestedVisibleWorldHeight, worldLogicalCanvasWidth: WORLD_CANVAS_WIDTH[entity.key],
            animation: { group: `${entity.key}.${direction}.${state}`, index: i, fps: 1000 / frameMs, frameCount: count },
            actorRegistration: { canvas: CANVAS, foot: FOOT, commonCanvasScale: 1 },
            groundFootprint,
            method: METHOD, kind: 'rig-baked-sequence', runtime: true,
            alpha: qa.alpha, bbox: qa.bbox, sourceProcessing: { key: sourceEntry.key, report: 'production/source-processing.json',
              sourcePath: rel(sourcePath), sourceSha256: hash(sourceBytes), rawSha256: sourceEntry.raw.sha256,
              matrixOriginalToRegistered: sourceEntry.registration.matrixOriginalToRegistered, prompt: sourceEntry.prompt ?? null },
            deformation: { normalizedTime: t, description: pose.description, effectiveStrength: pose.strength, strengthResolution: tuning.report, fields: pose.fields, pinnedRects: pose.pinnedRects,
              pinFeather: pose.pinFeather, pinStrategy: pose.pinStrategy, pigment: { desaturate: pose.desaturate, darken: pose.darken }, warpQA: warped.warpQA, pinCheck: pins },
            palette: { colours: 256, dither: .35 }, status: 'baked-awaiting-actual-visual-review',
            runtimeSamplingEstimate: {192: (await png(frame, 192)).length, 256: (await png(frame, 256)).length} };
          const item = { asset, buffer }; staged.push(item); clipFrames.push(item);
        }
        const distinct = new Set(clipFrames.map(item => item.asset.sha256)).size;
        if (distinct !== count) throw new Error(sourceId + '/' + state + ': duplicate encoded frames');
        const endpoints = [0, 1].map(t => poseAt(entity.key, direction, state, t, bbox, entityOverrides));
        const loopClosed = !loop || JSON.stringify(endpoints[0].fields) === JSON.stringify(endpoints[1].fields);
        if (!loopClosed) throw new Error(sourceId + '/' + state + ': continuous loop parameters do not close');
        const name = `${entity.key}.${direction}.${state}`, delays = clipFrames.map(() => frameMs);
        clips.push({ name, entity: entity.key, direction, state, sourceId: sourceEntry.key, registrationGroup: sourceEntry.key,
          ids: clipFrames.map(item => item.asset.id), frameDurationsMs: delays, durationMs: frameMs * count, loop,
          kind: 'rig-baked-sequence', method: METHOD, foot: FOOT, pivot: [.5, .85], trim: false,
          qa: { distinctFrames: distinct, localGeometryEvidence: clipFrames.every(item => !!item.asset.deformation.warpQA.localGeometryHash),
            loopParameterClosure: loopClosed, actualVisualReview: false }, frames: clipFrames });
      }
    }
    const contact = await makeContact(staged), gifs = [];
    for (const clip of clips) gifs.push({ clip, buffer: await makeGif(clip.frames, clip.frameDurationsMs) });
    if (options.validateOnly) { console.log(JSON.stringify({ entity: entity.key, validation: 'complete-staged-frames-and-qa', frames: staged.length, writes: 0 })); continue; }
    // Staged entity has passed numeric checks before its first output write.
    for (const item of staged) await writeImage(item.asset.path, item.buffer);
    const contactEntry = await writeImage('production/qa/' + entity.key + '.contact.png', contact);
    for (const gif of gifs) gif.clip.qa.animation = await writeImage(`production/qa/animations/${gif.clip.name}.gif`, gif.buffer);
    fragment.assets.push(...staged.map(item => item.asset));
    fragment.clips.push(...clips.map(({ frames, ...clip }) => clip));
    fragment.sourceGroups.push(...groups); fragment.qa.push({ entity: entity.key, contact: contactEntry, runtime: false });
    fragment.expectedRuntimeCount = 72; fragment.completedRuntimeCount = fragment.assets.length; fragment.method = METHOD;
    fragment.status = fragment.assets.length === 72 ? 'all-baked-awaiting-actual-visual-review' : 'partial-baked-awaiting-actual-visual-review';
    fragment.updatedAt = new Date().toISOString(); fragment.canvas = CANVAS; fragment.pivot = [.5, .85]; fragment.foot = FOOT; fragment.trim = false;
    fragment.totalBytes = fragment.assets.reduce((sum, a) => sum + a.bytes, 0);
    fragment.totalMiB = fragment.totalBytes / 1048576;
    fragment.runtimeSamplingEstimate = Object.fromEntries([192, 256].map(size => [size, { bytes: fragment.assets.reduce((sum, a) => sum + a.runtimeSamplingEstimate[size], 0),
      method: 'actual full-canvas resample and256-colour PNG encoding in memory; estimates only, files not written' }]));
    fragment.budget = { sourcePngTargetBytes: 8 * 1048576, sourcePngTargetMet: fragment.totalBytes < 8 * 1048576, existingApproxMiB: 9.61,
      combinedRecommendedEstimateMiB: 9.61 + fragment.assets.reduce((sum, a) => sum + a.runtimeSamplingEstimate[contract.entities.find(e => e.key === a.entity).recommendedRuntimeTexture], 0) / 1048576,
      totalRuntimeBudgetMiB: 20, qaCountsTowardRuntimeBudget: false };
    await writeJson(fragmentFile, fragment);
    console.log(JSON.stringify({ entity: entity.key, frames: staged.length, completed: fragment.completedRuntimeCount, totalBytes: fragment.totalBytes, contact: contactEntry.path }));
  }
  return options.validateOnly ? { validatedEntities: entities.map(e => e.key), writes: 0 }
    : { fragment: rel(fragmentFile), completedRuntimeCount: fragment.completedRuntimeCount, totalBytes: fragment.totalBytes, sourcePngTargetMet: fragment.budget.sourcePngTargetMet };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { const args = process.argv.slice(2); console.log(JSON.stringify(await bakeCombatActions(args.filter(a => a !== '--validate'), { validateOnly: args.includes('--validate') }))); }
  catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }
}
