import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { args, freeze, unchanged, hash, json } from './guards.mjs';
const options = args(), frozen = freeze(options), output = options.output;
const script = 'artifacts/completion-v074/visual-plan/density-driver.mjs';
const command = [script];
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, command, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, VI_PERF_OUTPUT: output + '/capture', VI_PERF_SEED: '13' } });
writeFileSync(output + '/command.log', (result.stdout ?? '') + (result.stderr ?? ''));
let capture; try { capture = json(output + '/capture/report.json'); } catch {}
const final = { frozen, startedAt, finishedAt: new Date().toISOString(), command: [process.execPath, ...command],
  scriptSha256: hash(script), exitCode: result.status, error: result.error?.message, signal: result.signal,
  setupOrigin: json('artifacts/completion-v074/visual-plan/density-driver-origin.json'),
  scope: 'Current actual formal source-clear/guardian/block retained-source setup from existing pressure driver, followed by density visual capture only. No FPS observer or natural/forced-GC probe. Normal/low are sequential actual ticks, not exact same-state A/B. The obsolete direct-research attempt remains preserved.',
  raw: output + '/capture/report.json', captureStatus: capture?.status, ...unchanged(frozen) };
final.pass = result.status === 0 && capture?.status === 'passed' && final.sourceUnchanged && final.buildUnchanged;
writeFileSync(output + '/report.json', JSON.stringify(final, null, 2));
console.log(JSON.stringify({ pass: final.pass, output, status: capture?.status }));
process.exitCode = final.pass ? 0 : 1;
