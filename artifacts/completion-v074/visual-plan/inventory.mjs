import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, relative } from 'node:path';
const destination = 'artifacts/completion-v074/visual-plan';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const files = directory => readdirSync(directory).sort().flatMap(name => {
  const path = directory + '/' + name;
  return statSync(path).isDirectory() ? files(path) : [path];
});
const ids = ['AC-M04-05', 'AC-M05-01', 'AC-M05-06', 'VIS-05', 'VIS-06', 'VIS-08', 'VIS-09', 'RUN-12'];
const prior = json('artifacts/completion-v073/requirements-closure.json');
const full = json('artifacts/completion-v073/browser/full-1/report.json');
const execution = json('artifacts/completion-v073/browser/full-1/execution.json');
const requirements = prior.items.filter(item => ids.includes(item.id)).map(item => ({
  id: item.id, source: item.originalRequirement, assessmentAtOldCutoff: item.initialAudit.assessment,
  actualMissingEvidenceAtOldCutoff: item.initialAudit.nextStep ?? item.initialAudit.originalRow?.nextEvidenceNeeded,
  requiresFiveHumansForTechnicalClause: false,
  humanBoundary: 'VIS-12 and M14-02 require new-player observations; this technical visual row must not remain open solely because humans are 0/5.',
}));
const pngs = files('artifacts/completion-v073/browser/full-1/output').filter(path => path.endsWith('.png') && /\/g[123]-|\/encounters-|\/encounter-rear-|feedback-v06/.test(path));
for (const path of files('artifacts/completion-v073/performance/attempt-1')) if (path.endsWith('.png')) pngs.push(path);
const images = pngs.map(path => { const bytes = readFileSync(path); return {
  path, sha256: hash(path), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
  kind: 'original-real-browser-PNG', version: '0.7.3', gameJsSha256: execution.bundleSha256,
  tags: [/evolution-(before|warning|after)/.test(path) && 'same-run-evolution', /g1-(warning|pulse)/.test(path) && 'G1-stage-fixture', /lung|retreated-heart/.test(path) && 'organ-scene', /dense-/.test(path) && 'density'].filter(Boolean),
}; });
const decoded = [];
function visit(suites) { for (const suite of suites ?? []) {
  for (const spec of suite.specs ?? []) if (/^G[123]|^Formal/.test(spec.title)) for (const test of spec.tests) {
    const result = test.results.at(-1);
    for (const [index, attachment] of (result?.attachments ?? []).entries()) if (attachment.body && attachment.contentType === 'application/json') {
      let value; try { value = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')); } catch { continue; }
      if (attachment.name === 'g2-evolution-frames') {
        const path = destination + '/decoded-g2-frames-' + test.projectName + '.json';
        writeFileSync(path, JSON.stringify({ source: 'artifacts/completion-v073/browser/full-1/report.json', spec: spec.title, project: test.projectName, attachmentIndex: index, attachmentName: attachment.name, status: result.status, value }, null, 2));
        decoded.push({ path, kind: 'decoded-verbatim-existing-report-attachment', sourceReportSha256: hash('artifacts/completion-v073/browser/full-1/report.json'), status: result.status,
          frames: Object.entries(value).map(([name, s]) => ({ name, tick: s.tick, elapsed: s.elapsed, phase: s.phase, organ: s.battle?.organId, traits: s.battle?.traits, warning: s.battle?.warning })) });
      }
    }
  }
  visit(suite.suites);
} }
visit(full.suites);
const sourcePaths = Object.keys(execution.sourceManifest).filter(path => path.startsWith('src/'));
const sourceComparison = sourcePaths.map(path => ({ path, frozen073: execution.sourceManifest[path], current: hash(path), unchanged: hash(path) === execution.sourceManifest[path] }));
const tools = ['scripts/capture-silhouettes.mjs', 'scripts/capture-g1-density.mjs', 'scripts/capture-g4-density-protocols.mjs', 'scripts/check-render-invariance.mjs', 'scripts/collect-stage-evidence.mjs'];
writeFileSync(destination + '/inventory.json', JSON.stringify({
  generatedAt: new Date().toISOString(), revisionAtInventory: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  method: 'Read-only original-document, source, PNG header/hash and saved report attachment inspection. No browser, build, simulation or gameplay started.',
  requirements, priorBundle: execution.bundleSha256, priorFullReportSha256: hash('artifacts/completion-v073/browser/full-1/report.json'),
  sourceComparison, images, decoded,
  captureTools: tools.map(path => ({ path, sha256: hash(path) })),
  sourceReuseRule: '073 raw remains 073. Reuse for 074 only at explicitly unchanged dependency scope after final 074 manifest is available; never relabel whole bundle or old images as 074.',
}, null, 2));
console.log(JSON.stringify({ output: destination + '/inventory.json', requirements: requirements.length, images: images.length, decoded: decoded.map(item => ({ path: item.path, frames: item.frames })), changedSourceCount: sourceComparison.filter(item => !item.unchanged).length }));
