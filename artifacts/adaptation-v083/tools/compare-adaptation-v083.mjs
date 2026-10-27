import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Prepare only until the root agent freezes both trees and explicitly runs it.
if (process.argv.slice(2).some(arg => arg !== '--run') || process.argv.filter(arg => arg === '--run').length > 1) {
  throw Error('Usage: node .tools/compare-adaptation-v083.mjs [--run]');
}
if (!process.argv.includes('--run')) {
  console.log('Prepared only: 2 versions x 6 fixed seeds x 2 policies. No compilation or simulation executed. Await freeze, then --run.');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/adaptation-v083/comparison-attempt-1');
const seeds = [7, 71, 19, 47, 113, 211], policies = ['precision', 'area'];
const sourceDriverPath = resolve(root, 'artifacts/tactics-v082/final-attempt-1/candidate/active-driver.mjs');
const expectedDriverSha256 = 'ae21a4d1e033f37420724b79ccbc0a1cf1cb882b11b88e5fab029fa6f2aecac3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const writeNew = async (path, bytes) => { const handle = await open(path, 'wx'); try { await handle.writeFile(bytes); } finally { await handle.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const replaceOnce = (source, before, after) => {
  assert(source.indexOf(before) >= 0 && source.indexOf(before) === source.lastIndexOf(before), `Missing/ambiguous insertion: ${before.slice(0, 80)}`);
  return source.replace(before, after);
};

/** Injected into each frozen driver. External observations only: no game-state
 * writes, RNG consumption, private damage calls, or modifications to run(). */
function createAdaptationObserver(session, version) {
  const clone = value => value === undefined ? null : structuredClone(value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const prefixHash = createHash('sha256'), waveHashes = new Map(), waves = new Map(), warnings = [], applied = [], deferred = [], births = [];
  const issues = new Map(), warningsByGeneration = new Map(), appliedByGeneration = new Map(), primaryBirthIds = new Set(), birthCounts = new Map();
  const toolInputs = {}, toolsFired = new Set();
  let prefixFrames = 0, inputFrames = 0, maximumHistoryBins = 0, maximumRecentPrimaries = 0, maximumReserved = 0, maximumProbability = 0;
  const violation = (key, detail) => {
    if (!issues.has(key)) issues.set(key, { key, count: 0, first: clone(detail), last: null });
    const issue = issues.get(key); issue.count++; issue.last = clone(detail);
  };
  const traitList = value => typeof value === 'string' && value ? value.split('+') : [];
  const parse = (value, label, tick) => {
    try { return typeof value === 'string' ? JSON.parse(value) : clone(value); }
    catch (error) { violation(`invalid-${label}-json`, { tick, error: String(error), value }); return null; }
  };
  const checkTraits = (traits, detail) => {
    if (!Array.isArray(traits) || traits.length > 2 || new Set(traits).size !== traits.length
      || traits.some(trait => !['CARAPACE', 'FISSION', 'MIMIC'].includes(trait))) violation('invalid-active-traits', detail);
  };
  const reservations = s => s.targets.reduce((sum, actor) => sum + (actor.hp > 0
    ? actor.traits?.includes('FISSION') && (actor.generation ?? 0) === 0 && actor.role !== 'source' && actor.role !== 'core' ? 2 : 1
    : actor.splitAt !== undefined ? actor.splitPositions?.length ?? 2 : 0), 0);
  const summaryOf = (history, tick) => {
    const fromTick = Math.max(0, tick - 5400);
    let precisionDamage = 0, areaDamage = 0, scans = 0, isolations = 0, repaired = 0, sampleCount = 0;
    for (const bin of history) if (bin.tick >= fromTick && bin.tick <= tick) {
      precisionDamage += bin.precisionDamage; areaDamage += bin.areaDamage; scans += bin.scans;
      isolations += bin.isolations; repaired += bin.repaired; sampleCount++;
    }
    const total = precisionDamage + areaDamage;
    return { precisionDamage, areaDamage, precisionRatio: total > 0 ? precisionDamage / total : 0,
      areaRatio: total > 0 ? areaDamage / total : 0, scans, isolations, repaired, sampleCount, fromTick, toTick: tick };
  };
  const waveRecord = (s, wave = s.endless.wave) => {
    if (!waves.has(wave)) waves.set(wave, { wave, warning: null, started: null, cleared: null });
    return waves.get(wave);
  };
  session.bus.on('event', event => {
    const s = session.state, e = s.endless; if (!e) return;
    const at = s.elapsed, detail = { tick: event.tick, at, wave: e.wave }, data = event.data;
    if (event.type === 'TOOL_FIRED') toolsFired.add(Number(data.tool));
    if (event.type === 'RUN_STARTED') waveRecord(s).warning = { ...detail, duration: e.warningSeconds, plannedTraits: [...e.traits], initial: true,
      budget: e.totalToSpawn, roles: e.batchSchedule.flatMap(batch => batch.roles) };
    if (event.type === 'ENDLESS_WAVE_WARNING') waveRecord(s).warning = { ...detail, duration: Number(data.duration), plannedTraits: traitList(data.traits),
      activeTraitsDuringWarning: [...e.traits], budget: e.totalToSpawn, roles: e.batchSchedule.flatMap(batch => batch.roles) };
    if (event.type === 'ENDLESS_EVOLUTION_WARNING') {
      const history = clone(e.evolution?.history ?? []), candidates = parse(data.candidates, 'candidates', event.tick), summary = parse(data.summary, 'summary', event.tick);
      const row = { ...detail, generation: Number(data.generation), main: data.trait, traits: traitList(data.traits),
        duration: Number(data.duration), appliesAt: Number(data.applyAt), roll: Number(data.roll), candidates, summary,
        recomputedHistorySummary: summaryOf(history, event.tick), historyAtDecision: history,
        recentPrimaries: clone(e.evolution?.recentPrimaries ?? []), pending: clone(e.evolution?.pending), activeTraits: [...e.traits], battleTraits: [...s.battle.traits] };
      warnings.push(row);
      if (warningsByGeneration.has(row.generation)) violation('generation-rerolled', row);
      warningsByGeneration.set(row.generation, row);
      checkTraits(row.traits, detail);
      if (e.wave < 20 || e.wave % 5 !== 0 || row.generation !== Math.floor(e.wave / 5)) violation('wrong-selection-boundary', detail);
      if (row.duration < 8 || row.appliesAt - at < 8 - 1e-9) violation('short-evolution-warning', detail);
      if (!same(row.summary, row.recomputedHistorySummary)) violation('summary-history-mismatch', { ...detail, summary, recomputed: row.recomputedHistorySummary });
      if (!Array.isArray(candidates) || candidates.length < 2) violation('insufficient-main-diversity', detail);
      else {
        const sum = candidates.reduce((total, candidate) => total + candidate.probability, 0);
        if (Math.abs(sum - 1) > 1e-12) violation('probability-not-normalized', { ...detail, sum });
        for (const candidate of candidates) {
          maximumProbability = Math.max(maximumProbability, candidate.probability);
          if (!(candidate.probability > 0 && candidate.probability <= .55 + 1e-12)) violation('main-probability-cap', { ...detail, candidate });
        }
        let cumulative = 0;
        const selected = candidates.find(candidate => { cumulative += candidate.probability; return row.roll < cumulative; })?.trait ?? candidates.at(-1)?.trait;
        if (selected !== row.main || row.traits[0] !== row.main) violation('main-not-selected-from-final-probabilities', { ...detail, selected, main: row.main });
      }
    }
    if (event.type === 'ENDLESS_EVOLUTION_APPLIED') {
      const generation = Number(data.generation), warning = warningsByGeneration.get(generation);
      const row = { ...detail, generation, main: data.trait, traits: traitList(data.traits), warnedAt: Number(data.warnedAt),
        activeTraits: [...e.traits], battleTraits: [...s.battle.traits], current: clone(e.evolution?.current),
        warningToAppliedSeconds: warning ? at - warning.at : null, warningToAppliedTicks: warning ? event.tick - warning.tick : null };
      applied.push(row); checkTraits(row.traits, detail);
      if (appliedByGeneration.has(generation)) violation('generation-applied-twice', detail);
      appliedByGeneration.set(generation, row);
      if (!warning || at - warning.at < 8 - 1e-9 || event.tick - warning.tick < 480) violation('applied-without-full-warning', row);
      if (warning && (!same(warning.traits, row.traits) || warning.main !== row.main)) violation('announced-applied-traits-differ', row);
      if (!same(e.traits, row.traits) || !same(s.battle.traits, row.traits) || !same(e.evolution?.current?.traits, row.traits)) violation('applied-state-mismatch', row);
    }
    if (event.type === 'ENDLESS_EVOLUTION_DEFERRED') deferred.push({ ...detail, data: clone(data) });
    if (event.type === 'ENDLESS_WAVE_STARTED') {
      const row = { ...detail, traits: [...e.traits], battleTraits: [...s.battle.traits], budget: e.totalToSpawn,
        remaining: e.remainingToSpawn, current: clone(e.evolution?.current), roles: e.batchSchedule.flatMap(batch => batch.roles) };
      waveRecord(s).started = row; checkTraits(row.traits, detail);
      if (e.wave >= 20 && version === 'candidate') {
        const generation = Math.floor(e.wave / 5), expected = appliedByGeneration.get(generation);
        if (!expected || !same(expected.traits, row.traits)) violation('generation-not-locked-at-wave-start', { ...detail, generation, expected: expected?.traits, actual: row.traits });
      }
    }
    if (event.type === 'ENDLESS_WAVE_CLEARED') waveRecord(s).cleared = { ...detail, traits: [...e.traits], remaining: e.remainingToSpawn,
      pendingChildren: e.pendingChildren, living: s.targets.filter(actor => actor.hp > 0).length, spawnSerial: e.spawnSerial, totalToSpawn: e.totalToSpawn };
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === data.id);
      if (!actor) { violation('birth-without-actor', { ...detail, data }); return; }
      const primary = (actor.generation ?? 0) === 0;
      const plannedRole = primary ? e.batchSchedule[e.batchIndex]?.roles[e.batchMemberIndex - 1] ?? null : null;
      const row = { ...detail, id: actor.id, sourceId: actor.sourceId, generation: actor.generation ?? 0, role: actor.role, plannedRole,
        tactic: actor.tactic ?? 'melee', posture: actor.tacticPosture ?? 'approach', traits: [...(actor.traits ?? [])], hp: actor.hp, maxHp: actor.maxHp,
        activeTraits: [...e.traits], activeGeneration: e.evolution?.current?.generation ?? null, pendingGeneration: e.evolution?.pending?.decision.generation ?? null,
        budget: e.totalToSpawn, remaining: e.remainingToSpawn, spawnSerial: e.spawnSerial, ordinal: primary ? e.spawnSerial - 1 : null,
        rawReservationsDuringCallback: reservations(s), reservationMayIncludeMaterializingParent: !primary, x: actor.x, y: actor.y };
      births.push(row);
      if (primary) {
        if (primaryBirthIds.has(actor.id)) violation('duplicate-primary-birth', row); primaryBirthIds.add(actor.id);
        birthCounts.set(e.wave, (birthCounts.get(e.wave) ?? 0) + 1);
        if (row.sourceId !== `endless:wave:${e.wave}` || e.totalToSpawn - e.remainingToSpawn !== e.spawnSerial) violation('finite-budget-accounting', row);
        if (actor.maxHp !== (actor.role === 'elite' ? Math.min(204, 136 + Math.floor(e.wave / 10) * 34) : 68)) violation('unexpected-primary-hp', row);
        if (row.traits.length > 1 || row.traits.some(trait => !e.traits.includes(trait))) violation('birth-traits-outside-active-generation', row);
        if (plannedRole === 'support' && row.traits.length) violation('support-gained-passive-traits', row);
        if (actor.role === 'elite') {
          const expectedTactic = row.traits[0] === 'CARAPACE' ? 'crystal-charge' : row.traits[0] === 'FISSION' ? 'fission-burst' : 'mimic-corrosion';
          if (row.tactic !== expectedTactic) violation('elite-trait-tactic-mismatch', row);
          if (version === 'candidate' && e.wave >= 20) {
            const expectedTrait = e.traits[row.ordinal % e.traits.length];
            if (row.traits[0] !== expectedTrait) violation('elite-did-not-inherit-committed-trait', row);
          }
        }
      }
      if (row.pendingGeneration !== null) violation('birth-during-pending-generation', row);
    }
  });
  return {
    before(input) {
      const s = session.state; if (s.phase !== 'playing') return;
      const encoded = JSON.stringify(input); inputFrames++;
      if (s.endless.wave < 20) { prefixHash.update(encoded); prefixFrames++; }
      if (!waveHashes.has(s.endless.wave)) waveHashes.set(s.endless.wave, { hash: createHash('sha256'), frames: 0 });
      const current = waveHashes.get(s.endless.wave); current.hash.update(encoded); current.frames++;
      if (input.fire) toolInputs[input.tool] = (toolInputs[input.tool] ?? 0) + 1;
    },
    after() {
      const s = session.state, e = s.endless; if (!e) return;
      checkTraits(e.traits, { tick: s.tick, wave: e.wave, phase: e.phase });
      const reserved = reservations(s); maximumReserved = Math.max(maximumReserved, reserved);
      if (reserved > 24) violation('reserved-population-cap', { tick: s.tick, wave: e.wave, reserved });
      const historyLength = e.evolution?.history?.length ?? 0, recentLength = e.evolution?.recentPrimaries?.length ?? 0;
      maximumHistoryBins = Math.max(maximumHistoryBins, historyLength); maximumRecentPrimaries = Math.max(maximumRecentPrimaries, recentLength);
      if (historyLength > 5401 || recentLength > 3) violation('unbounded-adaptation-state', { tick: s.tick, historyLength, recentLength });
      const current = e.evolution?.current;
      if (current && (!same(current.traits, e.traits) || !same(current.traits, s.battle.traits))) violation('generation-changed-between-commits', { tick: s.tick, wave: e.wave, phase: e.phase, current: current.traits, actual: [...e.traits] });
      if ((birthCounts.get(e.wave) ?? 0) !== e.spawnSerial) violation('primary-birth-count-budget-mismatch', { tick: s.tick, wave: e.wave, observed: birthCounts.get(e.wave) ?? 0, actual: e.spawnSerial });
    },
    result() {
      const s = session.state;
      const waveInputHashes = [...waveHashes].map(([wave, entry]) => ({ wave, frames: entry.frames, sha256: entry.hash.digest('hex') }));
      const teaching = [5, 10, 15].map(wave => {
        const record = waves.get(wave);
        return { wave, covered: !!record?.started, warningSeconds: record?.warning?.duration ?? null,
          announcedTraits: record?.warning?.plannedTraits ?? null, startedTraits: record?.started?.traits ?? null,
          elites: births.filter(actor => actor.wave === wave && actor.role === 'elite').map(actor => ({ traits: actor.traits, tactic: actor.tactic, hp: actor.hp, maxHp: actor.maxHp })) };
      });
      return { scope: 'Read-only natural-run observations; no forced outcomes or helper matrix substituted for these runs.',
        beforeWave20: { inputSha256: prefixHash.digest('hex'), frames: prefixFrames, capturedThroughWave19: s.endless.wave >= 20 },
        inputFrames, toolInputs, toolsFired: [...toolsFired].sort(), waveInputHashes, teaching,
        warnings, applied, deferred, births, waves: [...waves.values()], violations: [...issues.values()],
        bounds: { maximumHistoryBins, maximumRecentPrimaries, maximumReserved, maximumProbability },
        generationLocks: [4, 5].map(generation => ({ generation, waves: [generation * 5, generation * 5 + 4],
          applied: appliedByGeneration.get(generation) ?? null,
          actualStartedWaves: [...waves.values()].filter(record => record.wave >= generation * 5 && record.wave <= generation * 5 + 4 && record.started)
            .map(record => ({ wave: record.wave, traits: record.started.traits })) })) };
    },
  };
}

function strategyParts(source) {
  const part = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert(from >= 0 && to > from, `Protected region missing: ${start}`); return source.slice(from, to);
  };
  return {
    activeInput: part('function activeInput(s) {', '\nfunction createTelemetry(session) {'),
    run: part('function run(seed) {', '\nexport { run, priorities };'),
    choosePending: part('  function choosePending() {', '\n  let measurementError = null;'),
    priorities: source.split('\n').find(line => line.startsWith('const priorities = ')),
  };
}
function makeDriver(original, version, policy) {
  const protectedParts = strategyParts(original);
  let source = replaceOnce(original, 'import { GameSession, distance,', 'import { GameSession as OriginalGameSession, distance,');
  if (policy === 'area') source = replaceOnce(source, 'tool: 1, fire: !!target,', 'tool: s.elapsed + 1e-9 >= s.cooldowns[2] ? 2 : 1, fire: !!target,');
  const observedClass = `${createAdaptationObserver.toString()}\nlet latestAdaptationObserver = null;\nclass GameSession extends OriginalGameSession {\n  constructor(...args) { super(...args); latestAdaptationObserver = createAdaptationObserver(this, ${JSON.stringify(version)}); }\n  step(...args) { latestAdaptationObserver.before(args[0]); const result = super.step(...args); latestAdaptationObserver.after(); return result; }\n}\n`;
  source = replaceOnce(source, '\nconst priorities = ', '\n' + observedClass + '\nconst priorities = ');
  source = replaceOnce(source, 'export { run, priorities };', `function runObserved(seed) {\n  latestAdaptationObserver = null;\n  let result;\n  try { result = run(seed); } catch (error) { result = { seed, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }\n  let observation = null;\n  try { observation = latestAdaptationObserver?.result() ?? null; } catch (error) { result = { ...result, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }\n  return { ...result, measurementPolicy: ${JSON.stringify(policy)},\n    inputs: result.inputs ? { ...result.inputs, toolsUsed: observation?.toolsFired ?? [] } : null, adaptationObservation: observation };\n}\nexport { runObserved as run, priorities };`);
  const newInput = source.slice(source.indexOf('function activeInput(s) {'), source.indexOf('\nfunction createTelemetry(session) {'));
  const restoredInput = policy === 'area' ? replaceOnce(newInput, 'tool: s.elapsed + 1e-9 >= s.cooldowns[2] ? 2 : 1, fire: !!target,', 'tool: 1, fire: !!target,') : newInput;
  const unchanged = { activeInputRestoredByteIdentical: restoredInput === protectedParts.activeInput,
    originalRunByteIdentical: source.includes(protectedParts.run), choosePendingByteIdentical: source.includes(protectedParts.choosePending), prioritiesByteIdentical: source.includes(protectedParts.priorities) };
  assert(Object.values(unchanged).every(Boolean), 'Protected public-input/control policy changed');
  return { source, compatibility: { ...unchanged, originalActiveInputSha256: sha(protectedParts.activeInput),
    executedActiveInputSha256: sha(newInput), originalRunSha256: sha(protectedParts.run), choosePendingSha256: sha(protectedParts.choosePending),
    prioritiesSha256: sha(protectedParts.priorities), onlyPolicyChange: policy === 'area' ? 'tool2 while its published cooldown is ready, otherwise tool1' : 'none',
    observer: 'Read-only GameSession subclass observes before/after public step and public bus; original run and public choice code retained byte-for-byte.' } };
}

await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse reuse even when a previous attempt failed.
const script = await readFile(new URL(import.meta.url));
await writeNew(resolve(output, 'measurement-script.mjs'), script);
const originalBytes = await readFile(sourceDriverPath);
assert(sha(originalBytes) === expectedDriverSha256, 'Saved v082 active driver changed');
await writeNew(resolve(output, 'original-active-driver.mjs'), originalBytes);
const original = originalBytes.toString('utf8');
await json(resolve(output, 'planned-cases.json'), { seeds, policies, versions: ['baseline', 'candidate'], totalRuns: 24, goalWaves: 30,
  simulationSecondsPerRun: 900, simulationSecondsPerWave: 120, retries: 0 });
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types'; export {endlessCombatStats} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';`;
const versions = [{ name: 'baseline', directory: resolve(root, '.tools/tactics-v082-source') },
  { name: 'candidate', directory: resolve(root, '.tools/adaptation-v083-source') }];
const frozen = [];
try {
  for (const version of versions) {
    const folder = resolve(output, version.name); await mkdir(folder);
    const loaded = new Map();
    const compiled = await build({ stdin: { contents: entry, resolveDir: version.directory, loader: 'ts' }, absWorkingDir: version.directory,
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', metafile: true,
      plugins: [{ name: 'capture-all-parsed-source-bytes', setup(builder) {
        builder.onLoad({ filter: /\.ts$/ }, async args => {
          assert(args.path.startsWith(version.directory + sep), `External source: ${args.path}`);
          const bytes = await readFile(args.path), path = relative(version.directory, args.path).split(sep).join('/');
          assert(!loaded.has(path) || loaded.get(path).sha256 === sha(bytes), `Source changed during bundle: ${path}`);
          loaded.set(path, { path, sha256: sha(bytes), bytes: bytes.length, source: bytes });
          return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
        });
      } }],
    });
    const parsed = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
    assert(JSON.stringify(parsed) === JSON.stringify([...loaded.keys()].sort()), 'Parsed inputs and captured source set differ');
    const bundle = Buffer.from(compiled.outputFiles[0].contents);
    if (version.name === 'baseline') {
      const priorBundle = await readFile(resolve(dirname(sourceDriverPath), 'simulation-bundle.mjs'));
      assert(bundle.equals(priorBundle), 'Baseline rebuild differs from the saved v082 final candidate');
    }
    await writeNew(resolve(folder, 'simulation-bundle.mjs'), bundle); await writeNew(resolve(folder, 'entry.ts'), entry);
    await json(resolve(folder, 'metafile.json'), compiled.metafile);
    const fingerprints = [...loaded.values()].sort((a, b) => a.path.localeCompare(b.path)).map(({ source, ...item }) => item);
    await json(resolve(folder, 'source-fingerprints.json'), fingerprints);
    for (const item of loaded.values()) {
      const path = resolve(folder, 'frozen-source', item.path); await mkdir(dirname(path), { recursive: true }); await writeNew(path, item.source);
    }
    frozen.push({ ...version, folder, fingerprints, bundleSha256: sha(bundle),
      runtimeOutputInputs: Object.entries(Object.values(compiled.metafile.outputs)[0].inputs).filter(([path, value]) => path !== '<stdin>' && value.bytesInOutput > 0).map(([path]) => path).sort() });
  }
} catch (error) {
  await json(resolve(output, 'preflight-failure.json'), { atUtc: new Date().toISOString(), simulationRunsExecuted: 0, error: String(error?.stack ?? error) });
  throw error;
} finally { stopEsbuild(); }

const results = [], compatibility = {}, rawResults = new Map();
for (const version of frozen) for (const policy of policies) {
  const driver = makeDriver(original, version.name, policy); compatibility[`${version.name}/${policy}`] = driver.compatibility;
  const driverPath = resolve(version.folder, `${policy}-driver.mjs`); await writeNew(driverPath, driver.source);
  const module = await import(pathToFileURL(driverPath).href);
  for (const seed of seeds) {
    const result = module.run(seed), observed = result.adaptationObservation;
    await json(resolve(version.folder, `seed-${seed}-${policy}.json`), result);
    rawResults.set(`${version.name}/${seed}/${policy}`, result);
    const row = { version: version.name, policy, seed, stop: result.stop, measurementError: result.measurementError ?? null,
      clearedWaves: result.clearedWaves ?? 0, elapsed: result.elapsed ?? null, finalPlayerHp: result.finalPlayerHp ?? null,
      finalTissueHp: result.finalTissueHp ?? null, playerDamage: result.totalPlayerDamage ?? null, organDamage: result.totalOrganDamage ?? null,
      inputSha256: result.inputs?.inputSha256 ?? null, inputFrames: observed?.inputFrames ?? null, beforeWave20: observed?.beforeWave20 ?? null,
      warningCount: observed?.warnings.length ?? 0, appliedCount: observed?.applied.length ?? 0, deferCount: observed?.deferred.length ?? 0,
      selectedMains: observed?.applied.map(item => ({ generation: item.generation, main: item.main, traits: item.traits })) ?? [],
      observedViolationKinds: observed?.violations.length ?? null, bounds: observed?.bounds ?? null, driverSha256: sha(driver.source) };
    results.push(row); console.log(JSON.stringify(row));
  }
}
await json(resolve(output, 'strategy-compatibility.json'), compatibility);
const sourceChecks = [];
for (const version of frozen) {
  const after = [];
  for (const item of version.fingerprints) {
    const bytes = await readFile(resolve(version.directory, item.path)); after.push({ path: item.path, sha256: sha(bytes), bytes: bytes.length });
  }
  await json(resolve(version.folder, 'source-fingerprints-after.json'), after);
  sourceChecks.push({ version: version.name, unchanged: JSON.stringify(version.fingerprints) === JSON.stringify(after), sourceCount: after.length });
}
const prefixComparisons = [], behaviorComparisons = [];
for (const seed of seeds) for (const policy of policies) {
  const baseline = rawResults.get(`baseline/${seed}/${policy}`), candidate = rawResults.get(`candidate/${seed}/${policy}`);
  const a = baseline?.adaptationObservation, b = candidate?.adaptationObservation;
  const bothCovered = !!a?.beforeWave20.capturedThroughWave19 && !!b?.beforeWave20.capturedThroughWave19;
  prefixComparisons.push({ seed, policy, bothCoveredThroughWave19: bothCovered,
    inputPrefixEqual: bothCovered ? a.beforeWave20.inputSha256 === b.beforeWave20.inputSha256 && a.beforeWave20.frames === b.beforeWave20.frames : null,
    baselinePrefix: a?.beforeWave20 ?? null, candidatePrefix: b?.beforeWave20 ?? null,
    teachingComparisons: [5, 10, 15].map(wave => {
      const x = a?.teaching.find(item => item.wave === wave), y = b?.teaching.find(item => item.wave === wave);
      return { wave, bothCovered: !!x?.covered && !!y?.covered, exactTeachingEqual: x?.covered && y?.covered ? JSON.stringify(x) === JSON.stringify(y) : null,
        baseline: x ?? null, candidate: y ?? null };
    }) });
}
for (const seed of seeds) {
  const precision = rawResults.get(`candidate/${seed}/precision`)?.adaptationObservation;
  const area = rawResults.get(`candidate/${seed}/area`)?.adaptationObservation;
  behaviorComparisons.push({ seed, generations: [4, 5, 6].map(generation => {
    const x = precision?.warnings.find(item => item.generation === generation), y = area?.warnings.find(item => item.generation === generation);
    return { generation, bothObserved: !!x && !!y, precision: x ? { main: x.main, traits: x.traits, summary: x.summary, candidates: x.candidates, roll: x.roll } : null,
      area: y ? { main: y.main, traits: y.traits, summary: y.summary, candidates: y.candidates, roll: y.roll } : null,
      mainChanged: x && y ? x.main !== y.main : null, candidateProbabilitiesChanged: x && y ? JSON.stringify(x.candidates) !== JSON.stringify(y.candidates) : null };
  }) });
}
const report = { schemaVersion: 1, measuredAtUtc: new Date().toISOString(), command: 'node .tools/compare-adaptation-v083.mjs --run',
  scope: '24 natural public-input runs of two frozen simulation versions. Not the helper 1000-seed matrix, browser/performance, human fun, or retention evidence.',
  seeds, policies, plannedRuns: 24, completedRuns: results.length, goalWaves: 30, totalSimulationBudgetSeconds: 900, perWaveSimulationBudgetSeconds: 120, retries: 0,
  originalDriver: { path: sourceDriverPath, sha256: expectedDriverSha256 }, measurementScriptSha256: sha(script),
  policy: { precision: 'Exact saved activeInput; unchanged original run/modal/growth bytes.',
    area: 'Only activeInput tool field changes to ready tool2, otherwise tool1; movement, aim, Q, priorities and public modal handling unchanged.',
    publicMutationScope: 'Only saved start/step/discardDraft/chooseCombatUpgrade/resume. Observer writes only external records, never game state.',
    outcomePolicy: 'No forced victory, damage, adaptation difference or failure. All real deaths, timeouts and measurement errors retained; no seed swaps or retries.',
    beforeWave20Definition: 'Hash inputs evaluated while the pre-step wave<20, including the boundary-advancing step; compare versions within the same seed and policy only.',
    probabilityDefinition: 'At most55% for a newly drawn main, not marginal inclusion of a retained companion.' },
  frozenVersions: frozen.map(version => ({ version: version.name, sourceDirectory: version.directory, bundleSha256: version.bundleSha256,
    sourceFingerprints: version.fingerprints, runtimeOutputInputs: version.runtimeOutputInputs })), sourceChecks, compatibility,
  prefixComparisons, behaviorComparisons, results };
await json(resolve(output, 'report.json'), report);
const table = ['| Version | Policy | Seed | Stop | Cleared | Sim seconds | Player damage | Applied mains | Observer issues |',
  '|---|---|---:|---|---:|---:|---:|---|---:|', ...results.map(row => `| ${row.version} | ${row.policy} | ${row.seed} | ${row.stop} | ${row.clearedWaves} | ${row.elapsed?.toFixed(3) ?? '—'} | ${row.playerDamage ?? '—'} | ${row.selectedMains.map(item => `${item.generation}:${item.main}`).join(' / ')} | ${row.observedViolationKinds ?? '—'} |`)];
await writeNew(resolve(output, 'summary.md'), '# v083 natural public-input adaptation comparison\n\n' + table.join('\n')
  + '\n\nEach raw run retains its original driver telemetry plus read-only warning/applied receipts, actual births, decision probabilities, 90-second history snapshots and recomputed summaries, per-wave inputs, finite budget observations and bounded-state checks. Before-wave20 hashes and tutorial5/10/15 comparisons are version-to-version under the same seed/policy; incomplete coverage is explicit.\n\nTwo policies may legitimately select the same main. Candidate probability/context differences and actual born traits/tactics are recorded separately. A win, a death, or a changed main is not required for data retention. All24 results are reported, including failures and timeouts, without retries. This evidence does not establish human comprehension, fun or long-term replay.\n');
console.log(JSON.stringify({ output, completedRuns: results.length, sourceChecks, simulationTasksFinished: true, esbuildStoppedBeforeSimulation: true }));
if (sourceChecks.some(item => !item.unchanged) || results.some(row => row.measurementError || row.observedViolationKinds > 0)
  || prefixComparisons.some(row => row.inputPrefixEqual === false || row.teachingComparisons.some(item => item.exactTeachingEqual === false))) process.exitCode = 1;
