import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const folder = 'artifacts/reproduction-v087';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const initial = read(`${folder}/attempt-1/summary.json`), continued = read(`${folder}/continuation-1/summary.json`);
const manifest = read(`${folder}/attempt-1/frozen-inputs.json`), archiveReview = read(`${folder}/independent-archive-review.json`);
const http = read(`${folder}/continuation-1/dev-http.json`), pty = read(`${folder}/continuation-1/dev-pty-receipts.json`), closed = read(`${folder}/continuation-1/dev-closed.json`);
const checks = {
  initialInstallPassed: initial.commands.find(command => command.label === '02-npm-ci')?.exitCode === 0,
  initialLauncherFailurePreserved: initial.status === 'failed' && initial.commands.find(command => command.label === '03-npm-build')?.exitCode === 1,
  sameSnapshotContinuation: continued.installBuildTestsPassed && continued.originalAttemptSha256 === hash(`${folder}/attempt-1/summary.json`),
  sourceFilesUnchanged: Object.entries(manifest).every(([path, entry]) => hash(path) === entry.sha256 && hash(join(continued.work, path)) === entry.sha256),
  buildByteIdentical: Object.entries(initial.expectedBuild).every(([path, expected]) => hash(`dist/${path}`) === expected && hash(join(continued.work, 'dist', path)) === expected),
  all142BuildInputsMatch: (() => { const meta = read('dist/build-meta.json'); return Object.keys(meta.sourceManifest).length === 142 && Object.entries(meta.sourceManifest).every(([path, expected]) => hash(path) === expected && hash(join(continued.work, path)) === expected); })(),
  archiveIndependentlyVerified: archiveReview.pass && hash(initial.archive) === initial.archiveSha256 && initial.archiveSha256 === archiveReview.archiveSha256After,
  allCurrentUnitFilesExecuted: continued.tests.success && continued.tests.failed === 0 && continued.tests.pending === 0 && continued.tests.files === readdirSync('tests/unit').filter(name => name.endsWith('.test.ts')).length,
  thousandSessionBatchCompleted: continued.sessions.complete && continued.sessions.completed === 1000 && continued.sessions.outcomes.invariantFailures === 0,
  devHttpPassed: http.httpStatus === 200 && http.sourceEntry && http.viteClient,
  devNormalExit: pty.input === 'q\r' && pty.stop.exit_code === 0,
  devPortClosed: closed.closed && closed.code === 'ECONNREFUSED',
  upstreamAbsent: continued.artSource.mode === 'local-snapshot' && !continued.artSource.upstreamExists,
};
const result = { schemaVersion: 1, version: '0.8.7', at: new Date().toISOString(), pass: Object.values(checks).every(Boolean), checks,
  method: 'Frozen complete worktree source ZIP, CRC and per-file verification, independent npm ci with empty dependencies/output/generated art, byte-identical build and full npm test, followed by actual PTY npm run dev, HTTP200 and normal q/Enter exit. An initial npm launcher environment failure is preserved and the same snapshot is continued with only an absolute CLI launcher.',
  sourceFiles: Object.keys(manifest).length, sourceArchive: initial.archive, sourceArchiveBytes: initial.archiveBytes, sourceArchiveSha256: initial.archiveSha256,
  node: initial.node, npm: initial.npm, buildInputCount: continued.buildInputs, tests: continued.tests, completeCampaignBatch: continued.sessions,
  gameSha256: hash('dist/game.js'), playableZip: resolve('releases/Viral-Invasion-G4-v0.8.7.zip'), playableZipSha256: hash('releases/Viral-Invasion-G4-v0.8.7.zip'),
  previousGoalTurn: 'no-progress', currentGoalTurn: 'progress', gameplayChanged: false, productGoalComplete: false, humanNewPlayers: { observed: 0, required: 5 },
  scope: 'Snapshot source reproducibility only. Does not establish pure Git HEAD reproducibility, unique additional gameplay seeds, new browser wins, native memory qualification, human comprehension, fun, replay intent or incubation value.',
  toolSessions: [{ sessionId: 79917, terminalExitCode: 1, scope: 'Initial archive/install then launcher failure' }, { sessionId: 7140, terminalExitCode: 0, scope: 'Continuation byte-identical build and full tests' }, { sessionId: 77529, terminalExitCode: 0, scope: 'PTY dev normal exit' }],
  evidence: Object.fromEntries(['attempt-1/summary.json', 'attempt-1/frozen-inputs.json', 'attempt-1/commands.json', 'continuation-1/summary.json', 'continuation-1/commands.json', 'continuation-1/unit.json', 'continuation-1/full-system-seeds.json', 'continuation-1/dev-http.json', 'continuation-1/dev-pty-receipts.json', 'continuation-1/dev-closed.json', 'independent-archive-review.json'].map(path => [path, hash(`${folder}/${path}`)])) };
if (result.playableZipSha256 !== '720d7947f8966b21fbca8adb2ef27f25714e324377fa5c7b484b962fc3a448f9') throw Error('Playable ZIP changed.');
writeFileSync(`${folder}/verification-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ pass: result.pass, checks, tests: result.tests, productGoalComplete: false }));
if (!result.pass) process.exitCode = 1;
