import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), source = resolve(root, '.tools/tactics-v082-source');
const manifest = JSON.parse(readFileSync(resolve(source, 'baseline-manifest.json'), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const owned = ['src/game/types.ts', 'src/game/enemyTactics.ts', 'src/game/endless.ts', 'src/game/battle.ts', 'src/game/battleConfig.ts', 'src/game/enemyTacticInfo.ts', 'src/ui/endlessHud.ts',
  'src/game/enemyPositioning.ts', 'src/game/enemyFacing.ts', 'tests/unit/endless-formations.test.ts', 'tests/unit/support-spawn-reachability.test.ts',
  'tests/unit/enemy-facing.test.ts', 'tests/unit/standoff-positioning.test.ts', 'tests/unit/standoff-combat.integration.test.ts', 'tests/unit/standoff-spawn-reachability.test.ts'];
const rows = owned.map(file => {
  const baseline = manifest.files.find(row => row.path === file), primary = resolve(root, file), candidate = resolve(source, file);
  if (baseline ? !existsSync(primary) || sha(readFileSync(primary)) !== baseline.sha256 : existsSync(primary)) throw new Error(`Primary changed since isolation: ${file}`);
  return { file, before: baseline?.sha256 ?? null, after: sha(readFileSync(candidate)) };
});
const evidence = resolve(root, 'artifacts/tactics-v082/integration'); mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'primary-inputs.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2), { flag: 'wx' });
for (const file of owned) cpSync(resolve(source, file), resolve(root, file));
console.log(JSON.stringify({ integrated: owned.length, evidence }));
