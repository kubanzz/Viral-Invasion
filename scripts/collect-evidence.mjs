import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const report = JSON.parse(await readFile('artifacts/e2e-report.json', 'utf8'));
const unit = JSON.parse(await readFile('artifacts/unit-results.json', 'utf8'));
const cases = [];
function visit(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const result = test.results.at(-1);
      const attachments = Object.fromEntries(result.attachments.filter(item => item.body && item.contentType === 'application/json').map(item => [item.name, JSON.parse(Buffer.from(item.body, 'base64').toString('utf8'))]));
      cases.push({ name: spec.title, browser: test.projectName, status: result.status, durationMs: result.duration, annotations: test.annotations, evidence: attachments });
    }
    visit(suite.suites);
  }
}
visit(report.suites);
await mkdir('artifacts/screenshots', { recursive: true });
const wanted = new Map([
  ['chrome-menu.png', 'menu.png'], ['chrome-training-overview.png', 'training.png'],
  ['chrome-training-success.png', 'success.png'], ['chrome-tissue-repaired.png', 'repair.png'],
  ['chrome-player-behind-terminal.png', 'depth-behind.png'], ['chrome-player-in-front-of-terminal.png', 'depth-front.png'],
  ['chrome-foreground-fades-and-player-remains-readable.png', 'foreground.png'],
  ['chrome-1920x1080-dpr2-pointer-hit.png', 'dpr2.png'], ['chrome-1100x700-dpr1.5-pointer-hit.png', 'dpr1.5.png'],
]);
for (const dir of await readdir('artifacts/e2e-results', { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of await readdir(join('artifacts/e2e-results', dir.name))) {
    if (wanted.has(file)) await copyFile(join('artifacts/e2e-results', dir.name, file), join('artifacts/screenshots', wanted.get(file)));
  }
  if (dir.name.includes('RUN-01') && dir.name.endsWith('-chrome')) await copyFile(join('artifacts/e2e-results', dir.name, 'video.webm'), 'artifacts/g0-training.webm');
}
const summary = {
  version: '0.1.0-G0', design: 'v1.3', date: '2026-10-26',
  unit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests },
  browser: { expected: report.stats.expected, unexpected: report.stats.unexpected, skipped: report.stats.skipped, cases },
  provenance: 'Real Chrome/Edge browser keyboard and mouse input against file:// release, offline browser contexts. No state injection. Human playtesting has not been performed.',
};
await writeFile('artifacts/verification-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ unit: summary.unit, browsers: cases.map(test => ({ name: test.name, browser: test.browser, status: test.status })), screenshots: [...wanted.values()] }, null, 2));
