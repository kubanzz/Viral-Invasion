/** Owned batch03 processing. Every raw must be viewed and entered in REVIEWS first. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { removeWhiteMatte, registerStateGroup, makeSeamlessGround, inspectImage, inspectSeams,
  alphaPreviews, tiledPreview, outputPath } from './fantasy-art-process.mjs';

const production = dirname(fileURLToPath(import.meta.url)), pack = dirname(production);
const digest = data => createHash('sha256').update(data).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const png = (data, width, height, channels = 4) => sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
const IDS = ['infection.source', 'heart.core.base', 'heart.valve.closed', 'heart.valve.open',
  'lung.rock.healthy', 'lung.rock.infected', 'lung.airway.closed', 'lung.airway.open'];
const GROUPS = [['infection.source'], ['heart.core.base'], ['heart.valve.closed', 'heart.valve.open'],
  ['lung.rock.healthy', 'lung.rock.infected'], ['lung.airway.closed', 'lung.airway.open']];

// A source hash here is evidence of an actual raw-image review, not an automatic approval.
// Add only after viewing the source. Revisions with different bytes stop for another review.
const REVIEWS = {
  'infection.source': { sourceSha256: 'e536e749160dc010401bb2d022b22d7e9199b261a92cc34d242b5b64dc713c9a', accepted: true,
    whiteMin: 235, chromaMax: 28, holeWhiteMin: 238, holeChromaMax: 22, allNeutralWhiteIsBackdrop: true, keepLargestBody: 1, clearNeutralResizeFringe: true,
    backdropRegions: [{ rect: [730, 1720, 650, 220], whiteMin: 170, chromaMax: 75, connectedToTransparentOnly: true,
      reason: 'Viewed pale low-chroma ground-colour wash between/behind strongly coloured coral toes; this is backdrop, not capsule pigment.' },
      { rect: [730, 1720, 650, 220], whiteMin: 225, chromaMax: 30,
        reason: 'Viewed remaining neutral-white negative-space islands between peach toes; coloured toe interiors are excluded by the neutral-white test.' }],
    componentReason: 'Viewed single purple capsule with connected coral toes. Detached neutral paper specks are not intended scenery.',
    notes: 'Viewed original: single small purple porous capsule, tiny infection crystals, no face/actor/text/UI/effect. Inspect faint ground-colour residual separately before delivery.' },
  'heart.core.base': { sourceSha256: 'c946e7a43975a82b6ffbcc747909a8c89f26081bbb9583a9a1609c7fa89e7b3f', accepted: true,
    whiteMin: 230, chromaMax: 24, whiteHoleSeeds: [[771, 1505], [1290, 1576], [1600, 1250]], holeWhiteMin: 230, holeChromaMax: 24, keepLargestBody: 1,
    backdropRegions: [{ rect: [600, 1450, 900, 420], whiteMin: 240, chromaMax: 18,
      reason: 'Viewed neutral white negative-space islands among coral root loops. Warm ivory bracts have coloured pigment and are protected by the chroma/value test.' }],
    componentReason: 'Viewed connected seed, ivory bracts, and coral roots; detached paper pigment is backdrop.',
    notes: 'Viewed original: warm peach seed facility with mint veins and ivory bracts, root base, no shield or glow. Two enclosed pure-white root-loop gaps are negative space, not pigment.' },
  'lung.rock.healthy': { sourceSha256: 'd92a009961c46bf0c327c907c3768200aa33d65f5315f442251639dfafaaf3cc', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, whiteHoleSeeds: [[1038, 1035]], holeWhiteMin: 235, holeChromaMax: 18,
    componentReason: 'Viewed one connected double porous rock with one basal rock foot. Detached paper pixels are backdrop.',
    notes: 'Viewed original: two warm ivory porous rock lobes with mint/coral fine veins; physical dark pore interiors remain solid. No actor, text, UI, baked ground plane or effects.' },
  'lung.rock.infected': { sourceSha256: 'b8302f96df2b5331f770686b8ab0740c795c042003214c0730f63332b61bdcb5', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, whiteHoleSeeds: [[1038, 1035]], holeWhiteMin: 235, holeChromaMax: 18,
    componentReason: 'Viewed same connected double rock, with purple plugging and fine fungal protrusions; detached paper noise is not intended scenery.',
    notes: 'Viewed original against healthy: matching double rock silhouette and pore layout, strong gray-purple tissue, clogged pores and small crystal/mycelium attachments. Accept infection semantics; no fake face, text or effect.' },
  'heart.valve.closed': { sourceSha256: 'c4cebb22b043c6d9ce146f017a8374c3c1bd0f7dec6e8fcabed46f3e747f22fb', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, clearNeutralResizeFringe: true,
    componentReason: 'Viewed r02 as a compact coral valve ring with two cream leaflets, no anatomical whole-heart shape.',
    notes: 'Viewed accepted r02: low coral valve ring and two closed fan-shaped organic door leaves. No vessels/heart chambers, actors, UI or effects.' },
  'heart.valve.open': { sourceSha256: '80551f5e33128b5296c0e3eca34c2fdbef9e7b8b5caaf28a47724be0c88f6826', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, clearNeutralResizeFringe: true,
    whiteHoleSeeds: [[1000, 1000]], holeWhiteMin: 230, holeChromaMax: 24,
    componentReason: 'Viewed r02 matching coral ring/root base. The pure-white central opening is backdrop, while warm cream leaflets are physical pigment.',
    notes: 'Viewed accepted open r02: same low coral ring and root base with two retracted cream leaflets and clear central white aperture; aperture must become true alpha.' },
  'lung.airway.closed': { sourceSha256: '51da2fdc350b53ae68d3368d315f2b3fbe9752e25ca94c98855741d2683b822e', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, clearNeutralResizeFringe: true,
    whiteHoleSeeds: [[792,716],[1017,660],[657,1080],[1296,725],[622,879],[1449,885],[773,1434],[1352,1400],[1451,1061],[1292,1178],[1188,1460],[852,1256],[652,1376]],
    holeWhiteMin: 230, holeChromaMax: 24,
    backdropRegions: [{ rect: [870, 1520, 370, 240], whiteMin: 170, chromaMax: 70, connectedToTransparentOnly: true,
      reason: 'Viewed pale ground-colour wash behind the coral root foot; coloured roots remain enclosed by dark outlines.' }],
    componentReason: 'Viewed connected mint ring, cream valve leaves, and coral root foot. Detached paper noise is backdrop.',
    notes: 'Viewed closed airway: mint circular facility and cream fan leaves on coral supports; apertures between supports are background. Cream highlights inside physical leaves remain pigment.' },
  'lung.airway.open': { sourceSha256: '6150dc1c3447b65d42a6e6e52e7898af94e83d4d680381e695fef30a6d6a164f', accepted: true,
    whiteMin: 230, chromaMax: 24, keepLargestBody: 1, clearNeutralResizeFringe: true,
    whiteHoleSeeds: [[1035,809],[745,1363],[757,535],[1285,539],[1407,1331],[562,695],[1227,1394],[1097,486],[585,1283],[1524,748]],
    holeWhiteMin: 230, holeChromaMax: 24,
    componentReason: 'Viewed open mint ring facility with central aperture. Full source frame differs in scale from closed and will be mapped only inside a fixed closed base.',
    notes: 'Viewed open airway: clear centre aperture, but AI enlarged/repositioned outer ring and changed leaflet configuration. Use fixed closed outer ring/root plus the open interior patch; never claim original AI full sprites are registered.' }
};

async function atomicJson(path, value) {
  const temporary = outputPath(`fragment/.batch03-${randomUUID()}.tmp`);
  await mkdir(dirname(temporary), { recursive: true });
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, path);
}

async function raw(id, registry) {
  const run = registry.runs[id], item = run?.raw?.at(-1);
  if (run?.status !== 'succeeded' || !item) return null;
  const path = resolve(pack, item.path), rel = relative(pack, path);
  if (rel.startsWith('..')) throw new Error('Raw path escaped Fantasy_v1');
  const input = await readFile(path), sha256 = digest(input);
  if (sha256 !== item.sha256) throw new Error(`Raw SHA256 mismatch: ${id}`);
  const review = REVIEWS[id];
  return { id, input, path, sha256, runId: run.runId, nodeId: item.nodeId, canvasURL: run.canvas?.url,
    review, reviewed: review?.sourceSha256 === sha256 && review.accepted === true };
}

/** Remove only explicitly reviewed neutral-white negative-space components. */
async function clearWhiteNegativeSpace(input, review) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data), seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  const whiteMin = review.holeWhiteMin ?? 244, chromaMax = review.holeChromaMax ?? 18;
  const white = i => { const j = i * 4; return output[j + 3] >= 8 && Math.min(output[j], output[j + 1], output[j + 2]) >= whiteMin
    && Math.max(output[j], output[j + 1], output[j + 2]) - Math.min(output[j], output[j + 1], output[j + 2]) <= chromaMax; };
  const neighbours = i => { const x = i % width, n = []; if (x) n.push(i - 1); if (x < width - 1) n.push(i + 1);
    if (i >= width) n.push(i - width); if (i < width * (height - 1)) n.push(i + width); return n; };
  const components = [];
  const clear = start => {
    if (seen[start] || !white(start)) return;
    let head = 0, tail = 1, left = width, top = height, right = 0, bottom = 0; queue[0] = start; seen[start] = 1;
    while (head < tail) { const i = queue[head++], x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      for (const n of neighbours(i)) if (!seen[n] && white(n)) { seen[n] = 1; queue[tail++] = n; } }
    for (let k = 0; k < tail; k++) output.fill(0, queue[k] * 4, queue[k] * 4 + 4);
    components.push({ seed: [start % width, Math.floor(start / width)], pixels: tail, bbox: [left, top, right, bottom] });
  };
  const alreadyTransparentSeeds = [];
  for (const seed of review.whiteHoleSeeds ?? []) {
    const [x, y] = seed.map(Math.round), start = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error(`Reviewed hole seed is outside the source: ${seed}`);
    if (output[start * 4 + 3] < 8) { alreadyTransparentSeeds.push(seed); continue; }
    if (!white(start)) throw new Error(`Reviewed hole seed no longer matches: ${seed}`);
    clear(start);
  }
  if (review.allNeutralWhiteIsBackdrop) for (let i = 0; i < width * height; i++) if (!seen[i] && white(i)) clear(i);
  const backdropRegions = [];
  for (const region of review.backdropRegions ?? []) {
    const [left, top, w, h] = region.rect; let removedPixels = 0;
    const inRegion = i => { const x = i % width, y = Math.floor(i / width); return x >= left && x < left + w && y >= top && y < top + h; };
    const eligible = i => { const at = i * 4; return output[at + 3] < 8 || Math.min(output[at], output[at + 1], output[at + 2]) >= region.whiteMin
      && Math.max(output[at], output[at + 1], output[at + 2]) - Math.min(output[at], output[at + 1], output[at + 2]) <= region.chromaMax; };
    const allowed = new Uint8Array(width * height); let head = 0, tail = 0;
    for (let y = Math.max(0, top); y < Math.min(height, top + h); y++) for (let x = Math.max(0, left); x < Math.min(width, left + w); x++) {
      const i = y * width + x;
      if (region.connectedToTransparentOnly ? output[i * 4 + 3] < 8 : eligible(i)) { allowed[i] = 1; queue[tail++] = i; }
    }
    if (region.connectedToTransparentOnly) while (head < tail) {
      const i = queue[head++];
      for (const n of neighbours(i)) if (inRegion(n) && !allowed[n] && eligible(n)) { allowed[n] = 1; queue[tail++] = n; }
    }
    for (let k = 0; k < tail; k++) { const at = queue[k] * 4;
      if (output[at + 3] >= 8) { output.fill(0, at, at + 4); removedPixels++; }
    }
    backdropRegions.push({ ...region, removedPixels });
  }
  return { buffer: await png(output, width, height), report: { method: 'source-reviewed-neutral-white-negative-space',
    whiteMin, chromaMax, allNeutralWhiteIsBackdrop: !!review.allNeutralWhiteIsBackdrop, components, alreadyTransparentSeeds,
    backdropRegions, physicalWhitePigmentProtected: !review.allNeutralWhiteIsBackdrop } };
}

async function componentCleanup(input, review) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const labels = new Int32Array(width * height), queue = new Uint32Array(width * height), components = [];
  let label = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] || data[i * 4 + 3] < 8) continue;
    let head = 0, tail = 1, left = width, top = height, right = 0, bottom = 0; labels[i] = ++label; queue[0] = i;
    while (head < tail) { const at = queue[head++], x = at % width, y = Math.floor(at / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      const near = []; if (x) near.push(at - 1); if (x < width - 1) near.push(at + 1);
      if (at >= width) near.push(at - width); if (at < width * (height - 1)) near.push(at + width);
      for (const n of near) if (!labels[n] && data[n * 4 + 3] >= 8) { labels[n] = label; queue[tail++] = n; }
    }
    components.push({ label, pixels: tail, bbox: [left, top, right, bottom] });
  }
  components.sort((a, b) => b.pixels - a.pixels);
  const keep = review.keepLargestBody ? new Set(components.slice(0, review.keepLargestBody).map(c => c.label))
    : new Set(components.filter(c => c.pixels >= (review.minimumComponentPixels ?? 0)).map(c => c.label));
  const output = Buffer.from(data); let removed = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] && !keep.has(labels[i])) { output.fill(0, i * 4, i * 4 + 4); removed++; }
  return { buffer: await png(output, width, height), report: { method: review.keepLargestBody ? 'reviewed-primary-connected-body' : 'reviewed-small-detached-noise-threshold',
    keepLargestBody: review.keepLargestBody ?? null, minimumComponentPixels: review.minimumComponentPixels ?? 0,
    components: components.slice(0, 30), retainedComponents: keep.size, removedPixels: removed,
    reason: review.componentReason ?? 'Do not infer component ownership without a source review.' } };
}

async function supportPoint(input) {
  const { data, info: { width, height } } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let bottom = -1;
  const left = Math.floor(width * .25), right = Math.ceil(width * .75);
  for (let y = Math.floor(height * .45); y < height; y++) for (let x = left; x < right; x++) if (data[(y * width + x) * 4 + 3] >= 192) bottom = Math.max(bottom, y);
  if (bottom < 0) throw new Error('No central opaque support found');
  return { point: [width * .5, bottom], canvas: [width, height], normalized: [.5, bottom / height],
    definition: 'Centre-x and lowest alpha>=192 root support in central 25..75% source; source view must confirm this is the ground contact.' };
}

async function halfOverlay(a, b) {
  const aa = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bb = await sharp(b).ensureAlpha().raw().toBuffer(), data = Buffer.alloc(aa.data.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.round((aa.data[i] + bb[i]) / 2);
  return png(data, aa.info.width, aa.info.height);
}

/** Keep one physical facility frame/root while mapping the AI open contents into its inner area. */
async function fixedAirwayBase(closed, open) {
  const a = await sharp(closed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = a.info;
  if (width !== 2048 || height !== 2048) throw new Error('Reviewed airway mapping expects the original 2048-square canvases');
  const mapping = { width: 1771, height: 1862, left: 145, top: 224 };
  const resized = await sharp(open).resize(mapping.width, mapping.height, { fit: 'fill' })
    .extract({ left: 0, top: 0, width: Math.min(mapping.width, width - mapping.left), height: Math.min(mapping.height, height - mapping.top) }).png().toBuffer();
  const b = await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
    .composite([{ input: resized, left: mapping.left, top: mapping.top }]).ensureAlpha().raw().toBuffer();
  const ellipse = { cx: 1032, cy: 1003, rx: 485, ry: 390, featherSourcePixels: 4 };
  const output = Buffer.from(a.data); let touched = 0, outsideChanges = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const distance = Math.hypot((x - ellipse.cx) / ellipse.rx, (y - ellipse.cy) / ellipse.ry);
    const weight = Math.max(0, Math.min(1, .5 + (1 - distance) * Math.min(ellipse.rx, ellipse.ry) / ellipse.featherSourcePixels));
    if (!weight) continue;
    const at = (y * width + x) * 4, aa = a.data[at + 3] / 255, ba = b[at + 3] / 255, alpha = aa * (1 - weight) + ba * weight;
    output[at + 3] = Math.round(alpha * 255);
    for (let c = 0; c < 3; c++) output[at + c] = alpha ? Math.round((a.data[at + c] * aa * (1 - weight) + b[at + c] * ba * weight) / alpha) : 0;
    touched++;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (Math.hypot((x - ellipse.cx) / ellipse.rx, (y - ellipse.cy) / ellipse.ry) <= 1.01) continue;
    const at = (y * width + x) * 4;
    if ([0,1,2,3].some(c => output[at + c] !== a.data[at + c])) outsideChanges++;
  }
  if (outsideChanges) throw new Error('Shared airway frame/root unexpectedly changed outside the interior mask');
  return { buffer: await png(output, width, height), report: { method: 'fixed-closed-frame-and-root-plus-mapped-open-interior',
    originalAiSpritesClaimedPixelRegistered: false, fullSourceScaleForDelivery: .5, interiorOnlyResampling: mapping,
    reviewedInteriorMask: ellipse, changedInteriorSourcePixels: touched, changedPixelsOutsideInteriorMask: outsideChanges,
    limitation: 'The AI open leaflet configuration differs from closed. Only its interior is reused; the visible facility frame, outer silhouette, roots and contact are fixed from closed.' } };
}

async function save(result, source, extra = {}) {
  const id = source.id, output = outputPath(`processed/${id}.png`), qa = {};
  await mkdir(dirname(output), { recursive: true }); await mkdir(outputPath('qa'), { recursive: true });
  await writeFile(output, result.buffer);
  for (const [name, buffer] of Object.entries(result.previews ?? {})) {
    const path = outputPath(`qa/${id}.${name}.png`); await writeFile(path, buffer); qa[name] = { path: slash(relative(pack, path)), sha256: digest(buffer) };
  }
  const image = await inspectImage(result.buffer), record = { id, outputPath: slash(relative(pack, output)),
    reportPath: `production/processed/${id}.report.json`, runId: source.runId, rawPath: slash(relative(pack, source.path)),
    rawSha256: source.sha256, outputSha256: image.sha256, processing: result.report.processing,
    registration: result.report.registration, image, qaPaths: Object.values(qa).map(item => item.path), qa,
    visualReview: { sourceReviewed: true, rawSha256: source.sha256, semanticAccepted: true,
      sourceNotes: source.review.notes, state: 'awaiting-processed-black-white-alpha-and-pair-review',
      colourTreatment: 'No global colour grading, saturation/contrast adjustment, or old artToneFor pass.' }, ...extra };
  const report = { ...result.report, id, output, previews: qa, sourceSha256: source.sha256, image, ...extra };
  await writeFile(outputPath(`processed/${id}.report.json`), JSON.stringify(report, null, 2) + '\n');
  return record;
}

async function processObjects(sources) {
  const cutouts = [];
  for (const source of sources) {
    const outer = await removeWhiteMatte(source.input, { whiteMin: source.review.whiteMin ?? 242,
      chromaMax: source.review.chromaMax ?? 18, edgeWidth: 2 });
    const holes = await clearWhiteNegativeSpace(outer.buffer, source.review);
    const components = await componentCleanup(holes.buffer, source.review);
    cutouts.push({ source, buffer: components.buffer, processing: { outer: outer.report.processing,
      negativeSpaces: holes.report, components: components.report, paletteAdjustment: false } });
  }
  if (sources.length === 2 && sources[0].id === 'lung.airway.closed') {
    const shared = await fixedAirwayBase(cutouts[0].buffer, cutouts[1].buffer);
    cutouts[1].buffer = shared.buffer;
    cutouts[1].processing.sharedBase = { ...shared.report, closedRawSha256: sources[0].sha256, openRawSha256: sources[1].sha256 };
  }
  const supports = await Promise.all(cutouts.map(item => supportPoint(item.buffer)));
  const sourceAnchor = sources[0].review.sourceAnchor ?? supports[0].normalized;
  const metadata = await sharp(cutouts[0].buffer).metadata();
  const result = await registerStateGroup(cutouts.map(item => ({ id: item.source.id, input: item.buffer })),
    { removeWhite: false, sourceAnchor, scale: 1024 / metadata.width });
  const records = [];
  for (let i = 0; i < result.results.length; i++) {
    const item = result.results[i], support = supports[i], logical = [
      result.transform.left + support.point[0] * result.transform.width / support.canvas[0],
      result.transform.top + support.point[1] * result.transform.height / support.canvas[1]];
    item.report.processing = cutouts[i].processing;
    if (sources[i].review.clearNeutralResizeFringe) {
      const { data, info: { width, height } } = await sharp(item.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let removed = 0;
      for (let at = 0; at < data.length; at += 4) if (data[at + 3] > 0 && data[at + 3] < 128
        && Math.min(data[at], data[at + 1], data[at + 2]) >= 210
        && Math.max(data[at], data[at + 1], data[at + 2]) - Math.min(data[at], data[at + 1], data[at + 2]) <= 50) {
        data.fill(0, at, at + 4); removed++;
      }
      item.buffer = await png(data, width, height); item.previews = await alphaPreviews(item.buffer);
      item.report.processing.resizeFringe = { method: 'reviewed-neutral-low-alpha-resize-ringing-removal',
        alphaBelow: 128, minRgb: 210, chromaMax: 50, removedPixels: removed,
        physicalWhitePigment: sources[i].id === 'infection.source' ? 'none in this purple capsule' : 'opaque warm-cream pigment retained; only neutral low-alpha background ringing removed' };
    }
    if (i === 1 && sources[0].id === 'lung.airway.closed') {
      const base = (await sharp(result.results[0].buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
      const { data, info: { width, height } } = await sharp(item.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ellipse = { cx: result.transform.left + 516, cy: result.transform.top + 501.5, rx: 242.5, ry: 195 };
      let correctedPixels = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (Math.hypot((x - ellipse.cx) / ellipse.rx, (y - ellipse.cy) / ellipse.ry) <= 1.02) continue;
        const at = (y * width + x) * 4;
        if ([0,1,2,3].some(c => data[at + c] !== base[at + c])) { base.copy(data, at, at, at + 4); correctedPixels++; }
      }
      item.buffer = await png(data, width, height); item.previews = await alphaPreviews(item.buffer);
      item.report.processing.sharedBase.finalFixedFrame = { correctedResamplingRoundingPixels: correctedPixels,
        copiedFrom: 'closed output outside reviewed interior ellipse', ellipse, outsideEllipseFactor: 1.02 };
    }
    item.report.registration = { transform: result.transform, support,
      actualSupportLogical: logical, declaredAnchorLogical: [512, 870.4],
      anchorResidualLogicalPx: [logical[0] - 512, logical[1] - 870.4],
      sameFullSourceScale: true, perStateAlphaHeightNormalization: false, physicalGroundContactApproval: false };
    records.push(await save(item, sources[i]));
  }
  if (records.length > 1) {
    const overlay = await halfOverlay(result.results[0].buffer, result.results[1].buffer);
    const path = outputPath(`qa/${sources[0].id.replace(/\.[^.]+$/, '')}.pair.overlay50.png`);
    await writeFile(path, overlay);
    for (const record of records) record.qaPaths.push(slash(relative(pack, path)));
  }
  return records;
}

async function processGrounds(sources) {
  const quadrants = [];
  for (const source of sources) {
    const meta = await sharp(source.input).metadata(), side = Math.min(meta.width, meta.height, 1024);
    const crop = source.review.crop ?? { left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side };
    const buffer = await sharp(source.input).extract(crop).removeAlpha().resize(512, 512).png().toBuffer();
    quadrants.push({ source, crop, buffer });
  }
  const healthy = await makeSeamlessGround(quadrants[0].buffer, { contrast: 1, saturation: 1 });
  healthy.report.processing.sourceCrop = quadrants[0].crop;
  healthy.report.processing.paletteAdjustment = false;
  const records = [await save(healthy, sources[0], { registration: { state: 'shared-base-coordinate-origin', coordinateDelta: [0, 0], worldPlane: true, yPrecompression: false } })];
  if (sources.length > 1) {
    const hq = quadrants[0].buffer, iq = quadrants[1].buffer;
    const [hs, is] = await Promise.all([sharp(hq).stats(), sharp(iq).stats()]);
    const [h, ir, blur] = await Promise.all([sharp(hq).raw().toBuffer(), sharp(iq).raw().toBuffer(), sharp(iq).blur(6).raw().toBuffer()]);
    const meanH = hs.channels.map(c => c.mean), meanI = is.channels.map(c => c.mean);
    const gains = hs.channels.map((c, i) => Math.min(1, is.channels[i].stdev / Math.max(c.stdev, 1e-6))), data = Buffer.alloc(h.length);
    for (let p = 0; p < 512 * 512; p++) { const j = p * 3;
      const residual = .2126 * (ir[j] - blur[j]) + .7152 * (ir[j + 1] - blur[j + 1]) + .0722 * (ir[j + 2] - blur[j + 2]);
      const detail = Math.max(-3, Math.min(3, residual * .12));
      for (let c = 0; c < 3; c++) data[j + c] = Math.round(Math.max(0, Math.min(255, meanI[c] + (h[j + c] - meanH[c]) * gains[c] + detail)));
    }
    const infected = await makeSeamlessGround(await png(data, 512, 512, 3), { contrast: 1, saturation: 1 });
    infected.report.processing = { method: 'shared-healthy-base-sampled-infected-material-and-weak-fungal-residual',
      aiOutputsClaimedPixelRegistered: false, baseRawSha256: sources[0].sha256, materialRawSha256: sources[1].sha256,
      healthyCrop: quadrants[0].crop, infectedCrop: quadrants[1].crop, meanH, meanI, gains,
      formula: 'Imean + (Hpixel-Hmean)*min(1,Istd/Hstd) + clamp(.12*(I_luma-blur6(I_luma)),-3,3)',
      oldArtToneUsed: false, sourceCoordinateDelta: [0, 0], contrast: 1, saturation: 1,
      limitation: 'Paired output uses the exact healthy tissue coordinate base; strong infection shape comes from separate fungal overlays and scenery states.' };
    records.push(await save(infected, sources[1], { registration: { state: 'algorithmically-shared-base', coordinateDelta: [0, 0], worldPlane: true, yPrecompression: false } }));
    const overlay = await halfOverlay(healthy.buffer, infected.buffer), base = sources[0].id.replace(/\.[^.]+$/, '');
    const overlayPath = outputPath(`qa/${base}.pair.overlay50.png`), tiledPath = outputPath(`qa/${base}.pair.overlay50.3x3.png`);
    await writeFile(overlayPath, overlay); await writeFile(tiledPath, await tiledPreview(overlay));
    for (const record of records) record.qaPaths.push(...[overlayPath, tiledPath].map(path => slash(relative(pack, path))));
  }
  return records;
}

export async function processBatch(selected = IDS) {
  for (const id of selected) if (!IDS.includes(id)) throw new Error(`ID is not owned by batch03: ${id}`);
  const registry = JSON.parse(await readFile(join(production, 'runs.json'), 'utf8')), pending = [], produced = [];
  for (const ids of GROUPS) {
    if (!ids.some(id => selected.includes(id))) continue;
    const sources = await Promise.all(ids.map(id => raw(id, registry)));
    if (sources.some(source => !source || !source.reviewed)) {
      if (selected.includes(ids[0]) && !selected.includes(ids[1]) && sources[0]?.reviewed) {
        const records = ids[0].startsWith('lung.ground') ? await processGrounds([sources[0]]) : await processObjects([sources[0]]);
        for (const record of records) record.registration = { ...record.registration, pairState: 'baseline-ready-awaiting-paired-source' };
        produced.push(...records);
      }
      pending.push(...ids.map((id, i) => ({ id, state: !sources[i] ? 'awaiting-raw' : !sources[i].reviewed ? 'awaiting-source-review' : 'awaiting-pair' })));
      continue;
    }
    const records = ids[0].startsWith('lung.ground') ? await processGrounds(sources) : await processObjects(sources);
    produced.push(...records);
  }
  const fragmentPath = outputPath('fragment/batch03.json');
  let existing = { schemaVersion: 1, entries: [] };
  try { existing = JSON.parse(await readFile(fragmentPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const merged = new Map((existing.entries ?? []).map(entry => [entry.id, entry]));
  for (const record of produced) merged.set(record.id, record);
  const fragment = { schemaVersion: 1, scope: 'facilities-and-lung-P1', entries: [...merged.values()], pending,
    visualApproval: false, deliveryModified: false, referencesModified: false };
  if (produced.length) await atomicJson(fragmentPath, fragment);
  return { produced: produced.map(record => ({ id: record.id, outputPath: record.outputPath, sha256: record.outputSha256,
    alpha: record.image.alpha, anchorResidual: record.registration?.anchorResidualLogicalPx })), pending,
    fragmentPath: produced.length || existing.entries?.length ? slash(relative(pack, fragmentPath)) : null, deliveryModified: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.includes('--help')) console.log('Usage: node production/process-batch03.mjs [owned.id ...]\nOnly sources explicitly reviewed in REVIEWS are processed. No polling, generation, delivery/final writes, or reference changes.');
  else processBatch(process.argv.slice(2).length ? process.argv.slice(2) : IDS).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`Batch03 processing stopped: ${error.message}`); process.exitCode = 1; });
}
