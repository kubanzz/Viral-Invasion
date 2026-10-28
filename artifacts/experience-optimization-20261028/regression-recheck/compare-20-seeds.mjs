// Diagnostic replay only. Does not change production or the 1000-seed test.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const testPath = 'tests/unit/full-system-seeds.test.ts';
const raw = await readFile(testPath, 'utf8');
let source = raw.slice(0, raw.indexOf("describe('G4 complete-session seed coverage'"));
source = source.replace("import { describe, expect, it } from 'vitest';", "import { TRACTION_BALANCE } from '../../src/game/traction';\nimport { wallHit } from '../../src/actors/collision';");
source = source.replace('else game.step(legalInput(game.state, choice));', `else {
        const input = legalInput(game.state, choice);
        if (input.tool === 2 && input.fire) {
          const gap = distance(game.state.player, input.aim);
          const direction = normalized(input.aim.x - game.state.player.x, input.aim.y - game.state.player.y);
          const wall = wallHit(game.state.player, direction, gap, activeWorld(game.state));
          if (gap > TRACTION_BALANCE.range || (wall !== null && wall < gap - 1)) input.tool = 1;
          else if (game.state.tick % 12 !== 0) input.fire = false;
        }
        game.step(input);
      }`);
source = source.replace("events[event.type] = (events[event.type] ?? 0) + 1;", "events[event.type] = (events[event.type] ?? 0) + 1; if (event.type === 'TOOL_FIRED' && event.data.tool === 2) events.TOOL_FIRED_2 = (events.TOOL_FIRED_2 ?? 0) + 1;");
source += '\nexport { execute };\n';
const built = await build({stdin:{contents:source,resolveDir:'tests/unit',sourcefile:'diagnostic-full-seed.ts',loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {execute} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
const baseline = JSON.parse(await readFile('artifacts/unit-generated/full-system-seeds.json','utf8'));
const choices = ['pursue','block','ignore'], rows = [];
for (let seed=1; seed<=20; seed++) {
  const choice=choices[(seed-1)%3],mode=seed%2?'base':'protocols';
  const next=execute(seed,choice,mode).summary, prior=baseline.runs.find(row=>row.seed===seed);
  rows.push({seed,choice,mode,prior:{outcome:prior.outcome,reason:prior.reason,elapsed:prior.elapsed,sourceClears:prior.sourceClears},
    revised:{outcome:next.outcome,reason:next.reason,elapsed:next.elapsed,sourceClears:next.sourceClears,acceptedTool2:next.events.TOOL_FIRED_2??0}});
  console.log(JSON.stringify(rows.at(-1)));
}
const report={method:'Same seed, preparation, route and public inputs; only test-side tool 2 tap/release and range/LOS choice adapted. No gameplay writes.',testSha256:createHash('sha256').update(raw).digest('hex'),baselineSourceUnchanged:baseline.simulationSourceUnchanged,rows};
await writeFile('artifacts/experience-optimization-20261028/regression-recheck/full-system-20-driver-comparison.json',JSON.stringify(report,null,2));
