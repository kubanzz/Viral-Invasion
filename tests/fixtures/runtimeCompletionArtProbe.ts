import artRuntime from '../../.art-generated/art-runtime.json';
import { GameSession } from '../../src/game/session';
import { activeWorld, type GameState, type Target } from '../../src/game/types';
import type { TraitId } from '../../src/game/battleTypes';
import { MotherCoreController } from '../../src/game/motherCore';
import { growthContext } from '../../src/game/growth';
import { summonImmuneCells } from '../../src/game/immuneCells';
import type { BeaconState } from '../../src/game/growthTypes';
import { Renderer } from '../../src/render/renderer';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';

interface Asset extends SourceRegisteredSpriteAsset { atlas: string; frame: string; source: string; sourceSha256: string }
const art = artRuntime as unknown as { inputSignature: string; assets: Record<string, Asset> };
const encode = (value: unknown): string => JSON.stringify(value);
const SCOPE = 'DERIVED ART COMPOSITION: an explicitly modified clone of a serialized GameSession state. No simulation step, damage, spawn acceptance or gameplay input replay is performed. These images prove presentation at the supplied state only; they do not establish natural reachability, action timing, animation quality or game performance.';
type Coverage = 'fission' | 'immune' | 'bite' | 'beacon' | 'mother';
interface CaseSpec { id: string; title: string; category: Coverage; detail?: string; pair?: TraitId[]; motherState?: 'membrane-2' | 'membrane-1' | 'membrane-0' | 'exposed' | 'purified' }
interface ExpectedSprite { actorId: string; assetId: string; category: Coverage }
interface Expectation { category: Coverage; expected: ExpectedSprite[]; absent?: string[]; labelIds?: string[]; registration?: string[] }
interface ReadonlyNativeSprite { alpha: number; flipX: boolean; flipY: boolean; rotation: number; originX: number; originY: number }
const CASES: CaseSpec[] = [
  { id: 'enemy-lineup', title: 'Ordinary / FISSION parent generation 0 / child generation 1', category: 'fission' },
  { id: 'immune-patrol-idle', title: 'One actual summoned patrol cell; no beacon device', category: 'immune', detail: 'patrol' },
  { id: 'immune-squad-idle', title: 'Three actual summoned cells at idle and active protocol beacon', category: 'immune', detail: 'idle' },
  { id: 'immune-squad-bite-right', title: 'Three cells in a derived real attackUntil window, right-facing key pose', category: 'bite', detail: 'right' },
  { id: 'immune-squad-bite-left', title: 'Three cells in a derived real attackUntil window, mirrored left-facing key pose', category: 'bite', detail: 'left' },
];
for (const pair of [['CARAPACE', 'FISSION'], ['CARAPACE', 'MIMIC'], ['FISSION', 'MIMIC']] as TraitId[][]) {
  for (const motherState of ['membrane-2', 'membrane-1', 'membrane-0', 'exposed', 'purified'] as const) CASES.push({
    id: `mother-${pair.join('-').toLowerCase()}-${motherState}`, category: 'mother', pair, motherState,
    title: `Mother ${pair.join(' + ')} / ${motherState}`,
  });
}

let renderer: Renderer | undefined;
let source: GameState | undefined;
let sourceJson = '', sourceHash = '';
let sourceKind = '';
let serial = 0;
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
function changedFields(before: unknown, after: unknown, path = ''): unknown[] {
  if (encode(before) === encode(after)) return [];
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') return [{ path, before, after }];
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => changedFields(a[key], b[key], path ? `${path}.${key}` : key));
}
function sourceIdentity(id: string) {
  const a = art.assets[id];
  return a ? { id, atlas: a.atlas, frame: a.frame, source: a.source, sourceSha256: a.sourceSha256,
    sourceSize: a.sourceSize, sourceBounds: a.sourceBounds, visibleBounds: a.visibleBounds, pivot: a.pivot } : { id, missing: true };
}
function cleanActor(id: string, x: number, changes: Partial<Target> = {}): Target {
  return { id, x, y: 530, hp: 100, maxHp: 100, radius: 30, kind: 'single', role: 'virus', traits: [],
    facing: 0, generation: 0, hitUntil: 0, scanned: true, ...changes };
}

function deriveBase(): GameState {
  assert(source, 'Call prepare() first.');
  const state = structuredClone(source!);
  // This small inspection stage is deliberately derived, not a claim that the
  // source session visited a different collision map or reached these positions.
  state.world = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [],
    foreground: { x: 2000, y: 2000, width: 10, height: 10 } };
  state.phase = 'paused'; state.tick = 600; state.elapsed = 10;
  Object.assign(state.player, { x: 170, y: 650, hp: 100, facing: 0, moving: false, dashUntil: 0, hurtUntil: 0, actionUntil: 0 });
  state.tool = 1; state.effects = []; state.targets = []; state.events = []; state.scanUntil = 0; state.scanReady = 0;
  state.message = ''; state.messageUntil = 0; state.tissue = { x: 1050, y: 650, radius: 43, hp: 100, maxHp: 100 };
  state.terminal = { x: 1050, y: 710 }; state.result = null;
  if (!state.battle || !state.growth || !state.campaign) throw new Error('Probe source must contain actual G3 battle, growth and campaign state.');
  state.battle.organId = 'heart'; state.battle.graph.nodes = []; state.battle.graph.edges = [];
  state.battle.lastAim = { x: 650, y: 500 };
  state.growth.beacon = null; state.growth.cells = []; state.growth.marks = [];
  state.growth.equipped = []; state.growth.draft = null; state.growth.pendingResearch = null; state.growth.lastEvolution = undefined;
  state.growth.runId = `derived-art-probe-${++serial}`;
  state.campaign.core.combat = undefined;
  return state;
}
function derivedCase(spec: CaseSpec) {
  const state = deriveBase(), expectations: Expectation[] = [], notes: string[] = [];
  if (spec.category === 'fission') {
    state.targets = [cleanActor('probe:ordinary', 390), cleanActor('probe:fission-parent', 650, { traits: ['FISSION'], generation: 0 }),
      cleanActor('probe:fission-child', 900, { traits: ['FISSION'], generation: 1, radius: 18 })];
    expectations.push({ category: 'fission', expected: [
      { actorId: 'probe:ordinary', assetId: 'enemy.basic', category: 'fission' },
      { actorId: 'probe:fission-parent', assetId: 'enemy.fission.parent', category: 'fission' },
      { actorId: 'probe:fission-child', assetId: 'enemy.fission.child', category: 'fission' },
    ] });
    notes.push('Parent and child are separate derived target records. No split timer is advanced and no offspring count is inferred from these images.');
  } else if (spec.category === 'immune' || spec.category === 'bite') {
    const patrol = spec.detail === 'patrol', bite = spec.category === 'bite', left = spec.detail === 'left';
    const beacon: BeaconState = { id: 'probe:beacon', organId: 'heart', x: 650, y: 500, born: 9, until: 15, radius: 190,
      damage: 30, interval: .8, nextAttackAt: 11, tuning: 'balanced', mode: patrol ? 'patrol' : 'protocol' };
    state.growth!.beacon = beacon;
    state.growth!.cells = summonImmuneCells(beacon, growthContext(state), patrol ? 1 : 3);
    const placements = patrol ? [{ x: 650, y: 545 }] : [{ x: 400, y: 545 }, { x: 650, y: 605 }, { x: 900, y: 545 }];
    for (const [index, cell] of state.growth!.cells.entries()) Object.assign(cell, placements[index],
      { born: 9, facing: left ? Math.PI : 0, activity: bite ? 'biting' : 'guarding', attackUntil: bite ? 10.15 : 0, targetId: null });
    const cells = state.growth!.cells.map(cell => ({ actorId: cell.id, assetId: 'immune.cell.idle', category: 'immune' as const }));
    // The body's actual frame is checked separately below when a bite is requested.
    expectations.push({ category: 'immune', expected: cells, labelIds: [`squad:${beacon.id}`] });
    if (bite) expectations.push({ category: 'bite', expected: cells.map(item => ({ ...item, assetId: 'immune.cell.bite', category: 'bite' })) });
    expectations.push({ category: 'beacon', expected: patrol ? [] : [{ actorId: beacon.id, assetId: 'immune.beacon', category: 'beacon' }],
      absent: patrol ? [beacon.id] : [], labelIds: [`squad:${beacon.id}`] });
    notes.push('Cell records are created by the actual summonImmuneCells helper, then explicitly positioned for this composition. No summon command was accepted by a live run.',
      bite ? 'attackUntil is a derived key-pose window. These stills do not prove natural bite timing or a continuous immune animation.' : 'Only inactive/idle cell bodies are requested; three cells are actual independent records.');
  } else {
    const traits = spec.pair!, actor = cleanActor('probe:mother', 650, { y: 550, radius: 52, role: 'core', traits, hp: 680, maxHp: 680 });
    const combat = new MotherCoreController({ coreId: actor.id, organId: 'heart', traits, tick: state.tick, elapsed: state.elapsed }).state;
    combat.phase = 'recovery'; combat.activeTrait = traits.includes('MIMIC') ? 'MIMIC' : traits[0]; combat.facing = .4;
    combat.phaseStartedAt = 9.5; combat.nextActionAt = 11;
    combat.membrane.remaining = spec.motherState === 'membrane-2' ? 2 : spec.motherState === 'membrane-1' ? 1 : 0;
    combat.seenTraits = combat.membrane.remaining === 2 ? [] : combat.membrane.remaining === 1 ? [traits[0]] : [...traits];
    if (spec.motherState === 'exposed') {
      combat.membrane.remaining = 1; combat.seenTraits = [traits[0]]; combat.exposedUntil = 11; actor.exposedUntil = 11;
      combat.revealedUntil = 11;
    }
    const dead = spec.motherState === 'purified';
    if (dead) { actor.hp = 0; actor.deadAt = 9.8; combat.phase = 'defeated'; combat.cleared = true; combat.clearedAt = 9.8; }
    state.targets = [actor]; state.campaign!.core.combat = combat;
    const layers = dead ? ['mother.purified'] : ['mother.base',
      ...(['FISSION', 'CARAPACE', 'MIMIC'] as const).filter(trait => traits.includes(trait)).map(trait => `mother.${trait.toLowerCase()}`),
      'mother.core.exposed', ...(combat.membrane.remaining > 0 && spec.motherState !== 'exposed' ? ['mother.membrane'] : [])];
    expectations.push({ category: 'mother', expected: layers.map((assetId, index) => ({
      actorId: index === 0 ? actor.id : `${actor.id}:${assetId}`, assetId, category: 'mother' })), registration: [...new Set(['mother.base', ...layers])] });
    notes.push('The actual MotherCoreController constructor supplies the serialized combat shape. Trait/membrane/exposure/defeat values are explicitly derived for state presentation; no boss transition or kill is executed.',
      'A single membrane layer expresses present/absent. Remaining count 2 versus 1 remains serialized information, not two invented membrane images.');
  }
  return { state, expectations, notes };
}

async function prepare(snapshot?: GameState) {
  renderer?.destroy(); renderer = undefined;
  if (snapshot) {
    assert(snapshot.game === 'viral-invasion', 'Input is not a serialized Viral Invasion state.');
    source = structuredClone(snapshot); sourceKind = 'Provided serialized GameSession capture; provenance must be checked from its input artifact.';
  } else {
    const session = new GameSession(71, { campaign: true, milestone: 'G3' }); session.start();
    source = JSON.parse(JSON.stringify(session.snapshot())) as GameState;
    sourceKind = 'Actual GameSession.start().snapshot() at tick 0, serialized and detached; the fixture never calls step(). This is an initial-state source, not a captured natural battle.';
  }
  assert(source.battle && source.growth && source.campaign, 'A G3 battle/growth/campaign source is required.');
  sourceJson = encode(source); sourceHash = await sha256(sourceJson); freeze(source);
  return { scope: SCOPE, sourceKind, sourceJson, sourceSha256: sourceHash, sourceTick: source.tick, sourceElapsed: source.elapsed,
    artSignature: art.inputSignature, caseCount: CASES.length, originalWorld: { width: activeWorld(source).width, height: activeWorld(source).height } };
}
async function renderCase(id: string, lowEffects = false) {
  const spec = CASES.find(item => item.id === id); assert(spec, `Unknown case ${id}`);
  const { state, expectations, notes } = derivedCase(spec!);
  const beforeJson = encode(state), beforeSha256 = await sha256(beforeJson), sourceBefore = encode(source);
  const derivedFields = changedFields(source, state); freeze(state);
  renderer?.destroy();
  // Phaser destroys on its own loop boundary. A fresh DOM canvas keeps that
  // previous WebGL context from racing the next independently rendered case.
  const previousCanvas = document.querySelector<HTMLCanvasElement>('#probe')!, nextCanvas = document.createElement('canvas');
  nextCanvas.id = 'probe'; nextCanvas.setAttribute('aria-label', 'Actual Renderer canvas for derived inspection'); previousCanvas.replaceWith(nextCanvas);
  renderer = new Renderer(nextCanvas);
  await renderer.ready; await document.fonts.ready;
  renderer.render(state, state.battle!.lastAim ?? state.player, { lowEffects }); await nextFrame(); await nextFrame();
  const diagnostics = renderer.diagnostics(state), afterJson = encode(state), afterSha256 = await sha256(afterJson);
  const sourceAfter = encode(source), sourceAfterSha256 = await sha256(sourceAfter);
  assert(beforeJson === afterJson && beforeSha256 === afterSha256, 'Actual renderer mutated the complete derived state.');
  assert(sourceBefore === sourceJson && sourceAfter === sourceJson && sourceAfterSha256 === sourceHash, 'Source snapshot changed.');
  const actual = diagnostics.phaser.nativeSprites;
  const readonly = renderer as unknown as { host: { sprites: Map<string, ReadonlyNativeSprite> } };
  const nativeSprites = actual.map(item => {
    const object = readonly.host.sprites.get(item.id);
    return { ...item, ...(object ? { alpha: object.alpha, flipX: object.flipX, flipY: object.flipY, rotation: object.rotation,
      originX: object.originX, originY: object.originY } : {}) };
  });
  const coverage = expectations.map(expectation => {
    const expected = expectation.expected.map(item => {
      const acceptable = expectation.category === 'immune' && spec!.category === 'bite' ? ['immune.cell.idle', 'immune.cell.bite'] : [item.assetId];
      const sprite = nativeSprites.find(sprite => sprite.id === item.actorId && sprite.visible);
      return { ...item, acceptableAssetIds: acceptable, actual: sprite ?? null,
        nativeMatch: !!sprite && acceptable.some(id => art.assets[id] && sprite.frame === art.assets[id].frame && sprite.texture === art.assets[id].atlas) };
    });
    const missingAssets = expectation.expected.filter(item => !art.assets[item.assetId]).map(item => item.assetId);
    const invalidRegistration = (expectation.registration ?? []).filter(assetId => !art.assets[assetId]
      || !sourceRegisteredSpriteLayout(art.assets[assetId], { width: 1024, height: 1024 }, { x: 512, y: 850 }, 1));
    const unexpectedDeviceIds = (expectation.absent ?? []).filter(actorId => nativeSprites.some(sprite => sprite.id === actorId && sprite.visible));
    const missingLabels = (expectation.labelIds ?? []).filter(labelId => !diagnostics.labels.placements.some(placement => placement.id === labelId));
    const unexpectedCellIds = expectation.category === 'immune' ? nativeSprites.filter(sprite => sprite.id.startsWith('probe:beacon:cell:')
      && !expected.some(item => item.actorId === sprite.id)).map(sprite => sprite.id) : [];
    const unexpectedMotherSprites = expectation.category === 'mother'
      ? nativeSprites.filter(sprite => (sprite.id === 'probe:mother' || sprite.id.startsWith('probe:mother:')) && !expected.some(item => item.actorId === sprite.id)).map(sprite => sprite.id) : [];
    const nativeVerified = expected.every(item => item.nativeMatch) && !unexpectedDeviceIds.length && !missingLabels.length && !invalidRegistration.length && !unexpectedMotherSprites.length && !unexpectedCellIds.length;
    return { category: expectation.category, status: nativeVerified ? expectation.expected.length ? 'native-verified' : 'absence-verified' : missingAssets.length ? 'fallback-missing-assets' : invalidRegistration.length ? 'fallback-invalid-registration' : 'native-mismatch-or-label-missing',
      nativeVerified, expected, absentNativeIds: expectation.absent ?? [], missingAssets: [...new Set(missingAssets)], invalidRegistration,
      unexpectedDeviceIds, unexpectedMotherSprites, unexpectedCellIds, missingLabels };
  });
  const caption = document.querySelector<HTMLElement>('#case-title');
  if (caption) caption.textContent = `DERIVED · ${spec!.title} · ${lowEffects ? 'low effects' : 'normal effects'}`;
  return { id, title: spec!.title, scope: SCOPE, sourceKind, notes, lowEffects, derivedFields, coverage,
    state: { beforeJson, afterJson, beforeSha256, afterSha256, completeJsonEqual: beforeJson === afterJson,
      sourceBeforeSha256: sourceHash, sourceAfterSha256, sourceUnchanged: sourceAfter === sourceJson },
    sourceIdentities: [...new Set(expectations.flatMap(item => item.expected.map(sprite => sprite.assetId)))].map(sourceIdentity),
    diagnostics, nativeSprites };
}

const api = { prepare, cases: () => CASES.map(spec => ({ ...spec })), renderCase, destroy: () => { renderer?.destroy(); renderer = undefined; } };
declare global { interface Window { __runtimeCompletionArtProbe: typeof api } }
window.__runtimeCompletionArtProbe = api;
const select = document.querySelector<HTMLSelectElement>('#case-selector');
if (select) for (const spec of CASES) { const option = document.createElement('option'); option.value = spec.id; option.textContent = spec.title; select.append(option); }
document.querySelector<HTMLButtonElement>('#render-case')?.addEventListener('click', () => {
  const title = document.querySelector<HTMLElement>('#case-title');
  void (async () => {
    if (!source) await prepare();
    const result = await renderCase(select?.value ?? CASES[0].id, document.querySelector<HTMLInputElement>('#low-effects')?.checked ?? false);
    if (title) title.textContent += ` · ${result.coverage.map(item => `${item.category}:${item.status}`).join(' / ')}`;
  })().catch(error => { if (title) title.textContent = `Probe failed: ${String(error)}`; });
});
