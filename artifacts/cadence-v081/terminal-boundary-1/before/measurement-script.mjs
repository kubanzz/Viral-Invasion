import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, transform } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, '.tools/cadence-v081-source');
const output = resolve(root, 'artifacts/cadence-v081/terminal-boundary-1');
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw new Error('Expected before or after');
if (stage === 'before') await mkdir(output); // Exclusive evidence root; never overwrite a prior run.
const stageDir = resolve(output, stage);
await mkdir(stageDir); // Each stage also refuses to overwrite.
const writeNew = async (path, value) => {
  const file = await open(path, 'wx');
  try { await file.writeFile(value); } finally { await file.close(); }
};
const write = (name, value) => writeNew(resolve(stageDir, name), value);
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const sha = value => createHash('sha256').update(value).digest('hex');
await write('measurement-script.mjs', await readFile(new URL(import.meta.url)));

const frozenPath = resolve(root, 'artifacts/support-mix-v080/measurement-1/simulation-bundle.mjs');
const frozen = await readFile(frozenPath);
const frozenReport = JSON.parse(await readFile(resolve(root, 'artifacts/support-mix-v080/measurement-1/report.json'), 'utf8'));
if (sha(frozen) !== '01535cca51f3c0752bc883d6d08c58dcb91057e015964cdbeead4459564ecef9'
  || sha(frozen) !== frozenReport.bundle.sha256) throw new Error('Frozen v080 bundle hash differs');
await write('v080-frozen-bundle.mjs', frozen);
await json('v080-origin-report.json', frozenReport);

const testPath = 'tests/unit/terminal-fission-boundary.test.ts';
const test = await readFile(resolve(source, testPath), 'utf8');
await write('terminal-fission-boundary.test.ts', test);
const beginMarker = '// BEGIN SHARED TERMINAL FIXTURE', endMarker = '// END SHARED TERMINAL FIXTURE';
const begin = test.indexOf(beginMarker), end = test.indexOf(endMarker);
if (begin < 0 || end <= begin) throw new Error('Shared fixture markers missing');
const fixtureSource = test.slice(begin + beginMarker.length, end);
const fixtureJs = await transform(fixtureSource, { loader: 'ts', format: 'esm', target: 'es2022' });
await write('shared-fixture.ts', fixtureSource);
await write('shared-fixture.mjs', fixtureJs.code);
const { terminalFissionBoundary } = await import(`data:text/javascript;base64,${Buffer.from(fixtureJs.code).toString('base64')}`);
const compiled = await build({ stdin: { contents: "export { GameSession } from './src/game/session';", resolveDir: source, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'silent' });
const candidate = compiled.outputFiles[0].contents;
await write('candidate-bundle.mjs', candidate);

const fingerprints = [];
for (const path of ['src/game/battle.ts', 'src/game/endless.ts', testPath]) {
  const bytes = await readFile(resolve(source, path));
  fingerprints.push({ path, sha256: sha(bytes) });
  if (path.endsWith('battle.ts') || path.endsWith('endless.ts')) await write(path.split('/').at(-1), bytes);
}
const modules = {
  v080: await import(`data:text/javascript;base64,${frozen.toString('base64')}`),
  candidate: await import(`data:text/javascript;base64,${Buffer.from(candidate).toString('base64')}`),
};
const results = [];
for (const [version, module] of Object.entries(modules)) {
  for (const terminal of ['player', 'tissue']) {
    for (const scenario of [
      { name: 'lethal-killer-first', lethal: true, fissionFirst: false },
      { name: 'survivable-killer-first', lethal: false, fissionFirst: false },
      { name: 'lethal-fission-first', lethal: true, fissionFirst: true },
    ]) {
      const f = terminalFissionBoundary(module.GameSession, terminal, scenario.lethal, scenario.fissionFirst);
      const raw = { version, terminal, ...scenario, before: f.before, after: f.session.snapshot(), events: f.events };
      await json(`${version}-${terminal}-${scenario.name}.json`, raw);
      results.push({ version, terminal, scenario: scenario.name, phase: f.s.phase, playerHp: f.s.player.hp, tissueHp: f.s.tissue.hp,
        livingChildren: f.s.targets.filter(target => target.hp > 0 && target.generation === 1).length,
        birthsAfterTerminal: f.events.filter(event => event.type === 'ACTOR_SPAWNED' && (event.observedPlayerHp <= 0 || event.observedTissueHp <= 0)).length,
        laterWarnings: f.events.filter(event => event.type === 'ATTACK_TELEGRAPHED' && event.data.actorId === 'later-threat').length,
        waveClears: f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED').length,
        runEnds: f.events.filter(event => event.type === 'RUN_ENDED').length });
    }
  }
}
const testArgs = [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', testPath];
if (stage === 'after') testArgs.push('tests/unit/fission-pursuit-overlap.test.ts');
testArgs.push('--reporter=json', `--outputFile=${resolve(stageDir, 'vitest.json')}`);
const tests = spawnSync(process.execPath, testArgs, { cwd: source, encoding: 'utf8', timeout: 60000 });
await write('vitest.stdout.txt', tests.stdout ?? ''); await write('vitest.stderr.txt', tests.stderr ?? '');
let typecheck;
if (stage === 'after') {
  const check = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM,DOM.Iterable', '--types', 'node,vite/client',
    'src/game/battle.ts', testPath, 'tests/unit/fission-pursuit-overlap.test.ts'], { cwd: source, encoding: 'utf8', timeout: 60000 });
  await write('tsc.stdout.txt', check.stdout ?? ''); await write('tsc.stderr.txt', check.stderr ?? '');
  typecheck = { exitCode: check.status, error: check.error?.message ?? null };
}
const report = { stage, fixtureDescription: 'Explicit terminal ordering fixture; no natural-run difficulty or browser claim.',
  fixtureSha256: sha(fixtureSource), frozenBundleSha256: sha(frozen), candidateBundleSha256: sha(candidate), fingerprints, results,
  tests: { exitCode: tests.status, error: tests.error?.message ?? null }, typecheck };
await json('report.json', report);
console.log(JSON.stringify(report, null, 2));
if (stage === 'after' && (tests.status !== 0 || typecheck?.exitCode !== 0)) process.exitCode = 1;
