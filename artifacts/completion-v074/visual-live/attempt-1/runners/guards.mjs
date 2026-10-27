import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
export const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export const json = path => JSON.parse(readFileSync(path, 'utf8'));
const tree = directory => readdirSync(directory).sort().flatMap(name => { const path = directory + '/' + name; return statSync(path).isDirectory() ? tree(path) : [path]; });
export function args() {
  const argv = process.argv.slice(2), result = {};
  if (!argv.includes('--run')) throw Error('Prepared tool only. Browser execution requires explicit --run after the parent confirms the final 074 build.');
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--run') continue; if (!argv[i].startsWith('--') || !argv[i + 1]) throw Error('Invalid argument ' + argv[i]); result[argv[i].slice(2)] = argv[++i]; }
  if (!/^[a-f0-9]{64}$/.test(result['expected-game'] ?? '') || result.version !== '0.7.4') throw Error('Provide --version 0.7.4 and the parent-confirmed final --expected-game SHA256.');
  const output = resolve(result.output ?? '');
  const within = relative(resolve('artifacts/completion-v074'), output);
  if (!result.output || !within || within.startsWith('..') || /^[A-Za-z]:/.test(within)) throw Error('Output must be a new directory inside artifacts/completion-v074.');
  if (existsSync(output)) throw Error('Preserve prior output: refusing to overwrite ' + output);
  mkdirSync(output, { recursive: true });
  return { ...result, output };
}
export function freeze(options) {
  const build = json('dist/build-meta.json');
  if (build.version !== options.version || hash('dist/game.js') !== options['expected-game']) throw Error('The final version/bundle identity does not match explicit authorization.');
  const buildChecks = Object.entries(build.sourceManifest).map(([path, expected]) => ({ path, expected, actual: hash(path), matches: hash(path) === expected }));
  if (buildChecks.some(item => !item.matches)) throw Error('Current source differs from final build inputs.');
  const sourceManifest = Object.fromEntries([...tree('src'), ...tree('tests'), 'index.html', 'package.json', 'package-lock.json', 'scripts/build-offline.mjs'].map(path => [path, hash(path)]));
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), version: build.version, sourceManifest, buildChecks,
    buildFiles: Object.fromEntries(['dist/game.js', 'dist/index.html', 'dist/build-meta.json'].map(path => [path, hash(path)])) };
}
export function unchanged(before) {
  const pathsAfter = [...tree('src'), ...tree('tests'), 'index.html', 'package.json', 'package-lock.json', 'scripts/build-offline.mjs'];
  const sourceMismatches = [...new Set([...Object.keys(before.sourceManifest), ...pathsAfter])].filter(path => !existsSync(path) || before.sourceManifest[path] !== hash(path));
  const buildMismatches = Object.entries(before.buildFiles).filter(([path, expected]) => !existsSync(path) || hash(path) !== expected).map(([path]) => path);
  return { sourceMismatches, buildMismatches, sourceUnchanged: !sourceMismatches.length, buildUnchanged: !buildMismatches.length };
}
