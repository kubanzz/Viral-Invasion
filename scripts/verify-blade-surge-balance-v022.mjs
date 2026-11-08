import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), out = path.join(root, 'artifacts/blade-surge-v022/balance');
fs.mkdirSync(out, { recursive: true });
const files = ['src/game/bladeTechniques.ts', 'src/game/weaponSkillsTypes.ts', 'src/game/weaponUltimates.ts', 'src/game/weaponMelee.ts', 'src/game/weaponSkills.ts',
  'tests/unit/blade-techniques.test.ts', 'tests/unit/weapon-ultimates.test.ts'];
const hashes = () => Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const before = hashes();
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/unit/blade-techniques.test.ts',
  'tests/unit/weapon-ultimates.test.ts', 'tests/unit/heart-expedition-boss.test.ts', 'tests/unit/construction-trace-hud.test.ts'],
{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const log = result.stdout + result.stderr;
fs.writeFileSync(path.join(out, 'tests.log'), log);
const line = log.match(/WEAPON_BALANCE_REPORT (\{[^\r\n]+\})/);
if (!line) throw new Error('No authoritative damage measurement was emitted.');
const measurements = JSON.parse(line[1]), after = hashes();
const purple = Math.max(measurements.singleWithOneStoredUltimate.steady.damage, measurements.singleWithOneStoredUltimate.piercing.damage);
const report = { measuredAt: new Date().toISOString(), exitCode: result.status,
  sourceStable: JSON.stringify(before) === JSON.stringify(after), hashes: after,
  contract: { drawing: 3, windup: .65, executionMinimum: .72, executionMaximum: 1.2, recovery: .3,
    corridorRadius: { automatic: 88, manual: 110 }, impactRadius: { automatic: 130, manual: 160 },
    damageFactors: { collateralOncePerCast: 12, elitePerMark: 18, bossPerMark: 10, manualBonus: 1.35 },
    boss: 'Unified GameSession.damage clamps the active bar and rejects root/cast continuations after a break.',
    comparison: 'Only redblade with one stored ultimate raises the prior 1.45 ceiling to 1.55; ordinary rotation and all other weapons keep previous ceilings.' },
  redbladeStoredUltimateRatioToBestPurple: measurements.singleWithOneStoredUltimate.redblade.damage / purple,
  measurements };
const unitPath = path.join(root, 'artifacts/unit-generated/unit-results.json');
if (fs.existsSync(unitPath)) {
  fs.copyFileSync(unitPath, path.join(out, 'unit-results.json'));
  const unit = JSON.parse(fs.readFileSync(unitPath, 'utf8'));
  report.tests = { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests };
}
report.pass = result.status === 0 && report.sourceStable;
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, sourceStable: report.sourceStable, tests: report.tests,
  storedUltimateRatio: report.redbladeStoredUltimateRatioToBestPurple, out }));
process.exitCode = report.pass ? 0 : 1;
