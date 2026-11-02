import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'artifacts/mobile-moba-20261101';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const [unit, full, precision, desktop, packaged] = await Promise.all([
  json(`${folder}/unit-report.json`), json(`${folder}/browser-report.json`),
  json(`${folder}/precision-report.json`), json(`${folder}/desktop-report.json`),
  json('artifacts/mobile-release/package-report.json'),
]);
const cases = new Map();
function collect(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const key = `${test.projectName}:${spec.file}:${spec.title}`;
      cases.set(key, { project: test.projectName, title: spec.title, status: test.results.at(-1)?.status });
    }
    collect(suite.suites ?? []);
  }
}
collect(full.suites); collect(precision.suites);
const latest = [...cases.values()], count = status => latest.filter(item => item.status === status).length;
if (latest.length !== 87 || count('passed') !== 85 || count('skipped') !== 2) throw new Error('Mobile results are incomplete or failing.');
if (!unit.success || unit.numFailedTests || precision.stats.expected !== 9 || precision.stats.unexpected || desktop.stats.expected !== 6 || desktop.stats.unexpected) throw new Error('A required verification did not pass.');
const html = 'releases/Viral-Invasion-Mobile-v3.html', zip = 'releases/Viral-Invasion-Mobile-v3.zip';
if (await hash(html) !== packaged.htmlSha256 || await hash(zip) !== packaged.zipSha256) throw new Error('Versioned aliases do not match the verified package.');
const report = {
  version: 'touch-moba-v3', verifiedAt: new Date().toISOString(), status: 'candidate_pending_physical_iphone_sitecase',
  package: { ...packaged, versionedHtml: html, versionedZip: zip, aliasesByteIdentical: true, buildMetaSha256: await hash('dist/build-meta.json') },
  typecheck: 'passed', unit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests, report: `${folder}/unit-report.json` },
  mobile: { uniqueCases: latest.length, passed: count('passed'), skipped: count('skipped'), failed: 0,
    fullMatrix: { report: `${folder}/browser-report.json`, stats: full.stats },
    affectedCasesRerun: { report: `${folder}/precision-report.json`, stats: precision.stats },
    explanation: 'The initial matrix had one WebKit test-driver coordinate quantization failure: fractional button center 704.8125,254.8125 plus 64px was dispatched at integer 768,254, producing exactly 522.134990687158 world units. The three range tests now drag to radius+2, within the same expanded wheel; the exact range assertions remain. All nine affected browser/skill pairs were rerun. Production package bytes did not change.',
    inputScope: 'Chromium CDP trusted multi-touch; desktop WebKit trusted mouse skill drags. Two WebKit multi-touch cases skipped; physical iPhone input is unverified.', latestCases: latest },
  desktop: { passed: desktop.stats.expected, failed: desktop.stats.unexpected, report: `${folder}/desktop-report.json` },
  screenshots: ['v3-preview-844x390.png', 'v3-preview-667x280.png', 'v3-preview-down-650.png'].map(name => `${folder}/${name}`),
  visualReview: 'Actual rendered hero, target, captions and HUD reviewed at normal and reduced heights, and upper/lower 650-unit previews.',
  limits: ['Physical iPhone/Sitecase WebGL, audio, touch feel, performance, background resume and persistent storage still require retesting.', 'Extreme aim framing beyond the arena background can expose a 30–58px dark margin; control/input checks still pass.', 'Nova III browser fixtures isolate the guide mechanism and do not prove natural progression or physical phone acceptance.'],
};
await writeFile(`${folder}/verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ html, zip, htmlSha256: packaged.htmlSha256, unitPassed: report.unit.passed, mobilePassed: report.mobile.passed, mobileSkipped: report.mobile.skipped, desktopPassed: report.desktop.passed }));
