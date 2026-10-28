import artRuntime from '../../.art-generated/art-runtime.json';
import { Renderer } from '../../src/render/renderer';
import { activeWorld, type GameState, type Target, type Vec } from '../../src/game/types';
import { enemyAttackPlan, type EnemyTactic } from '../../src/game/enemyTactics';
import { isLegalPosition } from '../../src/actors/collision';
import { drawBattleTarget, traceVirusOutline } from '../../src/render/battleVisuals';
import { heroArtPose, spriteBodyBounds } from '../../src/render/spriteGeometry';
import { boundsOverlap } from '../../src/render/raisedObstacleGeometry';

interface Asset { atlas: string; frame: string; width: number; height: number; pivot: { x: number; y: number };
  visibleBounds: { x: number; y: number; width: number; height: number }; source: string; sourceSha256: string }
const art = artRuntime as unknown as { inputSignature: string; assets: Record<string, Asset> };
const encode = (value: unknown): string => JSON.stringify(value);
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
const scope = 'Artificially positioned clone of a real captured snapshot, with no simulation advance. Derived render cases explicitly use phase=playing so each submitted pose is selected instead of reusing a prior paused pose; no GameSession is constructed/stepped and the Renderer frame callback stays unbound. Positions are not proven reachable through gameplay. Not a live DOM battle screenshot, performance measurement, or human readability acceptance.';
type NativeSprite = {
  x: number; y: number; alpha: number; flipX: boolean; flipY: boolean; originX: number; originY: number;
  displayWidth: number; displayHeight: number; depth: number; visible: boolean; rotation: number;
  texture: { key: string }; frame: { name: string; cutX: number; cutY: number; cutWidth: number; cutHeight: number;
    width: number; height: number; rotated?: boolean; data?: { trim?: boolean }; source: { image: CanvasImageSource } };
};
type ProbeInternals = { host: { sprites: Map<string, NativeSprite> }; targetAsset: (target: Target) => string | undefined };
let renderer: Renderer;
let source: GameState;
let sourceJson: string;
let sourceHash: string;
const canvas = (): HTMLCanvasElement => document.querySelector<HTMLCanvasElement>('#probe')!;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function changedFields(before: unknown, after: unknown, path = ''): unknown[] {
  if (encode(before) === encode(after)) return [];
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') return [{ path, before, after }];
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => changedFields(a[key], b[key], path ? `${path}.${key}` : key));
}
function native(id: string): NativeSprite {
  const sprite = (renderer as unknown as ProbeInternals).host.sprites.get(id);
  assert(sprite?.visible, `Expected actual visible native sprite ${id}`); return sprite;
}
function nativeInfo(sprite: NativeSprite) {
  return { x: sprite.x, y: sprite.y, alpha: sprite.alpha, flipX: sprite.flipX, flipY: sprite.flipY,
    originX: sprite.originX, originY: sprite.originY, displayWidth: sprite.displayWidth, displayHeight: sprite.displayHeight,
    depth: sprite.depth, texture: sprite.texture.key, frame: sprite.frame.name };
}
/** Read selected native texture pixels; no WebGL canvas export or 2D context acquisition. */
function nativeMask(sprite: NativeSprite, region: { left: number; top: number; width: number; height: number }): Uint8ClampedArray {
  const frame = sprite.frame;
  assert(!frame.rotated && !frame.data?.trim, 'Alpha probe supports current unrotated, untrimmed native frames only.');
  assert(Math.abs(sprite.rotation) < 1e-8, 'Unexpected rotation in controlled native case.');
  const mask = document.createElement('canvas'); mask.width = region.width; mask.height = region.height;
  const ctx = mask.getContext('2d', { willReadFrequently: true })!;
  const x = sprite.x - sprite.originX * sprite.displayWidth - region.left, y = sprite.y - sprite.originY * sprite.displayHeight - region.top;
  ctx.translate(x + (sprite.flipX ? sprite.displayWidth : 0), y + (sprite.flipY ? sprite.displayHeight : 0));
  ctx.scale(sprite.flipX ? -1 : 1, sprite.flipY ? -1 : 1);
  // Deliberately ignore global sprite.alpha here: overlap uses un-faded native image alpha.
  ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, sprite.displayWidth, sprite.displayHeight);
  return ctx.getImageData(0, 0, mask.width, mask.height).data;
}
function pixelOverlap(a: NativeSprite, b: NativeSprite) {
  const left = Math.max(0, Math.floor(Math.min(a.x - a.originX * a.displayWidth, b.x - b.originX * b.displayWidth)));
  const top = Math.max(0, Math.floor(Math.min(a.y - a.originY * a.displayHeight, b.y - b.originY * b.displayHeight)));
  const right = Math.min(innerWidth, Math.ceil(Math.max(a.x + (1 - a.originX) * a.displayWidth, b.x + (1 - b.originX) * b.displayWidth)));
  const bottom = Math.min(innerHeight, Math.ceil(Math.max(a.y + (1 - a.originY) * a.displayHeight, b.y + (1 - b.originY) * b.displayHeight)));
  assert(right > left && bottom > top, 'Controlled native masks must be inside the actual CSS viewport.');
  const region = { left, top, width: right - left, height: bottom - top };
  const aa = nativeMask(a, region), ba = nativeMask(b, region); let playerPixels = 0, obstaclePixels = 0, intersection = 0;
  for (let index = 3; index < aa.length; index += 4) {
    const p = aa[index] >= 32, o = ba[index] >= 32;
    if (p) playerPixels++; if (o) obstaclePixels++; if (p && o) intersection++;
  }
  return { alphaThreshold: 32, coordinateSpace: 'CSS pixels', comparisonRectCSS: region, playerPixels, obstaclePixels, intersection,
    playerOverlapFraction: intersection / Math.max(1, playerPixels) };
}
function baseClone(): GameState {
  const state = structuredClone(source);
  // A paused Renderer intentionally preserves the last presented hero pose, even
  // if pause() cleared movement. Independent derived cases change facing/pose;
  // submit those explicit presentation inputs as playing without stepping any
  // GameSession. The fixed tick/elapsed and complete JSON checks below remain.
  state.phase = 'playing';
  const world = activeWorld(state), far = { x: world.bounds.right - 65, y: world.bounds.bottom - 65 };
  // Keep actor records/HP/traits intact while removing other possible fade triggers.
  for (const target of state.targets) { target.x = far.x; target.y = far.y; }
  for (const cell of state.growth?.cells ?? []) { cell.x = far.x; cell.y = far.y; }
  return state;
}
async function draw(state: GameState, lowEffects: boolean) {
  assert(state.phase === 'playing', 'Derived render cases must select their explicit current pose rather than reuse a paused case.');
  const before = encode(state), beforeSha256 = await sha256(before);
  renderer.render(state, state.battle?.lastAim ?? state.player, { lowEffects });
  await nextFrame(); await nextFrame();
  const after = encode(state), afterSha256 = await sha256(after);
  const sourceUnchanged = encode(source) === sourceJson && await sha256(encode(source)) === sourceHash;
  assert(before === after && beforeSha256 === afterSha256 && sourceUnchanged, 'Rendering changed complete derived/source state.');
  const diagnostics = renderer.diagnostics(state);
  assert(diagnostics.phaser.frameLoopBound === false, 'Derived presentation must not bind a production simulation frame callback.');
  return { completeJsonEqual: before === after, beforeSha256, afterSha256, sourceUnchanged,
    tick: state.tick, elapsed: state.elapsed, lowEffects, derivedFields: changedFields(source, state), diagnostics,
    presentation: { phase: state.phase, simulationAdvanced: false, frameLoopBound: diagnostics.phaser.frameLoopBound,
      method: 'One explicit Renderer.render submission at fixed source-derived tick/elapsed. phase=playing selects the current pose and avoids cross-case paused pose retention; no GameSession or simulation step.' } };
}
async function prepare(snapshot: GameState) {
  assert(snapshot.game === 'viral-invasion' && Number.isSafeInteger(snapshot.tick) && Number.isFinite(snapshot.elapsed), 'Expected actual captured GameState.');
  assert(snapshot.battle && activeWorld(snapshot).obstacles.length > 0, 'Expected a battle snapshot with existing obstacles.');
  source = structuredClone(snapshot); sourceJson = encode(source); sourceHash = await sha256(sourceJson);
  renderer = new Renderer(canvas()); await renderer.ready; await document.fonts.ready;
  return { scope, captureSource: 'The supplied historical captured snapshot provides source state only; the currently imported Renderer and embedded art provide presentation. A historical input is not a current-build natural battle capture.',
    seed: source.seed, tick: source.tick, elapsed: source.elapsed, sourceSha256: sourceHash,
    artSignature: art.inputSignature, originalAliveActors: source.targets.filter(t => t.hp > 0).length,
    originalImmuneCells: source.growth?.cells?.length ?? 0 };
}
async function occlusion(position: 'behind' | 'front', mirrored: boolean) {
  const state = baseClone(), obstacle = activeWorld(state).obstacles[0];
  state.player.moving = false; state.player.facing = mirrored ? Math.PI : 0;
  state.player.actionUntil = state.elapsed + 1; state.tool = 1;
  const pose = heroArtPose(state);
  assert(pose.id === 'hero.idle' && pose.flipX === mirrored, 'Controlled firing state must keep the clean body and correct mirror.');
  const obstacleAssetId = state.battle?.organId === 'lung' ? 'scenery.alveoli' : 'scenery.heartTissueB';
  const asset = art.assets[obstacleAssetId], obstacleHeight = obstacle.radius * 2.08 * asset.visibleBounds.height / asset.visibleBounds.width;
  const obstacleBody = spriteBodyBounds(asset, obstacle, obstacleHeight);
  const attempts: { point: Vec; legal: boolean; envelopeOverlap: boolean; alphaIntersection: number; actualAlpha: number;
    completeJsonEqual: boolean; beforeSha256: string; afterSha256: string; sourceUnchanged: boolean }[] = [];
  let selected: { point: Vec; alphaIntersection: number } | undefined;
  const offsets = [0, ...[1, 2, 3, 4, 5].flatMap(n => [n * Math.PI / 12, -n * Math.PI / 12])];
  // Search only original-world legal footprints around this unchanged existing obstacle.
  // This is a controlled rendering setup, not a claim that gameplay reached the point.
  search: for (const gap of [1, 8, 20]) for (const offset of offsets) {
    const angle = (position === 'behind' ? -Math.PI / 2 : Math.PI / 2) + offset;
    const distance = obstacle.radius + state.player.radius + gap;
    const point = { x: obstacle.x + Math.cos(angle) * distance, y: obstacle.y + Math.sin(angle) * distance };
    if (!isLegalPosition(point, state.player.radius, activeWorld(state))) continue;
    if (position === 'behind' ? point.y >= obstacle.y : point.y <= obstacle.y) continue;
    Object.assign(state.player, point);
    const envelopeOverlap = boundsOverlap(spriteBodyBounds(art.assets[pose.id], point, 86, mirrored), obstacleBody);
    const check = await draw(state, false), actualPlayer = native('player'), actualWall = native(obstacle.id), overlap = pixelOverlap(actualPlayer, actualWall);
    attempts.push({ point, legal: true, envelopeOverlap, alphaIntersection: overlap.intersection, actualAlpha: actualWall.alpha,
      completeJsonEqual: check.completeJsonEqual, beforeSha256: check.beforeSha256, afterSha256: check.afterSha256, sourceUnchanged: check.sourceUnchanged });
    if (!selected || overlap.intersection > selected.alphaIntersection) selected = { point, alphaIntersection: overlap.intersection };
    if (overlap.intersection >= 24) break search;
  }
  assert(selected, `No legal ${position} point found around the original obstacle.`);
  assert(position !== 'behind' || selected.alphaIntersection >= 24, 'No legal behind sample has the required real opaque native image intersection >=24px.');
  Object.assign(state.player, selected.point);
  const observation = await draw(state, false), player = native('player'), wall = native(obstacle.id);
  const alpha = wall.alpha, expectedAlpha = position === 'behind' ? .22 : 1, overlap = pixelOverlap(player, wall);
  assert(isLegalPosition(state.player, state.player.radius, activeWorld(state)), 'Selected player footprint is illegal in the original world.');
  assert(Math.abs(alpha - expectedAlpha) < 1e-6, `Actual obstacle alpha ${alpha} differs from ${expectedAlpha}.`);
  assert(position !== 'behind' || overlap.intersection >= 24, 'Behind case lost its required actual native alpha intersection.');
  const body = spriteBodyBounds(art.assets[pose.id], state.player, 86, mirrored);
  assert(position !== 'behind' || boundsOverlap(body, obstacleBody), 'Expected behind production alpha-envelope bounds to overlap.');
  assert(player.flipX === mirrored && player.frame.name === art.assets[pose.id].frame, 'Native player does not match selected action pose.');
  assert(position === 'behind' ? player.depth < wall.depth : player.depth > wall.depth, 'Native depth order disagrees with ground order.');
  return { pass: true, scope, name: `${position}-${mirrored ? 'left' : 'right'}-shot`, position, mirrored,
    obstacle: { ...obstacle, assetId: obstacleAssetId, sourceSha256: asset.sourceSha256 },
    playerGround: { x: state.player.x, y: state.player.y, radius: state.player.radius, legalInOriginalWorld: true,
      obstacleClearance: Math.hypot(state.player.x - obstacle.x, state.player.y - obstacle.y) - obstacle.radius - state.player.radius },
    legalPositionSearch: { method: 'Original obstacle and world retained; sample legal radius-inflated obstacle rings at gaps1/8/20 and15-degree angular offsets; prefer >=24px actual native alpha overlap.', attempts },
    intersectionScope: position === 'behind' ? 'Actual un-faded native alpha overlap >=24px required.'
      : overlap.intersection >= 24 ? 'Legal front sample also has >=24px actual native alpha overlap.'
      : `Selected legal front sample has ${overlap.intersection}px actual alpha intersection; no >=24px sample found among ${attempts.length} tested legal ring points. This is not proof that all possible front positions lack overlap.`,
    expectedAlpha, actualAlpha: alpha, overlap, bounds: { player: body, obstacle: obstacleBody }, native: { player: nativeInfo(player), obstacle: nativeInfo(wall) }, ...observation };
}
function legalGrid(state: GameState, radius: number): Vec[] {
  const world = activeWorld(state), positions: Vec[] = [];
  for (let y = world.bounds.top + 110; y <= world.bounds.bottom - 110; y += 70)
    for (let x = world.bounds.left + 110; x <= world.bounds.right - 110; x += 70)
      if (isLegalPosition({ x, y }, radius, world)) positions.push({ x, y });
  return positions;
}
async function danger(kind: Exclude<EnemyTactic, 'melee'>, lowEffects: boolean) {
  const state = baseClone(), target = state.targets.find(t => t.hp > 0 && t.role !== 'source' && t.role !== 'core');
  assert(target, 'Source needs a living non-source target.');
  const traits: Record<string, Target['traits']> = { 'thin-ray': [], 'crystal-charge': ['CARAPACE'], 'fission-burst': ['FISSION'], 'mimic-corrosion': ['MIMIC'] };
  target.role = 'virus'; target.traits = traits[kind]; target.tactic = kind;
  delete target.attackPlan; delete target.charge; delete target.splitAt; delete target.splitPositions;
  target.hitUntil = 0; target.exposedUntil = 0; target.recoverUntil = 0; target.attackAt = undefined;
  const points = legalGrid(state, Math.max(70, state.player.radius, target.radius, state.tissue.radius));
  let selected: ReturnType<typeof enemyAttackPlan>;
  // Every accepted origin/goal has a legal footprint in the unchanged original world.
  // enemyAttackPlan itself decides LOS, clipped charge lane and fission landing geometry.
  outer: for (const goal of points) for (const origin of points) {
    const separation = Math.hypot(origin.x - goal.x, origin.y - goal.y);
    if (separation < 230 || separation > 330 || origin.x >= goal.x) continue;
    Object.assign(state.player, goal, { moving: false, actionUntil: 0, facing: Math.PI });
    if (kind === 'mimic-corrosion') Object.assign(state.tissue, goal);
    Object.assign(target, origin, { facing: Math.atan2(goal.y - origin.y, goal.x - origin.x) });
    const plan = enemyAttackPlan(target, state);
    if (plan && (kind !== 'fission-burst' || plan.landings.every(p => isLegalPosition(p, plan.radius, activeWorld(state))))) { selected = plan; break outer; }
  }
  assert(selected?.kind === kind, `No legal controlled ${kind} plan found in original world.`);
  target.attackPlan = selected; target.attackAt = state.elapsed + selected.windup * .5;
  target.attackWindup = selected.windup; target.attackAim = { ...selected.aim }; target.attackRadius = selected.radius;
  target.attackTarget = kind === 'mimic-corrosion' ? 'tissue' : 'player';
  const observation = await draw(state, lowEffects);
  const expectedIds = selected.kind === 'fission-burst' ? selected.landings.map((_, i) => `enemy-tactic:${target.id}:${i}`)
    : selected.kind === 'mimic-corrosion' ? [`enemy-tactic:${target.id}:0`] : [`enemy-tactic:${target.id}`];
  const placements = observation.diagnostics.labels.placements;
  assert(expectedIds.every(id => placements.some(p => p.id === id && p.essential && !p.conflicted
    && [p.rect.left, p.rect.right, p.rect.top, p.rect.bottom].every(Number.isFinite)
    && p.rect.right > p.rect.left && p.rect.bottom > p.rect.top)), `Missing/conflicted/unlaid actual essential ${kind} label in ${lowEffects ? 'low' : 'normal'} mode.`);
  assert(isLegalPosition(target, target.radius, activeWorld(state)) && isLegalPosition(state.player, state.player.radius, activeWorld(state)), 'Chosen origin/player is illegal.');
  return { pass: true, automaticPassScope: 'Real requested plan exists; expected essential captions have finite, positive, non-conflicted placements; complete source/derived state remains unchanged. Hazard geometric visibility/readability requires manual inspection of the actual screenshots.',
    manualGeometryVisibility: 'Unassessed by automation; inspect both normal/low images.', scope, name: `${kind}-${lowEffects ? 'low' : 'normal'}`, kind, actorId: target.id, plan: selected,
    expectedEssentialLabelIds: expectedIds, essentialPlacements: placements.filter(p => expectedIds.includes(p.id)),
    geometryMethod: 'Unchanged original world; isLegalPosition searched for actor/goal; real enemyAttackPlan computes all promised hit footprints. No simulation/cooldown/concurrency/reachability claim.', ...observation };
}
async function fissionSample() {
  const state = structuredClone(source), target = structuredClone(state.targets.find(t => t.hp > 0 && t.role !== 'source' && t.role !== 'core'));
  assert(target, 'Need a live target for derived FISSION selection/fallback evidence.');
  Object.assign(target, { x: 0, y: 0, role: 'virus', traits: ['FISSION'], generation: 0, hitUntil: 0, attackAt: undefined, facing: 0, revealedUntil: 0, exposedUntil: 0 });
  const parentArt = art.assets['enemy.fission.parent'], childArt = art.assets['enemy.fission.child'];
  assert(!!parentArt === !!childArt, 'Current FISSION native evidence requires both selected parent and child; one missing frame is an incomplete pair.');
  if (parentArt && childArt) {
    const child = structuredClone(target); child.id = `${target.id}:selector-child`; child.generation = 1;
    state.targets = [target, child];
    const before = encode(state), beforeSha256 = await sha256(before);
    const selections = state.targets.map((actor, index) => {
      const expectedAssetId = index === 0 ? 'enemy.fission.parent' : 'enemy.fission.child';
      const selectedAssetId = (renderer as unknown as ProbeInternals).targetAsset(actor);
      assert(selectedAssetId === expectedAssetId, `Renderer.targetAsset selected ${selectedAssetId} for FISSION generation ${actor.generation}; expected ${expectedAssetId}.`);
      const selected = art.assets[selectedAssetId];
      return { actorId: actor.id, generation: actor.generation, hp: actor.hp, role: actor.role, traits: actor.traits,
        expectedAssetId, selectedAssetId, source: selected.source, sourceSha256: selected.sourceSha256, atlas: selected.atlas, frame: selected.frame };
    });
    const after = encode(state), afterSha256 = await sha256(after), sourceUnchanged = encode(source) === sourceJson && await sha256(encode(source)) === sourceHash;
    assert(before === after && beforeSha256 === afterSha256 && sourceUnchanged, 'FISSION selector inspection mutated complete derived/source state.');
    return { mode: 'native-selection' as const, pass: true, scope,
      evidenceScope: 'Actual current Renderer.targetAsset selector called for derived generation0 parent and generation1 child only. This does not invoke nativeEntity, submit a host Sprite, render an actor, or prove in-game scale, alignment, visibility, gameplay reachability or animation.',
      selectorSource: 'src/render/phaserRenderer.ts:Renderer.targetAsset', selections,
      derivedFields: changedFields(source, state), completeJsonEqual: before === after, beforeSha256, afterSha256, sourceUnchanged };
  }
  assert((renderer as unknown as ProbeInternals).targetAsset(target) === undefined, 'FISSION fallback probe is inconsistent with the actual selected native asset.');
  state.targets = [target];
  const before = encode(state), image = document.createElement('canvas'), mask = document.createElement('canvas');
  image.width = mask.width = 320; image.height = mask.height = 320;
  const ctx = image.getContext('2d')!, clip = mask.getContext('2d')!;
  ctx.setTransform(1, 0, 0, .72, 160, 230); drawBattleTarget(ctx, target, state);
  const rawPng = image.toDataURL('image/png');
  // The real outer body path excludes only the separate ground-anchor ring. Intersect
  // with the actual production drawBattleTarget pixels rather than replacing that draw.
  clip.translate(160, 230 - target.radius * .8 + Math.sin(state.elapsed * 5) * 2);
  traceVirusOutline(clip, 'FISSION', target.radius); clip.fillStyle = '#000'; clip.fill(); clip.lineWidth = 2; clip.strokeStyle = '#000'; clip.stroke();
  const alphaThreshold = 32, rawPixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const maskPixels = clip.getImageData(0, 0, mask.width, mask.height).data;
  function areaAndBounds(pixels: Uint8ClampedArray, within?: Uint8ClampedArray) {
    let area = 0, left = image.width, top = image.height, right = -1, bottom = -1;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const alpha = (y * image.width + x) * 4 + 3;
      if (pixels[alpha] < alphaThreshold || within && within[alpha] < alphaThreshold) continue;
      area++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { alphaPixels: area, bounds: area ? { left, top, width: right - left + 1, height: bottom - top + 1 } : null };
  }
  const rawProduction = areaAndBounds(rawPixels), traceBodyMask = areaAndBounds(maskPixels), productionBody = areaAndBounds(rawPixels, maskPixels);
  const productionMaskCoverage = productionBody.alphaPixels / Math.max(1, traceBodyMask.alphaPixels);
  assert(traceBodyMask.alphaPixels > 0 && productionMaskCoverage >= .9, `FISSION production pixels fill only ${(productionMaskCoverage * 100).toFixed(2)}% of its real body mask; refuse to enlarge a fragment.`);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0);
  const extractedBody = areaAndBounds(ctx.getImageData(0, 0, image.width, image.height).data);
  const sourceUnchanged = encode(source) === sourceJson && await sha256(encode(source)) === sourceHash;
  assert(encode(state) === before && sourceUnchanged, 'Procedural sample mutated complete state.');
  return { mode: 'procedural-fallback' as const, pass: true, scope, assetId: 'procedural.FISSION', rawPng, png: image.toDataURL('image/png'), bodyMaskPng: mask.toDataURL('image/png'),
    evidenceScope: 'Selected procedural fallback drawBattleTarget pixels only, with its separate ground ring removed by the real trace mask. Not a native PNG or live gameplay capture.',
    productionSource: 'src/render/battleVisuals.ts:drawBattleTarget', sourceArt: 'Actual procedural fallback selected by Renderer.targetAsset; no unused PNG.',
    sampleTarget: target, derivedFields: changedFields(source, state), completeJsonEqual: true,
    beforeSha256: await sha256(before), afterSha256: await sha256(encode(state)), sourceUnchanged,
    coverage: { alphaThreshold, minimumCoverage: .9, productionMaskCoverage, rawProduction, traceBodyMask, productionBody, extractedBody,
      method: 'Before silhouette normalization, count actual drawBattleTarget alpha>=32 within the actual traceVirusOutline+stroke mask and divide by mask alpha>=32 area. Require>=.9; record unscaled areas and bounds.' },
    bodyExtraction: 'Actual drawBattleTarget pixels intersected with its real traceVirusOutline plus 2px stroke; only the separate ground-anchor ring is excluded. Outer .72 world transform cancels upright inverse-Y scale, matching production raster actor rendering.' };
}
declare global { interface Window { readonly __artReadabilityProbe: { prepare: typeof prepare; occlusion: typeof occlusion; danger: typeof danger; fissionSample: typeof fissionSample } } }
Object.defineProperty(window, '__artReadabilityProbe', { value: Object.freeze({ prepare, occlusion, danger, fissionSample }), writable: false });
