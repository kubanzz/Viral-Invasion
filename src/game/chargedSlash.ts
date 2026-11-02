export const CHARGED_SLASH_BALANCE = {
  threshold: .25, fullHold: 1.25, cooldown: 6, moveMultiplier: .7,
  minimumDamage: 45, fullDamage: 80, damagePerRank: 15,
  partialCount: 3, fullCount: 5,
} as const;

/** Charge time uses simulation seconds, so pause cannot accumulate power. */
export function chargedSlashProgress(startedAt: number, now: number): number {
  return Math.max(0, Math.min(1, (now - startedAt - CHARGED_SLASH_BALANCE.threshold)
    / (CHARGED_SLASH_BALANCE.fullHold - CHARGED_SLASH_BALANCE.threshold)));
}

export function chargedSlashProfile(startedAt: number, now: number, rank: number, multiplier: number) {
  const progress = chargedSlashProgress(startedAt, now);
  return { progress, count: progress >= 1 - 1e-8 ? CHARGED_SLASH_BALANCE.fullCount : CHARGED_SLASH_BALANCE.partialCount,
    damage: (CHARGED_SLASH_BALANCE.minimumDamage
      + (CHARGED_SLASH_BALANCE.fullDamage - CHARGED_SLASH_BALANCE.minimumDamage) * progress
      + rank * CHARGED_SLASH_BALANCE.damagePerRank) * multiplier };
}
