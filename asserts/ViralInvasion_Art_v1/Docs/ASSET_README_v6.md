# Viral Invasion Art Pack v6

This package extends v5 with **batch07_actions_and_enemy_updates**.

## Added in v6
- 5 player pose assets: base / walk / attack / scan / dash
- 4 enemy candidate assets: basic / carapace / mimic / migratory

## Important usage notes
- Player assets in batch07 are **pose references / key art candidates**, not frame-perfect animation strips.
- Several images still touch the canvas edge and should receive extra transparent padding and anchor normalization before direct in-game animation use.
- These assets are suitable for prototype integration, gameplay mockups, and Codex-side animation setup.

## Recommendation
Use the original selected hero style from batch05 as the identity anchor, and use batch07 to begin structured action production.
