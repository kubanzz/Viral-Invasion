import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Presentation fixture replay only. The called existing renderProbe imports the
// actual Renderer, never main.ts or GameSession, and never steps the simulation.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'artifacts/duet-v087/render-label-v3';
const out = resolve(root, base, 'replay-attempt-1');
const read = path => readFileSync(resolve(root, path));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const label = path => relative(root, path).replaceAll('\\', '/');
const lineage = json(`${base}/source-lineage.json`);
const browser = json('artifacts/duet-v087/browser-attempt-2/summary.json');
if (!lineage.pass || sha(read('dist/game.js')) !== lineage.v3GameSha256
  || browser.checks.length !== 2
  || browser.checks.find(check => check.project === 'chrome')?.exitCode !== 0
  || browser.checks.find(check => check.project === 'edge')?.exitCode !== 1
  || !browser.checks.find(check => check.project === 'edge')?.finishedAt) {
  throw Error('Requires final V3 lineage, complete Chrome run and preserved terminal Edge failure');
}
if (existsSync(out)) throw Error('Preserve existing presentation replay');
function sourceFile(project) {
  const files = [];
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.name === 'natural-duet.json') files.push(path);
    }
  }
  walk(resolve(root, 'artifacts/duet-v087/browser-attempt-2', project, 'output'));
  if (files.length !== 1) throw Error(`Ambiguous browser2 snapshot source: ${project}`);
  return files[0];
}
const chromeSource = sourceFile('chrome'), edgeSource = sourceFile('edge');
const sourceBytes = readFileSync(chromeSource), raw = JSON.parse(sourceBytes);
const edgeRawBytes = readFileSync(edgeSource), edgeRaw = JSON.parse(edgeRawBytes);
if (!raw.complete || raw.errors.length || raw.remote.length || raw.gaps.length) throw Error('Incomplete natural Chrome source');
if (edgeRaw.complete !== false) throw Error('Expected preserved failed Edge natural observation');
const jobs = [];
for (const [project, width, height, channel] of [['chrome', 1366, 768, 'chrome'], ['edge', 1100, 560, 'msedge']]) {
  const windup = raw.observations.find(o => o.actualWindup && o.tactic === 'mimic-corrosion')
    ?? raw.observations.find(o => o.actualWindup);
  const recovery = raw.observations.find(o => o.twoCompletedActions);
  if (!windup || !recovery) throw Error(`Missing actual windup/recovery observations: ${project}`);
  for (const [phase, observation, key] of [['windup', windup, 'actualWindup'], ['recovery', recovery, 'twoCompletedActions']]) {
    const snapshot = observation[key], elite = snapshot.targets.find(t => t.id === raw.eliteId);
    if (!elite?.eliteCycle || (phase === 'windup' ? !elite.attackPlan : !(elite.recoverUntil > snapshot.elapsed))) {
      throw Error(`Natural ${project} ${phase} source lacks the required real elite phase`);
    }
    jobs.push({ project, width, height, channel, phase, eliteId: raw.eliteId, snapshot,
      source: label(chromeSource), sourceBytesSha256: sha(sourceBytes), observationIndex: raw.observations.indexOf(observation), key });
  }
}
mkdirSync(out);
const results = [];
for (const job of jobs) {
  const stem = `${job.project}-${job.phase}`, input = resolve(out, `${stem}.snapshot.json`), output = resolve(out, stem);
  const snapshotJson = JSON.stringify(job.snapshot);
  writeFileSync(input, snapshotJson, { flag: 'wx' });
  const args = ['scripts/check-render-invariance.mjs', '--input', label(input), '--output', label(output),
    '--frames', '2', '--width', String(job.width), '--height', String(job.height), '--dpr', '1', '--channel', job.channel];
  const command = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8' });
  writeFileSync(resolve(out, `${stem}.log`), (command.stdout ?? '') + (command.stderr ?? '')
    + (command.error ? String(command.error) : ''), { flag: 'wx' });
  if (command.status !== 0) throw Error(`Presentation probe failed: ${stem}; inspect its exclusive log`);
  const report = json(`${label(output)}/report.json`);
  const placementByMode = Object.fromEntries(['normal', 'low'].map(mode => [mode,
    report.checks?.rendererDiagnostics?.[mode]?.labels?.placements?.find(p => p.id === `elite-cycle:${job.eliteId}`)]));
  if (!report.pass || !Object.values(placementByMode).every(Boolean)
    || sha(read(job.source)) !== job.sourceBytesSha256 || readFileSync(input, 'utf8') !== snapshotJson
    || report.checks.baseline.fullJsonSha256 !== sha(Buffer.from(snapshotJson))) {
    throw Error(`Replay integrity or elite-label placement failed: ${stem}`);
  }
  results.push({ project: job.project, phase: job.phase, width: job.width, height: job.height, channel: job.channel,
    source: job.source, sourceBytesSha256: job.sourceBytesSha256, sourceUnchanged: true,
    observationIndex: job.observationIndex, observationKey: job.key, tick: job.snapshot.tick,
    snapshot: label(input), snapshotJsonSha256: sha(Buffer.from(snapshotJson)),
    sourceSnapshotJsonUnchanged: JSON.stringify(json(job.source).observations[job.observationIndex][job.key]) === snapshotJson,
    eliteId: job.eliteId, placementByMode, report: `${label(output)}/report.json`,
    images: report.images, renderStateUnchanged: report.checks.pass, pass: true });
}
if (results.some(row => !row.sourceSnapshotJsonUnchanged)) throw Error('Extracted source snapshot changed');
if (sha(readFileSync(edgeSource)) !== sha(edgeRawBytes)) throw Error('Preserved failed Edge raw changed');
const summary = { pass: true, completedAt: new Date().toISOString(), v3GameSha256: lineage.v3GameSha256,
  scope: 'Offline presentation fixture replay of the same two unmodified Chrome browser2 natural V2 snapshots in Chrome1366 and Edge1100. This is not an Edge natural two-tactic pass: the original Edge hold-fire run ended in tissue failure and remains preserved with complete=false. No new natural run, input replay, simulation step or gameplay-time advance. Actual final V3 Renderer; no production HUD DOM. Two phases, two browser viewports, normal/low effects. PNGs require separate human visual inspection.',
  failedEdgeNaturalEvidence: { path: label(edgeSource), sha256: sha(edgeRawBytes), complete: false, unchanged: true,
    exitCode: 1, scope: 'Preserved original failed natural observation; not used as presentation snapshot source.' },
  results };
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ pass: true, groups: results.length, screenshots: results.length * 2,
  summary: `${base}/replay-attempt-1/summary.json` }));
