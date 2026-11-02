import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readVerifiedMobileBuild } from '../../scripts/package-mobile.mjs';

const folder = 'artifacts/responsive-layout-20261102';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const [unit, browser, coarse, packaged, build] = await Promise.all([
  json(`${folder}/unit-report.json`), json(`${folder}/browser-report.json`),
  json(`${folder}/coarse-report.json`),
  json('artifacts/mobile-release/package-report.json'), readVerifiedMobileBuild(),
]);
const cases = new Map();
function collect(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) cases.set(`${test.projectName}:${spec.file}:${spec.title}`, test.results.at(-1)?.status);
    collect(suite.suites ?? []);
  }
}
collect(browser.suites); collect(coarse.suites);
const count = status => [...cases.values()].filter(value => value === status).length;
if (!unit.success || unit.numFailedTests || cases.size !== 48 || count('passed') !== 46 || count('skipped') !== 2 || coarse.stats.unexpected) throw new Error('Responsive checks are incomplete or failing.');
for (const [source, alias, expected] of [
  ['releases/Viral-Invasion-Mobile.html', 'releases/Viral-Invasion-Adaptive.html', packaged.htmlSha256],
  ['releases/Viral-Invasion-Mobile.zip', 'releases/Viral-Invasion-Adaptive.zip', packaged.zipSha256],
]) {
  if (sha256(await readFile(source)) !== expected || sha256(await readFile(alias)) !== expected) throw new Error(`Release identity mismatch: ${alias}`);
}
const pictures = `${folder}/browser/responsive-layout-dist-sam-1150c-ils-nodes-return-to-desktop-responsive-chrome`;
for (const name of ['desktop-playing', 'compact-playing', 'desktop-restored-playing']) await copyFile(`${pictures}/dist-${name}.png`, `${folder}/${name}.png`);
const report = {
  feature: 'responsive-desktop-mobile-layout', verifiedAt: new Date().toISOString(),
  rule: { maxWidth: 1024, maxHeight: 600, coarseTouchKeepsMobile: true, forceTouchQuery: 'mobile=1', distributionMarkerForcesLayout: false },
  transition: 'Pause combat and clear all input; keep the same run; restore actual HUD/map nodes and desktop controls/text; require an explicit resume.',
  typecheck: 'passed', unit: { passed: unit.numPassedTests, failed: unit.numFailedTests, report: `${folder}/unit-report.json` },
  browser: { passed: count('passed'), failed: 0, skipped: count('skipped'), uniqueCases: cases.size,
    originalMatrix: { report: `${folder}/browser-report.json`, stats: browser.stats },
    affectedEnvironmentCases: { report: `${folder}/coarse-report.json`, stats: coarse.stats },
    explanation: 'Windows desktop WebKit does not expose a coarse touch device with positive navigator.maxTouchPoints under hasTouch emulation. The two unsupported environment cases are explicitly skipped; Chrome/Edge retain strict environment assertions. No production layout rules or hardware properties were overridden.',
    scope: 'Desktop bundle and single HTML, Chrome/Edge/WebKit; breakpoint boundaries, repeated resizing, same run/storage, real DOM-node restoration, held keyboard/mouse/skill reset, portrait pause, help wording, explicit override, and emulated coarse-touch context.' },
  release: { html: 'releases/Viral-Invasion-Adaptive.html', zip: 'releases/Viral-Invasion-Adaptive.zip', htmlSha256: packaged.htmlSha256, zipSha256: packaged.zipSha256, sourceCount: Object.keys(build.metadata.sourceManifest).length, sourceAndOutputValidation: 'passed', zipDecodedByteValidation: 'passed' },
  limits: 'Browser regression and coarse-touch emulation do not replace a physical iPhone/Sitecase check.',
};
await writeFile(`${folder}/verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ unit: report.unit, browser: report.browser, release: report.release }));
