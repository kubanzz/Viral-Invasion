import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
const compiled = await build({ stdin: { contents: `export { GameSession } from './src/game/session'; export { g3Input } from './tests/helpers/g3Driver';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { GameSession, g3Input } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const session = new GameSession(91, { campaign: true, milestone: 'G3' }); session.start();
let calls = 0;
for (; calls < 12000 && session.state.battle.organId !== 'lung'; calls++) {
  if (session.state.phase === 'result') break;
  if (session.state.growth?.draft) session.discardDraft(session.state.growth.draft.id);
  else session.step(g3Input(session.state, 'pursue'));
}
const baseline = JSON.parse(await readFile('artifacts/visual-polish-20261029/before-build/build-meta.json', 'utf8'));
const { createHash } = await import('node:crypto');
const hash = path => readFile(path).then(value => createHash('sha256').update(value).digest('hex'));
const unchangedRules = baseline.sourceManifest['src/game/session.ts'] === await hash('src/game/session.ts');
const report = { scope: 'Bounded reproduction of the pre-existing G3 test helper; no production state injection. This is not a campaign acceptance run.', unchangedRules, calls, tick: session.state.tick, phase: session.state.phase, organ: session.state.battle.organId, result: session.state.result, whyExcluded: 'The original first test while condition checks organ and tick only. After an ended run, step no longer advances the tick and that loop can run forever. This visual work does not change that campaign driver or gameplay.' };
await writeFile('artifacts/visual-polish-20261029/legacy-driver-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
