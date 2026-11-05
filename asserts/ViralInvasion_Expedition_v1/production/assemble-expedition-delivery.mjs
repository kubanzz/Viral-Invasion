/**
 * Read-only image audit and Expedition v1 delivery assembly. Never edits PNGs.
 * Default: complete 74-frame canonical delivery.json, or audit only on failure.
 * --phase p0: independent complete 50-frame delivery-p0.json; leaves canonical alone.
 * All input/output records and image reads are contained in Expedition_v1.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUCTION = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(PRODUCTION), REPO = resolve(ROOT, '../..');
const MIB = 1024 ** 2, hash = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const rootRelative = file => slash(relative(ROOT, file)), repositoryRelative = file => slash(relative(REPO, file));
const pair = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value.x, value.y] : null;
const equalPair = (a, b, tolerance = 1e-6) => Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
  && a.every((value, index) => Number.isFinite(value) && Math.abs(value - b[index]) <= tolerance);
const list = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];

async function withinRoot(path) {
  if (typeof path !== 'string' || !path) throw new Error('A nonempty path is required');
  const absolute = path.startsWith('asserts/') ? resolve(REPO, path) : resolve(ROOT, path);
  const rel = relative(ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path must stay inside Expedition_v1: ' + path);
  let cursor = absolute;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Symlink/junction paths are unsupported: ' + path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === ROOT) return absolute;
    cursor = dirname(cursor);
  }
}
async function readJson(path, fallback) {
  try { return JSON.parse((await readFile(await withinRoot(path), 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
async function writeRecord(path, value) {
  const output = await withinRoot(path), temporary = await withinRoot(path + '.' + randomUUID() + '.tmp');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, output);
}
async function fileRecord(path) {
  const absolute = await withinRoot(path), bytes = await readFile(absolute);
  return { path: rootRelative(absolute), repositoryPath: repositoryRelative(absolute), sha256: hash(bytes), bytes: bytes.length };
}
async function inspectImage(path, sampleSize, region) {
  const absolute = await withinRoot(path), buffer = await readFile(absolute), metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (region && (!Array.isArray(region) || region.length !== 4 || region.some(value => !Number.isInteger(value))
    || region[0] < 0 || region[1] < 0 || region[2] <= 0 || region[3] <= 0
    || region[0] + region[2] > info.width || region[1] + region[3] > info.height)) throw new Error('Invalid base alpha measurement region');
  const border = { top: 0, left: 0, right: 0, bottom: 0 };
  let transparent = 0, partial = 0, opaque = 0, hiddenRgb = 0;
  let left = info.width, top = info.height, right = -1, bottom = -1, regionLeft = info.width, regionRight = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * 4, alpha = data[p + 3];
    if (alpha === 0) { transparent++; if (data[p] || data[p + 1] || data[p + 2]) hiddenRgb++; }
    else if (alpha === 255) opaque++; else partial++;
    if (alpha) {
      if (y === 0) border.top++;
      if (x === 0) border.left++;
      if (x === info.width - 1) border.right++;
      if (y === info.height - 1) border.bottom++;
    }
    if (alpha < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (region && x >= region[0] && x < region[0] + region[2] && y >= region[1] && y < region[1] + region[3]) {
      regionLeft = Math.min(regionLeft, x); regionRight = Math.max(regionRight, x);
    }
  }
  const sampled = sampleSize ? await sharp(buffer).resize(sampleSize, sampleSize, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toBuffer() : null;
  return { path: rootRelative(absolute), repositoryPath: repositoryRelative(absolute), sha256: hash(buffer), bytes: buffer.length,
    dimensions: [metadata.width, metadata.height], format: metadata.format, channels: metadata.channels,
    hasAlphaChannel: metadata.hasAlpha === true, paletteEncoded: metadata.isPalette === true,
    rawPixelSha256: hash(data), alpha: { transparent, partial, opaque, visible: partial + opaque, hiddenRgb,
      transparentFraction: transparent / (info.width * info.height), border, borderVisible: Object.values(border).reduce((a, b) => a + b, 0) },
    bbox: right < 0 ? null : [left, top, right + 1, bottom + 1],
    measuredBaseAlphaWidthPx: region ? regionRight < 0 ? 0 : regionRight - regionLeft + 1 : null,
    sampledRuntime: sampled ? { dimensions: [sampleSize, sampleSize], pngBytes: sampled.length, sha256: hash(sampled),
      method: 'actual full-canvas Lanczos3 resize and level-9 PNG encode in memory; no sampled image written' } : null };
}
function expandContract(contract) {
  const assets = [], groups = [];
  for (const entity of contract.entities) for (const direction of entity.directions) for (const [state, count] of Object.entries(entity.states)) {
    const name = `${entity.key}.${direction}.${state}`, ids = [];
    for (let index = 0; index < count; index++) {
      const number = String(index).padStart(2, '0'), id = `${entity.idPrefix}.${direction}.${state}.${number}`;
      ids.push(id); assets.push({ id, entity, direction, state, index, count, group: name,
        path: `${entity.key}/${direction}/${state}/${number}.png` });
    }
    groups.push({ name, entity: entity.key, phase: entity.phase, direction, state, count, ids });
  }
  return { assets, groups };
}
function layoutFor(contract, entity, dimensions) {
  const pivot = entity.pivot ?? contract.pivot, allowed = entity.allowedCanvases ?? [entity.canvas ?? contract.canvas];
  return { pivot, allowed, anchor: entity.kind === 'icon' ? dimensions.map((n, i) => n * pivot[i]) : entity.foot ?? contract.foot };
}
function mappedSourceAnchor(source) {
  const p = pair(source.sourceAnchor ?? source.sourceGround), m = source.registration?.matrixCroppedToRegistered;
  return p && Array.isArray(m?.[0]) && Array.isArray(m?.[1]) ? [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2],
    m[1][0] * p[0] + m[1][1] * p[1] + m[1][2]] : null;
}
const promptFor = (source, spec, run) => spec?.prompt ?? source?.prompt ?? run?.prompt ?? null;

export async function assembleExpeditionDelivery({ phase = 'all' } = {}) {
  if (!['all', 'p0'].includes(phase)) throw new Error('Only --phase p0 or default complete all delivery is supported');
  const [contract, runDocument, specDocument, processing, fragment, selections, p0Review, p1Review] = await Promise.all([
    readJson('production/asset-contract.json'), readJson('production/runs.json'), readJson('production/source-spec.json'),
    readJson('production/source-processing.json'), readJson('production/animation-fragment.json'),
    readJson('production/candidate-selection.json', { candidates: [] }),
    readJson('production/source-visual-review-p0.json', null),
    phase === 'all' ? readJson('production/source-visual-review-p1.json', null) : Promise.resolve(null),
  ]);
  const reviewDocuments = [{ phase: 'p0', path: 'production/source-visual-review-p0.json', record: p0Review },
    ...(phase === 'all' ? [{ phase: 'p1', path: 'production/source-visual-review-p1.json', record: p1Review }] : [])].filter(item => item.record);
  const sourceReview = { sources: reviewDocuments.flatMap(item => item.record.sources ?? []) };
  const full = expandContract(contract), assetById = new Map(full.assets.map(asset => [asset.id, asset]));
  const expected = { assets: full.assets.filter(asset => phase === 'all' || asset.entity.phase === phase),
    groups: full.groups.filter(group => phase === 'all' || group.phase === phase) };
  const allFrames = list(fragment, 'assets'), frames = allFrames.filter(frame => phase === 'all' || assetById.get(frame.id)?.entity.phase === phase);
  const frameById = new Map(frames.map(frame => [frame.id, frame]));
  const allGroups = list(fragment, 'clips'), groupByName = new Map(allGroups.map(group => [group.name, group]));
  const runs = Array.isArray(runDocument.runs) ? runDocument.runs.map((run, i) => ({ key: String(i), ...run }))
    : Object.entries(runDocument.runs ?? {}).map(([key, run]) => ({ key, ...run }));
  const runById = new Map(runs.map(run => [run.runId, run])), sourceById = new Map(list(processing, 'sources').map(source => [source.key, source]));
  const specById = new Map(list(specDocument, 'sources').map(source => [source.key, source]));
  const usedSourceIds = new Set(frames.map(frame => frame.sourceId ?? `${assetById.get(frame.id)?.entity.key}/${frame.direction}`));
  const errors = [], warnings = [], checks = [], sourceMasters = [], assets = [], animationGroups = [];
  const check = (name, pass, detail = {}) => { const value = { name, pass, ...detail }; checks.push(value); if (!pass) errors.push(value); return pass; };
  check('required-phase-producer-review-records', phase === 'p0' ? !!p0Review : !!p0Review && !!p1Review,
    { phase, available: reviewDocuments.map(item => item.phase) });
  check('full-contract-count', full.assets.length === 74 && full.assets.length === contract.expectedRuntimeCount,
    { actual: full.assets.length, declared: contract.expectedRuntimeCount });
  check('full-contract-groups', full.groups.length === 43 && full.groups.length === contract.expectedAnimationGroupCount,
    { actual: full.groups.length, declared: contract.expectedAnimationGroupCount });
  for (const [key, definition] of Object.entries(contract.phases)) {
    check('phase-contract-count', full.assets.filter(asset => asset.entity.phase === key).length === definition.expectedRuntimeCount
      && full.groups.filter(group => group.phase === key).length === definition.expectedAnimationGroupCount, { phase: key });
  }
  check('required-runtime-count', frames.length === expected.assets.length, { phase, actual: frames.length, expected: expected.assets.length });
  check('unique-runtime-id', frameById.size === frames.length, { actual: frames.length, unique: frameById.size });
  check('unique-runtime-path', new Set(frames.map(frame => slash(frame.path ?? ''))).size === frames.length, { actual: frames.length });
  check('unique-group-name', groupByName.size === allGroups.length, { actual: allGroups.length, unique: groupByName.size });
  for (const frame of allFrames) check('known-runtime-id', assetById.has(frame.id), { id: frame.id });
  const allGroupNames = new Set(full.groups.map(group => group.name)), selectedGroupNames = new Set(expected.groups.map(group => group.name));
  for (const group of allGroups) check('known-group-name', allGroupNames.has(group.name), { name: group.name });
  check('required-fragment-group-count', allGroups.filter(group => selectedGroupNames.has(group.name)).length === expected.groups.length,
    { phase, actual: allGroups.filter(group => selectedGroupNames.has(group.name)).length, expected: expected.groups.length });

  for (const sourceId of usedSourceIds) {
    const source = sourceById.get(sourceId), spec = specById.get(sourceId), sample = frames.find(frame => frame.sourceId === sourceId);
    const entity = sample && assetById.get(sample.id)?.entity;
    if (!source || !entity) { check('used-source-present', false, { sourceId }); continue; }
    try {
      const image = await inspectImage(source.output.path), raw = await fileRecord(source.raw?.path ?? spec?.rawPath);
      const layout = layoutFor(contract, entity, image.dimensions), registration = source.registration ?? {}, run = runById.get(source.runId);
      const sourceChecks = {
        rgbaPng: image.format === 'png' && image.channels === 4 && image.hasAlphaChannel,
        allowedCanvas: layout.allowed.some(canvas => equalPair(canvas, image.dimensions)),
        trueTransparencyAndVisibleSubject: image.alpha.transparent > 0 && image.alpha.visible > 0,
        allFourBordersTransparent: image.alpha.borderVisible === 0,
        outputSha: image.sha256 === source.output.sha256, rawSha: raw.sha256 === source.raw?.sha256,
        targetCanvas: equalPair(pair(registration.targetCanvas ?? registration.canvas), image.dimensions),
        targetAnchor: equalPair(pair(registration.targetAnchor ?? registration.targetGround), layout.anchor),
        sourceAnchorTransform: equalPair(mappedSourceAnchor(source), layout.anchor, 1e-4),
        pivot: equalPair(pair(registration.pivot), layout.pivot), noTrim: registration.trim === false,
        sourceSpec: !!spec, successfulRun: !!run && run.status === 'succeeded',
        completePrompt: typeof promptFor(source, spec, run) === 'string' && promptFor(source, spec, run).length > 0,
      };
      check('source-self-checks', Object.values(sourceChecks).every(Boolean), { sourceId, checks: sourceChecks });
      sourceMasters.push({ id: sourceId, runtime: false, runtimeFrameCredit: 0, kind: 'registered-source-master', ...image,
        entity: entity.key, phase: entity.phase, raw, runId: source.runId, prompt: promptFor(source, spec, run),
        registration, processing: { crop: source.crop, sourceAnchor: source.sourceAnchor ?? source.sourceGround,
          sourceGroundOriginal: source.sourceGroundOriginal, groundMethod: source.groundMethod, transparency: source.transparency,
          method: source.sourceMethod ?? spec?.sourceMethod ?? run?.sourceMethod
            ?? 'Maliang source design; reviewed background removal when required; full-canvas uniform registration' },
        sourceMethod: source.sourceMethod ?? spec?.sourceMethod ?? run?.sourceMethod ?? null,
        generationOccurredThisBatch: source.generationOccurredThisBatch ?? spec?.generationOccurredThisBatch ?? run?.generationOccurredThisBatch ?? null,
        parentRunId: source.parentRunId ?? spec?.parentRunId ?? run?.parentRunId ?? null,
        provenanceRecord: source.provenanceRecord ?? spec?.provenanceRecord ?? run?.provenanceRecord ?? null,
        sourceProvenance: source.sourceProvenance ?? spec?.sourceProvenance ?? run?.sourceProvenance ?? null,
        sourceHistory: source.history ?? null, qa: source.qa, selfChecks: sourceChecks,
        candidateStatus: spec?.candidateStatus ?? 'selected-by-producer-pending-main-renderer',
        visualReview: sourceReview?.sources?.find(review => review.key === sourceId) ?? source.visualReview ?? null,
        approved: false, approvalStatus: 'pending-main-renderer-review' });
    } catch (error) { check('source-readable', false, { sourceId, message: error.message }); }
  }
  const inspectedSources = new Map(sourceMasters.map(source => [source.id, source]));
  for (const expectedFrame of expected.assets) {
    const frame = frameById.get(expectedFrame.id), entity = expectedFrame.entity;
    if (!frame) { check('required-frame-present', false, { id: expectedFrame.id }); continue; }
    try {
      const image = await inspectImage(frame.path, entity.recommendedRuntimeTexture, frame.groundFootprint?.baseRegionPx);
      const layout = layoutFor(contract, entity, image.dimensions), sourceId = frame.sourceId ?? `${entity.key}/${expectedFrame.direction}`;
      const source = inspectedSources.get(sourceId), frameRegistration = frame.actorRegistration ?? frame.assetRegistration ?? frame.iconRegistration;
      const animation = frame.animation, footprint = frame.groundFootprint ? { ...frame.groundFootprint,
        actualBaseAlphaWidthPx: image.measuredBaseAlphaWidthPx,
        recomputedWorldDiameter: image.measuredBaseAlphaWidthPx * frame.worldLogicalCanvasWidth / image.dimensions[0] } : null;
      const frameChecks = {
        expectedPath: image.path === expectedFrame.path,
        identityAndState: frame.entity === entity.key && frame.direction === expectedFrame.direction && frame.state === expectedFrame.state
          && frame.frameIndex === expectedFrame.index,
        rgbaPng: image.format === 'png' && image.channels === 4 && image.hasAlphaChannel,
        allowedCanvas: layout.allowed.some(canvas => equalPair(canvas, image.dimensions)),
        trueTransparencyAndVisibleSubject: image.alpha.transparent > 0 && image.alpha.visible > 0,
        allFourBordersTransparent: image.alpha.borderVisible === 0, fragmentSha: image.sha256 === frame.sha256,
        pivot: equalPair(pair(frame.pivot), layout.pivot), anchor: equalPair(pair(frame.anchor ?? frame.foot), layout.anchor),
        registration: equalPair(pair(frameRegistration?.canvas), image.dimensions)
          && equalPair(pair(frameRegistration?.anchor ?? frameRegistration?.foot), layout.anchor)
          && frameRegistration?.commonCanvasScale === contract.commonCanvasScale,
        sourceLink: !!source && frame.registrationGroup === sourceId && frame.runId === source.runId
          && frame.sourceProcessing?.sourceSha256 === source.sha256 && frame.sourceProcessing?.rawSha256 === source.raw.sha256,
        animation: animation?.group === expectedFrame.group && animation?.index === expectedFrame.index && animation?.frameCount === expectedFrame.count
          && Number.isFinite(animation?.fps) && (expectedFrame.count === 1 ? animation.fps >= 0 : animation.fps > 0),
        worldWidth: entity.kind === 'icon' || Number.isFinite(frame.worldLogicalCanvasWidth)
          && Math.abs(frame.worldLogicalCanvasWidth - entity.worldLogicalCanvasWidth) < 1e-6,
        noTrim: frame.trim === false,
        optionalGroundFootprint: Number.isFinite(entity.groundWorldDiameterMax)
          ? !!footprint && footprint.actualBaseAlphaWidthPx === footprint.baseAlphaWidthPx && footprint.actualBaseAlphaWidthPx > 0
            && footprint.recomputedWorldDiameter <= entity.groundWorldDiameterMax
          : !footprint || footprint.actualBaseAlphaWidthPx === footprint.baseAlphaWidthPx && footprint.actualBaseAlphaWidthPx > 0,
      };
      check('frame-self-checks', Object.values(frameChecks).every(Boolean), { id: frame.id, checks: frameChecks });
      if (image.alpha.hiddenRgb) warnings.push({ name: 'frame-hidden-rgb', id: frame.id, pixels: image.alpha.hiddenRgb,
        alphaValue: 0, paletteEncoded: image.paletteEncoded, severity: 'informational',
        explanation: 'Counted RGB values exist only at alpha exactly 0. Transparent palette entries can carry RGB. Preserve reviewed PNGs; main Renderer reviews sampled edges/filtering.' });
      assets.push({ id: frame.id, runtime: true, kind: entity.kind === 'icon' ? 'icon-state' : 'baked-animation-frame', ...image,
        entity: entity.key, phase: entity.phase, direction: expectedFrame.direction, state: expectedFrame.state,
        frameIndex: expectedFrame.index, frameCount: expectedFrame.count, animation, actorRegistration: frameRegistration,
        pivot: layout.pivot, foot: layout.anchor, anchorKind: entity.anchorKind ?? 'foot', trim: false, alphaMode: 'straight',
        worldLogicalCanvasWidth: entity.kind === 'icon' ? null : frame.worldLogicalCanvasWidth,
        worldWidthStatus: entity.worldWidthStatus ?? contract.worldWidthAuthority,
        suggestedVisibleWorldHeight: entity.suggestedVisibleWorldHeight ?? null, groundFootprint: footprint,
        recommendedRuntimeTexture: entity.recommendedRuntimeTexture,
        source: source ? { id: source.id, path: source.path, repositoryPath: source.repositoryPath, sha256: source.sha256,
          rawPath: source.raw.path, rawSha256: source.raw.sha256, runId: source.runId, processingRecord: 'production/source-processing.json',
          sourceMethod: source.sourceMethod, generationOccurredThisBatch: source.generationOccurredThisBatch,
          parentRunId: source.parentRunId, provenanceRecord: source.provenanceRecord, sourceProvenance: source.sourceProvenance } : { id: sourceId },
        runId: source?.runId ?? frame.runId, prompt: source?.prompt ?? null, method: frame.method ?? contract.sourceMethod,
        sourceProcessing: frame.sourceProcessing, deformation: frame.deformation ?? null,
        aiGeneratedThisFrame: frame.aiGeneratedThisFrame ?? null,
        sourceGenerationOccurredThisBatch: frame.sourceGenerationOccurredThisBatch ?? source?.generationOccurredThisBatch ?? null,
        producerFrameStatus: frame.status ?? null, candidateStatus: 'selected-by-producer-pending-main-renderer-review',
        approved: false, approvalStatus: 'pending-main-renderer-review', selfChecks: frameChecks });
    } catch (error) { check('frame-readable', false, { id: expectedFrame.id, message: error.message }); }
  }
  const inspectedAssets = new Map(assets.map(asset => [asset.id, asset]));
  for (const expectedGroup of expected.groups) {
    const group = groupByName.get(expectedGroup.name), members = expectedGroup.ids.map(id => inspectedAssets.get(id)).filter(Boolean);
    if (!group) { check('required-group-present', false, { group: expectedGroup.name }); continue; }
    const durations = group.frameDurationsMs, distinct = new Set(members.map(asset => asset.rawPixelSha256)).size;
    const groupChecks = {
      memberIds: JSON.stringify(group.ids) === JSON.stringify(expectedGroup.ids), allMembersPresent: members.length === expectedGroup.count,
      durations: Array.isArray(durations) && durations.length === expectedGroup.count
        && durations.every(value => Number.isFinite(value) && (expectedGroup.count === 1 ? value >= 0 : value > 0)),
      loopDeclared: typeof group.loop === 'boolean', nonRepeatedMotion: expectedGroup.count === 1 || distinct > 1,
      sameCanvas: members.every(member => equalPair(member.dimensions, members[0]?.dimensions)),
      sameAnchorAndPivot: members.every(member => equalPair(member.foot, members[0]?.foot) && equalPair(member.pivot, members[0]?.pivot)),
      sameSource: new Set(members.map(member => member.source.id)).size === 1,
      fpsMatchesTiming: Array.isArray(durations) && members.every((member, index) => durations[index] === 0
        ? expectedGroup.count === 1 && member.animation.fps === 0 : Math.abs(member.animation.fps - 1000 / durations[index]) < 1e-6),
    };
    check('group-self-checks', Object.values(groupChecks).every(Boolean), { group: expectedGroup.name, checks: groupChecks });
    animationGroups.push({ ...expectedGroup, frameCount: expectedGroup.count, frameDurationsMs: durations,
      durationMs: Array.isArray(durations) ? durations.reduce((sum, value) => sum + value, 0) : null,
      loop: group.loop, kind: group.kind ?? (expectedGroup.count === 1 ? 'static-state' : 'baked-action-sequence'),
      uniquePixelFrames: distinct, qa: group.qa, selfChecks: groupChecks, approved: false, approvalStatus: 'pending-main-renderer-review' });
  }
  const candidateRecords = [];
  for (const candidate of list(selections, 'candidates')) {
    if (phase === 'p0' && !contract.entities.some(entity => entity.key === candidate.entity && entity.phase === 'p0')) continue;
    let raw = null;
    if (candidate.rawPath) {
      try { raw = await fileRecord(candidate.rawPath); check('candidate-raw-sha', !candidate.sha256 || raw.sha256 === candidate.sha256,
        { entity: candidate.entity, runId: candidate.runId }); }
      catch (error) { check('candidate-readable', false, { entity: candidate.entity, message: error.message }); }
    }
    candidateRecords.push({ ...candidate, raw, runtime: false, runtimeFrameCredit: 0,
      candidateStatus: 'producer-selection-only', approved: false, approvalStatus: 'pending-main-renderer-review' });
  }
  const sampledRuntimePngBytes = assets.reduce((sum, asset) => sum + asset.sampledRuntime.pngBytes, 0);
  const conservativeNewBytes = Math.ceil(sampledRuntimePngBytes * 4 / 3 * 1.2) + 256 * 1024;
  const budget = { ...contract.runtimeBudget, phase, measuredFrameCount: assets.length, sampledRuntimePngBytes,
    sourceRuntimePngBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    conservativeNewBytes, conservativeNewMiB: conservativeNewBytes / MIB,
    estimatedTotalMiB: contract.runtimeBudget.existingApproxMiB + conservativeNewBytes / MIB,
    finalPackageMeasurement: 'pending-main-build', p1BudgetCompletion: phase === 'p0' ? 'pending-p1' : 'included' };
  check('new-conservative-budget', budget.conservativeNewMiB <= budget.newConservativeMaxMiB,
    { actualMiB: budget.conservativeNewMiB, limitMiB: budget.newConservativeMaxMiB });
  check('combined-runtime-budget', budget.estimatedTotalMiB < budget.totalMiB, { actualMiB: budget.estimatedTotalMiB, limitMiB: budget.totalMiB });
  check('all-required-images-audited', assets.length === expected.assets.length, { actual: assets.length, required: expected.assets.length });
  check('all-required-groups-audited', animationGroups.length === expected.groups.length,
    { actual: animationGroups.length, required: expected.groups.length });
  const generatedAt = new Date().toISOString(), suffix = phase === 'p0' ? '-p0' : '';
  const paths = { delivery: `delivery${suffix}.json`, audit: `production/delivery${suffix}-audit.json`, handoff: phase === 'p0' ? 'HANDOFF-P0.md' : 'HANDOFF.md' };
  const advisory = { count: warnings.filter(warning => warning.name === 'frame-hidden-rgb').length,
    paletteCount: warnings.filter(warning => warning.name === 'frame-hidden-rgb' && warning.paletteEncoded).length,
    interpretation: 'Only pixels with alpha exactly 0 are counted. Preserve these advisory entries and reviewed PNGs; main Renderer must inspect actual edge filtering.',
    reviewedPngRewriteRequired: false };
  const audit = { schemaVersion: 1, scope: 'Expedition_v1-only', phase, generatedAt,
    status: errors.length ? 'failed' : 'passed-producer-technical-checks-pending-main-renderer',
    expectedRuntimeCount: expected.assets.length, runtimeCount: assets.length, expectedGroupCount: expected.groups.length,
    groupCount: animationGroups.length, errorCount: errors.length, warningCount: warnings.length, errors, warnings, checks,
    transparencyAdvisory: advisory, budget, imageWrites: 0, priorDirectoriesReadOrWritten: false,
    registrationEvidence: 'Source annotated foot/center affine map and per-frame anchor/canvas/scale checked; actual natural motion and edge filtering remain with main Renderer.' };
  const reviewRecords = await Promise.all(reviewDocuments.map(async item => ({ ...(await fileRecord(item.path)), phase: item.phase, record: item.record })));
  const delivery = { schemaVersion: 1, title: contract.title, version: contract.version, theme: contract.root, phase, generatedAt,
    status: 'producer-delivery-ready-for-main-renderer-review', canonical: phase === 'all',
    expectedRuntimeCount: expected.assets.length, completedRuntimeCount: assets.length, fullCanonicalExpectedRuntimeCount: 74,
    expectedAnimationGroupCount: expected.groups.length, completedAnimationGroupCount: animationGroups.length,
    approvedRuntimeCount: 0, runtimeIntegrationPerformed: false, sourceMastersCountAsRuntimeFrames: false,
    contract, productionMethod: contract.sourceMethod, assets, animationGroups, sourceMasters, candidates: candidateRecords,
    approvalBoundary: 'All selection and visual review evidence is producer-only; no main Renderer or user approval is asserted.',
    producerVisualReview: { mainRendererApproval: false, sourceRecord: phase === 'p0' ? reviewRecords[0] ?? null : null,
      sourceRecords: reviewRecords,
      sourceShaCoverage: sourceMasters.map(source => { const reviewed = sourceReview?.sources?.find(item => item.key === source.id);
        return { sourceId: source.id, sourceSha256: source.sha256, recordedReviewSha256: reviewed?.sha256 ?? null,
          currentPixelsMatchReview: reviewed?.sha256 === source.sha256, reviewed: reviewed?.reviewed === true }; }),
      fragmentStatus: fragment.status, qaOverview: phase === 'p0' ? fragment.qaByPhase?.p0 ?? fragment.qaOverview ?? null : fragment.qaOverview ?? null,
      qaByPhase: phase === 'p0' ? { p0: fragment.qaByPhase?.p0 ?? fragment.qaOverview ?? null } : fragment.qaByPhase ?? null,
      clips: animationGroups.map(group => ({ name: group.name, actualVisualReview: group.qa?.actualVisualReview ?? null })) },
    sourceRuns: runs.filter(run => sourceMasters.some(source => source.runId === run.runId)).map(run => ({ key: run.key, runId: run.runId,
      status: run.status, canvas: run.canvas, prompt: run.prompt, referenceNodes: run.referenceNodes, followUpNodes: run.followUpNodes,
      generationOccurredThisBatch: run.generationOccurredThisBatch ?? null, reusedApprovedDerivative: run.reusedApprovedDerivative ?? null,
      sourceMethod: run.sourceMethod ?? null, parentRunId: run.parentRunId ?? null,
      provenanceRecord: run.provenanceRecord ?? null, originalGeneratedImage: run.originalGeneratedImage ?? null })),
    references: { contract: 'production/asset-contract.json', runs: 'production/runs.json', sources: 'production/source-processing.json',
      sourceSpec: 'production/source-spec.json', fragment: 'production/animation-fragment.json', audit: paths.audit,
      sourceVisualReviews: reviewDocuments.map(item => item.path) },
    budget, selfCheck: { status: audit.status, errorCount: errors.length, warningCount: warnings.length, transparencyAdvisory: advisory },
    writeBoundary: 'Only asserts/ViralInvasion_Expedition_v1/ JSON/Markdown records; no PNG, old Combat/Actors, src or shared art-selection writes.' };
  const prior = await readJson(paths.delivery, null);
  if (phase === 'p0' && prior) throw new Error('P0 receipt is immutable after delivery; refusing to change its receipt, audit or handoff');
  await writeRecord(paths.audit, audit);
  if (!errors.length) {
    if ((prior?.approvedRuntimeCount ?? 0) > 0) throw new Error('Refusing to overwrite a receipt containing Renderer approvals');
    await writeRecord(paths.delivery, delivery); await writeRecord(paths.handoff, makeHandoff(delivery, paths));
  }
  return { status: audit.status, phase, deliveryWritten: !errors.length, delivery: !errors.length ? paths.delivery : null,
    audit: paths.audit, runtimeFrames: assets.length, groups: animationGroups.length, errors: errors.length,
    warnings: warnings.length, conservativeNewMiB: budget.conservativeNewMiB, estimatedTotalMiB: budget.estimatedTotalMiB,
    approvedRuntimeCount: 0, imageWrites: 0 };
}
function makeHandoff(delivery, paths) {
  const content = basicHandoff(delivery, paths);
  return delivery.contract.worldWidthAuthority === 'main-approved'
    ? content.replace('世界逻辑宽暂为制作端建议，等待主逻辑最终数值。', '世界逻辑宽已由主会话批准，具体数值见合同；该数值批准不表示素材像素或运行接入已批准。')
    : content;
}
function basicHandoff(delivery, paths) {
  const included = delivery.contract.entities.filter(entity => delivery.phase === 'all' || entity.phase === delivery.phase);
  const table = included.map(entity => `| ${entity.key} | ${entity.directions.join('/')} | ${Object.entries(entity.states).map(([state, count]) => state + ' ' + count).join(', ')} | ${entity.kind === 'icon' ? '256² preferred, center' : '512², foot(.5,.85)'} |`).join('\n');
  return `# 心脏远征 v0.15 ${delivery.phase === 'p0' ? 'P0 独立交付' : '完整交付'}\n\n${delivery.completedRuntimeCount} 帧/${delivery.completedAnimationGroupCount} 组；制作端技术审查完成，主 Renderer 实图审查与接入待完成，批准数为 0。${delivery.phase === 'p0' ? '本回执仅覆盖 P0，不替代最终 74 帧 canonical delivery.json。' : 'canonical delivery.json 覆盖全部 74 帧。'}\n\n| 实体 | 方向 | 状态帧数 | 画布/配准 |\n|---|---|---|---|\n${table}\n\n完整 ID 为 fantasy.expedition.实体.方向.状态.两位帧号，路径与真实 SHA/alpha 指标见 ${paths.delivery}。演员/设施512²，foot[256,435.2]、pivot(.5,.85)、commonCanvasScale1；图标推荐256²、中心pivot(.5,.5)。均trim=false、同组配准，不逐帧裁边或fit。祭司后右是真实转面，左向镜像。世界逻辑宽暂为制作端建议，等待主逻辑最终数值。\n\n真实方法与来源runId、完整中文提示词、源SHA和处理链逐项记录。源母图/候选/QA不计运行帧；分层或软体烘焙不宣称AI逐帧生成。selected/rejected和实际联系图审查仅是制作端证据，不等于主会话批准。\n\n技术审核见 ${paths.audit}：真实PNG重哈希、可见主体/透明四边、画布/pivot/foot或center、共尺度、ID/路径唯一、合同数量、动画像素非全重复和时长。${delivery.selfCheck.transparencyAdvisory.count} 条hidden-RGB提示保留，计数像素真实alpha=0；无需据此重写已审PNG，主Renderer最终检查采样滤波边缘。\n\n新图按实际内存采样PNG及保守编码/atlas余量预计 ${delivery.budget.conservativeNewMiB.toFixed(3)} / ${delivery.budget.newConservativeMaxMiB} MiB；含现有约12.87MiB总计 ${delivery.budget.estimatedTotalMiB.toFixed(3)} / 20MiB，最终构建实测由主会话负责。\n\n所有本轮写入只限 asserts/ViralInvasion_Expedition_v1/；旧Combat/Actors/冻结图片、源码和共享art-selection均未修改。\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2); let phase = 'all';
    if (args.length) {
      if (args.length !== 2 || args[0] !== '--phase' || args[1] !== 'p0') throw new Error('Usage: assemble-expedition-delivery.mjs [--phase p0]');
      phase = args[1];
    }
    const result = await assembleExpeditionDelivery({ phase });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); if (result.errors) process.exitCode = 1;
  } catch (error) { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
}
