import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';

// Read-only evidence consumer. It never runs a browser/test/build or edits Docs.
// No row is promoted from a green test total or historical verdict alone.
const base = 'artifacts/completion-v074/visual-plan';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const requireTrue = (value, message) => { if (!value) throw Error(message); };
const documents = {
  development: 'DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md',
  visual: 'DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md',
};
const definitions = [];
for (const [key, path] of Object.entries(documents)) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let found;
    if (key === 'development') {
      found = lines[i].match(/^- `(AC-M\d{2}-\d{2})`：(.+)$/) ?? lines[i].match(/^\d+\. `(RUN-\d{2})` (.+)$/);
      if (found) definitions.push({ id: found[1], text: found[2], source: { path, line: i + 1, sha256: hash(path), exactLine: lines[i] } });
    } else {
      found = lines[i].match(/^\| `(VIS-\d{2})` \|[^|]+\|([^|]+)\|([^|]+)\|/);
      if (found) definitions.push({ id: found[1], text: found[2].trim(), expectedEvidence: found[3].trim(), source: { path, line: i + 1, sha256: hash(path), exactLine: lines[i] } });
    }
  }
}
const ids = definitions.map(row => row.id);
requireTrue(ids.length === 112 && new Set(ids).size === 112, 'Original112 unique requirement inventory changed.');
requireTrue(ids.filter(id => id.startsWith('AC-')).length === 88 && ids.filter(id => id.startsWith('VIS-')).length === 12 && ids.filter(id => id.startsWith('RUN-')).length === 12, 'Expected88 AC +12 VIS +12 RUN.');
const priorPath = 'artifacts/completion-v073/requirements-terminal-closure.json', prior = read(priorPath);
requireTrue(prior.items.length === 112 && prior.items.every(row => ids.includes(row.id)), 'Previous cutoff does not match original IDs.');
const priorMap = new Map(prior.items.map(row => [row.id, row]));
const humanOnly = { 'AC-M14-02': 1, 'AC-M16-05': 5, 'VIS-12': 5 };
const argv = process.argv.slice(2), flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
const outputPath = flag('--output') ?? base + (argv.includes('--consume') ? '/requirements-consumed.json' : '/requirements-review-plan.json');
const within = relative(resolve('artifacts/completion-v074'), resolve(outputPath));
requireTrue(within && !within.startsWith('..') && !/^[A-Za-z]:/.test(within), 'Write only a new074 artifact.');
requireTrue(!existsSync(outputPath), 'Preserve existing evidence review; choose a new output path.');
const rows = definitions.map(original => {
  const old = priorMap.get(original.id);
  return { id: original.id, original, previous: { verdict: old.terminal.verdict, scope: old.terminal.scope, remaining: old.terminal.remaining, cutoff: prior.evidenceCutoff },
    literalHumanGate: humanOnly[original.id] ? { category: 'actual-new-player-observation', minimumPeopleForThisLiteralRow: humanOnly[original.id],
      scope: original.id === 'AC-M14-02' ? 'The original row says new players/first3min. Global five-player requirement remains separately enforced by M16-05 and VIS12.' : 'Original row explicitly requires five new players.' } : null,
    evidence: [], review: { decision: null, reason: '', coverageComplete: false, closedSubclauses: [], remainingSubclauses: [...old.terminal.remaining], extraPriorGateCorrections: [] },
    currentVerdict: 'unreviewed', scope: 'Preparation only. Prior73 proven is retained as historical cutoff, not automatically promoted to a new build.' };
});
const findings = [
  { id: 'AC-M09-05', exactOriginal: definitions.find(row => row.id === 'AC-M09-05').text,
    finding: 'Original requires at least two meaningful event-driven growth choices in the first run; it does not specify first3min or five-player blind testing. Verify actual choices/effects and costs; retain player perception separately without inventing a literal3min gate.' },
  { id: 'AC-M13-01', exactOriginal: definitions.find(row => row.id === 'AC-M13-01').text,
    finding: 'Original requires legal goals and about10–15min victory, no countdown-only wait and no skipping organ protection. Fast scripted victories prove legality, not this pacing target; do not fabricate length by waiting.' },
  { id: 'RUN-12', exactOriginal: definitions.find(row => row.id === 'RUN-12').text,
    finding: 'Original permits automatic tests, actual browser scripts or humans if provenance is explicit. A technical visual path can close without five-player data; VIS12 remains independently open.' },
  { id: 'VIS-09', exactOriginal: definitions.find(row => row.id === 'VIS-09').text,
    finding: 'Distinct organ structure plus equal-scale actual images and interactions is technically reviewable. Do not equate agent image review with blinded new-player recognition.' },
];
let consumed = null;
const pointer = (value, path) => path === '' ? value : path.split('/').slice(1).reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], value);
if (argv.includes('--consume')) {
  const ledgerPath = flag('--ledger'), gameSha256 = flag('--expected-game'), version = flag('--version');
  requireTrue(ledgerPath && /^[a-f0-9]{64}$/.test(gameSha256 ?? '') && version === '0.7.4', 'Consume requires explicit ledger/final074 version/game SHA.');
  const build = read('dist/build-meta.json');
  requireTrue(build.version === version && hash('dist/game.js') === gameSha256, 'Current frozen build differs from requested final identity.');
  requireTrue(Object.entries(build.sourceManifest).every(([path, expected]) => hash(path) === expected), 'Current final source does not match build metadata.');
  const ledger = read(ledgerPath);
  requireTrue(ledger.version === version && ledger.gameSha256 === gameSha256 && ledger.items.length === 112, 'Ledger must enumerate112 rows for this exact build.');
  requireTrue(new Set(ledger.items.map(row => row.id)).size === 112 && ledger.items.every(row => ids.includes(row.id)), 'Invalid ledger IDs.');
  const ledgerMap = new Map(ledger.items.map(row => [row.id, row]));
  for (const row of rows) {
    const item = ledgerMap.get(row.id), review = item.review;
    requireTrue(item.original.source.sha256 === row.original.source.sha256 && item.original.text === row.original.text, 'Do not paraphrase/change original requirement: ' + row.id);
    row.evidence = (item.evidence ?? []).map(evidence => {
      requireTrue(evidence.path && /^[a-f0-9]{64}$/.test(evidence.sha256 ?? ''), 'Each evidence reference needs immutable path/SHA: ' + row.id);
      requireTrue(existsSync(evidence.path) && hash(evidence.path) === evidence.sha256, 'Changed/missing evidence: ' + evidence.path);
      requireTrue(['current-build', 'shared-unchanged-inputs', 'historical-reference'].includes(evidence.versionScope), 'Explicit evidence version scope required.');
      const result = { ...evidence, shaMatches: true, checks: [] };
      if (evidence.versionScope === 'current-build') requireTrue(evidence.gameSha256 === gameSha256, 'Do not relabel candidateA/073 as final074.');
      if (evidence.versionScope === 'shared-unchanged-inputs') {
        requireTrue(Array.isArray(evidence.dependencyManifest) && evidence.dependencyManifest.length > 0 && evidence.reuseScope, 'Reuse needs exact dependency manifest and limited claim.');
        result.dependencyChecks = evidence.dependencyManifest.map(({ path, sha256 }) => ({ path, sha256, matchesCurrent: hash(path) === sha256 }));
        requireTrue(result.dependencyChecks.every(check => check.matchesCurrent), 'A reused dependency changed: ' + row.id);
      }
      if (evidence.assertions?.length) {
        const value = read(evidence.path);
        result.checks = evidence.assertions.map(assertion => {
          const actual = pointer(value, assertion.pointer);
          const pass = assertion.op === 'gte' ? typeof actual === 'number' && actual >= assertion.expected : JSON.stringify(actual) === JSON.stringify(assertion.expected);
          requireTrue(pass, 'Failed evidence assertion ' + evidence.path + assertion.pointer);
          return { ...assertion, actual, pass };
        });
      }
      return result;
    });
    if (!review?.decision) continue;
    requireTrue(['proven', 'partial', 'missing', 'contradicted'].includes(review.decision), 'Unknown review verdict.');
    requireTrue(typeof review.reason === 'string' && review.reason.length >= 20, 'Explicit original-clause reasoning required: ' + row.id);
    if (review.decision === 'proven') {
      requireTrue(review.coverageComplete === true && review.closedSubclauses?.length > 0 && review.remainingSubclauses?.length === 0 && row.evidence.some(e => e.versionScope !== 'historical-reference'), 'A full closure needs current/shared evidence and complete clause coverage: ' + row.id);
      if (row.literalHumanGate) requireTrue(row.evidence.some(e => e.kind === 'firsthand-human-record' && e.genuineOriginalObservation === true && e.actualParticipants >= row.literalHumanGate.minimumPeopleForThisLiteralRow), 'Scripts/images cannot close literal new-player observation: ' + row.id);
      const previousNative = row.previous.remaining.some(text => /native|physical|真实OS|物理OS|真实Ctrl/i.test(text));
      if (previousNative) requireTrue(row.evidence.some(e => e.kind === 'actual-native-device' && e.synthetic !== true) || review.extraPriorGateCorrections?.some(c => c.exactOriginal === row.original.text && c.reason && c.notAnExplicitOriginalGate === true), 'Retain a native gap or explicitly correct an extra inferred gate from exact original text: ' + row.id);
      if (/^(VIS-|AC-M04-05|AC-M05-0[16]|AC-M10-05|AC-M11-05|RUN-12)/.test(row.id)) requireTrue(row.evidence.some(e => e.kind === 'agent-original-image-review' && e.actualImagesViewed?.length > 0), 'Visual closure requires actual image review, not counters alone: ' + row.id);
    }
    row.review = review; row.currentVerdict = review.decision; row.scope = review.scope ?? 'Explicit per-clause reviewed evidence scope; no automatic global product acceptance.';
  }
  const allVisual = rows.filter(row => row.id.startsWith('VIS-')).every(row => row.currentVerdict === 'proven');
  requireTrue(rows.find(row => row.id === 'AC-M16-07').currentVerdict !== 'proven' || allVisual, 'M16-07 cannot be globally proven before all VIS01–12 are complete.');
  consumed = { ledger: ledgerPath, sha256: hash(ledgerPath), version, gameSha256, buildMetaSha256: hash('dist/build-meta.json') };
}
const counts = values => Object.fromEntries(['proven','partial','missing','contradicted','unreviewed'].map(status => [status, values.filter(value => value === status).length]));
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: consumed ? 'explicit-reviewed-evidence-consumption' : 'original-requirement-review-preparation',
  method: 'Original112 rows extracted verbatim from source documents. Each new reviewed closure needs immutable evidence, exact version/reuse scope, explicit assertions and clause reasoning. No browser/test/build executed.',
  originalCount: 112, categoryCounts: { AC: 88, VIS: 12, RUN: 12 }, previous: { path: priorPath, sha256: hash(priorPath), counts: prior.counts.terminal, cutoff: prior.evidenceCutoff },
  consumed, currentCounts: counts(rows.map(row => row.currentVerdict)), literalScopeFindings: findings, items: rows,
  scope: consumed
    ? 'All112 original requirements received an explicit current per-clause review. Counts derive from these decisions, not historical totals. Current unit/simulation/browser, isolated fixtures, source-shared images, actual zoom/native and genuine human observations remain separate; open clauses are not waived. No all-plan/fun/commercial-value conclusion.'
    : 'Preparation has112 unreviewed current rows and does not undo historical73proven or create new passes. Human/native observations remain distinct; source-identical reuse requires explicit limited dependencies. No all-plan/fun/commercial-value conclusion.' };
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output: outputPath, mode: result.mode, originalCount: result.originalCount, currentCounts: result.currentCounts }));
