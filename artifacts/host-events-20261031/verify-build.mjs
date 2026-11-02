import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash = data => createHash('sha256').update(data).digest('hex');
const meta = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const unit = JSON.parse(await readFile('artifacts/host-events-20261031/unit-verified.json', 'utf8'));
const browser = JSON.parse(await readFile('artifacts/host-events-20261031/browser-verified-report.json', 'utf8'));
const system = JSON.parse(await readFile('artifacts/host-events-20261031/system-12-verified.json', 'utf8'));
const mismatches = [];
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  if (hash(await readFile(path)) !== expected) mismatches.push(path);
}
const output = {
  checkedAt: new Date().toISOString(), game: meta.game, version: meta.version,
  sourceCount: Object.keys(meta.sourceManifest).length, mismatches,
  bundleSha256: hash(await readFile('dist/game.js')),
  results: {
    unit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests },
    browser: browser.stats,
    system: { complete: system.complete, seeds: system.completedSeeds, outcomes: system.outcomes,
      replayEqual: system.replay.equal, preparedReplayEqual: system.preparedReplay.equal },
  },
  reports: {
    unit: 'artifacts/host-events-20261031/unit-verified.json',
    system: 'artifacts/host-events-20261031/system-12-verified.json',
    browser: 'artifacts/host-events-20261031/browser-verified-report.json',
    layout: 'artifacts/host-events-20261031/presentation-final/results.json',
  },
  disabledCard: { id: 'ALCOHOL', reason: 'Only one real repairable Tissue exists in each current organ.' },
  scope: 'Seeded rules and session integration; Chrome/Edge local HTTP real keyboard/mouse with read-only diagnostics; three viewport layout checks. Agent playtest, not human blind study or long-term performance measurement.',
};
await writeFile('artifacts/host-events-20261031/verification-summary.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify({ sourceCount: output.sourceCount, mismatches, bundleSha256: output.bundleSha256 }));
if (mismatches.length) process.exitCode = 1;
