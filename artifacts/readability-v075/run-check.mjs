import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

// A bounded qualification host. Child browser tests use public input only.
const root = resolve(import.meta.dirname, '../..');
const mode = process.argv[2], attempt = process.argv[3] ?? 'attempt-1';
if (!['unit', 'build', 'browser', 'perf'].includes(mode) || !/^[a-z0-9-]+$/.test(attempt)) throw Error('Use unit|build|browser|perf and a fresh attempt name.');
const folder = resolve(import.meta.dirname, mode, attempt);
await mkdir(dirname(folder), { recursive: true });
await mkdir(folder); // Existing attempts are immutable; choose a fresh name.
const env = { ...process.env };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
const npmShim = resolve(root, '.tools/v075-npm-bin');
await mkdir(npmShim, { recursive: true });
await writeFile(resolve(npmShim, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${resolve(root, '.tools/node_modules/npm/bin/npm-cli.js')}" %*\r\n`, 'ascii');
env[pathKey] = `${dirname(process.execPath)};${npmShim};${env[pathKey] ?? ''}`;
const label = path => relative(root, path).replaceAll('\\', '/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function manifest() {
  const paths = [];
  async function scan(directory) {
    for (const item of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await scan(path); else paths.push(path);
    }
  }
  await scan('src'); await scan('tests'); await scan('scripts');
  paths.push('package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'playwright.config.ts', 'vitest.config.ts');
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path.replaceAll('\\', '/'), hash(await readFile(resolve(root, path)))])));
}
const report = { mode, attempt, startedAt: new Date().toISOString(), sourceBefore: await manifest(), pass: false };
let args;
if (mode === 'unit') {
  env.VI_G2_REPORT = label(resolve(folder, 'g2-noncounter-routes.json'));
  env.VI_PRIORITY_PRODUCERS_REPORT = label(resolve(folder, 'priority-producer-coverage.json'));
  args = ['node_modules/vitest/vitest.mjs', 'run', '--exclude=tests/unit/full-system-seeds.test.ts', `--outputFile=${label(resolve(folder, 'results.json'))}`];
}
if (mode === 'build') args = ['.tools/node_modules/npm/bin/npm-cli.js', 'run', 'build'];
if (mode === 'browser') {
  env.VI_E2E_LEAN = '1'; env.VI_E2E_OUTPUT = label(resolve(folder, 'output')); env.VI_E2E_REPORT = label(resolve(folder, 'report.json')); env.VI_E2E_HTML = label(resolve(folder, 'report-html'));
  args = ['node_modules/@playwright/test/cli.js', 'test', 'readability-v075.spec.ts', 'feedback-growth-hud-stability.spec.ts', 'feedback-v062-immune-readability.spec.ts', 'g0.spec.ts'];
}
if (mode === 'perf') {
  env.VI_PERF_OUTPUT = label(folder); env.VI_PERF_ACTIVE_SECONDS = process.env.VI_PERF_ACTIVE_SECONDS ?? '120';
  args = ['artifacts/readability-v075/measure-pressure.mjs'];
}
report.command = { executable: process.execPath, args, activeTargetSeconds: env.VI_PERF_ACTIVE_SECONDS ?? null };
const log = [];
try {
  report.exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log.push(bytes); process.stdout.write(bytes); });
    child.on('error', reject); child.on('exit', resolveExit);
  });
  report.sourceAfter = await manifest();
  report.sourceUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.pass = report.exitCode === 0 && report.sourceUnchanged;
} catch (error) { report.error = error.stack ?? String(error); }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(folder, 'raw-output.txt'), Buffer.concat(log));
  await writeFile(resolve(folder, 'qualification.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ mode, attempt, pass: report.pass, sourceUnchanged: report.sourceUnchanged, folder: label(folder) }));
if (!report.pass) process.exitCode = 1;
