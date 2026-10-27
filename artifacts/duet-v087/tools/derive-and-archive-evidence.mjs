import { readFile, open, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Evidence-only derivation. No game import, bundle execution, browser or simulation.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = resolve(root, 'artifacts/duet-v087/comparison-attempt-1');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = path => relative(root, path).replaceAll('\\', '/');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeNew = async (path, bytes) => { const file = await open(path, 'wx'); try { await file.writeFile(bytes); } finally { await file.close(); } };
const writeJson = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const near = (a, b) => Math.abs(a - b) <= 1e-6;
const check = (conditions, key, pass, detail = null) => { conditions.push({ key, pass: !!pass, ...(detail ? { detail } : {}) }); };
const report = await readJson(resolve(folder, 'report.json'));
const summaries = [], rawHashes = [], independent = [];

for (const row of report.results) {
  const path = resolve(folder, row.file), bytes = await readFile(path), raw = JSON.parse(bytes.toString('utf8')), o = raw.duetObservation;
  rawHashes.push({ rawPath: rel(path), rawBytes: bytes.length, rawSha256: sha(bytes), matchesMeasurementRow: sha(bytes) === row.rawFileSha256 });
  const conditions = [], events = o.events, receiptBySequence = new Map(o.positiveHostReceipts.map(event => [event.sequence, event]));
  const duetActors = o.actors.filter(actor => actor.orderedPairAtBirth);
  const cycleCommits = events.filter(event => event.type === 'ELITE_TACTIC_COMMITTED');
  const actualPlayer = o.positiveHostReceipts.filter(event => event.type === 'PLAYER_HURT').reduce((sum, event) => sum + event.actualLoss, 0);
  const tissueByReason = {};
  for (const event of o.positiveHostReceipts.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED')) tissueByReason[event.data.reason] = (tissueByReason[event.data.reason] ?? 0) + event.actualLoss;
  check(conditions, 'raw-file-sha256', sha(bytes) === row.rawFileSha256);
  check(conditions, 'accepted-positive-player-receipts-equal-both-summaries', near(actualPlayer, o.actualPlayerLoss) && near(actualPlayer, raw.totalPlayerDamage));
  check(conditions, 'accepted-positive-tissue-receipts-equal-both-summaries', near(Object.values(tissueByReason).reduce((sum, value) => sum + value, 0), raw.totalOrganDamage)
    && JSON.stringify(tissueByReason) === JSON.stringify(o.actualTissueLossByReason));
  check(conditions, 'player-hp-conservation', near(100 + raw.totalPlayerHealing - actualPlayer, raw.finalPlayerHp));
  check(conditions, 'tissue-hp-conservation', near(100 + raw.totalOrganRepair - raw.totalOrganDamage, raw.finalTissueHp));
  check(conditions, 'input-digests-equal', raw.inputs.inputSha256 === o.inputSha256);
  check(conditions, 'tool1-only-and-no-catalysis', o.counters.otherToolFireInputs === 0 && !o.choices.some(choice => choice.accepted && choice.args[1] === 'catalysis'));
  check(conditions, 'population-run-sample-count', o.populationRuns.reduce((sum, run) => sum + run.samples, 0) === o.counters.populationSamples);
  const boundaryRuns = o.populationRuns.filter(run => run.counts.reservationAuthority.startsWith('Completed public-step'));
  check(conditions, 'boundary-reservations-max24', boundaryRuns.every(run => run.counts.reserved <= 24));
  check(conditions, 'all-sampled-live-parent-and-commitment-caps', o.populationRuns.every(run => run.counts.live <= 24 && run.counts.liveFissionParents <= 4
    && run.counts.concurrent <= 3 && Object.values(run.counts.byHeavy).every(count => count <= 1)));
  check(conditions, 'child-cycle-and-grandchild-promises-absent', !o.actors.some(actor => actor.birth.body.generation > 0 && actor.birth.body.eliteCycle)
    && !events.some(event => event.type === 'FISSION_WARNING' && event.actor?.generation > 0));
  for (const committed of cycleCommits) {
    const matching = events.filter(event => event.type === 'ENEMY_TACTIC_COMMITTED' && event.eventTick === committed.eventTick
      && event.data.actorId === committed.data.actorId && event.data.tactic === committed.data.tactic);
    check(conditions, `cycle-commit:${committed.sequence}`, matching.length === 1 && matching[0].actor?.attackPlan?.kind === committed.data.tactic
      && committed.actor?.eliteCycle?.committedTick === committed.eventTick && committed.data.committedTick === committed.eventTick
      && committed.actor?.eliteCycle?.index === committed.data.cycleIndex,
    { actorId: committed.data.actorId, tick: committed.eventTick, tactic: committed.data.tactic, matchedEnemySequences: matching.map(event => event.sequence) });
  }
  for (const advanced of o.advances) {
    const cast = o.casts.find(value => value.actorId === advanced.data.actorId && value.cycleCommit?.data.committedTick === advanced.data.committedTick);
    const expectedType = { resolved: 'ENEMY_TACTIC_RESOLVED', 'charge-ended': 'ENEMY_CHARGE_ENDED', 'scan-interrupted': 'ENDLESS_CORROSION_INTERRUPTED',
      'area-interrupted': 'AREA_DISPLACED', 'pulse-interrupted': 'PULSE_TRIGGERED' }[advanced.data.reason];
    const matching = events.filter(event => event.type === expectedType && event.eventTick === advanced.eventTick
      && (expectedType === 'PULSE_TRIGGERED' || event.data.actorId === advanced.data.actorId || event.data.targetId === advanced.data.actorId));
    const minimum = advanced.data.reason === 'scan-interrupted' ? 2 : advanced.data.reason === 'area-interrupted' ? Math.max(.45, cast?.frozenPlan.recoveryExposure ?? 0)
      : advanced.data.reason === 'pulse-interrupted' ? Math.max(1.3, cast?.frozenPlan.recoveryExposure ?? 0) : cast?.frozenPlan.recoveryExposure ?? 0;
    check(conditions, `actual-advance:${advanced.sequence}`, !!cast && matching.length > 0 && advanced.data.cycleIndex === (cast.cycleCommit.data.cycleIndex === 0 ? 1 : 0)
      && advanced.actor.eliteCycle.index === advanced.data.cycleIndex && advanced.actor.eliteCycle.committedTick === undefined
      && advanced.data.recoverUntil + 1e-7 >= advanced.at + minimum && advanced.actor.attackReady + 1e-7 >= advanced.data.recoverUntil,
    { actorId: advanced.data.actorId, reason: advanced.data.reason, actualCompletionSequences: matching.map(event => event.sequence), minimumRecovery: minimum });
  }
  let idleIndexSamples = 0, frozenLateElitePlanSamples = 0, stableChargeSamples = 0;
  for (const frame of o.lateEliteFrames) for (const before of frame.bodiesBefore.filter(body => body.eliteCycle)) {
    const after = frame.bodiesAfter.find(body => body.id === before.id);
    if (!after || after.hp <= 0 || !after.eliteCycle) continue;
    const actions = events.filter(event => event.sequence >= frame.eventSequenceRange[0] && event.sequence <= frame.eventSequenceRange[1]
      && event.data.actorId === before.id && ['ELITE_TACTIC_COMMITTED', 'ELITE_TACTIC_ADVANCED'].includes(event.type));
    if (!actions.length) {
      idleIndexSamples++;
      check(conditions, `sampled-no-accepted-action-index:${frame.serial}:${before.id}`, frame.after.phase !== 'playing' || before.eliteCycle.index === after.eliteCycle.index);
    }
    if (before.attackPlan && after.attackPlan) {
      frozenLateElitePlanSamples++;
      check(conditions, `frozen-late-elite-plan:${frame.serial}:${before.id}`, JSON.stringify(before.attackPlan) === JSON.stringify(after.attackPlan) && before.attackAt === after.attackAt);
    }
    if (before.charge && after.charge) {
      stableChargeSamples++;
      const fixed = charge => Object.fromEntries(['from', 'to', 'startedAt', 'endsAt', 'speed', 'radius', 'playerDamage', 'tissueDamage', 'recoveryExposure', 'interval'].map(key => [key, charge[key]]));
      check(conditions, `frozen-late-elite-charge:${frame.serial}:${before.id}`, JSON.stringify(fixed(before.charge)) === JSON.stringify(fixed(after.charge)));
    }
  }
  check(conditions, 'independent-idle-index-count-matches-observer', idleIndexSamples === o.counters.samplesWithoutCommitOrAdvance);
  const bodies = duetActors.map(actor => {
    const actualCommits = actor.cycleCommits.map(commit => {
      const cast = o.casts.find(value => value.cycleCommit?.sequence === commit.sequence);
      return { receipt: commit, castId: cast?.id ?? null, frozenPlan: cast?.frozenPlan ?? null, deadline: cast?.attackAt ?? null,
        actualChargeStart: cast?.chargeStart ?? null, actualCompletion: cast?.completion ?? null,
        actualAdvancement: cast?.advancement ?? null,
        positivePlayerLoss: (cast?.positivePlayerReceipts ?? []).map(sequence => receiptBySequence.get(sequence)).filter(Boolean),
        positiveTissueLoss: (cast?.positiveTissueReceipts ?? []).map(sequence => receiptBySequence.get(sequence)).filter(Boolean) };
    });
    const finalCast = actualCommits.at(-1), advance = finalCast?.actualAdvancement;
    const deathPhase = !finalCast ? 'before-first-accepted-cycle-action' : advance && actor.death?.at < advance.data.recoverUntil
      ? `during-recovery-after-${advance.data.reason}` : finalCast.actualChargeStart && !finalCast.actualCompletion ? 'during-actual-charge'
        : !finalCast.actualCompletion && actor.death?.at < finalCast.deadline ? 'during-frozen-windup'
          : !finalCast.actualCompletion ? 'before-host-resolution-after-nominal-deadline' : 'after-accepted-action-before-companion';
    const killer = o.positiveHostReceipts.filter(event => event.type === 'TARGET_HIT' && event.data.id === actor.id && event.data.remainingHp === 0).at(-1);
    const outgoingPlayer = o.positiveHostReceipts.filter(event => event.type === 'PLAYER_HURT' && event.data.actorId === actor.id);
    const outgoingTissue = o.positiveHostReceipts.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'enemy-attack' && event.data.actorId === actor.id);
    return { id: actor.id, wave: actor.birth.wave, birth: actor.birth, orderedPair: actor.orderedPairAtBirth,
      acceptedCycleActions: actualCommits, companionCommitted: actor.companionCommitted, missingReason: actor.companionMissingReason,
      death: actor.death, deathPhase, actualKillingReceipt: killer ?? null,
      actualIncomingHpLoss: o.positiveHostReceipts.filter(event => event.type === 'TARGET_HIT' && event.data.id === actor.id).reduce((sum, event) => sum + event.data.damage, 0),
      actualOutgoingPlayerLoss: outgoingPlayer.reduce((sum, event) => sum + event.actualLoss, 0),
      actualOutgoingTissueLoss: outgoingTissue.reduce((sum, event) => sum + event.actualLoss, 0),
      outgoingPositiveReceipts: [...outgoingPlayer, ...outgoingTissue],
      observedRecoveryAliveSeconds: advance && actor.death ? actor.death.at - advance.at : null,
      fissionPromiseReceipts: events.filter(event => ['FISSION_WARNING', 'FISSION_SPAWNED'].includes(event.type) && event.data.parentId === actor.id),
      lastObserved: actor.lastStateAtStop };
  });
  const summary = { version: row.version, seed: row.seed, replay: row.replay, rawPath: rel(path), rawFileSha256: sha(bytes), stop: raw.stop,
    clearedWaves: raw.clearedWaves, elapsed: raw.elapsed, actualPlayerLoss: actualPlayer, tissueLossByReason: tissueByReason,
    finalPlayerHp: raw.finalPlayerHp, finalTissueHp: raw.finalTissueHp, actualTargetHpLoss: o.actualTargetHpLoss,
    acceptedSpecialPlanCounts: Object.fromEntries([...new Set(o.casts.map(cast => cast.commit.data.tactic))].map(tactic => [tactic, o.casts.filter(cast => cast.commit.data.tactic === tactic).length])),
    duetBodies: bodies, cycleCommitCount: cycleCommits.length, advanceCount: o.advances.length,
    actualDuetPlayerLoss: bodies.reduce((sum, body) => sum + body.actualOutgoingPlayerLoss, 0), actualDuetTissueLoss: bodies.reduce((sum, body) => sum + body.actualOutgoingTissueLoss, 0),
    actualDuetChargeStarts: bodies.flatMap(body => body.acceptedCycleActions).filter(cast => cast.actualChargeStart).length,
    actualDuetCompletedOrInterrupted: bodies.flatMap(body => body.acceptedCycleActions).filter(cast => cast.actualAdvancement).length,
    validation: { checks: conditions.length, failedChecks: conditions.filter(item => !item.pass), cycleReceiptChecks: conditions.filter(item => item.key.startsWith('cycle-commit:') || item.key.startsWith('actual-advance:')),
      sampledNoAcceptedActionStableIndex: idleIndexSamples, frozenLateElitePlanSamples, stableLateEliteChargeSamples: stableChargeSamples },
    counters: o.counters, violations: o.violations, terminalIndexChanges: o.terminalIndexChanges,
    finalRanks: raw.finalGrowth.ranks };
  summaries.push(summary); if (!row.replay) independent.push(summary);
}

const aggregate = version => {
  const cases = independent.filter(row => row.version === version), allDuets = cases.flatMap(row => row.duetBodies);
  return { independentCases: cases.length, clearedWaves: cases.map(row => row.clearedWaves), elapsed: cases.reduce((sum, row) => sum + row.elapsed, 0),
    actualPlayerLoss: cases.reduce((sum, row) => sum + row.actualPlayerLoss, 0),
    tissueLossByReason: Object.fromEntries([...new Set(cases.flatMap(row => Object.keys(row.tissueLossByReason)))].map(reason => [reason, cases.reduce((sum, row) => sum + (row.tissueLossByReason[reason] ?? 0), 0)])),
    actualTargetHpLoss: cases.reduce((sum, row) => sum + row.actualTargetHpLoss, 0), duetBirths: allDuets.length,
    cycleCommitCount: cases.reduce((sum, row) => sum + row.cycleCommitCount, 0), advanceCount: cases.reduce((sum, row) => sum + row.advanceCount, 0),
    companionCommittedBodies: allDuets.filter(body => body.companionCommitted).length,
    missingByReason: Object.fromEntries([...new Set(allDuets.map(body => body.missingReason))].map(reason => [reason, allDuets.filter(body => body.missingReason === reason).length])),
    deathPhases: Object.fromEntries([...new Set(allDuets.map(body => body.deathPhase))].map(reason => [reason, allDuets.filter(body => body.deathPhase === reason).length])),
    actualDuetChargeStarts: cases.reduce((sum, row) => sum + row.actualDuetChargeStarts, 0),
    actualDuetPlayerLoss: cases.reduce((sum, row) => sum + row.actualDuetPlayerLoss, 0), actualDuetTissueLoss: cases.reduce((sum, row) => sum + row.actualDuetTissueLoss, 0),
    maximumObservedLive: Math.max(...cases.map(row => row.counters.maximumLive)), maximumBoundaryReserved: Math.max(...cases.map(row => row.counters.maximumReserved)),
    maximumFissionParents: Math.max(...cases.map(row => row.counters.maximumFissionParents)), maximumConcurrent: Math.max(...cases.map(row => row.counters.maximumConcurrent)), maximumSameHeavy: Math.max(...cases.map(row => row.counters.maximumSameHeavy)),
    failedDerivedChecks: cases.reduce((sum, row) => sum + row.validation.failedChecks.length, 0) };
};
const parsedChecks = [];
for (const version of report.frozenVersions) for (const file of version.parsedFingerprints) {
  const frozenBytes = await readFile(resolve(folder, version.version, 'frozen-source', file.path));
  const isolatedBytes = await readFile(resolve(version.directory, file.path));
  const mainBytes = version.version === 'candidate' ? await readFile(resolve(root, file.path)) : null;
  parsedChecks.push({ version: version.version, path: file.path, reportedSha256: file.sha256, frozenSha256: sha(frozenBytes), currentIsolatedSha256: sha(isolatedBytes),
    currentMainSha256: mainBytes ? sha(mainBytes) : null, parsedIsUi: file.path.startsWith('src/ui/'),
    matchesReported: sha(frozenBytes) === file.sha256 && sha(isolatedBytes) === file.sha256 && (!mainBytes || sha(mainBytes) === file.sha256) });
}
async function filesBelow(directory) { const found = []; for (const entry of await readdir(directory, { withFileTypes: true })) {
  const path = resolve(directory, entry.name); if (entry.isDirectory()) found.push(...await filesBelow(path)); else found.push(path);
} return found; }
const currentSourceChecks = [];
for (const directory of ['src/game', 'src/actors', 'src/core', 'src/ui']) for (const path of await filesBelow(resolve(root, '.tools/duet-v087-source', directory))) {
  const name = relative(resolve(root, '.tools/duet-v087-source'), path).replaceAll('\\', '/');
  let mainBytes = null; try { mainBytes = await readFile(resolve(root, name)); } catch { /* Missing is recorded below. */ }
  const candidateBytes = await readFile(path);
  currentSourceChecks.push({ path: name, candidateSha256: sha(candidateBytes), currentMainSha256: mainBytes ? sha(mainBytes) : null,
    isUi: name.startsWith('src/ui/'), equal: !!mainBytes && sha(candidateBytes) === sha(mainBytes) });
}
const frozenV2 = await readJson(resolve(root, 'artifacts/duet-v087/integration/frozen-owned-source-v2.json'));
const finalV2RuntimeChecks = [];
for (const file of frozenV2.rows.filter(row => /^src\/(game|actors|core)\//.test(row.path))) {
  const mainBytes = await readFile(resolve(root, file.path)), measured = parsedChecks.find(row => row.version === 'candidate' && row.path === file.path);
  finalV2RuntimeChecks.push({ path: file.path, finalV2DeclaredSha256: file.sha256, currentMainSha256: sha(mainBytes), measuredSha256: measured?.reportedSha256 ?? null,
    equalsFinalV2: sha(mainBytes) === file.sha256 && (!measured || measured.reportedSha256 === file.sha256), parsedByMeasurement: !!measured });
}
const browserObservations = [];
for (const project of ['chrome', 'edge']) {
  const path = resolve(root, `artifacts/duet-v087/browser-attempt-1/${project}/output/duet-v087-naturally-reach--fe255--its-real-committed-tactics-${project}/natural-duet.json`);
  const bytes = await readFile(path), raw = JSON.parse(bytes.toString('utf8'));
  const committed = raw.events.filter(event => event.type === 'ELITE_TACTIC_COMMITTED' && event.data.actorId === raw.eliteId);
  const advanced = raw.events.filter(event => event.type === 'ELITE_TACTIC_ADVANCED' && event.data.actorId === raw.eliteId);
  browserObservations.push({ project, file: rel(path), sha256: sha(bytes), scope: raw.scope, eliteId: raw.eliteId, complete: raw.complete,
    committed, advanced, gaps: raw.gaps, errors: raw.errors, remote: raw.remote,
    distinction: 'Separate seed71 browser technical observation deliberately holds fire and orbits at wave20. It is not the locked always-active comparison policy, an extra matrix case, or human evidence.' });
}
const scriptBytes = await readFile(resolve(root, '.tools/compare-duet-v087.mjs')), snapshotScript = await readFile(resolve(folder, 'measurement-script.mjs'));
const helperBytes = await readFile(fileURLToPath(import.meta.url));
const initialReplay = await readFile(resolve(folder, 'candidate/seed-71.json')), repeatedReplay = await readFile(resolve(folder, 'candidate/seed-71-replay-1.json'));
const review = { schemaVersion: 1, scope: 'Read-only derivation of the existing seven fixed raw cases. No simulation, replay, browser execution, gameplay edit or original-evidence mutation.',
  measurement: { scriptSha256: sha(scriptBytes), frozenScriptSha256: sha(snapshotScript), scriptBytesEqual: scriptBytes.equals(snapshotScript), originalDriver: report.originalDriver,
    caseCount: report.results.length, independentCaseCount: independent.length, replayExcludedFromAggregates: true, sourceChecks: report.sourceChecks, compatibility: report.compatibility },
  aggregates: { baseline: aggregate('baseline'), candidate: aggregate('candidate') },
  pairedDeltas: report.plan.seeds.map(seed => { const baseline = independent.find(row => row.version === 'baseline' && row.seed === seed), candidate = independent.find(row => row.version === 'candidate' && row.seed === seed);
    return { seed, elapsedDelta: candidate.elapsed - baseline.elapsed, playerLossDelta: candidate.actualPlayerLoss - baseline.actualPlayerLoss,
      enemyTissueLossDelta: (candidate.tissueLossByReason['enemy-attack'] ?? 0) - (baseline.tissueLossByReason['enemy-attack'] ?? 0),
      protocolCostDelta: (candidate.tissueLossByReason['protocol-pressure'] ?? 0) - (baseline.tissueLossByReason['protocol-pressure'] ?? 0) }; }),
  cases: summaries, rawHashes, replay: { exactOriginalFileBytesEqual: initialReplay.equals(repeatedReplay), originalSha256: sha(initialReplay), replaySha256: sha(repeatedReplay) },
  runtimeFinalV2: { parsedChecks, parsedMainOrFrozenDifferences: parsedChecks.filter(row => !row.matchesReported), unexpectedUiParsed: parsedChecks.filter(row => row.parsedIsUi),
    allRuntimeDirectoryChecks: currentSourceChecks.filter(row => !row.isUi), nonUiDirectoryDifferences: currentSourceChecks.filter(row => !row.isUi && !row.equal),
    uiDifferencesExcludedFromMeasuredRuntime: currentSourceChecks.filter(row => row.isUi && !row.equal),
    finalV2RuntimeChecks, finalV2RuntimeDifferences: finalV2RuntimeChecks.filter(row => !row.equalsFinalV2) },
  separateBrowserHoldFireObservations: browserObservations,
  limitations: ['Only three independent cases per version; replay is not an extra independent sample.',
    'The regular active policy observed12 dual births and11 main action commitments but0 companion commitments. Missing companion behavior is retained, not repaired by extra runs or forced survival.',
    'Two actual main-action advancements were followed by death during recovery; this matrix does not demonstrate the complete recovery-to-companion loop.',
    'Browser wave20 hold-fire/orbit observations demonstrate a deliberately prolonged encounter under a different policy, not companion visibility during the regular active strategy.',
    'Observed population peaked below24; no24-body performance claim. Event-level reservation arrays are structural upper bounds; exact reservations use completed public-step boundaries.',
    'No paused-step calls in this fixed driver, and no inferred private rejection reasons. Samples without acceptance prove unchanged observed index only.',
    'Same strategy algorithm is not identical input tapes; actual targets, timing and offers diverge. Neither tiny time differences nor equal wins establish balance or causal effects.',
    'No fun, comprehension, replay willingness, retention or incubation-value conclusion. Standard new-player blind testing remains0/5.'],
  conciseTruthfulConclusion: '常规主动射击对照中，三条候选路线都清至35波，但12只双招精英均在伴招受理前死亡。只有两次主招实际推进：一次侵蚀结算造成9组织伤害，一次被Q打断；不能称常规打法已自然展示完整双招。浏览器另以第20波主动停火绕行观察到两招，属于不同观察策略。',
  rawArchiveManifest: 'artifacts/duet-v087/comparison-attempt-1/raw-evidence-archives.json',
  derivationHelper: { path: rel(fileURLToPath(import.meta.url)), sha256: sha(helperBytes) } };
await writeJson(resolve(folder, 'derived-review.json'), review);

// The read-only review is complete. Create separate lossless archives without
// deleting, overwriting, normalizing or otherwise changing any original JSON.
const archives = [];
for (const row of rawHashes) {
  const rawPath = resolve(root, row.rawPath), gzipPath = rawPath + '.gz', raw = await readFile(rawPath);
  const compressed = gzipSync(raw, { level: 9 }), expanded = gunzipSync(compressed);
  const pass = raw.equals(expanded) && sha(raw) === row.rawSha256 && sha(expanded) === row.rawSha256;
  if (!pass) throw Error(`Lossless archive verification failed: ${row.rawPath}`);
  await writeNew(gzipPath, compressed);
  const saved = await readFile(gzipPath), savedExpanded = gunzipSync(saved);
  if (!saved.equals(compressed) || !savedExpanded.equals(raw)) throw Error(`Saved archive verification failed: ${row.rawPath}`);
  archives.push({ rawPath: row.rawPath, gzipPath: rel(gzipPath), rawBytes: raw.length, gzipBytes: saved.length, rawSha256: sha(raw), gzipSha256: sha(saved),
    decompressedBytes: savedExpanded.length, decompressedSha256: sha(savedExpanded), decompressedBytesEqualRaw: savedExpanded.equals(raw), pass });
}
await writeJson(resolve(folder, 'raw-evidence-archives.json'), { pass: archives.every(row => row.pass), files: archives,
  originalsPreserved: true, compression: 'gzip level9; each saved gzip gunzipped and compared byte-for-byte and bySHA256 against its untouched original JSON.',
  derivedReviewSha256: sha(await readFile(resolve(folder, 'derived-review.json'))) });
console.log(JSON.stringify({ review: rel(resolve(folder, 'derived-review.json')), reviewSha256: sha(await readFile(resolve(folder, 'derived-review.json'))),
  aggregates: review.aggregates, failedDerivedChecks: summaries.reduce((sum, row) => sum + row.validation.failedChecks.length, 0),
  parsedSourceDifferences: review.runtimeFinalV2.parsedMainOrFrozenDifferences.length, nonUiRuntimeDifferences: review.runtimeFinalV2.nonUiDirectoryDifferences.length,
  finalV2RuntimeDifferences: review.runtimeFinalV2.finalV2RuntimeDifferences.length, uiDifferences: review.runtimeFinalV2.uiDifferencesExcludedFromMeasuredRuntime.map(row => row.path),
  archiveManifest: rel(resolve(folder, 'raw-evidence-archives.json')), rawBytes: archives.reduce((sum, row) => sum + row.rawBytes, 0),
  gzipBytes: archives.reduce((sum, row) => sum + row.gzipBytes, 0), archivesVerified: archives.every(row => row.pass) }));
