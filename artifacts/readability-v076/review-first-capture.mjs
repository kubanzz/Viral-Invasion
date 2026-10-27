import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder = 'artifacts/readability-v076/mixed-scene/swarm-standard-attempt-1';
const raw = await readFile(`${folder}/report.json`), report = JSON.parse(raw);
const execution = JSON.parse(await readFile(`${folder}/execution.json`, 'utf8'));
if (!execution.complete || !execution.browserClosed) throw Error('Capture must finish and close before review.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceClears = report.events.filter(event => event.type === 'INFECTION_SOURCE_CLEARED');
const result = { schemaVersion: 1, reviewedAt: new Date().toISOString(), reportSha256: sha(raw),
  nativeFailurePngSha256: sha(await readFile(`${folder}/failure.png`)), nativeImageActuallyViewedByRoot: true,
  result: 'Failed real capture retained; no accepted representative mixed image.',
  browserClosed: execution.browserClosed, sourceAndBuildUnchanged: execution.sourceAndBuildUnchanged,
  final: { tick: report.final.tick, elapsed: report.final.elapsed, phase: report.final.phase, hp: report.final.player.hp, tissue: report.final.tissue.hp,
    firstCounter: report.final.battle.encounter.firstCounter, actualSourceClears: report.final.battle.stats.sourceClears,
    liveTargets: report.final.targets.filter(target => target.hp > 0).map(target => ({ id: target.id, role: target.role, hp: target.hp, traits: target.traits })) },
  sourceClears, errors: report.errors,
  findings: ['The host reused the normal clear-objective strategy during the first warning. Both original sources were actually cleared, violating its intended retained-producer plan.',
    'The care branch tried to recover player HP while the tissue was already full. Existing repaired(amount) returns before the proximity HP recovery when amount<=0; holding repair there does not restore the fighter.',
    'The unedited failure image shows only the surviving second elite near the player, with full tissue and low player HP. It is not representative density evidence.'],
  next: 'Use a separate v2 host and identity; preserve this host, identity and raw output. Keep the second producer alive through actual public input and kite committed attacks instead of relying on zero-delta repairs.',
  scope: 'Capture-host diagnosis. No production source change or gameplay-state correction is made, and the earlier passed current-source tests are not relabelled.' };
await writeFile('artifacts/readability-v076/mixed-scene/first-attempt-review.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ recorded: true, hp: result.final.hp, tissue: result.final.tissue, sourceClears: sourceClears.length, closed: execution.browserClosed }));
