export type EndlessPacingRole = 'pressure' | 'release' | 'elite';

export interface EndlessPacing {
  /** One based, with pressure/release/pressure/release/elite in every cycle. */
  cycle: number;
  step: 1 | 2 | 3 | 4 | 5;
  label: string;
  role: EndlessPacingRole;
  /** Ordinary/support HP use the same announced curve, independent of a build. */
  healthMultiplier: number;
  /** Elite HP has its own slower-to-clear checkpoint; no invulnerability or HP floor. */
  eliteHealthMultiplier: number;
  speedMultiplier: number;
  spawnIntervalMultiplier: number;
  budgetBonus: number;
}

// This ceiling protects numeric representation at extreme serialized waves; it
// is not the old low-wave durability plateau. HP stays a finite safe integer.
const MAX_HEALTH_MULTIPLIER = Math.floor(Number.MAX_SAFE_INTEGER / 512);
const exponential = (base: number, exponent: number) =>
  Math.exp(Math.min(Math.log(MAX_HEALTH_MULTIPLIER), Math.log(base) * exponent));

/** Fixed wave-only schedule. Never inspect damage, equipment, HP or clear speed. */
export function endlessPacing(wave: number): EndlessPacing {
  const safeWave = Number.isSafeInteger(wave) && wave > 0 ? wave : 1;
  const cycle = Math.floor((safeWave - 1) / 5) + 1;
  const step = ((safeWave - 1) % 5 + 1) as EndlessPacing['step'];
  const stage = cycle - 1;
  const role: EndlessPacingRole = step === 5 ? 'elite' : step === 2 || step === 4 ? 'release' : 'pressure';
  const healthFactor = step === 2 ? .58 : step === 4 ? .68 : step === 3 ? 1.16 : step === 5 ? .82 : 1;
  const intervalFactor = role === 'release' ? .64 : role === 'elite' ? .96 : .86;
  return {
    cycle, step, role,
    label: role === 'release' ? '进化收割' : role === 'elite' ? '精英检验' : '压力推进',
    healthMultiplier: Math.min(MAX_HEALTH_MULTIPLIER, exponential(1.35, stage) * healthFactor),
    eliteHealthMultiplier: exponential(1.45, stage),
    // Pursuit remains slower than the base player; telegraph/recovery timings
    // are unchanged. Later challenge comes from health, damage and finite waves.
    speedMultiplier: (1 + 1.15 * (1 - 1 / (1 + stage * .18)) + (step - 1) * .015) * (role === 'release' ? .92 : 1),
    spawnIntervalMultiplier: Math.max(.32, intervalFactor / (1 + stage * .04)),
    budgetBonus: Math.min(20, stage * 2) + (role === 'release' ? 4 : role === 'elite' ? 2 : 0),
  };
}
