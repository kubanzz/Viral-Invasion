import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'artifacts/host-events-fixes-20261031';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [meta, unit, system, browser, offline, teardown] = await Promise.all([
  readJson('dist/build-meta.json'), readJson(`${directory}/unit-final.json`), readJson(`${directory}/system-12.json`),
  readJson(`${directory}/browser-final-report.json`), readJson(`${directory}/g0-offline-report.json`), readJson(`${directory}/server-teardown.json`),
]);
const mismatches = [];
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  if (hash(await readFile(path)) !== expected) mismatches.push(path);
}
const summary = {
  checkedAt: new Date().toISOString(), game: meta.game, version: meta.version,
  sourceCount: Object.keys(meta.sourceManifest).length, mismatches,
  bundleSha256: hash(await readFile('dist/game.js')),
  results: {
    unit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests },
    system: { seeds: system.completedSeeds, outcomes: system.outcomes, sourceUnchanged: system.simulationSourceUnchanged,
      replayEqual: system.replay.equal, preparedReplayEqual: system.preparedReplay.equal },
    browser: browser.stats, offlineSmoke: offline.stats, teardown,
  },
  fixes: ['Per-round medication anchor validation with permanent skip, no relocation or replacement.',
    'Event targets excluded from diagnosis counts and actual-context reward evidence.',
    'Worker-scoped loopback HTTP fixture with OS-assigned ports and automatic connection teardown.'],
  scope: 'All unit suites with the supported 12-seed formal-session smoke setting (not the default 1000-seed specialization); Chrome/Edge real-input host-event tests and minimum offline training smoke; no new human blind playtest or performance claim.',
  reports: { unit: `${directory}/unit-final.json`, system: `${directory}/system-12.json`,
    browser: `${directory}/browser-final-report.json`, offline: `${directory}/g0-offline-report.json`, teardown: `${directory}/server-teardown.json` },
  disabled: { ALCOHOL: 'Only one real repairable Tissue exists per current organ; existing dependency restriction is retained.' },
};
await writeFile(`${directory}/verification-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ sourceCount: summary.sourceCount, mismatches, results: summary.results.unit, bundleSha256: summary.bundleSha256 }));
if (mismatches.length || unit.numFailedTests || browser.stats.unexpected || offline.stats.unexpected
  || teardown.results.some(item => !item.closed)) process.exitCode = 1;
