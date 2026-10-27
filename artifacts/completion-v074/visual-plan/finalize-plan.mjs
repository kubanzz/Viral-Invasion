import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = 'artifacts/completion-v074/visual-plan';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inventory = JSON.parse(readFileSync(base + '/inventory.json', 'utf8'));
const prepared = JSON.parse(readFileSync(base + '/prepared-tools.json', 'utf8'));
const sourceChecks = Object.entries({ ...prepared.liveInputs, ...prepared.drawingInputs }).map(([path, expected]) => ({ path, expected, actual: hash(path), matches: hash(path) === expected }));
const links = [...readFileSync(base + '/PLAN.md', 'utf8').matchAll(/\]\(([^)]+)\)/g)].map(match => base + '/' + match[1]);
const fileManifest = Object.fromEntries(readdirSync(base).filter(name => !['readiness.json'].includes(name) && statSync(base + '/' + name).isFile()).sort().map(name => [name, hash(base + '/' + name)]));
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), preparationPass: sourceChecks.every(item => item.matches),
  browserStarted: false, gameRunStarted: false, current074AcceptanceClaimed: false,
  expectedFinalVersion: '0.7.4', finalBundleSha256: null, waitForParentFinalBundle: true,
  requirements: inventory.requirements.map(row => ({ id: row.id, technicalClosurePossible: true, newFivePlayerEvidenceRequiredForThisTechnicalRow: false, status: 'evidence-plan-prepared-not-runtime-passed' })),
  inventory: { path: base + '/inventory.json', original073Images: inventory.images.length, requirements: inventory.requirements.length,
    initialUnchanged073SourceFiles: inventory.sourceComparison.filter(row => row.unchanged).length, decodedAttachments: inventory.decoded.length },
  compilation: { sourceChecks, livePrepared: true, drawingPrepared: true, syntaxChecks: 'Node --check passed for capture-live.mjs, run-derived.mjs, run-density.mjs and guards.mjs; compile only, no browser.' },
  planLocalLinks: links.map(path => ({ path, sha256: hash(path) })), fileManifest,
  boundaries: ['073 originals remain073.', 'Derived render-only samples are explicitly labeled and not a formal live run.', 'No change to src/tests/package/Docs/Design by this task.', 'VIS12/M14-02 and actual new-player timing, comprehension, replay and value remain human evidence.'],
};
writeFileSync(base + '/readiness.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ path: base + '/readiness.json', preparationPass: result.preparationPass, browserStarted: false, originalImages: inventory.images.length, requirements: result.requirements.length }));
