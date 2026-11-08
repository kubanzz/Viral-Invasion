/** Presentation ownership only. These flags never change combat geometry or receipts. */
export interface CombatVfxOptions {
  /** Native particle/flipbook rendering owns transient accepted-hit decoration. */
  nativeVfx?: boolean;
  /** A separate pass has already painted fields and ground afterglow below actors. */
  groundEffectsDrawn?: boolean;
}
