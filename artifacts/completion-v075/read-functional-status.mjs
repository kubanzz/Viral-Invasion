import { readFile } from 'node:fs/promises';

if (!process.argv[2]) throw Error('Provide a functional capture report.json path.');
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const brief = item => ({
  choice: item.choice, status: item.status,
  checkpoints: item.checkpoints?.map(point => point.name),
  captures: item.captures?.map(point => ({ name: point.name ?? point.kind, bracketValid: point.bracketValid })),
  failures: item.failures, errors: item.errors,
});
console.log(JSON.stringify({
  startedAt: report.startedAt, status: report.status, pass: report.pass,
  cases: report.cases?.map(brief), captures: brief(report).captures,
  missing: report.missing, failures: report.failures, errors: report.errors,
  browserClosed: report.browserClosed ?? null, finishedAt: report.finishedAt ?? null,
}, null, 2));
