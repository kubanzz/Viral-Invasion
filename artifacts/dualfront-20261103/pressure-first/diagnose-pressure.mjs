import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = new URL('./', import.meta.url);
let source = await readFile(new URL('simulation.mjs', base), 'utf8');
const returnNeedle = '  return {\n    seed,\n    guards,\n    guardCount,';
if (source.split(returnNeedle).length !== 2) throw new Error('Unexpected simulation return shape');
source = source.replace(returnNeedle, `  return {
    finalState: { player: s.player, endless: { phase: s.endless.phase, remainingToSpawn: s.endless.remainingToSpawn, spawnSerial: s.endless.spawnSerial, pendingChildren: s.endless.pendingChildren, tasks: s.endless.territoryTasks },
      targets: s.targets.filter(t => t.hp > 0 || t.splitAt !== undefined), beacons: s.growth.beacons, cells: s.growth.cells },
    seed,
    guards,
    guardCount,`);
const sampleNeedle = '      population\n    });';
if (source.split(sampleNeedle).length !== 2) throw new Error('Unexpected simulation sample shape');
source = source.replace(sampleNeedle, '      population, actors: s2.targets.filter(t => t.hp > 0).map(t => ({id:t.id,x:t.x,y:t.y,hp:t.hp,task:t.territoryTask}))\n    });');
await writeFile(new URL('simulation-diagnostic.mjs', base), source);
const { measure } = await import(new URL('simulation-diagnostic.mjs', base));
const cases = [];
for (const seed of [71, 19, 12345]) {
  const result = measure(seed, true); cases.push(result);
  console.log(JSON.stringify({seed, elapsed:result.elapsed, finalState:result.finalState, lastSamples:result.samples.slice(-2)}));
}
await writeFile(new URL('pressure-diagnostic.json', base), JSON.stringify({scope:'Same production input policy and simulation bundle as pressure-first; instrumentation only adds final state and sampled actor positions.',cases}, null, 2));
