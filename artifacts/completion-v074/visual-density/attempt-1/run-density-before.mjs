import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { args, freeze, unchanged, hash, json } from './guards.mjs';
const options = args(), frozen = freeze(options), output = options.output;
const script = 'scripts/capture-g4-density-protocols.mjs';
const command = [script, '--seed', '1', '--channel', 'chrome', '--timeout-seconds', '300', '--output', output + '/capture', '--capture-effects'];
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, command, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
writeFileSync(output + '/command.log', (result.stdout ?? '') + (result.stderr ?? ''));
let capture; try { capture = json(output + '/capture/density-evidence.json'); } catch {}
const final = { frozen, startedAt, finishedAt: new Date().toISOString(), command: [process.execPath, ...command],
  scriptSha256: hash(script), exitCode: result.status, error: result.error?.message, signal: result.signal,
  scope: 'Real input retained-source density capture only; not a new600-second FPS qualification. Normal/low are sequential actual ticks, not exact same-state A/B. Existing script limitations and failed attempts preserved.',
  raw: output + '/capture/density-evidence.json', captureStatus: capture?.status, ...unchanged(frozen) };
final.pass = result.status === 0 && capture?.status === 'passed' && final.sourceUnchanged && final.buildUnchanged;
writeFileSync(output + '/report.json', JSON.stringify(final, null, 2));
console.log(JSON.stringify({ pass: final.pass, output, status: capture?.status }));
process.exitCode = final.pass ? 0 : 1;
