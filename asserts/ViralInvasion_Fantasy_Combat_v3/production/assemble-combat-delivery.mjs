/**
 * Read-only image audit + Combat v3 manifest assembly.
 * Run only after source processing and 72 animation frames are complete:
 *   node asserts/ViralInvasion_Fantasy_Combat_v3/production/assemble-combat-delivery.mjs
 * Writes JSON/Markdown only inside Combat_v3. Never edits image pixels or shared selection.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUCTION = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(PRODUCTION), REPO = resolve(ROOT, '../..');
const MIB = 1024 ** 2;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.replaceAll('\\', '/');
const rootPath = file => slash(relative(ROOT, file));
const repoPath = file => slash(relative(REPO, file));
const samePair = (a, b, tolerance = 1e-6) => Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
  && a.every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]) <= tolerance);
const pair = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value.x, value.y] : null;
const arrayOf = (value, field) => Array.isArray(value) ? value : Array.isArray(value?.[field]) ? value[field] : [];

async function guarded(path) {
  const absolute = resolve(ROOT, path), rel = relative(ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path must stay inside Combat_v3: ' + path);
  let cursor = absolute;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Refusing symlink/junction path: ' + path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === ROOT) break;
    cursor = dirname(cursor);
  }
  return absolute;
}
async function json(path) {
  return JSON.parse((await readFile(await guarded(path), 'utf8')).replace(/^\uFEFF/, ''));
}
async function optionalJson(path, fallback) {
  try { return await json(path); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function writeOutput(path, value) {
  const absolute = await guarded(path), temp = await guarded(path + '.' + randomUUID() + '.tmp');
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, absolute);
}
function assetFile(path) {
  if (typeof path !== 'string' || !path) throw new Error('Asset path is required');
  return resolve(ROOT, path.startsWith('asserts/') ? relative(ROOT, resolve(REPO, path)) : path);
}

async function inspect(path, sampleSize, measurementRegion) {
  const absolute = await guarded(assetFile(path));
  const buffer = await readFile(absolute), metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (measurementRegion && (!Array.isArray(measurementRegion) || measurementRegion.length !== 4
    || measurementRegion.some(value => !Number.isInteger(value)) || measurementRegion[0] < 0 || measurementRegion[1] < 0
    || measurementRegion[2] <= 0 || measurementRegion[3] <= 0 || measurementRegion[0] + measurementRegion[2] > info.width
    || measurementRegion[1] + measurementRegion[3] > info.height)) throw new Error('Invalid alpha measurement region');
  let regionLeft = info.width, regionRight = -1, regionVisiblePixels = 0;
  let transparent = 0, partial = 0, opaque = 0, hiddenRgb = 0;
  const border = { top: 0, right: 0, bottom: 0, left: 0 };
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * 4, alpha = data[index + 3];
    if (alpha === 0) { transparent++; if (data[index] || data[index + 1] || data[index + 2]) hiddenRgb++; }
    else if (alpha === 255) opaque++; else partial++;
    if (alpha > 0) {
      if (y === 0) border.top++;
      if (x === 0) border.left++;
      if (x === info.width - 1) border.right++;
      if (y === info.height - 1) border.bottom++;
    }
    if (alpha < 8) continue;
    if (measurementRegion && x >= measurementRegion[0] && x < measurementRegion[0] + measurementRegion[2]
      && y >= measurementRegion[1] && y < measurementRegion[1] + measurementRegion[3]) {
      regionLeft = Math.min(regionLeft, x); regionRight = Math.max(regionRight, x); regionVisiblePixels++;
    }
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const sampled = sampleSize ? await sharp(buffer).resize(sampleSize, sampleSize, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toBuffer() : null;
  return {
    path: rootPath(absolute), repositoryPath: repoPath(absolute), sha256: sha256(buffer), bytes: buffer.length,
    dimensions: [metadata.width, metadata.height], format: metadata.format, channels: metadata.channels,
    hasAlphaChannel: metadata.hasAlpha === true, paletteEncoded: metadata.isPalette === true,
    alpha: { transparent, partial, opaque, visible: partial + opaque, transparentFraction: transparent / (info.width * info.height),
      hiddenRgb, borderVisible: Object.values(border).reduce((sum, value) => sum + value, 0), border },
    bbox: right < 0 ? null : [left, top, right + 1, bottom + 1],
    rawPixelSha256: sha256(data),
    measuredRegion: measurementRegion ? { rect: measurementRegion, alphaThreshold: 8,
      left: regionRight < 0 ? null : regionLeft, rightInclusive: regionRight < 0 ? null : regionRight,
      visiblePixels: regionVisiblePixels, alphaWidthPx: regionRight < 0 ? 0 : regionRight - regionLeft + 1 } : null,
    sampledRuntime: sampled ? { dimensions: [sampleSize, sampleSize], pngBytes: sampled.length, sha256: sha256(sampled),
      method: 'full-canvas Lanczos3 resize and PNG level-9 encode in memory; no sampled file written' } : null,
  };
}

function makeExpected(contract) {
  const assets = [], clips = [];
  for (const entity of contract.entities) for (const direction of entity.directions) for (const [state, count] of Object.entries(entity.states)) {
    const name = `${entity.idPrefix}.${direction}.${state}`, ids = [];
    for (let index = 0; index < count; index++) {
      const id = `${name}.${String(index).padStart(2, '0')}`;
      ids.push(id); assets.push({ id, entity: entity.key, direction, state, frameIndex: index, frameCount: count,
        path: `${entity.key}/${direction}/${state}/${String(index).padStart(2, '0')}.png`, contract: entity });
    }
    clips.push({ name: `${entity.key}.${direction}.${state}`, ids, entity: entity.key, direction, state, frameCount: count });
  }
  return { assets, clips };
}

function runEntries(document) {
  const entries = Array.isArray(document.runs) ? document.runs.map((value, i) => [String(i), value]) : Object.entries(document.runs ?? {});
  return entries.map(([key, value]) => ({ key, ...value }));
}
function fullPrompt(source, sourceSpec, run, frame) {
  return sourceSpec?.prompt || source?.prompt || frame?.prompt || run?.prompt || null;
}
function mappedGround(source) {
  const registration = source.registration ?? {}, point = pair(source.sourceGround);
  const matrix = registration.matrixCroppedToRegistered;
  if (!point || !Array.isArray(matrix) || matrix.length < 2 || !Array.isArray(matrix[0]) || !Array.isArray(matrix[1])) return null;
  return [matrix[0][0] * point[0] + matrix[0][1] * point[1] + matrix[0][2],
    matrix[1][0] * point[0] + matrix[1][1] * point[1] + matrix[1][2]];
}

export async function assembleCombatDelivery() {
  const [contract, runsDocument, sourceSpec, processing, fragment, selectionDocument, sourceVisualReview] = await Promise.all([
    json('production/asset-contract.json'), json('production/runs.json'), json('production/source-spec.json'),
    json('production/source-processing.json'), json('production/animation-fragment.json'),
    optionalJson('production/candidate-selection.json', { candidates: [] }),
    optionalJson('production/source-visual-review.json', null),
  ]);
  const expected = makeExpected(contract), runs = runEntries(runsDocument);
  const frames = arrayOf(fragment, 'assets'), fragmentClips = arrayOf(fragment, 'clips');
  const sources = arrayOf(processing, 'sources'), specSources = arrayOf(sourceSpec, 'sources');
  const errors = [], warnings = [], checks = [], sourceMasters = [], assets = [], animationGroups = [];
  const record = (name, pass, details) => { checks.push({ name, pass, ...details }); if (!pass) errors.push({ name, ...details }); return pass; };
  const sourceById = new Map(sources.map(source => [source.key, source]));
  const specById = new Map(specSources.map(source => [source.key, source]));
  const runById = new Map(runs.map(run => [run.runId, run]));
  const frameById = new Map(frames.map(frame => [frame.id, frame]));
  const expectedById = new Map(expected.assets.map(frame => [frame.id, frame]));
  const inspectedById = new Map();
  record('contract-runtime-count', expected.assets.length === contract.expectedRuntimeCount && expected.assets.length === 72,
    { derived: expected.assets.length, declared: contract.expectedRuntimeCount, required: 72 });
  record('animation-group-count', expected.clips.length === 26, { derived: expected.clips.length, required: 26 });
  record('runtime-count', frames.length === expected.assets.length, { actual: frames.length, expected: expected.assets.length });
  record('unique-runtime-ids', frameById.size === frames.length, { actual: frames.length, unique: frameById.size });
  record('unique-runtime-paths', new Set(frames.map(frame => slash(frame.path ?? ''))).size === frames.length, { actual: frames.length });
  record('unique-source-keys', sourceById.size === sources.length, { actual: sources.length, unique: sourceById.size });
  for (const frame of frames) record('known-runtime-id', expectedById.has(frame.id), { id: frame.id });

  for (const source of sources) {
    const key = source.key, spec = specById.get(key), run = runById.get(source.runId);
    try {
      const image = await inspect(source.output?.path), registered = source.registration ?? {};
      const rawAbsolute = await guarded(assetFile(source.raw?.path ?? spec?.rawPath));
      const rawBuffer = await readFile(rawAbsolute), rawSha256 = sha256(rawBuffer);
      const ground = mappedGround(source);
      const sourceChecks = {
        actualRgbaPng: image.format === 'png' && image.channels === 4 && image.hasAlphaChannel,
        canvasMatches: samePair(image.dimensions, contract.canvas),
        visibleSubjectAndTransparentBackground: image.alpha.visible > 0 && image.alpha.transparent > 0,
        allFourBordersTransparent: Object.values(image.alpha.border).every(value => value === 0),
        outputShaMatches: image.sha256 === source.output?.sha256,
        rawShaMatches: rawSha256 === source.raw?.sha256,
        registeredCanvasMatches: samePair(pair(registered.targetCanvas), contract.canvas),
        targetFootMatches: samePair(pair(registered.targetGround), contract.foot),
        sourceGroundMapsToFoot: samePair(ground, contract.foot, 1e-4),
        pivotMatches: samePair(pair(registered.pivot), contract.pivot),
        noTrim: registered.trim === false,
        sourceSpecPresent: !!spec, runPresent: !!run, generationSucceeded: run?.status === 'succeeded',
        fullPromptPresent: typeof fullPrompt(source, spec, run) === 'string' && fullPrompt(source, spec, run).length > 0,
      };
      record('source-self-checks', Object.values(sourceChecks).every(Boolean), { sourceId: key, checks: sourceChecks });
      if (image.alpha.hiddenRgb > 0) warnings.push({ name: 'source-hidden-rgb', sourceId: key, pixels: image.alpha.hiddenRgb });
      sourceMasters.push({ id: key, kind: 'registered-source-master', runtime: false, runtimeFrameCredit: 0,
        ...image, runId: source.runId, prompt: fullPrompt(source, spec, run),
        candidateStatus: spec?.candidateStatus ?? 'selected-by-producer-for-action-baking', approved: false, approvalStatus: 'pending-main-renderer-review',
        raw: { path: rootPath(rawAbsolute), repositoryPath: repoPath(rawAbsolute), sha256: rawSha256, bytes: rawBuffer.length },
        processing: { crop: source.crop, sourceGround: source.sourceGround, sourceGroundOriginal: source.sourceGroundOriginal,
          groundMethod: source.groundMethod, transparency: source.transparency, registration: registered,
          method: 'Maliang source; reviewed background removal if required; uniform full-source scale and ground translation' },
        mappedSourceGround: ground, sourceSpec: spec, selfChecks: sourceChecks, qa: source.qa,
        producerVisualReview: sourceVisualReview?.sources?.find(review => review.key === key) ?? null,
      });
    } catch (error) { record('source-readable', false, { sourceId: key, message: error.message }); }
  }
  const inspectedSources = new Map(sourceMasters.map(source => [source.id, source]));

  for (const expectedFrame of expected.assets) {
    const frame = frameById.get(expectedFrame.id), entity = expectedFrame.contract;
    if (!frame) { record('required-frame-present', false, { id: expectedFrame.id }); continue; }
    try {
      const sourceId = frame.sourceId ?? `${expectedFrame.entity}/${expectedFrame.direction}`;
      const source = sourceById.get(sourceId), inspectedSource = inspectedSources.get(sourceId);
      const runId = frame.runId ?? source?.runId, run = runById.get(runId), spec = specById.get(sourceId);
      const image = await inspect(frame.path, entity.recommendedRuntimeTexture, frame.groundFootprint?.baseRegionPx);
      const foot = pair(frame.foot ?? frame.registration?.foot), pivot = pair(frame.pivot);
      const animationGroup = `${expectedFrame.entity}.${expectedFrame.direction}.${expectedFrame.state}`;
      const expectedWorldWidth = entity.worldLogicalCanvasWidth ?? ({ slimeMage: 105.6, nestBuilder: 105.6,
        swiftLarva: 57.6, miniNest: 117.6, immuneCannon: 122 })[expectedFrame.entity];
      const groundFootprint = frame.groundFootprint ? { ...frame.groundFootprint,
        measuredBaseAlphaWidthPx: image.measuredRegion?.alphaWidthPx,
        recomputedWorldDiameter: frame.worldLogicalCanvasWidth * (image.measuredRegion?.alphaWidthPx ?? NaN) / contract.canvas[0] } : null;
      const frameChecks = {
        expectedPath: image.path === expectedFrame.path,
        identityAndState: frame.entity === expectedFrame.entity && frame.direction === expectedFrame.direction
          && frame.state === expectedFrame.state && frame.frameIndex === expectedFrame.frameIndex,
        actualRgbaPng: image.format === 'png' && image.channels === 4 && image.hasAlphaChannel,
        canvasMatches: samePair(image.dimensions, contract.canvas),
        transparentBackground: image.alpha.transparent > 0 && image.alpha.visible > 0,
        allFourBordersTransparent: Object.values(image.alpha.border).every(value => value === 0),
        fragmentShaMatches: typeof frame.sha256 === 'string' && image.sha256 === frame.sha256,
        pivotMatches: samePair(pivot, contract.pivot), registeredFootMatches: samePair(foot, contract.foot),
        registrationGroupMatches: frame.registrationGroup === sourceId,
        sourcePresentAndAudited: !!source && !!inspectedSource,
        runMatchesSource: !!run && runId === source?.runId,
        sourceHashLinkMatches: frame.sourceProcessing?.sourceSha256 === inspectedSource?.sha256
          && frame.sourceProcessing?.rawSha256 === inspectedSource?.raw.sha256,
        actorRegistrationMatches: samePair(pair(frame.actorRegistration?.canvas), contract.canvas)
          && samePair(pair(frame.actorRegistration?.foot), contract.foot) && frame.actorRegistration?.commonCanvasScale === 1,
        animationMetadataMatches: frame.animation?.group === animationGroup && frame.animation?.index === expectedFrame.frameIndex
          && frame.animation?.frameCount === expectedFrame.frameCount && Number.isFinite(frame.animation?.fps) && frame.animation.fps > 0,
        worldLogicalCanvasWidthMatches: Math.abs(frame.worldLogicalCanvasWidth - expectedWorldWidth) < 1e-6,
        cannonFootprintWithinLimit: expectedFrame.entity !== 'immuneCannon' || !!groundFootprint
          && Number.isFinite(groundFootprint.recomputedWorldDiameter) && groundFootprint.recomputedWorldDiameter <= 80
          && groundFootprint.baseAlphaWidthPx > 0 && groundFootprint.baseAlphaWidthPx === groundFootprint.measuredBaseAlphaWidthPx
          && groundFootprint.alphaThreshold === 8,
        fullPromptPresent: typeof fullPrompt(source, spec, run, frame) === 'string' && fullPrompt(source, spec, run, frame).length > 0,
      };
      record('frame-self-checks', Object.values(frameChecks).every(Boolean), { id: frame.id, checks: frameChecks });
      if (image.alpha.hiddenRgb > 0) warnings.push({ name: 'frame-hidden-rgb', id: frame.id, pixels: image.alpha.hiddenRgb,
        alphaValue: 0, paletteEncoded: image.paletteEncoded, severity: 'informational',
        interpretation: 'These counted RGB values occur only at alpha exactly 0. Palette PNG transparent entries may carry nonzero RGB; no reviewed PNG rewrite is required. Main Renderer edge/filtering review remains pending.' });
      const asset = { id: frame.id, runtime: true, kind: 'combat-animation-frame', ...image,
        entity: expectedFrame.entity, direction: expectedFrame.direction, state: expectedFrame.state,
        frameIndex: expectedFrame.frameIndex, frameCount: expectedFrame.frameCount, pivot: contract.pivot, foot: contract.foot,
        animation: frame.animation, actorRegistration: frame.actorRegistration,
        worldLogicalCanvasWidth: frame.worldLogicalCanvasWidth, groundFootprint,
        visibleBboxWorldHeight: image.bbox && Number.isFinite(frame.worldLogicalCanvasWidth)
          ? (image.bbox[3] - image.bbox[1]) * frame.worldLogicalCanvasWidth / contract.canvas[0] : null,
        trim: false, alphaMode: 'straight', suggestedVisibleWorldHeight: entity.suggestedVisibleWorldHeight,
        groundWorldDiameterMax: entity.groundWorldDiameterMax, recommendedRuntimeTexture: entity.recommendedRuntimeTexture,
        registration: { group: sourceId, sameCanvas: true, sharedSourceScaleGroup: expectedFrame.entity,
          perFrameFitAllowed: false, independentAlphaRecropAllowed: false, sourceFoot: source?.sourceGround,
          sourceToRegistered: source?.registration?.matrixCroppedToRegistered },
        runId, prompt: fullPrompt(source, spec, run, frame),
        source: inspectedSource ? { id: sourceId, path: inspectedSource.path, repositoryPath: inspectedSource.repositoryPath,
          sha256: inspectedSource.sha256, rawPath: inspectedSource.raw.path, rawSha256: inspectedSource.raw.sha256, runId,
          processingRecord: 'production/source-processing.json', processing: inspectedSource.processing } : { id: sourceId },
        method: frame.method ?? contract.sourceMethod, deformation: frame.deformation ?? null,
        sourceProcessing: frame.sourceProcessing ?? source?.transparency ?? null,
        candidateStatus: 'selected-by-producer-pending-main-renderer-review', approved: false,
        approvalStatus: 'pending-main-renderer-review', producerFrameStatus: frame.status ?? null,
        selfChecks: frameChecks };
      assets.push(asset); inspectedById.set(asset.id, asset);
    } catch (error) { record('frame-readable', false, { id: frame.id, message: error.message }); }
  }

  const clipsByName = new Map(fragmentClips.map(clip => [clip.name, clip]));
  record('unique-animation-group-names', clipsByName.size === fragmentClips.length, { actual: fragmentClips.length, unique: clipsByName.size });
  record('fragment-animation-group-count', fragmentClips.length === expected.clips.length, { actual: fragmentClips.length, expected: expected.clips.length });
  for (const expectedClip of expected.clips) {
    const clip = clipsByName.get(expectedClip.name);
    if (!clip) { record('required-animation-group-present', false, { name: expectedClip.name }); continue; }
    const members = expectedClip.ids.map(id => inspectedById.get(id)).filter(Boolean);
    const durations = clip.frameDurationsMs;
    const uniquePixels = new Set(members.map(asset => asset.rawPixelSha256)).size;
    const clipChecks = {
      idsMatchContract: JSON.stringify(clip.ids) === JSON.stringify(expectedClip.ids),
      allFramesAudited: members.length === expectedClip.frameCount,
      durationsMatch: Array.isArray(durations) && durations.length === expectedClip.frameCount
        && durations.every(duration => Number.isFinite(duration) && duration > 0),
      loopDeclared: typeof clip.loop === 'boolean',
      notAllIdenticalPixels: uniquePixels > 1,
      sharedFootAndPivot: members.every(member => samePair(member.foot, contract.foot) && samePair(member.pivot, contract.pivot)),
      sharedRegisteredCanvas: members.every(member => samePair(member.dimensions, contract.canvas)),
      sharedSource: new Set(members.map(member => member.source.id)).size === 1,
      frameAnimationMetadataMatchesTiming: Array.isArray(durations) && members.every((member, index) =>
        Math.abs(member.animation?.fps - 1000 / durations[index]) < 1e-6),
    };
    record('animation-group-self-checks', Object.values(clipChecks).every(Boolean), { name: expectedClip.name, checks: clipChecks });
    if (uniquePixels < members.length) warnings.push({ name: 'animation-has-repeated-pixel-frame', group: expectedClip.name, uniquePixels, frames: members.length });
    animationGroups.push({ ...expectedClip, ids: expectedClip.ids, frameDurationsMs: durations,
      durationMs: Array.isArray(durations) ? durations.reduce((sum, value) => sum + value, 0) : null,
      timingAuthority: 'frameDurationsMs', loop: clip.loop, kind: clip.kind ?? 'baked-action-sequence',
      uniquePixelFrames: uniquePixels, qa: clip.qa ?? null, method: contract.sourceMethod,
      candidateStatus: 'selected-by-producer-pending-main-renderer-review', approved: false,
      approvalStatus: 'pending-main-renderer-review', selfChecks: clipChecks });
  }

  const runtimeSourceBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const sampledPngBytes = assets.reduce((sum, asset) => sum + asset.sampledRuntime.pngBytes, 0);
  // The renderer atlas/package is assembled by main. Include conservative overhead instead of claiming its final bytes.
  const encodedAtlasEstimateBytes = Math.ceil(sampledPngBytes * 4 / 3 * 1.2) + 256 * 1024;
  const existingApproxMiB = contract.runtimeBudget.existingApproxMiB;
  const estimatedTotalMiB = existingApproxMiB + encodedAtlasEstimateBytes / MIB;
  const budget = { limitMiB: contract.runtimeBudget.totalMiB, existingApproxMiB,
    runtimeSourcePngBytes: runtimeSourceBytes, sampledRuntimePngBytes: sampledPngBytes,
    sampledPngMiB: sampledPngBytes / MIB, estimatedEncodedAtlasAndMetadataBytes: encodedAtlasEstimateBytes,
    estimatedTotalMiB, pass: estimatedTotalMiB < contract.runtimeBudget.totalMiB,
    method: 'actual in-memory full-canvas sampled PNG sizes, multiplied by 4/3 base64 and 1.2 packing allowance, plus 256KiB metadata; existing 9.61MiB is user-provided approximate baseline',
    finalPackageMeasurement: 'pending-main-build', sourcesRawQaAndHistoryCountTowardRuntime: false };
  record('sampled-runtime-budget', budget.pass, { estimatedTotalMiB, limitMiB: budget.limitMiB });
  record('all-required-runtime-images-audited', assets.length === expected.assets.length, { actual: assets.length, required: expected.assets.length });

  const generatedAt = new Date().toISOString();
  const audit = { schemaVersion: 1, scope: 'Combat_v3-only-read-only-image-audit', generatedAt,
    status: errors.length ? 'failed' : 'passed-producer-technical-checks-pending-main-visual-review',
    expectedRuntimeCount: expected.assets.length, actualRuntimeCount: assets.length,
    expectedAnimationGroups: expected.clips.length, actualAnimationGroups: animationGroups.length,
    imageWrites: 0, originalFrozenImagesReadOrWritten: false,
    imageHashAuthority: 'fresh file bytes; rawPixelSha256 detects visually identical encoded variants',
    footVerification: 'source annotated ground transformed through recorded affine matrix and frame foot/pivot/canvas metadata checked; actual natural-motion contact review remains with main Renderer',
    runtimeBudget: budget, errorCount: errors.length, warningCount: warnings.length, errors, warnings, checks,
    warningInterpretation: { hiddenRgbDefinition: 'RGB is nonzero while alpha is exactly 0; these pixels are fully transparent.',
      frameHiddenRgbCount: warnings.filter(warning => warning.name === 'frame-hidden-rgb').length,
      paletteEncodedFrameHiddenRgbCount: warnings.filter(warning => warning.name === 'frame-hidden-rgb' && warning.paletteEncoded).length,
      category: 'transparent-palette-index-advisory', reviewedPngRewriteRequired: false,
      actualTransparencyFailures: errors.filter(error => error.name === 'frame-self-checks'
        && (!error.checks.transparentBackground || !error.checks.allFourBordersTransparent)).length,
      remainingReview: 'Main Renderer must inspect edges and filtering at actual normal/low runtime sampling. Producer inspected actual source and runtime contact images; no visible ground shadow was reported.' },
    visualReview: { status: 'pending-main-renderer-review', approved: false,
      required: ['actual Renderer at normal/low resolution', 'black/white alpha edges', 'front/back turn consistency',
        'foot contact and state transitions', 'no baked background/UI/range circles/projectiles/people', 'cannon footprint at most 80 world units'] } };
  const selectedSourceIds = new Set(assets.map(asset => asset.source.id));
  const candidates = [];
  for (const candidate of [...arrayOf(selectionDocument, 'candidates'), ...arrayOf(sourceSpec, 'candidates')]) {
    let raw = null;
    if (candidate.rawPath) {
      try {
        const file = await guarded(assetFile(candidate.rawPath)), bytes = await readFile(file);
        raw = { path: rootPath(file), repositoryPath: repoPath(file), bytes: bytes.length, sha256: sha256(bytes) };
        record('candidate-raw-sha', !candidate.sha256 || raw.sha256 === candidate.sha256,
          { entity: candidate.entity, runId: candidate.runId, sha256: raw.sha256 });
      } catch (error) { record('candidate-raw-readable', false, { entity: candidate.entity, runId: candidate.runId, message: error.message }); }
    }
    candidates.push({ ...candidate, raw, runtime: false, runtimeFrameCredit: 0,
      candidateStatus: 'producer-selection-recorded-pending-main-renderer-review',
      approved: false, approvalStatus: 'producer-selection-only-not-user-approval' });
  }
  audit.status = errors.length ? 'failed' : 'passed-producer-technical-checks-pending-main-visual-review';
  audit.errorCount = errors.length; audit.warningCount = warnings.length;
  const visualReviewRecordPath = sourceVisualReview ? await guarded('production/source-visual-review.json') : null;
  const producerVisualReview = { scope: 'producer inspection evidence only; main Renderer approval remains pending',
    mainRendererApproval: false,
    sourceRecord: sourceVisualReview ? { path: 'production/source-visual-review.json', repositoryPath: repoPath(visualReviewRecordPath),
      sha256: sha256(await readFile(visualReviewRecordPath)), ...sourceVisualReview,
      currentSourceCoverage: sourceMasters.map(source => { const review = sourceVisualReview.sources?.find(item => item.key === source.id);
        return { sourceId: source.id, reviewed: review?.reviewed === true, reviewPath: review?.path ?? null,
          sourceSha256: source.sha256, recordedReviewSha256: review?.sha256 ?? null, currentPixelsMatchReview: review?.sha256 === source.sha256 }; }) } : null,
    animationRecord: { path: 'production/animation-fragment.json', status: fragment.status,
      qaOverview: fragment.qaOverview ?? null,
      clips: fragmentClips.map(clip => ({ name: clip.name, ids: clip.ids,
        actualVisualReview: clip.qa?.actualVisualReview ?? null, motionAmplitude: clip.qa?.motionAmplitude ?? null })) },
    transparencyAdvisory: audit.warningInterpretation };
  const delivery = { schemaVersion: 1, version: contract.version, theme: contract.root, generatedAt,
    status: errors.length ? 'technical-audit-failed-not-ready-for-integration' : 'producer-delivery-ready-for-main-renderer-review',
    expectedRuntimeCount: expected.assets.length, completedRuntimeCount: assets.length,
    expectedAnimationGroupCount: expected.clips.length, completedAnimationGroupCount: animationGroups.length,
    approvedRuntimeCount: 0, samplesCountAsRuntimeFrames: false, runtimeIntegrationPerformed: false,
    contract, productionMethod: contract.sourceMethod,
    approvalBoundary: 'All selection decisions are producer decisions. Main Renderer visual review and integration are pending; no user or main approval is asserted.',
    references: { assetContract: 'production/asset-contract.json', sourceRecords: 'production/runs.json',
      sourceSpec: 'production/source-spec.json', sourceProcessing: 'production/source-processing.json',
      animationFragment: 'production/animation-fragment.json', sourceVisualReview: sourceVisualReview ? 'production/source-visual-review.json' : null,
      audit: 'production/delivery-audit.json' },
    producerVisualReview,
    sourceMasters: sourceMasters.map(source => ({ ...source, usedByRuntime: selectedSourceIds.has(source.id) })),
    candidates, candidateNotes: { cannonStatus: selectionDocument.cannonStatus ?? null,
      rejectedCandidatesRetained: true, selectionAuthority: 'producer-only' }, assets, animationGroups, runtimeBudget: budget,
    sourceRuns: runs.map(run => ({ key: run.key, runId: run.runId, status: run.status,
      canvas: run.canvas, prompt: run.prompt, referenceNodes: run.referenceNodes, followUpNodes: run.followUpNodes,
      candidateStatus: selectedSourceIds.size && sourceMasters.some(source => source.runId === run.runId) ? 'used-by-selected-source' : 'recorded-candidate-run' })),
    selfCheck: { status: audit.status, errorCount: errors.length, warningCount: warnings.length,
      warningInterpretation: audit.warningInterpretation },
    writeBoundary: { allowedRoot: 'asserts/ViralInvasion_Fantasy_Combat_v3/', frozenPriorArtChanged: false,
      codeChanged: false, sharedArtSelectionChanged: false } };
  await writeOutput('delivery.json', delivery);
  await writeOutput('production/delivery-audit.json', audit);
  await writeOutput('HANDOFF.md', handoff(delivery, audit));
  return { status: audit.status, delivery: repoPath(join(ROOT, 'delivery.json')), audit: repoPath(join(PRODUCTION, 'delivery-audit.json')),
    runtimeFrames: assets.length, animationGroups: animationGroups.length, errors: errors.length, warnings: warnings.length,
    estimatedTotalMiB, approvedRuntimeCount: 0 };
}

function handoff(delivery, audit) {
  const advisory = audit.warningInterpretation;
  const paletteCount = advisory.paletteEncodedFrameHiddenRgbCount, count = advisory.frameHiddenRgbCount;
  const alphaNote = count === paletteCount
    ? `原始 ${count} 条 frame-hidden-rgb 告警全部保留，它们属于同一类调色盘透明索引提示：这些像素的真实 alpha 均为 0，仅全透明色项携带非零 RGB，不会作为可见地影绘出。`
    : `原始 ${count} 条 frame-hidden-rgb 告警全部保留，其中 ${paletteCount} 条对应调色盘 PNG；这些计数像素的真实 alpha 均为 0，仅全透明像素携带非零 RGB。`;
  const sourceCoverage = delivery.producerVisualReview.sourceRecord?.currentSourceCoverage ?? [];
  const reviewedSourceCount = sourceCoverage.filter(source => source.reviewed && source.currentPixelsMatchReview).length;
  const reviewedClipCount = delivery.producerVisualReview.animationRecord.clips.filter(clip => clip.actualVisualReview?.allFramesActuallyViewed).length;
  const reviewNote = `制作端实图审查依据已纳入 delivery.json：production/source-visual-review.json 覆盖当前 ${reviewedSourceCount}/${delivery.sourceMasters.length} 个源方向并匹配源 SHA；animation-fragment.json 的实际联系图审查记录覆盖 ${reviewedClipCount}/${delivery.animationGroups.length} 个动画组，另附 all72.contact.png 总览及 SHA。制作端已查看实际源图与运行帧，未报告可见地影；这些记录不等于主会话 Renderer 批准，approvedRuntimeCount 保持 0。`;
  return basicHandoff(delivery, audit).replace('\n\n预算：', `\n\n${alphaNote} 不要求重写已审 PNG。主会话仍需在实际纹理采样与滤波下审查边缘，原告警数据诚实保留在 production/delivery-audit.json。\n\n${reviewNote}\n\n预算：`);
}

function basicHandoff(delivery, audit) {
  const rows = delivery.contract.entities.map(entity => `| ${entity.idPrefix} | ${entity.directions.join(', ')} | ${Object.entries(entity.states).map(([key, count]) => key + ' ' + count).join(' / ')} | ${entity.suggestedVisibleWorldHeight} | ${entity.recommendedRuntimeTexture} |`).join('\n');
  return `# 心脏攻防 v0.14 Combat v3 交付\n\n状态：${delivery.status}。技术审核错误 ${audit.errorCount}，告警 ${audit.warningCount}。当前 ${delivery.completedRuntimeCount}/72 帧、${delivery.completedAnimationGroupCount}/26 组；主会话 Renderer 最终实图审查及接入尚未完成，批准数为 0。\n\n| ID 前缀 | 真实绘制方向 | 状态帧数 | 建议世界可见高度 | 建议运行采样 |\n|---|---|---|---:|---:|\n${rows}\n\n每帧 ID 为“前缀.方向.状态.两位帧号”，完整 ID 与路径见 delivery.json。所有运行源图 512×512 RGBA，pivot=(.5,.85)，foot=(256,435.2)，trim=false。前右/后右分别成组，左向镜像；每组共享母图尺度和配准，不逐帧裁切或 fit。炮固定朝向，地面世界直径上限 80。\n\n真实方法：马良生成造型源图，制作端选候选、审查抠图并统一配准，再用本地分层/软体形变烘焙动作 PNG。没有宣称 AI 独立生成每一动画帧。来源 runId、完整中文提示词、raw/母图/每帧 SHA256、处理方法和 alpha 指标保存在 delivery.json；source 母图及候选均没有运行帧额度。selected/rejected 只代表制作端挑选，不代表用户批准。\n\nproduction/delivery-audit.json 重新读取实际 PNG，校验 SHA、512² RGBA、可见主体和透明背景、全四边透明、ID/路径唯一、72 帧/26 组合同、像素级非全重复、配准记录与源落脚变换。脚点像素接触、自然动作和画风仍需主会话实际 Renderer 审图。\n\n预算：原有约 ${delivery.runtimeBudget.existingApproxMiB.toFixed(2)} MiB；新图按建议尺寸在内存实际采样编码，含保守 base64/atlas/metadata 余量后预计总计 ${delivery.runtimeBudget.estimatedTotalMiB.toFixed(2)} / ${delivery.runtimeBudget.limitMiB} MiB。最终包体由主会话构建实测。源图、raw、QA 和历史不计入运行资源。\n\n主会话接入时请保留真实透明、源画布和 pivot，核对普通/低画质轮廓及状态切换；小母巢六卵囊由代码表现。设施图不含玩家、独立炮弹或 UI。所有本轮写入限定在 asserts/ViralInvasion_Fantasy_Combat_v3/，既有冻结图片、src/、共享 art-selection 均未修改。\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await assembleCombatDelivery();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.errors) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(error.stack + '\n'); process.exitCode = 1;
  }
}
