/**
 * Actor-art evidence has two deliberately separate levels:
 *  - DERIVED: explicit supplied states rendered by the real Renderer; never a live run.
 *  - NATURAL: public DOM inputs and read-only __viral observations, with rAF traces/video.
 * This script never edits gameplay, assets, selection, generated files, or a release.
 */
import { build as bundle } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = fileURLToPath(import.meta.url);
const options = { build: 'dist', output: '', mode: 'all', profile: 'final', channel: 'chrome', route: 'both',
  width: 1366, height: 768, naturalSeconds: 180 };
const argv = process.argv.slice(2);
const check = argv.includes('--check');
if (argv.includes('--help')) {
  console.log('node scripts/verify-actor-art.mjs --check\n'
    + 'node scripts/verify-actor-art.mjs --build dist --output artifacts/actor-art/<new-directory>\n'
    + '  [--mode derived|natural|all|recorder-check] [--profile baseline|final] [--channel chrome|msedge]\n'
    + '  [--route actions|precision|area|both] [--naturalSeconds 180] [--width 1366] [--height 768]\n'
    + 'The output directory must be new/empty and outside the frozen build. --check starts no browser and writes nothing.\n'
    + 'baseline records missing/old/fallback coverage and never grants final actor acceptance.\n'
    + 'Final acceptance requires both levels, both natural combat branches, contract v2 groups ready, no old actor sources,\n'
    + 'actual native frames, continuous four-view traces and independently computed action coverage.\n'
    + 'Dense supplied-state screenshots are not performance evidence; run measure-territory-performance.mjs separately.');
  process.exit(0);
}
for (let index = 0; index < argv.length; index++) {
  if (argv[index] === '--check') continue;
  const key = argv[index].replace(/^--/, '');
  if (!argv[index].startsWith('--') || !Object.hasOwn(options, key) || argv[index + 1] === undefined) throw Error(`Unknown option ${argv[index]}`);
  options[key] = ['width', 'height', 'naturalSeconds'].includes(key) ? Number(argv[++index]) : argv[++index];
}
if (!['all', 'natural', 'derived', 'recorder-check'].includes(options.mode) || !['baseline', 'final'].includes(options.profile)
  || !['chrome', 'msedge'].includes(options.channel) || !['actions', 'precision', 'area', 'both'].includes(options.route)) throw Error('Invalid mode/profile/channel/route');
if (![options.width, options.height].every(value => Number.isInteger(value) && value >= 320)
  || !Number.isFinite(options.naturalSeconds) || options.naturalSeconds < 10 || options.naturalSeconds > 600) throw Error('Invalid dimensions or naturalSeconds');

const RECORDER_POLICY={playerTool:'every observed rAF',sceneSampleMs:100,streamFlushMs:2000,maxPendingBytes:8*1024*1024,
  maxRecordBytes:512*1024,maxCatalogueEntries:512,maxEventKeys:100000,maxEventBytes:16*1024*1024,
  maxTrackedTargets:512,maxPendingRecords:20000,
  enemyTransitions:'rAF-observed logical state changes only; point observations, not continuous enemy animation',
  overflow:'Stop recorder and reject completeness; never silently discard player/tool frames',
  encoding:'UTF-8 NDJSON, incrementally drained and checked; catalogue records precede their dynamic references'};
const CONTRACT = {
  schemaVersion: 1,
  evidenceLevels: ['derived-renderer-supplied-state', 'natural-dom-input-rAF-video'],
  diagnostics: { version: 2, actorArray: 'art.actorFrames', groupStatus: 'art.actorContract',
    fields: ['actorId', 'semanticId', 'identity', 'action', 'clip', 'frameIndex', 'frame', 'direction', 'authoredDirection', 'flipX',
      'native', 'visible', 'groupReady', 'fallback', 'fallbackReason', 'source', 'sourceFoot', 'worldFoot', 'screenFoot', 'bodyBounds', 'grip', 'muzzle', 'rotation'],
    ruleDirections:{array:'art.ruleDirections',scope:'Geometry returned by the same actual native accent draw, not recalculated from state in diagnostics',
      fields:['actorId','type','angle','projectedAngle','origin','end','displayOrigin','displayEnd','sectorHalfAngle','displayRadius','exposed','committed','visible']} },
  views: ['front_right', 'back_right', 'front_left', 'back_left'],
  note: 'Four art views, independently selected from aim quadrants; eight movement inputs do not mean eight authored views.',
  derived: { scenes: ['menu', 'training', 'heart', 'lung'], grounds: ['healthy', 'infected'], effects: ['standard', 'low'],
    hero: ['idle', 'walk', 'fire', 'walk-fire', 'dash', 'charge', 'release', 'scan', 'heal', 'hurt'],
    enemies: ['basic', 'thinRay', 'carapace', 'fission.parent', 'fission.child', 'mimic', 'invader', 'source', 'mother', 'immune'],
    enemyStates: ['move', 'windup', 'attack', 'hurt', 'recovery', 'defeat'], density: [48], forcedFallback: true,
    camera: { inspectionStage: '1200x800 explicitly supplied overview; not the production 2400x1500 follow view',
      compactCanvasCSS: { width: 667, height: 320 }, compactMinimumScale: .62, menuMinimumScaleOptIn: false },
    ruleDirections: { worldAngles: Array.from({length:8},(_,index)=>index*Math.PI/4), effects:['standard','low'],
      cases:['carapace-protected','carapace-exposed','thinRay-locked-plan'], labels:['normal','suppressed-in-probe'],
      expectedCarapaceHalfAngle:Math.acos(.2), ruleSource:'src/game/battle.ts modifiedDamage: cos(incoming-facing) > .2 and exposedUntil <= elapsed',
      note:'Eight rule directions are cues/geometry, not eight authored body drawings. ThinRay target.facing is deliberately opposite its frozen plan aim.' } },
  natural: { entry: ['public-menu', 'training-query', 'public-heart-rescue'],
    actions: ['idle', 'walk', 'fire', 'walk-fire', 'dash', 'charge', 'release', 'scan', 'heal', 'hurt'],
    combat: ['positive-virus-hit', 'infection', 'healing', 'cleanse', 'purification', 'variant-birth', 'source-defeat', 'mother', 'rescue'],
    excludedClaim: 'Lung is supplied-state coverage unless a separately recorded public route actually reaches it.',recorder:RECORDER_POLICY,
    enemySamplingBoundary:'Whole-scene enemy/native geometry is sampled at100ms plus observed transition points. Only player/tool records remain continuous rAF; enemy transient continuity is not inferred.' },
  humanReviewRequired: ['style replacement', 'silhouette recognition', 'foot sliding', 'start-stop continuity', 'grip and muzzle alignment',
    'no doubled weapons', 'hazard readability at 48 bodies', 'eight-direction sector/heading clarity without a conflicting fixed painted pose', 'animation quality'],
  finalPerformance: 'Separate exclusive natural 48-body standard/low desktop/compact run; no FPS claim from this video/diagnostic-heavy capture.',
};
const requiredGroups = [
  ...['front_right', 'back_right'].flatMap(direction => ['idle', 'walk', 'hurt', 'dash'].map(action => `fantasy.actor.hero.${direction}.${action}`)),
  ...['basic', 'thinRay', 'carapace', 'fission.parent', 'fission.child', 'mimic'].flatMap(identity => ['walk', 'windup', 'hurt', 'dissolve'].map(action => `fantasy.actor.enemy.${identity}.${action}`)),
  ...['front_right', 'back_right'].flatMap(direction => ['crawl', 'bite'].map(action => `fantasy.actor.immune.${direction}.${action}`)),
  'fantasy.actor.mother.base', 'fantasy.actor.mother.core',
];
const requiredStaticIds=['fantasy.actor.weapon.emitter','fantasy.actor.immune.beacon','fantasy.actor.enemy.addon.spore_crown','fantasy.actor.enemy.elite.fungal_horns',
  ...['membrane','carapace','fission','mimic','purified'].map(layer=>`fantasy.actor.mother.${layer}`)];
CONTRACT.requiredGroups = requiredGroups;
CONTRACT.requiredStaticIds=requiredStaticIds;
const expectedGroupCount = group => group.startsWith('fantasy.actor.hero.')
  ? ({ idle: 4, walk: 8, hurt: 2, dash: 4 })[group.split('.').at(-1)]
  : group.startsWith('fantasy.actor.enemy.') ? ({ walk: 4, windup: 2, hurt: 1, dissolve: 1 })[group.split('.').at(-1)]
    : group.startsWith('fantasy.actor.immune.') ? 4 : group.endsWith('.base') ? 4 : 2;
CONTRACT.requiredGroupFrameCounts = Object.fromEntries(requiredGroups.map(group => [group, expectedGroupCount(group)]));
CONTRACT.singleFrameBoundary = 'Each enemy hurt/dissolve group has one authored key frame, plus its actual timed visual response. These are never reported as authored multi-frame animations.';
if (check) {
  textLog({ checked: true, browserStarted: false, wroteFiles: false, options, contract: CONTRACT });
  process.exit(0);
}
if (!options.output) throw Error('--output must identify a new evidence directory');
const buildDirectory = resolve(root, options.build), output = resolve(root, options.output);
const relativeOutput = relative(buildDirectory, output);
if (!relativeOutput || !isAbsolute(relativeOutput) && relativeOutput.split(/[\\/]/)[0] !== '..') throw Error('Output must be outside the selected build');
try { if ((await readdir(output)).length) throw Error('Output directory is not empty; preserve prior evidence'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = async filename => hash(await readFile(filename));
const label = filename => relative(root, filename).replaceAll('\\', '/');
function textLog(value) { console.log(JSON.stringify(value)); }
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), options, contract: CONTRACT,
  selectedBuild: { directory: label(buildDirectory), publicationStatus: 'Not inferred; this may be a candidate build.' },
  derived: { scope: 'Actual Renderer; explicitly supplied state/clock/positions/ownership/actions. No simulation steps or natural reachability claim.', cases: [] },
  natural: { scope: 'Real DOM mouse/keyboard inputs. rAF only reads production snapshots/diagnostics. Observation buffers are harness data.', entries: [], runs: [] },
  errors: [], remoteRequests: [], technicalPass: false, actorAcceptance: false, pass: false };
const writeArtifact = async (name, bytes) => {
  const filename = join(output, name); await mkdir(dirname(filename), { recursive: true }); await writeFile(filename, bytes, { flag: 'wx' });
  return { path: label(filename), sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
};
const readManifest = async paths => Object.fromEntries(await Promise.all(paths.map(async filename => [filename, await fileHash(resolve(root, filename))])));
let browser, beforeManifest, metadataBytes, metadata, runtime;
const identityByFrame = new Map();
const oldActorSource = source => /(?:^|\/)ViralInvasion_Art_v1\//.test(String(source).replaceAll('\\', '/'));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const numericRange = values => values.length ? values.reduce((range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }),
  { min: Infinity, max: -Infinity }) : null;
function nativeSourcePoint(asset,sprite,point){
  const b=asset?.sourceBounds,v=asset?.visibleBounds;
  if(!b||!v||!finitePoint(point)||!sprite)return null;
  const u=v.x+(point.x-b.x)*v.width/b.width,rawV=v.y+(point.y-b.y)*v.height/b.height;
  const dx=((sprite.flipX?asset.width-u:u)/asset.width-sprite.originX)*sprite.width;
  const dy=((sprite.flipY?asset.height-rawV:rawV)/asset.height-sprite.originY)*sprite.height;
  const cos=Math.cos(sprite.rotation??0),sin=Math.sin(sprite.rotation??0);
  return{x:sprite.x+dx*cos-dy*sin,y:sprite.y+dx*sin+dy*cos};
}
const angleError = (a,b) => Number.isFinite(a)&&Number.isFinite(b)?Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))):Infinity;
function ruleDirectionEvidence(diag, expected) {
  if (!expected) return null;
  const cues = diag.art?.ruleDirections ?? [];
  const actual = cues.find(cue => cue.actorId === expected.actorId && cue.type === (expected.kind==='carapace-sector'?'carapace':'thin-ray'));
  if (!actual) return { expected, actual:null, complete:false, reason:'Actual draw geometry diagnostics are missing; state-derived expectations are never treated as rendered proof.' };
  const sprite=diag.phaser?.nativeSprites?.find(item=>item.id===expected.actorId&&item.visible);
  const expectedFlipX=Math.cos(expected.worldAngle)<0;
  const bodyDirection={expectedFlipX,actualFlipX:sprite?.flipX??null,actualRotation:sprite?.rotation??null,
    complete:!!sprite&&sprite.flipX===expectedFlipX&&Math.abs(sprite.rotation??Infinity)<1e-7};
  const headingMatches=angleError(actual.angle,expected.worldAngle)<1e-6&&angleError(actual.projectedAngle,expected.projectedAngle)<1e-6;
  if(expected.kind==='carapace-sector'){
    const projectedBoundaryAngles=[actual.angle-actual.sectorHalfAngle,actual.angle+actual.sectorHalfAngle]
      .map(angle=>Math.atan2(Math.sin(angle)*.72,Math.cos(angle)));
    const boundaryMatches=projectedBoundaryAngles.every((angle,index)=>angleError(angle,expected.projectedBoundaryAngles[index])<1e-6);
    const stateMatches=actual.exposed===expected.exposed&&(!actual.exposed)===expected.protected;
    const actualSamples=expected.ruleSamples.map(sample=>({delta:sample.delta,protected:!actual.exposed&&Math.cos(sample.delta)>Math.cos(actual.sectorHalfAngle)}));
    const sampleMatches=actualSamples.every((sample,index)=>sample.protected===expected.ruleSamples[index].protected);
    return{expected,actual,bodyDirection,headingMatches,projectedBoundaryAngles,boundaryMatches,stateMatches,actualSamples,sampleMatches,
      complete:actual.visible===true&&bodyDirection.complete&&headingMatches&&boundaryMatches&&stateMatches&&sampleMatches&&Math.abs(actual.sectorHalfAngle-expected.halfAngle)<1e-6};
  }
  const dx=expected.planAim.x-expected.planOrigin.x,dy=expected.planAim.y-expected.planOrigin.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
  let extent=expected.planRange;const bounds=expected.worldBounds,radius=expected.planRadius;
  if(ux>0)extent=Math.min(extent,(bounds.right-radius-expected.planOrigin.x)/ux);
  if(ux<0)extent=Math.min(extent,(bounds.left+radius-expected.planOrigin.x)/ux);
  if(uy>0)extent=Math.min(extent,(bounds.bottom-radius-expected.planOrigin.y)/uy);
  if(uy<0)extent=Math.min(extent,(bounds.top+radius-expected.planOrigin.y)/uy);
  const independentlyClippedEnd={x:expected.planOrigin.x+ux*extent,y:expected.planOrigin.y+uy*extent};
  const planMatches=actual.committed===true&&finitePoint(actual.origin)&&finitePoint(actual.end)
    &&Math.hypot(actual.origin.x-expected.planOrigin.x,actual.origin.y-expected.planOrigin.y)<1e-6
    &&Math.hypot(actual.end.x-independentlyClippedEnd.x,actual.end.y-independentlyClippedEnd.y)<1e-6;
  const displayAngle=finitePoint(actual.displayOrigin)&&finitePoint(actual.displayEnd)
    ?Math.atan2((actual.displayEnd.y-actual.displayOrigin.y)*.72,actual.displayEnd.x-actual.displayOrigin.x):null;
  const displayMatches=angleError(displayAngle,expected.projectedAngle)<1e-6
    &&Math.hypot(actual.displayEnd.x-actual.origin.x,actual.displayEnd.y-actual.origin.y)<=extent+1e-6;
  return{expected,actual,bodyDirection,headingMatches,planMatches,independentlyClippedEnd,displayAngle,displayMatches,
    complete:actual.visible===true&&bodyDirection.complete&&headingMatches&&planMatches&&displayMatches};
}
async function runtimeGroupEvidence() {
  const decodedAtlases = new Map();
  const pixelHash = async asset => {
    if (!decodedAtlases.has(asset.atlas)) {
      const atlas = runtime.atlases.find(item => item.key === asset.atlas);
      if (!atlas?.dataUri?.startsWith('data:image/png;base64,')) throw Error(`Atlas bytes missing for ${asset.atlas}`);
      decodedAtlases.set(asset.atlas, sharp(Buffer.from(atlas.dataUri.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    }
    const atlas = runtime.atlases.find(item => item.key === asset.atlas), rectangle = atlas.data.frames[asset.frame]?.frame;
    if (!rectangle) throw Error(`Real atlas frame missing for ${asset.frame}`);
    const { data, info } = await decodedAtlases.get(asset.atlas), rows = [];
    for (let row = 0; row < rectangle.h; row++) rows.push(data.subarray(((rectangle.y + row) * info.width + rectangle.x) * 4, ((rectangle.y + row) * info.width + rectangle.x + rectangle.w) * 4));
    return hash(Buffer.concat([Buffer.from(`${rectangle.w}:${rectangle.h}:`), ...rows]));
  };
  const groups = [];
  for (const group of requiredGroups) {
    const assets = Object.entries(runtime.assets).filter(([, asset]) => asset.animation?.group === group && !asset.aliasOf);
    const frames = await Promise.all(assets.map(async ([id, asset]) => ({ id, source: asset.source, sourceSha256: asset.sourceSha256,
      sourceFrame: asset.sourceFrame ?? null, index: asset.animation.index, frameCount: asset.animation.frameCount,
      approved: asset.animation.approved === true, sourceSize: asset.sourceSize, atlasPixelSha256: await pixelHash(asset) })));
    const count = expectedGroupCount(group), indices = frames.map(frame => frame.index).sort((a, b) => a - b);
    const uniquePixels = new Set(frames.map(frame => frame.atlasPixelSha256)).size;
    const complete = frames.length === count && indices.every((index, ordinal) => index === ordinal)
      && frames.every(frame => frame.approved && frame.frameCount === count && !oldActorSource(frame.source))
      && uniquePixels === count;
    groups.push({ group, complete, expectedCountFromContract: count, actualCount: frames.length, uniqueAtlasPixelFrames: uniquePixels,
      authoredMotionKind: count > 1 ? 'multi-frame' : 'single-key-frame-timed-response', frames });
  }
  return { scope: 'Actual selected-runtime groups and decoded native-atlas pixels. Distinct pixels do not establish good animation.',
    complete: groups.every(group => group.complete), missingOrInvalidGroups: groups.filter(group => !group.complete).map(group => group.group), groups };
}
function identities(diag) {
  return (diag.phaser?.nativeSprites ?? []).filter(sprite => sprite.visible).map(sprite => {
    const identity = identityByFrame.get(`${sprite.texture}:${sprite.frame}`);
    return { ...sprite, semanticId: identity?.id ?? null, source: identity?.source ?? null,
      visibleCssWidth: identity?.asset?.visibleBounds ? sprite.width * identity.asset.visibleBounds.width / identity.asset.width : null,
      visibleCssHeight: identity?.asset?.visibleBounds ? sprite.height * identity.asset.visibleBounds.height / identity.asset.height : null,
      sourceSha256: identity?.sourceSha256 ?? null, oldActorSource: identity ? oldActorSource(identity.source) : null };
  });
}
const viewOf = angle => Math.cos(angle) >= 0 ? Math.sin(angle) >= 0 ? 'front_right' : 'back_right' : Math.sin(angle) >= 0 ? 'front_left' : 'back_left';
function actorChecks(diag, expected) {
  const actors = diag.art?.actorFrames ?? [];
  const visible = actors.filter(actor => actor.visible !== false);
  const native = identities(diag);
  const actorNative = native.filter(sprite => /^(player(?::|$)|menu:(?:hero|tool)|probe:|actor:)/.test(sprite.id)
    || actors.some(actor => actor.actorId === sprite.id || actor.entityId === sprite.id));
  const hero = visible.find(actor => actor.actorId === 'player' || actor.actorId === 'menu:hero');
  const heroNative = native.find(sprite => sprite.id === hero?.actorId);
  const actualHero = heroNative ? identityByFrame.get(`${heroNative.texture}:${heroNative.frame}`) : undefined;
  const decoded = actualHero?.id.match(/\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.(\d+)$/);
  const nativeView = decoded && typeof heroNative.flipX === 'boolean'
    ? decoded[1].replace('_right', heroNative.flipX ? '_left' : '_right') : null;
  let expectedClip = null;
  if (hero?.actorId === 'menu:hero') expectedClip = 'idle';
  else if (expected?.player && expected.phase !== 'paused' && expected.phase !== 'result') expectedClip = expected.player.dashUntil > expected.elapsed ? 'dash'
    : expected.logical?.hurt || expected.action === 'hurt' ? 'hurt' : expected.player.moving ? 'walk' : 'idle';
  const expectedDirection = hero?.actorId === 'menu:hero' ? 'front_right' : expected?.player ? viewOf(expected.player.facing) : null;
  const expectedActorIds = expected?.expectedActorIds ?? [];
  const sourceFacilityIds = new Set((expected?.logicalTargets ?? expected?.targets ?? []).filter(target => target.role === 'source').map(target => target.id));
  const missingExpectedActorIds = expectedActorIds.filter(id => !visible.some(actor => (actor.actorId === id || actor.entityId === id) && actor.native === true)
    && !(sourceFacilityIds.has(id) && native.some(sprite => sprite.id === id && sprite.semanticId === 'fantasy.source.active')));
  const independentEnemies = (expected?.logicalTargets ?? expected?.targets ?? []).filter(target => !['event', 'capsule'].includes(target.role)).flatMap(target => {
    const sprite = native.find(item => item.id === target.id);
    if (!sprite) return [];
    if (target.role === 'source') return [{ actorId: target.id, expectedPrefix: 'fantasy.source.active', actualSemanticId: sprite.semanticId,
      matches: sprite.semanticId === 'fantasy.source.active' }];
    if (target.role === 'core') return [{ actorId: target.id, expectedPrefix: 'fantasy.actor.mother.', actualSemanticId: sprite.semanticId,
      matches: sprite.semanticId?.startsWith('fantasy.actor.mother.') === true }];
    const family = target.traits?.includes('FISSION') ? (target.generation ?? 0) > 0 ? 'fission.child' : 'fission.parent'
      : target.traits?.includes('CARAPACE') ? 'carapace' : target.traits?.includes('MIMIC') ? 'mimic' : target.tactic === 'thin-ray' ? 'thinRay' : 'basic';
    const clip = target.hp <= 0 ? 'dissolve' : target.hit || (target.hitUntil ?? 0) > expected.elapsed ? 'hurt'
      : target.windup || (target.attackAt ?? 0) > expected.elapsed ? 'windup' : 'walk';
    const prefix = `fantasy.actor.enemy.${family}.${clip}.`;
    return [{ actorId: target.id, family, expectedClip: clip, expectedPrefix: prefix, actualSemanticId: sprite.semanticId, matches: sprite.semanticId?.startsWith(prefix) === true }];
  });
  const registration = visible.filter(actor => actor.native === true).map(actor => {
    const sprite = native.find(item => item.id === actor.actorId), asset = sprite ? identityByFrame.get(`${sprite.texture}:${sprite.frame}`)?.asset : undefined;
    const b = asset?.sourceBounds, v = asset?.visibleBounds;
    if (!sprite || !b || !v) return { actorId: actor.actorId, available: false };
    const originX = sprite.flipX ? 1 - sprite.originX : sprite.originX, originY = sprite.flipY ? 1 - sprite.originY : sprite.originY;
    const inferredSourceAnchor = { x: b.x + (originX * asset.width - v.x) * b.width / v.width,
      y: b.y + (originY * asset.height - v.y) * b.height / v.height };
    const expectedAnchor = actor.identity === 'weapon.emitter' ? actor.sourceGrip : actor.sourceFoot;
    const error = expectedAnchor ? Math.hypot(inferredSourceAnchor.x - expectedAnchor.x, inferredSourceAnchor.y - expectedAnchor.y) : null;
    const canonicalHeroFoot = ['player','menu:hero'].includes(actor.actorId) && asset.sourceSize ? { x: asset.sourceSize.width * .5, y: asset.sourceSize.height * .85 } : null;
    return { actorId: actor.actorId, available: true, inferredSourceAnchor, declaredSourceAnchor: expectedAnchor,
      sourceAnchorErrorPixels: error, canonicalHeroFoot,
      canonicalHeroFootErrorPixels: canonicalHeroFoot ? Math.hypot(inferredSourceAnchor.x - canonicalHeroFoot.x, inferredSourceAnchor.y - canonicalHeroFoot.y) : null,
      nativeOriginScreen: { x: sprite.x, y: sprite.y }, declaredFootScreen: actor.screenFoot,
      originToFootPixels: actor.screenFoot ? Math.hypot(sprite.x - actor.screenFoot.x, sprite.y - actor.screenFoot.y) : null };
  });
  const weaponGeometry = visible.filter(actor => actor.identity === 'weapon.emitter' && actor.native).map(actor => {
    const sprite = native.find(item => item.id === actor.actorId), asset = sprite ? identityByFrame.get(`${sprite.texture}:${sprite.frame}`)?.asset : undefined;
    const b = asset?.sourceBounds, v = asset?.visibleBounds, projection = expected?.cameraProjection;
    if (!sprite || !b || !v || !asset.sourceMuzzle || !projection || !finitePoint(actor.sourceGrip) || !finitePoint(actor.grip) || !finitePoint(actor.muzzle)) return { actorId: actor.actorId, independentlyAvailable: false, matches: false };
    const scale = projection.unitX.x - projection.origin.x;
    const fromProjectedWorld = point => ({ x: projection.origin.x + point.x * scale, y: projection.origin.y + point.y * scale });
    const actualGripScreen = nativeSourcePoint(asset,sprite,actor.sourceGrip), actualMuzzleScreen = nativeSourcePoint(asset,sprite,asset.sourceMuzzle);
    const bodyHandScreen=nativeSourcePoint(actualHero?.asset,heroNative,actualHero?.asset?.actorRegistration?.grip);
    const handGripError=bodyHandScreen?Math.hypot(bodyHandScreen.x-actualGripScreen.x,bodyHandScreen.y-actualGripScreen.y):Infinity;
    const declaredGripScreen = fromProjectedWorld(actor.grip), declaredMuzzleScreen = fromProjectedWorld(actor.muzzle);
    const gripError = Math.hypot(actualGripScreen.x - declaredGripScreen.x, actualGripScreen.y - declaredGripScreen.y);
    const muzzleError = Math.hypot(actualMuzzleScreen.x - declaredMuzzleScreen.x, actualMuzzleScreen.y - declaredMuzzleScreen.y);
    return { actorId: actor.actorId, independentlyAvailable: true, actualGripScreen, actualMuzzleScreen,bodyHandScreen,handGripErrorPixels:handGripError,
      declaredGripScreen, declaredMuzzleScreen, gripErrorPixels: gripError, muzzleErrorPixels: muzzleError,
      nativeRotation: sprite.rotation, declaredRotation: actor.rotation,
      matches: handGripError<=1&&gripError <= 1 && muzzleError <= 1 && Number.isFinite(sprite.rotation) && angleError(sprite.rotation,actor.rotation) < 1e-5 };
  });
  return { contractVersion: diag.art?.actorContract?.version ?? null, preview: diag.art?.actorContract?.preview === true||diag.art?.actorContract?.animationPreview===true, actorCount: actors.length,
    groupsReady: diag.art?.actorContract?.ready === true,
    unexpectedActorIds: diag.art?.actorContract?.unexpectedActorIds ?? [],
    missingGroups: (diag.art?.actorContract?.groups ?? []).filter(group => !group.ready),
    oldSourceIds: diag.art?.actorContract?.oldSourceIds ?? [],
    oldNativeSources: actorNative.filter(sprite => sprite.oldActorSource),
    fallbacks: visible.filter(actor => actor.fallback || actor.native === false || actor.groupReady === false),
    missingProvenance: visible.filter(actor => !actor.semanticId || !/^[0-9a-f]{64}$/.test(actor.source?.sha256 ?? '') || !actor.source?.path
      || !(actor.identity === 'weapon.emitter' ? finitePoint(actor.sourceGrip) && finitePoint(actor.grip) && finitePoint(actor.muzzle) && Number.isFinite(actor.rotation) : finitePoint(actor.sourceFoot))
      || !finitePoint(actor.worldFoot) || !finitePoint(actor.screenFoot)),
    provenanceMismatches: visible.filter(actor => {
      const sprite = native.find(item => item.id === actor.actorId);
      return sprite && (sprite.sourceSha256 !== actor.source?.sha256 || String(sprite.source).replaceAll('\\', '/') !== String(actor.source?.path).replaceAll('\\', '/'));
    }),
    missingExpectedActorIds, independentEnemies, enemySemanticMismatches: independentEnemies.filter(item => !item.matches),
    nativeDispatchMismatches: visible.filter(actor => actor.native === true && !native.some(sprite =>
      sprite.id === actor.actorId && (sprite.frame === actor.frame || sprite.semanticId === actor.semanticId))),
    weaponGeometry, invalidWeaponGeometry: weaponGeometry.filter(item => !item.matches),
    registration, invalidSourceRegistration: registration.filter(item => !item.available ||
      item.sourceAnchorErrorPixels !== null && item.sourceAnchorErrorPixels > 1.1 || item.canonicalHeroFootErrorPixels !== null && item.canonicalHeroFootErrorPixels > 1.1),
    independentHero: expectedClip && hero ? { expectedClip, expectedDirection,
      actualSemanticId: actualHero?.id ?? null, decodedClip: decoded?.[2] ?? null, decodedView: nativeView,
      declaredClip: hero.clip, declaredDirection: hero.direction,
      clipMatches: decoded?.[2] === expectedClip && hero.clip === expectedClip,
      viewMatches: nativeView === expectedDirection && hero.direction === expectedDirection,
      actualNativeFlipX: heroNative?.flipX ?? null } : null,
    actors, native };
}
function strictChecks(checks) {
  return checks.contractVersion === 2 && !checks.preview && checks.groupsReady
    && (checks.actorCount > 0 || checks.independentEnemies.some(enemy=>enemy.expectedPrefix==='fantasy.source.active'))
    && !checks.oldSourceIds.length && !checks.unexpectedActorIds.length && !checks.oldNativeSources.length && !checks.fallbacks.length
    && !checks.missingProvenance.length && !checks.provenanceMismatches.length && !checks.nativeDispatchMismatches.length && !checks.invalidSourceRegistration.length && !checks.invalidWeaponGeometry.length && !checks.missingExpectedActorIds.length && !checks.enemySemanticMismatches.length
    && (!checks.independentHero || checks.independentHero.clipMatches && checks.independentHero.viewMatches);
}
async function screenshot(page, name) {
  const bytes = await page.screenshot(); const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = new Set(); for (let i = 0; i < info.width * info.height; i += 29) colors.add(`${data[i * info.channels] >> 3},${data[i * info.channels + 1] >> 3},${data[i * info.channels + 2] >> 3}`);
  return { ...(await writeArtifact(name, bytes)), width: info.width, height: info.height, quantizedColors: colors.size, meaningful: colors.size >= 32 };
}
function observeErrors(page, contextLabel) {
  page.on('pageerror', error => report.errors.push({ context: contextLabel, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ context: contextLabel, message: message.text() }); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.remoteRequests.push({ context: contextLabel, url: request.url() }); });
}

// Bundled from this source string into a separate DERIVED page. Production files are read only.
const fixtureSource = String.raw`
import art from './.art-generated/art-runtime.json';
import { GameSession } from './src/game/session';
import { Renderer } from './src/render/renderer';
import { MotherCoreController } from './src/game/motherCore';
import { enemyAttackPlan } from './src/game/enemyTactics';
import { createTerritoryState } from './src/game/territory';
import { summonImmuneCells, IMMUNE_CELL_BALANCE } from './src/game/immuneCells';
import { growthContext } from './src/game/growth';
import { COMPACT_COMBAT_MINIMUM_SCALE } from './src/render/camera';
const encode=JSON.stringify;
const tickAt=time=>Math.floor(time*60+1e-7);
const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}};
const sourceSession=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});sourceSession.start();
const source=JSON.parse(encode(sourceSession.snapshot())),sourceJson=encode(source);freeze(source);
const legacySession=new GameSession(71,{campaign:true,milestone:'G3'});legacySession.start();
const legacySource=JSON.parse(encode(legacySession.snapshot())),legacySourceJson=encode(legacySource);freeze(legacySource);
let renderer,serial=0,currentSpec,currentStates=[],removedAssets=[];
const originalAssetKeys=Object.keys(art.assets).sort().join('|');
function restoreAssets(){for(const[id,asset]of removedAssets)art.assets[id]=asset;removedAssets=[];return Object.keys(art.assets).sort().join('|')===originalAssetKeys;}
const views=[['front_right',Math.PI/4],['back_right',-Math.PI/4],['front_left',3*Math.PI/4],['back_left',-3*Math.PI/4]];
const actions=[['idle',1],['walk',1],['fire',.6],['walk-fire',1],['dash',.16],['charge',1.3],['release',.35],['scan',.6],['heal',.6],['hurt',.15]];
const cases=[];
for(const scene of ['heart','lung'])for(const owner of ['healthy','infected'])for(const low of [false,true])for(const [direction,angle]of views)
  cases.push({id:scene+'-'+owner+'-'+(low?'low':'standard')+'-'+direction,scene,owner,low,direction,angle,kind:'sequence',
    motherTraits:direction==='back_right'?['CARAPACE','MIMIC']:direction==='front_left'?['FISSION','MIMIC']:['CARAPACE','FISSION']});
for(const low of [false,true])cases.push({id:'training-'+(low?'low':'standard'),scene:'training',owner:'healthy',low,direction:'front_right',angle:Math.PI/4,kind:'sequence'});
cases.push({id:'menu',scene:'menu',owner:'healthy',low:false,direction:'front_right',angle:Math.PI/4,kind:'menu'});
for(const scene of ['heart','lung'])for(const owner of ['healthy','infected'])for(const low of [false,true])for(const compact of [false,true])
  cases.push({id:'dense48-'+scene+'-'+owner+'-'+(low?'low':'standard')+'-'+(compact?'compact':'desktop'),scene,owner,low,compact,direction:'front_right',angle:Math.PI/4,kind:'dense'});
for(const low of [false,true])for(let directionIndex=0;directionIndex<8;directionIndex++)for(const ruleVariant of ['carapace-protected','carapace-exposed','thinRay-locked-plan'])
 cases.push({id:'rule-'+ruleVariant+'-'+directionIndex+'-'+(low?'low':'standard'),scene:'heart',owner:'healthy',low,direction:'rule-'+directionIndex,
  directionIndex,angle:directionIndex*Math.PI/4,ruleVariant,kind:'rule-direction'});
cases.push({id:'forced-missing-actor-art',scene:'heart',owner:'infected',low:false,direction:'front_right',angle:Math.PI/4,kind:'fallback'});
function actor(id,x,y,changes={}){return{id,x,y,kind:'single',role:'virus',radius:25,hp:100,maxHp:100,hitUntil:0,scanned:true,traits:[],born:1,facing:0,...changes};}
function base(spec){
 const state=structuredClone(spec.scene==='lung'?legacySource:source);state.phase=spec.kind==='menu'?'menu':'playing';state.tick=600;state.elapsed=10;state.visualTime=10;
 state.world={width:1200,height:800,bounds:{left:65,right:1135,top:110,bottom:735},obstacles:[],foreground:{x:3000,y:3000,width:10,height:10}};
 Object.assign(state.player,{x:600,y:660,hp:95,facing:spec.angle,moving:false,dashUntil:0,hurtUntil:0,actionUntil:0});
 state.effects=[];state.events=[];state.targets=[];state.scanUntil=0;state.result=null;state.chargedSlash=undefined;state.playerProjectiles=[];
 state.tissue={x:400,y:640,radius:40,hp:60,maxHp:100};state.terminal={x:1000,y:700};state.tool=1;
 state.battle.organId=spec.scene==='lung'?'lung':'heart';state.battle.graph.nodes=[];state.battle.graph.edges=[];
 state.battle.lastAim={x:600+Math.cos(spec.angle)*300,y:660+Math.sin(spec.angle)*300};
 if(spec.scene==='lung'){
  delete state.territory;state.campaign.activeOrganId='lung';state.campaign.arenas.lung.activated=true;state.campaign.core.combat=undefined;
  state.battle.graph.nodes=[{id:'probe:lung-ground-owner',kind:'tissue',x:state.tissue.x,y:state.tissue.y,active:true,infected:spec.owner==='infected'}];
 }else{state.territory=createTerritoryState();for(const node of state.territory.nodes){node.owner=spec.owner;node.infectionProgress=spec.owner==='infected'?100:0;}state.campaign=undefined;}
 state.growth.runId='derived-actor-'+(++serial);state.growth.cells=[];state.growth.beacon=null;state.growth.beacons=[];state.growth.marks=[];state.growth.draft=null;state.growth.pendingResearch=null;
 if(spec.scene==='training'){delete state.battle;delete state.growth;delete state.endless;delete state.endlessGrowth;delete state.territory;}
 return state;
}
function lineup(state,spec){
 state.targets=[actor('probe:basic',180,300),actor('probe:thin-ray',350,300,{tactic:'thin-ray'}),actor('probe:carapace',520,300,{role:'elite',traits:['CARAPACE'],tactic:'crystal-charge'}),
 actor('probe:fission-parent',690,300,{traits:['FISSION'],generation:0,tactic:'fission-burst'}),actor('probe:fission-child',860,300,{traits:['FISSION'],generation:1,radius:17}),
 actor('probe:mimic',1030,300,{traits:['MIMIC'],tactic:'mimic-corrosion'}),actor('probe:invader',180,485,{territoryTask:{kind:'invade',nodeId:'heart-healing-1'}}),
 actor('probe:source',360,485,{role:'source',radius:34}),actor('probe:mother',965,565,{role:'core',radius:52,hp:680,maxHp:680,traits:spec.motherTraits??['CARAPACE','MIMIC']})];
 for(const target of state.targets)target.facing=spec.angle;
 const mother=state.targets.find(target=>target.role==='core');
 const combat=new MotherCoreController({coreId:mother.id,organId:state.battle.organId,traits:mother.traits,tick:state.tick,elapsed:state.elapsed}).state;
 if(state.territory){state.territory.bossCombat=combat;state.territory.bossId=mother.id;}
 else Object.assign(state.campaign.core,{status:'active',organId:state.battle.organId,actorId:mother.id,traits:mother.traits,combat});
 const beacon={id:'probe:beacon',organId:state.battle.organId,x:680,y:510,born:1,until:1000,radius:190,damage:30,interval:.8,nextAttackAt:100,tuning:'balanced',mode:'protocol'};
 state.growth.beacon=beacon;state.growth.beacons=[beacon];state.growth.cells=summonImmuneCells(beacon,growthContext(state),1);
 Object.assign(state.growth.cells[0],{x:680,y:510,born:1,facing:spec.angle,activity:'guarding',attackUntil:0});
}
function states(spec){
 const initial=base(spec);if(spec.kind==='menu')return[{state:initial,action:'menu',sample:0}];
 if(spec.kind==='rule-direction'){
  const theta=spec.angle,thin=spec.ruleVariant==='thinRay-locked-plan',exposed=spec.ruleVariant==='carapace-exposed';
  const target=actor('probe:rule-direction',650,420,{radius:32,facing:theta,traits:thin?[]:['CARAPACE'],tactic:thin?'thin-ray':'melee',
    exposedUntil:exposed?initial.elapsed+2:0,recoverUntil:!thin&&!exposed&&spec.directionIndex%2?initial.elapsed+1:0});
  initial.targets=[target];initial.player.x=thin?target.x+Math.cos(theta)*240:250;initial.player.y=thin?target.y+Math.sin(theta)*240:650;
  initial.player.facing=Math.atan2(target.y-initial.player.y,target.x-initial.player.x);initial.battle.lastAim={x:target.x,y:target.y};
  if(thin){target.facing=theta+Math.PI;target.attackPlan=enemyAttackPlan(target,initial);if(!target.attackPlan)throw Error('A real thin-ray plan was rejected in the supplied inspection world');
   target.attackAt=initial.elapsed+.6;target.attackWindup=target.attackPlan.windup;target.attackAim={...target.attackPlan.aim};target.attackTarget='player';
   target.x+=17;target.y+=11;}
  const halfAngle=Math.acos(.2),project=angle=>Math.atan2(Math.sin(angle)*.72,Math.cos(angle));
  const planAngle=thin?Math.atan2(target.attackPlan.aim.y-target.attackPlan.origin.y,target.attackPlan.aim.x-target.attackPlan.origin.x):theta;
  const ruleExpectation=thin?{kind:'thin-ray-plan',actorId:target.id,worldAngle:planAngle,requestedAngle:theta,projectedAngle:project(planAngle),
    planOrigin:target.attackPlan.origin,planAim:target.attackPlan.aim,planRange:target.attackPlan.range,planRadius:target.attackPlan.radius,worldBounds:initial.world.bounds,
    deliberatelyOppositeBodyFacing:target.facing,displacedCurrentBody:{x:target.x,y:target.y}}
   :{kind:'carapace-sector',actorId:target.id,worldAngle:theta,projectedAngle:project(theta),halfAngle,exposed,protected:!exposed,
    projectedBoundaryAngles:[project(theta-halfAngle),project(theta+halfAngle)],recoveryWithoutExposure:target.recoverUntil>initial.elapsed&&!exposed,
    ruleSamples:[0,halfAngle-1e-4,halfAngle+1e-4,Math.PI].map(delta=>({delta,protected:!exposed&&Math.cos(delta)>.2}))};
  return [false,true].map((labelsOff,sample)=>({state:structuredClone(initial),action:spec.ruleVariant,sample,labelsOff,ruleExpectation}));
 }
 if(spec.scene!=='training')lineup(initial,spec);
 if(spec.kind==='dense'){
  initial.targets=Array.from({length:48},(_,i)=>actor('probe:dense:'+i,190+(i%8)*115,200+Math.floor(i/8)*65,{traits:i%4===1?['CARAPACE']:i%4===2?['FISSION']:i%4===3?['MIMIC']:[],generation:i%8===6?1:0,facing:spec.angle}));
  if(initial.territory)initial.territory.bossCombat=undefined;if(initial.campaign)initial.campaign.core.combat=undefined;initial.growth.cells=[];initial.growth.beacon=null;initial.growth.beacons=[];
  return Array.from({length:12},(_,sample)=>{const state=structuredClone(initial);state.visualTime=10+sample/12;state.tick=tickAt(state.visualTime);state.elapsed=state.tick/60;return{state,action:'dense48',sample};});
 }
 const frames=[];let start=10;
 for(const [action,duration]of actions){
  start=Math.ceil(start*60-1e-7)/60;
  const count=action==='dash'||action==='hurt'?8:12;
  for(let sample=0;sample<count;sample++){
   const state=structuredClone(initial),age=duration*sample/count;state.visualTime=start+age;state.tick=tickAt(state.visualTime);state.elapsed=state.tick/60;
   state.player.moving=action==='walk'||action==='walk-fire';state.player.facing=spec.angle;
   if(state.player.moving){state.player.x+=Math.cos(spec.angle)*age*60;state.player.y+=Math.sin(spec.angle)*age*60;}
   if(action==='dash'){state.player.dashUntil=start+.16;state.player.x+=Math.cos(spec.angle)*age*160;state.player.y+=Math.sin(spec.angle)*age*160;}
   const aim={x:state.player.x+Math.cos(spec.angle)*300,y:state.player.y+Math.sin(spec.angle)*300};if(state.battle)state.battle.lastAim=aim;
   if(action==='fire'||action==='walk-fire'||action==='heal'){
    const tool=action==='heal'?3:1;state.tool=tool;state.player.actionUntil=state.elapsed+.1;
    state.events.push({type:'TOOL_FIRED',tick:Math.floor((state.elapsed-age% .18)*60),data:{tool,x:aim.x,y:aim.y,hit:false}});
    state.effects.push({id:1,kind:tool===3?'heal':'beam',from:{x:state.player.x,y:state.player.y},to:tool===3?state.tissue:aim,radius:tool===3?40:0,born:state.elapsed-.02,duration:.2});
   }
   if(action==='charge'){state.chargedSlash={startedAt:start-.25,aim};}
   if(action==='release'){state.events.push({type:'PLAYER_CHARGE_RELEASED',tick:tickAt(start),data:{progress:1}});state.effects.push({id:2,kind:'slash',from:state.player,to:aim,radius:90,born:start,duration:.35,angle:spec.angle});}
   if(action==='scan'){state.scanUntil=state.elapsed+1;state.effects.push({id:3,kind:'scan',from:state.player,to:state.player,radius:300,born:start,duration:.7});}
   if(action==='hurt'){state.player.hurtUntil=start+.55;state.events.push({type:'PLAYER_HURT',tick:tickAt(start),data:{damage:5,reason:'derived-inspection'}});}
   if(state.battle){
    const enemyAction=action==='walk'?'windup':action==='fire'?'attack':action==='scan'?'hurt':action==='heal'?'defeat'
      :action==='dash'||action==='release'?'recovery':'move';
    for(const target of state.targets){if(target.role==='source'||target.role==='core')continue;
     if(enemyAction==='move')target.x+=sample*2;
     if(enemyAction==='windup'||enemyAction==='attack'){target.attackAim={...state.player};target.attackTarget='player';target.attackPlan=enemyAttackPlan(target,state);
      target.attackWindup=target.attackPlan?.windup??1;target.attackAt=state.elapsed+(enemyAction==='windup'?target.attackWindup*(1-sample/count):0);}
     if(enemyAction==='hurt')target.hitUntil=state.elapsed+.1;
     if(enemyAction==='recovery')target.recoverUntil=state.elapsed+1;
     if(enemyAction==='defeat'){target.hp=0;target.deadAt=start;}
    }
    const combat=state.territory?.bossCombat??state.campaign.core.combat,mother=state.targets.find(target=>target.role==='core');
    combat.phase=action==='idle'?'awakening':action==='walk'?'windup':action==='heal'?'defeated':'recovery';combat.phaseStartedAt=start;combat.facing=spec.angle;
    combat.exposedUntil=action==='charge'||action==='scan'?start+duration+1:0;combat.membrane.remaining=combat.exposedUntil?0:2;
    if(action==='heal'){mother.hp=0;mother.deadAt=start;combat.cleared=true;combat.clearedAt=start;}
    const cell=state.growth.cells[0];cell.attackUntil=action==='scan'?state.elapsed+IMMUNE_CELL_BALANCE.attackPose*(1-sample/count):0;
    cell.activity=cell.attackUntil?'biting':'seeking';if(!cell.attackUntil)cell.x+=sample*2;
    frames.push({state,action,sample,enemyAction});
   }else frames.push({state,action,sample});
  }
  start+=duration+.2;
 }
 return frames;
}
async function prepare(id){
 currentSpec=cases.find(item=>item.id===id);if(!currentSpec)throw Error('Unknown case '+id);
 renderer?.destroy();await next();if(!restoreAssets())throw Error('Derived runtime assets were not restored');
 if(currentSpec.kind==='fallback')for(const id of Object.keys(art.assets))if(/^(fantasy\.actor\.|hero\.|enemy\.|mother\.|immune\.|weapon\.)/.test(id)){removedAssets.push([id,art.assets[id]]);delete art.assets[id];}
 const canvas=document.createElement('canvas');canvas.id='probe';document.querySelector('#probe').replaceWith(canvas);
 renderer=new Renderer(canvas);await renderer.ready;await document.fonts.ready;currentStates=states(currentSpec);
 return{spec:currentSpec,count:currentStates.length,sourceJson,sourceSha256:await digest(sourceJson),legacySourceJson,legacySourceSha256:await digest(legacySourceJson),artSignature:art.inputSignature};
}
async function render(index){
 const {state,...details}=currentStates[index],before=encode(state),beforeHash=await digest(before);
 // Missing availability is fixed before Renderer construction, not hidden by a
 // controller that has already cached a complete group. destroy() restores it.
  const compact=currentSpec.compact===true||renderer.camera.width<=1024||renderer.camera.height<=600,minimumScale=compact&&state.phase!=='menu'?COMPACT_COMBAT_MINIMUM_SCALE:undefined;
  const labels=renderer.painter.labels,drawLabels=labels.draw;if(details.labelsOff)labels.draw=()=>{};
  try{freeze(state);renderer.prepareCamera(state,{snap:true,...(minimumScale?{minimumScale}:{})});renderer.render(state,state.battle?.lastAim??{x:state.player.x+200,y:state.player.y},{lowEffects:currentSpec.low,cameraPrepared:true});await next();await next();}
  finally{labels.draw=drawLabels;}
  const after=encode(state),diagnostics=renderer.diagnostics(state);if(before!==after||sourceJson!==encode(source)||legacySourceJson!==encode(legacySource))throw Error('Renderer mutated supplied/source state');
  return{...details,index,tick:state.tick,elapsed:state.elapsed,phase:state.phase,expectedDirection:currentSpec.direction,player:{...state.player},
   cameraProjection:{origin:renderer.camera.worldToScreen({x:0,y:0}),unitX:renderer.camera.worldToScreen({x:1,y:0}),unitY:renderer.camera.worldToScreen({x:0,y:1})},
   camera:{actualScale:renderer.camera.scale,minimumScale:minimumScale??null,canvasCSS:{width:renderer.camera.width,height:renderer.camera.height},view:'Explicitly supplied 1200x800 inspection overview, not production arena framing'},
   expectedActorIds:state.phase==='menu'?['menu:hero','menu:tool']:['player',...state.targets.filter(t=>t.hp>0||t.role==='core'||t.deadAt!==undefined&&state.elapsed-t.deadAt<.3).map(t=>t.id),...(state.growth?.cells??[]).map(c=>c.id)],
   logicalTargets:state.targets.map(t=>({id:t.id,role:t.role,x:t.x,y:t.y,hp:t.hp,facing:t.facing,traits:t.traits,tactic:t.tactic,generation:t.generation,attackAt:t.attackAt,attackPlanned:!!t.attackPlan,attackPlan:t.attackPlan??null,hitUntil:t.hitUntil,deadAt:t.deadAt,recoverUntil:t.recoverUntil,exposedUntil:t.exposedUntil})),
   labelControl:details.labelsOff?'DERIVED probe temporarily suppresses only SceneLabels.draw; body, geometric cues and danger paths still render':'Normal actual Renderer label drawing',
   beforeSha256:beforeHash,afterSha256:await digest(after),completeStateUnchanged:before===after,sourceUnchanged:sourceJson===encode(source)&&legacySourceJson===encode(legacySource),
   forcedMissingAssetIds:removedAssets.map(([id])=>id),diagnostics};
}
window.__actorProbe={cases:()=>cases,prepare,render,states:()=>encode(currentStates),destroy:()=>{renderer?.destroy();return{assetsRestored:restoreAssets()};}};
`;

async function derivedEvidence() {
  const compiled = await bundle({ absWorkingDir: root, stdin: { contents: fixtureSource, resolveDir: root, sourcefile: 'actor-art-derived-probe.ts', loader: 'ts' },
    bundle: true, format: 'iife', target: ['chrome110', 'edge110'], outfile: join(output, 'derived/fixture.js'), metafile: true, legalComments: 'none', minify: false });
  const paths = Object.keys(compiled.metafile.inputs).filter(filename => /^(src\/|\.art-generated\/|node_modules\/)/.test(filename.replaceAll('\\', '/'))).sort();
  const fixtureManifest = await readManifest(paths);
  const mismatches = paths.filter(filename => metadata.sourceManifest[filename] !== fixtureManifest[filename]);
  if (mismatches.length) throw Error(`Derived Renderer imports differ from selected build: ${mismatches.join(', ')}`);
  report.derived.fixtureSourceManifest = fixtureManifest;
  report.derived.fixture = await writeArtifact('derived/fixture-source.ts', fixtureSource);
  report.derived.bundleSha256 = await fileHash(join(output, 'derived/fixture.js'));
  await writeArtifact('derived/index.html', '<!doctype html><meta charset="utf-8"><title>DERIVED actor inspection</title><style>html,body{margin:0;background:#120d1b;color:#fff;font:13px system-ui}header{height:40px;padding:4px;box-sizing:border-box}canvas{display:block;width:100vw;height:calc(100vh - 40px)}</style><header id="caption">DERIVED · supplied state · no gameplay/reachability/performance claim</header><canvas id="probe"></canvas><script src="fixture.js"></script>');
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height + 40 }, deviceScaleFactor: 1, offline: true });
  const page = await context.newPage(); observeErrors(page, 'derived');
  await page.goto(pathToFileURL(join(output, 'derived/index.html')).href);
  await page.waitForFunction(() => typeof window.__actorProbe?.prepare === 'function');
  const cases = await page.evaluate(() => window.__actorProbe.cases());
  for (const spec of cases) {
    await page.setViewportSize(spec.compact ? { width: 667, height: 360 } : { width: options.width, height: options.height + 40 });
    const setup = await page.evaluate(id => window.__actorProbe.prepare(id), spec.id);
    if (setup.artSignature !== runtime.inputSignature || setup.sourceSha256 !== hash(setup.sourceJson)
      ||setup.legacySourceSha256!==hash(setup.legacySourceJson)) throw Error('Derived art/source identity mismatch');
    if (!report.derived.sourceState) report.derived.sourceState = await writeArtifact('derived/source-session-start.json', setup.sourceJson);
    if (!report.derived.legacySourceState) report.derived.legacySourceState = await writeArtifact('derived/source-legacy-campaign-start.json', setup.legacySourceJson);
    const statesJson = await page.evaluate(() => window.__actorProbe.states());
    const suppliedStates = JSON.parse(statesJson);
    const frames = [], screenshots = [], stateFile = await writeArtifact(`derived/${spec.id}-supplied-states.json`, statesJson);
    for (let index = 0; index < setup.count; index++) {
      const frame = await page.evaluate(index => window.__actorProbe.render(index), index);
      frame.independentSuppliedStateHashMatch = hash(JSON.stringify(suppliedStates[index].state)) === frame.beforeSha256;
      if (!frame.independentSuppliedStateHashMatch || frame.beforeSha256 !== frame.afterSha256) throw Error(`Independent complete-state hash mismatch at ${spec.id}:${index}`);
      const checks = actorChecks(frame.diagnostics, frame),ruleDirections=ruleDirectionEvidence(frame.diagnostics,frame.ruleExpectation); frames.push({ ...frame, checks,ruleDirections });
      if (index === 0 || index === setup.count - 1 || frame.sample === 6 && ['walk', 'dash', 'charge', 'heal', 'hurt'].includes(frame.action)) {
        await page.locator('#caption').evaluate((node, text) => { node.textContent = text; }, `DERIVED · ${spec.id} · ${frame.action}/${frame.sample} · supplied clock/positions · no live simulation`);
        screenshots.push(await screenshot(page, `derived/${spec.id}-${index}-${frame.action}.png`));
      }
    }
    const trace = await writeArtifact(`derived/${spec.id}-frames.json`, JSON.stringify({ evidenceLevel: 'derived-renderer-supplied-state', spec, frames }, null, 2));
    const forced = spec.kind === 'fallback';
    const expectedGroundId=`${spec.scene==='lung'?'fantasy.lung.floor.':'fantasy.floor.'}${spec.owner}`;
    const groundCoverage={expectedId:expectedGroundId,actualImageIds:[...new Set(frames.flatMap(frame=>frame.diagnostics.art?.fantasyGround?.imageIds??[]))],
      complete:frames.every(frame=>frame.diagnostics.art?.fantasyGround?.imageIds?.includes(expectedGroundId))};
    const heroCssHeights=frames.flatMap(frame=>frame.checks.native.filter(sprite=>sprite.id==='player'&&Number.isFinite(sprite.visibleCssHeight)).map(sprite=>sprite.visibleCssHeight));
    const basicCssHeights=frames.flatMap(frame=>frame.checks.native.filter(sprite=>sprite.semanticId?.startsWith('fantasy.actor.enemy.basic.')&&Number.isFinite(sprite.visibleCssHeight)).map(sprite=>sprite.visibleCssHeight));
    report.derived.cases.push({ ...spec, frameCount: frames.length, trace, stateFile, screenshots,
      camera:frames[0]?.camera??null,cssVisibleBodyHeight:{hero:numericRange(heroCssHeights),basic:numericRange(basicCssHeights)},
      groundCoverage,
      ruleDirections:spec.kind==='rule-direction'?{complete:frames.every(frame=>frame.ruleDirections?.complete),
        observations:frames.map(frame=>({labelsOff:frame.labelsOff,...frame.ruleDirections})),
        humanReviewRequired:'Review both raw screenshots: the visible shield sector/locked heading must agree with the rule; fixed body details must not imply the opposite direction.'}:null,
      stateUnchanged: frames.every(frame => frame.independentSuppliedStateHashMatch && frame.completeStateUnchanged && frame.sourceUnchanged && frame.beforeSha256 === frame.afterSha256),
      strictNativeCoverage: !forced && frames.every(frame => strictChecks(frame.checks)),
      forcedFallback: forced ? { removedIds: [...new Set(frames.flatMap(frame => frame.forcedMissingAssetIds))],
        actualRasterIds: [...new Set(frames.flatMap(frame => frame.diagnostics.phaser?.rasterDimensions?.map(layer => layer.id) ?? []))],
        observedFallbacks: frames.flatMap(frame => frame.checks.fallbacks).length, scope: 'Explicit in-memory asset availability perturbation in derived probe only.' } : null,
      viewsObserved: [...new Set(frames.flatMap(frame => frame.checks.actors.filter(actor => actor.actorId === 'player').map(actor => actor.direction)))],
      actualFrames: [...new Set(frames.flatMap(frame => frame.checks.actors.map(actor => actor.semanticId + ':' + actor.frame)))],
      nativeSemanticIds:[...new Set(frames.flatMap(frame=>frame.checks.native.map(sprite=>sprite.semanticId).filter(Boolean)))],
    });
    textLog({ derived: spec.id, frames: frames.length, strictNativeCoverage: report.derived.cases.at(-1).strictNativeCoverage });
  }
  report.derived.restoration = await page.evaluate(() => window.__actorProbe.destroy()); await context.close();
  report.derived.completed = report.derived.cases.length === cases.length;
}

const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Only compact summary sets/ranges survive a drained batch. The raw evidence is
// the NDJSON file; there is no all-frames or expanded all-checks array in Node.
function createNaturalAccumulator(name) {
  const catalogue=new Map(),events=new Map(),provenance=new Map(),enemyFrames=new Map();
  const clips=Object.fromEntries(['idle','walk','dash','hurt'].map(clip=>[clip,new Set()]));
  const actions=Object.fromEntries(CONTRACT.natural.actions.map(action=>[action,{samples:0,nativeSamples:0,frames:new Set(),firstTick:null,lastTick:null}]));
  const counts={header:0,catalogue:0,event:0,player:0,scene:0,transition:0};
  const directions=new Set(),renderedDirections=new Set(),failures=[],transportErrors=[];
  const ranges={scale:null,hero:null,basic:null};
  let firstElapsed=null,lastElapsed=null,maxAlive=0,checkedFrames=0,invalidFrames=0,notApplicable=0,lastSequence=0,lastWallMs=-Infinity;
  let fallbackFrames=0,oldActorFrames=0,naturalLungReached=false,recordCount=0,eventBytes=0;
  const addRange=(key,value)=>{if(Number.isFinite(value))ranges[key]=ranges[key]?{min:Math.min(ranges[key].min,value),max:Math.max(ranges[key].max,value)}:{min:value,max:value};};
  const transportError=message=>{if(transportErrors.length<100)transportErrors.push(message);};
  function ingest(record) {
    recordCount++;
    if(!Object.hasOwn(counts,record.kind)){transportError(`Unknown record kind at ${recordCount}`);return;}
    counts[record.kind]++;
    if(record.kind==='header')return;
    if(record.kind==='catalogue'){
      if(catalogue.has(record.key)&&JSON.stringify(catalogue.get(record.key))!==JSON.stringify(record.value))transportError(`Conflicting catalogue key ${record.key}`);
      else if(!catalogue.has(record.key)&&catalogue.size>=RECORDER_POLICY.maxCatalogueEntries)transportError('Node catalogue limit exceeded');
      else catalogue.set(record.key,record.value);
      return;
    }
    if(record.kind==='event'){
      const key=JSON.stringify(record.event);
      if(!events.has(key)){
        const bytes=Buffer.byteLength(key);
        if(events.size>=RECORDER_POLICY.maxEventKeys||eventBytes+bytes>RECORDER_POLICY.maxEventBytes)transportError('Node event limit exceeded');
        else{events.set(key,record.event);eventBytes+=bytes;}
      }
      return;
    }
    const frame=record.frame;
    if(!frame||!Number.isFinite(frame.wallMs)||!Number.isFinite(frame.elapsed)){transportError(`Invalid frame at record ${recordCount}`);return;}
    if(record.kind==='player'){
      if(record.sequence!==lastSequence+1)transportError(`Player rAF sequence gap: ${lastSequence} -> ${record.sequence}`);
      if(frame.wallMs<lastWallMs)transportError(`Player wall-clock reversed at ${record.sequence}`);
      lastSequence=record.sequence;lastWallMs=frame.wallMs;
      firstElapsed??=frame.elapsed;lastElapsed=frame.elapsed;
      maxAlive=Math.max(maxAlive,frame.alive??0);naturalLungReached||=frame.organ==='lung';
      if(frame.phase==='playing'){
        directions.add(frame.expectedView);
        if(!frame.previewActive)addRange('scale',frame.cameraProjection?.unitX.x-frame.cameraProjection?.origin.x);
      }
    }
    const actors=(frame.art?.actorFrames??[]).map(actor=>{
      const entry=catalogue.get(actor.catalogueKey);
      if(!entry)transportError(`Catalogue reference precedes definition: ${actor.catalogueKey}`);
      return {...entry,...actor};
    });
    const checks=actorChecks({art:{...frame.art,actorFrames:actors},phaser:frame.phaser},frame);
    // Removal/offscreen observations preserve the logical transition, but they
    // do not provide native-body proof and never count as checked animation.
    const applicable=record.kind!=='transition'||actors.some(actor=>actor.visible!==false)||(frame.targets??[]).some(target=>target.role==='source'
      &&(frame.phaser?.nativeSprites??[]).some(sprite=>sprite.id===target.id&&sprite.visible));
    const valid=applicable&&strictChecks(checks);
    if(!applicable)notApplicable++;
    else{
      checkedFrames++;
      if(!valid){
        invalidFrames++;
        if(failures.length<50)failures.push({record:recordCount,kind:record.kind,sequence:record.sequence??null,tick:frame.tick,
          invalid:Object.fromEntries(Object.entries(checks).filter(([key,value])=>Array.isArray(value)&&value.length&&/^(missing|invalid|old|unexpected|fallback|.*Mismatches)/.test(key)).map(([key,value])=>[key,value.length])),
          independentHero:checks.independentHero,actorIds:actors.slice(0,16).map(actor=>actor.actorId)});
      }
      if(checks.fallbacks.length)fallbackFrames++;
      if(checks.oldNativeSources.length||checks.oldSourceIds.length)oldActorFrames++;
    }
    for(const sprite of checks.native){
      if(sprite.source&&!provenance.has(sprite.semanticId))provenance.set(sprite.semanticId,sprite);
      if(record.kind==='player'&&sprite.id==='player')addRange('hero',sprite.visibleCssHeight);
      if(record.kind!=='player'&&sprite.semanticId?.startsWith('fantasy.actor.enemy.basic.'))addRange('basic',sprite.visibleCssHeight);
    }
    if(valid){
      for(const enemy of checks.independentEnemies.filter(enemy=>enemy.family&&enemy.matches&&checks.actors.some(actor=>actor.actorId===enemy.actorId&&actor.visible!==false&&actor.native)))
        enemyFrames.set(`${enemy.family}:${enemy.expectedClip}:${enemy.actualSemanticId}`,enemy);
    }
    if(record.kind!=='player')return;
    const playerSprite=checks.native.find(sprite=>sprite.id==='player');
    const actualHero=playerSprite?.semanticId?.match(/\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.(\d+)$/);
    if(valid&&actualHero){
      clips[actualHero[2]].add(playerSprite.frame);
      renderedDirections.add(actualHero[1].replace('_right',playerSprite.flipX?'_left':'_right'));
    }
    if(frame.phase==='playing')for(const action of CONTRACT.natural.actions)if(frame.logical?.[action]){
      const summary=actions[action];summary.samples++;summary.firstTick??=frame.tick;summary.lastTick=frame.tick;
      if(valid&&actualHero){summary.nativeSamples++;summary.frames.add(`${playerSprite.semanticId}:${playerSprite.frame}`);}
    }
  }
  function finish(status,stream) {
    for(const key of Object.keys(counts))if(status?.counts?.[key]!==counts[key])transportError(`Stream count mismatch for ${key}: ${counts[key]} vs ${status?.counts?.[key]}`);
    if(counts.header!==1)transportError(`Expected one trace header, observed ${counts.header}`);
    if(status?.recordCount!==recordCount)transportError(`Total stream count mismatch: ${recordCount} vs ${status?.recordCount}`);
    if(status?.emittedBytes!==stream.bytes)transportError(`Encoded stream byte mismatch: ${stream.bytes} vs ${status?.emittedBytes}`);
    if(status?.active!==false)transportError('Recorder did not stop');
    if(status?.pendingBytes!==0||status?.pendingRecords!==0)transportError('Recorder has undrained pending records');
    if(status?.error)transportError(`Page recorder: ${status.error}`);
    if(stream.error)transportError(`Node stream: ${stream.error}`);
    const captureComplete=counts.player>0&&transportErrors.length===0;
    return {name,trace:stream.file,frameCount:counts.player,frameCountScope:'Continuous observed player/tool rAF records only; enemy scene/transition observations are separate tiers.',
      tierCounts:{...counts,checkedFrames,notApplicableTransitionPoints:notApplicable},
      transport:{captureComplete,policy:RECORDER_POLICY,recordCount,batches:stream.batches,bytes:stream.bytes,maxBatchBytes:stream.maxBatchBytes,
        pageMaxPendingBytes:status?.maxPendingBytes??null,pageMaxPendingRecords:status?.maxPendingRecords??null,pageCounts:status?.counts??null,
        retainedEventBytes:eventBytes,errors:transportErrors},
      simulationSeconds:firstElapsed===null?0:lastElapsed-firstElapsed,maxAlive,
      actionCoverage:Object.fromEntries(Object.entries(actions).map(([action,item])=>[action,{observed:item.samples>0,samples:item.samples,nativeSamples:item.nativeSamples,
        actualPlayerFrames:[...item.frames],firstTick:item.firstTick,lastTick:item.lastTick}])),
      heroClipFrames:Object.fromEntries(Object.entries(clips).map(([clip,frames])=>[clip,[...frames]])),enemyStateFrames:[...enemyFrames.values()],
      camera:{scope:'Actual production main.ts camera; no supplied camera overrides',normalScaleRange:ranges.scale},
      cssVisibleBodyHeight:{hero:ranges.hero,basic:ranges.basic},directions:[...directions],actuallyRenderedDirections:[...renderedDirections],
      strictNativeCoverage:captureComplete&&checkedFrames>0&&invalidFrames===0,invalidFrames,firstInvalidFrames:failures,provenance:[...provenance.values()],fallbackFrames,oldActorFrames,
      eventTypes:[...new Set([...events.values()].map(event=>event.type))],events:[...events.values()],naturalLungReached,
      actorContactReview:'Continuous player/tool feet and native geometry are recorded at each observed rAF. Enemy/native geometry is sampled every 100ms plus rAF-observed logical transition points; enemy animation continuity is not inferred. Review the matching video for visible sliding/grip/scale jumps.'};
  }
  return {ingest,finish};
}
function createNDJSONConsumer(accumulator) {
  let pending='',records=0;
  return {feed(chunk){
    pending+=chunk;let start=0,end;
    while((end=pending.indexOf('\n',start))!==-1){
      const line=pending.slice(start,end);start=end+1;if(!line)throw Error('Empty NDJSON record');
      if(Buffer.byteLength(line)>RECORDER_POLICY.maxRecordBytes)throw Error('NDJSON record exceeds configured cap');
      accumulator.ingest(JSON.parse(line));records++;
    }
    pending=pending.slice(start);
    if(Buffer.byteLength(pending)>RECORDER_POLICY.maxRecordBytes)throw Error('Partial NDJSON record exceeds configured cap');
  },finish(){if(pending.length)throw Error('Truncated final NDJSON record');return {records};}};
}
const recorderSessions=new WeakMap();
async function drainRecorder(session,stop=false) {
  if(session.inFlight)await session.inFlight;
  const operation=(async()=>{
    const batch=await session.page.evaluate(stop=>{
      const buffer=window.__actorEvidence;if(!buffer)throw Error('Recorder missing');
      if(stop)buffer.active=false;
      const chunk=buffer.pending.join('');buffer.pending=[];buffer.pendingBytes=0;
      return {chunk,status:{active:buffer.active,error:buffer.error,recordCount:buffer.recordCount,emittedBytes:buffer.emittedBytes,counts:{...buffer.counts},pendingBytes:buffer.pendingBytes,
        pendingRecords:buffer.pending.length,maxPendingBytes:buffer.maxPendingBytes,maxPendingRecords:buffer.maxPendingRecords}};
    },stop);
    if(batch.chunk){
      const bytes=Buffer.from(batch.chunk,'utf8');
      await session.handle.writeFile(bytes);session.hasher.update(bytes);session.bytes+=bytes.length;session.batches++;session.maxBatchBytes=Math.max(session.maxBatchBytes,bytes.length);
      session.consumer.feed(batch.chunk);
    }
    session.status=batch.status;
  })();
  session.inFlight=operation;
  try{await operation;}finally{if(session.inFlight===operation)session.inFlight=null;}
}
async function installRecorder(page,name) {
  if(recorderSessions.has(page))throw Error('A Node recorder is already active');
  const filename=join(output,`natural/${name}-rAF.ndjson`);await mkdir(dirname(filename),{recursive:true});
  const accumulator=createNaturalAccumulator(name),session={page,name,accumulator,consumer:createNDJSONConsumer(accumulator),handle:await open(filename,'wx'),filename,
    hasher:createHash('sha256'),bytes:0,batches:0,maxBatchBytes:0,error:null,inFlight:null,timer:null,status:null};
  recorderSessions.set(page,session);
  try{
    await page.evaluate(({name,policy})=>{
      if(window.__actorEvidence)throw Error('A recorder is already active');
      const encoder=new TextEncoder(),buffer={name,pending:[],pendingBytes:0,active:true,error:null,recordCount:0,emittedBytes:0,
        counts:{header:0,catalogue:0,event:0,player:0,scene:0,transition:0},maxPendingBytes:0,maxPendingRecords:0,started:performance.now()};
      const catalogue=new Map(),eventKeys=new Set();let eventBytes=0,previousTargets=new Map(),previousActors=new Map(),lastScene=-Infinity;
      window.__actorEvidence=buffer;
      const fail=error=>{buffer.error=String(error);buffer.active=false;};
      function enqueue(record){
        if(!buffer.active)return false;
        const line=JSON.stringify(record)+'\n',bytes=encoder.encode(line).byteLength;
        if(bytes>policy.maxRecordBytes||buffer.pendingBytes+bytes>policy.maxPendingBytes||buffer.pending.length>=policy.maxPendingRecords){fail(`Hard evidence cap exceeded (${record.kind}, record=${bytes}, pending=${buffer.pendingBytes}); capture incomplete`);return false;}
        buffer.pending.push(line);buffer.pendingBytes+=bytes;buffer.emittedBytes+=bytes;buffer.recordCount++;buffer.counts[record.kind]++;
        buffer.maxPendingBytes=Math.max(buffer.maxPendingBytes,buffer.pendingBytes);buffer.maxPendingRecords=Math.max(buffer.maxPendingRecords,buffer.pending.length);return true;
      }
      enqueue({kind:'header',schemaVersion:2,name,evidenceLevel:'natural-dom-input-rAF-video',policy,
        scope:'Player/tool at every observed rAF; enemy scenes every100ms plus observed logical transition points. Catalogue definitions precede references. No gameplay mutation.'});
      const expectedView=angle=>Math.cos(angle)>=0?Math.sin(angle)>=0?'front_right':'back_right':Math.sin(angle)>=0?'front_left':'back_left';
      const isPlayer=actor=>['player','player:tool','menu:hero','menu:tool'].includes(actor.actorId);
      function packActor(actor){
        const {source,sourceFoot,sourceGrip,sourceMuzzle,identity,motionMethod,ruleCue,...dynamic}=actor;
        const value={source,sourceFoot,sourceGrip,sourceMuzzle,identity,motionMethod},key=JSON.stringify([actor.semanticId,value]);
        let catalogueKey=catalogue.get(key);
        if(!catalogueKey){
          if(catalogue.size>=policy.maxCatalogueEntries){fail('Catalogue entry cap exceeded');return null;}
          catalogueKey=`c${catalogue.size+1}`;
          if(!enqueue({kind:'catalogue',key:catalogueKey,value}))return null;
          catalogue.set(key,catalogueKey);
        }
        return {...dynamic,catalogueKey};
      }
      function sample(now){
        if(!buffer.active)return;
        try{
          const state=window.__viral.snapshot(),diagnostics=window.__viral.diagnostics(),rawActors=diagnostics.art?.actorFrames??[];
          for(const event of state.events){
            const key=JSON.stringify(event);if(eventKeys.has(key))continue;
            const bytes=encoder.encode(key).byteLength;
            if(eventKeys.size>=policy.maxEventKeys||eventBytes+bytes>policy.maxEventBytes){fail('Event key/byte cap exceeded');return;}
            if(!enqueue({kind:'event',event}))return;eventKeys.add(key);eventBytes+=bytes;
          }
          const recent=(type,seconds,test=()=>true)=>state.events.some(event=>event.type===type&&state.elapsed-event.tick/60>=-1e-7&&state.elapsed-event.tick/60<=seconds&&test(event));
          const hurtReaction=state.player.hurtUntil>state.elapsed&&state.events.some(event=>{
            const age=state.elapsed-event.tick/60;
            return event.type==='PLAYER_HURT'&&Number.isInteger(event.tick)&&event.tick>=0&&event.tick<=state.tick
              &&typeof event.data.damage==='number'&&Number.isFinite(event.data.damage)&&event.data.damage>0&&age>=-1e-8&&age+1e-8<.15;
          });
          const logical={idle:!state.player.moving,walk:state.player.moving,fire:recent('TOOL_FIRED',.2,event=>event.data.tool===1),
            dash:state.player.dashUntil>state.elapsed,charge:!!state.chargedSlash,release:recent('PLAYER_CHARGE_RELEASED',.4),scan:recent('SCAN_COMPLETED',.7),
            heal:recent('TOOL_FIRED',.3,event=>event.data.tool===3),hurt:hurtReaction,infection:!!state.playerInfection};
          logical['walk-fire']=logical.walk&&logical.fire;
          const cameraProjection={origin:window.__viral.toScreen({x:0,y:0}),unitX:window.__viral.toScreen({x:1,y:0}),unitY:window.__viral.toScreen({x:0,y:1})};
          const contract=diagnostics.art?.actorContract;
          const actorContract=contract?{version:contract.version,preview:contract.preview,animationPreview:contract.animationPreview,ready:contract.ready,
            oldSourceIds:contract.oldSourceIds,unexpectedActorIds:contract.unexpectedActorIds,groups:contract.groups?.filter(group=>!group.ready)}:null;
          const base={wallMs:now-buffer.started,tick:state.tick,elapsed:state.elapsed,phase:state.phase,organ:state.battle?.organId??'training',
            wave:state.endless?.wave??null,stage:state.territory?.stage??null,player:{...state.player},playerScreen:window.__viral.toScreen(state.player),
            expectedView:expectedView(state.player.facing),logical,cameraProjection,previewActive:!!diagnostics.touch?.preview,
            alive:state.targets.filter(target=>target.hp>0&&target.role!=='event').length};
          function frameFor(actors,targets,kind){
            const actorFrames=actors.map(packActor);if(!buffer.active)return null;
            const ids=new Set(actors.flatMap(actor=>[actor.actorId,actor.entityId]));for(const target of targets)ids.add(target.id);
            const nativeSprites=(diagnostics.phaser?.nativeSprites??[]).filter(sprite=>ids.has(sprite.id));
            const visibleIds=actors.filter(actor=>actor.visible!==false).map(actor=>actor.actorId);
            for(const target of targets)if(target.role==='source'&&nativeSprites.some(sprite=>sprite.id===target.id&&sprite.visible))visibleIds.push(target.id);
            return {...base,targets,expectedActorIds:kind==='player'?(state.phase==='menu'?['menu:hero','menu:tool']:['player','player:tool']):visibleIds,
              effects:kind==='player'?state.effects.map(effect=>({id:effect.id,kind:effect.kind,born:effect.born,duration:effect.duration,from:effect.from,to:effect.to})):[],
              art:{signature:diagnostics.art?.signature,actorFrames,actorContract,
                ruleDirections:kind==='player'?[]:(diagnostics.art?.ruleDirections??[]).filter(cue=>ids.has(cue.actorId))},
              phaser:{nativeSprites,rasterDimensions:(diagnostics.phaser?.rasterDimensions??[]).filter(layer=>layer.id.startsWith('actor:')&&(kind==='scene'||[...ids].some(id=>layer.id.includes(id))))}};
          }
          const playerFrame=frameFor(rawActors.filter(isPlayer),[],'player');
          if(!playerFrame||!enqueue({kind:'player',sequence:buffer.counts.player+1,frame:playerFrame}))return;
          const compactTargets=state.targets.map(target=>({id:target.id,role:target.role,tactic:target.tactic,traits:target.traits,generation:target.generation,
            hp:target.hp,x:target.x,y:target.y,facing:target.facing,expectedView:expectedView(target.facing??0),
            windup:(target.attackAt??0)>state.elapsed,attackPlanned:!!target.attackPlan,attackPlan:target.attackPlan,charge:target.charge,
            recover:(target.recoverUntil??0)>state.elapsed,hit:target.hitUntil>state.elapsed,exposed:(target.exposedUntil??0)>state.elapsed,
            deadAt:target.deadAt,invasion:target.territoryTask??null}));
          if(compactTargets.length>policy.maxTrackedTargets){fail('Tracked target cap exceeded');return;}
          const core=state.territory?.bossCombat??state.campaign?.core?.combat;
          const coreSignature=core?[core.phase,core.activeTrait,core.phaseIndex,core.attack?.id??null,core.exposedUntil>state.elapsed,
            core.membrane?.remaining,core.membrane?.thresholdReached,core.cleared]:null;
          const nextTargets=new Map(),changes=[];
          for(const target of compactTargets){
            const signature=JSON.stringify([target.role,target.tactic,target.traits,target.generation,target.hp<=0,target.hit,target.windup,target.attackPlan??null,
              !!target.charge,target.recover,target.exposed,target.invasion,target.role==='core'?coreSignature:null]);
            nextTargets.set(target.id,signature);
            if(previousTargets.get(target.id)!==signature)changes.push({id:target.id,change:previousTargets.has(target.id)?'logical-state-change':'spawn',signature});
          }
          for(const id of previousTargets.keys())if(!nextTargets.has(id))changes.push({id,change:'removed',nativeProof:'not-applicable-without-current-visible-native-body'});
          previousTargets=nextTargets;
          const nextActors=new Map();
          for(const actor of rawActors.filter(actor=>!isPlayer(actor))){
            const signature=JSON.stringify([actor.identity,actor.action,actor.logicalAction,actor.clip,actor.visible!==false,actor.native,actor.groupReady,actor.fallback]);
            nextActors.set(actor.actorId,signature);
            if(previousActors.get(actor.actorId)!==signature)changes.push({id:actor.actorId,entityId:actor.entityId,
              change:previousActors.has(actor.actorId)?'actor-logical-state-change':'actor-observed',signature});
          }
          if(nextActors.size>policy.maxTrackedTargets){fail('Tracked actor cap exceeded');return;}
          for(const id of previousActors.keys())if(!nextActors.has(id))changes.push({id,change:'actor-no-longer-observed',nativeProof:'not-applicable-without-current-visible-native-body'});
          previousActors=nextActors;
          if(now-lastScene>=policy.sceneSampleMs){
            const frame=frameFor(rawActors,compactTargets,'scene');if(!frame||!enqueue({kind:'scene',frame}))return;lastScene=now;
          }
          if(changes.length){
            const changedIds=new Set(changes.map(change=>change.id)),targets=compactTargets.filter(target=>changedIds.has(target.id));
            const actors=rawActors.filter(actor=>!isPlayer(actor)&&(changedIds.has(actor.actorId)||changedIds.has(actor.entityId)));
            const frame=frameFor(actors,targets,'transition');if(!frame||!enqueue({kind:'transition',changes,frame}))return;
          }
        }catch(error){fail(error instanceof Error?error.stack:String(error));return;}
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    },{name,policy:RECORDER_POLICY});
    session.timer=setInterval(()=>{
      if(session.inFlight||session.error)return;
      void drainRecorder(session).catch(error=>{session.error=error instanceof Error?error.stack:String(error);clearInterval(session.timer);});
    },RECORDER_POLICY.streamFlushMs);
  }catch(error){recorderSessions.delete(page);await session.handle.close();throw error;}
}
async function stopRecorder(page,name) {
  const session=recorderSessions.get(page);if(!session||session.name&&session.name!==name)throw Error('Recorder session mismatch');
  clearInterval(session.timer);
  try{
    try{if(session.inFlight)await session.inFlight;}catch(error){session.error??=String(error);}
    try{await drainRecorder(session,true);session.consumer.finish();}catch(error){session.error??=error instanceof Error?error.stack:String(error);}
  }finally{await session.handle.close();recorderSessions.delete(page);}
  const file={path:label(session.filename),sha256:session.hasher.digest('hex'),bytes:session.bytes,encoding:'UTF-8 NDJSON'};
  return session.accumulator.finish(session.status,{file,bytes:session.bytes,batches:session.batches,maxBatchBytes:session.maxBatchBytes,error:session.error});
}
async function fixtureClockSelfCheck(){
  // Execute only the supplied-state factory in Node. Renderer/Phaser and art
  // imports are excluded; this validates evidence construction, not rendering.
  const factory=fixtureSource.slice(0,fixtureSource.indexOf('async function prepare(id)'))
    .replace("import art from './.art-generated/art-runtime.json';","const art={assets:{},inputSignature:'harness-only'};")
    .replace("import { Renderer } from './src/render/renderer';",'');
  const contents=factory+String.raw`
import { requestedHeroAnimation, HERO_HURT_REACTION_SECONDS } from './src/render/heroAnimation';
export function inspectFixtureClock(){
 const issues=[],events={hurt:0,release:0};let stateCount=0;
 for(const spec of cases)for(const supplied of states(spec)){
  const {state,action,sample}=supplied;stateCount++;
  const fail=reason=>{if(issues.length<100)issues.push({case:spec.id,action,sample,tick:state.tick,elapsed:state.elapsed,visualTime:state.visualTime,reason});};
  if(!Number.isInteger(state.tick)||Math.abs(state.elapsed-state.tick/60)>1e-9)fail('Simulation elapsed is not aligned to its fixed tick');
  if(state.visualTime+1e-7<state.elapsed||state.visualTime-state.elapsed>=1/60+1e-7)fail('Visual interpolation time is outside the current simulation tick');
  for(const event of state.events.filter(event=>event.type==='PLAYER_HURT'||event.type==='PLAYER_CHARGE_RELEASED')){
   const key=event.type==='PLAYER_HURT'?'hurt':'release',age=state.elapsed-event.tick/60;
   events[key]++;
   if(!Number.isInteger(event.tick)||event.tick>state.tick||event.tick/60>state.elapsed+1e-9||age<0)fail('Accepted '+event.type+' event is in the future');
   const window=key==='hurt'?HERO_HURT_REACTION_SECONDS:state.effects.find(effect=>effect.kind==='slash')?.duration;
   if(!Number.isFinite(window)||age<0||age>=window-1e-8)fail('Accepted '+event.type+' event is outside its actual action window');
  }
  if(action==='hurt'&&requestedHeroAnimation(state).clip!=='hurt')fail('Supplied hurt action does not meet the actual positive-hurt rule');
  if(action==='dash'&&requestedHeroAnimation(state).clip!=='dash')fail('Supplied dash action does not meet the actual dash window');
 }
 return{caseCount:cases.length,stateCount,events,issues,pass:issues.length===0};
}`;
  const compiled=await bundle({absWorkingDir:root,stdin:{contents,resolveDir:root,sourcefile:'actor-fixture-clock-self-check.ts',loader:'ts'},bundle:true,
    platform:'node',format:'esm',target:['node24'],write:false,legalComments:'none'});
  const module=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  return{scope:'Pure Node supplied-state factory and actual hero action timing helper; no browser/Renderer/production art or build loaded.',...module.inspectFixtureClock()};
}
async function recorderSelfCheck(){
  const savedIdentities=new Map(identityByFrame),assertions=[];
  const assert=(name,pass,details)=>assertions.push({name,pass:!!pass,...(details===undefined?{}:{details})});
  try{
    identityByFrame.clear();
    const foot={x:256,y:435.2},grip={x:256,y:340},toolGrip={x:256,y:256},muzzle={x:480,y:256};
    const assets=[['hero00','fantasy.actor.hero.front_right.idle.00','a'],['hero01','fantasy.actor.hero.front_right.walk.01','b'],['tool','fantasy.actor.weapon.emitter','c']];
    const entries=assets.map(([frame,id,hex],index)=>{
      const tool=index===2,source=`self-check/${frame}.png`,sourceSha256=hex.repeat(64),sourceFoot=tool?null:foot,sourceGrip=tool?toolGrip:grip;
      const asset={width:512,height:512,sourceBounds:{x:0,y:0,width:512,height:512},visibleBounds:{x:0,y:0,width:512,height:512},
        sourceSize:{width:512,height:512},sourceMuzzle:tool?muzzle:null,actorRegistration:{foot:tool?toolGrip:foot,grip:sourceGrip}};
      identityByFrame.set(`self-check:${frame}`,{id,source,sourceSha256,asset});
      return {kind:'catalogue',key:`c${index}`,value:{source:{path:source,sha256:sourceSha256},sourceFoot,sourceGrip,sourceMuzzle:tool?muzzle:null,identity:tool?'weapon.emitter':'hero',motionMethod:'self-check-fixture'}};
    });
    function frame(sequence,walking=false,wrong=null){
      const bodyId=assets[walking?1:0][1],worldFoot={x:100,y:200/.72},screenFoot={x:100,y:200};
      const body={actorId:'player',entityId:'player',semanticId:bodyId,frame:bodyId,identity:'hero',clip:walking?'walk':'idle',direction:'front_right',
        catalogueKey:`c${walking?1:0}`,native:true,visible:true,groupReady:true,worldFoot,screenFoot};
      const tool={actorId:'player:tool',entityId:'player',semanticId:assets[2][1],frame:assets[2][1],clip:'static',catalogueKey:'c2',native:true,visible:true,groupReady:true,
        worldFoot,screenFoot,grip:{x:100,y:176.2},muzzle:{x:128,y:176.2},rotation:0};
      const native=(id,key,x,y,size,originY)=>({id,texture:'self-check',frame:key,x,y,width:size,height:size,originX:.5,originY,rotation:0,flipX:false,flipY:false,visible:true});
      return {kind:'player',sequence,frame:{tick:sequence,elapsed:sequence/60,wallMs:sequence*1000/60,phase:'playing',organ:'training',alive:3,
        player:{...worldFoot,facing:Math.PI/4,moving:walking,dashUntil:0},expectedView:'front_right',logical:{idle:!walking,walk:walking,fire:true,'walk-fire':walking},
        cameraProjection:{origin:{x:0,y:0},unitX:{x:1,y:0},unitY:{x:0,y:.72}},previewActive:false,targets:[],expectedActorIds:['player','player:tool'],
        art:{actorFrames:[body,tool],actorContract:{version:2,ready:true,oldSourceIds:[],unexpectedActorIds:[],groups:[]}},
        phaser:{nativeSprites:[native('player',wrong??(walking?'hero01':'hero00'),100,200,128,.85),native('player:tool','tool',100,176.2,64,.5)]}}};
    }
    const sourceAsset={id:'fantasy.source.active',source:'self-check/source.png',sourceSha256:'d'.repeat(64),asset:{width:512,height:512,
      sourceBounds:{x:0,y:0,width:512,height:512},visibleBounds:{x:0,y:0,width:512,height:512}}};
    identityByFrame.set('self-check:source',sourceAsset);
    const scene={kind:'scene',frame:structuredClone(frame(2,true).frame)};
    const removed={kind:'transition',changes:[{id:'removed-enemy',change:'removed'}],frame:{...structuredClone(frame(2,true).frame),expectedActorIds:[],
      art:{actorFrames:[],actorContract:{version:2,ready:true,oldSourceIds:[],unexpectedActorIds:[],groups:[]}},phaser:{nativeSprites:[]}}};
    const offscreen={kind:'transition',changes:[{id:'offscreen-body',change:'actor-logical-state-change'}],frame:structuredClone(frame(2,true).frame)};
    offscreen.frame.expectedActorIds=[];offscreen.frame.art.actorFrames.forEach(actor=>{actor.visible=false;});
    const sourceTransition=structuredClone(removed);sourceTransition.changes=[{id:'source-fixture',change:'spawn'}];
    sourceTransition.frame.expectedActorIds=['source-fixture'];sourceTransition.frame.targets=[{id:'source-fixture',role:'source',hp:10}];
    sourceTransition.frame.phaser.nativeSprites=[{id:'source-fixture',texture:'self-check',frame:'source',x:20,y:30,width:64,height:64,visible:true}];
    const fired={type:'TOOL_FIRED',tick:1,data:{tool:1,note:'跨批动作'}},charged={type:'PLAYER_CHARGE_RELEASED',tick:2,data:{}};
    const valid=[{kind:'header',schemaVersion:2,name:'harness-only'},entries[0],entries[2],{kind:'event',event:fired},frame(1),
      {kind:'event',event:charged},entries[1],frame(2,true),scene,removed,offscreen,sourceTransition,{kind:'event',event:fired}];
    const sourceRows=[...valid,frame(3,true,'wrong-native'),frame(4,true,'hero00')];
    const encode=records=>records.map(record=>JSON.stringify(record)+'\n').join('');
    function statusFor(records){
      const counts={header:0,catalogue:0,event:0,player:0,scene:0,transition:0};for(const record of records)counts[record.kind]++;
      return {active:false,error:null,recordCount:records.length,emittedBytes:Buffer.byteLength(encode(records)),counts,pendingBytes:0,pendingRecords:0,maxPendingBytes:0,maxPendingRecords:0};
    }
    function aggregate(records,chunks,status=statusFor(records)){
      const accumulator=createNaturalAccumulator('harness-only'),consumer=createNDJSONConsumer(accumulator);
      for(const chunk of chunks)consumer.feed(chunk);consumer.finish();
      return accumulator.finish(status,{file:null,bytes:Buffer.byteLength(encode(records)),batches:chunks.length,maxBatchBytes:Math.max(...chunks.map(chunk=>Buffer.byteLength(chunk))),error:null});
    }
    const encoded=encode(sourceRows),lines=sourceRows.map(record=>JSON.stringify(record)+'\n');
    const split=[lines.slice(0,5).join(''),lines.slice(5,8).join(''),lines.slice(8).join('')];
    const one=aggregate(sourceRows,[encoded]),many=aggregate(sourceRows,split),partial=aggregate(sourceRows,[encoded.slice(0,113),encoded.slice(113,encoded.length-23),encoded.slice(-23)]);
    const stable=summary=>JSON.stringify({...summary,transport:{...summary.transport,batches:null,maxBatchBytes:null}});
    assert('One batch and cross-action/event/catalogue batches have equivalent aggregate summaries',stable(one)===stable(many));
    assert('Splits inside JSON records preserve the same aggregate',stable(one)===stable(partial));
    assert('Repeated event across batches is counted once',one.events.length===2&&one.eventTypes.length===2,{events:one.events.length,eventRecords:one.tierCounts.event});
    const validSummary=aggregate(valid,[encode(valid)]);
    assert('Actual frame lookup, source foot and independent palm/grip/muzzle accept valid fixtures',validSummary.strictNativeCoverage&&validSummary.frameCount===2,validSummary.firstInvalidFrames);
    assert('Scene/facility samples remain distinct from player rAF; removed bodies grant no native proof',validSummary.tierCounts.scene===1
      &&validSummary.tierCounts.transition===3&&validSummary.tierCounts.notApplicableTransitionPoints===2&&validSummary.tierCounts.checkedFrames===4,validSummary.tierCounts);
    const menuRow=frame(1);menuRow.frame.phase='menu';menuRow.frame.player.facing=-Math.PI/4;menuRow.frame.player.moving=true;
    menuRow.frame.expectedActorIds=['menu:hero','menu:tool'];menuRow.frame.art.actorFrames[0].actorId='menu:hero';menuRow.frame.art.actorFrames[0].entityId='menu:hero';
    menuRow.frame.art.actorFrames[1].actorId='menu:tool';menuRow.frame.art.actorFrames[1].entityId='menu:hero';
    menuRow.frame.phaser.nativeSprites[0].id='menu:hero';menuRow.frame.phaser.nativeSprites[1].id='menu:tool';
    const menuRows=[valid[0],entries[0],entries[2],menuRow],menuSummary=aggregate(menuRows,[encode(menuRows)]);
    assert('Menu uses its actual menu:hero/menu:tool palm attachment and fixed FR idle independently of simulated player state',menuSummary.strictNativeCoverage,menuSummary.firstInvalidFrames);
    const wrappedRow=frame(1),wrappedTool=wrappedRow.frame.art.actorFrames[1];
    wrappedTool.rotation=Math.PI;wrappedTool.muzzle={x:72,y:176.2};wrappedRow.frame.phaser.nativeSprites[1].rotation=-Math.PI;
    const wrappedRows=[valid[0],entries[0],entries[2],wrappedRow],wrappedSummary=aggregate(wrappedRows,[encode(wrappedRows)]);
    assert('Native -pi and declared +pi describe the same tool direction without relaxing geometry tolerance',wrappedSummary.strictNativeCoverage,wrappedSummary.firstInvalidFrames);
    const rotatedRows=structuredClone(wrappedRows);rotatedRows.at(-1).frame.phaser.nativeSprites[1].rotation+=.001;
    const rotatedSummary=aggregate(rotatedRows,[encode(rotatedRows)]);
    assert('A real small rotation mismatch still fails the unchanged angular tolerance',!rotatedSummary.strictNativeCoverage&&rotatedSummary.invalidFrames===1,rotatedSummary.firstInvalidFrames);
    assert('Unknown frame and known wrong clip are both rejected',one.transport.captureComplete&&!one.strictNativeCoverage&&one.invalidFrames===2,{invalidFrames:one.invalidFrames,failures:one.firstInvalidFrames});
    assert('Wrong frames cannot increment valid action coverage or native clip frames',one.actionCoverage.walk.samples===3&&one.actionCoverage.walk.nativeSamples===1
      &&one.actionCoverage.walk.actualPlayerFrames.length===1&&one.heroClipFrames.walk.length===1,one.actionCoverage.walk);
    const gapRows=structuredClone(valid);gapRows.findLast(row=>row.kind==='player').sequence=4;
    const gap=aggregate(gapRows,[encode(gapRows)]);
    assert('A sequence gap invalidates completeness',!gap.transport.captureComplete,gap.transport.errors);
    const mismatch=aggregate(valid,[encode(valid)],{...statusFor(valid),recordCount:valid.length+1});
    assert('A final page/Node count mismatch invalidates completeness',!mismatch.transport.captureComplete,mismatch.transport.errors);
    const missingRows=valid.filter(row=>!(row.kind==='catalogue'&&row.key==='c1'));
    const missing=aggregate(missingRows,[encode(missingRows)]);
    assert('A catalogue referenced before definition invalidates completeness',!missing.transport.captureComplete,missing.transport.errors);
    let truncated=false,oversize=false;
    try{aggregate(valid,[encode(valid).slice(0,-1)]);}catch{truncated=true;}
    try{aggregate(valid,['x'.repeat(RECORDER_POLICY.maxRecordBytes+1)]);}catch{oversize=true;}
    assert('Truncated final line and oversized partial record are rejected',truncated&&oversize);
    const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),savedRAF=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
    let streamFixture,overflowFixture,reactionFixture;
    try{
      async function fakeTransport(name,pendingCap=null,reactionCases=false){
        let current=frame(1),scheduled=[];
        const stub={snapshot:()=>({...current.frame,targets:[],effects:[],events:current.syntheticEvents??[fired,charged].filter(event=>event.tick<=current.sequence)}),
          diagnostics:()=>({art:{...current.frame.art,actorFrames:current.frame.art.actorFrames.map(actor=>({...entries.find(entry=>entry.key===actor.catalogueKey)?.value,...actor}))},phaser:current.frame.phaser}),
          toScreen:point=>({x:point.x,y:point.y*.72})};
        globalThis.window={__viral:stub};globalThis.requestAnimationFrame=callback=>{scheduled.push(callback);return scheduled.length;};
        const fakePage={evaluate:async(callback,arg)=>callback(arg?.policy&&pendingCap?{...arg,policy:{...arg.policy,maxPendingBytes:pendingCap}}:arg)};
        await installRecorder(fakePage,name);clearInterval(recorderSessions.get(fakePage).timer);
        const pump=(sequence,walking=false,wrong=null,reaction=null)=>{
          current=frame(sequence,walking,wrong);
          if(reaction){current.frame.elapsed=reaction.elapsed;current.frame.tick=reaction.tick;current.frame.player.hurtUntil=reaction.hurtUntil;
            current.syntheticEvents=[{type:'PLAYER_HURT',tick:reaction.eventTick,data:{damage:reaction.damage,reason:'synthetic-reaction-boundary'}}];}
          const callback=scheduled.shift();if(callback)callback(performance.now()+sequence*17);
        };
        if(reactionCases){
          pump(1,false,null,{elapsed:2.25,tick:135,hurtUntil:2.8,eventTick:126,damage:5});await drainRecorder(recorderSessions.get(fakePage));
          pump(2,false,null,{elapsed:2.5,tick:150,hurtUntil:0,eventTick:150,damage:1});await drainRecorder(recorderSessions.get(fakePage));
          pump(3,false,null,{elapsed:151/60,tick:151,hurtUntil:3,eventTick:150,damage:0});
        }else{
          pump(1);if(!pendingCap){await drainRecorder(recorderSessions.get(fakePage));pump(2,true);await drainRecorder(recorderSessions.get(fakePage));pump(3,true,'wrong-native');pump(4,true,'hero00');}
        }
        return stopRecorder(fakePage,name);
      }
      streamFixture=await fakeTransport('harness-queue-and-stream');
      assert('The actual browser-queue/Node-stream functions preserve all four synthetic rAF rows across drains',streamFixture.transport.captureComplete
        &&streamFixture.frameCount===4&&streamFixture.invalidFrames===2&&streamFixture.actionCoverage.walk.nativeSamples===1&&streamFixture.transport.batches===3,streamFixture.transport);
      assert('Incremental stream hash equals the independently read small fixture hash',streamFixture.trace.sha256===await fileHash(resolve(root,streamFixture.trace.path)));
      overflowFixture=await fakeTransport('harness-hard-cap',4096);
      assert('An intentionally reduced harness queue cap stops capture and rejects completeness',!overflowFixture.transport.captureComplete
        &&overflowFixture.transport.errors.some(error=>error.includes('Hard evidence cap exceeded')),overflowFixture.transport.errors);
      reactionFixture=await fakeTransport('harness-hurt-reaction-boundaries',null,true);
      assert('Actual recorder distinguishes expired reaction, infection DOT without hurtUntil, and zero-damage events from visual hurt',reactionFixture.transport.captureComplete
        &&reactionFixture.strictNativeCoverage&&reactionFixture.frameCount===3&&reactionFixture.actionCoverage.hurt.samples===0,reactionFixture.firstInvalidFrames);
    }finally{
      if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else delete globalThis.window;
      if(savedRAF)Object.defineProperty(globalThis,'requestAnimationFrame',savedRAF);else delete globalThis.requestAnimationFrame;
    }
    const fixtureTiming=await fixtureClockSelfCheck();
    assert('All supplied simulation ticks/elapsed and hurt/release event ages meet actual action windows',fixtureTiming.pass&&fixtureTiming.caseCount===100
      &&fixtureTiming.stateCount===4209&&fixtureTiming.events.hurt===280&&fixtureTiming.events.release===420,fixtureTiming);
    const fixture=await writeArtifact('recorder-check.synthetic.ndjson',encoded);
    return {schemaVersion:1,evidenceLevel:'harness-only-self-check',browserStarted:false,productionBuildRead:false,productionAcceptance:false,policy:RECORDER_POLICY,
      fixture,fixtureRecords:sourceRows.length,fixtureTiming,assertions,pass:assertions.every(item=>item.pass),summary:one,
      queueTransport:{scope:'The actual recording/streaming functions executed against synthetic read-only window.__viral and manually driven rAF callbacks; no browser or production build.',
        streamed:streamFixture,overflow:overflowFixture,reactionBoundaries:reactionFixture}};
  }finally{identityByFrame.clear();for(const [key,value]of savedIdentities)identityByFrame.set(key,value);}
}
class Movement {
  held = new Set();
  constructor(page) { this.page = page; }
  async move(x, y) {
    const length = Math.hypot(x, y) || 1, desired = [Math.abs(x / length) > .383 ? x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(y / length) > .383 ? y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!desired.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of desired) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
}
function clearSegment(a, b, world, margin = 38) {
  return world.obstacles.every(obstacle => { const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(a.x + t * dx - obstacle.x, a.y + t * dy - obstacle.y) >= obstacle.radius + margin; });
}
async function navigate(page, movement, state, goal, tolerance = 40) {
  if (distance(state.player, goal) <= tolerance) { await movement.release(); return; }
  let point = goal;
  if (!clearSegment(state.player, goal, state.world)) {
    point = state.world.obstacles.flatMap(obstacle => Array.from({ length: 16 }, (_, index) => ({ x: obstacle.x + Math.cos(index / 8 * Math.PI) * (obstacle.radius + 65), y: obstacle.y + Math.sin(index / 8 * Math.PI) * (obstacle.radius + 65) })))
      .filter(candidate => clearSegment(state.player, candidate, state.world) && candidate.x > state.world.bounds.left + 40 && candidate.x < state.world.bounds.right - 40 && candidate.y > state.world.bounds.top + 40 && candidate.y < state.world.bounds.bottom - 40)
      .sort((a, b) => distance(state.player, a) + distance(a, goal) - distance(state.player, b) - distance(b, goal))[0] ?? goal;
  }
  await movement.move(point.x - state.player.x, point.y - state.player.y);
}
async function aim(page, target) {
  const point = await page.evaluate(target => {
    const api = window.__viral, player = api.toScreen(api.snapshot().player), destination = api.toScreen(target), dx = destination.x - player.x, dy = destination.y - player.y;
    const compact = innerWidth <= 1024 || innerHeight <= 600, left = compact ? 150 : 285, right = innerWidth - (compact ? 145 : 255), top = compact ? 95 : 100, bottom = innerHeight - (compact ? 95 : 145);
    const scale = Math.max(.04, Math.min(1, dx > 0 ? (right - player.x) / dx : dx < 0 ? (left - player.x) / dx : 1, dy > 0 ? (bottom - player.y) / dy : dy < 0 ? (top - player.y) / dy : 1));
    return { x: player.x + dx * scale, y: player.y + dy * scale };
  }, target);
  await page.mouse.move(point.x, point.y);
  return point;
}
async function selectDraft(page, state, branch) {
  if (state.endlessGrowth?.draft) {
    const priorities = branch === 'area' ? ['nova', 'dash', 'power', 'immune', 'vitality', 'haste', 'scan', 'multishot', 'pierce', 'catalysis'] : ['multishot', 'pierce', 'power', 'nova', 'immune', 'vitality', 'haste', 'dash', 'scan', 'catalysis'];
    const selected = [...state.endlessGrowth.draft.options].sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
    await page.locator(`[data-action="endless-upgrade"][data-upgrade="${selected.id}"]`).click(); return true;
  }
  if (state.growth?.draft) {
    if (state.growth.draft.status === 'replacing') await page.locator('[data-action="draft-replace"]').first().click();
    else await page.locator(`[data-action="draft-option"][data-option="${state.growth.draft.options[0].id}"]`).click();
    return true;
  }
  return false;
}
async function newNatural(name, low = false, training = false, compact = false) {
  const context = await browser.newContext({ viewport: compact ? { width: 667, height: 320 } : { width: options.width, height: options.height },
    deviceScaleFactor: 1, offline: true, recordVideo: { dir: join(output, 'natural/video'), size: compact ? { width: 667, height: 320 } : { width: options.width, height: options.height } } });
  const page = await context.newPage(); observeErrors(page, name);
  const entry = new URL(pathToFileURL(join(buildDirectory, 'index.html')).href); entry.searchParams.set('seed', '71'); if (training) entry.searchParams.set('scenario', 'training');
  await page.goto(entry.href); await page.waitForFunction(() => window.__viral?.diagnostics().phaser?.ready === true);
  const menuData = await page.evaluate(() => ({diagnostics:window.__viral.diagnostics(),cameraProjection:{
    origin:window.__viral.toScreen({x:0,y:0}),unitX:window.__viral.toScreen({x:1,y:0}),unitY:window.__viral.toScreen({x:0,y:1})}}));
  const menu = { name, url: entry.href, level: 'natural-dom-input', phase: (await read(page)).phase,
    actual: actorChecks(menuData.diagnostics, { expectedActorIds: ['menu:hero','menu:tool'],cameraProjection:menuData.cameraProjection }), screenshot: await screenshot(page, `natural/${name}-menu.png`),
    availableStartActions: await page.locator('[data-action="start"],[data-action="endless-start"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-action'))) };
  report.natural.entries.push(menu);
  await page.locator(training ? '[data-action="start"]' : '[data-action="endless-start"]').click();
  await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing');
  if (low) { await page.keyboard.press('Escape'); const button = page.locator('[data-action="effects"]'); if ((await button.textContent()).includes('标准')) await button.click(); await page.locator('[data-action="continue"]').click(); }
  await installRecorder(page, name);
  return { context, page, movement: new Movement(page), name, low, training, compact };
}
async function finishNatural(run) {
  await run.movement.release(); await run.page.mouse.up(); await run.page.keyboard.up('Space');
  const result = await stopRecorder(run.page, run.name);
  result.camera.compactMinimumScale=run.compact ? .62 : null;
  result.camera.normalScaleFloorPass=!run.compact||!!result.camera.normalScaleRange&&result.camera.normalScaleRange.min>=.62-1e-5;
  result.screenshot = await screenshot(run.page, `natural/${run.name}-final.png`);
  result.finalState = await writeArtifact(`natural/${run.name}-final-state.json`, JSON.stringify(await read(run.page), null, 2));
  const video = run.page.video(); await run.context.close();
  const videoPath = await video.path(); result.video = { path: label(videoPath), sha256: await fileHash(videoPath), scope: 'Continuous capture of this one browser page; matches wallMs in its rAF trace.' };
  Object.assign(result,{low:run.low,compact:run.compact,training:run.training});
  // Combat coverage is attached by the caller after video/context finalization.
  // Keep that same object in the report so those route results are not lost.
  report.natural.runs.push(result);
  return result;
}
async function naturalActions(low, training, compact = false) {
  const run = await newNatural(`${training ? 'training' : 'heart'}-${low ? 'low' : 'standard'}-${compact ? 'compact-' : ''}actions`, low, training, compact), { page, movement } = run;
  try {
    await page.waitForTimeout(1100);
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [x, y] of directions) {
      const state = await read(page); await aim(page, { x: state.player.x + x * 230, y: state.player.y + y * 230 });
      await movement.move(x, y); await page.waitForTimeout(280); await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
      await movement.release(); await page.waitForTimeout(180); const current=await read(page);
      const click=await aim(page,{x:current.player.x+Math.cos(current.player.facing)*200,y:current.player.y+Math.sin(current.player.facing)*200});await page.mouse.click(click.x,click.y);
    }
    const beforeDash = await read(page); await movement.move(1, 0); await page.keyboard.down('Space'); await page.waitForTimeout(70); await page.keyboard.up('Space'); await page.waitForTimeout(240); await movement.release();
    if (!training) { await page.waitForTimeout(1400); await page.keyboard.down('Space'); await page.waitForTimeout(1450); await page.keyboard.up('Space'); await page.waitForTimeout(500); }
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(600);
    if (training) {
      const state = await read(page); await page.keyboard.press('Digit3'); await aim(page, state.tissue); await page.mouse.click(...Object.values(await page.evaluate(point => window.__viral.toScreen(point), state.tissue))); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.locator('#overlay-host [data-action="help"]').click();
      const exercise = page.locator('[data-action="practice-hit"]');
      if (!await exercise.isVisible()) throw Error('The real training hit exercise is missing');
      await exercise.click();
      await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing'); await page.waitForTimeout(700);
    }
    run.expectedDashCounterIncreased = (await read(page)).dashes > beforeDash.dashes;
  } finally { await finishNatural(run); }
}
async function naturalCombat(branch) {
  const run = await newNatural(`heart-${branch}-combat`, false, false), { page, movement } = run;
  let firing = false, charging = false, chargeAt = 0, healingMode = false, contactId, careDone = false, southDone = false;
  const events = new Map(), began = Date.now();
  const stop = async () => { if (firing) await page.mouse.up(); firing = false; if (charging) await page.keyboard.up('Space'); charging = false; await movement.release(); };
  const orbit = async (state, center, radius) => { const angle = Math.atan2(state.player.y - center.y, state.player.x - center.x);
    await navigate(page, movement, state, { x: center.x + Math.cos(angle + .4) * radius, y: center.y + Math.sin(angle + .4) * radius }, 20); };
  try {
    while (Date.now() - began < options.naturalSeconds * 1000) {
      const state = await read(page); for (const event of state.events) events.set(JSON.stringify(event), event);
      if (state.territory?.stage === 'victory') { run.rescue = true; await stop(); break; }
      if (state.phase === 'result') { run.failure = state.result; break; }
      if (state.endlessGrowth?.draft || state.growth?.draft) { await stop(); await selectDraft(page, state, branch); continue; }
      if (state.phase !== 'playing') { await stop(); const resume = page.locator('[data-action="continue"]'); if (await resume.isVisible()) await resume.click(); else break; continue; }
      const live = state.targets.filter(target => target.hp > 0 && target.role !== 'event');
      const enemies = live.filter(target => target.role !== 'core' && target.role !== 'source').sort((a, b) => distance(a, state.player) - distance(b, state.player));
      const north = state.territory.nodes.find(node => node.id === 'heart-healing-1'), south = state.territory.nodes.find(node => node.id === 'heart-healing-2');
      const history = [...events.values()];
      const infected = history.some(event => event.type === 'PLAYER_INFECTED');
      careDone ||= infected && history.some(event => event.type === 'PLAYER_INFECTION_CLEARED' && event.data.reason === 'healing') && state.player.hp >= 94;
      southDone ||= history.some(event => event.type === 'TERRITORY_PURIFIED' && event.data.nodeId === south.id && event.data.reason === 'player');
      let target = enemies[0];
      const purify = async node => {
        if (distance(state.player, node) > 112) await navigate(page, movement, state, node, 105);
        else { if (state.territory.purification?.nodeId !== node.id) { await stop(); await page.keyboard.press('Digit3'); await page.mouse.click(...Object.values(await page.evaluate(point => window.__viral.toScreen(point), node))); await page.waitForTimeout(60); await page.keyboard.press('Digit1'); } await orbit(state, node, 65); }
        target = enemies.find(enemy => enemy.territoryTask?.nodeId === node.id && distance(enemy, node) < 150) ?? target;
      };
      if (!careDone) {
        if (north.owner === 'infected') await purify(north);
        else if (!infected) {
          if (firing) await page.mouse.up(); firing = false;
          const contact = enemies.find(enemy => enemy.id === contactId) ?? enemies.find(enemy => enemy.role === 'virus' && !enemy.territoryTask && (!enemy.tactic || enemy.tactic === 'melee'));
          if (contact) contactId = contact.id;
          if (distance(state.player, north) > 125) await navigate(page, movement, state, north, 110);
          else if (contact && distance(contact, state.player) < 170) await navigate(page, movement, state, contact, 60); else await movement.release();
          await page.waitForTimeout(85); continue;
        } else { if (distance(state.player, north) > 110) await navigate(page, movement, state, north, 105); else await orbit(state, north, 65); }
      } else {
        healingMode = state.player.hp < 48 || healingMode && state.player.hp < 86;
        const heal = state.territory.nodes.filter(node => node.kind === 'healing' && node.owner === 'healthy').sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
        if (healingMode && heal) await orbit(state, heal, 65);
        else if (!southDone && state.endless.wave >= 2) await purify(south);
        else if (state.territory.stage === 'boss') { const mother = live.find(actor => actor.id === state.territory.bossId); if (mother) { await orbit(state, mother, 390); target = enemies.find(enemy => distance(enemy, state.player) < 120) ?? mother; } }
        else {
          const source = live.filter(actor => actor.role === 'source' && actor.territorySourceId).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
          if (source) { await orbit(state, source, 285); if (distance(state.player, source) < 510 && clearSegment(state.player, source, state.world, 7)) target = source; }
          else await orbit(state, state.tissue, 230);
        }
      }
      if (target) { await aim(page, target); if (!firing) { await page.mouse.down(); firing = true; } }
      else if (firing) { await page.mouse.up(); firing = false; }
      const early = state.endless.wave <= 2;
      await page.keyboard.press(early && branch === 'area' ? 'Digit2' : 'Digit1');
      if ((!early || branch === 'area') && target) {
        if (charging && state.elapsed - chargeAt >= 1.3) { await page.keyboard.up('Space'); charging = false; }
        else if (!charging && state.elapsed >= (state.chargedSlashReadyAt ?? 0) && (early || target.traits?.includes('CARAPACE')) && distance(state.player, target) < 630) { await page.keyboard.down('Space'); charging = true; chargeAt = state.elapsed; }
        if (!early && state.cooldowns[2] <= state.elapsed && distance(state.player, target) < 415) { await page.keyboard.press('Digit2'); await page.waitForTimeout(70); await page.keyboard.press('Digit1'); }
      }
      if (!early && !charging && state.scanReady <= state.elapsed && state.territory.stage === 'boss') await page.keyboard.press('KeyQ');
      await page.waitForTimeout(85);
    }
  } finally {
    await stop(); const result = await finishNatural(run);
    result.rescue = !!run.rescue; result.failure = run.failure ?? null; result.branch = branch;
    const types = new Set(result.eventTypes);
    const selectedTrait = result.events.find(event => event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED')?.data.trait;
    result.selectedTrait = selectedTrait;
    result.combatCoverage = { 'positive-virus-hit': result.events.some(event => event.type === 'PLAYER_HURT' && Number(event.data.damage) > 0 && event.data.reason !== 'infection'),
      infection: types.has('PLAYER_INFECTED'), healing: types.has('TERRITORY_PLAYER_HEALED'), cleanse: types.has('PLAYER_INFECTION_CLEARED'),
      purification: types.has('TERRITORY_PURIFIED'), 'variant-birth': selectedTrait === (branch === 'area' ? 'FISSION' : 'CARAPACE')
        && result.enemyStateFrames.some(enemy => enemy.family === (branch === 'area' ? 'fission.parent' : 'carapace')),
      'source-defeat': result.events.filter(event => event.type === 'TERRITORY_SOURCE_DESTROYED').length >= 2,
      mother: result.events.some(event => /^CORE_/.test(event.type)), rescue: result.rescue };
    textLog({ natural: run.name, rescue: result.rescue, frames: result.frameCount, strictNativeCoverage: result.strictNativeCoverage });
  }
}
async function naturalEvidence() {
  for (const low of [false, true]) for (const training of [true, false]) await naturalActions(low, training);
  for (const low of [false, true]) await naturalActions(low, false, true);
  for (const branch of options.route === 'both' ? ['precision', 'area'] : ['precision', 'area'].includes(options.route) ? [options.route] : []) await naturalCombat(branch);
  report.natural.completed = true;
  report.natural.lung = { publiclyReached: report.natural.runs.some(run => run.naturalLungReached),
    scope: 'No public lung entry is invented. If false, lung exists only in the explicitly supplied Renderer matrix.' };
}

if(options.mode==='recorder-check'){
  let result;
  try{result=await recorderSelfCheck();}
  catch(error){result={evidenceLevel:'harness-only-self-check',browserStarted:false,productionAcceptance:false,pass:false,error:error instanceof Error?error.stack:String(error)};}
  const file=await writeArtifact('recorder-check.json',JSON.stringify(result,null,2));
  textLog({recorderCheck:file.path,pass:result.pass,assertions:result.assertions?.length??0,browserStarted:false,productionAcceptance:false});
  process.exit(result.pass?0:1);
}

try {
  metadataBytes = await readFile(join(buildDirectory, 'build-meta.json')); metadata = JSON.parse(metadataBytes.toString('utf8'));
  runtime = JSON.parse(await readFile(join(root, '.art-generated/art-runtime.json'), 'utf8'));
  report.selectedBuild = { ...report.selectedBuild, version: metadata.version, metadataSha256: hash(metadataBytes), gameJsSha256: await fileHash(join(buildDirectory, 'game.js')), artSignature: metadata.art?.inputSignature };
  if (runtime.inputSignature !== metadata.art?.inputSignature) throw Error('Current runtime art differs from selected build');
  for (const [id, asset] of Object.entries(runtime.assets)) {
    const key = `${asset.atlas}:${asset.frame}`, existing = identityByFrame.get(key);
    if (!existing || id.startsWith('fantasy.actor.') && !existing.id.startsWith('fantasy.actor.')) identityByFrame.set(key, { id, source: asset.source, sourceSha256: asset.sourceSha256, asset });
  }
  report.runtimeGroups = await runtimeGroupEvidence();
  beforeManifest = await readManifest(Object.keys(metadata.sourceManifest).sort());
  const mismatches = Object.keys(beforeManifest).filter(filename => beforeManifest[filename] !== metadata.sourceManifest[filename]);
  report.sourceIdentity = { checked: Object.keys(beforeManifest).length, mismatches };
  if (mismatches.length) throw Error(`Freeze/rebuild before actor evidence: ${mismatches.length} source-manifest mismatches`);
  report.measurementScript = await writeArtifact('measurement-script.mjs', await readFile(scriptPath));
  await writeArtifact('contract.json', JSON.stringify(CONTRACT, null, 2));
  browser = await chromium.launch({ channel: options.channel, headless: true });
  report.browser = { channel: options.channel, version: await browser.version(), headless: true, hardwareScope: 'Windows browser; compact layout is not phone hardware.' };
  if (options.mode !== 'natural') await derivedEvidence();
  if (options.mode !== 'derived') await naturalEvidence();
  const finalManifest = await readManifest(Object.keys(beforeManifest));
  report.sourcesUnchanged = JSON.stringify(beforeManifest) === JSON.stringify(finalManifest);
  report.buildUnchanged = await fileHash(join(buildDirectory, 'build-meta.json')) === report.selectedBuild.metadataSha256 && await fileHash(join(buildDirectory, 'game.js')) === report.selectedBuild.gameJsSha256;
  report.scriptUnchanged = await fileHash(scriptPath) === report.measurementScript.sha256;
  report.technicalPass = report.sourcesUnchanged && report.buildUnchanged && report.scriptUnchanged && !report.errors.length && !report.remoteRequests.length
    && report.derived.cases.every(item => item.stateUnchanged && item.screenshots.every(image => image.meaningful))
    && report.natural.runs.every(item => item.frameCount > 0 && item.transport.captureComplete && item.video && item.screenshot.meaningful);
  const combinedActions = Object.fromEntries(CONTRACT.natural.actions.map(action => [action, report.natural.runs.some(run => run.actionCoverage[action].nativeSamples > 0)]));
  const heroClipProgression = Object.fromEntries(['idle', 'walk', 'dash', 'hurt'].map(clip => {
    const ids = [...new Set(report.natural.runs.flatMap(run => run.heroClipFrames[clip]))];
    return [clip, { actualUniqueFrames: ids.length, ids, multiFrameObserved: ids.length >= 2 }];
  }));
  const requiredNativeIds=[...report.runtimeGroups.groups.flatMap(group=>group.frames.map(frame=>frame.id)),...requiredStaticIds];
  const observedNativeIds=new Set([...report.derived.cases.filter(item=>item.kind!=='fallback').flatMap(item=>item.nativeSemanticIds),
    ...report.natural.runs.flatMap(run=>run.provenance.map(item=>item.semanticId))]);
  const unexpectedSelectedActorIds=Object.keys(runtime.assets).filter(id=>id.startsWith('fantasy.actor.')&&!requiredNativeIds.includes(id));
  report.coverage = { combinedActions, missingActions: Object.keys(combinedActions).filter(action => !combinedActions[action]),
    heroClipProgression,
    missingViews: CONTRACT.views.filter(view => !report.natural.runs.some(run => run.actuallyRenderedDirections.includes(view))),
    incompleteDerived: report.derived.cases.filter(item => item.kind !== 'fallback' && !item.strictNativeCoverage).map(item => item.id),
    incompleteGroundCases:report.derived.cases.filter(item=>!item.groundCoverage.complete).map(item=>item.id),
    requiredNativeIdCount:requiredNativeIds.length,actuallyObservedNativeIds:[...observedNativeIds].filter(id=>id.startsWith('fantasy.actor.')).sort(),
    missingActualNativeIds:requiredNativeIds.filter(id=>!observedNativeIds.has(id)),unexpectedSelectedActorIds,
    incompleteNatural: report.natural.runs.filter(item => !item.strictNativeCoverage).map(item => item.name),
    incompleteNaturalEntries: report.natural.entries.filter(item => !strictChecks(item.actual)).map(item => item.name),
    compactCameraFailures:report.natural.runs.filter(run=>!run.camera.normalScaleFloorPass).map(run=>run.name),
    missingCombatBranches: ['precision', 'area'].filter(branch => !report.natural.runs.some(run => run.branch === branch && run.rescue && Object.values(run.combatCoverage).every(Boolean))),
    denseDerivedCaptured: report.derived.cases.filter(item => item.kind === 'dense').length,
    ruleDirectionCases:report.derived.cases.filter(item=>item.kind==='rule-direction').length,
    incompleteRuleDirections:report.derived.cases.filter(item=>item.kind==='rule-direction'&&!item.ruleDirections?.complete).map(item=>item.id),
    forcedFallbackObserved: report.derived.cases.some(item => item.kind === 'fallback' && item.forcedFallback?.removedIds.length > 0
      && item.forcedFallback.actualRasterIds.some(id => id.startsWith('actor:'))),
    densityScope: 'Supplied 48-body presentation only; performance and natural-density evidence remain a separate exclusive run.' };
  report.actorAcceptance = options.profile === 'final' && options.mode === 'all' && options.route === 'both' && report.technicalPass && report.runtimeGroups.complete
    && report.derived.completed && report.derived.restoration.assetsRestored && report.natural.completed && report.coverage.denseDerivedCaptured === 16 && report.coverage.forcedFallbackObserved
    && report.coverage.ruleDirectionCases===48&&!report.coverage.incompleteRuleDirections.length
    &&report.coverage.requiredNativeIdCount===115&&!report.coverage.missingActualNativeIds.length&&!report.coverage.unexpectedSelectedActorIds.length&&!report.coverage.incompleteGroundCases.length
    && !report.coverage.missingActions.length && !report.coverage.missingViews.length && !report.coverage.incompleteDerived.length
    && Object.values(heroClipProgression).every(item => item.multiFrameObserved)
    && !report.coverage.incompleteNatural.length && !report.coverage.incompleteNaturalEntries.length && !report.coverage.compactCameraFailures.length && !report.coverage.missingCombatBranches.length;
  report.pass = report.actorAcceptance;
  report.acceptanceStatus = options.profile === 'baseline' ? 'baseline-capture-only-not-accepted' : report.actorAcceptance ? 'technical-actor-coverage-accepted-human-visual-review-and-exclusive-performance-pending' : 'incomplete-or-failed-actor-coverage';
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error); console.error(report.error);
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
}
textLog({ report: label(join(output, 'report.json')), technicalPass: report.technicalPass, actorAcceptance: report.actorAcceptance, pass: report.pass, status: report.acceptanceStatus ?? 'technical-failure' });
if (options.profile === 'baseline' ? !report.technicalPass : !report.pass) process.exitCode = 1;
