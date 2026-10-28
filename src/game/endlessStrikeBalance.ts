/** Public challenge-only strike recipe. Campaign balance remains unchanged. */
export const ENDLESS_STRIKE_BALANCE = {
  playerBase: 10,
  tissueBase: 7,
  specialPlayerBase: 10,
  elitePlayerBonus: 8,
  corrosionTissueBase: 9,
  playerStepWaves: 4,
  tissueStepWaves: 8,
} as const;

/** Reads the announced wave only; never equipment, output, HP or clear speed. */
export function endlessStrikeDamage(wave: number): { player: number; elitePlayer: number; tissue: number; specialPlayer: number; eliteSpecialPlayer: number; corrosionTissue: number } {
  const safeWave = Number.isSafeInteger(wave) && wave > 0 ? wave : 1;
  const playerStep = Math.floor((safeWave - 1) / ENDLESS_STRIKE_BALANCE.playerStepWaves);
  const tissueStep = Math.floor((safeWave - 1) / ENDLESS_STRIKE_BALANCE.tissueStepWaves);
  return {
    player: ENDLESS_STRIKE_BALANCE.playerBase + playerStep,
    elitePlayer: ENDLESS_STRIKE_BALANCE.playerBase + playerStep + ENDLESS_STRIKE_BALANCE.elitePlayerBonus,
    tissue: ENDLESS_STRIKE_BALANCE.tissueBase + tissueStep,
    specialPlayer: ENDLESS_STRIKE_BALANCE.specialPlayerBase + playerStep,
    eliteSpecialPlayer: ENDLESS_STRIKE_BALANCE.specialPlayerBase + playerStep + ENDLESS_STRIKE_BALANCE.elitePlayerBonus,
    corrosionTissue: ENDLESS_STRIKE_BALANCE.corrosionTissueBase + tissueStep,
  };
}
