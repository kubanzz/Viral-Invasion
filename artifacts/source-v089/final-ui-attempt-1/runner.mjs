import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
const work = resolve('.tools/source-v089-release'), output = resolve('artifacts/source-v089/final-ui-attempt-1');
if (existsSync(output)) throw Error('Preserve prior final UI checks.');
mkdirSync(output, { recursive: true }); copyFileSync(new URL(import.meta.url), join(output, 'runner.mjs'));
const npm = resolve('.tools/node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, VI_ART_SOURCE: join(work, 'unavailable-upstream') };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = [resolve('.tools/v075-npm-bin'), dirname(process.execPath), env[pathKey]].join(';');
const result = { scope: 'Final static source scoring-copy change; simulation and the first947+source rules remain frozen. Rebuild and targeted UI check only.', commands: [] };
async function run(label, executableArgs) {
  const command = { label, args: executableArgs, cwd: work, startedAt: new Date().toISOString() };
  result.commands.push(command);
  let log = ''; const child = spawn(process.execPath, executableArgs, { cwd: work, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => log += value.toString());
  command.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  command.finishedAt = new Date().toISOString(); command.log = `${label}.log`;
  writeFileSync(join(output, command.log), log);
  if (command.exitCode !== 0) throw Error(`${label}\n${log.slice(-2000)}`);
}
try {
  await run('01-build', [npm, 'run', 'build']);
  await run('02-ui-rules', [join(work, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/unit/endless-hud.test.ts', '--maxWorkers=2', '--reporter=default', '--reporter=json', `--outputFile=${join(output, 'unit.json')}`]);
  const unit = JSON.parse(readFileSync(join(output, 'unit.json'), 'utf8'));
  result.tests = { files: unit.testResults.length, passed: unit.numPassedTests, failed: unit.numFailedTests, success: unit.success };
  result.gameSha256 = createHash('sha256').update(readFileSync(join(work, 'dist/game.js'))).digest('hex');
  copyFileSync(join(work, 'dist/build-meta.json'), join(output, 'tested-build-meta.json'));
  result.pass = unit.success;
} catch (error) { result.pass = false; result.error = String(error.stack ?? error); process.exitCode = 1; }
finally { writeFileSync(join(output, 'summary.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
