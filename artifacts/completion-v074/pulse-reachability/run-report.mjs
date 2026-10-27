import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = process.cwd();
const folder = 'artifacts/completion-v074/pulse-reachability';
const attempt = process.argv[2] ?? 'attempt-1';
if (!/^[a-zA-Z0-9_-]+$/.test(attempt)) throw new Error('Use a simple isolated attempt name.');
const output = join(folder, attempt);
await mkdir(output); // Refuse to replace a previous execution.
const sha = raw => createHash('sha256').update(raw).digest('hex');
const save = (name, value) => writeFile(join(output, name), typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx' });
const canonical = path => relative(workspace, path).replaceAll('\\', '/');
const captured = new Map();
const entry = `${folder}/sweep.ts`;
const testPath = 'tests/unit/pulse-world-reachability.test.ts';
const requirementPath = 'DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md';
const startedAt = new Date().toISOString();
try {
const result = await build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false, metafile: true,
  plugins: [{ name: 'capture-exact-consumed-source', setup(builder) {
    builder.onLoad({ filter: /\.(?:ts|tsx|js|mjs|json)$/ }, async args => {
      const raw = await readFile(args.path); captured.set(canonical(args.path), raw);
      const extension = args.path.split('.').at(-1);
      return { contents: raw.toString('utf8'), loader: extension === 'mjs' ? 'js' : extension, resolveDir: resolve(args.path, '..') };
    });
  } }],
});
const bundle = result.outputFiles[0].contents;
await save('sweep.bundle.mjs', bundle);
await save('esbuild-meta.json', result.metafile);
const sourceManifest = Object.fromEntries([...captured].sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => [path, { sha256: sha(raw), bytes: raw.length }]));
const testRaw = await readFile(testPath), requirementRaw = await readFile(requirementPath);
const requirement = requirementRaw.toString('utf8').split(/\r?\n/).map((text, index) => ({ line: index + 1, text })).find(item => item.text.includes('`AC-M10-02`'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pre = { schemaVersion: 1, startedAt, head,
  mode: 'Mechanism-only formal heart geometry proof obligations, finite sweeps and isolated production pulse integration. No browser, live-game state, full-game batch, build, or source mutation.',
  requirement: { path: requirementPath, sha256: sha(requirementRaw), ...requirement },
  helper: { path: entry, sha256: sourceManifest[entry].sha256 },
  test: { path: testPath, sha256: sha(testRaw) },
  runner: { path: `${folder}/run-report.mjs`, sha256: sha(await readFile(`${folder}/run-report.mjs`)) },
  executedBundle: { path: `${output}/sweep.bundle.mjs`, sha256: sha(bundle), bytes: bundle.length }, sourceManifest,
  sourceManifestSha256: sha(JSON.stringify(sourceManifest)),
};
await save('pre-run.json', pre);
const unitArgs = ['node_modules/vitest/vitest.mjs', 'run', testPath, '--reporter=default', '--reporter=json', `--outputFile.json=${output}/unit.json`];
const unitRun = spawnSync(process.execPath, unitArgs, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
await save('unit-stdout.txt', unitRun.stdout ?? '');
await save('unit-stderr.txt', unitRun.stderr ?? '');
if (unitRun.error) throw unitRun.error;
if (unitRun.status !== 0) throw new Error(`Isolated unit suite failed with exit ${unitRun.status}. See ${output}.`);
const unitRaw = await readFile(join(output, 'unit.json')), unit = JSON.parse(unitRaw.toString('utf8'));
const module = await import(pathToFileURL(resolve(output, 'sweep.bundle.mjs')).href);
const structure = module.structuralCertificate();
const sweep = module.wholeWorldCollisionSweep();
const connectivity = [...module.GEOMETRY_RADII, 19].map(radius => module.connectivityWitness(radius));
const formalDevice = module.formalDevicePulseSweep();
const exceptions = module.sourceAndCoreExceptions();
const currentInputs = await Promise.all(Object.entries(sourceManifest).map(async ([path, info]) => ({ path, expectedSha256: info.sha256, currentSha256: sha(await readFile(path)) })));
const inputsUnchanged = currentInputs.every(item => item.expectedSha256 === item.currentSha256)
  && sha(await readFile(testPath)) === pre.test.sha256 && sha(await readFile(requirementPath)) === pre.requirement.sha256;
const checks = {
  unit11Pass: unit.success === true && unit.numTotalTests === 11 && unit.numPassedTests === 11 && unit.numFailedTests === 0,
  exactConsumedInputsUnchanged: inputsUnchanged,
  expandedDisksDisjointAndStrictlyInterior: structure.valid,
  formalWholeWorld: sweep.worldSize[0] === 2400 && sweep.worldSize[1] === 1500 && structure.obstacles.length === 5,
  finiteSweepOverHalfMillion: sweep.cases > 500000,
  finiteSweepNoIllegalEndpoints: sweep.failures.length === 0 && sweep.minimumObstacleClearance >= -1e-7 && sweep.minimumBoundaryClearance >= -1e-7,
  finiteConstructiveGraphWitnesses: connectivity.every(row => row.allNodesLegal && row.allReachable),
  realPulseIntegration: formalDevice.failures.length === 0 && formalDevice.affected > 0 && formalDevice.moved > 0 && formalDevice.occluded > 0 && formalDevice.boundaryLandings > 0,
  excludedSourceAndUnmovedCore: exceptions.every(row => row.valid),
};
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), ...pre,
  checks, allChecksPassed: Object.values(checks).every(Boolean),
  unit: { path: `${output}/unit.json`, sha256: sha(unitRaw), files: unit.testResults.length, tests: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests },
  structuralCertificate: structure, finiteWholeWorldCollisionSweep: sweep,
  finiteConnectivityWitnesses: connectivity, isolatedFormalDevicePulseIntegration: formalDevice, sourceAndCoreExceptions: exceptions,
  conclusions: [
    'For the exact recorded HEART_WORLD geometry and nonnegative body radii up to 52, disjoint strictly interior expanded circular obstacles leave one path-connected legal-center component. The five holes do not make a separate permanently unreachable component.',
    'Under those geometric inequalities the current ordered projection and final rectangular clamp end each substep in legal center space. This is an implementation argument with numerical obligations checked here, not a machine-checked proof.',
    'Finite stress cases independently exercise the real movement implementation throughout the full formal chamber. Device integration uses the real production pulse function and formal geometry with intentionally arranged target positions.',
  ],
  limitations: [
    'The finite sweep is not an enumeration of infinitely many positions or directions. The continuous-space conclusion depends on the stated geometric assumptions and implementation review.',
    'This certificate is specific to the recorded formal heart layout; changing obstacle type, radius, order, geometry or collision algorithm requires revalidation. It makes no blanket claim about arbitrary or future maps.',
    'Radius 52 is a conservative geometric check for the fixed core, not evidence that the core is displaced. Source radius 34 is excluded by production pulse rules; movable target radii are 14, 18, 22 and 30.',
    'Most whole-world stress positions lie outside the real valve range. The separate device integration places targets directly as unit fixtures; it does not show natural encounter spawn attainability or actual browser E input.',
    'No browser, renderer, ordinary full-game batch, FPS, native input, new-player readability, fun, retention or five-person blind-test conclusion follows from this report.',
    'Legal endpoints and one shared path component prevent permanent geometric isolation; they do not certify line-of-sight from a single player position, target selection behavior, AI pathfinding quality, or a collision-free visual interpolation between sampled states.',
  ],
};
await save('report.json', report);
await save('execution.json', { startedAt, finishedAt: new Date().toISOString(), status: report.allChecksPassed ? 'passed' : 'failed', exitCode: report.allChecksPassed ? 0 : 1,
  unitCommand: [process.execPath, ...unitArgs], inputCount: currentInputs.length, inputsUnchanged, currentInputs });
console.log(JSON.stringify({ output, allChecksPassed: report.allChecksPassed, failedChecks: Object.entries(checks).filter(([, value]) => !value).map(([key]) => key),
  unit: report.unit, cases: sweep.cases, perRadius: sweep.perRadius, minimumBoundaryClearance: structure.minimumBoundaryClearance, minimumPairGap: structure.minimumPairGap,
  finiteSweepMinimumObstacleClearance: sweep.minimumObstacleClearance, formalDevice: { cases: formalDevice.cases, affected: formalDevice.affected, moved: formalDevice.moved,
    zeroDisplacement: formalDevice.zeroDisplacement, occluded: formalDevice.occluded, boundaryLandings: formalDevice.boundaryLandings } }));
if (!report.allChecksPassed) process.exitCode = 1;
} catch (error) {
  await save('execution-error.json', { startedAt, finishedAt: new Date().toISOString(), status: 'failed', error: String(error), stack: error?.stack });
  throw error;
}
