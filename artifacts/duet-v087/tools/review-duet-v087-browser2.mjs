import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const out = 'artifacts/duet-v087/browser-attempt-2', results = [];
for (const project of ['chrome', 'edge']) {
  const files = [];
  const walk = dir => { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = `${dir}/${item.name}`; if (item.isDirectory()) walk(path); else if (item.name === 'natural-duet.json') files.push(path); } };
  walk(`${out}/${project}/output`);
  if (files.length !== 1) throw Error('Ambiguous browser raw');
  const raw = JSON.parse(readFileSync(files[0], 'utf8'));
  const commits = raw.events.filter(e => e.type === 'ELITE_TACTIC_COMMITTED' && e.data.actorId === raw.eliteId);
  const advances = raw.events.filter(e => e.type === 'ELITE_TACTIC_ADVANCED' && e.data.actorId === raw.eliteId);
  const warning = raw.observations.find(o => o.warning), scrolled = raw.observations.find(o => o.scrolledWarning);
  results.push({ project, source: files[0], complete: raw.complete, warningChecked: raw.warningChecked, eliteId: raw.eliteId,
    commits: commits.map(e => ({ tick: e.tick, ...e.data })), advances: advances.map(e => ({ tick: e.tick, ...e.data })),
    final: { phase: raw.final.phase, tick: raw.final.tick, elapsed: raw.final.elapsed, hp: raw.final.player.hp,
      tissueHp: raw.final.tissue.hp, result: raw.final.result }, warningLayout: warning?.layout, scrolled: scrolled?.scrolledWarning,
    errors: raw.errors, remote: raw.remote, gaps: raw.gaps,
    interpretation: raw.complete ? 'Two actual elite actions observed under disclosed hold-fire policy.'
      : 'Natural hold-fire observation ended in real tissue loss. Preserved as a failed coverage attempt, no replacement run or survival changes.' });
}
writeFileSync(`${out}/outcomes-review.json`, JSON.stringify({ scope: 'Read-only derivation; preserve both original outcomes, including failed Edge coverage.', results }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(results));
